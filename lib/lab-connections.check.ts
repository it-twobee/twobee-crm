import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transactionConnections, invoiceResourceConnections, connectionOverview, type LabConnectionData } from '@/lib/lab-connections'
import type { LabBankTx } from '@/lib/lab-bank'

const tx = { id: 'tx', booked_on: '2026-11-12', revenue_line_id: 'r', invoice_id: 'doc' } as LabBankTx
const data: LabConnectionData = {
  revenue: [{ id: 'r', label: 'Canone ottobre', month_id: 'oct', stream_id: 's', invoice_id: 'doc' }],
  costs: [{ id: 'c', label: 'Costo settembre', month_id: 'sep' }],
  months: [{ id: 'oct', month: '2026-10-01' }, { id: 'sep', month: '2026-09-01' }],
  allocations: [{ tx_id: 'tx', revenue_line_id: 'r', amount: 100 }, { tx_id: 'tx', cost_line_id: 'c', amount: 50 }],
  legacy: [{ tx_id: 'tx', revenue_line_id: 'r', amount: 1 }],
  slips: [{ id: 'hrslip', person_id: 'person', month: '2026-10-01' }],
  hrInvoices: [{ id: 'hri', person_id: 'person', month: '2026-09-01', invoice_id: 'canonical' }],
  pdfs: [{ id: 'pdf', profile_id: 'profile', year: 2026, month: 10 }],
  salaryLinks: [{ tx_id: 'salary', payslip_id: 'pdf', amount: 100 }],
  people: [{ id: 'person', profile_id: 'profile', full_name: 'Persona esempio' }],
  f24: [{ id: 'tax', due_date: '2026-08-20' }],
  f24Lines: [{ id: 'taxline', doc_id: 'tax', vat_settlement_id: 'vat' }],
  settlements: [{ id: 'vat', year: 2026, quarter: 2 }],
  payouts: [{ id: 'pay', month_id: 'oct', person_label: 'Socio esempio' }],
}
const overview = connectionOverview(data, '2026-10-01')
assert.equal(overview.revenue, 1)
assert.equal(overview.revenueWithoutInvoice, 0)
assert.equal(overview.costs, 0, 'La home non porta a ottobre i costi di settembre')
assert.equal(connectionOverview(data, '2026-09-01').costsWithoutInvoice, 1)
assert.equal(connectionOverview(data, '2026-12-01').registered, false, 'Mese assente distinguibile da registro senza righe')
assert.equal(connectionOverview({ ...data, hrInvoices: [{ id: 'missing', month: '2026-10-01' }] }, '2026-10-01').hrInvoicesWithoutDocument, 1)
const frozen = JSON.stringify(data)
const result = transactionConnections(tx, data)
assert.equal(result.links.filter(l => l.href.includes('riga=r&')).length, 1, 'Riferimenti alla stessa riga deduplicati senza sommare le quote discordanti')
assert.deepEqual(result.links.find(l => l.href.includes('riga=r&'))!.origins, ['Riferimento diretto', 'Registro quote corrente', 'Registro collegamenti storico'])
assert.ok(result.links.some(l => l.href.includes('m=2026-10-01') && l.href.includes('riga=r')), 'Competenza ottobre preservata sul movimento di novembre')
assert.ok(result.links.some(l => l.href.includes('m=2026-09-01') && l.href.includes('riga=c')), 'Cumulativo con competenze diverse mantiene entrambe')
assert.ok(result.links.some(l => l.href === '/lab/accordi?accordo=s'))
assert.ok(!JSON.stringify(result).includes('amount'), 'La navigazione non certifica o somma importi')
assert.equal(transactionConnections({ id: 'none' } as LabBankTx, data).links.length, 0, 'Nessun abbinamento da nome, importo o giorno simile')
const superseded = transactionConnections({ id: 'none' } as LabBankTx, { ...data, allocations: [{ tx_id: 'none', revenue_line_id: 'r', superseded: true }] })
assert.equal(superseded.links.length, 0, 'Quote sostituite non riattivate')
const salary = transactionConnections({ id: 'salary' } as LabBankTx, data)
assert.ok(salary.links.some(l => l.href === '/lab/risorse?m=2026-10-01&persona=person#risorsa-person'))
assert.equal(transactionConnections({ id: 'salary' } as LabBankTx, { ...data, people: [...data.people, { id: 'another', profile_id: 'profile' }] }).links.length, 0, 'Profilo ambiguo non sceglie una persona')
assert.ok(transactionConnections({ id: 'salary' } as LabBankTx, { ...data, people: [] }).issues.length)
assert.ok(transactionConnections({ id: 'direct', payslip_id: 'hrslip' } as LabBankTx, data).links.some(l => l.href.includes('persona=person')))
const hr = transactionConnections({ id: 'direct', hr_invoice_id: 'hri' } as LabBankTx, data)
assert.ok(hr.links.some(l => l.href === '/lab/fatturazione?documento=canonical'))
assert.ok(hr.links.some(l => l.href.includes('m=2026-09-01&persona=person')))
assert.equal(invoiceResourceConnections('other', data).links.length, 0)
assert.equal(invoiceResourceConnections('canonical', data).links.length, 1)
const tax = transactionConnections({ id: 'taxTx' } as LabBankTx, { ...data, allocations: [{ tx_id: 'taxTx', f24_id: 'tax' }] })
assert.ok(tax.links.some(l => l.href.includes('f24=tax#f24-tax')))
assert.ok(tax.links.some(l => l.href === '/lab/iva?periodo=2026-T2'))
const pay = transactionConnections({ id: 'payTx' } as LabBankTx, { ...data, allocations: [{ tx_id: 'payTx', payout_id: 'pay' }] })
assert.ok(pay.links.some(l => l.href === '/lab/conto-economico?m=2026-10-01#compensi'))
assert.ok(transactionConnections({ id: 'missing', cost_line_id: 'absent' } as LabBankTx, data).issues.length)
assert.equal(transactionConnections(tx, { ...data, months: [] }).links.some(l => l.href.includes('riga=')), false, 'Competenza mancante non ricavata dal giorno banca')
assert.equal(JSON.stringify(data), frozen, 'Nessuna modifica dei registri letti')
for (const path of ['lib/lab-connections-load.ts']) {
  const source = readFileSync(path, 'utf8')
  assert.match(source, /await requireLabAdmin\(\)/)
  assert.doesNotMatch(source, /\.\s*(insert|update|upsert|delete|rpc)\s*\(/)
}
console.log('Tutti i controlli passano')
