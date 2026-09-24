/**
 * §424 — l'elenco vero delle fasi, letto una volta per richiesta.
 *
 * `lib/sales-stages.ts` contiene le regole e il seme; qui c'è l'unico posto che
 * va a prendere l'elenco dal database. Sta separato perché quel file è puro e
 * lo prova un gate: appena importa un client Supabase smette di poter girare
 * con `tsx` e il gate muore con lui.
 *
 * `cache()` per richiesta: pagina, azioni e componenti annidati chiedono la
 * stessa cosa e la ottengono una volta sola, senza che una riga di dati
 * attraversi due utenti diversi.
 *
 * **Se la lettura fallisce si torna al seme, e non è un dettaglio.** Una pagina
 * senza fasi mostra trentasei righe senza stato: somiglia a un archivio vuoto,
 * e chi la vede pensa che si siano persi i dati. Meglio l'elenco di partenza —
 * dichiaratamente vecchio — di nessun elenco.
 */
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { FASI_SEME, ordinate, type Fase } from '@/lib/sales-stages'
import { LISTE, SCELTE_SEME, TABELLA, type Scelte, type Voce } from '@/lib/sales-scelte'
import type { Campo } from '@/lib/sales-campi'

const COLONNE = 'chiave, etichetta, ruolo, tinta, ordine, attiva, descrizione' as const

export const leggiFasi = cache(async (): Promise<Fase[]> => {
  try {
    const sb = await createClient()
    const { data, error } = await sb.from('sales_stages').select(COLONNE).order('ordine')
    if (error || !data?.length) return FASI_SEME
    return ordinate(data as unknown as Fase[])
  } catch {
    /* La migration 258 può non essere ancora applicata: la tabella non esiste e
       la query alza. Il seme è la stessa cosa che quella migration semina. */
    return FASI_SEME
  }
})

export type MotivoPerso = { chiave: string; etichetta: string; ordine: number; attivo: boolean }

export const leggiMotiviPerso = cache(async (): Promise<MotivoPerso[]> => {
  try {
    const sb = await createClient()
    const { data, error } = await sb.from('sales_motivi_perso')
      .select('chiave, etichetta, ordine, attivo').eq('attivo', true).order('ordine')
    if (error || !data) return []
    return data as unknown as MotivoPerso[]
  } catch {
    return []
  }
})

/**
 * §436 — priorità e membership, tutte le voci, anche le ritirate: una riga
 * vecchia può averne una. Se la tabella non si legge — la migration non è
 * ancora applicata — si torna al seme, che è l'elenco di prima.
 */
export const leggiScelte = cache(async (): Promise<Scelte> => {
  try {
    const sb = await createClient()
    const letti = await Promise.all(LISTE.map(l =>
      sb.from(TABELLA[l]).select('chiave, etichetta, ordine, attivo').order('ordine')))
    const out = { ...SCELTE_SEME }
    LISTE.forEach((l, i) => {
      const { data, error } = letti[i]
      if (!error && data?.length) out[l] = data as unknown as Voce[]
    })
    return out
  } catch {
    return SCELTE_SEME
  }
})

/**
 * §437 — i campi personalizzati, tutti, anche i ritirati: la scheda mostra un
 * ritirato se la riga ha un valore. Senza la tabella (migration non applicata)
 * non ce ne sono, e la scheda resta quella di sempre.
 */
export const leggiCampi = cache(async (): Promise<Campo[]> => {
  try {
    const sb = await createClient()
    const { data, error } = await sb.from('sales_campi')
      .select('chiave, etichetta, tipo, opzioni, riquadro, aiuto, ordine, attivo').order('ordine')
    return error || !data ? [] : data as unknown as Campo[]
  } catch {
    return []
  }
})
