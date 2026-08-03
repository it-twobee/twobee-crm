/**
 * Piano compensi e conto economico mensile — calcoli puri, nessun I/O.
 *
 * Le percentuali si applicano sempre all'**imponibile** (IVA esclusa): l'IVA
 * transita e non è ricavo.
 *
 *   GROWTH   15% commerciale · 30% erogato (in parti uguali fra i soci)
 *            35% target costi · 10% fondo rischio · 10% residuo → cassa TwoBee
 *
 *   DIGITAL   6% commerciale · 28% ai soci (in parti uguali) · 10% cassa TwoBee
 *            35% target costi · 10% fondo rischio · 11% margine non distribuito
 *
 * Sul digital le quote sono **sull'imponibile, non sul residuo** (§185). Prima
 * erano una percentuale di quel che restava — il 30% del 49% a testa — e nessuno
 * sapeva dire a mente quanto prendeva su una fattura da 3.000 €. Adesso 28% e
 * 10% si leggono direttamente sulla riga, e l'11% che avanza è margine che resta
 * in cassa: dichiarato, non nascosto in un arrotondamento.
 *
 * Il commerciale del digital è quello **dell'anagrafica del cliente**: se il
 * cliente non ce l'ha, il 6% non resta in cassa — si divide fra i soci in parti
 * uguali, come sul growth.
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
  /** @deprecated §185: sul digital le quote si leggono sull'imponibile. Vale solo se `growth_residual_to_company` è false. */
  partner_share_pct: number
  /** @deprecated §185: sostituito da `digital_company_pct` sul digital. */
  company_share_pct: number
  /** §185 — DIGITAL: quota complessiva ai soci, in parti uguali fra loro */
  digital_partners_pct: number
  /** §185 — DIGITAL: quota destinata alle casse TwoBee */
  digital_company_pct: number
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
  digital_partners_pct: 0.28,
  digital_company_pct: 0.10,
}

/**
 * Dalla riga di `pl_config` alla configurazione del motore.
 *
 * Sta qui e non nelle pagine perché era scritta due volte — economics e scheda
 * cliente — e le due copie divergevano a ogni colonna nuova: la seconda si
 * dimenticava sempre. Le colonne assenti cadono sul default, così una migration
 * non ancora eseguita non azzera una quota (uno zero in una quota non si vede,
 * si legge come «non spetta niente»).
 */
export function rowToPlConfig(row: Record<string, unknown> | null | undefined): PlConfig {
  if (!row) return DEFAULT_PL_CONFIG
  const d = DEFAULT_PL_CONFIG
  const n = (v: unknown, fb: number) => {
    if (v == null) return fb
    const x = Number(v)
    return Number.isFinite(x) ? x : fb
  }
  return {
    growth_sales_pct: n(row.growth_sales_pct, d.growth_sales_pct),
    growth_delivery_pct: n(row.growth_delivery_pct, d.growth_delivery_pct),
    digital_sales_pct: n(row.digital_sales_pct, d.digital_sales_pct),
    digital_delivery_pct: n(row.digital_delivery_pct, d.digital_delivery_pct),
    cost_target_pct: n(row.cost_target_pct, d.cost_target_pct),
    risk_fund_pct: n(row.risk_fund_pct, d.risk_fund_pct),
    growth_residual_to_company: row.growth_residual_to_company == null
      ? d.growth_residual_to_company : row.growth_residual_to_company === true,
    partner_share_pct: n(row.partner_share_pct, d.partner_share_pct),
    company_share_pct: n(row.company_share_pct, d.company_share_pct),
    digital_partners_pct: n(row.digital_partners_pct, d.digital_partners_pct),
    digital_company_pct: n(row.digital_company_pct, d.digital_company_pct),
  }
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
  /**
   * §185 — il commerciale che il cliente ha in anagrafica, quando la riga non ne
   * porta uno suo. Serve a due cose: mostrare un nome invece di un trattino, e
   * sapere se la provvigione ha un destinatario o va divisa fra i soci. Può
   * essere qualcuno che non ha un account nel tool: un segnalatore, un partner.
   */
  client_sales_owner_id?: string | null
  client_sales_owner?: string | null
  /** da dove nasce la riga: contratto di progetto, MRR d'anagrafica, o scritta a mano */
  origin?: 'contratto' | 'anagrafica' | 'manuale'
  project_id?: string | null
  stream_id?: string | null
}

/**
 * Chi ha portato questo cliente, e da dove lo sappiamo.
 *
 * La riga del mese vince sull'anagrafica — è una fotografia, e un mese chiuso non
 * si riscrive perché qualcuno ha cambiato il commerciale in anagrafica dopo.
 * Ma quando la riga è vuota il nome in anagrafica c'è ed è quello vero: mostrare
 * un trattino al suo posto era una perdita di informazione, non una prudenza.
 */
export function ownerOf(l: RevenueLine): {
  id: string | null
  name: string | null
  source: 'riga' | 'anagrafica' | null
} {
  if (l.sales_owner_id || l.sales_owner) {
    return { id: l.sales_owner_id ?? null, name: l.sales_owner ?? null, source: 'riga' }
  }
  if (l.client_sales_owner_id || l.client_sales_owner) {
    return { id: l.client_sales_owner_id ?? null, name: l.client_sales_owner ?? null, source: 'anagrafica' }
  }
  return { id: null, name: null, source: null }
}

/** Nessuno ha portato questo cliente: la provvigione va divisa fra i soci. */
export const isInbound = (l: RevenueLine) =>
  l.sales_origin === 'inbound' || ownerOf(l).source === null

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

/**
 * Scomposizione di una singola riga di ricavo secondo il piano.
 *
 * Growth e digital non si dividono allo stesso modo, e non è un'incoerenza: sul
 * growth il lavoro lo fanno i soci e la quota è **erogato** (30% in parti
 * uguali); sul digital lo fa il team a stipendio, quindi ai soci va una quota di
 * **utile** — il 28% dell'imponibile — e il resto copre struttura e persone.
 */
export function splitLine(line: RevenueLine, c: PlConfig) {
  const base = line.amount_net
  const sales = r2(base * pct.sales(c, line.kind))
  const delivery = r2(base * pct.delivery(c, line.kind))
  const costTarget = r2(base * c.cost_target_pct)
  const riskFund = r2(base * c.risk_fund_pct)
  const residual = r2(base - sales - delivery - costTarget - riskFund)

  const digital = line.kind === 'digital'
  // §185: sul digital le due quote sono percentuali dell'imponibile, leggibili
  // sulla riga. Sul growth restano dov'erano: erogato e residuo.
  const partnersPool = digital ? r2(base * c.digital_partners_pct) : 0
  const companyQuota = digital ? r2(base * c.digital_company_pct) : 0
  /* Quello che avanza del residuo dopo soci e cassa: margine non distribuito.
     Sta in cassa come gli altri avanzi, ma si mostra a parte — un numero che
     nessuno sa spiegare è un numero di cui nessuno si fida. */
  const retained = digital ? r2(residual - partnersPool - companyQuota) : 0

  return {
    base,
    vat: r2(base * line.vat_rate),
    gross: r2(base * (1 + line.vat_rate)),
    sales, delivery, costTarget, riskFund, residual,
    /** il residuo growth può restare in cassa invece di dividersi fra i soci */
    residualToPartners: digital || c.growth_residual_to_company ? 0 : residual,
    partnersPool, companyQuota, retained,
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
  // §185 — le tre quote digital, lette sull'imponibile
  const digitalPartners = sum(x => x.s.partnersPool)
  const digitalCompany = sum(x => x.s.companyQuota)
  const digitalRetained = sum(x => x.s.retained)

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
  const distributed = r2(sales + delivery + residualToPartners + digitalPartners)
  const grossMargin = r2(accrued - costActual)
  const netMargin = r2(accrued - costActual - distributed)

  const eligible = partners.filter(p => p.takes_delivery || p.takes_residual)
  const deliveryTakers = partners.filter(p => p.takes_delivery)
  const residualTakers = partners.filter(p => p.takes_residual)

  /* Provvigione senza un commerciale — né sulla riga né in anagrafica — o da
     lead generation: non resta in cassa, si divide fra i soci in parti uguali.
     Sul growth il 15% diventa 5% a testa, sul digital il 6% diventa 2%.
     Si divide fra **tutti i soci**, non solo fra quelli che prendono l'erogato:
     una provvigione non è erogato, è utile commerciale. */
  const salesPool = r2(split.filter(x => isInbound(x.line)).reduce((n, x) => n + x.s.sales, 0))
  const poolShare = eligible.length ? r2(salesPool / eligible.length) : 0

  // §185: il 28% digital si divide fra i soci che prendono utile, in parti uguali
  const digitalTakers = residualTakers.length ? residualTakers : eligible
  const digitalShare = digitalTakers.length ? r2(digitalPartners / digitalTakers.length) : 0

  const perPartner = eligible.map(p => {
    const d = p.takes_delivery && deliveryTakers.length ? r2(delivery / deliveryTakers.length) : 0
    const q = p.takes_residual && residualTakers.length
      ? r2(residualToPartners * config.partner_share_pct)
      : 0
    const dg = digitalTakers.some(x => x.id === p.id) ? digitalShare : 0
    const sh = poolShare
    return { partner: p, delivery: d, residual: q, digital: dg, salesShare: sh, total: r2(d + q + dg + sh) }
  })

  /* Cassa TwoBee: la quota societaria più tutto ciò che i soci non prendono.
     Il pool digital dei soci va sottratto, altrimenti gli stessi 28% starebbero
     due volte — una nelle tasche dei soci e una in cassa. */
  const companyFromResidual = r2(residualToPartners * config.company_share_pct)
  const companyKeepsResidual = r2(residual - residualToPartners - digitalPartners)
  const company = r2(companyFromResidual + companyKeepsResidual + riskFund + costVariance)

  /* Le provvigioni per commerciale: il nome è quello della riga, o quello che il
     cliente ha in anagrafica. Chi non ha un account nel tool — un segnalatore, un
     partner — esiste solo lì, e senza questa lettura la sua provvigione finiva
     sotto «Assegnato». */
  const salesByOwner = new Map<string, { label: string; amount: number; fromRegistry: boolean }>()
  for (const { line, s } of split) {
    if (!s.sales || isInbound(line)) continue
    const o = ownerOf(line)
    const key = o.id ?? o.name ?? '—'
    const cur = salesByOwner.get(key)
    salesByOwner.set(key, {
      label: cur?.label ?? o.name ?? 'Assegnato',
      amount: r2((cur?.amount ?? 0) + s.sales),
      fromRegistry: (cur?.fromRegistry ?? false) || o.source === 'anagrafica',
    })
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
    plan: {
      sales, delivery, riskFund, residual, residualToPartners, distributed, salesPool, poolShare,
      digitalPartners, digitalCompany, digitalRetained, digitalShare,
    },
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
