import assert from 'node:assert/strict'
import { bankDailyChart, invoiceMonthlyChart } from '@/lib/lab-chart-data'
import { filterChartRows } from '@/lib/lab-chart'
import { toLabInvoices } from '@/lib/lab-invoices'
import type { LabBankAccount, LabBankTx } from '@/lib/lab-bank'
const accounts = [{ id: 'a', label: 'Principale', currency: 'EUR', opening_date: '2026-01-01', opening_balance: 0 }, { id: 'b', label: 'Sottoconto', currency: 'EUR', parent_id: 'a', opening_date: '2026-01-01', opening_balance: 0 }] as LabBankAccount[]
const tx = (id: string, amount: number, extra = {}) => ({ id, account_id: 'a', booked_on: '2026-10-05', source: 'banca', kind: 'pagamento', amount, ...extra }) as LabBankTx
const rows = bankDailyChart(accounts, [tx('in', 100), tx('out', -25, { hidden_reason: 'nascosto' }), tx('transfer', -10, { kind: 'giroconto' }), tx('manual', 999, { source: 'manuale' }), tx('future', 999, { booked_on: '2026-11-01' }), tx('sub', 50, { account_id: 'b' })], '2026-10-01', '2026-11-16', () => true)
assert.equal(rows.length, 2, 'Accounts and subaccounts never consolidate into one daily point')
assert.deepEqual(rows[0].values, { incoming: 100, outgoing: 35 }, 'Canonical bank flows keep hidden transactions and transfers')
assert.equal(rows[1].values.incoming, 50)
assert.equal(new URL(rows[0].href!, 'https://lab.invalid').searchParams.get('giorno'), '2026-10-05')
assert.equal(bankDailyChart(accounts, [tx('a', 10)], '2026-10-01', '2026-11-16', () => false).length, 0)
const invoices = toLabInvoices([
  { id: 'a', direction: 'emessa', sign: 1, taxable: 100, total: 122, issued_on: '2026-01-01', currency: 'EUR' },
  { id: 'n', direction: 'emessa', sign: -1, taxable: 20, total: 24.4, issued_on: '2026-01-15', currency: 'EUR' },
  { id: 'b', direction: 'emessa', sign: 1, taxable: 200, total: 244, issued_on: '2026-03-01', currency: 'EUR' },
  { id: 'usd', direction: 'emessa', sign: 1, taxable: 999, total: 999, issued_on: '2026-01-01', currency: 'USD' },
].map(row => ({ ...row, withholding: 0, vat_amount: row.total - row.taxable })))
const monthly = invoiceMonthlyChart(invoices, 'emessa', '/lab/fatturazione?tipo=emessa&stato=note&q=prova')
assert.deepEqual(monthly.map(m => m.values.documents), [80, 0, 200])
assert.equal(new URL(monthly[0].href!, 'https://lab.invalid').searchParams.get('stato'), 'note')
assert.equal(new URL(monthly[0].href!, 'https://lab.invalid').searchParams.get('q'), 'prova')
assert.equal(new URL(monthly[0].href!, 'https://lab.invalid').searchParams.get('emissione'), '2026-01-01')

const sameLabels = bankDailyChart(accounts.map(a => ({ ...a, label: 'Stesso nome' })), [tx('a', 10), tx('b', 999, { account_id: 'b' })], '2026-10-01', '2026-11-16', () => true)
assert.deepEqual(filterChartRows(sameLabels, { query: '', group: 'a', from: '', to: '', sort: 'source' }, ['incoming']).map(r => r.values.incoming), [10], 'Account IDs, not labels, isolate a chart even with identical account names')

const filteredDay = bankDailyChart(accounts, [tx('daily', 100)], '2026-10-01', '2026-11-16', () => true, { documenti: 'emesse', q: 'cliente' })[0]
assert.equal(new URL(filteredDay.href!, 'https://lab.invalid').searchParams.get('documenti'), 'emesse')
assert.equal(new URL(filteredDay.href!, 'https://lab.invalid').searchParams.get('q'), 'cliente')
console.log('Tutti i controlli passano')
