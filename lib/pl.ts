/**
 * Piano compensi e conto economico mensile — calcoli puri, nessun I/O.
 *
 * Le percentuali si applicano sempre all'**imponibile** (IVA esclusa): l'IVA
 * transita e non è ricavo.
 *
 *   GROWTH   15% commerciale · 30% erogato (in parti uguali fra i soci)
 *            35% target costi · 10% fondo rischio · 10% residuo → cassa TwoBee
 *
 *   DIGITAL   6% commerciale · niente erogato
 *            35% target costi · 10% fondo rischio · 49% residuo → soci + cassa
 *
 * Il 35% è un *target*, non una quota: il compenso distribuito resta quello
 * teorico anche quando i costi reali sono più bassi. Lo scarto fra target e
 * costi effettivi non cambia le quote, va in cassa TwoBee e si legge come
 * indicatore di efficienza del mese.
 */

export type PlKind = 'growth' | 'digital'

export type PlConfig = {
  growth_sales_pct: number
  growth_delivery_pct: number
  digital_sales_pct: number
  digital_delivery_pct: number
  cost_target_pct: number
  risk_fund_pct: number
  /** true = il residuo growth non si divide fra i soci, resta in cassa */
  growth_residual_to_company: boolean
  partner_share_pct: number
  company_share_pct: number
}

export const DEFAULT_PL_CONFIG: PlConfig = {
  growth_sales_pct: 0.15,
  growth_delivery_pct: 0.30,
  digital_sales_pct: 0.06,
  digital_delivery_pct: 0,
  cost_target_pct: 0.35,
  risk_fund_pct: 0.10,
  growth_residual_to_company: true,
  partner_share_pct: 0.30,
  company_share_pct: 0.10,
}

/** IVA ordinaria: il default della colonna, ripetuto qui perché le righe si
 *  inseriscono in blocco e ogni riga deve portarsi il valore per intero. */
export const DEFAULT_VAT_RATE = 0.22

export type RevenueLine = {
  id: string
  label: string
  client_id: string | null
  plan_amount: number
  invoices: number
  amount_net: number
  vat_rate: number
  invoice_sent: boolean
  paid: boolean
  kind: PlKind
  sales_owner_id: string | null
  sales_owner: string | null
  /**
   * 'inbound' = il cliente è arrivato dalla lead generation, non l'ha portato
   * nessuno. La provvigione non sparisce: si divide fra i soci in parti uguali.
   * Una riga senza commerciale è trattata come inbound comunque.
   */
  sales_origin?: 'diretto' | 'inbound' | null
  /** da dove nasce la riga: contratto di progetto, MRR d'anagrafica, o scritta a mano */
  origin?: 'contratto' | 'anagrafica' | 'manuale'
  project_id?: string | null
  stream_id?: string | null
}

/** Nessuno ha portato questo cliente: la provvigione va divisa. */
export const isInbound = (l: RevenueLine) =>
  l.sales_origin === 'inbound' || (!l.sales_owner_id && !l.sales_owner)

export type CostLine = {
  id: string
  /** §171: area su cui pesa la spesa — è il budget da cui esce */
  center_id?: string | null
  category: string
  label: string
  cost_type: 'F' | 'V'
  budget: number
  actual: number
  paid: boolean
  vat_applied: boolean
  vat_rate: number
}

export type Partner = { id: string; label: string; takes_delivery: boolean; takes_residual: boolean }

const r2 = (n: number) => Math.round(n * 100) / 100

export const pct = {
  sales: (c: PlConfig, k: PlKind) => (k === 'growth' ? c.growth_sales_pct : c.digital_sales_pct),
  delivery: (c: PlConfig, k: PlKind) => (k === 'growth' ? c.growth_delivery_pct : c.digital_delivery_pct),
  /** quanto resta dopo commerciale, erogato, target costi e fondo rischio */
  residual: (c: PlConfig, k: PlKind) =>
    1 - pct.sales(c, k) - pct.delivery(c, k) - c.cost_target_pct - c.risk_fund_pct,
}

/** Scomposizione di una singola riga di ricavo secondo il piano. */
export function splitLine(line: RevenueLine, c: PlConfig) {
  const base = line.amount_net
  const sales = r2(base * pct.sales(c, line.kind))
  const delivery = r2(base * pct.delivery(c, line.kind))
  const costTarget = r2(base * c.cost_target_pct)
  const riskFund = r2(base * c.risk_fund_pct)
  const residual = r2(base - sales - delivery - costTarget - riskFund)
  return {
    base,
    vat: r2(base * line.vat_rate),
    gross: r2(base * (1 + line.vat_rate)),
    sales, delivery, costTarget, riskFund, residual,
    /** il residuo growth può restare in cassa invece di dividersi fra i soci */
    residualToPartners: line.kind === 'growth' && c.growth_residual_to_company ? 0 : residual,
  }
}

export type PlTotals = ReturnType<typeof computeMonth>

/**
 * Conto economico del mese.
 *
 * `incassato` conta solo le righe pagate: è la cassa. `maturato` conta tutto
 * ciò che è stato fatturabile nel mese, ed è la base del piano compensi —
 * altrimenti un cliente che paga in ritardo azzererebbe il compenso di chi ha
 * già lavorato.
 */
export function computeMonth(
  revenue: RevenueLine[],
  costs: CostLine[],
  config: PlConfig,
  partners: Partner[],
) {
  const accrued = r2(revenue.reduce((s, l) => s + l.amount_net, 0))
  const collected = r2(revenue.filter(l => l.paid).reduce((s, l) => s + l.amount_net, 0))
  const invoiced = r2(revenue.filter(l => l.invoice_sent).reduce((s, l) => s + l.amount_net, 0))
  const vat = r2(revenue.reduce((s, l) => s + l.amount_net * l.vat_rate, 0))
  const planned = r2(revenue.reduce((s, l) => s + l.plan_amount * l.invoices, 0))

  const byKind = (k: PlKind) => r2(revenue.filter(l => l.kind === k).reduce((s, l) => s + l.amount_net, 0))

  const split = revenue.map(l => ({ line: l, s: splitLine(l, config) }))
  const sum = (f: (x: (typeof split)[number]) => number) => r2(split.reduce((s, x) => s + f(x), 0))

  const sales = sum(x => x.s.sales)
  const delivery = sum(x => x.s.delivery)
  const costTarget = sum(x => x.s.costTarget)
  const riskFund = sum(x => x.s.riskFund)
  const residual = sum(x => x.s.residual)
  const residualToPartners = sum(x => x.s.residualToPartners)

  // costi: il budget è il preventivato, actual è quanto è davvero uscito
  const costBudget = r2(costs.reduce((s, c) => s + c.budget, 0))
  const costActual = r2(costs.reduce((s, c) => s + c.actual, 0))
  const costPaid = r2(costs.filter(c => c.paid).reduce((s, c) => s + c.actual, 0))
  const costActualGross = r2(costs.reduce((s, c) => s + c.actual * (c.vat_applied ? 1 + c.vat_rate : 1), 0))
  const costFixed = r2(costs.filter(c => c.cost_type === 'F').reduce((s, c) => s + c.actual, 0))
  const costVariable = r2(costs.filter(c => c.cost_type === 'V').reduce((s, c) => s + c.actual, 0))

  // Positivo = si è speso meno del target. Non cambia le quote: va in cassa.
  const costVariance = r2(costTarget - costActual)
  const costRatio = accrued > 0 ? costActual / accrued : 0

  // margine reale del mese: entrate maturate meno costi effettivi e compensi usciti
  const distributed = r2(sales + delivery + residualToPartners)
  const grossMargin = r2(accrued - costActual)
  const netMargin = r2(accrued - costActual - distributed)

  const eligible = partners.filter(p => p.takes_delivery || p.takes_residual)
  const deliveryTakers = partners.filter(p => p.takes_delivery)
  const residualTakers = partners.filter(p => p.takes_residual)

  // Provvigione senza un commerciale (o da lead generation): non resta in cassa,
  // si divide fra i soci in parti uguali. Sul growth il 15% diventa 5% a testa.
  const salesPool = r2(split.filter(x => isInbound(x.line)).reduce((n, x) => n + x.s.sales, 0))
  const poolShare = deliveryTakers.length ? r2(salesPool / deliveryTakers.length) : 0

  const perPartner = eligible.map(p => {
    const d = p.takes_delivery && deliveryTakers.length ? r2(delivery / deliveryTakers.length) : 0
    const q = p.takes_residual && residualTakers.length
      ? r2(residualToPartners * config.partner_share_pct)
      : 0
    const sh = p.takes_delivery ? poolShare : 0
    return { partner: p, delivery: d, residual: q, salesShare: sh, total: r2(d + q + sh) }
  })

  // quota societaria del residuo + tutto ciò che i soci non prendono
  const companyFromResidual = r2(residualToPartners * config.company_share_pct)
  const companyKeepsResidual = r2(residual - residualToPartners)
  const company = r2(companyFromResidual + companyKeepsResidual + riskFund + costVariance)

  const salesByOwner = new Map<string, { label: string; amount: number }>()
  for (const { line, s } of split) {
    if (!s.sales || isInbound(line)) continue
    const key = line.sales_owner_id ?? line.sales_owner ?? '—'
    const label = line.sales_owner ?? 'Assegnato'
    const cur = salesByOwner.get(key)
    salesByOwner.set(key, { label: cur?.label ?? label, amount: r2((cur?.amount ?? 0) + s.sales) })
  }

  return {
    revenue: {
      planned, accrued, invoiced, collected, vat,
      grossWithVat: r2(accrued + vat),
      growth: byKind('growth'), digital: byKind('digital'),
      unpaid: r2(accrued - collected),
    },
    costs: {
      budget: costBudget, actual: costActual, paid: costPaid, gross: costActualGross,
      fixed: costFixed, variable: costVariable,
      target: costTarget, variance: costVariance, ratio: costRatio,
    },
    plan: { sales, delivery, riskFund, residual, residualToPartners, distributed, salesPool, poolShare },
    margin: { gross: grossMargin, net: netMargin, company },
    perPartner,
    salesByOwner: Array.from(salesByOwner.values()).sort((a, b) => b.amount - a.amount),
    lines: split,
  }
}

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

/** '2026-05-01' → 'Maggio 2026' */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return `${MONTHS[(m ?? 1) - 1]} ${y}`
}

/** Primo del mese, in locale: `new Date(iso)` slitterebbe di un giorno per fuso. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function shiftMonth(iso: string, delta: number): string {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(y, (m ?? 1) - 1 + delta, 1)
  return monthKey(d)
}

/** Un cliente `growth_digital` pesa sul piano growth: è lì che sta l'erogato. */
export function kindFromClientType(t: string | null | undefined): PlKind {
  return t === 'digital' ? 'digital' : 'growth'
}

// ── Periodo: più mesi letti insieme ─────────────────────────────────────────

export type MonthResult = { month: string; t: PlTotals }

/**
 * Aggrega N mesi. I totali si sommano, le incidenze si ricalcolano sul totale
 * di periodo — non si fa la media delle percentuali, che darebbe lo stesso peso
 * a un mese da 30.000 € e a uno da 3.000 €.
 */
export function aggregatePeriod(months: MonthResult[]) {
  const s = (f: (t: PlTotals) => number) => Math.round(months.reduce((n, m) => n + f(m.t), 0) * 100) / 100

  const accrued = s(t => t.revenue.accrued)
  const costActual = s(t => t.costs.actual)
  const costTarget = s(t => t.costs.target)

  const partners = new Map<string, { label: string; delivery: number; residual: number; total: number }>()
  for (const m of months) {
    for (const p of m.t.perPartner) {
      const cur = partners.get(p.partner.id) ?? { label: p.partner.label, delivery: 0, residual: 0, total: 0 }
      partners.set(p.partner.id, {
        label: cur.label,
        delivery: Math.round((cur.delivery + p.delivery) * 100) / 100,
        residual: Math.round((cur.residual + p.residual) * 100) / 100,
        total: Math.round((cur.total + p.total) * 100) / 100,
      })
    }
  }

  const sales = new Map<string, number>()
  for (const m of months) {
    for (const o of m.t.salesByOwner) sales.set(o.label, Math.round(((sales.get(o.label) ?? 0) + o.amount) * 100) / 100)
  }

  const withRevenue = months.filter(m => m.t.revenue.accrued > 0).length

  return {
    months: months.length,
    revenue: {
      accrued, collected: s(t => t.revenue.collected), unpaid: s(t => t.revenue.unpaid),
      growth: s(t => t.revenue.growth), digital: s(t => t.revenue.digital),
      /** media sui soli mesi con ricavo: includere i vuoti falserebbe la media */
      avg: withRevenue ? Math.round((accrued / withRevenue) * 100) / 100 : 0,
    },
    costs: {
      actual: costActual, budget: s(t => t.costs.budget), target: costTarget,
      variance: Math.round((costTarget - costActual) * 100) / 100,
      ratio: accrued > 0 ? costActual / accrued : 0,
    },
    plan: {
      sales: s(t => t.plan.sales), delivery: s(t => t.plan.delivery),
      riskFund: s(t => t.plan.riskFund), residualToPartners: s(t => t.plan.residualToPartners),
    },
    margin: { gross: Math.round((accrued - costActual) * 100) / 100, company: s(t => t.margin.company) },
    perPartner: Array.from(partners.values()).sort((a, b) => b.total - a.total),
    salesByOwner: Array.from(sales, ([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount),
  }
}

/** Classifica per chiave, con quota sul totale: serve ai top client e al tagging costi. */
export function rank<T>(rows: T[], key: (r: T) => string, value: (r: T) => number, limit = 0) {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = key(r)
    m.set(k, Math.round(((m.get(k) ?? 0) + value(r)) * 100) / 100)
  }
  const total = Array.from(m.values()).reduce((a, b) => a + b, 0)
  const out = Array.from(m, ([label, amount]) => ({
    label, amount, share: total > 0 ? amount / total : 0,
  })).sort((a, b) => b.amount - a.amount)
  return limit ? out.slice(0, limit) : out
}
