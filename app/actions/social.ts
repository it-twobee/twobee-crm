'use server'

import { revalidatePath } from 'next/cache'
import { getSessionProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createActorClient } from '@/lib/supabase/admin'
import { canGovernProjects } from '@/lib/permissions'
import { loadSocialBoard } from '@/lib/social-server'
import { removeSocialObjects } from '@/lib/social-media'
import {
  dirittiSocial, isCanale, isStato, parseContenuto, puoPassareA, servonoLink, validaLinkPost,
  type Canale, type StatoSocial,
} from '@/lib/social'
import type { SocialBoardData } from '@/lib/social-types'

/* §467 — Le azioni del calendario social. Ogni `export` è un endpoint (§329):
   la guardia legge la sessione e guarda il ruolo, la riga si legge con la RLS,
   e solo dopo si scrive col client dell'attore — `social_contents` ha la
   cronologia, e una modifica senza nome sopra risulta «Sistema».
   Si restituisce `{ ok, error }` e non si lancia: in produzione il messaggio di
   un'eccezione arriva mascherato, e «riprova» non dice cosa non va (§420). */

type Esito<T = null> = { ok: true; data: T } | { ok: false; error: string }

async function requireSocialStaff() {
  const profile = await getSessionProfile()
  if (!profile || profile.is_active === false) return null
  if (profile.role !== 'admin' && profile.role !== 'team') return null
  return {
    uid: profile.id, admin: profile.role === 'admin',
    governa: canGovernProjects(profile), lettore: profile.app_role === 'viewer',
  }
}

type Contenuto = {
  id: string; client_id: string; project_id: string; owner_id: string | null; created_by: string | null
  status: string; format: string; channels: string[]; updated_at: string
}

type Staff = NonNullable<Awaited<ReturnType<typeof requireSocialStaff>>>

/** La riga con la RLS e il diritto di modificarla, o il motivo per cui no. */
async function contenutoModificabile(me: Staff | null, id: string): Promise<Esito<{ me: Staff; c: Contenuto }>> {
  if (!me) return { ok: false, error: 'Non autorizzato.' }
  if (me.lettore) return { ok: false, error: 'Il tuo accesso è in sola lettura.' }
  const db = await createClient()
  const r = await db.from('social_contents')
    .select('id, client_id, project_id, owner_id, created_by, status, format, channels, updated_at').eq('id', id).maybeSingle()
  if (r.error) return { ok: false, error: 'Non è stato possibile leggere il contenuto. Riprova.' }
  if (!r.data) return { ok: false, error: 'Contenuto non trovato.' }
  const c = r.data as Contenuto
  if (!dirittiSocial({ governa: me.governa, userId: me.uid, contenuto: c }).modifica) {
    return { ok: false, error: 'Lo modifica chi governa i progetti o chi ha il contenuto in carico.' }
  }
  return { ok: true, data: { me, c } }
}

function aggiorna(clientId: string) {
  revalidatePath('/social')
  revalidatePath('/workspace/social')
  revalidatePath(`/clienti/${clientId}`)
  revalidatePath(`/workspace/clienti/${clientId}`)
}

/** Il responsabile è «uno di noi», attivo: mai un account del portale (§409). */
async function responsabileValido(ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null
  const db = await createClient()
  const p = await db.from('profiles').select('role, is_active').eq('id', ownerId).maybeSingle()
  if (p.error) return 'Non è stato possibile verificare il responsabile.'
  if (!p.data || p.data.is_active === false || (p.data.role !== 'admin' && p.data.role !== 'team')) {
    return 'Il responsabile deve essere una persona del team.'
  }
  return null
}

/** Il calendario di un mese, per la tab del cliente: stessa lettura della pagina. */
export async function getSocialBoard(input: { mese: string; clientId?: string | null }): Promise<Esito<SocialBoardData>> {
  const me = await requireSocialStaff()
  if (!me) return { ok: false, error: 'Non autorizzato.' }
  const db = await createClient()
  const data = await loadSocialBoard(db, {
    userId: me.uid, mese: input.mese, clientId: input.clientId ?? null,
    // l'admin legge l'anagrafica piena, il workspace la vista senza economics (§211)
    clientsTable: me.admin ? 'clients' : 'clients_workspace',
  })
  return { ok: true, data }
}

export async function createSocialContent(input: { project_id: string } & Record<string, unknown>): Promise<Esito<{ id: string }>> {
  const me = await requireSocialStaff()
  if (!me) return { ok: false, error: 'Non autorizzato.' }
  if (!me.governa) return { ok: false, error: 'I contenuti li crea chi governa i progetti: admin e manager.' }
  const parsed = parseContenuto(input)
  if (!parsed.ok) return parsed
  const db = await createClient()
  // il progetto passa dalla RLS: un progetto che non vedi non esiste
  const p = await db.from('projects').select('id, client_id, service_type, deleted_at').eq('id', input.project_id).maybeSingle()
  if (p.error) return { ok: false, error: 'Non è stato possibile leggere il progetto. Riprova.' }
  if (!p.data || p.data.deleted_at || p.data.service_type !== 'social_media_management' || !p.data.client_id) {
    return { ok: false, error: 'Il progetto non è un progetto social attivo.' }
  }
  const owner = await responsabileValido(parsed.value.owner_id)
  if (owner) return { ok: false, error: owner }

  const r = await createActorClient(me.uid).from('social_contents').insert({
    ...parsed.value, client_id: p.data.client_id, project_id: p.data.id, created_by: me.uid,
  }).select('id').single()
  if (r.error || !r.data) return { ok: false, error: dbErrore(r.error, 'Non è stato possibile creare il contenuto. Riprova.') }
  aggiorna(p.data.client_id)
  return { ok: true, data: { id: r.data.id } }
}

/**
 * Salva testo, data, canali, formato, responsabile e milestone. `expected` è
 * l'`updated_at` letto quando si è aperto il contenuto: se nel frattempo
 * l'ha cambiato qualcun altro, non si scrive sopra il suo lavoro.
 */
export async function updateSocialContent(id: string, input: Record<string, unknown>, expected: string): Promise<Esito> {
  const gate = await contenutoModificabile(await requireSocialStaff(), id)
  if (!gate.ok) return gate
  const { me, c } = gate.data
  const parsed = parseContenuto(input)
  if (!parsed.ok) return parsed
  if (parsed.value.owner_id !== c.owner_id) {
    const owner = await responsabileValido(parsed.value.owner_id)
    if (owner) return { ok: false, error: owner }
  }
  // un contenuto già uscito non cambia canali senza i link dei nuovi
  if (c.status === 'pubblicato') {
    const links = await linkDi(id)
    const motivo = puoPassareA({ format: parsed.value.format, channels: parsed.value.channels, links }, 'pubblicato')
    if (motivo) return { ok: false, error: motivo }
  }
  const r = await createActorClient(me.uid).from('social_contents').update(parsed.value)
    .eq('id', id).eq('updated_at', expected).select('id')
  if (r.error) return { ok: false, error: dbErrore(r.error, 'Non è stato possibile salvare. Riprova.') }
  if (!r.data?.length) return { ok: false, error: 'Nel frattempo l’ha modificato qualcun altro: riapri il contenuto per vedere la versione nuova.' }
  aggiorna(c.client_id)
  return { ok: true, data: null }
}

export async function setSocialStatus(id: string, status: string): Promise<Esito> {
  if (!isStato(status)) return { ok: false, error: 'Stato non valido.' }
  const gate = await contenutoModificabile(await requireSocialStaff(), id)
  if (!gate.ok) return gate
  const { me, c } = gate.data
  const motivo = puoPassareA({ format: c.format, channels: c.channels, links: await linkDi(id) }, status as StatoSocial)
  if (motivo) return { ok: false, error: motivo }
  const r = await createActorClient(me.uid).from('social_contents').update({ status }).eq('id', id)
  if (r.error) return { ok: false, error: dbErrore(r.error, 'Non è stato possibile cambiare lo stato. Riprova.') }
  aggiorna(c.client_id)
  return { ok: true, data: null }
}

/**
 * «È uscito»: i link dei post, uno per canale, poi lo stato. In quest'ordine,
 * perché il database rifiuta un «pubblicato» senza link (`social_guard_content`).
 */
export async function markSocialPublished(id: string, links: Record<string, string>): Promise<Esito> {
  const gate = await contenutoModificabile(await requireSocialStaff(), id)
  if (!gate.ok) return gate
  const { me, c } = gate.data
  const canali = c.channels.filter(isCanale) as Canale[]
  const righe: { content_id: string; channel: Canale; url: string; created_by: string }[] = []
  for (const ch of canali) {
    const url = (links?.[ch] ?? '').trim()
    if (!url && !servonoLink(c.format)) continue
    const errore = validaLinkPost(ch, url)
    if (errore) return { ok: false, error: errore }
    righe.push({ content_id: id, channel: ch, url, created_by: me.uid })
  }
  const actor = createActorClient(me.uid)
  if (righe.length) {
    const up = await actor.from('social_content_links').upsert(righe, { onConflict: 'content_id,channel' })
    if (up.error) return { ok: false, error: dbErrore(up.error, 'Non è stato possibile salvare i link. Riprova.') }
  }
  const r = await actor.from('social_contents').update({ status: 'pubblicato' }).eq('id', id)
  if (r.error) return { ok: false, error: dbErrore(r.error, 'Non è stato possibile segnarlo pubblicato. Riprova.') }
  aggiorna(c.client_id)
  return { ok: true, data: null }
}

/** Elimina il contenuto, poi i byte delle creatività. Se qualcosa resta su MinIO lo dice. */
export async function deleteSocialContent(id: string): Promise<Esito<{ orfani: number }>> {
  const me = await requireSocialStaff()
  if (!me) return { ok: false, error: 'Non autorizzato.' }
  if (!me.governa) return { ok: false, error: 'Un contenuto lo elimina chi governa i progetti: admin e manager.' }
  const db = await createClient()
  const c = await db.from('social_contents').select('id, client_id').eq('id', id).maybeSingle()
  if (c.error) return { ok: false, error: 'Non è stato possibile leggere il contenuto. Riprova.' }
  if (!c.data) return { ok: false, error: 'Contenuto non trovato.' }
  const actor = createActorClient(me.uid)
  // le chiavi degli oggetti le legge il service role, dopo la guardia
  const media = await actor.from('social_content_media').select('id, storage_key, file_id').eq('content_id', id)
  if (media.error) return { ok: false, error: 'Non è stato possibile leggere le creatività. Riprova.' }
  const gone = await actor.from('social_contents').delete().eq('id', id)
  if (gone.error) return { ok: false, error: dbErrore(gone.error, 'Non è stato possibile eliminare il contenuto. Riprova.') }
  const orfani = await removeSocialObjects(actor, media.data ?? [])
  aggiorna(c.data.client_id)
  return { ok: true, data: { orfani } }
}

/** Il nuovo ordine delle creatività: l'elenco completo, nell'ordine voluto. */
export async function reorderSocialMedia(contentId: string, ids: string[]): Promise<Esito> {
  const gate = await contenutoModificabile(await requireSocialStaff(), contentId)
  if (!gate.ok) return gate
  const { me, c } = gate.data
  const actor = createActorClient(me.uid)
  const attuali = await actor.from('social_content_media').select('id').eq('content_id', contentId)
  if (attuali.error) return { ok: false, error: 'Non è stato possibile leggere le creatività. Riprova.' }
  const presenti = new Set((attuali.data ?? []).map(m => m.id as string))
  if (ids.length !== presenti.size || !ids.every(i => presenti.has(i))) {
    return { ok: false, error: 'Le creatività sono cambiate: ricarica e riprova.' }
  }
  for (let i = 0; i < ids.length; i++) {
    const r = await actor.from('social_content_media').update({ sort_order: i }).eq('id', ids[i]).eq('content_id', contentId)
    if (r.error) return { ok: false, error: 'Non è stato possibile salvare l’ordine. Riprova.' }
  }
  aggiorna(c.client_id)
  return { ok: true, data: null }
}

async function linkDi(id: string): Promise<string[]> {
  const db = await createClient()
  const r = await db.from('social_content_links').select('channel').eq('content_id', id)
  return (r.data ?? []).map(l => l.channel as string)
}

/** Il messaggio delle guardie del database arriva com'è: è già in italiano e dice cosa non va. */
function dbErrore(error: { code?: string; message?: string } | null, fallback: string): string {
  if (error?.code === '22023' && error.message) return error.message
  if (error?.code === '42P01') return 'Manca la migration del social: la sezione non è ancora attiva.'
  return fallback
}
