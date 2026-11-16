import assert from 'node:assert/strict'
import { parseChartView } from '@/lib/lab-chart-view'
const view = { version: 1, chart: 'banca', heading: 'Flussi', type: 'line', keys: ['in'], query: 'cliente', group: 'a', from: '2026-10-01', to: '2026-10-31', sort: 'source' }
const parse = (more = {}, chart = 'banca', temporal = true) => parseChartView(JSON.stringify({ ...view, ...more }), chart, ['in', 'out'], ['a', 'b'], temporal, true)
assert.deepEqual(parse(), view)
for (const bad of [{ keys: ['in', 'in'] }, { keys: ['missing'] }, { group: 'missing' }, { group: '' }, { version: 2 }, { heading: 'x'.repeat(101) }, { from: '2026-02-30' }, { from: '2026-11-01' }, { sort: 'random' }, { type: 'pie' }]) assert.equal(parse(bad), null)
assert.equal(parse({}, 'altro'), null)
assert.equal(parse({}, 'banca', false), null)
assert.equal(parseChartView('null', 'banca', [], [], true, false), null)
assert.equal(parseChartView('x'.repeat(16001), 'banca', [], [], true, false), null)
assert.equal(parseChartView('{', 'banca', [], [], true, false), null)
assert.equal(Object.hasOwn(parse({ amounts: [100] })!, 'amounts'), false)
console.log('Tutti i controlli passano')
