import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resourceCost, resourceGroup, salaryEvidence, resourceF24, privateResourceKey, type ResourceTx } from '@/lib/lab-resources'
import { PAYSLIP_FIELDS } from '@/lib/payroll-map'
import { nextMonth20 } from '@/lib/cash-calendar'
import { toLabInvoices } from '@/lib/lab-invoices'

const month = '2026-10-01', today = '2026-11-14'
const person = { id: 'p', profile_id: 'profile', contract_kind: 'indeterminato' }
const slip = { ...Object.fromEntries(PAYSLIP_FIELDS.map(f => [f.key, 0])), id: 's', person_id: 'p', month,
  total_earnings: 2000, contributory_base: 2000, net_paid: 1500, employer_contrib: 600, inail: 10, tfr_accrued: 148 }
const params = [{ year: 2026, inps_employer_pct: 0.3, inps_apprentice_pct: 0.115, inail_pct: 0.005 }]
assert.equal(resourceGroup('indeterminato'), 'dipendenti')
assert.equal(resourceGroup('piva_forfettario'), 'professionisti')
assert.equal(resourceGroup('unknown'), 'altro')
assert.equal(resourceCost(person, [], [], [], params, month).value, null)
assert.equal(resourceCost(person, [slip], [], [], params, month).value, 2758)
assert.equal(resourceCost(person, [{ ...slip, employer_contrib: null }], [], [], params, month).estimated, true)
assert.equal(resourceCost(person, [{ ...slip, net_paid: null }], [], [], params, month).value, null, 'Importo mancante non diventa zero nel mapper')
assert.equal(resourceCost(person, [slip], [], [], [], month).value, null)
const pdfs = [{ id: 'pdf', profile_id: 'profile', year: 2026, month: 10 }, { id: 'other', profile_id: 'other-profile', year: 2026, month: 10 }]
const links = [{ tx_id: 'tx', payslip_id: 'pdf', amount: 1500 }, { tx_id: 'tx', payslip_id: 'other', amount: 1600 }]
const bank: ResourceTx = { id: 'tx', accountId: 'a', currency: 'EUR', date: '2026-11-12', amount: -3100,
  source: 'banca', kind: 'stipendio', payslipId: null, hrInvoiceId: null, invoiceId: null }
const paid = (txs = [bank], batch = links, allocations: Record<string, unknown>[] = []) => salaryEvidence(person, [person], pdfs, [slip], batch, txs, allocations, month, today)
assert.equal(paid().paid, 1500, 'Ottobre pagato a novembre conserva la competenza')
assert.equal(paid([{ ...bank, source: 'derivato' }]).paid, null)
assert.equal(paid([{ ...bank, amount: 3100 }]).paid, null)
assert.equal(paid([{ ...bank, currency: 'USD' }]).paid, null)
assert.equal(paid([{ ...bank, date: '2026-11-15' }]).paid, null)
assert.equal(paid([bank], links.slice(0, 1)).paid, null, 'Distinta incompleta non assegna la differenza a una persona')
assert.equal(paid([bank], links, [{ tx_id: 'tx', amount: 3100 }]).paid, null, 'Registri concorrenti da raccordare')
assert.equal(salaryEvidence(person, [person, { ...person, id: 'other-hr' }], pdfs, [slip], links, [bank], [], month, today).paid, null)
assert.equal(salaryEvidence({ ...person, profile_id: null }, [person], [{ id: 'x', profile_id: null, year: 2026, month: 10 }], [], links, [bank], [], month, today).pdfs.length, 0)
assert.equal(nextMonth20(month), '2026-11-20')
assert.equal(nextMonth20('2026-12-01'), '2027-01-20')

const canonicalRaw = { id: 'i', direction: 'ricevuta', doc_type: 'TD01', number: '1', issued_on: month,
  taxable: 1000, vat_amount: 220, total: 1220, sign: 1, currency: 'EUR', withholding: 0 }
const canonical = toLabInvoices([canonicalRaw])
assert.throws(() => toLabInvoices([{ ...canonicalRaw, vat_amount: null }]))
const inv = { id: 'h', person_id: 'f', month, invoice_id: 'i', taxable: 1000, pension_fund: 0, vat: 220,
  vat_deductible: true, withholding: 0, total_invoice: 1220, amount_to_pay: 1220 }
const freelance = { id: 'f', contract_kind: 'piva_ordinario' }
assert.equal(resourceCost(freelance, [], [inv], canonical, params, month).value, 1000)
assert.equal(resourceCost(freelance, [], [inv], canonical, params, month).net, null)
assert.equal(resourceCost(freelance, [], [inv], [], params, month).value, null)
assert.equal(resourceCost(freelance, [], [inv, { ...inv, id: 'h2', person_id: 'another' }], canonical, params, month).value, null)
assert.equal(resourceCost(freelance, [], [{ ...inv, total_invoice: 1200 }], canonical, params, month).value, null)
assert.equal(resourceCost(freelance, [], [{ ...inv, taxable: 900, pension_fund: 0 }], canonical, params, month).value, null)

const f24 = { id: 'f24', due_date: '2026-11-16', total: 1100 }
const rows = [
  { id: 'l1', doc_id: 'f24', codice: '6033', label: 'IVA', kind: 'iva', amount: 1000, period: '2026-09-01' },
  { id: 'l2', doc_id: 'f24', codice: '1001', label: 'Ritenute', kind: 'ritenute', amount: 200, period: month },
  { id: 'l3', doc_id: 'f24', codice: 'c', label: 'Credito', kind: 'credito', amount: 100, period: month },
]
const a = [{ id: 'a', tx_id: 'tax', f24_id: 'f24', amount: 1100, evidence: 'certificata' }]
const tax = { ...bank, id: 'tax', amount: -1100, kind: 'imposta' }
assert.equal(resourceF24(f24, rows, a, [tax], today).checked?.ok, true)
assert.equal(resourceF24(f24, rows, a, [tax], today).moved, 1100)
assert.equal(resourceF24(f24, rows, a, [{ ...tax, source: 'manuale' }], today).moved, null)
assert.equal(resourceF24(f24, rows, [...a, { ...a[0], id: 'double', amount: 10 }], [tax], today).moved, null)
assert.equal(resourceF24(f24, [], a, [tax], today).doc, null)
assert.equal(privateResourceKey('cedolino', 'payslips/profile/month.pdf'), true)
assert.equal(privateResourceKey('personale', 'personal/profile/doc.pdf'), true)
assert.equal(privateResourceKey('economico', 'economics/file.pdf'), true)
assert.equal(privateResourceKey('personale', 'payslips/profile/month.pdf'), false)
assert.equal(privateResourceKey('economico', 'economics/../private/file'), false)
assert.equal(privateResourceKey('cedolino', 'https://example.test/file'), false)

for (const path of ['lib/lab-resources-load.ts', 'app/(dashboard)/lab/risorse/page.tsx', 'app/api/lab/risorse/documenti/[id]/route.ts']) {
  const source = readFileSync(path, 'utf8')
  assert.match(source, /await requireLabAdmin\(\)/)
  assert.doesNotMatch(source, /\.\s*(insert|update|upsert|delete|rpc)\s*\(/)
  assert.doesNotMatch(source, /from ['"]@\/app\/(actions|api)\//)
}
console.log('Tutti i controlli passano')
