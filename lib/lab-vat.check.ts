import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { vatPeriods, vatPayment, vatCash, vatReserve, vatDays, vatWhen } from '@/lib/lab-vat'
import { toLabInvoices } from '@/lib/lab-invoices'
import { romeToday, type LabBankAccount, type LabBankTx } from '@/lib/lab-bank'
import type { ResourceTx } from '@/lib/lab-resources'

const today = '2026-11-14'
const invoice = toLabInvoices([{ id: 'i', direction: 'emessa', sign: 1, issued_on: '2026-10-01', total: 122, taxable: 100, vat_amount: 22, withholding: 0, currency: 'EUR' }])[0]
const settlement = { id: 's', year: 2026, quarter: 2, to_pay: 1000, paid_on: '2026-08-20' }
const periods = vatPeriods([], [], [], [settlement], [invoice], today)
assert.equal(periods.find(q => q.key === '2026-T2')?.due, 1000, 'Il modello prevale anche senza mesi economici')
assert.equal(periods.find(q => q.key === '2026-T4')?.due, null, 'Una fattura non sostituisce la stima del dovuto')
assert.equal(periods.find(q => q.key === '2026-T4')?.documents?.debit, 22)
assert.equal(periods.find(q => q.key === '2026-T2')?.closed, true, 'Scadenza passata non significa pagamento')
const monthly = [{ id: 'm', month: '2026-07-01' }]
const partial = vatPeriods(monthly, [{ month_id: 'm', amount_net: 1000, vat_rate: .22 }], [], [], [], today)
assert.equal(partial.find(q => q.key === '2026-T3')?.due, 222.2)
assert.equal(partial.find(q => q.key === '2026-T3')?.missingMonths.length, 2)
assert.equal(vatPeriods(monthly, [{ month_id: 'm', amount_net: null, vat_rate: .22 }], [], [], [], today).find(q => q.key === '2026-T3')?.due, null)
assert.equal(vatPeriods(monthly, [], [], [], [], today).find(q => q.key === '2026-T3')?.due, null, 'Contenitore mese vuoto non è IVA zero')
assert.equal(vatDays(today, '2026-11-16'), 2)
assert.equal(vatWhen('2026-11-16', '2026-11-16'), 'Scade oggi')
assert.equal(vatWhen('2026-11-20', '2026-11-16'), 'Scaduta da 4 giorni')
assert.equal(romeToday(new Date('2026-11-14T23:30:00Z')), '2026-11-15')
assert.equal(vatDays('2026-03-28', '2026-03-30'), 2, 'Cambio ora non cambia i giorni civili')
const tax: ResourceTx = { id: 't', accountId: 'a', date: '2026-08-20', currency: 'EUR', amount: -1100, source: 'banca', kind: 'imposta', payslipId: null, hrInvoiceId: null, invoiceId: null }
const head = { id: 'f', due_date: '2026-08-20', total: 1100 }
const lines = [{ id: 'l', doc_id: 'f', kind: 'iva', amount: 1000, vat_settlement_id: 's' }, { id: 'l2', doc_id: 'f', kind: 'inps', amount: 100 }]
const allocations = [{ id: 'a', tx_id: 't', f24_id: 'f', amount: 1100, evidence: 'certificata' }]
const payment = (rows = lines, heads = [head], txs = [tax], amounts = allocations) => vatPayment(settlement, heads, rows, amounts, txs, today)
assert.equal(payment().paid, 1000, 'Il versato IVA non è tutto il modello misto')
assert.equal(payment().residual, 0)
assert.equal(payment().completedOn, '2026-08-20')
assert.equal(vatPayment(settlement, [head], lines, [], [tax], today).paid, null, 'paid_on da solo non certifica')
assert.equal(payment(lines, [head], [{ ...tax, source: 'derivato' }]).paid, null)
assert.equal(payment(lines, [head], [{ ...tax, kind: 'giroconto' }]).paid, null)
assert.equal(payment(lines, [head], [{ ...tax, payslipId: 'salary' }]).paid, null, 'Cedolino concorrente non certifica un F24')
assert.equal(payment(lines, [head], [{ ...tax, date: '2026-11-15' }]).paid, null)
assert.equal(payment(lines, [head], [tax], [{ ...allocations[0], amount: 500 }]).paid, null, 'Non ripartire un F24 pagato in parte')
assert.equal(payment([...lines, { id: 'c', doc_id: 'f', kind: 'credito', amount: 100 }], [{ ...head, total: 1000 }], [{ ...tax, amount: -1000 }], [{ ...allocations[0], amount: 1000 }]).paid, null, 'Credito non attribuito: non inventare versato IVA')
const account = { id: 'a', currency: 'EUR', parent_id: null } as LabBankAccount
const tx = { id: 't', account_id: 'a', booked_on: '2026-10-15', amount: 122, source: 'banca', kind: 'incasso', invoice_id: 'i', hidden_reason: null, transfer_pair_id: null, revenue_line_id: null, cost_line_id: null, payslip_id: null, hr_invoice_id: null } as unknown as LabBankTx
const cash = (txs = [tx], docs = [invoice], allocs: Record<string, unknown>[] = []) => vatCash(txs, [account], docs, allocs, '2026-10-01', today)
assert.equal(cash().inVat, 22)
assert.equal(cash([{ ...tx, hidden_reason: 'nascosto' }]).inVat, 22, 'Nascosto non cancella la cassa reale')
assert.equal(cash([{ ...tx, amount: 244 }]).inUnknown, 244, 'Sovrapagamento: non estendere la base conosciuta')
assert.equal(cash([{ ...tx, amount: 61 }]).inVat, null)
assert.equal(cash([tx, { ...tx, id: 't2' }]).inVat, null, 'Non duplicare IVA su due pagamenti')
assert.equal(cash([tx], [invoice], [{ tx_id: 't' }]).inVat, null, 'Quota concorrente da raccordare')
assert.equal(cash([{ ...tx, source: 'manuale' }]).entries.length, 0)
assert.equal(cash([{ ...tx, kind: 'giroconto' }]).entries.length, 0)
assert.equal(cash([{ ...tx, booked_on: '2026-11-15' }]).entries.length, 0)
assert.equal(cash([tx], [{ ...invoice, currency: 'USD' }]).inVat, null)
assert.equal(cash([tx], [{ ...invoice, withholding: 20 }]).inVat, null)
assert.deepEqual(vatReserve(5000, 3000), { covered: 3000, used: 2000, after: -2000 })
assert.equal(vatReserve(5000, -1000).used, 5000)
assert.equal(vatReserve(null, 5000).used, null)
assert.deepEqual(vatReserve(-100, 500), { covered: 0, used: 0, after: 500 })
for (const path of ['lib/lab-vat-load.ts', 'app/(dashboard)/lab/iva/page.tsx']) {
  const source = readFileSync(path, 'utf8')
  assert.match(source, /await requireLabAdmin\(\)/)
  assert.doesNotMatch(source, /\.\s*(insert|update|upsert|delete|rpc)\s*\(/)
  assert.doesNotMatch(source, /from ['"]@\/app\/(actions|api)\//)
}
console.log('Tutti i controlli passano')
