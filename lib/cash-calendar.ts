/**
 * Competenza e cassa — calcoli puri, nessun I/O. (§224)
 *
 * Il conto economico ha sempre saputo **in che mese il lavoro è stato fatto**.
 * Non sapeva **quando i soldi si muovono**, e sono due domande diverse: lo
 * stipendio di luglio esce il 20 agosto, il subappalto si paga quando paga il
 * cliente, una fattura emessa il 1° vale quindici giorni. Finché l'unica cosa
 * scritta era una spunta «pagato» senza data, la lettura di cassa di un mese
 * conteneva solo le righe di quel mese: agosto non vedeva lo stipendio di
 * luglio che sta pagando, e luglio se lo teneva come se fosse uscito lì.
 *
 * Tre concetti, e nessuno dei tre è l'altro:
 *
 *   · **competenza** — il mese della riga. Non si tocca: è il lavoro consegnato.
 *   · **scadenza** (`dueOf`) — quando i soldi sono attesi. La dice la natura
 *     della voce (`termsOf`), e si può scrivere a mano riga per riga.
 *   · **movimento** (`paid_on`) — quando i soldi si sono mossi davvero. È
 *     l'unico che fa cassa.
 *
 * Da qui le due regole che tengono in piedi tutto il resto:
 *
 * **La cassa di un mese sono i fatti di quel mese**, di qualunque competenza:
 * `movedIn` prende le righe con `paid_on` dentro il mese, quindi lo stipendio di
 * luglio pesa su agosto e la fattura di giugno incassata a luglio pesa su
 * luglio. Non ci si mette dentro niente di atteso: un totale che mescola quello
 * che è successo con quello che dovrebbe succedere non risponde a nessuna delle
 * due domande.
 *
 * **Quello che non si è mosso non sparisce, si trascina.** `openAt` porta nel
 * mese le righe scoperte dei mesi prima, con quanto sono in ritardo. Sono la
 * ragione per cui la cassa è più bassa della competenza, e vanno viste **dove
 * si spunta** — non in un riquadro di totali da un'altra parte.
 *
 * Una riga pagata senza data (`assumed`) resta nel suo mese di competenza e lo
 * dichiara: è così che questo modulo si comporta se la migration 203 non è
 * ancora stata eseguita, e la pagina continua a leggere come prima invece di
 * spostare numeri a caso.
 */

import { shiftMonth, type RevenueLine, type CostLine } from '@/lib/pl'
import { isPayrollCenter } from '@/lib/costs'

export type Terms =
  | 'stesso_mese'
  | 'giorni_15'
  | 'giorni_30'
  | 'giorni_60'
  | 'giorni_90'
  | 'mese_succ_20'
  | 'a_incasso'

export const TERMS: Terms[] = [
  'stesso_mese', 'giorni_15', 'giorni_30', 'giorni_60', 'giorni_90',
  'mese_succ_20', 'a_incasso',
]

export const TERMS_LABEL: Record<Terms, string> = {
  stesso_mese: 'entro il mese',
  giorni_15: '15 giorni data fattura',
  giorni_30: '30 giorni data fattura',
  giorni_60: '60 giorni data fattura',
  giorni_90: '90 giorni data fattura',
  mese_succ_20: 'entro il 20 del mese dopo',
  a_incasso: 'quando paga il cliente',
}

/** Perché quella scadenza, quando nessuno l'ha scritta a mano. */
export const TERMS_WHY: Record<Terms, string> = {
  stesso_mese: 'Canoni e addebiti diretti: escono nel mese in cui maturano.',
  giorni_15: 'La fattura esce il 1° del mese e vale quindici giorni: dal 16 è scoperta.',
  giorni_30: 'Trenta giorni dalla data fattura.',
  giorni_60: 'Sessanta giorni dalla data fattura.',
  giorni_90: 'Novanta giorni dalla data fattura.',
  mese_succ_20: 'Il costo del lavoro matura nel mese e si paga entro il 20 di quello dopo.',
  a_incasso: 'Il lavoro affidato fuori si paga quando il cliente ha pagato il suo.',
}

export type Side = 'entrata' | 'uscita'

export type CashLine = {
  id: string
  side: Side
  /** mese di **competenza**, primo del mese: '2026-07-01' */
  month: string
  /** imponibile per un'entrata, effettivo per un'uscita: serve ai totali */
  amount: number
  paid: boolean
  /** quando i soldi si sono mossi. Null su una riga non pagata */
  paid_on?: string | null
  /** scadenza scritta a mano: vince sulla regola */
  due_date?: string | null
  terms?: string | null
  label?: string
  /** uscite: l'area, per riconoscere il costo del lavoro */
  category?: string | null
  /** uscite: se c'è, è un subappalto e si paga a incasso del cliente */
  project_id?: string | null
}

/**
 * Le bande del ritardo, in giorni oltre la scadenza.
 *
 * Non sono estetica: `scaduto` a 15 giorni ricalca la regola dei pagamenti
 * (§177) — una fattura vale quindici giorni, e chi non ha pagato dopo altri
 * quindici non è distratto. Oltre i 45 è un credito da recuperare, non un
 * ritardo, e va guardato diverso o si legge come tutti gli altri.
 */
export const LATE_BANDS = { scaduto: 15, grave: 45 }

export type Band = 'pagato' | 'atteso' | 'in_ritardo' | 'scaduto' | 'grave'

export const BAND_LABEL: Record<Band, string> = {
  pagato: 'pagato',
  atteso: 'in scadenza',
  in_ritardo: 'in ritardo',
  scaduto: 'scaduto',
  grave: 'da recuperare',
}

export type CashStatus = {
  band: Band
  terms: Terms
  /** quando i soldi sono attesi */
  due: string
  /** giorni oltre la scadenza. Negativo = c'è ancora tempo */
  days: number
  /** in quale mese questa riga pesa sulla cassa */
  cashMonth: string
  /** quando si è mossa davvero, se lo si sa */
  paidOn: string | null
  /** pagata ma senza data del movimento: resta nel suo mese, e lo dice */
  assumed: boolean
}

/**
 * Per `a_incasso` serve sapere quando il cliente paga il lavoro. La chiave è
 * `progetto|mese`: lo stesso progetto incassa in mesi diversi, e il subappalto
 * di agosto si paga con la rata di agosto (§208).
 */
export type CashCtx = { collection?: Map<string, string> }

// ── dalle righe del conto economico ─────────────────────────────────────────

/**
 * Le due conversioni stanno qui e non nelle pagine: la scadenza di una riga
 * dipende da campi che ogni chiamante ricorda a modo suo, e il primo che si
 * dimentica `project_id` trasforma un subappalto in un canone da pagare subito.
 *
 * `fallbackMonth` copre le righe del mese aperto, che non portano la competenza
 * addosso perché è quella della pagina.
 */
export function fromRevenue(l: RevenueLine, fallbackMonth: string): CashLine & { projects: string[] } {
  return {
    id: l.id, side: 'entrata', month: monthOf(l.month ?? fallbackMonth),
    amount: l.amount_net, label: l.label,
    paid: l.paid, paid_on: l.paid_on ?? null,
    due_date: l.due_date ?? null, terms: l.terms ?? null,
    project_id: l.project_id ?? null,
    projects: l.project_ids?.length ? l.project_ids : l.project_id ? [l.project_id] : [],
  }
}

/**
 * Per un'uscita il fatto è l'**effettivo**; finché è zero vale il preventivato,
 * altrimenti una spesa registrata e non ancora consuntivata sparirebbe dagli
 * arretrati proprio mentre è quella che pesa sulla cassa.
 */
export function fromCost(c: CostLine, fallbackMonth: string): CashLine {
  return {
    id: c.id, side: 'uscita', month: monthOf(c.month ?? fallbackMonth),
    amount: c.actual > 0 ? c.actual : c.budget, label: c.label,
    paid: c.paid, paid_on: c.paid_on ?? null,
    due_date: c.due_date ?? null, terms: c.terms ?? null,
    category: c.category, project_id: c.project_id ?? null,
  }
}

// ── date, in UTC: un fuso orario non deve spostare una scadenza ─────────────

const pad = (n: number) => String(n).padStart(2, '0')

export const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Giorni fra due date, con segno: `daysBetween('01', '03')` = 2. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** Ultimo giorno del mese di competenza. */
export function endOfMonth(month: string): string {
  return addDays(shiftMonth(monthOf(month), 1), -1)
}

// ── la regola ───────────────────────────────────────────────────────────────

const isTerms = (v: unknown): v is Terms => TERMS.includes(v as Terms)

/**
 * Che accordo di pagamento ha questa riga.
 *
 * Quello scritto sulla riga vince sempre; senza, lo dice la **natura** della
 * voce. Sono le tre eccezioni vere del conto economico, e nessuna delle tre è
 * «entro il mese»: il costo del lavoro esce dopo, il subappalto esce quando è
 * entrato il ricavo, il cliente ha quindici giorni.
 */
export function termsOf(l: CashLine): Terms {
  if (isTerms(l.terms)) return l.terms
  if (l.side === 'entrata') return 'giorni_15'
  if (isPayrollCenter(l.category)) return 'mese_succ_20'
  if (l.project_id) return 'a_incasso'
  return 'stesso_mese'
}

/** Quando i soldi sono attesi. `due_date` sulla riga è un'eccezione decisa da una persona. */
export function dueOf(l: CashLine, ctx: CashCtx = {}): string {
  if (l.due_date) return l.due_date
  const first = monthOf(l.month)
  switch (termsOf(l)) {
    case 'giorni_15': return addDays(first, 14)
    case 'giorni_30': return addDays(first, 29)
    case 'giorni_60': return addDays(first, 59)
    case 'giorni_90': return addDays(first, 89)
    case 'mese_succ_20': return `${shiftMonth(first, 1).slice(0, 8)}20`
    case 'a_incasso': {
      const key = l.project_id ? `${l.project_id}|${first}` : ''
      return ctx.collection?.get(key) ?? endOfMonth(first)
    }
    default: return endOfMonth(first)
  }
}

/**
 * Quando il cliente paga il lavoro, progetto per progetto e mese per mese.
 *
 * Se ha già pagato vale la data del movimento; se no la scadenza della sua
 * rata. Con più righe sullo stesso progetto vince **la più lontana**: il
 * fornitore si paga quando è entrato tutto, non alla prima tranche.
 */
export function collectionIndex(
  revenue: (CashLine & { projects?: string[] })[],
  ctx: CashCtx = {},
): Map<string, string> {
  const out = new Map<string, string>()
  for (const l of revenue) {
    if (l.side !== 'entrata') continue
    const when = l.paid ? (l.paid_on ?? dueOf(l, ctx)) : dueOf(l, ctx)
    const projects = l.projects?.length ? l.projects : l.project_id ? [l.project_id] : []
    for (const p of projects) {
      const key = `${p}|${monthOf(l.month)}`
      const cur = out.get(key)
      if (!cur || when > cur) out.set(key, when)
    }
  }
  return out
}

export function statusOf(l: CashLine, today: string, ctx: CashCtx = {}): CashStatus {
  const terms = termsOf(l)
  const due = dueOf(l, ctx)
  const days = daysBetween(due, today)

  if (l.paid) {
    return {
      band: 'pagato', terms, due, days,
      paidOn: l.paid_on ?? null, assumed: !l.paid_on,
      cashMonth: monthOf(l.paid_on ?? l.month),
    }
  }

  /* Un arretrato è atteso **adesso**, non nel mese in cui doveva arrivare:
     lasciarlo nel mese della scadenza lo farebbe sparire dalla vista di chi
     deve incassarlo. Se la scadenza è ancora avanti resta dov'è. */
  const dueMonth = monthOf(due)
  const nowMonth = monthOf(today)
  const band: Band = days <= 0 ? 'atteso'
    : days > LATE_BANDS.grave ? 'grave'
    : days > LATE_BANDS.scaduto ? 'scaduto'
    : 'in_ritardo'

  return {
    band, terms, due, days, paidOn: null, assumed: false,
    cashMonth: dueMonth > nowMonth ? dueMonth : nowMonth,
  }
}

export const isLate = (s: CashStatus) => s.band === 'in_ritardo' || s.band === 'scaduto' || s.band === 'grave'

// ── le tre letture di un mese ───────────────────────────────────────────────

/**
 * Quello che si è mosso davvero in questo mese, di qualunque competenza.
 *
 * È la lettura «Cassa»: solo fatti. Una riga pagata senza data resta nel suo
 * mese di competenza, che è l'unica cosa che si sa di lei.
 */
export function movedIn<T extends CashLine>(lines: T[], month: string, today: string, ctx: CashCtx = {}): T[] {
  const m = monthOf(month)
  return lines.filter(l => l.paid && statusOf(l, today, ctx).cashMonth === m)
}

/**
 * Le righe scoperte che pesano su questo mese: gli arretrati dei mesi prima e
 * quelle che scadono adesso pur essendo maturate prima (lo stipendio di luglio
 * in agosto). Ordinate dalla più vecchia — è l'ordine in cui si telefona.
 *
 * Il confronto è con la **scadenza**, non con oggi: un mese passato deve poter
 * dire cosa gli pendeva addosso allora, o guardare indietro non serve a niente.
 */
export function openAt<T extends CashLine>(lines: T[], month: string, _today: string, ctx: CashCtx = {}): T[] {
  const m = monthOf(month)
  const end = endOfMonth(m)
  return lines
    .filter(l => !l.paid && monthOf(l.month) !== m)
    .filter(l => dueOf(l, ctx) <= end)
    .sort((a, b) => dueOf(a, ctx).localeCompare(dueOf(b, ctx)))
}

/** Tutto quello che è oltre la scadenza e non è stato pagato, ovunque stia. */
export function lateAt<T extends CashLine>(lines: T[], today: string, ctx: CashCtx = {}): T[] {
  return lines
    .filter(l => !l.paid && isLate(statusOf(l, today, ctx)))
    .sort((a, b) => dueOf(a, ctx).localeCompare(dueOf(b, ctx)))
}

export type CashSummary = {
  count: number
  amount: number
  /** giorni di ritardo della più vecchia: zero se nessuna è scaduta */
  oldest: number
  worst: Band
  /** quante e quanto stanno solo aspettando la loro scadenza */
  waiting: number
  waitingAmount: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const RANK: Record<Band, number> = { pagato: 0, atteso: 1, in_ritardo: 2, scaduto: 3, grave: 4 }

/** Il riassunto di un blocco di righe scoperte: quante, quanto, da quanto. */
export function summarize(lines: CashLine[], today: string, ctx: CashCtx = {}): CashSummary {
  let count = 0, amount = 0, oldest = 0, waiting = 0, waitingAmount = 0
  let worst: Band = 'atteso'
  for (const l of lines) {
    const s = statusOf(l, today, ctx)
    if (s.band === 'pagato') continue
    if (isLate(s)) {
      count++
      amount += l.amount
      if (s.days > oldest) oldest = s.days
      if (RANK[s.band] > RANK[worst]) worst = s.band
    } else {
      waiting++
      waitingAmount += l.amount
    }
  }
  return { count, amount: r2(amount), oldest, worst, waiting, waitingAmount: r2(waitingAmount) }
}

/** '2026-08-20' → '20 agosto' */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
    .toLocaleDateString('it-IT', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

/**
 * Il ritardo in parole. «in ritardo di 1 giorno» e «in ritardo di 38 giorni»
 * sono due fatti diversi e vanno letti senza contare le date a mente.
 */
export function lateLabel(s: CashStatus): string {
  if (s.band === 'pagato') {
    return s.paidOn ? `pagato il ${dayLabel(s.paidOn)}` : 'pagato, data non registrata'
  }
  if (s.days <= 0) {
    const left = -s.days
    if (left === 0) return 'scade oggi'
    return left === 1 ? 'scade domani' : `fra ${left} giorni`
  }
  return s.days === 1 ? 'in ritardo di 1 giorno' : `in ritardo di ${s.days} giorni`
}
