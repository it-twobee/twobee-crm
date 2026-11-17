import assert from 'node:assert/strict'
import { bankBalanceHistory, isRetiredBankPocket } from '@/lib/bank-presentation'
import { bankMovementSearch, bankDays } from '@/lib/lab-bank-view'
import { labContextMonth } from '@/lib/lab-context'
import { readFileSync } from 'node:fs'
import { bankReadout, bankReference, labMonth, monthEnd, romeToday, type LabBankAccount, type LabBankTx } from '@/lib/lab-bank'

const account: LabBankAccount = {
  id: 'a', label: 'Conto', bank_name: null, currency: 'EUR', is_active: true,
  is_primary: true, opening_balance: 100, opening_date: '2026-09-01',
  statement_balance: 90, statement_on: '2026-09-30',
}
const tx = (id: string, booked_on: string, amount: number, extra: Partial<LabBankTx> = {}): LabBankTx => ({
  id, account_id: 'a', booked_on, amount, source: 'banca', kind: 'altro', description: '',
  counterparty: null, value_on: null, doc_ref: null, revenue_line_id: null, cost_line_id: null,
  matched_at: null, no_match_needed: false, invoice_id: null, ...extra,
})
const rows = [
  tx('old', '2026-09-30', -10),
  tx('in', '2026-10-01', 50),
  tx('hidden', '2026-10-02', -20, { hidden_reason: 'Personale' }),
  tx('transfer', '2026-10-03', -15, { kind: 'giroconto' }),
  tx('declared', '2026-10-03', 500, { source: 'derivato' }),
  tx('manual', '2026-10-03', 300, { source: 'manuale' }),
  tx('other', '2026-10-03', 1000, { account_id: 'b' }),
  tx('future', '2026-11-20', 200),
]
const result = bankReadout(account, rows, '2026-10-01', '2026-11-14')
assert.equal(result.reconstructed, 105, 'Nascosti e giroconti restano nel saldo; dichiarati e altri conti esclusi')
assert.equal(result.inflow, 50)
assert.equal(result.outflow, 35)
assert.equal(result.period.length, 3)
assert.equal(result.hidden.length, 1)
assert.equal(result.transfers.length, 1)
assert.equal(result.declaredCount, 2)
assert.equal(result.statementDifference, 0, 'Confronto alla data dell’estratto, non al saldo di ottobre')
assert.equal(bankReadout({ ...account, statement_balance: null }, rows, '2026-10-01', '2026-11-14').statementDifference, null)
assert.equal(bankReadout(account, [...rows, tx('pre', '2026-08-31', 10)], '2026-10-01', '2026-11-14').reconstructed, null)
assert.equal(bankReadout(account, rows, '2026-11-01', '2026-11-14').period.length, 0, 'Fatti futuri non osservati')
assert.equal(bankReadout(account, rows, '2026-12-01', '2026-11-14').inflow, 0)
assert.equal(bankReadout({ ...account, opening_date: '2027-01-01' }, [], '2026-10-01', '2026-11-14').reconstructed, null)
assert.equal(bankReference(tx('x', '2026-10-01', 10)), 'Nessun riferimento diretto')
assert.equal(bankReference(tx('x', '2026-10-01', 10, { invoice_id: 'i' })), 'Fattura')
assert.equal(labContextMonth(null), undefined)
assert.equal(labContextMonth('2026-10'), '2026-10-01')
assert.equal(labContextMonth('2026-10-01'), '2026-10-01')
assert.equal(labContextMonth('2026-13-01'), undefined)
assert.equal(labContextMonth('2026-10-20'), undefined)
assert.equal(labMonth('2026-13-01', '2026-11-14'), '2026-11-01')
assert.equal(labMonth('2026-10-01', '2026-11-14'), '2026-10-01')
assert.equal(labMonth('2026-10', '2026-11-14'), '2026-10-01', 'Selettore mese HTML normalizzato prima delle letture')
assert.equal(labMonth('2026-13', '2026-11-14'), '2026-11-01')
assert.equal(labMonth('2026-10-20', '2026-11-14'), '2026-11-01', 'Non converte date arbitrarie in una competenza')
assert.equal(monthEnd('2028-02-01'), '2028-02-29')
assert.equal(monthEnd('2026-02-01'), '2026-02-28')
assert.equal(romeToday(new Date('2026-10-31T23:30:00Z')), '2026-11-01')
assert.equal(romeToday(new Date('2026-03-29T22:30:00Z')), '2026-03-30')
for (const path of ['lib/lab-read.ts', 'lib/lab-bank-load.ts', 'app/(dashboard)/lab/banca/page.tsx']) {
  const source = readFileSync(path, 'utf8')
  assert.match(source, /await requireLabAdmin\(\)/, `${path}: gate esplicito prima delle letture`)
  assert.doesNotMatch(source, /\.\s*(insert|update|upsert|delete|rpc)\s*\(/, `${path}: nessun comando mutante o RPC`)
  assert.doesNotMatch(source, /from ['"]@\/app\/(actions|api)\//, `${path}: nessuna dipendenza da endpoint mutanti`)
}


const searchable = tx('search', '2026-10-03', -1234.56, { counterparty: 'Società Alfa', description: 'Saldo fattura 68/26', doc_ref: 'FPR 68/26' })
for (const q of ['alfa', 'FATTURA', '68/26', '1.234,56 €', '1234.56', '-1234,56']) assert.ok(bankMovementSearch(searchable, q), q)
for (const q of ['+1234,56', '1234,55', '1.234,567', 'non presente']) assert.ok(!bankMovementSearch(searchable, q), q)
assert.ok(bankMovementSearch(tx('whole', '2026-10-03', 1234), '1.234'))
const originalOrder = JSON.stringify(rows)
const grouped = bankDays([rows[1], rows[2], rows[3]])
assert.deepEqual(grouped.map(g => [g.date, g.net]), [['2026-10-03', -15], ['2026-10-02', -20], ['2026-10-01', 50]])
assert.equal(JSON.stringify(rows), originalOrder)
assert.equal(bankReadout(account, rows, '2026-10-01', '2026-11-14').reconstructed, result.reconstructed, 'Search and grouping never change account balance')

const history = bankBalanceHistory(account, rows, '2026-10-31')!
assert.equal(history.at(-1)!.value, result.reconstructed)
assert.equal(history[0].value, account.opening_balance)
assert.equal(bankBalanceHistory(account, [...rows, tx('bad', '2026-08-01', 1)], '2026-10-31'), null)
assert.equal(bankBalanceHistory({ ...account, currency: 'USD' }, rows, '2026-10-31'), null)
assert.equal(bankBalanceHistory(account, rows, '2026-08-31'), null)
for (const label of ['Vivid Marco', 'Vivid Toto', 'Vivid Walter']) assert.ok(isRetiredBankPocket({ label }))
assert.ok(!isRetiredBankPocket({ label: 'Vivid società' }))
assert.ok(!isRetiredBankPocket({ label: 'Banco BPM' }))
assert.equal(rows.length, 8, 'Presentation does not remove financial facts')
console.log('Tutti i controlli passano')
