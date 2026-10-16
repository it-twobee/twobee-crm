'use server'

import { revalidatePath } from 'next/cache'
import { getSessionProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { leggiCsvSfida, meseCorrente } from '@/lib/linkedin'

export type EsitoCaricamento =
  | { ok: false; error: string }
  | { ok: true; aggiornati: number; fuoriMese: number; altrui: number; scartate: string[]; mese: string }

/** La sfida è dello staff: il portale cliente non carica e non legge. */
async function requireMembroSfida() {
  const profile = await getSessionProfile()
  if (!profile) throw new Error('Non autenticato')
  if (profile.role !== 'admin' && profile.role !== 'team') throw new Error('La sfida LinkedIn è dello staff TwoBee')
  return profile
}

/**
 * §477 — Il CSV dell'estensione entra a nome di chi è loggato: `profile_id`
 * non arriva dal file. Service role perché dal browser non si scrive (nessuna
 * policy di scrittura); il ruolo l'ha già chiesto `requireMembroSfida`.
 */
export async function caricaCsvLinkedin(testo: string): Promise<EsitoCaricamento> {
  const me = await requireMembroSfida()
  if (typeof testo !== 'string') return { ok: false, error: 'File non valido' }
  const ora = new Date()
  const letto = leggiCsvSfida(testo, ora)
  if (!letto.ok) return { ok: false, error: letto.errore }
  const mese = meseCorrente(ora)
  const base = { fuoriMese: letto.fuoriMese, scartate: letto.scartate, mese }
  if (letto.righe.length === 0) return { ok: true, aggiornati: 0, altrui: 0, ...base }

  const db = createAdminClient()
  const { data: esistenti, error } = await db.from('linkedin_posts')
    .select('post_urn, profile_id').in('post_urn', letto.righe.map(r => r.post_urn))
  if (error) {
    return { ok: false, error: /linkedin_posts/.test(error.message) && /exist|find/.test(error.message)
      ? 'Manca la migration della sfida LinkedIn' : error.message }
  }
  const altrui = new Set(((esistenti ?? []) as { post_urn: string; profile_id: string }[])
    .filter(e => e.profile_id !== me.id).map(e => e.post_urn))
  const adesso = new Date().toISOString()
  const daScrivere = letto.righe.filter(r => !altrui.has(r.post_urn))
    .map(r => ({ ...r, profile_id: me.id, updated_at: adesso }))

  if (daScrivere.length) {
    const { error: e2 } = await db.from('linkedin_posts').upsert(daScrivere, { onConflict: 'post_urn' })
    if (e2) return { ok: false, error: e2.message }
  }
  revalidatePath('/linkedin')
  revalidatePath('/workspace/linkedin')
  return { ok: true, aggiornati: daScrivere.length, altrui: altrui.size, ...base }
}
