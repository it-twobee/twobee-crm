import assert from 'node:assert/strict'
import { chartCsv, chartValue, filterChartRows, type ChartRow } from '@/lib/lab-chart'

const rows: ChartRow[] = [
  { id: 'a', label: '=HYPERLINK("x")', group: 'Banca', date: '2026-10-01', values: { cost: -12.34, paid: null } },
  { id: 'b', label: 'Risorsa', group: 'HR', date: '2026-11-01', values: { cost: 0, paid: 1 } },
  { id: 'c', label: 'Senza data', values: { cost: null, paid: null } },
]
const all = { query: '', group: '', from: '', to: '', sort: 'source' }
for (const value of [null, undefined, '', '  ', NaN, Infinity, false, true, {}, []]) assert.equal(chartValue(value), null)
assert.equal(chartValue(0), 0)
assert.equal(chartValue(-12.34), -12.34)
assert.equal(chartValue('12.34'), 12.34)
assert.deepEqual(filterChartRows(rows, { ...all, group: 'Banca', from: '2026-10-01', to: '2026-10-31' }, ['cost']).map(r => r.id), ['a'])
assert.deepEqual(filterChartRows(rows, { ...all, query: 'risorSA' }, ['cost']).map(r => r.id), ['b'])
assert.equal(filterChartRows(rows, { ...all, from: '2026-12-01', to: '2026-10-01' }, ['cost']).length, 0)
assert.deepEqual(filterChartRows(rows, { ...all, sort: 'value' }, ['paid']).map(r => r.id), ['b', 'a', 'c'])
assert.deepEqual(rows.map(r => r.id), ['a', 'b', 'c'], 'Filtering and ordering never mutate the canonical source')
const csv = chartCsv('Titolo', 'Fonte parziale', rows, [{ key: 'cost', label: 'Costo' }], 'Ottobre · filtro Banca')
assert.ok(csv.startsWith('\uFEFF'))
assert.ok(csv.includes("'" + '=HYPERLINK(""x"")'))
assert.ok(csv.includes('"-12,34"'), 'Negative monetary values remain numeric')
assert.ok(csv.includes('"n/d"'))
assert.ok(csv.includes('"0"'), 'Known zero is distinct from null')
assert.ok(csv.includes('Fonte parziale') && csv.includes('filtro Banca'))
assert.ok(!csv.includes('Pagato'), 'CSV includes only requested series')
assert.equal(chartCsv('@cmd', '-note', [], [], '+filter').includes('"\'@cmd"'), true)
console.log('Tutti i controlli passano')
