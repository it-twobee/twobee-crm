import type { ClientLabel } from '@/lib/types/database'

type Countable = { client_label?: ClientLabel | null; is_internal?: boolean | null }

/** §326 — che genere di interno è, quando lo è. */
export type InternalKind = 'giro' | 'progetto'
type Segmentable = Countable & { internal_kind?: InternalKind | null }

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
 * §321: non è ancora un cliente. Nasce scrivendo un nome che in anagrafica non
 * c'è — dal composer di una task ad hoc, o dalla lista clienti — e serve a dare
 * un posto a un lavoro già cominciato.
 *
 * Non fattura, quindi vale la regola della `pending`: fuori da MRR, conto
 * economico, alert. Ma **non è un perso**: un perso era un cliente e non lo è
 * più, un lead non lo è ancora, e contarlo nel churn direbbe che abbiamo perso
 * qualcuno che non avevamo mai avuto.
 */
export const isLead = (c: Countable) => c.client_label === 'lead'

/**
 * Base di calcolo di ogni statistica e di ogni avviso: né clienti interni
 * (TwoBee stessa, scambi merce), né persi, né fermi, né lead (§321: non
 * fatturano ancora). Un cliente che non lavora
 * e continua a pesare su MRR, health map o alert falsa tutti i numeri e non è
 * azionabile: il perso merita attenzione una volta sola, quando lo perdi; il
 * fermo la merita nella sua sezione, dove si vede da quanto sta fermo.
 */
export const countsInStats = (c: Countable) =>
  !c.is_internal && !isLost(c) && !isPaused(c) && !isLead(c)

/**
 * §326 — In che area della lista sta questa riga.
 *
 * `is_internal` dice «non conta nelle statistiche» (§213) e sotto quella parola
 * stanno due cose che non si somigliano. **GAV Sistemi** ha una partita IVA e
 * una fattura emessa: non è un cliente, è un giro di fatture fra società
 * collegate, e quel documento sta nel registro IVA come tutti gli altri.
 * **Metroquadro, Visionark, Costruisci e arreda, Twobee** non hanno partita
 * IVA né fatture: sono marchi e lavori interni, e non fattureranno mai.
 *
 * Tenerli in una lista sola fa due danni opposti: al primo si chiede «da
 * quotare» — e non c'è niente da quotare — al secondo si chiede lo stato dei
 * pagamenti, e non c'è nessun pagamento perché non c'è nessuna fattura.
 *
 * Un interno senza `internal_kind` è un **giro**: è la scelta prudente, perché
 * un giro compare nei conti e un lavoro interno no — e far comparire una riga
 * di troppo si vede, farne sparire una no.
 */
export type ClientSegment = 'cliente' | 'giro' | 'interno'

export const segmentOf = (c: Segmentable): ClientSegment =>
  !c.is_internal ? 'cliente' : c.internal_kind === 'progetto' ? 'interno' : 'giro'

/** §326 — società collegata che fattura davvero. */
export const isGiro = (c: Segmentable) => segmentOf(c) === 'giro'
/** §326 — marchio o lavoro interno di TwoBee: non fattura. */
export const isInternalWork = (c: Segmentable) => segmentOf(c) === 'interno'

export const SEGMENT_LABEL: Record<ClientSegment, string> = {
  cliente: 'Clienti',
  giro: 'Società collegate',
  interno: 'Progetti interni TwoBee',
}

/**
 * §327 — «interni» non vuol dire «nostri».
 *
 * La prima versione diceva «marchi e lavori nostri», ed era troppo stretta: qui
 * dentro ci vanno anche **aziende clienti vere** con cui il rapporto non passa
 * da una fattura — scambio merce, permuta, accordi di altra natura. Elettra
 * Group è una di quelle: è un cliente, lavora con noi, e non c'è un canone da
 * quotare perché non c'è niente da fatturare.
 *
 * Quello che accomuna l'area non è la proprietà: è che **il valore non passa da
 * un documento**. Per questo non hanno stato di fatturazione e non hanno un
 * canone da quotare — non perché contino meno.
 */
export const SEGMENT_HINT: Record<ClientSegment, string> = {
  cliente: 'chi compra da noi, con un canone o un lavoro a corpo',
  giro: 'fatturano davvero, ma non sono clienti: sono giri fra società collegate',
  interno: 'marchi nostri e clienti fuori fattura: scambio merce, permute, accordi di altra natura',
}

/**
 * §326 — «da quotare» va chiesto solo a chi può avere un contratto.
 *
 * L'etichetta nasce dal fatto che un cliente fattura senza avere un contratto
 * censito, ed è un'informazione vera **sui clienti**. Su GAV Sistemi e su
 * TwoBee non lo è: il primo è un giro di fatture, il secondo è sé stessi, e
 * nessuno dei due avrà mai un canone da quotare. Chiederglielo mette in cima a
 * una lista di cose da fare due righe che non si chiuderanno mai — ed è così
 * che una lista di cose da fare smette di essere guardata.
 *
 * Stessa ragione per un **perso**: non si quota chi se n'è andato. Un **lead**
 * invece sì, ed è anzi il solo motivo per cui esiste (§321); e un **fermo**
 * pure, perché il giorno che riparte serve un contratto. La regola non è «chi
 * conta nelle statistiche»: è «chi può firmare qualcosa».
 */
export const needsQuote = (c: Segmentable, contracts: number) =>
  segmentOf(c) === 'cliente' && !isLost(c) && contracts === 0

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
