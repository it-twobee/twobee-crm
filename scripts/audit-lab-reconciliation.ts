import { readFileSync, writeFileSync } from 'node:fs'
import { economicAccrual, economicCash, economicPlanItems, economicProof, type EconomicsInput } from '@/lib/lab-economics'
import { economicsReport } from '@/lib/lab-economics-report'
import { labForecast, forecastOptions } from '@/lib/lab-forecast'
import { toLabInvoices } from '@/lib/lab-invoices'
import { bankReadout, romeToday, type LabBankAccount, type LabBankTx } from '@/lib/lab-bank'
import { shiftMonth } from '@/lib/pl'
import { knownAmount } from '@/lib/lab-deals'
import { resourceF24, type ResourceRow, type ResourceTx } from '@/lib/lab-resources'
import { vatPeriods, vatPayment } from '@/lib/lab-vat'

type Row = ResourceRow
const arg = (name: string) => { const n = process.argv.indexOf(name); return n < 0 ? undefined : process.argv[n + 1] }
const flags = new Set(['--as-of', '--months', '--f24-total', '--out'])
for (let n = 2; n < process.argv.length; n += 2) {
  if (!flags.has(process.argv[n]) || !process.argv[n + 1] || process.argv[n + 1].startsWith('--')) throw new Error('Opzioni non valide: audit in sola lettura, nessuna modalità apply')
}
const today = arg('--as-of') ?? romeToday()
if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(today)) throw new Error('Data di osservazione non valida')
const selectedMonths = (arg('--months') ?? `${shiftMonth(`${today.slice(0, 7)}-01`, -1)},${today.slice(0, 7)}-01`).split(',')
if (selectedMonths.some(m => !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(m))) throw new Error('Competenze non valide')
const candidateTotal = knownAmount(arg('--f24-total'))
if (arg('--f24-total') != null && (candidateTotal == null || candidateTotal <= 0)) throw new Error('Totale F24 candidato non valido')
const env = Object.fromEntries(readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
  .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter((m): m is RegExpMatchArray => !!m)
  .map(m => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]))
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Configurazione di lettura non disponibile')

async function read(table: string, columns = '*'): Promise<Row[]> {
  const keys = table === 'revenue_stream_projects' ? ['stream_id', 'project_id']
    : table === 'bank_tx_payslips' ? ['tx_id', 'payslip_id'] : table === 'hr_payroll_params' ? ['year'] : ['id']
  const rows: Row[] = []
  let expected: number | null = null
  for (let offset = 0; ; offset += 500) {
    const endpoint = new URL(`${url}/rest/v1/${table}`)
    endpoint.searchParams.set('select', columns)
    endpoint.searchParams.set('order', keys.join(','))
    endpoint.searchParams.set('offset', String(offset))
    endpoint.searchParams.set('limit', '500')
    if (table === 'bank_transactions') endpoint.searchParams.set('booked_on', `lte.${today}`)
    if (table === 'invoices') endpoint.searchParams.set('issued_on', `lte.${today}`)
    const response = await fetch(endpoint, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' }, signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`${table}: lettura HTTP ${response.status}`)
    const count = response.headers.get('content-range')?.split('/')[1]
    if (count == null || !/^\d+$/.test(count) || (expected != null && Number(count) !== expected)) throw new Error(`${table}: conteggio assente o cambiato`)
    expected = Number(count)
    const batch = await response.json() as Row[]
    if (!Array.isArray(batch)) throw new Error(`${table}: risposta non valida`)
    rows.push(...batch)
    if (rows.length >= expected) break
    if (!batch.length || offset >= 100000) throw new Error(`${table}: lettura incompleta`)
  }
  const ids = rows.map(r => JSON.stringify(keys.map(k => r[k])))
  if (rows.length !== expected || new Set(ids).size !== rows.length) throw new Error(`${table}: righe duplicate o mancanti`)
  return rows
}

const numeric = (value: unknown) => { const n = knownAmount(value); if (n == null) throw new Error('Importo fonte assente'); return n }

async function main() {
  const observedAt = new Date().toISOString()
  const tables = ['pl_months', 'pl_revenue_lines', 'pl_cost_lines', 'clients', 'revenue_streams', 'revenue_installments',
    'revenue_stream_projects', 'cost_items', 'cost_centers', 'pl_config', 'pl_partners', 'invoices', 'bank_accounts', 'bank_transactions',
    'payment_allocations', 'bank_tx_lines', 'pl_payouts', 'hr_people', 'hr_invoices', 'hr_payslips', 'payslips',
    'bank_tx_payslips', 'f24_documents', 'f24_lines', 'vat_settlements', 'economics_documents', 'hr_f24']
  const columns: Record<string, string> = {
    clients: 'id,display_name,company_name,sales_owner_id,sales_owner_name,client_label,is_internal',
    hr_people: 'id,profile_id,full_name',
    economics_documents: 'id,kind,filename,period,person_id,f24_id,sha256,storage_key',
  }
  const data = Object.fromEntries(await Promise.all(tables.map(async table => [table, await read(table, columns[table] ?? '*')] as const)))
  const accounts = data.bank_accounts.map(a => ({ ...a, opening_balance: numeric(a.opening_balance),
    statement_balance: a.statement_balance == null ? null : numeric(a.statement_balance) })) as unknown as LabBankAccount[]
  const txs = data.bank_transactions.map(t => ({ ...t, amount: numeric(t.amount) })) as unknown as LabBankTx[]
  const resourceTxs: ResourceTx[] = txs.map(t => ({ id: t.id, accountId: t.account_id,
    currency: accounts.find(a => a.id === t.account_id)?.currency ?? '', date: t.booked_on, amount: t.amount,
    source: t.source, kind: t.kind, payslipId: t.payslip_id ?? null, hrInvoiceId: t.hr_invoice_id ?? null, invoiceId: t.invoice_id }))
  const invoices = toLabInvoices(data.invoices)
  const input = { today, observedAt, months: data.pl_months, revenue: data.pl_revenue_lines, costs: data.pl_cost_lines,
    clients: data.clients, streams: data.revenue_streams, installments: data.revenue_installments, links: data.revenue_stream_projects,
    items: data.cost_items, costCenters: data.cost_centers, config: data.pl_config, partners: data.pl_partners, invoices, accounts, txs,
    allocations: data.payment_allocations, legacy: data.bank_tx_lines, payouts: data.pl_payouts } as unknown as Omit<EconomicsInput, 'month'>
  const rowLabel = (row: Row) => ({ id: row.id, label: row.label, month: data.pl_months.find(m => m.id === row.month_id)?.month,
    invoiceId: row.invoice_id ?? null, net: knownAmount(row.amount_net ?? row.actual) })
  const active = data.payment_allocations.filter(a => !a.superseded)
  const invoiceData = (id: unknown) => { const doc = invoices.find(d => d.id === id); return doc ? {id:doc.id,number:doc.number,date:doc.issuedOn,counterparty:doc.counterpartyName,total:doc.total,direction:doc.direction} : null }
  const quote = (a: Row) => ({ id: a.id, revenueLine: a.revenue_line_id ?? null, costLine: a.cost_line_id ?? null,
    payoutId: a.payout_id ?? null, f24Id: a.f24_id ?? null, amount: knownAmount(a.amount), evidence: a.evidence ?? null })
  const months = selectedMonths.map(month => {
    const accrual = economicAccrual({ ...input, month }), cash = economicCash(accounts, txs, month, today)
    return { month, report: economicsReport({ ok: true, observedAt, input: { ...input, month }, cash, accrual }), blockers: accrual.blockers, compensi: accrual.soci, previewRevenueCount: accrual.previewRevenueCount, previewTakenCount: accrual.previewTakenCount, omitted: accrual.omitted,
      missingRevenue: accrual.missingRevenue.map(r => ({ streamId: r.stream_id, installmentId: r.installment_id, label: r.label, net: r.amount_net, client: data.clients.find(c => c.id === data.revenue_streams.find(s => s.id === r.stream_id)?.client_id)?.company_name })),
      missingCosts: accrual.missingCosts.map(c => ({ id: c.id, label: c.label, amount: c.amount, projectId: c.project_id, supplier: c.supplier, center: data.cost_centers.find(center => center.id === (c as unknown as Row).center_id)?.name })),
      drift: accrual.drift, incomplete: accrual.incomplete,
      lines: accrual.lines.map(l => ({ ...rowLabel(l.row), side: l.side, issues: l.proof.issues, referenceIssues: l.proof.referenceIssues })),
      unresolvedTransfers: cash.unresolved.map(t => ({ id: t.id, date: t.booked_on, account: accounts.find(a => a.id === t.account_id)?.label, amount: t.amount, pairId: t.transfer_pair_id })) }
  })
  const allProof = economicAccrual({ ...input, month: selectedMonths.at(-1)! }).proof
  const disputedRows = [...input.revenue, ...input.costs].filter(r => allProof.get(String(r.id))?.issues.some(s => s.includes('concorrenti')))
  const disputes = disputedRows.map(row => ({ ...rowLabel(row), referenceIssues: allProof.get(String(row.id))?.referenceIssues, invoice: invoiceData(row.invoice_id), movements: txs.filter(t =>
    [...active, ...input.legacy].some(a => a.tx_id === t.id && (a.revenue_line_id === row.id || a.cost_line_id === row.id))
    || t.revenue_line_id === row.id || t.cost_line_id === row.id).map(t => ({ id: t.id, date: t.booked_on,
      account: accounts.find(a => a.id === t.account_id)?.label, amount: t.amount, description: t.description, invoiceId: t.invoice_id, invoice: invoiceData(t.invoice_id), directRevenueId: t.revenue_line_id, directCostId: t.cost_line_id,
      current: active.filter(a => a.tx_id === t.id).map(quote), legacy: input.legacy.filter(a => a.tx_id === t.id).map(quote) })) }))
  const candidates = disputedRows.flatMap(row => {
    const issues = allProof.get(String(row.id))!.referenceIssues
    if (row.invoice_id || !issues.length || issues.some(i => i.code !== 'fattura_riga_assente')) return []
    const ids = Array.from(new Set(issues.map(i => txs.find(t => t.id === i.txId)?.invoice_id).filter((id): id is string => !!id)))
    if (ids.length !== 1 || !invoices.some(i => i.id === ids[0])) return []
    return [{ row, invoiceId: ids[0], txIds: Array.from(new Set(issues.map(i => i.txId))) }]
  })
  const proposedRows = [...input.revenue, ...input.costs].map(row => {
    const candidate = candidates.find(c => c.row.id === row.id)
    return candidate ? { ...row, invoice_id: candidate.invoiceId } : row
  })
  const proposedProof = economicProof(proposedRows, txs, accounts, invoices, active, input.legacy, today)
  const documentProposals = candidates.map(candidate => {
    const siblings = proposedRows.filter(r => r.invoice_id === candidate.invoiceId)
    const p = proposedProof.get(String(candidate.row.id))!
    const groupIssues = siblings.flatMap(row => proposedProof.get(String(row.id))!.issues)
    const ready = siblings.every(r => {
      const proof = proposedProof.get(String(r.id))!
      return proof.documentOk && proof.completedOn != null && proof.issues.length === 0
    })
    return { ...rowLabel(candidate.row), table: input.revenue.some(r => r.id === candidate.row.id) ? 'pl_revenue_lines' : 'pl_cost_lines', proposedInvoice: invoiceData(candidate.invoiceId), txIds: candidate.txIds,
      canonicalChecksPassed: ready, hypotheticalCovered: p.covered, hypotheticalCompletedOn: p.completedOn,
      pendingIssues: Array.from(new Set(groupIssues)), applied: false }
  })
  const fiscal = vatPeriods(input.months.filter(m => String(m.month) <= today), input.revenue, input.costs, data.vat_settlements, invoices, today)
  const report = { observedAt, asOf: today, transactionalSnapshot: false, readonly: true,
    counts: Object.fromEntries(tables.map(t => [t, data[t].length])), months, disputes, documentProposals,
    excludedPayrollPlan: input.items.filter(it => !economicPlanItems(input).includes(it)).map(it => ({id:it.id,label:it.label,amount:it.amount})),
    forecastKnown: labForecast({ ...input, month: selectedMonths.at(-1)! }, forecastOptions({})).base.rows.map(r => ({month:r.month,revenue:r.revenue,knownCost:r.knownCost})),
    bank: accounts.map(a => { const r = bankReadout(a, txs, selectedMonths.at(-1)!, today); return {
      id: a.id, label: a.label, currency: a.currency, parentId: a.parent_id, openingDate: a.opening_date,
      openingBalance: a.opening_balance, statementOn: a.statement_on, statementBalance: a.statement_balance,
      statementDifference: r.statementDifference, lastBookedOn: r.lastBookedOn, beforeOpening: r.beforeOpening } }),
    f24CandidateInput: candidateTotal,
    f24Candidates: txs.filter(t => t.source === 'banca' && candidateTotal != null && Math.round(t.amount * 100) === -Math.round(candidateTotal * 100)).map(t => ({id:t.id,date:t.booked_on,amount:t.amount,description:t.description,account:accounts.find(a=>a.id===t.account_id)?.label,source:t.source,kind:t.kind,invoiceId:t.invoice_id,revenueLineId:t.revenue_line_id,costLineId:t.cost_line_id,payslipId:t.payslip_id,hrInvoiceId:t.hr_invoice_id,currentAllocations:active.filter(a=>a.tx_id===t.id).map(quote),legacyAllocations:input.legacy.filter(a=>a.tx_id===t.id).map(quote)})),
    hrF24: data.hr_f24.map(f=>({id:f.id,month:f.month,erarioGross:f.erario_gross,creditOffset:f.credit_offset,erarioBalance:f.erario_balance,inps:f.inps,inail:f.inail,total:f.total,paidOn:f.paid_on})),
    hrInvoices: data.hr_invoices.map(r => ({ id: r.id, person: data.hr_people.find(p => p.id === r.person_id)?.full_name,
      month: r.month, number: r.invoice_number, invoiceId: r.invoice_id, total: knownAmount(r.total_invoice), due: knownAmount(r.amount_to_pay),
      possibleDocuments: invoices.filter(i => i.direction === 'ricevuta' && r.invoice_number != null && i.number === r.invoice_number)
        .map(i => ({ id: i.id, number: i.number, counterparty: i.counterpartyName, date: i.issuedOn, total: i.total })) })),
    f24: data.f24_documents.map(h => { const r = resourceF24(h, data.f24_lines, active, resourceTxs, today); return {
      id: h.id, dueDate: h.due_date, total: knownAmount(h.total), paidOn: h.paid_on, check: r.checked, moved: r.moved,
      components: r.doc?.lines, payments: r.entries.map(e => ({ id: e.tx.id, date: e.tx.date, amount: e.amount })) } }),
    vat: fiscal.map(p => ({ key: p.key, due: p.due, estimated: p.estimated, model: p.settlement?.id ?? null,
      missingMonths: p.missingMonths, payment: vatPayment(p.settlement, data.f24_documents, data.f24_lines, active, resourceTxs, today) })),
    payouts: data.pl_payouts.map(p => ({ id: p.id, month: data.pl_months.find(m => m.id === p.month_id)?.month,
      person: p.person_label, kind: p.kind, amount: knownAmount(p.amount), dueMonth: p.due_month, paid: p.paid, paidOn: p.paid_on,
      payments: active.filter(a => a.payout_id === p.id).map(a => ({ ...quote(a), txId: a.tx_id })) })),
    originals: data.economics_documents.map(d => ({ id: d.id, kind: d.kind, filename: d.filename, period: d.period,
      personId: d.person_id, f24Id: d.f24_id, sha256: d.sha256, hasStorageKey: !!d.storage_key })) }
  const output = arg('--out')
  if (output) {
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify({ output, observedAt, months: months.map(m => ({ month: m.month, missingRevenue: m.missingRevenue.length,
      missingCosts: m.missingCosts.length, drift: m.drift.length })), disputedRows: disputes.length,
      f24: report.f24.map(f => ({ dueDate: f.dueDate, total: f.total, moved: f.moved })), originals: report.originals.length }))
  } else console.log(JSON.stringify(report, null, 2))
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Audit non completato'); process.exitCode = 1 })
