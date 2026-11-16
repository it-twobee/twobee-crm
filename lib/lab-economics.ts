import { payoutEvidence } from '@/lib/lab-payout-evidence'
import { balance, grossOf, personName } from '@/lib/bank'
import { bankReadout, monthEnd, type LabBankAccount, type LabBankTx } from '@/lib/lab-bank'
import { knownAmount } from '@/lib/lab-deals'
import { linesForMonth, contractDrift, DRIFT_LABEL, type RevenueStream, type Installment, type Coverage } from '@/lib/revenue'
import { fallsIn, type SubItem } from '@/lib/subcontracts'
import { computeMonth, rowToPlConfig, DEFAULT_PL_CONFIG, shiftMonth, type Partner, type PlTotals, covered } from '@/lib/pl'
import { rowContext, toRevenueLines, toCostLines } from '@/lib/pl-rows'
import { buildWindow, placeLine, marginCostsFor } from '@/lib/payout-window'
import { payoutPeople } from '@/lib/payout-report'
import { isVoided, partlyVoided } from '@/lib/invoices'
import { isPayrollCenter } from '@/lib/costs'
import type { LabInvoice } from '@/lib/lab-invoices'
import type { ResourceRow as Row } from '@/lib/lab-resources'

const cents = (n: number) => Math.round(n * 100)
const sum = (xs: number[]) => xs.reduce((n, x) => n + cents(x), 0) / 100
export const SOCI = ['Marco Lucci', 'Walter Giacobbe', 'Toto Piacente']

export function economicCash(accounts: LabBankAccount[], txs: LabBankTx[], month: string, today: string) {
  const upTo = monthEnd(month) < today ? monthEnd(month) : today
  const perAccount = accounts.map(account => ({ account, read: bankReadout(account, txs, month, today) }))
  const main = accounts.filter(a => !a.parent_id && a.currency === 'EUR')
  const ids = new Set(main.map(a => a.id))
  const period = txs.filter(t => ids.has(t.account_id) && t.source === 'banca' && t.booked_on >= month && t.booked_on <= upTo)
  const transfer = (t: LabBankTx) => t.kind === 'giroconto' || !!t.transfer_pair_id
  const outside = period.filter(t => !transfer(t))
  const flows = balance({ opening_balance: 0 }, outside)
  const transfers = period.filter(transfer)
  const unresolved = transfers.filter(t => {
    const mate = txs.find(p => p.id === t.transfer_pair_id)
    return !mate || mate.source !== 'banca' || !ids.has(mate.account_id) || mate.account_id === t.account_id
      || mate.transfer_pair_id !== t.id || cents(mate.amount) !== -cents(t.amount)
      || mate.booked_on < month || mate.booked_on > upTo
  })
  return { upTo, perAccount, period, transfers, unresolved,
    incoming: period.length ? flows.inflow : null, outgoing: period.length ? Math.abs(flows.outflow) : null,
    change: period.length ? Math.round((flows.inflow + flows.outflow) * 100) / 100 : null,
    consolidated: null, mainCount: main.length }
}

export type LineProof = { id: string; covered: number | null; completedOn: string | null; documentOk: boolean; issues: string[];
  referenceIssues: { txId: string; code: string; label: string }[]; hits: { txId: string; accountId: string; date: string; amount: number }[] }

export function economicProof(rows: Row[], txs: LabBankTx[], accounts: LabBankAccount[], invoices: LabInvoice[], allocations: Row[], legacy: Row[], today: string): Map<string, LineProof> {
  const proofs = new Map(rows.map(r => [String(r.id), { id: String(r.id), covered: null, completedOn: null, documentOk: false, issues: [] as string[], referenceIssues: [], hits: [] as LineProof['hits'] } as LineProof]))
  const target = (a: Row) => a.revenue_line_id ? `r:${a.revenue_line_id}` : a.cost_line_id ? `c:${a.cost_line_id}` : a.payout_id ? `p:${a.payout_id}` : a.f24_id ? `f:${a.f24_id}` : '?'
  const signature = (xs: Row[]) => xs.map(a => `${target(a)}:${cents(Number(a.amount))}`).sort().join('|')
  const active = allocations.filter(a => !a.superseded)
  for (const tx of txs) {
    if (tx.source !== 'banca' || tx.booked_on > today || ['giroconto', 'finanziamento'].includes(tx.kind) || tx.transfer_pair_id || tx.hidden_reason
      || accounts.find(a => a.id === tx.account_id)?.currency !== 'EUR') continue
    const modern = active.filter(a => a.tx_id === tx.id), old = legacy.filter(a => a.tx_id === tx.id)
    const direct = [tx.revenue_line_id, tx.cost_line_id].filter(Boolean)
    const parts = modern.length ? modern : old.length ? old : direct.length === 1
      ? [{ revenue_line_id: tx.revenue_line_id, cost_line_id: tx.cost_line_id, amount: Math.abs(tx.amount) }] : []
    const reasons: { txId: string; code: string; label: string }[] = []
    const reason = (condition: boolean, code: string, label: string) => { if (condition) reasons.push({ txId: tx.id, code, label }) }
    reason(modern.length > 0 && old.length > 0 && signature(modern) !== signature(old), 'registri_divergenti', 'Quote correnti e collegamenti storici non coincidono')
    reason(modern.some(a => a.evidence !== 'certificata'), 'quote_non_certificate', 'Quote correnti prive di prova certificata')
    reason(parts.some(a => knownAmount(a.amount) == null || Number(a.amount) <= 0), 'importi_non_validi', 'Importi delle quote mancanti o non validi')
    reason(new Set(parts.map(target)).size !== parts.length, 'destinatario_duplicato', 'Lo stesso destinatario compare più volte sul movimento')
    reason(cents(sum(parts.map(a => Number(a.amount)))) > cents(Math.abs(tx.amount)), 'capienza_superata', 'Le quote superano il valore del movimento')
    reason(direct.some(id => !parts.some(a => a.revenue_line_id === id || a.cost_line_id === id)), 'riferimento_diretto_diverso', 'Il riferimento diretto del movimento non coincide con i destinatari delle quote')
    reason(!!tx.payslip_id || !!tx.hr_invoice_id, 'riferimento_hr', 'Movimento riferito anche a un documento HR: attribuzione da verificare')
    for (const row of rows) {
      const own = parts.filter(a => (tx.amount > 0 ? a.revenue_line_id : a.cost_line_id) === row.id)
      if (!own.length) continue
      const proof = proofs.get(String(row.id))!
      const rowReasons = [...reasons]
      if (tx.invoice_id && row.invoice_id !== tx.invoice_id) rowReasons.push({ txId: tx.id,
        code: row.invoice_id ? 'fatture_divergenti' : 'fattura_riga_assente',
        label: row.invoice_id ? 'Fattura della riga diversa da quella del movimento' : 'Fattura presente sul movimento, non collegata alla riga' })
      if (rowReasons.length) {
        proof.referenceIssues.push(...rowReasons)
        proof.issues.push('Registri o riferimenti concorrenti da raccordare', ...rowReasons.map(r => r.label))
        continue
      }
      proof.hits.push(...own.map(a => ({ txId: tx.id, accountId: tx.account_id, date: tx.booked_on, amount: Number(a.amount) })))
    }
  }
  for (const row of rows) {
    const proof = proofs.get(String(row.id))!
    const income = row.amount_net != null, net = knownAmount(income ? row.amount_net : row.actual), rate = knownAmount(row.vat_rate)
    const gross = net != null && rate != null ? grossOf({ net, vatRate: !income && row.vat_applied === false ? 0 : rate }) : null
    const invoice = invoices.find(i => i.id === row.invoice_id)
    const siblings = rows.filter(r => r.invoice_id && r.invoice_id === row.invoice_id)
    const siblingGross = siblings.map(r => {
      const n = knownAmount(r.amount_net ?? r.actual), v = knownAmount(r.vat_rate)
      return n == null || v == null ? null : grossOf({ net: n, vatRate: r.amount_net == null && r.vat_applied === false ? 0 : v })
    })
    proof.documentOk = !!invoice && invoice.currency === 'EUR' && invoice.sign === 1 && invoice.withholding === 0
      && !invoice.excludedReason && !isVoided(invoice) && !partlyVoided(invoice)
      && invoice.direction === (income ? 'emessa' : 'ricevuta') && siblingGross.every(n => n != null)
      && cents(sum(siblingGross as number[])) === cents(invoice.total)
      && !proof.hits.some(h => Date.parse(invoice.issuedOn) - Date.parse(h.date) > 45 * 86400000)
    proof.hits.sort((a, b) => a.date.localeCompare(b.date) || a.txId.localeCompare(b.txId))
    proof.covered = proof.hits.length ? sum(proof.hits.map(h => h.amount)) : null
    let running = 0
    if (gross != null && gross > 0) for (const hit of proof.hits) { running += cents(hit.amount); if (running >= cents(gross)) { proof.completedOn = hit.date; break } }
    if (!proof.documentOk) proof.issues.push('Documento o attribuzione del lordo da verificare')
    if (!proof.completedOn) proof.issues.push(proof.hits.length ? 'Copertura bancaria parziale' : 'Copertura bancaria da verificare')
    proof.issues = Array.from(new Set(proof.issues))
  }
  return proofs
}

export type EconomicsInput = {
  month: string; today: string; observedAt: string; months: Row[]; revenue: Row[]; costs: Row[]; clients: Row[];
  streams: RevenueStream[]; installments: Installment[]; links: { stream_id: string; project_id: string }[];
  items: (SubItem & { center_id?: string | null })[]; costCenters?: Row[]; config: Row[]; partners: Row[]; invoices: LabInvoice[]; accounts: LabBankAccount[];
  txs: LabBankTx[]; allocations: Row[]; legacy: Row[]; payouts?: Row[];
}

export function economicPlanItems(input: Pick<EconomicsInput, 'items' | 'costCenters'>) {
  const payroll = new Set((input.costCenters ?? []).filter(c => isPayrollCenter(String(c.name ?? ''))).map(c => c.id))
  return input.items.filter(item => !item.center_id || !payroll.has(item.center_id))
}

export function economicAccrual(input: EconomicsInput) {
  const i = input, monthOf = new Map(i.months.map(m => [String(m.id), String(m.month)]))
  const own = (rows: Row[]) => rows.filter(r => monthOf.get(String(r.month_id)) === i.month)
  const rawRev = own(i.revenue), rawCost = own(i.costs)
  const planItems = economicPlanItems(i)
  if ([...i.revenue, ...i.costs].some(r => !monthOf.has(String(r.month_id)))) throw new Error('Competenza della riga mancante')
  const validRev = (r: Row) => knownAmount(r.amount_net) != null && knownAmount(r.vat_rate) != null && ['growth', 'digital'].includes(String(r.kind))
  const validCost = (r: Row) => knownAmount(r.actual) != null && knownAmount(r.budget) != null && typeof r.vat_applied === 'boolean' && knownAmount(r.vat_rate) != null
  const coverage: Coverage = new Map()
  for (const l of i.links) coverage.set(l.stream_id, [...(coverage.get(l.stream_id) ?? []), l.project_id])
  const scheduled = linesForMonth(i.streams, i.installments, i.month, coverage)
  const missingRevenue = scheduled.filter(s => !rawRev.some(r => s.installment_id ? r.installment_id === s.installment_id : r.stream_id === s.stream_id))
  const missingCosts = planItems.filter(it => fallsIn(it, i.month, i.installments.find(n => n.id === it.installment_id)?.due_month)
    && !rawCost.some(c => c.cost_item_id === it.id))
  const ctx = rowContext({ month: i.month, months: i.months as { id: unknown; month: unknown }[], clients: i.clients,
    streams: i.streams as unknown as Row[], streamProjects: i.links })
  const mappedRev = toRevenueLines(i.revenue.filter(validRev), ctx), mappedCost = toCostLines(i.costs.filter(validCost), ctx)
  const revenue = mappedRev.filter(r => r.month === i.month), costs = mappedCost.filter(c => c.month === i.month)
  const config = rowToPlConfig(i.config[0]), configOk = i.config.length === 1 && Object.entries(DEFAULT_PL_CONFIG).every(([k, v]) =>
    typeof v === 'number' ? knownAmount(i.config[0][k]) != null && (!k.endsWith('_pct') || (Number(i.config[0][k]) >= 0 && Number(i.config[0][k]) <= 1)) : typeof v === 'boolean' ? typeof i.config[0][k] === 'boolean' : true)
  const partners: Partner[] = i.partners.filter(p => p.is_active === true).map(p => ({ id: String(p.id), label: String(p.label), takes_delivery: p.takes_delivery === true, takes_residual: p.takes_residual === true }))
  const allRows = [...i.revenue, ...i.costs]
  const proof = economicProof(allRows, i.txs, i.accounts, i.invoices, i.allocations, i.legacy, i.today)
  const drift = contractDrift(mappedRev.filter(r => r.month <= i.month && i.months.find(m => m.month === r.month)?.status !== 'chiuso')
    .map(r => ({ ...r, stream_id: r.stream_id ?? null, project_id: r.project_id ?? null })), i.streams, coverage)
  for (const d of drift) proof.get(d.lineId)?.issues.push(`Riga e accordo divergono: ${d.fields.map(f => DRIFT_LABEL[f]).join(', ')}`)
  const invalidSources = i.streams.some(s => s.status !== 'bozza' && (knownAmount(s.amount) == null || !['growth', 'digital'].includes(s.kind)))
    || i.installments.some(n => n.due_month <= i.month && knownAmount(n.amount) == null)
    || planItems.some(it => it.is_active && knownAmount(it.amount) == null)
  const blockers = [!configOk && 'Parametri di ripartizione incompleti o non validi', !partners.length && 'Diritti dei soci mancanti',
    [...rawRev.filter(r => !validRev(r)), ...rawCost.filter(r => !validCost(r))].length > 0 && 'Righe numeriche incomplete nel mese', invalidSources && 'Valori contrattuali o di costo incompleti',
    !rawRev.length && 'Righe ricavo del mese assenti', !!missingRevenue.length && 'Occorrenze ricavo mancanti', !!missingCosts.length && 'Occorrenze costo mancanti',
    drift.some(d => rawRev.some(r => r.id === d.lineId)) && 'Righe del mese divergenti dagli accordi'].filter(Boolean) as string[]
  const canCompute = blockers.length === 0
  const totals = canCompute ? computeMonth(revenue, costs, config, partners) : null
  const current = i.months.find(m => m.month === i.month), previous = i.months.find(m => m.month === shiftMonth(i.month, -1))
  const window = buildWindow({ month: i.month, date: current?.payout_date as string | null, previousDate: previous?.payout_date as string | null,
    day: config.payout_day, settledFrom: config.settled_from })
  const observedCutoff = i.today < window.date ? i.today : window.date
  const certified = mappedRev.map(r => {
    const p = proof.get(r.id), eligible = !!p?.documentOk && !!p.completedOn && p.issues.length === 0
    return { ...r, paid: eligible, paid_on: eligible ? p!.completedOn : null }
  })
  const taken = certified.filter(r => r.paid && r.paid_on! <= observedCutoff && placeLine(r, window) === 'presa')
  const takenMonths = new Set(taken.map(r => r.month))
  const pendingInputs = i.revenue.some(r => takenMonths.has(monthOf.get(String(r.month_id))!) && !validRev(r))
    || i.costs.some(c => takenMonths.has(monthOf.get(String(c.month_id))!) && !validCost(c))
  const historicalGaps = Array.from(takenMonths).some(m =>
    linesForMonth(i.streams, i.installments, m, coverage).some(s => !i.revenue.some(r => monthOf.get(String(r.month_id)) === m && (s.installment_id ? r.installment_id === s.installment_id : r.stream_id === s.stream_id)))
    || planItems.some(it => it.project_id && fallsIn(it, m, i.installments.find(n => n.id === it.installment_id)?.due_month)
      && !i.costs.some(c => monthOf.get(String(c.month_id)) === m && c.cost_item_id === it.id)))
  const cashTotals = canCompute && !pendingInputs && !historicalGaps ? computeMonth(taken, marginCostsFor(mappedCost, takenMonths, i.month), config, partners,
    marginCostsFor(mappedCost, takenMonths, i.month), mappedRev.filter(r => takenMonths.has(r.month))) : null
  // A partial view uses the same engine and complete digital denominators. Missing
  // structure costs do not erase fixed Growth rights; missing project costs do.
  const scopeIssues = (r: typeof mappedRev[number]) => {
    const issues: string[] = []
    if (drift.some(d => d.lineId === r.id)) issues.push('Riga divergente dall’accordo')
    if (i.streams.some(s => s.id === r.stream_id && (knownAmount(s.amount) == null || !['growth', 'digital'].includes(s.kind)))) issues.push('Fonte contrattuale incompleta')
    if (r.kind === 'digital' && !r.pass_through) {
      const projects = covered(r), rawMonth = (rows: Row[]) => rows.filter(x => monthOf.get(String(x.month_id)) === r.month)
      const overlaps = (ids: string[]) => ids.some(id => projects.includes(id))
      if (!projects.length) issues.push('Ambito del progetto digital da attribuire')
      if (rawMonth(i.revenue).some(x => !validRev(x))) issues.push('Denominatore ricavi del mese incompleto')
      if (mappedRev.some(x => x.month === r.month && overlaps(covered(x)) && drift.some(d => d.lineId === x.id))) issues.push('Altre righe del progetto divergono dagli accordi')
      if (i.costs.some(c => monthOf.get(String(c.month_id)) === r.month && projects.includes(String(c.project_id)) && !validCost(c))) issues.push('Esterni del progetto incompleti')
      if (planItems.some(it => it.project_id && projects.includes(it.project_id) && fallsIn(it, r.month!, i.installments.find(n => n.id === it.installment_id)?.due_month)
        && !i.costs.some(c => monthOf.get(String(c.month_id)) === r.month && c.cost_item_id === it.id))) issues.push('Costo esterno previsto assente dal registro')
      if (linesForMonth(i.streams, i.installments, r.month!, coverage).some(x => overlaps(x.project_ids ?? (x.project_id ? [x.project_id] : []))
        && !i.revenue.some(raw => monthOf.get(String(raw.month_id)) === r.month && (x.installment_id ? raw.installment_id === x.installment_id : raw.stream_id === x.stream_id)))) issues.push('Occorrenze del progetto assenti dal denominatore')
      if (i.streams.some(s => overlaps(coverage.get(s.id) ?? (s.project_id ? [s.project_id] : [])) && knownAmount(s.amount) == null)) issues.push('Valore venduto del progetto incompleto')
    }
    return Array.from(new Set(issues))
  }
  const previewRevenue = revenue.filter(r => !scopeIssues(r).length)
  const previewTaken = taken.filter(r => !scopeIssues(r).length)
  const previewMonths = new Set(previewTaken.map(r => r.month))
  const previewCosts = marginCostsFor(mappedCost, previewMonths, i.month)
  const prerequisites = configOk && partners.length > 0 && new Set(partners.map(p => p.id)).size === partners.length
  const previewTotals = prerequisites && previewRevenue.length ? computeMonth(previewRevenue, costs, config, partners, costs, revenue) : null
  const previewCashTotals = prerequisites && previewTaken.length ? computeMonth(previewTaken, previewCosts, config, partners, previewCosts,
    mappedRev.filter(r => previewMonths.has(r.month))) : null
  const omitted = mappedRev.filter(r => r.month === i.month || taken.some(t => t.id === r.id)).flatMap(r => scopeIssues(r).map(why => ({ id: r.id, label: r.label, month: r.month!, why })))
  const payoutProof = payoutEvidence(i.payouts, i.allocations, i.legacy, i.txs, i.accounts, i.today)
  const owners = i.clients.map(c => String(c.sales_owner_name ?? '')).filter(Boolean)
  const people = (t: PlTotals | null) => t ? payoutPeople({ t, owners }) : []
  const matured = people(totals), eligible = people(cashTotals), previewMatured = people(previewTotals), previewEligible = people(previewCashTotals)
  const soci = SOCI.map(name => {
    const matches = partners.filter(p => personName(name) === personName(p.label))
    const partner = matches.length === 1 ? matches[0] : null
    const m = partner && totals ? matured.find(p => p.partnerId === partner.id) : null
    const e = partner && cashTotals ? eligible.find(p => p.partnerId === partner.id) : null
    const pm = partner && previewTotals ? previewMatured.find(p => p.partnerId === partner.id) : null
    const pe = partner && previewCashTotals ? previewEligible.find(p => p.partnerId === partner.id) : null
    const aliases = new Set([name, partner?.label, ...owners.filter(o => personName(o) === personName(name))])
    const registered = partner ? payoutProof.filter(p => p.monthId === current?.id && (p.kind === 'socio' && p.personKey === `p:${partner.id}`
      || p.kind === 'commerciale' && p.personKey.startsWith('o:') && aliases.has(p.personKey.slice(2)))) : []
    const registrationIssues = registered.flatMap(p => p.issues)
    if (!registered.length) registrationIssues.push(i.payouts ? 'Compensi del mese non ancora preparati nel registro' : 'Registro compensi non disponibile')
    const duplicateRegistration = new Set(registered.map(p => `${p.personKey}:${p.kind}`)).size !== registered.length
    if (duplicateRegistration) registrationIssues.push('Più compensi per la stessa persona e natura')
    const paid = registered.filter(p => p.paidKnown != null)
    const prepared = registered.length && !duplicateRegistration && registered.every(p => p.amount != null && p.amount >= 0) ? sum(registered.map(p => p.amount!)) : null
    const paidKnown = paid.length && !duplicateRegistration ? sum(paid.map(p => p.paidKnown!)) : null
    const preparedResidual = registered.length && registered.every(p => p.residual != null) && !registrationIssues.length ? sum(registered.map(p => p.residual!)) : null
    return { name, partnerId: partner?.id ?? null, matured: partner && totals ? m?.total ?? 0 : null,
      eligible: partner && cashTotals ? e?.total ?? 0 : null, settled: paidKnown, remaining: preparedResidual,
      knownMatured: partner && previewTotals ? pm?.total ?? 0 : null, knownEligible: partner && previewCashTotals ? pe?.total ?? 0 : null,
      prepared, paidKnown, preparedResidual, registrationIssues, registered,
      rows: (m ?? pm)?.rows ?? [], eligibleRows: (e ?? pe)?.rows ?? [] }

  })
  const lines = [...rawRev, ...rawCost].map(row => ({ row, proof: proof.get(String(row.id))!, side: rawRev.includes(row) ? 'ricavo' : 'costo' }))
  const revenueKnown = rawRev.filter(validRev), costsKnown = rawCost.filter(validCost)
  return { totals, soci, previewRevenueCount: previewRevenue.length, previewTakenCount: previewTaken.length, omitted, window, observedCutoff, configOk, blockers, drift, missingRevenue, missingCosts, lines, proof,
    revenueKnown: revenueKnown.length ? sum(revenueKnown.map(r => Number(r.amount_net))) : null,
    costsKnown: costsKnown.length ? sum(costsKnown.map(c => Number(c.actual))) : null,
    revenueComplete: rawRev.length > 0 && revenueKnown.length === rawRev.length && !missingRevenue.length,
    costsComplete: rawCost.length > 0 && costsKnown.length === rawCost.length && !missingCosts.length,
    incomplete: lines.filter(l => l.proof.issues.length).length + missingRevenue.length + missingCosts.length,
    historical: allRows.filter(r => monthOf.get(String(r.month_id))! < i.month && proof.get(String(r.id))!.issues.length > 0),
    exclusions: certified.filter(r => r.month <= i.month).map(r => ({ id: r.id, label: r.label, month: r.month, verdict: placeLine(r, window), paidOn: r.paid_on })),
    otherSales: eligible.filter(p => !p.partnerId) }
}
