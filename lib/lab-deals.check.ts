import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dealState, dealProjects, installmentLines, knownAmount } from '@/lib/lab-deals'
import type { RevenueStream } from '@/lib/revenue'

const stream: RevenueStream = {
  id: 's', project_id: 'p', client_id: 'c', label: 'Accordo', service_type: null, service_subtype: null,
  price_source: 'custom', kind: 'digital', billing: 'one_off', amount: 1000, vat_rate: 0.22,
  start_date: '2026-10-01', end_date: null, status: 'attivo', sales_owner_id: null, activates_after_id: null,
}
assert.equal(dealState(stream, '2026-11-14').label, 'Attivo')
assert.equal(dealState({ ...stream, start_date: '2026-12-01' }, '2026-11-14').label, 'Da avviare')
assert.match(dealState({ ...stream, status: 'bozza' }, '2026-11-14').detail, /ancora da confermare/)
assert.equal(dealState({ ...stream, status: 'sospeso' }, '2026-11-14').label, 'Sospeso')
assert.equal(dealState({ ...stream, status: 'concluso' }, '2026-11-14').label, 'Concluso')
assert.match(dealState({ ...stream, end_date: '2026-10-31' }, '2026-11-14').detail, /da verificare/)
assert.deepEqual(dealProjects(stream, new Map()).ids, ['p'])
assert.equal(dealProjects(stream, new Map([['s', ['p', 'q']]])).shared, true)
assert.equal(dealProjects({ ...stream, project_id: null }, new Map([['s', ['p']]])).needsReview, true)
assert.deepEqual(dealProjects({ ...stream, project_id: null }, new Map([['s', ['p']]])).ids, [], 'Nessun aggiramento della copertura canonica')
assert.equal(knownAmount(null), null)
assert.equal(knownAmount(''), null)
assert.equal(knownAmount('bad'), null)
assert.equal(knownAmount(false), null)
assert.equal(knownAmount('  '), null)
assert.equal(knownAmount(0), 0, 'Zero noto resta zero')
assert.equal(knownAmount('100.25'), 100.25)
const lines = [
  { id: 'a', month_id: 'm', stream_id: 's', installment_id: 'r1', invoice_id: 'i' },
  { id: 'b', month_id: 'm', stream_id: 's', installment_id: 'r2', invoice_id: 'j' },
  { id: 'c', month_id: 'm', stream_id: 's', installment_id: null, invoice_id: 'k' },
]
assert.deepEqual(installmentLines('r1', lines).map(l => l.id), ['a'], 'Stesso contratto non attribuisce una fattura a tutte le rate')
assert.deepEqual(installmentLines('missing', lines), [])
for (const path of ['lib/lab-deals-load.ts', 'app/(dashboard)/lab/accordi/page.tsx']) {
  const source = readFileSync(path, 'utf8')
  assert.match(source, /await requireLabAdmin\(\)/)
  assert.doesNotMatch(source, /\.\s*(insert|update|upsert|delete|rpc)\s*\(/)
  assert.doesNotMatch(source, /from ['"]@\/app\/(actions|api)\//)
}
console.log('Tutti i controlli passano')
