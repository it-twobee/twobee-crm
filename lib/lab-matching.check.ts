import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { matchingPlan, matchingSources, type MatchMovement, type MatchDocument } from '@/lib/lab-matching'
import { invoiceBankReconciliation } from '@/lib/lab-invoice-bank'
import { toLabInvoices } from '@/lib/lab-invoices'
import type { LabBankAccount, LabBankTx } from '@/lib/lab-bank'
import type { LabConnectionData } from '@/lib/lab-connections'
const m = (id: string, amount: number, more = {}): MatchMovement => ({ id, label: id, date: '2026-10-10', account: 'Conto', currency: 'EUR', signedAmount: amount, available: Math.abs(amount), why: null, href: '/lab/banca', ...more })
const d = (id: string, remaining: number, more = {}): MatchDocument => ({ id, label: id, date: '2026-09-01', currency: 'EUR', direction: 1, total: remaining, paid: null, remaining, why: null, href: '/lab/fatturazione', ...more })
const oneMany = matchingPlan([m('t', 300)], [d('a', 100), d('b', 200)], ['t'], ['a', 'b'])
assert.deepEqual(oneMany.pairs.map(p => p.amount), [100, 200])
assert.equal(oneMany.total, 300)
assert.deepEqual(oneMany.movementRemainders, [{ id: 't', amount: 0 }])
const manyOne = matchingPlan([m('a', 100), m('b', 200)], [d('i', 300)], ['a', 'b'], ['i'])
assert.deepEqual(manyOne.pairs.map(p => p.amount), [100, 200])
assert.deepEqual(manyOne.documentRemainders, [{ id: 'i', amount: 0 }])
assert.equal(matchingPlan([m('t', 100)], [d('i', 300)], ['t'], ['i']).documentRemainders[0].amount, 200)
assert.equal(matchingPlan([m('t', 300)], [d('i', 100)], ['t'], ['i']).movementRemainders[0].amount, 200)
assert.equal(matchingPlan([m('t', 300)], [d('i', 100)], ['t', 't'], ['i', 'i']).total, 100)
assert.equal(matchingPlan([m('a', 100), m('b', 50)], [d('i', 300)], ['a', 'b'], ['i']).documentRemainders[0].amount, 150)
assert.ok(matchingPlan([m('t', 100)], [d('a', 100), d('b', 200)], ['t'], ['a', 'b']).issues.length)
assert.ok(matchingPlan([m('a', 200), m('b', 200)], [d('i', 300)], ['a', 'b'], ['i']).issues.length)
assert.ok(matchingPlan([m('a', 100), m('b', 200)], [d('i', 100), d('j', 200)], ['a', 'b'], ['i', 'j']).issues.length)
assert.ok(matchingPlan([m('t', -100)], [d('i', 100)], ['t'], ['i']).issues.length)
assert.equal(matchingPlan([m('t', -100)], [d('i', 100, { direction: -1 })], ['t'], ['i']).total, 100, 'Refund direction remains explicit')
assert.ok(matchingPlan([m('t', 100)], [d('i', 100, { currency: 'USD' })], ['t'], ['i']).issues.length)
assert.ok(matchingPlan([m('t', 100, { available: null })], [d('i', 100)], ['t'], ['i']).issues.length)
assert.ok(matchingPlan([m('t', 100)], [d('i', 100)], ['missing'], ['i']).issues.length)
assert.equal(matchingPlan([m('t', 0.3)], [d('a', 0.1), d('b', 0.2)], ['t'], ['a', 'b']).movementRemainders[0].amount, 0)
const account = { id: 'a', label: 'Conto', currency: 'EUR' } as LabBankAccount
const tx = { id: 't', account_id: 'a', amount: 100, source: 'banca', booked_on: '2026-10-10', kind: 'incasso' } as LabBankTx
const docs = toLabInvoices([{ id: 'i', direction: 'emessa', sign: 1, number: '1', issued_on: '2026-09-01', total: 300, taxable: 300, vat_amount: 0, withholding: 0, currency: 'EUR' }])
const refs: LabConnectionData = { revenue: [], costs: [], months: [], allocations: [], legacy: [], slips: [], hrInvoices: [], pdfs: [], salaryLinks: [], people: [], f24: [], f24Lines: [], settlements: [], payouts: [] }
const source = (txs = [tx], more = {}) => { const all = { ...refs, ...more }; return matchingSources([account], txs, docs, all, invoiceBankReconciliation(docs, txs, [account], all, '2026-11-16'), '2026-11-16') }
assert.equal(source().movements[0].available, 100)
assert.equal(source().invoices[0].remaining, 300)
const partial = source([{ ...tx, invoice_id: 'i' }, { ...tx, id: 'second', amount: 200 }])
assert.equal(partial.invoices[0].remaining, 200)
assert.equal(partial.movements[0].available, null, 'Direct reference reserves its movement')
assert.equal(matchingPlan(partial.movements, partial.invoices, ['second'], ['i']).total, 200)
const allocation = { id: 'p', tx_id: 't', f24_id: 'f', amount: 40, evidence: 'certificata' }
assert.equal(source([tx], { allocations: [allocation] }).movements[0].available, 60, 'Other recipients retain their capacity')
assert.equal(source([tx], { allocations: [allocation], legacy: [{ ...allocation, amount: 50 }] }).movements[0].available, null)
assert.equal(source([{ ...tx, payslip_id: 's' }], { allocations: [allocation] }).movements[0].available, null)
assert.equal(source([{ ...tx, kind: 'giroconto' }]).movements[0].available, null)
assert.equal(source([{ ...tx, kind: 'commissione', amount: -1.5 }]).movements[0].available, null)
assert.match(source([{ ...tx, kind: 'commissione', amount: -1.5 }]).movements[0].why ?? '', /Commissione bancaria/)
assert.equal(source([{ ...tx, source: 'manuale' }]).movements.length, 0)
assert.equal(source([{ ...tx, booked_on: '2026-11-17' }]).movements.length, 0)
const before = JSON.stringify({ tx, docs, refs }); source(); assert.equal(JSON.stringify({ tx, docs, refs }), before)
for (const path of ['lib/lab-reconciliations-load.ts', 'app/(dashboard)/lab/abbina/page.tsx']) {
  const text = readFileSync(path, 'utf8'); assert.match(text, /await requireLabAdmin\(\)/); assert.doesNotMatch(text, /\.\s*(insert|update|upsert|delete|rpc)\s*\(/)
}
console.log('Tutti i controlli passano')
