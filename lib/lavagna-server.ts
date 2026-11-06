import 'server-only'
import { createHmac } from 'crypto'
import { getSessionProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  canSeeLavagna, canWriteLavagna, costruisciStato, LIMITI,
  type RigaElemento, type RigaMedia, type RigaReazione, type StatoLavagna,
} from '@/lib/lavagna'

/* La porta della lavagna, per le azioni e per le rotte dei file. Non è un file
   `'use server'` di proposito: una guard non deve diventare un endpoint.
   Service role (le tabelle sono deny-all) **dopo** il controllo di ruolo, e
   `createAdminClient`, non `createActorClient`: l'attore nell'intestazione
   è esattamente quello che qui non deve viaggiare. */

type Db = ReturnType<typeof createAdminClient>

export type Porta =
  | { ok: true; firma: string; db: Db }
  | { ok: false; status: number; error: string }

const MANCA = 'Manca la migration della lavagna'

export function erroreLavagna(e: { message?: string; code?: string } | null | undefined): string {
  const m = e?.message ?? ''
  if (e?.code === '42P01' || e?.code === 'PGRST205' || (/lavagna_/.test(m) && /exist|find|schema cache/i.test(m))) return MANCA
  return m || 'Errore del database'
}

let chiave: string | null = null

/**
 * La firma di una persona: HMAC dell'id con la chiave del database. È quello
 * che sta nella colonna `autore` al posto dell'id, e non esce mai dal server.
 */
export async function firmaDi(userId: string, db: Db): Promise<string> {
  if (!chiave) {
    const { data, error } = await db.from('lavagna_chiave').select('chiave').maybeSingle()
    if (error) throw new Error(erroreLavagna(error))
    if (!data?.chiave) throw new Error(MANCA)
    chiave = data.chiave as string
  }
  return createHmac('sha256', chiave).update(userId).digest('hex')
}

/** Ruolo, poi firma. `scrittura` chiude fuori anche chi ha l'account in sola lettura. */
export async function requireLavagna(scrittura: boolean): Promise<Porta> {
  const profilo = await getSessionProfile()
  if (!profilo) return { ok: false, status: 401, error: 'Non autenticato' }
  if (!canSeeLavagna(profilo)) return { ok: false, status: 403, error: 'La lavagna è del team TwoBee' }
  if (scrittura && !canWriteLavagna(profilo)) return { ok: false, status: 403, error: 'Il tuo account è in sola lettura' }
  const db = createAdminClient()
  try {
    return { ok: true, firma: await firmaDi(profilo.id, db), db }
  } catch (e) {
    return { ok: false, status: 503, error: e instanceof Error ? e.message : MANCA }
  }
}

const COLONNE_ELEMENTO = 'id, tipo, media_id, testo, url, colore, x, y, rotazione, scala, z, autore, created_at'
const COLONNE_MEDIA = 'id, tipo, nome, larghezza, altezza, autore, created_at'

export async function leggiStato(db: Db, firma: string): Promise<{ ok: true; stato: StatoLavagna } | { ok: false; error: string }> {
  const [el, media, reazioni, usi] = await Promise.all([
    db.from('lavagna_elementi').select(COLONNE_ELEMENTO).order('z', { ascending: false }).limit(LIMITI.elementi),
    db.from('lavagna_media').select(COLONNE_MEDIA).order('created_at', { ascending: false }).limit(2000),
    db.from('lavagna_reazioni').select('elemento_id, emoji, autore').limit(20000),
    db.from('lavagna_elementi').select('media_id').not('media_id', 'is', null).limit(20000),
  ])
  const errore = el.error ?? media.error ?? reazioni.error ?? usi.error
  if (errore) return { ok: false, error: erroreLavagna(errore) }

  const conteggio = new Map<string, number>()
  for (const r of (usi.data ?? []) as { media_id: string }[]) conteggio.set(r.media_id, (conteggio.get(r.media_id) ?? 0) + 1)
  const elementi = (el.data ?? []) as RigaElemento[]
  const visibili = new Set(elementi.map(e => e.id))
  return {
    ok: true,
    stato: costruisciStato({
      elementi,
      media: (media.data ?? []) as RigaMedia[],
      reazioni: ((reazioni.data ?? []) as RigaReazione[]).filter(r => visibili.has(r.elemento_id)),
      usi: conteggio,
    }, firma),
  }
}

/** Quante cose ha attaccato o caricato questa firma negli ultimi dieci minuti: l'anonimato non è un megafono. */
export async function recenti(db: Db, tabella: 'lavagna_elementi' | 'lavagna_media', firma: string): Promise<number> {
  const da = new Date(Date.now() - 10 * 60_000).toISOString()
  const { count } = await db.from(tabella).select('id', { count: 'exact', head: true }).eq('autore', firma).gte('created_at', da)
  return count ?? 0
}

export const TETTO_RECENTI = { elementi: 40, media: 20 } as const
