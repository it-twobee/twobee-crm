import assert from 'node:assert/strict'
import { bankDocumentChecks, filterLabChecks, labChecksCsv, labCheckAnchor } from '@/lib/lab-checks'
import type { LabBankAccount, LabBankTx } from '@/lib/lab-bank'
import type { LabConnectionData } from '@/lib/lab-connections'
import { toLabInvoices } from '@/lib/lab-invoices'
const account = { id: 'a', label: 'Conto', currency: 'EUR', opening_date: '2026-01-01', opening_balance: 0, statement_balance: 122, statement_on: '2026-10-31' } as LabBankAccount
const tx = { id: 't', account_id: 'a', source: 'banca', booked_on: '2026-10-10', amount: 122, invoice_id: 'i', description: 'Incasso', kind: 'incasso' } as LabBankTx
const refs: LabConnectionData = { revenue: [], costs: [], months: [{ id: 'm', month: '2026-10-01' }], allocations: [], legacy: [], slips: [], hrInvoices: [], pdfs: [], salaryLinks: [], people: [], f24: [], f24Lines: [], settlements: [], payouts: [] }
const doc = toLabInvoices([{ id: 'i', direction: 'emessa', sign: 1, issued_on: '2026-09-01', number: '1', taxable: 100, vat_amount: 22, total: 122, withholding: 0, currency: 'EUR' }])[0]
const run = (txs = [tx], more = {}, docs = [doc]) => bankDocumentChecks([{ ...account, ...more }], txs, docs, refs, '2026-10-01', '2026-11-16')
assert.equal(run().length, 0, 'Known bank coverage does not invent an anomaly')
assert.ok(run([{ ...tx, amount: 50 }]).some(i => i.id === 'fattura:i' && i.amount === 72))
assert.ok(run([{ ...tx, booked_on: '2026-11-01' }]).some(i => i.id === 'fattura:i'), 'Future relative to selected month cannot cover a historical invoice')
assert.ok(run([], { statement_on: null }).some(i => i.id.endsWith('copertura')))
assert.ok(run([{ ...tx, invoice_id: null, kind: 'giroconto' }]).some(i => i.id === 'movimento:t' && i.priority === 'alta'))
assert.equal(run([{ ...tx, invoice_id: null, no_match_needed: true }], {}, []).some(i => i.id === 'movimento:t'), false)
assert.equal(run([{ ...tx, source: 'manuale' }]).some(i => i.id === 'movimento:t'), false)
const missing = run([{ ...tx, invoice_id: null }], {}, [])
assert.ok(missing.some(i => i.id === 'movimento:t' && i.priority === 'media'))
assert.ok(filterLabChecks(missing, 'banca', 'media', 'incasso').every(i => i.area === 'banca' && i.priority === 'media'))
assert.equal(filterLabChecks(missing, 'fatture', '', '').length, 0)
assert.ok(labChecksCsv([{ ...missing[0], title: '=BAD()', why: '"test";riga' }], 'test').includes("'=BAD()"))
assert.ok(labChecksCsv([{ ...missing[0], amount: null }], 'test').includes('n/d'))
assert.notEqual(labCheckAnchor('socio:Nome Cognome'), labCheckAnchor('socio-Nome-Cognome'))
assert.match(labCheckAnchor('socio:Nome Cognome'), /^[a-z0-9-]+$/)
assert.ok(labChecksCsv([{ ...missing[0], amount: -122 }], 'test').includes('"-122,00"'))
console.log('Tutti i controlli passano')
