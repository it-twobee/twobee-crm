import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isMese, meseDopo, etichettaMese } from '@/lib/social'
import { meseCorrente, type PostSfida } from '@/lib/linkedin'

export type SfidaData = {
  mese: string
  etichetta: string
  corrente: string
  etichettaCorrente: string
  prima: string
  dopo: string | null
  posts: PostSfida[]
  /** la tabella non c'è ancora: la pagina lo dice invece di mostrare una classifica vuota */
  manca: boolean
}

/** §477 — la classifica del mese, con la RLS di chi guarda (staff: tutto). */
export async function loadSfida(db: SupabaseClient, meseRichiesto?: string): Promise<SfidaData> {
  const corrente = meseCorrente()
  const mese = isMese(meseRichiesto) && meseRichiesto <= corrente ? meseRichiesto : corrente
  const base = {
    mese, etichetta: etichettaMese(mese), corrente, etichettaCorrente: etichettaMese(corrente),
    prima: meseDopo(mese, -1), dopo: mese < corrente ? meseDopo(mese) : null,
  }
  const { data, error } = await db.from('linkedin_posts')
    .select('post_urn, url, published_at, testo, reazioni, commenti, diffusioni, impression, updated_at, profile_id')
    .eq('mese', mese)
  if (error) return { ...base, posts: [], manca: true }
  const righe = (data ?? []) as Omit<PostSfida, 'autore'>[]
  const ids = Array.from(new Set(righe.map(r => r.profile_id)))
  const { data: persone } = ids.length
    ? await db.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] }
  const nomi = new Map(((persone ?? []) as { id: string; full_name: string | null }[]).map(p => [p.id, p.full_name ?? '']))
  return { ...base, manca: false, posts: righe.map(r => ({ ...r, autore: nomi.get(r.profile_id) || 'Senza nome' })) }
}
