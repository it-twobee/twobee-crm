import assert from 'node:assert/strict'
import { invoiceBankCash, invoiceBankReconciliation, type DocumentBankTx } from '@/lib/lab-invoice-bank'
import { toLabInvoices } from '@/lib/lab-invoices'
import type { LabConnectionData } from '@/lib/lab-connections'
const today = '2026-11-16'
const invoice = (id = 'i', extra = {}) => toLabInvoices([{ id, direction: 'emessa', sign: 1, number: id, issued_on: '2026-09-01', taxable: 100, vat_amount: 22, total: 122, withholding: 0, currency: 'EUR', ...extra }])[0]
const tx = (id = 't', extra = {}) => ({ id, account_id: 'a', source: 'banca', kind: 'incasso', amount: 122, booked_on: '2026-10-10', invoice_id: 'i', ...extra }) as DocumentBankTx
const accounts = [{ id: 'a', label: 'Conto', currency: 'EUR' }]
const refs: Pick<LabConnectionData, 'revenue' | 'costs' | 'allocations' | 'legacy' | 'hrInvoices'> = { revenue: [], costs: [], allocations: [], legacy: [], hrInvoices: [] }
const run = (docs = [invoice()], txs = [tx()], more: Partial<LabConnectionData> = {}) => invoiceBankReconciliation(docs, txs, accounts, { ...refs, ...more }, today)
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
const indirectOnly = run([invoice(), invoice('j')], [tx('t', { invoice_id: null })], { revenue, allocations, legacy: allocations })
assert.equal(indirectOnly.invoices.get('i')?.paidKnown, null)
assert.equal(indirectOnly.invoices.get('j')?.paidKnown, null)
assert.equal(indirectOnly.transactions.get('t')?.links.length, 0)
const direct = run([invoice(), invoice('j')], [tx()], { revenue, allocations, legacy: [{ ...allocations[0], amount: 49 }] })
assert.equal(direct.invoices.get('i')?.paidKnown, 122, 'Conto economico e quote storiche non alterano il riferimento bancario diretto')
assert.equal(direct.invoices.get('j')?.paidKnown, null)
const twoTransfers = run([invoice(), invoice('j')], [tx(), tx('t2', { invoice_id: 'j' })], {
  revenue: [{ id: 'r', invoice_id: null }],
  allocations: [{ ...allocations[0], amount: 122 }, { ...allocations[0], id: 'second', tx_id: 't2', amount: 122 }],
})
assert.equal(twoTransfers.invoices.get('i')?.state, 'coperta')
assert.equal(twoTransfers.invoices.get('j')?.state, 'coperta')
assert.equal(invoiceBankCash(twoTransfers, ['i', 'j']).incoming, 244)
const invoiceShares = allocations.map((a, n) => ({ id: a.id, reconciliation_id: 'saved', tx_id: a.tx_id, invoice_id: n === 0 ? 'i' : 'j', amount: a.amount }))
const split = run([invoice(), invoice('j')], [tx('t', { invoice_id: null })], { revenue, allocations, invoiceShares })
assert.equal(split.invoices.get('i')?.paidKnown, 50)
assert.equal(split.invoices.get('j')?.paidKnown, 72)
assert.equal(split.transactions.get('t')?.attributed, 122)
assert.equal(invoiceBankCash(split, ['i', 'j', 'i']).incoming, 122, 'Cumulative cash is counted once, even with repeated selection IDs')
assert.equal(invoiceBankCash(split, ['i', 'j']).rows[0].date, '2026-10-01', 'Cash belongs to bank date, not September issue date')
const tooMuch = run([invoice(), invoice('j')], [tx('t', { invoice_id: null })], { invoiceShares: [{ ...invoiceShares[0], amount: 100 }, invoiceShares[1]] })
assert.equal(tooMuch.invoices.get('i')?.paidKnown, null, 'Capacity is checked across all documents')
const withheld = run([invoice('i', { withholding: 20 })], [tx('t', { amount: 102 })]).invoices.get('i')!
assert.equal(withheld.paidKnown, 102)
assert.equal(withheld.residual, null, 'Withholding cannot become a guessed payment balance')
assert.equal(run([invoice()], [tx('t', { transfer_pair_id: 'paired' })]).invoices.get('i')?.paidKnown, null)
assert.equal(invoiceBankReconciliation([invoice()], [tx()], [{ ...accounts[0], currency: 'USD' }], {}, today).invoices.get('i')?.paidKnown, null)
const hidden = run([invoice()], [tx('t', { hidden_reason: 'nascosto' })])
assert.equal(hidden.invoices.get('i')?.paidKnown, 122, 'Hiding a real bank fact never removes it from consolidated cash')
console.log('Tutti i controlli passano')
