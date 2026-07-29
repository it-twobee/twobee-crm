import type { ClientLabel } from '@/lib/types/database'

type Countable = { client_label?: ClientLabel | null; is_internal?: boolean | null }

/** Perso = fuori dai conti e dagli avvisi. Resta in anagrafica e nello storico churn. */
export const isLost = (c: Countable) => c.client_label === 'perso'

/**
 * Base di calcolo di ogni statistica e di ogni avviso: né clienti interni
 * (TwoBee stessa, scambi merce) né clienti persi. Un cliente perso che continua
 * a pesare su MRR, health map o alert falsa tutti i numeri e non è azionabile:
 * l'unico momento in cui merita attenzione è quando lo perdi, una volta sola.
 */
export const countsInStats = (c: Countable) => !c.is_internal && !isLost(c)
