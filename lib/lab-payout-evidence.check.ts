import assert from 'node:assert/strict'
import { payoutEvidence } from '@/lib/lab-payout-evidence'
import type { LabBankTx, LabBankAccount } from '@/lib/lab-bank'
const p = { id: 'payout', month_id: 'month', person_key: 'p:marco', kind: 'socio', amount: 150, paid: true }
const tx = { id: 'tx', account_id: 'bank', source: 'banca', kind: 'pagamento', booked_on: '2026-11-10', amount: -150 } as LabBankTx
const bank = { id: 'bank', currency: 'EUR' } as LabBankAccount
const quote = { id: 'q', tx_id: 'tx', payout_id: 'payout', amount: 150, evidence: 'certificata' }
const check = (parts = [quote], t = tx, a = bank, legacy: Record<string, unknown>[] = []) => payoutEvidence([p], parts, legacy, [t], [a], '2026-11-16')[0]
assert.equal(check().paidKnown, 150)
assert.equal(check().residual, 0)
assert.equal(check([{ ...quote, amount: 50 }]).paidKnown, 50)
assert.equal(check([{ ...quote, amount: 50 }]).residual, 100)
assert.equal(check([]).paidKnown, null, 'A paid flag is not bank proof')
assert.equal(check([]).residual, null, 'Absence of a bank link is not proof of zero payments')
for (const change of [{ source: 'derivato' }, { amount: 150 }, { booked_on: '2026-11-17' }, { cost_line_id: 'cost' }, { invoice_id: 'invoice' }, { payslip_id: 'slip' }, { hidden_reason: 'personale' }, { transfer_pair_id: 'other' }, { kind: 'giroconto' }]) assert.equal(check([quote], { ...tx, ...change } as LabBankTx).paidKnown, null)
assert.equal(check([quote], tx, { ...bank, currency: 'USD' }).paidKnown, null)
assert.equal(check([quote], tx, { ...bank, parent_id: 'other' }).paidKnown, null)
assert.equal(check([quote], tx, bank, [{ tx_id: 'tx', cost_line_id: 'cost', amount: 150 }]).paidKnown, null)
assert.equal(check([{ ...quote, evidence: 'dichiarata' }]).paidKnown, null)
assert.equal(check([{ ...quote, amount: 151 }]).paidKnown, null)
assert.equal(check([quote, { ...quote, id: 'q2' }]).paidKnown, null, 'Repeated destination is a conflict')
const cumulative = payoutEvidence([p], [quote, { id: 'q2', tx_id: 'tx', payout_id: 'other', amount: 10, evidence: 'certificata' }], [], [tx], [bank], '2026-11-16')[0]
assert.equal(cumulative.paidKnown, null, 'Global capacity includes other payouts')
assert.equal(payoutEvidence(undefined, [], [], [], [], '2026-11-16').length, 0)
console.log('Tutti i controlli passano')
