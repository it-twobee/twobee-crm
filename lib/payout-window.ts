/**
 * §286 — La finestra dell'erogazione: cosa si distribuisce, e perché proprio quello.
 *
 * I compensi si erogano **il 20 del mese**, e quello che si distribuisce è
 * quello che è **maturato nel mese prima** e **rientrato entro il giorno in cui
 * si eroga**. Detto con l'esempio che l'ha fatta nascere: l'erogazione di agosto
 * 2026, anticipata al 13, guarda le fatture di **luglio** che al 13 agosto
 * risultavano incassate — comprese quelle rientrate a inizio agosto, che il
 * giorno in cui luglio si è chiuso non erano ancora arrivate.
 *
 * Le due regole che questo modulo sostituisce dicevano ciascuna metà della cosa:
 *
 *   · il **maturato** (§227) distribuisce tutto quello che il mese ha prodotto,
 *     incassato o no. È il numero giusto per «quanto spetta», ed è sbagliato per
 *     «quanto bonifico»: si erogherebbe denaro che non è arrivato.
 *   · la **cassa del mese** (`movedIn`, §224/§275) prende gli incassi *di* un
 *     mese di qualunque competenza. Risponde a «cosa si è mosso», che è la
 *     domanda della tenuta di cassa, non quella dell'erogazione: ci trascina
 *     dentro le fatture di maggio rientrate a luglio — già erogate — e ne lascia
 *     fuori quelle di luglio rientrate il 3 agosto, che sono esattamente quelle
 *     per cui si sta bonificando.
 *
 * La finestra le concilia: **competenza** fino al mese che si eroga, **cassa**
 * fra un'erogazione e la successiva. Da qui discendono le due proprietà che
 * rendono la regola usabile per anni e non solo per un mese:
 *
 *   **niente si perde.** Una fattura di luglio incassata il 25 agosto non entra
 *   nell'erogazione del 13: entra in quella dopo, perché la finestra di
 *   settembre parte da dove è finita quella di agosto. Prima non c'era un «dopo»
 *   — o la si anticipava, o spariva.
 *
 *   **niente si conta due volte.** Il limite inferiore è **esclusivo** e coincide
 *   col limite superiore dell'erogazione precedente: ogni incasso cade in una
 *   finestra e in una sola, e la somma delle finestre è la somma degli incassi.
 *
 * Il consolidato (§230) chiude la coda: prima di quella data i conti sono
 * liquidati, e non si va a ripescare una fattura di aprile perché è rientrata
 * adesso — si è già deciso che quel periodo era pari.
 *
 * Puro: nessun I/O, nessuna data «di oggi» presa dall'orologio. La data arriva
 * da fuori, sempre, o due letture della stessa erogazione darebbero due numeri.
 */

import { shiftMonth } from './pl'

/** Il giorno del mese in cui si eroga, quando nessuno ha deciso altrimenti. */
export const DEFAULT_PAYOUT_DAY = 20

export type PayoutWindow = {
  /** il mese **maturato**: quello di cui si sta distribuendo il lavoro */
  month: string
  /** il mese in cui il denaro esce: sempre quello dopo (§224) */
  dueMonth: string
  /** la data dell'erogazione — chiude la finestra degli incassi che entrano */
  date: string
  /**
   * la data dell'erogazione precedente: apre la finestra, **esclusa**.
   * `null` = non ce n'è stata una, si parte dal consolidato.
   */
  since: string | null
  /** §230 — il primo mese di competenza che si guarda; prima è liquidato */
  from: string | null
}

/**
 * La data in cui si eroga quello che è maturato in `month`.
 *
 * Esce **nel mese dopo** (§224, come il costo del lavoro): il conto economico
 * non può dire che il compenso di luglio è in ritardo il 2 luglio. Il giorno lo
 * decide la configurazione, e il singolo mese può scrivere la sua data —
 * ad agosto 2026 l'erogazione è stata anticipata al 13, e un'eccezione senza un
 * posto dove scriverla diventa un numero che nessuno sa più da dove esce.
 */
export function payoutDateFor(
  month: string, day: number = DEFAULT_PAYOUT_DAY, override?: string | null,
): string {
  if (override) return override.slice(0, 10)
  const d = Math.min(28, Math.max(1, Math.round(day) || DEFAULT_PAYOUT_DAY))
  return `${shiftMonth(month, 1).slice(0, 8)}${String(d).padStart(2, '0')}`
}

export function buildWindow(input: {
  month: string
  /** la data scritta su questo mese, se c'è */
  date?: string | null
  /** la data scritta sul mese prima, se c'è */
  previousDate?: string | null
  day?: number
  settledFrom?: string | null
}): PayoutWindow {
  const { month, day = DEFAULT_PAYOUT_DAY, settledFrom = null } = input
  const date = payoutDateFor(month, day, input.date)
  const prevMonth = shiftMonth(month, -1)
  /* La finestra precedente finisce dove è finita l'erogazione del mese prima.
     Se quel mese è **fuori dal consolidato** non c'è stata nessuna erogazione da
     rispettare, e partire dalla sua data teorica butterebbe via gli incassi
     arrivati prima: la prima finestra dopo il consolidato prende tutto. */
  const settled = settledFrom ? settledFrom.slice(0, 10) : null
  const since = settled && prevMonth < settled
    ? null
    : payoutDateFor(prevMonth, day, input.previousDate)

  return { month, dueMonth: shiftMonth(month, 1), date, since, from: settled }
}

/** Cosa serve sapere di una riga per collocarla nella finestra. */
export type WindowLine = {
  id: string
  /** mese di competenza; assente = quello della finestra */
  month?: string
  paid: boolean
  paid_on?: string | null
}

/**
 * Perché una riga è dentro o fuori. La ragione viaggia con la riga: un elenco
 * che mostra solo quelle prese non fa mai capire perché il totale è quello, e
 * «chi non ha visto rientrare le sue fatture resta in tabella con scritto
 * perché» (§275) vale anche per le fatture.
 */
export type WindowVerdict =
  | 'presa'
  /** incassata, ma dopo la data: entra nell'erogazione successiva */
  | 'dopo'
  /** incassata prima della finestra: l'ha già distribuita l'erogazione scorsa */
  | 'gia_erogata'
  /** matura in un mese che non si sta ancora erogando */
  | 'non_matura'
  /** competenza prima del consolidato: quei conti sono chiusi (§230) */
  | 'consolidata'
  /** maturata e non incassata: è il motivo per cui a qualcuno spetta meno */
  | 'scoperta'
  /** spuntata senza una data: si assume dentro, e lo si dichiara (§203) */
  | 'presunta'

export const VERDICT_LABEL: Record<WindowVerdict, string> = {
  presa: 'incassata nella finestra',
  dopo: 'incassata dopo l\'erogazione: entra nella prossima',
  gia_erogata: 'già distribuita nell\'erogazione precedente',
  non_matura: 'matura in un mese che non si eroga adesso',
  consolidata: 'competenza prima del consolidato',
  scoperta: 'maturata e non ancora incassata',
  presunta: 'spuntata senza data: assunta dentro la finestra',
}

/** Le prese: quelle su cui si calcola. Le altre restano per essere spiegate. */
export const TAKEN: WindowVerdict[] = ['presa', 'presunta']

export function placeLine<T extends WindowLine>(l: T, w: PayoutWindow): WindowVerdict {
  const m = (l.month ?? w.month).slice(0, 10)
  if (m > w.month) return 'non_matura'
  if (w.from && m < w.from) return 'consolidata'
  if (!l.paid) return 'scoperta'
  /* §203 — una spunta senza data non si può collocare nel tempo. Assumerla
     dentro è la scelta che sbaglia nella direzione giusta: chi ha lavorato
     viene pagato, e la riga dichiara di essere un'assunzione invece di
     nascondersi in un totale. */
  if (!l.paid_on) return 'presunta'
  const on = l.paid_on.slice(0, 10)
  if (on > w.date) return 'dopo'
  /* Il limite inferiore vale **solo per gli arretrati**, e la ragione è che
     l'erogazione precedente ha distribuito la competenza del mese prima, non
     tutto quello che era stato incassato fino a quel giorno. Una riga di
     **questo** mese incassata prima di quella data non era nel suo perimetro:
     è la prima volta che si può erogare, e tagliarla fuori la faceva sparire
     per sempre — su agosto 2026 la rata ISF incassata l'11 agosto usciva sia
     dall'erogazione di agosto (competenza luglio) sia da quella di settembre,
     e la sezione mostrava zero. Per le righe **di mesi precedenti** il limite
     serve eccome: quelle il loro turno l'hanno già avuto. */
  if (w.since && m < w.month && on <= w.since) return 'gia_erogata'
  return 'presa'
}

export type Placed<T> = { line: T; verdict: WindowVerdict }

export function placeAll<T extends WindowLine>(lines: T[], w: PayoutWindow): Placed<T>[] {
  return lines.map(line => ({ line, verdict: placeLine(line, w) }))
}

/** Le righe che entrano nel calcolo dell'erogazione. */
export function takenIn<T extends WindowLine>(lines: T[], w: PayoutWindow): T[] {
  return lines.filter(l => TAKEN.includes(placeLine(l, w)))
}

/**
 * I costi che il margine digital deve togliere alle righe prese.
 *
 * §232 — **non** si filtrano per incasso: il margine digital è il rapporto fra
 * il ricavo di un progetto e i subappalti di quel progetto e di quel mese, e
 * filtrarne una gamba sola lo rompe. Se si incassa la rata e il fornitore si
 * paga il mese dopo, distribuire la rata intera vorrebbe dire distribuire soldi
 * che sono già di qualcun altro. Quindi: tutti i subappalti **di competenza**
 * dei mesi da cui arrivano le righe prese, pagati o no.
 */
export function marginCostsFor<C extends { project_id?: string | null; month?: string }>(
  costs: C[], takenMonths: Iterable<string>, fallbackMonth: string,
): C[] {
  const mesi = new Set(takenMonths)
  return costs.filter(c => c.project_id && mesi.has(c.month ?? fallbackMonth))
}

/** Quanto resta indietro, e di chi è: serve a dire perché un compenso è basso. */
export function windowSummary<T extends WindowLine & { amount_net?: number }>(
  lines: T[], w: PayoutWindow,
) {
  const r2 = (n: number) => Math.round(n * 100) / 100
  const amount = (l: T) => Number(l.amount_net ?? 0)
  const bucket = (v: WindowVerdict[]) => {
    const rows = lines.filter(l => v.includes(placeLine(l, w)))
    return { n: rows.length, amount: r2(rows.reduce((s, l) => s + amount(l), 0)), rows }
  }
  return {
    taken: bucket(TAKEN),
    /** spuntate senza data: quante delle prese sono un'assunzione */
    assumed: bucket(['presunta']),
    /** maturate e non incassate: è quello che non si eroga e si dirà perché */
    open: bucket(['scoperta']),
    /** incassate dopo: non sono perse, sono della prossima erogazione */
    next: bucket(['dopo']),
  }
}
