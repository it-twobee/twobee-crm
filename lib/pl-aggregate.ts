/**
 * Il prospetto: entrate e uscite per macro categoria, mese per mese. (§239)
 *
 * Il conto economico risponde a «com'è andato **questo** mese», riga per riga,
 * ed è il posto dove si spunta. Quello che non risponde è la domanda che si fa
 * guardando indietro: **dove vanno i soldi**, in che proporzione, e se la cosa
 * sta cambiando. Con quaranta righe di ricavo e novanta di costo sparse su
 * cinque mesi quella risposta non c'è, e leggerla scorrendo cinque pagine
 * significa non leggerla.
 *
 * Qui le righe si aggregano in **macro categorie** e i mesi diventano colonne.
 * Tre regole, e nascono tutte e tre da errori che si fanno in un foglio Excel:
 *
 * **Competenza e cassa sono due griglie, non due colonne accanto.** Il mese di
 * competenza è quello del lavoro; il mese di cassa è quello in cui il denaro si
 * è mosso (`paid_on`, §224). Lo stipendio di luglio sta in luglio sulla prima e
 * in agosto sulla seconda: metterli sulla stessa riga di una tabella sola
 * significa scegliere quale delle due domande tradire. Si sceglie con un
 * selettore, e la testata scrive quale si sta guardando.
 *
 * **Il prospetto è netto, la banca è lorda.** Le percentuali si applicano
 * all'imponibile; dal conto passa il totale della fattura. Il blocco «e in
 * banca» tiene le due cose separate e mette **l'IVA in riga**, che è l'unico
 * modo di passare dall'una all'altra senza barare: sommare un imponibile a un
 * saldo è l'errore che fa sembrare in utile un'azienda che sta finendo i soldi.
 *
 * **La differenza col conto ha un nome o è un problema.** Ogni mese confronta
 * quello che il prospetto dice essere passato in cassa con quello che la banca
 * ha davvero mosso. Se non torna non è un arrotondamento: è una spunta senza
 * movimento o un movimento senza riga, e la §199 dice quale.
 */

import { monthOf, statusOf, type CashLine, type CashCtx } from '@/lib/cash-calendar'
import { isPayrollCenter } from '@/lib/costs'
import type { RevenueLine, CostLine } from '@/lib/pl'

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0))

export type Basis = 'competenza' | 'cassa'

export type Cell = {
  month: string
  value: number
  /** quante righe ci sono dietro: un totale senza il conto non si controlla */
  count: number
}

export type MacroRow = {
  key: string
  label: string
  /** `entrata` sale, `uscita` scende, `calcolo` è una somma delle altre */
  kind: 'entrata' | 'uscita' | 'calcolo'
  cells: Cell[]
  total: number
  /** quota sul totale del suo blocco: dice **dove vanno i soldi** */
  share: number
  /** una riga che il conto economico non contiene, e va detto */
  hint?: string
}

export type BankMonth = {
  month: string
  /** movimenti veri, lordi (§189: solo `banca`) */
  inflow: number
  outflow: number
  net: number
  /** saldo alla fine del mese, cumulato dall'apertura */
  balance: number
  /** IVA incassata e pagata sulle righe mosse in questo mese: il ponte fra netto e lordo */
  vatIn: number
  vatOut: number
  /** quello che il prospetto dice mosso, al lordo dell'IVA */
  sheet: number
  /** banca − prospetto: se non è zero ha un nome, o è un problema */
  diff: number
}

export type Prospetto = {
  months: string[]
  basis: Basis
  revenue: MacroRow[]
  costs: MacroRow[]
  /**
   * §240 — i compensi a soci e commerciali. Stanno **fra le uscite**, perché
   * dal conto escono, ma non sono righe di costo — non si scrivono, si
   * ricalcolano (§227) — quindi non entrano in `costs` né nel margine di conto
   * economico: sarebbero un numero diverso da quello che dice il conto
   * economico, con lo stesso nome.
   *
   * In competenza sono due righe, perché si sa a chi spettano; in cassa è una
   * sola, perché un bonifico a un socio che è anche commerciale non dice quale
   * dei due lavori sta pagando (§226).
   */
  payouts: MacroRow[]
  /**
   * `margin` = entrate − costi, lo stesso numero del conto economico.
   * `left` = margine meno i compensi: quello che resta davvero alla società.
   */
  totals: { revenue: MacroRow; costs: MacroRow; margin: MacroRow; payouts: MacroRow; left: MacroRow }
  bank: BankMonth[]
  /** quanto della differenza resta senza nome, in tutto il periodo */
  unexplained: number
}

// ── le macro categorie ──────────────────────────────────────────────────────

/**
 * Le entrate si dividono per **mestiere**, non per cliente: growth e digital
 * hanno due formule di ripartizione diverse (§186), quindi vederle sommate
 * nasconde l'unica cosa che cambia le decisioni. Le partite di giro stanno
 * fuori da entrambe: sono fatturato ma non sono margine di nessuno (§188).
 */
export const REVENUE_MACRO = [
  { key: 'growth', label: 'Growth — canoni e progetti' },
  { key: 'digital', label: 'Digital — progetti e sviluppo' },
  { key: 'giro', label: 'Partite di giro', hint: 'Anticipi che tornano al cliente: fatturato e IVA sì, margine no' },
] as const

/**
 * Le uscite si dividono per **natura del costo**, e le prime due non sono
 * un'area del piano: il costo del lavoro lo scrive l'organico (§184) e il
 * subappalto è già stato tolto dal margine del suo progetto (§188). Tenerle
 * dentro «Delivery & Fornitori» faceva sembrare struttura una cosa che è
 * venduta al cliente.
 */
export const COST_MACRO = [
  { key: 'personale', label: 'Personale' },
  { key: 'subappalti', label: 'Lavori affidati fuori' },
  { key: 'soci', label: 'Spese dai sottoconti soci', hint: 'Sono erogato, non un costo in più (§191)' },
] as const

/** A quale macro appartiene una riga di costo. Il resto tiene il nome della sua area. */
export function costMacro(c: Pick<CostLine, 'category' | 'project_id' | 'partner_id'>): string {
  if (isPayrollCenter(c.category)) return 'personale'
  if (c.project_id) return 'subappalti'
  if (c.partner_id) return 'soci'
  return c.category?.trim() || 'Senza area'
}

export function costMacroLabel(key: string): string {
  return COST_MACRO.find(m => m.key === key)?.label ?? key
}

// ── il motore ───────────────────────────────────────────────────────────────

export type ProspettoInput = {
  months: string[]
  revenue: (RevenueLine & { month: string })[]
  costs: (CostLine & { month: string })[]
  /** movimenti della banca: solo i `banca` fanno saldo (§189) */
  txs: { booked_on: string; amount: number; source: string; kind: string }[]
  /** saldo di partenza dei conti */
  opening: number
  today: string
  basis: Basis
  ctx?: CashCtx
  /**
   * §240 — compensi per mese. `partners` e `sales` sono il **maturato** dal
   * piano compensi; `paidOut` è quello che dalla banca è **uscito davvero**
   * (movimenti `finanziamento`). Sono due misure diverse della stessa cosa, e
   * la lettura scelta decide quale si guarda.
   */
  payouts?: {
    month: string
    /** maturato, dal piano compensi */
    partners: number; sales: number
    /** §243 — spuntato pagato **in questo mese**, dalle righe `pl_payouts` */
    paidPartners?: number; paidSales?: number
    /** ripiego senza righe materializzate: i bonifici `finanziamento` del mese */
    paidOut: number
  }[]
}

/**
 * In quale mese una riga pesa, secondo la lettura scelta.
 *
 * In competenza è il mese della riga e basta. In cassa è il mese in cui i soldi
 * si sono mossi: una riga non pagata **non c'è**, e una pagata senza data resta
 * nel suo mese di competenza dichiarandolo (§224, `assumed`) — inventarle una
 * data la sposterebbe in un mese in cui non è successo niente.
 */
function bucketOf(l: CashLine, basis: Basis, today: string, ctx: CashCtx): string | null {
  if (basis === 'competenza') return monthOf(l.month)
  if (!l.paid) return null
  return statusOf(l, today, ctx).cashMonth
}

export function prospetto(i: ProspettoInput): Prospetto {
  const months = i.months.map(monthOf).sort()
  const ctx = i.ctx ?? {}
  const idx = new Map(months.map((m, k) => [m, k]))
  const empty = () => months.map(m => ({ month: m, value: 0, count: 0 }))

  const put = (cells: Cell[], month: string | null, amount: number) => {
    if (!month) return
    const k = idx.get(month)
    if (k == null) return
    cells[k].value = r2(cells[k].value + amount)
    cells[k].count++
  }

  // ── entrate ───────────────────────────────────────────────────────────────
  const revCells = new Map<string, Cell[]>(REVENUE_MACRO.map(m => [m.key, empty()]))
  for (const l of i.revenue) {
    const cl: CashLine = {
      id: l.id, side: 'entrata', month: monthOf(l.month), amount: l.amount_net,
      paid: l.paid, paid_on: l.paid_on ?? null, due_date: l.due_date ?? null,
      terms: l.terms ?? null, project_id: l.project_id ?? null,
    }
    const key = l.pass_through ? 'giro' : l.kind === 'digital' ? 'digital' : 'growth'
    put(revCells.get(key)!, bucketOf(cl, i.basis, i.today, ctx), l.amount_net)
  }

  // ── uscite ────────────────────────────────────────────────────────────────
  const costCells = new Map<string, Cell[]>(COST_MACRO.map(m => [m.key, empty()]))
  for (const c of i.costs) {
    /* L'effettivo è il fatto; finché è zero vale il preventivato, o una spesa
       registrata e non ancora consuntivata sparirebbe dal prospetto proprio
       mentre è quella che pesa (§224). */
    const amount = c.actual > 0 ? c.actual : c.budget
    const cl: CashLine = {
      id: c.id, side: 'uscita', month: monthOf(c.month), amount,
      paid: c.paid, paid_on: c.paid_on ?? null, due_date: c.due_date ?? null,
      terms: c.terms ?? null, category: c.category, project_id: c.project_id ?? null,
    }
    const key = costMacro(c)
    if (!costCells.has(key)) costCells.set(key, empty())
    put(costCells.get(key)!, bucketOf(cl, i.basis, i.today, ctx), amount)
  }

  const rowOf = (key: string, label: string, kind: MacroRow['kind'], cells: Cell[], hint?: string): MacroRow => ({
    key, label, kind, cells, total: sum(cells.map(c => c.value)), share: 0, hint,
  })

  const revenue = REVENUE_MACRO
    .map(m => rowOf(m.key, m.label, 'entrata', revCells.get(m.key)!, 'hint' in m ? m.hint : undefined))
    .filter(r => r.total !== 0)
  /* Le macro dichiarate prima, poi le aree del piano in ordine di peso: quello
     che costa di più si legge per primo, che è l'unico ordine utile. */
  const known = new Set<string>(COST_MACRO.map(m => m.key))
  const costs = [
    ...COST_MACRO.map(m => rowOf(m.key, m.label, 'uscita', costCells.get(m.key)!, 'hint' in m ? m.hint : undefined)),
    ...Array.from(costCells.entries())
      .filter(([k]) => !known.has(k))
      .map(([k, cells]) => rowOf(k, k, 'uscita', cells))
      .sort((a, b) => b.total - a.total),
  ].filter(r => r.total !== 0)

  const totalCells = (rows: MacroRow[]) => months.map((m, k) => ({
    month: m,
    value: sum(rows.map(r => r.cells[k].value)),
    count: rows.reduce((n, r) => n + r.cells[k].count, 0),
  }))
  const revTot = rowOf('tot-entrate', 'Totale entrate', 'calcolo', totalCells(revenue))
  const costTot = rowOf('tot-uscite', 'Totale uscite', 'calcolo', totalCells(costs))
  const margin = rowOf('margine', 'Margine', 'calcolo', months.map((m, k) => ({
    month: m,
    value: r2(revTot.cells[k].value - costTot.cells[k].value),
    count: revTot.cells[k].count + costTot.cells[k].count,
  })))

  // ── §240 · i compensi ─────────────────────────────────────────────────────
  const payIn = new Map((i.payouts ?? []).map(x => [monthOf(x.month), x]))
  type PayIn = { partners: number; sales: number; paidPartners?: number; paidSales?: number; paidOut: number }
  const payCells = (pick: (x: PayIn) => number) =>
    months.map(m => {
      const x = payIn.get(m)
      const v = x ? r2(pick(x)) : 0
      return { month: m, value: v, count: v !== 0 ? 1 : 0 }
    })
  /* §243 — da quando i compensi sono righe spuntabili, in cassa si sa **anche
     per quale dei due lavori** sono usciti: lo dice la riga, non il bonifico.
     Senza righe materializzate resta il ripiego di prima — il totale dei
     movimenti `finanziamento`, che non si può spaccare in due. */
  const hasLines = (i.payouts ?? []).some(x => x.paidPartners != null || x.paidSales != null)
  const payouts: MacroRow[] = i.basis === 'competenza'
    ? [
        rowOf('erogato', 'Erogato ai soci', 'uscita', payCells(x => x.partners),
          'Maturato dal piano compensi: matura in questo mese ed esce nel prossimo'),
        rowOf('provvigioni', 'Provvigioni commerciali', 'uscita', payCells(x => x.sales),
          'Maturate sul lavoro consegnato, anche se il cliente non ha ancora pagato'),
      ].filter(r => r.total !== 0)
    : hasLines
      ? [
          rowOf('erogato', 'Erogato ai soci', 'uscita', payCells(x => x.paidPartners ?? 0),
            'Spuntato pagato in questo mese: le retribuzioni di luglio si pagano ad agosto'),
          rowOf('provvigioni', 'Provvigioni commerciali', 'uscita', payCells(x => x.paidSales ?? 0),
            'Spuntate pagate in questo mese'),
        ].filter(r => r.total !== 0)
      /* Senza righe la banca dice **quanto** è uscito, non per quale dei due
         lavori: a un socio che è anche commerciale si bonifica una volta sola. */
      : [rowOf('erogato', 'Compensi erogati', 'uscita', payCells(x => x.paidOut),
          'Dai movimenti della banca: un bonifico non dice se paga la quota o la provvigione')]
        .filter(r => r.total !== 0)

  const payTot = rowOf('tot-compensi', 'Totale compensi', 'calcolo', totalCells(payouts))
  const left = rowOf('resta', 'Resta alla società', 'calcolo', months.map((m, k) => ({
    month: m,
    value: r2(margin.cells[k].value - payTot.cells[k].value),
    count: margin.cells[k].count,
  })))

  /* La quota si legge sul totale che esce, compensi compresi: sono soldi che
     dal conto escono come tutti gli altri, e tenerli fuori dal denominatore
     farebbe sembrare il personale più pesante di quanto è. */
  const outAll = r2(costTot.total + payTot.total)
  for (const r of revenue) r.share = revTot.total > 0 ? r2(r.total / revTot.total) : 0
  for (const r of costs) r.share = outAll > 0 ? r2(r.total / outAll) : 0
  for (const r of payouts) r.share = outAll > 0 ? r2(r.total / outAll) : 0

  // ── e in banca ────────────────────────────────────────────────────────────
  /* Solo i movimenti veri: un `derivato` nasce da una spunta, e usarlo qui
     farebbe confermare a un'affermazione se stessa (§189). */
  const real = i.txs.filter(t => t.source === 'banca')
  let running = i.opening
  const bank: BankMonth[] = months.map(m => {
    const own = real.filter(t => monthOf(t.booked_on) === m)
    const inflow = sum(own.filter(t => t.amount > 0).map(t => t.amount))
    const outflow = Math.abs(sum(own.filter(t => t.amount < 0).map(t => t.amount)))
    running = r2(running + inflow - outflow)

    /* Il ponte fra netto e lordo, e non è una nota a piè di pagina: sono le
       righe **mosse in questo mese**, con la loro IVA. In competenza il
       confronto non si fa — la banca non conosce la competenza — e la riga
       resta a zero invece di mentire. */
    const movedRev = i.revenue.filter(l => l.paid
      && statusOf({ id: l.id, side: 'entrata', month: monthOf(l.month), amount: l.amount_net,
        paid: true, paid_on: l.paid_on ?? null, due_date: l.due_date ?? null,
        terms: l.terms ?? null, project_id: l.project_id ?? null }, i.today, ctx).cashMonth === m)
    const movedCost = i.costs.filter(c => c.paid
      && statusOf({ id: c.id, side: 'uscita', month: monthOf(c.month),
        amount: c.actual > 0 ? c.actual : c.budget, paid: true, paid_on: c.paid_on ?? null,
        due_date: c.due_date ?? null, terms: c.terms ?? null, category: c.category,
        project_id: c.project_id ?? null }, i.today, ctx).cashMonth === m)
    const vatIn = sum(movedRev.map(l => l.amount_net * l.vat_rate))
    const vatOut = sum(movedCost.map(c => (c.vat_applied ? (c.actual > 0 ? c.actual : c.budget) * c.vat_rate : 0)))
    const netIn = sum(movedRev.map(l => l.amount_net))
    const netOut = sum(movedCost.map(c => (c.actual > 0 ? c.actual : c.budget)))
    const sheet = r2(netIn + vatIn - netOut - vatOut)

    return {
      month: m, inflow, outflow, net: r2(inflow - outflow), balance: running,
      vatIn, vatOut, sheet, diff: r2(r2(inflow - outflow) - sheet),
    }
  })

  return {
    months, basis: i.basis, revenue, costs, payouts,
    totals: { revenue: revTot, costs: costTot, margin, payouts: payTot, left },
    bank,
    unexplained: sum(bank.map(b => b.diff)),
  }
}
