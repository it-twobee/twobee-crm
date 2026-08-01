import type { ClientLabel } from '@/lib/types/database'

type Countable = { client_label?: ClientLabel | null; is_internal?: boolean | null }

/** Perso = fuori dai conti e dagli avvisi. Resta in anagrafica e nello storico churn. */
export const isLost = (c: Countable) => c.client_label === 'perso'

/**
 * §176: lavorazioni sospese. Non fattura — quindi fuori dall'MRR e dal conto
 * economico — ma il rapporto è vivo e può ripartire domani. Tenerlo fra gli
 * attivi gonfia i numeri; metterlo fra i persi falsa il churn e cancella una
 * relazione che esiste ancora.
 */
export const isPaused = (c: Countable) => c.client_label === 'pending'

/**
 * Base di calcolo di ogni statistica e di ogni avviso: né clienti interni
 * (TwoBee stessa, scambi merce), né persi, né fermi. Un cliente che non lavora
 * e continua a pesare su MRR, health map o alert falsa tutti i numeri e non è
 * azionabile: il perso merita attenzione una volta sola, quando lo perdi; il
 * fermo la merita nella sua sezione, dove si vede da quanto sta fermo.
 */
export const countsInStats = (c: Countable) => !c.is_internal && !isLost(c) && !isPaused(c)

/**
 * §177: il cliente ha almeno un contratto venduto?
 *
 * `mrr_source` passa a 'contratti' solo quando esiste un contratto non in
 * bozza (§170), quindi risponde alla domanda senza una query in più. Serve
 * perché un cliente senza contratti **non può avere un contratto in scadenza**:
 * le date in anagrafica sono un residuo, e un avviso costruito su un residuo
 * manda a rincorrere un rinnovo che non esiste.
 */
export const hasContracts = (c: { mrr_source?: string | null }) => c.mrr_source === 'contratti'

/** Da quanti giorni le lavorazioni sono ferme: è la domanda che fa alzare il telefono. */
export function pausedDays(pausedAt: string | null | undefined, today = new Date()): number | null {
  if (!pausedAt) return null
  return Math.max(0, Math.round(
    (today.getTime() - new Date(pausedAt + 'T00:00:00').getTime()) / 86400000,
  ))
}

/**
 * §177: come si legge lo stato pagamenti.
 *
 * La fattura esce il primo giorno utile del mese e vale 15 giorni. Entro quel
 * termine una riga scoperta è la normalità — «da pagare» — e non deve accendere
 * niente; dal 16 diventa un ritardo. I valori in colonna restano i tre storici,
 * cambia il nome con cui si presentano.
 */
const PAYMENT_LABEL: Record<string, string> = {
  pagato: 'Pagato',
  in_attesa: 'Da pagare',
  scaduto: 'Non pagato',
}

export const paymentLabel = (s: string | null | undefined) => PAYMENT_LABEL[s ?? ''] ?? '—'
