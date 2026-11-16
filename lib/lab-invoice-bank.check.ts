import assert from 'node:assert/strict'
import { invoiceBankCash, invoiceBankReconciliation, type DocumentBankTx } from '@/lib/lab-invoice-bank'
import { toLabInvoices } from '@/lib/lab-invoices'
import type { LabConnectionData } from '@/lib/lab-connections'
const today = '2026-11-16'
const invoice = (id = 'i', extra = {}) => toLabInvoices([{ id, direction: 'emessa', sign: 1, number: id, issued_on: '2026-09-01', taxable: 100, vat_amount: 22, total: 122, withholding: 0, currency: 'EUR', ...extra }])[0]
const tx = (id = 't', extra = {}) => ({ id, account_id: 'a', source: 'banca', kind: 'incasso', amount: 122, booked_on: '2026-10-10', invoice_id: 'i', ...extra }) as DocumentBankTx
const accounts = [{ id: 'a', label: 'Conto', currency: 'EUR' }]
const refs: Pick<LabConnectionData, 'revenue' | 'costs' | 'allocations' | 'legacy' | 'hrInvoices'> = { revenue: [], costs: [], allocations: [], legacy: [], hrInvoices: [] }
const run = (docs = [invoice()], txs = [tx()], more = {}) => invoiceBankReconciliation(docs, txs, accounts, { ...refs, ...more }, today)
assert.equal(run().invoices.get('i')?.paidKnown, 122)
assert.equal(run().invoices.get('i')?.residual, 0)
assert.equal(run().invoices.get('i')?.state, 'coperta')
assert.equal(run([invoice('i', { paid_on: today })], []).invoices.get('i')?.paidKnown, null)
assert.equal(run([invoice()], [tx('manual', { source: 'manuale' })]).invoices.get('i')?.state, 'senza_riscontro')
assert.equal(run([invoice()], [tx('future', { booked_on: '2026-11-17' })]).invoices.get('i')?.paidKnown, null)
const realAndDerived = run([invoice()], [tx(), tx('derived', { source: 'derivato', amount: 122 })])
assert.equal(realAndDerived.invoices.get('i')?.paidKnown, 122)
assert.equal(realAndDerived.invoices.get('i')?.state, 'coperta', 'A derived mirror cannot change consolidated bank facts')
assert.equal(run([invoice()], [tx('part', { amount: 50 })]).invoices.get('i')?.residual, 72)
assert.equal(run([invoice()], [tx('p1', { amount: 50 }), tx('p2', { amount: 72 })]).invoices.get('i')?.paidKnown, 122)
assert.equal(run([invoice()], [tx('over', { amount: 130 })]).invoices.get('i')?.state, 'eccedente')
assert.equal(run([invoice()], [tx('wrong', { amount: -122 })]).invoices.get('i')?.paidKnown, null)
assert.equal(run([invoice('i', { direction: 'ricevuta' })], [tx('out', { amount: -122 })]).invoices.get('i')?.paidKnown, 122)
assert.equal(run([invoice('i', { sign: -1, doc_type: 'TD04' })], [tx('refund', { amount: -122 })]).invoices.get('i')?.paidKnown, 122)
assert.equal(run([invoice('i', { direction: 'ricevuta', sign: -1, doc_type: 'TD04' })], [tx()]).invoices.get('i')?.paidKnown, 122)
const allocations = [{ id: 'a1', tx_id: 't', revenue_line_id: 'r', amount: 50, evidence: 'certificata' }, { id: 'a2', tx_id: 't', revenue_line_id: 's', amount: 72, evidence: 'certificata' }]
const revenue = [{ id: 'r', invoice_id: 'i' }, { id: 's', invoice_id: 'j' }]
const split = run([invoice(), invoice('j')], [tx('t', { invoice_id: null })], { revenue, allocations })
assert.equal(split.invoices.get('i')?.paidKnown, 50)
assert.equal(split.invoices.get('j')?.paidKnown, 72)
assert.equal(split.transactions.get('t')?.attributed, 122)
assert.equal(invoiceBankCash(split, ['i', 'j', 'i']).incoming, 122, 'Cumulative cash is counted once, even with repeated selection IDs')
assert.equal(invoiceBankCash(split, ['i', 'j']).rows[0].date, '2026-10-01', 'Cash belongs to bank date, not September issue date')
const sameDocument = run([invoice()], [tx()], { revenue: [{ id: 'r', invoice_id: 'i' }, { id: 's', invoice_id: 'i' }], allocations, legacy: allocations })
assert.equal(sameDocument.invoices.get('i')?.paidKnown, 122, 'Two equivalent ledgers and direct invoice pointer do not triple the bank event')
const conflicting = run([invoice()], [tx()], { revenue, allocations, legacy: [{ ...allocations[0], amount: 49 }] })
assert.equal(conflicting.invoices.get('i')?.paidKnown, null)
assert.ok(conflicting.transactions.get('t')?.issues.some(i => i.includes('divergenti')))
const tooMuch = run([invoice(), invoice('j')], [tx()], { revenue, allocations: [{ ...allocations[0], amount: 100 }, allocations[1]] })
assert.equal(tooMuch.invoices.get('i')?.paidKnown, null, 'Capacity is checked across ALL recipients')
assert.equal(run([invoice()], [tx()], { revenue, allocations: [{ ...allocations[0], evidence: 'dichiarata' }] }).invoices.get('i')?.paidKnown, null)
assert.equal(run([invoice()], [tx()], { revenue, allocations: [allocations[0], { ...allocations[0], id: 'duplicate' }] }).invoices.get('i')?.paidKnown, null)
const noInvoiceOnLine = run([invoice()], [tx('t', { invoice_id: null })], { revenue: [{ id: 'r' }], allocations: [allocations[0]] })
assert.equal(noInvoiceOnLine.transactions.get('t')?.links.length, 0, 'A row without invoice cannot invent a document link')
const withheld = run([invoice('i', { withholding: 20 })], [tx('t', { amount: 102 })]).invoices.get('i')!
assert.equal(withheld.paidKnown, 102)
assert.equal(withheld.residual, null, 'Withholding cannot become a guessed payment balance')
assert.equal(run([invoice()], [tx('t', { transfer_pair_id: 'paired' })]).invoices.get('i')?.paidKnown, null)
assert.equal(invoiceBankReconciliation([invoice()], [tx()], [{ ...accounts[0], currency: 'USD' }], refs, today).invoices.get('i')?.paidKnown, null)
const hidden = run([invoice()], [tx('t', { hidden_reason: 'nascosto' })])
assert.equal(hidden.invoices.get('i')?.paidKnown, 122, 'Hiding a real bank fact never removes it from consolidated cash')
console.log('Tutti i controlli passano')
