import { linesForMonth, coveredProjects, type RevenueStream, type Installment } from '@/lib/revenue'
import { plannedForMonth, monthsApart, type CostItem } from '@/lib/costs'
import { fallsIn } from '@/lib/subcontracts'
import { rowContext, projectedMonthRows, toRevenueLines, toCostLines } from '@/lib/pl-rows'
import { computeMonth, rowToPlConfig, DEFAULT_PL_CONFIG, shiftMonth, type Partner } from '@/lib/pl'
import { dueOf, addDays, collectionIndex, isTerms, type CashLine } from '@/lib/cash-calendar'
import { payoutDateFor } from '@/lib/payout-window'
import { economicCash, economicProof, type EconomicsInput } from '@/lib/lab-economics'
import { knownAmount } from '@/lib/lab-deals'
import { payoutPeople } from '@/lib/payout-report'

const round = (n: number) => Math.round(n * 100) / 100
export type ForecastOptions = { horizon: 6 | 12; mode: 'previsti' | 'ritardo' | 'senza'; delay: number; growth: number; digital: number;
  growthProfile: string; digitalProfile: string; startOffset: number; capacityGrowth: number | null; capacityDigital: number | null; externalComplete: boolean; riskFund: boolean }

export function forecastOptions(p: Record<string, string | undefined>): ForecastOptions {
  const integer = (key: string, fallback: number, max: number) => /^\d+$/.test(p[key] ?? '') && Number(p[key]) <= max ? Number(p[key]) : fallback
  const capacity = (key: string) => p[key] == null || p[key] === '' ? null : /^\d+$/.test(p[key]!) && Number(p[key]) <= 20 ? Number(p[key]) : null
  return { horizon: p.orizzonte === '12' ? 12 : 6, mode: p.scenario === 'senza' ? 'senza' : p.scenario === 'ritardo' ? 'ritardo' : 'previsti', delay: integer('ritardo', 30, 90),
    growth: integer('growth', 0, 20), digital: integer('digital', 0, 20), growthProfile: p.profiloGrowth ?? '', digitalProfile: p.profiloDigital ?? '',
    startOffset: Math.max(0, integer('avvio', 0, 11)), capacityGrowth: capacity('capacitaGrowth'), capacityDigital: capacity('capacitaDigital'),
    externalComplete: p.esterni === '1', riskFund: p.fondo === '1' }
}

export type ForecastEvent = { id: string; date: string; month: string; amount: number; kind: 'incasso' | 'fornitore' | 'compenso'; label: string; sourceId: string; incremental: boolean }
export function eventCurve(events: ForecastEvent[], from: string, to: string, opening: number) {
  const days = new Map<string, number>()
  const unique = new Map<string, ForecastEvent>()
  for (const e of events) {
    const old = unique.get(e.id)
    if (!Number.isFinite(e.amount) || (old && (old.date !== e.date || old.amount !== e.amount))) throw new Error('Evento incoerente')
    if (old) continue
    unique.set(e.id, e)
    if (e.date >= from && e.date <= to) days.set(e.date, round((days.get(e.date) ?? 0) + e.amount))
  }
  let current = opening, minimum = opening, minOn = from
  const points = [{ date: from, value: opening }]
  for (const [date, amount] of Array.from(days).sort(([a], [b]) => a.localeCompare(b))) {
    current = round(current + amount); points.push({ date, value: current })
    if (current < minimum) { minimum = current; minOn = date }
  }
  return { points, minimum, minOn, final: current }
}

export function searchCustomerMix(input: { complete: boolean; capacityGrowth: number | null; capacityDigital: number | null;
  evaluate: (growth: number, digital: number) => { minimum: number; fixed: number } }) {
  if (!input.complete || input.capacityGrowth == null || input.capacityDigital == null) return { status: 'incompleta' as const, growth: null, digital: null }
  let best: { growth: number; digital: number; minimum: number; fixed: number } | null = null
  for (let g = 0; g <= Math.min(20, input.capacityGrowth); g++) for (let d = 0; d <= Math.min(20, input.capacityDigital); d++) {
    const result = input.evaluate(g, d)
    if (!Number.isFinite(result.minimum) || !Number.isFinite(result.fixed) || result.minimum < 0) continue
    const candidate = { growth: g, digital: d, ...result }
    if (!best || g + d < best.growth + best.digital || (g + d === best.growth + best.digital
      && (result.minimum > best.minimum || (result.minimum === best.minimum && result.fixed < best.fixed)))) best = candidate
  }
  return best ? { status: 'condizionata' as const, ...best } : { status: 'insufficiente' as const, growth: null, digital: null }
}

export function templateSample(streams: RevenueStream[], kind: 'growth' | 'digital') {
  const eligible = streams.filter(s => s.kind === kind && s.status !== 'bozza' && !s.pass_through && knownAmount(s.amount) != null && s.amount > 0)
  return { eligible, recurring: eligible.filter(s => s.billing === 'recurring').length, oneOff: eligible.filter(s => s.billing === 'one_off').length,
    automaticTicket: null }
}

function hypothetical(input: EconomicsInput, o: ForecastOptions, from: string) {
  const streams: RevenueStream[] = [], installments: Installment[] = [], items: CostItem[] = [], issues: string[] = []
  const clients: EconomicsInput['clients'] = []
  const coverage = new Map<string, string[]>()
  for (const link of input.links) coverage.set(link.stream_id, [...coverage.get(link.stream_id) ?? [], link.project_id])
  for (const [kind, count, profileId] of [['growth', o.growth, o.growthProfile], ['digital', o.digital, o.digitalProfile]] as const) {
    if (count === 0) continue
    const source = input.streams.find(s => s.id === profileId && s.kind === kind && s.status !== 'bozza' && !s.pass_through)
    if (!source || knownAmount(source.amount) == null || knownAmount(source.vat_rate) == null || source.amount <= 0) { issues.push(`Profilo ${kind} da scegliere`); continue }
    if (source.payment_terms && !isTerms(source.payment_terms)) { issues.push(`Termini del profilo ${kind} non determinabili`); continue }
    const projects = coveredProjects(source, coverage)
    if (projects.length > 1) { issues.push(`Profilo ${kind} condiviso fra progetti: esterni non attribuibili`); continue }
    if (projects.length && input.streams.some(s => s.id !== source.id && s.status !== 'bozza' && coveredProjects(s, coverage).some(p => projects.includes(p)))) { issues.push(`Profilo ${kind}: progetto con più accordi, esterni da attribuire`); continue }
    const originalInstallments = input.installments.filter(n => n.stream_id === source.id)
    const anchor = source.billing === 'one_off' ? originalInstallments.map(n => n.due_month).sort()[0] : source.start_date?.slice(0, 7) + '-01'
    if (!anchor || !/^\d{4}-\d{2}-01$/.test(anchor) || originalInstallments.some(n => knownAmount(n.amount) == null) || (source.billing === 'one_off' && !originalInstallments.length)) { issues.push(`Calendario ${kind} incompleto`); continue }
    if (source.billing === 'one_off' && Math.round(originalInstallments.reduce((s, n) => s + Number(n.amount), 0) * 100) !== Math.round(source.amount * 100)) { issues.push(`Totale e rate del profilo ${kind} da raccordare`); continue }
    const start = shiftMonth(from, o.startOffset), shift = monthsApart(anchor, start)
    const ownCosts = input.items.filter(it => it.project_id && projects.includes(it.project_id)) as CostItem[]
    if (ownCosts.some(it => knownAmount(it.amount) == null || typeof it.vat_applied !== 'boolean' || knownAmount(it.vat_rate) == null
      || (it.payment_terms && !isTerms(it.payment_terms)) || (it.installment_id && !originalInstallments.some(n => n.id === it.installment_id))
      || (it.frequency !== 'mensile' && !it.start_month && !it.installment_id))) { issues.push(`Componenti esterni ${kind} incomplete`); continue }
    for (let n = 0; n < count; n++) {
      const id = `scenario:${kind}:${n}`, project = `${id}:project`
      clients.push({ ...input.clients.find(c => c.id === source.client_id), id: `${id}:client` })
      streams.push({ ...source, id, project_id: project, client_id: `${id}:client`, status: 'attivo', start_date: start,
        end_date: source.end_date ? shiftMonth(source.end_date.slice(0, 7) + '-01', shift) : null })
      installments.push(...originalInstallments.map(it => ({ ...it, id: `${id}:${it.id}`, stream_id: id, due_month: shiftMonth(it.due_month, shift), paid: false, invoiced: false })))
      items.push(...ownCosts.map(it => ({ ...it, id: `${id}:${it.id}`, project_id: project, is_active: true,
        installment_id: it.installment_id ? `${id}:${it.installment_id}` : null,
        start_month: it.start_month ? shiftMonth(it.start_month, shift) : it.frequency === 'mensile' ? start : null, end_month: it.end_month ? shiftMonth(it.end_month, shift) : null })))
    }
  }
  return { streams, installments, items, clients, issues }
}

function projection(input: EconomicsInput, o: ForecastOptions, extra: ReturnType<typeof hypothetical>, from: string) {
  const streams = [...input.streams, ...extra.streams], installments = [...input.installments, ...extra.installments]
  const items = [...input.items as CostItem[], ...extra.items], config = rowToPlConfig(input.config[0])
  const partners: Partner[] = input.partners.filter(p => p.is_active === true).map(p => ({ id: String(p.id), label: String(p.label), takes_delivery: p.takes_delivery === true, takes_residual: p.takes_residual === true }))
  const proof = economicProof([...input.revenue, ...input.costs], input.txs, input.accounts, input.invoices, input.allocations, input.legacy, input.today)
  const events: ForecastEvent[] = [], rows = []
  const coverage = new Map<string, string[]>()
  for (const l of input.links) coverage.set(l.stream_id, [...coverage.get(l.stream_id) ?? [], l.project_id])
  for (let n = -3; n < o.horizon + 2; n++) {
    const month = shiftMonth(from, n), occurrences = linesForMonth(streams, installments, month, coverage)
    const datedItems = items.filter(it => it.frequency === 'mensile' || it.start_month || it.installment_id)
    const dueCosts = plannedForMonth(datedItems.filter(it => !it.project_id), month).concat(datedItems.filter(it => it.project_id
      && fallsIn({ ...it, project_id: it.project_id ?? null }, month, installments.find(p => p.id === it.installment_id)?.due_month)))
    const ctx = rowContext({ month, months: input.months as { id: unknown; month: unknown }[], clients: [...input.clients, ...extra.clients], streams: streams as unknown as Record<string, unknown>[], streamProjects: input.links })
    const mapped = projectedMonthRows(month, occurrences, dueCosts, ctx, streams, id => id.startsWith('scenario:') && o.riskFund)
    const opened = input.months.find(m => m.month === month)
    if (opened) {
      mapped.revenue = [...toRevenueLines(input.revenue.filter(r => r.month_id === opened.id), ctx), ...mapped.revenue.filter(r => r.stream_id?.startsWith('scenario:'))]
      mapped.costs = [...toCostLines(input.costs.filter(c => c.month_id === opened.id), ctx), ...mapped.costs.filter(c => c.cost_item_id?.startsWith('scenario:'))]
    }
    const totals = computeMonth(mapped.revenue, mapped.costs, config, partners)
    const cashRows: CashLine[] = mapped.revenue.map(r => ({ id: r.id, side: 'entrata', month, amount: r.amount_net, paid: false,
      project_id: r.project_id, projects: r.project_ids, terms: r.terms ?? streams.find(s => s.id === r.stream_id)?.payment_terms ?? null, due_date: r.due_date }))
    const collection = collectionIndex(cashRows.map(r => o.mode === 'ritardo' ? { ...r, due_date: addDays(dueOf(r), o.delay) } : r))
    const incoming = cashRows.map((line, idx) => {
      const row = mapped.revenue[idx], sourceId = row.stream_id ?? row.id
      const date = dueOf(line), shifted = o.mode === 'ritardo' ? addDays(date, o.delay) : date
      const alreadyObserved = proof.get(row.id)?.completedOn != null
      if (o.mode !== 'senza' && !alreadyObserved && shifted > input.today) events.push({ id: `in:${row.id}`, date: shifted, month, amount: round(row.amount_net * (1 + row.vat_rate)), kind: 'incasso', label: row.label, sourceId, incremental: sourceId.startsWith('scenario:') })
      return { ...row, paid: o.mode !== 'senza', paid_on: o.mode === 'senza' ? null : shifted }
    })
    for (const cost of mapped.costs) {
      const line: CashLine = { id: cost.id, side: 'uscita', month, amount: cost.actual, paid: false, category: cost.category,
        project_id: cost.project_id, terms: cost.terms ?? items.find(it => it.id === cost.cost_item_id)?.payment_terms ?? null, due_date: cost.due_date }
      const date = dueOf(line, { collection })
      if (!proof.get(cost.id)?.completedOn && date > input.today) events.push({ id: `out:${cost.id}`, date, month, amount: -round(cost.actual * (cost.vat_applied ? 1 + cost.vat_rate : 1)), kind: 'fornitore', label: cost.label, sourceId: cost.cost_item_id ?? cost.id, incremental: String(cost.cost_item_id).startsWith('scenario:') })
    }
    // Le nuove quote restano nella finestra canonica: un ritardo non anticipa
    // il compenso né cancella il diritto. La base storica non è certificata qui.
    for (const row of incoming) if (row.paid && row.stream_id?.startsWith('scenario:')) {
      let accruedMonth = month
      while (payoutDateFor(accruedMonth, config.payout_day) < row.paid_on!) accruedMonth = shiftMonth(accruedMonth, 1)
      const paid = computeMonth([row], mapped.costs, config, partners, mapped.costs, mapped.revenue).plan.distributed
      events.push({ id: `payout:${row.id}`, date: payoutDateFor(accruedMonth, config.payout_day), month, amount: -paid, kind: 'compenso', label: `Compensi ipotetici · ${row.label}`, sourceId: row.stream_id, incremental: true })
    }
    if (n >= 0 && n < o.horizon) rows.push({ month, revenue: totals.revenue.accrued, knownCost: totals.costs.actual, partialCompany: totals.margin.company,
      growth: totals.revenue.growth, digital: totals.revenue.digital, registered: !!opened,
      people: payoutPeople({ t: totals, owners: [...input.clients, ...extra.clients].map(c => String(c.sales_owner_name ?? '')).filter(Boolean) }).map(p => ({ id: p.partnerId, name: p.who, total: p.total })) })
  }
  return { rows, events }
}

export function labForecast(input: EconomicsInput, options: ForecastOptions) {
  if (input.config.length !== 1 || Object.entries(DEFAULT_PL_CONFIG).some(([k, v]) => typeof v === 'number'
    ? knownAmount(input.config[0][k]) == null || (k.endsWith('_pct') && (Number(input.config[0][k]) < 0 || Number(input.config[0][k]) > 1))
    : typeof v === 'boolean' && typeof input.config[0][k] !== 'boolean')
    || input.streams.some(s => s.status !== 'bozza' && (knownAmount(s.amount) == null || knownAmount(s.vat_rate) == null))
    || input.items.some(it => it.is_active && (knownAmount(it.amount) == null || knownAmount((it as CostItem).vat_rate) == null || typeof (it as CostItem).vat_applied !== 'boolean'))
    || input.revenue.some(r => knownAmount(r.amount_net) == null || knownAmount(r.vat_rate) == null)
    || input.costs.some(c => knownAmount(c.actual) == null || knownAmount(c.budget) == null || knownAmount(c.vat_rate) == null)) throw new Error('Fonte numerica incompleta')
  const from = shiftMonth(`${input.today.slice(0, 7)}-01`, 1), end = addDays(shiftMonth(from, options.horizon), -1)
  const extra = hypothetical(input, options, from), empty = { streams: [], installments: [], items: [], clients: [], issues: [] }
  const base = projection(input, options, empty, from), scenario = projection(input, options, extra, from)
  const neutral = options.growth === 0 && options.digital === 0
  const delta = scenario.rows.map((r, n) => ({ month: r.month, revenue: extra.issues.length ? null : round(r.revenue - base.rows[n].revenue),
    cost: extra.issues.length || (!neutral && !options.externalComplete) ? null : round(r.knownCost - base.rows[n].knownCost), companyBeforeCapacity: !extra.issues.length && (neutral || options.externalComplete) ? round(r.partialCompany - base.rows[n].partialCompany) : null,
    partners: input.partners.filter(p => p.is_active === true).map(p => ({ id: String(p.id), name: String(p.label),
      amount: !extra.issues.length && (neutral || options.externalComplete) ? round((r.people.find(x => x.id === p.id)?.total ?? 0) - (base.rows[n].people.find(x => x.id === p.id)?.total ?? 0)) : null })) }))
  const extraEvents = scenario.events.filter(e => e.incremental)
  const curve = eventCurve(extraEvents, input.today, end, 0)
  const history = Array.from({ length: 6 }, (_, n) => shiftMonth(`${input.today.slice(0, 7)}-01`, n - 6)).map(month => ({ month, ...economicCash(input.accounts, input.txs, month, input.today) }))
  const quality = [
    'Saldo consolidato e copertura degli estratti non certificati', 'Residui di fatture/righe e registri concorrenti da riconciliare',
    'Costo risorse, oneri e capacità aggiuntiva non integralmente determinati', 'Riserva IVA, compensazioni e versamenti da raccordare',
    'Compensi già regolati e coda storica da riconciliare', ...extra.issues,
  ]
  const undated = input.items.filter(it => it.is_active && it.frequency !== 'mensile' && !it.start_month && !it.installment_id)
  if (undated.length) quality.push(`${undated.length} costi non mensili senza calendario esclusi dalla parte nota`)
  if (from.slice(0, 4) !== end.slice(0, 4)) quality.push('Orizzonte su due anni: parametri paghe e fisco futuri non certificati in questa lettura')
  if (!neutral && !options.externalComplete) quality.push('Completezza degli esterni del profilo non assunta nello scenario')
  if (!neutral && (options.capacityGrowth == null || options.capacityDigital == null)) quality.push('Capacità incrementale non dichiarata')
  const capacityExceeded = (options.capacityGrowth != null && options.growth > options.capacityGrowth) || (options.capacityDigital != null && options.digital > options.capacityDigital)
  if (capacityExceeded) quality.push('Mix oltre la capacità ipotizzata')
  const first = extra.issues.length ? `Completa il profilo: ${extra.issues[0]}.`
    : capacityExceeded ? 'Il mix supera la capacità ipotizzata: riduci i clienti o valuta un avvio scaglionato e i costi delle risorse. Il mix attuale non è ammissibile con questi limiti.'
    : !neutral && options.startOffset >= options.horizon ? 'I nuovi clienti iniziano oltre l’orizzonte: non possono correggere le criticità che lo precedono.'
    : !neutral && !options.externalComplete ? 'Prima verifica gli esterni del profilo: senza questa assunzione esplicita, costi, contributo societario e flussi aggiuntivi restano n/d.'
    : !neutral ? `Confronta il mix ${options.growth} growth e ${options.digital} digital come ipotesi; prima di acquisire verifica capacità, esterni e fabbisogno iniziale.`
    : 'Prima raccomandazione: riconciliare saldo, residui e IVA. Senza questa base non è determinabile quanti nuovi clienti rendano sostenibile la società.'
  const expiring = input.streams.filter(s => s.status === 'attivo' && s.end_date && s.end_date >= input.today && s.end_date <= end)
  return { from, end, options, base, scenario, delta, curve, extraEvents, quality, first, neutral, history, expiring,
    // Nessuna ricerca sul reale finché saldo e riserva non sono certificati.
    proposal: { status: 'incompleta' as const, growth: null, digital: null },
    growthSample: templateSample(input.streams, 'growth'), digitalSample: templateSample(input.streams, 'digital'),
    cashDelta: !extra.issues.length && (neutral || options.externalComplete) ? curve.final : null }
}
