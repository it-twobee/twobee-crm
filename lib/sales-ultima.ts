/**
 * §463 — la nota dell'ultima interazione, per la riga dell'elenco.
 *
 * Una voce per lead, la più recente fra quelle vere: non le note del diario che
 * sono promemoria in programma, non i contatti storici senza testo, non le voci
 * «stato» scritte dal trigger. Se l'ultima non ha testo si mostra comunque
 * tipo ed esito — «Chiamata · Non risposto» dice già cosa è successo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { quandoContatto, titoloVoce, type TipoVoce, type Direzione } from './sales-timeline'

export type UltimaVoce = {
  deal_id: string
  type: TipoVoce
  outcome: string | null
  direction: Direzione | null
  content: string | null
  occurred_at: string
  has_time: boolean
}

export const COLONNE_ULTIMA = 'deal_id,type,outcome,direction,content,occurred_at,has_time'

/** «Chiamata · Non risposto · Ieri 09:10» e il testo, se c'è */
export function rigaUltima(v: UltimaVoce | null | undefined, adessoMs: number): { titolo: string; testo: string | null } | null {
  if (!v) return null
  const quando = quandoContatto(v.occurred_at, v.has_time, adessoMs)
  const titolo = [titoloVoce({ ...v, stato: 'fatta' }), quando].filter(Boolean).join(' · ')
  const testo = (v.content ?? '').replace(/\s+/g, ' ').trim()
  return { titolo, testo: testo || null }
}

/** da molte voci a una per lead, la più recente */
export function unaPerLead(voci: UltimaVoce[]): Map<string, UltimaVoce> {
  const m = new Map<string, UltimaVoce>()
  for (const v of voci) {
    const prima = m.get(v.deal_id)
    if (!prima || Date.parse(v.occurred_at) > Date.parse(prima.occurred_at)) m.set(v.deal_id, v)
  }
  return m
}

/**
 * L'ultima voce di ogni lead dati. **Tollerante**: prima della migration la
 * funzione non c'è e l'elenco si apre lo stesso, senza note — meglio una riga
 * meno ricca di una pagina che non carica per un dettaglio.
 */
export async function leggiUltime(admin: SupabaseClient, ids: string[]): Promise<Map<string, UltimaVoce>> {
  if (!ids.length) return new Map()
  const { data, error } = await admin.rpc('sales_ultime_voci', { p_ids: ids })
  if (error || !data) return new Map()
  return unaPerLead(data as unknown as UltimaVoce[])
}
