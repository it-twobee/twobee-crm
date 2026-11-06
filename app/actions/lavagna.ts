'use server'

import { revalidatePath } from 'next/cache'
import { deleteObject } from '@/lib/storage/s3'
import { erroreLavagna, leggiStato, recenti, requireLavagna, TETTO_RECENTI } from '@/lib/lavagna-server'
import {
  costruisciStato, isColore, isEmoji, isUuid, LIMITI, normalizzaUrl, posizioneValida, pulisciTesto, rotazioneCasuale,
  type ElementoLavagna, type Emoji, type RigaElemento, type RigaMedia, type StatoLavagna,
} from '@/lib/lavagna'

/* §499 — La lavagna del team. Ogni azione passa da `requireLavagna`
   (ruolo, poi firma) e scrive col service role: le tabelle sono deny-all.
   Le righe si toccano sempre con `.eq('autore', firma)`: «solo chi l'ha
   attaccata la stacca» sta nella query, non in un `if` che si può dimenticare.
   Quello che torna al browser passa da `costruisciStato`, che la firma la
   lascia qui. */

type Esito<T> = { ok: true; data: T } | { ok: false; error: string }

const NON_TUO = 'Puoi spostare e staccare solo quello che hai attaccato tu'
const CALMA = 'Calma! Hai attaccato parecchio in poco tempo: riprova fra qualche minuto'
const COLONNE = 'id, tipo, media_id, testo, url, colore, x, y, rotazione, scala, z, autore, created_at'

function aggiorna() {
  revalidatePath('/lavagna')
  revalidatePath('/workspace/lavagna')
}

type Db = Extract<Awaited<ReturnType<typeof requireLavagna>>, { ok: true }>['db']

async function zInCima(db: Db): Promise<number> {
  const { data } = await db.from('lavagna_elementi').select('z').order('z', { ascending: false }).limit(1).maybeSingle()
  return Number((data as { z: number } | null)?.z ?? 0) + 1
}

async function comeElemento(db: Db, riga: RigaElemento, firma: string): Promise<ElementoLavagna | null> {
  let media: RigaMedia[] = []
  if (riga.media_id) {
    const { data } = await db.from('lavagna_media').select('id, tipo, nome, larghezza, altezza, autore, created_at').eq('id', riga.media_id).maybeSingle()
    if (data) media = [data as RigaMedia]
  }
  return costruisciStato({ elementi: [riga], media, reazioni: [], usi: new Map() }, firma).elementi[0] ?? null
}

export async function leggiLavagna(): Promise<Esito<StatoLavagna>> {
  const porta = await requireLavagna(false)
  if (!porta.ok) return { ok: false, error: porta.error }
  const letto = await leggiStato(porta.db, porta.firma)
  return letto.ok ? { ok: true, data: letto.stato } : letto
}

async function attacca(
  riga: { tipo: RigaElemento['tipo']; testo?: string; url?: string | null; colore?: string; media_id?: string | null },
  dove: { x?: unknown; y?: unknown },
): Promise<Esito<ElementoLavagna>> {
  const porta = await requireLavagna(true)
  if (!porta.ok) return { ok: false, error: porta.error }
  const { db, firma } = porta
  if (await recenti(db, 'lavagna_elementi', firma) >= TETTO_RECENTI.elementi) return { ok: false, error: CALMA }
  const pos = posizioneValida({ ...dove, rotazione: rotazioneCasuale(), scala: 1 })
  const { data, error } = await db.from('lavagna_elementi').insert({
    tipo: riga.tipo,
    testo: riga.testo ?? '',
    url: riga.url ?? null,
    colore: riga.colore ?? 'giallo',
    media_id: riga.media_id ?? null,
    ...pos,
    z: await zInCima(db),
    autore: firma,
  }).select(COLONNE).single()
  if (error || !data) return { ok: false, error: erroreLavagna(error) }
  aggiorna()
  const el = await comeElemento(db, data as RigaElemento, firma)
  return el ? { ok: true, data: el } : { ok: false, error: 'Attaccato, ma non riesco a rileggerlo: ricarica la pagina' }
}

export async function scriviNota(input: { testo: unknown; colore: unknown; x: unknown; y: unknown }): Promise<Esito<ElementoLavagna>> {
  const testo = pulisciTesto(input?.testo, LIMITI.testo)
  if (!testo) return { ok: false, error: 'Il post-it è vuoto' }
  return attacca({ tipo: 'nota', testo, colore: isColore(input.colore) ? input.colore : 'giallo' }, input)
}

export async function attaccaLink(input: { url: unknown; testo: unknown; x: unknown; y: unknown }): Promise<Esito<ElementoLavagna>> {
  const url = normalizzaUrl(input?.url)
  if (!url) return { ok: false, error: 'Questo non sembra un link (serve http o https)' }
  return attacca({ tipo: 'link', url, testo: pulisciTesto(input.testo, LIMITI.testo) }, input)
}

export async function attaccaMedia(input: { mediaId: unknown; x: unknown; y: unknown }): Promise<Esito<ElementoLavagna>> {
  if (!isUuid(input?.mediaId)) return { ok: false, error: 'Sticker o foto non validi' }
  const porta = await requireLavagna(true)
  if (!porta.ok) return { ok: false, error: porta.error }
  const { data, error } = await porta.db.from('lavagna_media').select('id, tipo').eq('id', input.mediaId).maybeSingle()
  if (error) return { ok: false, error: erroreLavagna(error) }
  if (!data) return { ok: false, error: 'Non c\'è più: chi l\'ha caricato l\'ha ritirato' }
  const tipo = (data as { tipo: string }).tipo === 'sticker' ? 'sticker' : 'foto'
  return attacca({ tipo, media_id: input.mediaId }, input)
}

export async function aggiornaElemento(
  id: unknown,
  patch: { x?: unknown; y?: unknown; rotazione?: unknown; scala?: unknown; sopra?: unknown; testo?: unknown; colore?: unknown },
): Promise<Esito<ElementoLavagna>> {
  if (!isUuid(id)) return { ok: false, error: 'Elemento non valido' }
  const porta = await requireLavagna(true)
  if (!porta.ok) return { ok: false, error: porta.error }
  const { db, firma } = porta
  const { data: prima, error } = await db.from('lavagna_elementi').select(COLONNE).eq('id', id).eq('autore', firma).maybeSingle()
  if (error) return { ok: false, error: erroreLavagna(error) }
  if (!prima) return { ok: false, error: NON_TUO }
  const riga = prima as RigaElemento

  const cambi: Record<string, unknown> = { ...posizioneValida(patch ?? {}, posizioneValida(riga)), updated_at: new Date().toISOString() }
  if (patch?.sopra === true) cambi.z = await zInCima(db)
  if (patch?.testo !== undefined) {
    const testo = pulisciTesto(patch.testo, LIMITI.testo)
    if (riga.tipo === 'nota' && !testo) return { ok: false, error: 'Il post-it è vuoto: se non serve più, staccalo' }
    cambi.testo = testo
  }
  if (patch?.colore !== undefined && riga.tipo === 'nota' && isColore(patch.colore)) cambi.colore = patch.colore

  const { data, error: e2 } = await db.from('lavagna_elementi').update(cambi).eq('id', id).eq('autore', firma).select(COLONNE).maybeSingle()
  if (e2) return { ok: false, error: erroreLavagna(e2) }
  if (!data) return { ok: false, error: NON_TUO }
  aggiorna()
  const el = await comeElemento(db, data as RigaElemento, firma)
  return el ? { ok: true, data: el } : { ok: false, error: 'Non riesco a rileggerlo: ricarica la pagina' }
}

export async function staccaElemento(id: unknown): Promise<Esito<null>> {
  if (!isUuid(id)) return { ok: false, error: 'Elemento non valido' }
  const porta = await requireLavagna(true)
  if (!porta.ok) return { ok: false, error: porta.error }
  const { data, error } = await porta.db.from('lavagna_elementi').delete().eq('id', id).eq('autore', porta.firma).select('id')
  if (error) return { ok: false, error: erroreLavagna(error) }
  if (!data?.length) return { ok: false, error: NON_TUO }
  aggiorna()
  return { ok: true, data: null }
}

/** Una reazione per emoji a testa: la seconda volta la toglie. */
export async function reagisci(id: unknown, emoji: unknown): Promise<Esito<{ reazioni: Partial<Record<Emoji, number>>; mie: Emoji[] }>> {
  if (!isUuid(id) || !isEmoji(emoji)) return { ok: false, error: 'Reazione non valida' }
  const porta = await requireLavagna(true)
  if (!porta.ok) return { ok: false, error: porta.error }
  const { db, firma } = porta
  const tolta = await db.from('lavagna_reazioni').delete().eq('elemento_id', id).eq('autore', firma).eq('emoji', emoji).select('emoji')
  if (tolta.error) return { ok: false, error: erroreLavagna(tolta.error) }
  if (!tolta.data?.length) {
    const messa = await db.from('lavagna_reazioni').insert({ elemento_id: id, emoji, autore: firma })
    // 23503: l'elemento è stato staccato nel frattempo
    if (messa.error) return { ok: false, error: messa.error.code === '23503' ? 'Non c\'è più' : erroreLavagna(messa.error) }
  }
  const { data, error } = await db.from('lavagna_reazioni').select('emoji, autore').eq('elemento_id', id)
  if (error) return { ok: false, error: erroreLavagna(error) }
  const reazioni: Partial<Record<Emoji, number>> = {}
  const mie: Emoji[] = []
  for (const r of (data ?? []) as { emoji: string; autore: string }[]) {
    if (!isEmoji(r.emoji)) continue
    reazioni[r.emoji] = (reazioni[r.emoji] ?? 0) + 1
    if (r.autore === firma) mie.push(r.emoji)
  }
  return { ok: true, data: { reazioni, mie } }
}

/**
 * Chi ha caricato uno sticker o una foto lo può ritirare: sparisce dalla
 * galleria e da ogni punto della lavagna dove l'hanno attaccato (cascade).
 * Prima la riga, poi i byte: se lo storage non risponde resta un file orfano,
 * non un riquadro rotto.
 */
export async function ritiraMedia(id: unknown): Promise<Esito<null>> {
  if (!isUuid(id)) return { ok: false, error: 'File non valido' }
  const porta = await requireLavagna(true)
  if (!porta.ok) return { ok: false, error: porta.error }
  const { data, error } = await porta.db.from('lavagna_media').delete().eq('id', id).eq('autore', porta.firma)
    .select('chiave_oggetto, chiave_mini')
  if (error) return { ok: false, error: erroreLavagna(error) }
  const riga = (data ?? [])[0] as { chiave_oggetto: string; chiave_mini: string | null } | undefined
  if (!riga) return { ok: false, error: 'Puoi ritirare solo quello che hai caricato tu' }
  await Promise.all([riga.chiave_oggetto, riga.chiave_mini].filter((k): k is string => !!k)
    .map(k => deleteObject(k).catch(() => console.warn('[lavagna] oggetto rimasto nello storage', k))))
  aggiorna()
  return { ok: true, data: null }
}
