/**
 * Piano compensi e conto economico mensile — calcoli puri, nessun I/O.
 *
 * Le percentuali si applicano sempre all'**imponibile** (IVA esclusa): l'IVA
 * transita e non è ricavo.
 *
 *   GROWTH   15% commerciale · 30% erogato (in parti uguali fra i soci)
 *            35% target costi · 10% fondo rischio · 10% residuo → cassa TwoBee
 *
 *   DIGITAL   sul MARGINE (ricavo meno i subappalti del progetto):
 *            6% commerciale · 28% a Marco · 28% a Toto · 28% a Walter · 10% cassa
 *            = 100% del margine, distribuito per intero
 *
 *            Opzione oltre i 20.000 € di progetto: l'admin può destinare il 9%
 *            al fondo rischio, togliendo 3 punti a ciascun socio (28 → 25).
 *
 * Le due differenze col growth (§186) non sono incoerenze, sono due lavori
 * diversi. Sul growth la quota dei soci è **erogato**: il lavoro lo fanno loro,
 * e si calcola sull'imponibile perché il costo di delivery è il loro tempo. Sul
 * digital il lavoro è **affidato fuori**: il ricavo lordo non è distribuibile —
 * prima si paga il subappaltatore, poi si divide quello che resta. Distribuire
 * l'imponibile su un progetto affidato al 50% significherebbe promettere soldi
 * che sono già di qualcun altro.
 *
 * Conseguenza da tenere presente: il margine digital è distribuito per intero,
 * quindi **il digital non contribuisce al 35% di target costi né al fondo
 * rischio ordinario**. Struttura e personale li copre il growth. In un mese a
 * prevalenza digital la cassa TwoBee risulta negativa, e il tool la mostra
 * negativa: è la verità del piano, non un errore di calcolo.
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
  /** §186 — DIGITAL: quota del margine **a ciascun socio** (non complessiva) */
  digital_partner_pct: number
  /** §185 — DIGITAL: quota del margine destinata alle casse TwoBee */
  digital_company_pct: number
  /**
   * §186 — Fondo rischio digital: opzionale, e la scelta è dell'admin riga per
   * riga. Non è automatico perché su un progetto grosso può convenire tenere il
   * margine liquido, e quella decisione la prende una persona.
   */
  digital_risk_fund_pct: number
  /** punti percentuali tolti a ciascun socio quando il fondo rischio è attivo */
  digital_risk_cut_pct: number
  /** valore del progetto oltre il quale l'opzione si può attivare */
  digital_risk_threshold: number
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
  digital_partner_pct: 0.28,
  digital_company_pct: 0.10,
  digital_risk_fund_pct: 0.09,
  digital_risk_cut_pct: 0.03,
  digital_risk_threshold: 20000,
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
    digital_partner_pct: n(row.digital_partner_pct, d.digital_partner_pct),
    digital_company_pct: n(row.digital_company_pct, d.digital_company_pct),
    digital_risk_fund_pct: n(row.digital_risk_fund_pct, d.digital_risk_fund_pct),
    digital_risk_cut_pct: n(row.digital_risk_cut_pct, d.digital_risk_cut_pct),
    digital_risk_threshold: n(row.digital_risk_threshold, d.digital_risk_threshold),
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
  /**
   * §186 — valore venduto del progetto: somma dei contratti non in bozza. Decide
   * se l'opzione del fondo rischio è disponibile, e si guarda il **progetto**, non
   * la rata: un lavoro da 24.000 € pagato in sei rate da 4.000 resta un lavoro da
   * 24.000.
   */
  project_value?: number | null
  /** §186 — l'admin ha scelto di destinare il 9% al fondo rischio su questa riga */
  risk_fund?: boolean
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
  /** §173: se c'è, è un subappalto di quel progetto — e §186 lo toglie dal margine */
  project_id?: string | null
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
const nonNeg = (n: number) => (n > 0 ? n : 0)

export const pct = {
  sales: (c: PlConfig, k: PlKind) => (k === 'growth' ? c.growth_sales_pct : c.digital_sales_pct),
  delivery: (c: PlConfig, k: PlKind) => (k === 'growth' ? c.growth_delivery_pct : c.digital_delivery_pct),
  /**
   * Quanto resta dopo commerciale, erogato, target costi e fondo rischio.
   * Solo growth: sul digital (§186) il margine si distribuisce per intero e un
   * «residuo» non esiste — restituire un 49% che non esiste era peggio di zero.
   */
  residual: (c: PlConfig, k: PlKind) =>
    k === 'digital' ? 0
      : 1 - pct.sales(c, k) - pct.delivery(c, k) - c.cost_target_pct - c.risk_fund_pct,
  /** DIGITAL: quanto del margine va ai soci in tutto, dato il numero di soci */
  digitalPartners: (c: PlConfig, partners: number, riskOn = false) =>
    (riskOn ? c.digital_partner_pct - c.digital_risk_cut_pct : c.digital_partner_pct) * partners,
}

/**
 * Scomposizione di una singola riga di ricavo secondo il piano.
 *
 * Growth e digital non si dividono allo stesso modo, e non è un'incoerenza: sul
 * growth il lavoro lo fanno i soci e la quota è **erogato** (30% in parti
 * uguali); sul digital lo fa il team a stipendio, quindi ai soci va una quota di
 * **utile** — il 28% dell'imponibile — e il resto copre struttura e persone.
 */
export type SplitOpts = {
  /** §186 — subappalti del progetto attribuiti a questa riga: escono dal margine */
  external?: number
  /** quanti soci si dividono la quota digital: serve a sapere se le quote tornano */
  partners?: number
}

export function splitLine(line: RevenueLine, c: PlConfig, opts: SplitOpts = {}) {
  const base = line.amount_net
  const vat = r2(base * line.vat_rate)
  const gross = r2(base * (1 + line.vat_rate))

  if (line.kind === 'digital') {
    /* §186 — la base del digital è il MARGINE: il subappaltatore si paga prima,
       e quello che resta si divide per intero. Se il costo esterno supera il
       ricavo del mese il margine è zero, non negativo: una quota negativa non
       vuol dire niente, e la perdita si legge nel margine di progetto. */
    const external = Math.min(nonNeg(opts.external ?? 0), base)
    const margin = r2(nonNeg(base - external))
    const partners = Math.max(0, opts.partners ?? 0)

    const riskOn = riskFundActive(line, c)
    // il fondo rischio non è gratis: i suoi 9 punti escono dalle quote dei soci
    const partnerPct = riskOn ? c.digital_partner_pct - c.digital_risk_cut_pct : c.digital_partner_pct
    const partnerQuota = r2(margin * partnerPct)
    const partnersPool = r2(partnerQuota * partners)
    const sales = r2(margin * c.digital_sales_pct)
    const companyQuota = r2(margin * c.digital_company_pct)
    const riskFund = riskOn ? r2(margin * c.digital_risk_fund_pct) : 0
    /* Con tre soci al 28% le quote fanno esattamente il margine e questo è zero.
       Se i soci diventano due o quattro non torna più, e il numero lo dice
       invece di riscalare le quote di nascosto. */
    const retained = r2(margin - sales - partnersPool - companyQuota - riskFund)

    return {
      base, vat, gross,
      /** quanto va al subappaltatore: non è distribuibile, è già di qualcun altro */
      external, margin,
      sales, delivery: 0, costTarget: 0, riskFund,
      /* Nessun «residuo» sul digital: il margine è distribuito per intero, e
         quello che avanza ha un nome — `retained`, e con tre soci è zero. */
      residual: 0, residualToPartners: 0,
      partnerQuota, partnersPool, companyQuota, retained,
      riskOn, riskEligible: riskFundEligible(line, c),
    }
  }

  // ── growth: quote sull'imponibile, il lavoro lo fanno i soci ───────────────
  const sales = r2(base * c.growth_sales_pct)
  const delivery = r2(base * c.growth_delivery_pct)
  const costTarget = r2(base * c.cost_target_pct)
  const riskFund = r2(base * c.risk_fund_pct)
  const residual = r2(base - sales - delivery - costTarget - riskFund)

  return {
    base, vat, gross,
    external: 0, margin: base,
    sales, delivery, costTarget, riskFund, residual,
    /** il residuo growth può restare in cassa invece di dividersi fra i soci */
    residualToPartners: c.growth_residual_to_company ? 0 : residual,
    partnerQuota: 0, partnersPool: 0, companyQuota: 0, retained: 0,
    riskOn: false, riskEligible: false,
  }
}

/** Sopra questa soglia di progetto l'opzione fondo rischio si può attivare. */
export const riskFundEligible = (line: RevenueLine, c: PlConfig) =>
  line.kind === 'digital' && (line.project_value ?? line.amount_net) >= c.digital_risk_threshold

/** Attivo solo se l'admin l'ha scelto **e** il progetto supera la soglia. */
export const riskFundActive = (line: RevenueLine, c: PlConfig) =>
  !!line.risk_fund && riskFundEligible(line, c)

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

  /* §186 — i subappalti del mese, per progetto: sono il costo che esce dal
     margine digital prima di dividerlo. Vale quello che è stato registrato;
     finché non lo è, quello che il piano prevede — altrimenti si distribuirebbe
     un margine che il subappaltatore si porterà via il mese prossimo. */
  const externalByProject = new Map<string, number>()
  for (const c of costs) {
    if (!c.project_id) continue
    const amount = c.actual > 0 ? c.actual : c.budget
    externalByProject.set(c.project_id, r2((externalByProject.get(c.project_id) ?? 0) + amount))
  }

  /* Un progetto può avere più righe di ricavo nello stesso mese (una rata e un
     canone): il costo esterno si spalma fra loro in proporzione all'imponibile,
     altrimenti la prima riga si mangerebbe tutto il subappalto. */
  const digitalByProject = new Map<string, number>()
  for (const l of revenue) {
    if (l.kind !== 'digital' || !l.project_id) continue
    digitalByProject.set(l.project_id, r2((digitalByProject.get(l.project_id) ?? 0) + l.amount_net))
  }

  const partnerCount = partners.filter(p => p.takes_delivery || p.takes_residual).length

  const split = revenue.map(l => {
    const projectTotal = l.project_id ? digitalByProject.get(l.project_id) ?? 0 : 0
    const external = l.kind === 'digital' && l.project_id && projectTotal > 0
      ? r2((externalByProject.get(l.project_id) ?? 0) * (l.amount_net / projectTotal))
      : 0
    return { line: l, s: splitLine(l, config, { external, partners: partnerCount }) }
  })
  const sum = (f: (x: (typeof split)[number]) => number) => r2(split.reduce((s, x) => s + f(x), 0))

  const sales = sum(x => x.s.sales)
  const delivery = sum(x => x.s.delivery)
  const costTarget = sum(x => x.s.costTarget)
  const riskFund = sum(x => x.s.riskFund)
  const residual = sum(x => x.s.residual)
  const residualToPartners = sum(x => x.s.residualToPartners)
  // §186 — le quote digital, lette sul margine dopo i subappalti
  const digitalMargin = r2(split.filter(x => x.line.kind === 'digital').reduce((n, x) => n + x.s.margin, 0))
  const digitalExternal = r2(split.reduce((n, x) => n + x.s.external, 0))
  const digitalPartners = sum(x => x.s.partnersPool)
  const digitalPerPartner = sum(x => x.s.partnerQuota)
  const digitalCompany = sum(x => x.s.companyQuota)
  const digitalRetained = sum(x => x.s.retained)
  const digitalRiskFund = r2(split.filter(x => x.s.riskOn).reduce((n, x) => n + x.s.riskFund, 0))

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

  /* §186: la quota digital è **a socio**, non da spartire: ciascuno prende il 28%
     del margine (25% se il fondo rischio è attivo su quella riga). Con tre soci
     fa l'84% del margine, ed è così che il piano è stato deciso. */
  const digitalShare = digitalPerPartner

  const perPartner = eligible.map(p => {
    const d = p.takes_delivery && deliveryTakers.length ? r2(delivery / deliveryTakers.length) : 0
    const q = p.takes_residual && residualTakers.length
      ? r2(residualToPartners * config.partner_share_pct)
      : 0
    const dg = digitalShare
    const sh = poolShare
    return { partner: p, delivery: d, residual: q, digital: dg, salesShare: sh, total: r2(d + q + dg + sh) }
  })

  /* Cassa TwoBee, un pezzo per volta e ognuno una volta sola:
       · la quota societaria del residuo growth, quando i soci lo dividono
       · il residuo growth che i soci non dividono
       · la quota digital dichiarata (10% del margine)
       · quello che avanza delle quote digital (zero con tre soci al 28%)
       · il fondo rischio, growth ordinario più quello digital opzionale
       · lo scostamento fra target costi e costi effettivi
     La quota dei soci non c'entra: quella esce. */
  const companyFromResidual = r2(residualToPartners * config.company_share_pct)
  const companyKeepsResidual = r2(residual - residualToPartners)
  const company = r2(companyFromResidual + companyKeepsResidual
    + digitalCompany + digitalRetained + riskFund + costVariance)

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
      digitalMargin, digitalExternal, digitalPartners, digitalPerPartner,
      digitalCompany, digitalRetained, digitalRiskFund, digitalShare,
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
