/**
 * Il prospetto di un mese, caricato una volta sola. (§268)
 *
 * Lo leggono in due: la pagina e il **report per il board** (`/api/prospetto`).
 * Erano due assemblaggi diversi degli stessi numeri, ed è il modo in cui una
 * riunione si apre con due fogli che non tornano — quello a schermo e quello
 * stampato. Qui la composizione è una: chi ne aggiunge un terzo chiama questa.
 *
 * Non contiene regole: le regole stanno nei motori (`cash-plan`, `pl`,
 * `cash-calendar`, `vat`). Qui c'è solo il lavoro di andare a prendere le righe
 * e darle in pasto nell'ordine giusto.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  shiftMonth, computeMonth, rowToPlConfig,
  type PlConfig, type RevenueLine, type CostLine, type Partner,
} from '@/lib/pl'
import { collectionIndex, fromRevenue, fromCost, dueOf, monthOf } from '@/lib/cash-calendar'
import {
  linesForMonth, coveredProjects, type Coverage, type Installment, type RevenueStream,
} from '@/lib/revenue'
import { plannedForMonth, isPayrollCenter, type CostItem } from '@/lib/costs'
import { vatByQuarter, type MonthVat, type VatActual } from '@/lib/vat'
import { planMonth, type PlanMonth } from '@/lib/cash-plan'

export type ProspettoData = {
  setupNeeded: boolean
  months: { month: string; status: string }[]
  revenue: (RevenueLine & { month: string })[]
  costs: (CostLine & { month: string })[]
  txs: { booked_on: string; amount: number; source: string; kind: string }[]
  payouts: {
    month: string; partners: number; sales: number
    paidPartners: number; paidSales: number; paidOut: number
  }[]
  opening: number
  bankReady: boolean
  collection: [string, string][]
  first: string
  plan: PlanMonth[]
  vatHeld: number
  vatLabel: string
  vatDeadline: string | null
  bank: { inflow: number; outflow: number; balance: number } | null
  horizon: string[]
  config: PlConfig
  partners: Partner[]
  status: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadProspetto(
  supabase: SupabaseClient<any, any, any>,
  month: string,
  today: string,
): Promise<ProspettoData> {
  /* §282 — **una sola andata e ritorno.** Erano tre onde in fila: i mesi, poi
     dodici query che filtravano sui loro id, poi le rate che filtravano sugli
     accordi. Ma le righe si prendono comunque tutte — `in(month_id, ids)` con
     tutti i mesi non toglie niente — e le rate sono sedici: la dipendenza era
     solo apparente, e costava due giri di rete su ogni caricamento (982 ms a
     freddo). Adesso parte tutto insieme e si filtra in memoria. */
  const [
    { data: monthRows, error: setupErr },
    { data: revRows }, { data: costRows }, { data: accountRows }, { data: txRows, error: bankErr },
    { data: cfgRow }, { data: partnerRows }, { data: clientRows }, { data: payoutRows },
    { data: streamRows }, { data: coverRows }, { data: instRows }, { data: itemRows },
    { data: vatActualRows },
  ] = await Promise.all([
    supabase.from('pl_months').select('id, month, status').order('month'),
    supabase.from('pl_revenue_lines').select('*'),
    supabase.from('pl_cost_lines').select('*'),
    supabase.from('bank_accounts').select('id, opening_balance, is_active'),
    supabase.from('bank_transactions').select('booked_on, amount, source, kind').limit(5000),
    supabase.from('pl_config').select('*').eq('id', true).maybeSingle(),
    supabase.from('pl_partners').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('clients').select('id, display_name, company_name, sales_owner_name'),
    /* §243 — i compensi come righe spuntabili. Se la 207 non è stata eseguita
       la query fallisce, `payoutRows` resta vuoto e la cassa torna al ripiego
       di prima: il totale dei bonifici `finanziamento` del mese. */
    supabase.from('pl_payouts').select('*'),
    /* §262 — un mese mai aperto non ha righe: quello che succederà lo dicono
       il contratto e il piano dei costi, voce per voce. */
    supabase.from('revenue_streams').select('*'),
    /* §188 — quali progetti copre un accordo: serve al valore venduto e al
       margine digital, che toglie i subappalti di **tutti** quelli coperti. */
    supabase.from('revenue_stream_projects').select('stream_id, project_id'),
    supabase.from('revenue_installments').select('*'),
    supabase.from('cost_items').select('*').eq('is_active', true),
    supabase.from('vat_settlements').select('year, quarter, to_pay, doc_ref, paid_on'),
  ])
  const setupNeeded = setupErr?.code === '42P01' || setupErr?.code === 'PGRST205'
  if (setupNeeded) {
    return {
      setupNeeded: true, months: [], revenue: [], costs: [], txs: [], payouts: [],
      opening: 0, bankReady: false, collection: [], first: month, plan: [],
      vatHeld: 0, vatLabel: '', vatDeadline: null, bank: null, horizon: [month],
      config: rowToPlConfig({}), partners: [], status: null,
    }
  }

  const num = (v: unknown) => Number(v ?? 0)
  const r2 = (n: number) => Math.round(n * 100) / 100

  const monthOfId = new Map((monthRows ?? []).map((m: { id: string; month: string }) => [m.id, m.month.slice(0, 10)]))

  /* §186/§207 — il **valore venduto** del lavoro che una riga paga: decide se
     l'opzione del fondo rischio digital è disponibile, e si guarda il progetto e
     non la rata — un lavoro da 24.000 € pagato in sei rate da 4.000 resta un
     lavoro da 24.000. Senza questo campo nessuna riga risulta eleggibile, il
     fondo sparisce e ogni socio prende il 28% invece del 25%: sul luglio vero
     erano 4.340,78 € a testa invece di 4.045,94. */
  const projectValue = new Map<string, number>()
  for (const st of (streamRows ?? []) as { project_id: string | null; amount: unknown; status: string }[]) {
    if (!st.project_id || st.status === 'bozza') continue
    projectValue.set(st.project_id, num(projectValue.get(st.project_id)) + num(st.amount))
  }
  const coverage: Coverage = new Map()
  for (const r of (coverRows ?? []) as { stream_id: string; project_id: string }[]) {
    coverage.set(r.stream_id, [...(coverage.get(r.stream_id) ?? []), r.project_id])
  }
  const streamById = new Map((streamRows ?? []).map((s: Record<string, unknown>) => [String(s.id), s]))
  const projectsOfStream = (id: string | null): string[] => {
    const st = id ? streamById.get(id) : null
    return st ? coveredProjects(st as unknown as RevenueStream, coverage) : []
  }
  const soldValue = (ids: string[], fallback: string | null): number | null => {
    const from = ids.length ? ids : fallback ? [fallback] : []
    if (!from.length) return null
    const total = from.reduce((s2, p) => s2 + (projectValue.get(p) ?? 0), 0)
    return total > 0 ? total : null
  }

  const revenue = (revRows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id), label: String(r.label), client_id: (r.client_id as string) ?? null,
    plan_amount: num(r.plan_amount), invoices: num(r.invoices), amount_net: num(r.amount_net),
    vat_rate: num(r.vat_rate), invoice_sent: r.invoice_sent === true, paid: r.paid === true,
    kind: r.kind === 'digital' ? 'digital' : 'growth',
    sales_owner_id: (r.sales_owner_id as string) ?? null,
    sales_owner: (r.sales_owner as string) ?? null,
    project_id: (r.project_id as string) ?? null,
    // §207: i progetti dell'accordo, non solo quello scritto sulla riga
    project_ids: projectsOfStream((r.stream_id as string) ?? null),
    stream_id: (r.stream_id as string) ?? null,
    // §186: il valore venduto decide se l'opzione fondo rischio c'è
    project_value: soldValue(projectsOfStream((r.stream_id as string) ?? null),
      (r.project_id as string) ?? null),
    pass_through: r.pass_through === true, risk_fund: r.risk_fund === true,
    paid_on: (r.paid_on as string) ?? null, due_date: (r.due_date as string) ?? null,
    terms: (r.terms as string) ?? null,
    month: monthOfId.get(String(r.month_id)) ?? month,
  })) as (RevenueLine & { month: string })[]

  const costs = (costRows ?? []).map((c: Record<string, unknown>) => ({
    id: String(c.id), center_id: (c.center_id as string) ?? null,
    cost_item_id: (c.cost_item_id as string) ?? null,
    project_id: (c.project_id as string) ?? null,
    partner_id: (c.partner_id as string) ?? null,
    deductible_pct: c.deductible_pct == null ? 1 : num(c.deductible_pct),
    category: String(c.category ?? ''), label: String(c.label),
    cost_type: c.cost_type === 'V' ? 'V' : 'F',
    budget: num(c.budget), actual: num(c.actual), paid: c.paid === true,
    vat_applied: c.vat_applied === true, vat_rate: num(c.vat_rate),
    paid_on: (c.paid_on as string) ?? null, due_date: (c.due_date as string) ?? null,
    terms: (c.terms as string) ?? null,
    month: monthOfId.get(String(c.month_id)) ?? month,
  })) as (CostLine & { month: string })[]

  /* §189 — l'apertura conta tutti i conti, i movimenti solo quelli `banca`: il
     motore li filtra da sé, qui si passano tutti perché la pagina dichiara
     anche quanto è «dichiarato e non provato». */
  const opening = (accountRows ?? []).reduce((s: number, a: { opening_balance: unknown }) =>
    s + num(a.opening_balance), 0)

  /* Il subappalto si paga quando ha pagato il cliente: senza l'indice degli
     incassi la sua scadenza sarebbe la fine del mese, e in cassa cadrebbe nel
     mese sbagliato (§224). */
  const ctxIndex = collectionIndex(revenue.map(l => fromRevenue(l, l.month)))
  const ctx = { collection: ctxIndex }

  /* §240 — i compensi non sono righe: si ricalcolano dal piano, mese per mese,
     con lo stesso `computeMonth` del conto economico. Il maturato da lì, quello
     uscito davvero dai movimenti `finanziamento` della banca (§226). */
  const config = rowToPlConfig((cfgRow ?? {}) as Record<string, unknown>)
  const partners = (partnerRows ?? []).map((x: Record<string, unknown>) => ({
    id: String(x.id), label: String(x.label),
    takes_delivery: !!x.takes_delivery, takes_residual: !!x.takes_residual,
  })) as Partner[]
  const ownerOfClient = new Map((clientRows ?? []).map((c: Record<string, unknown>) =>
    [String(c.id), (c.sales_owner_name as string) ?? null]))
  const nameOfClient = new Map((clientRows ?? []).map((c: Record<string, unknown>) =>
    [String(c.id), String(c.display_name || c.company_name || '')]))
  const withOwner = revenue.map(l => ({
    ...l, client_sales_owner: l.client_id ? ownerOfClient.get(l.client_id) ?? null : null,
  }))
  const maturato = new Map((monthRows ?? []).map((m: { month: string }) => {
    const mm = m.month.slice(0, 10)
    const t = computeMonth(
      withOwner.filter(l => l.month === mm), costs.filter(c => c.month === mm), config, partners)
    return [mm, {
      partners: t.perPartner.map(x => ({ who: x.partner.label, amount: x.total })),
      sales: t.salesByOwner.map(x => ({ who: x.label, amount: x.amount })),
    }]
  }))

  const payouts = (monthRows ?? []).map((m: { month: string }) => {
    const mm = m.month.slice(0, 10)
    const mat = maturato.get(mm)!
    return {
      month: mm,
      partners: r2(mat.partners.reduce((s, x) => s + x.amount, 0)),
      sales: r2(mat.sales.reduce((s, x) => s + x.amount, 0)),
      /* §243 — spuntato pagato **in questo mese**: la retribuzione di luglio si
         paga ad agosto, e la spunta cade lì. La riga sa anche per quale dei due
         lavori, cosa che un bonifico non dice (§226). */
      paidPartners: (payoutRows ?? [])
        .filter((x: Record<string, unknown>) => x.paid === true && x.kind === 'socio'
          && String(x.paid_on ?? '').slice(0, 7) === mm.slice(0, 7))
        .reduce((s2: number, x: Record<string, unknown>) => s2 + num(x.amount), 0),
      paidSales: (payoutRows ?? [])
        .filter((x: Record<string, unknown>) => x.paid === true && x.kind === 'commerciale'
          && String(x.paid_on ?? '').slice(0, 7) === mm.slice(0, 7))
        .reduce((s2: number, x: Record<string, unknown>) => s2 + num(x.amount), 0),
      paidOut: Math.abs((txRows ?? [])
        .filter((x: Record<string, unknown>) => String(x.source) === 'banca'
          && String(x.kind) === 'finanziamento' && num(x.amount) < 0
          && String(x.booked_on).slice(0, 7) === mm.slice(0, 7))
        .reduce((s: number, x: Record<string, unknown>) => s + num(x.amount), 0)),
    }
  })

  // ── §262 · il piano di cassa ──────────────────────────────────────────────

  const statusOf = new Map((monthRows ?? []).map((m: { month: string; status: string }) =>
    [m.month.slice(0, 10), m.status]))
  const openMonths = new Set(Array.from(statusOf.keys()))

  /* L'IVA: si legge su tutto l'anno perché il credito di un trimestre si riporta
     su quello dopo, e dove il modello F24 è arrivato vince sulla stima (§242). */
  const vatMonths: MonthVat[] = Array.from(openMonths).sort().map(mm => ({
    month: mm,
    debit: revenue.filter(r => r.month === mm)
      .reduce((s, r) => s + r.amount_net * r.vat_rate, 0),
    credit: costs.filter(c => c.month === mm && c.vat_applied)
      .reduce((s, c) => s + c.actual * c.vat_rate, 0),
  }))
  const vatActuals: VatActual[] = (vatActualRows ?? []).map((r: Record<string, unknown>) => ({
    quarter: { year: Number(r.year), q: Number(r.quarter) as 1 | 2 | 3 | 4 },
    toPay: num(r.to_pay),
    docRef: (r.doc_ref as string) ?? null,
    paidOn: r.paid_on ? String(r.paid_on).slice(0, 10) : null,
  }))
  const quarters = vatByQuarter(vatMonths, today, vatActuals)
  const dues = quarters.filter(q => !q.closed && q.toPay > 0)
    .map(q => ({ date: q.deadline, amount: q.toPay, label: q.label }))
  const vatNow = quarters.find(q => !q.closed && q.toPay > 0) ?? null

  /* Il saldo **reale**: aperture più i soli movimenti dell'estratto conto. Un
     `derivato` nasce da una spunta e non è passato da nessuna banca (§189). */
  const realTx = (txRows ?? []).filter((t: Record<string, unknown>) => String(t.source) === 'banca')
  const balanceAt = (from: string) => r2(opening + realTx
    .filter((t: Record<string, unknown>) => String(t.booked_on).slice(0, 10) < from)
    .reduce((s: number, t: Record<string, unknown>) => s + num(t.amount), 0))
  /* §263 — il saldo **di adesso**: è il numero che si legge in Banca, e contiene
     anche i movimenti che nessuna riga giustifica. Il mese in corso parte da lì,
     non da un'apertura ricostruita dalle righe. */
  const balanceNow = r2(opening + realTx
    .reduce((s: number, t: Record<string, unknown>) => s + num(t.amount), 0))

  /* La catena parte dal mese in cui il saldo è **noto** — quello di oggi — e
     arriva al mese guardato: il saldo di ognuno è l'apertura del successivo, che
     è quello che rende la lista un previsionale e non un elenco. Un mese passato
     si legge da solo, col saldo che aveva a inizio mese. */
  const nowMonth = monthOf(today)
  const first = month <= nowMonth ? month : nowMonth
  const chainMonths: string[] = []
  for (let m2 = first; m2 <= month; m2 = shiftMonth(m2, 1)) chainMonths.push(m2)
  if (!chainMonths.length) chainMonths.push(month)
  /** In quale mese della catena cade una data: quello che è già passato è adesso. */
  const bucket = (iso: string) => {
    const m2 = monthOf(iso)
    return m2 < first ? first : m2
  }

  const cashLines = [
    ...revenue.map(l => ({
      id: l.id, side: 'entrata' as const, label: l.label,
      who: l.client_id ? nameOfClient.get(l.client_id) ?? null : null,
      gross: r2(l.amount_net * (1 + l.vat_rate)),
      due: dueOf(fromRevenue(l, l.month), ctx), month: l.month,
      paid: l.paid, paidOn: l.paid_on ?? null,
    })),
    ...costs.filter(c => c.actual > 0 || c.budget > 0).map(c => ({
      id: c.id, side: 'uscita' as const, label: c.label, who: c.category || null,
      gross: r2((c.actual > 0 ? c.actual : c.budget) * (c.vat_applied ? 1 + c.vat_rate : 1)),
      due: dueOf(fromCost(c, c.month), ctx), month: c.month,
      paid: c.paid, paidOn: c.paid_on ?? null,
      external: !!c.project_id, payroll: isPayrollCenter(c.category),
    })),
  ]

  /* §225 — il costo del lavoro di questo mese: è la stima per i mesi che nessuno
     ha ancora aperto, perché il piano dei costi non contiene l'area Personale. */
  const payrollNow = r2(costs.filter(c => c.month === nowMonth && isPayrollCenter(c.category))
    .reduce((s, c) => s + (c.actual > 0 ? c.actual : c.budget), 0))

  const streams = (streamRows ?? []) as unknown as RevenueStream[]
  const installments = (instRows ?? []) as unknown as Installment[]
  const items = ((itemRows ?? []) as unknown as CostItem[]).filter(i => i.is_active)

  /* Le righe che un mese **avrebbe** se lo si aprisse adesso: servono due volte,
     per le voci del piano di cassa e per sapere quanto matureranno i compensi.
     Non si scrivono da nessuna parte — è una lettura. */
  const plannedRev = (mm: string): RevenueLine[] =>
    linesForMonth(streams, installments, mm).map((l, k) => ({
      id: `${mm}:rev:${k}`, label: l.label, client_id: l.client_id,
      plan_amount: 0, invoices: 0, amount_net: l.amount_net, vat_rate: l.vat_rate,
      invoice_sent: false, paid: false, kind: l.kind,
      sales_owner_id: l.sales_owner_id, sales_owner: null,
      client_sales_owner: l.client_id ? ownerOfClient.get(l.client_id) ?? null : null,
      project_id: l.project_id, pass_through: l.pass_through, risk_fund: false,
    }))
  const plannedCost = (mm: string): CostLine[] =>
    plannedForMonth(items, mm).map((it, k) => ({
      id: `${mm}:cost:${k}`, center_id: it.center_id, cost_item_id: it.id,
      project_id: it.project_id ?? null, partner_id: null, deductible_pct: 1,
      category: it.category, label: it.label, cost_type: it.cost_type,
      budget: it.amount, actual: 0, paid: false,
      vat_applied: it.vat_applied, vat_rate: it.vat_rate,
    }))

  /* §227 — quanto matura un mese in compensi. Per un mese aperto lo dicono le
     righe; per uno mai aperto lo stesso motore sulle righe che il contratto e il
     piano producono — altrimenti dal primo mese non registrato in poi i compensi
     sparirebbero dal previsionale, e sono la seconda uscita del mese. */
  const maturatoOf = (mm: string) => maturato.get(mm)
    ?? (() => {
      const t = computeMonth(plannedRev(mm), plannedCost(mm), config, partners)
      return {
        partners: t.perPartner.map(x => ({ who: x.partner.label, amount: x.total })),
        sales: t.salesByOwner.map(x => ({ who: x.label, amount: x.amount })),
      }
    })()

  const plan: PlanMonth[] = chainMonths.map(mm => {
    const open = openMonths.has(mm)
    /* Un mese aperto si legge dalle righe, uno mai aperto dal contratto e dal
       piano: sommarli conterebbe due volte lo stesso canone. */
    const contratti = open ? [] : plannedRev(mm).map(l => ({
      id: l.id, side: 'entrata' as const, label: l.label,
      who: l.client_id ? nameOfClient.get(l.client_id) ?? null : null,
      gross: r2(l.amount_net * (1 + l.vat_rate)),
      due: dueOf({ id: l.id, side: 'entrata', month: mm, amount: l.amount_net, paid: false }),
    }))
    const piano = open ? [] : plannedForMonth(items, mm).map((it, k) => ({
      id: `${mm}:cost:${k}`, side: 'uscita' as const, label: it.label,
      who: it.supplier ?? it.category ?? null,
      gross: r2(it.amount * (it.vat_applied ? 1 + it.vat_rate : 1)),
      due: dueOf({
        id: '', side: 'uscita', month: mm, amount: it.amount, paid: false,
        category: it.category, project_id: it.project_id ?? null,
      }, ctx),
      external: !!it.project_id,
    }))

    /* I compensi attesi in questo mese. Se il mese è stato preparato (§243) le
       righe esistono e dicono anche a chi e per quale dei due lavori; se no si
       ripiega sul **maturato del mese prima**, che è la stessa regola con cui
       quelle righe verrebbero create: matura in un mese, esce in quello dopo. */
    const materializzati = (payoutRows ?? []).filter((x: Record<string, unknown>) =>
      String(x.due_month ?? '').slice(0, 10) === mm && x.paid !== true)
    const prev = maturatoOf(shiftMonth(mm, -1))
    const compensi = materializzati.length
      ? materializzati.map((x: Record<string, unknown>) => ({
          key: String(x.id), who: String(x.person_label ?? ''),
          kind: (x.kind === 'commerciale' ? 'commerciale' : 'socio') as 'socio' | 'commerciale',
          amount: num(x.amount), from: shiftMonth(mm, -1),
        }))
      : [
          ...(prev?.partners ?? []).map(p => ({
            key: `p:${p.who}`, who: p.who, kind: 'socio' as const, amount: r2(p.amount),
            from: shiftMonth(mm, -1),
          })),
          ...(prev?.sales ?? []).map(p => ({
            key: `o:${p.who}`, who: p.who, kind: 'commerciale' as const, amount: r2(p.amount),
            from: shiftMonth(mm, -1),
          })),
        ]

    return {
      month: mm,
      /* §263 — il mese in corso parte dal saldo vero di oggi; un mese passato da
         quello che aveva a inizio mese, perché lì tutto è già successo. */
      opening: mm === nowMonth ? balanceNow : balanceAt(mm),
      anchor: mm === nowMonth ? today : null,
      open,
      items: planMonth({
        month: mm, today, open, anchor: mm === nowMonth ? today : null,
        /* Le righe di **tutti** i mesi, ciascuna nel mese in cui la cassa la
           sente: quello del movimento se è già passata, quello della scadenza se
           no — e gli **scaduti pesano sul primo mese** della catena (§225), non
           su quello in cui erano attesi. Senza questo, lo stesso arretrato
           comparirebbe in agosto e in settembre e il modello lo conterebbe due
           volte. */
        /* §264 — si passano **tutte** le righe: quali sono di questo mese e
           quali ci si muovono soltanto lo decide il motore, che è l'unico posto
           dove quella regola deve vivere. */
        lines: cashLines,
        since: first,
        planned: [...contratti, ...piano],
        dues: dues.filter(d => bucket(d.date) === mm),
        payouts: compensi,
        /* §225 — la stima vale solo se il mese **prima** non è aperto: le
           retribuzioni escono il 20 del mese dopo, e dove quelle righe esistono
           sono già in lista. */
        payroll: openMonths.has(shiftMonth(mm, -1)) ? 0 : payrollNow,
      }),
    }
  })


  return {
    setupNeeded: false,
    months: (monthRows ?? []).map((m: { month: string; status: string }) =>
      ({ month: m.month.slice(0, 10), status: m.status })),
    /* §272 — le righe escono **col commerciale dell'anagrafica attaccato**.
       `ownerOf` legge prima la riga e poi il cliente (§185); senza quel campo
       ogni riga risulta inbound e la provvigione si divide fra i soci — nel
       report la quota di ciascun socio saliva da 4.234,26 a 5.510,78 e le
       provvigioni nominali sparivano. Il maturato lo calcolavano già così tutte
       le altre letture: qui usciva una copia mutilata. */
    revenue: withOwner,
    costs,
    txs: (txRows ?? []).map((t: Record<string, unknown>) => ({
      booked_on: String(t.booked_on).slice(0, 10), amount: num(t.amount),
      source: String(t.source), kind: String(t.kind ?? 'altro'),
    })),
    payouts,
    opening, bankReady: !bankErr,
    collection: Array.from(ctxIndex.entries()),
    first: (monthRows ?? [])[0]?.month?.slice(0, 10) ?? month,
    plan,
    vatHeld: vatNow?.toPay ?? 0,
    vatLabel: vatNow?.label ?? '',
    vatDeadline: vatNow?.deadline ?? null,
    /* §265 — i movimenti **veri** del mese guardato: entrato, uscito, e il saldo
       di adesso. Erano due sezioni a parte che calcolavano il saldo sulla sola
       finestra del prospetto e dicevano «0 €» di apertura: due numeri con lo
       stesso nome. Ora stanno dove c'è il saldo vero. */
    bank: !bankErr ? {
      inflow: r2(realTx
        .filter((t: Record<string, unknown>) => monthOf(String(t.booked_on).slice(0, 10)) === month
          && num(t.amount) > 0)
        .reduce((s: number, t: Record<string, unknown>) => s + num(t.amount), 0)),
      outflow: r2(Math.abs(realTx
        .filter((t: Record<string, unknown>) => monthOf(String(t.booked_on).slice(0, 10)) === month
          && num(t.amount) < 0)
        .reduce((s: number, t: Record<string, unknown>) => s + num(t.amount), 0))),
      balance: balanceNow,
    } : null,
    /* §262 — il selettore del mese arriva fino a sei mesi avanti: oltre, il
       previsionale è fatto di contratti che nessuno ha ancora firmato. */
    horizon: Array.from(new Set([
      ...Array.from(openMonths),
      ...Array.from({ length: 7 }, (_, k) => shiftMonth(nowMonth, k)),
    ])).sort(),
    config, partners,
    status: statusOf.get(month) ?? null,
  }
}
