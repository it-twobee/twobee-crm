import { matchingSources } from '@/lib/lab-matching'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reconciliationSnapshotConsistent, reconciliationDay, reconciliationStateMatches } from '@/lib/lab-reconciliations'
import { invoiceBankReconciliation, invoiceBankCash } from '@/lib/lab-invoice-bank'
import { toLabInvoices } from '@/lib/lab-invoices'
import type { ReconciliationHead, ReconciliationEvent } from '@/lib/lab-reconciliation-types'
import type { LabConnectionData } from '@/lib/lab-connections'
const head = { id: 'g', version: 1, status: 'active', verified_at: null } as ReconciliationHead
const item = { id: 'p', reconciliation_id: 'g', tx_id: 't', invoice_id: 'i', amount: 100 }
const event = { id: 'e', reconciliation_id: 'g', after_snapshot: { head, items: [item] } } as ReconciliationEvent
assert.ok(reconciliationSnapshotConsistent([head], [item], [event]))
assert.equal(reconciliationSnapshotConsistent([{ ...head, version: 2 }], [item], [event]), false)
assert.equal(reconciliationSnapshotConsistent([head], [{ ...item, amount: 99 }], [event]), false)
assert.equal(reconciliationSnapshotConsistent([], [item], []), false)
assert.equal(reconciliationSnapshotConsistent([head], [], [event]), false)
assert.equal(reconciliationSnapshotConsistent([head], [item], []), false)
assert.equal(reconciliationSnapshotConsistent([], [], []), true)
assert.equal(reconciliationDay('2026-11-16T23:30:00Z'), '2026-11-17')
assert.ok(reconciliationStateMatches(head, 'pending'))
assert.ok(!reconciliationStateMatches(head, 'verified'))
assert.ok(reconciliationStateMatches({ ...head, verified_at: '2026-11-17' }, 'verified'))
assert.ok(!reconciliationStateMatches({ ...head, status: 'cancelled' }, 'pending'))
assert.ok(reconciliationStateMatches({ ...head, status: 'cancelled' }, ''))
const docs = toLabInvoices([{ id: 'i', number: '1', issued_on: '2026-01-01', direction: 'emessa', sign: 1, currency: 'EUR', taxable: 300, vat_amount: 0, total: 300, withholding: 0 }])
const refs: LabConnectionData = { revenue: [], costs: [], months: [], allocations: [], legacy: [], slips: [], hrInvoices: [], pdfs: [], salaryLinks: [], people: [], f24: [], f24Lines: [], settlements: [], payouts: [], invoiceShares: [item, { ...item, id: 'p2', tx_id: 't2', amount: 200 }] }
const txs = [{ id: 't', account_id: 'a', booked_on: '2026-01-02', amount: 100, source: 'banca', kind: 'incasso' }, { id: 't2', account_id: 'a', booked_on: '2026-02-01', amount: 200, source: 'banca', kind: 'incasso' }] as Parameters<typeof invoiceBankReconciliation>[1]
const proof = invoiceBankReconciliation(docs, txs, [{ id: 'a', label: 'Conto', currency: 'EUR' }], refs, '2026-11-17')
assert.equal(proof.invoices.get('i')?.paidKnown, 300)
assert.equal(proof.invoices.get('i')?.residual, 0)
assert.equal(proof.invoices.get('i')?.entries.length, 2)
assert.equal(invoiceBankCash(proof, ['i']).incoming, 300)
const partial = invoiceBankReconciliation(docs, txs, [{ id: 'a', label: 'Conto', currency: 'EUR' }], { ...refs, invoiceShares: [item] }, '2026-11-17')
assert.equal(partial.invoices.get('i')?.residual, 200)
const clash = invoiceBankReconciliation(docs, [{ ...txs[0], invoice_id: 'i' }], [{ id: 'a', label: 'Conto', currency: 'EUR' }], { ...refs, invoiceShares: [item] }, '2026-11-17')
assert.equal(clash.invoices.get('i')?.paidKnown, null, 'Overlapping legacy and new records cannot double the cash')
const refundedDocs = toLabInvoices([{ id: 'root', number: '1', issued_on: '2026-01-01', direction: 'emessa', sign: 1, currency: 'EUR', taxable: 100, vat_amount: 0, total: 100, withholding: 0 }, { id: 'credit', number: 'NC1', doc_type: 'TD04', issued_on: '2026-02-01', direction: 'emessa', sign: -1, currency: 'EUR', taxable: 100, vat_amount: 0, total: 100, withholding: 0, rectifies_id: 'root' }])
const refund = invoiceBankReconciliation(refundedDocs, [{ ...txs[0], amount: -100 }], [{ id: 'a', label: 'Conto', currency: 'EUR' }], { ...refs, invoiceShares: [{ ...item, invoice_id: 'credit' }] }, '2026-11-17')
assert.equal(refund.invoices.get('credit')?.paidKnown, 100)
assert.equal(invoiceBankCash(refund, ['credit']).outgoing, 100)
const noCash = invoiceBankReconciliation(refundedDocs, [], [{ id: 'a', label: 'Conto', currency: 'EUR' }], { ...refs, invoiceShares: [] }, '2026-11-17')
const documentOnly = matchingSources([], [], refundedDocs, { ...refs, invoiceShares: [] }, noCash, '2026-11-17')
assert.equal(documentOnly.invoices.find(d => d.id === 'credit')?.remaining, null)
const cashRefund = matchingSources([], [], refundedDocs, refs, refund, '2026-11-17')
assert.equal(cashRefund.invoices.find(d => d.id === 'credit')?.paid, 100)
for (const path of ['app/api/lab/reconciliations/route.ts']) {
 const source = readFileSync(path, 'utf8'); assert.match(source, /requireEconomicsAdmin/); assert.match(source, /requireLabAdmin/); assert.match(source, /createActorClient\(actor\)/); assert.match(source, /no-store/); assert.match(source, /data.basis !== input.basis/)
}
console.log('Tutti i controlli passano')
