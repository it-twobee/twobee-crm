import assert from 'node:assert/strict'
import { suggestReconciliations, certainReconciliationPairs } from '@/lib/lab-match-suggestions'
import { matchingPlan, type MatchMovement, type MatchDocument } from '@/lib/lab-matching'
const movement = (id = 'm', amount = 300, more = {}): MatchMovement => ({ id, label: 'Tailors Style', description: 'Bonifico Tailors Style', date: '2026-11-10', account: 'Banca', currency: 'EUR', signedAmount: amount, available: Math.abs(amount), why: null, href: '/lab/banca', ...more })
const invoice = (id = 'i', amount = 300, more = {}): MatchDocument => ({ id, label: 'Emessa FPR 68/26 · Tailors Style SRL', counterpartyName: 'Tailors Style SRL', number: 'FPR 68/26', date: '2026-11-01', currency: 'EUR', direction: 1, side: 'emessa', total: amount, paid: null, remaining: amount, why: null, href: '/lab/fatturazione', ...more })
const run = (ms = [movement()], ds = [invoice()], am: string[] = [], ad: string[] = []) => suggestReconciliations(ms, ds, am, ad)
let result = run().suggestions[0]
assert.ok(result.score >= 80 && result.level === 'alta')
assert.ok(result.reasons.some(r => r.includes('Nome')))
assert.ok(result.reasons.some(r => r.includes('Importo')))
assert.equal(result.exact, true)
assert.equal(run([movement('m', 300, { label: 'Sconosciuto', description: 'Bonifico' })]).suggestions[0].level, 'bassa', 'Amount alone is not high confidence')
assert.equal(run([movement('m', -300)]).suggestions.length, 0)
assert.equal(run([movement('m', 300, { currency: 'USD' })]).suggestions.length, 0)
assert.equal(run([movement('m', 300, { available: null })]).suggestions.length, 0)
assert.equal(run([movement('m', 300, { why: 'F24 impegnato' })]).suggestions.length, 0)
assert.equal(run([movement()], [invoice('i', 300, { remaining: 0 })]).suggestions.length, 0)
const typo = run([movement('m', 300, { label: 'Afinity', description: 'Bonifico Afinity' })], [invoice('i', 300, { counterpartyName: 'Affinity SRL' })]).suggestions[0]
assert.ok(typo.reasons.some(r => r.includes('simile')))
assert.notEqual(typo.level, 'alta')
const compact = run([movement('m', 300, { label: 'DILEOFATIMA', description: '' })], [invoice('i', 300, { counterpartyName: 'LEO FATIMA' })]).suggestions[0]
assert.ok(compact.reasons.some(r => r.includes('senza spazi')))
const brand = run([movement('m', 300, { label: 'Meta Ads', description: 'FACEBK *F7CUHCSK64' })], [invoice('i', 300, { counterpartyName: 'Meta Platforms Ireland Limited' })]).suggestions[0]
assert.ok(brand.reasons.some(r => r.includes('Marchio')))
const reference = run([movement('m', 300, { label: 'Altro', description: 'Saldo fatture FPR68/26' })]).suggestions[0]
assert.ok(reference.reasons.some(r => r.includes('Numero fattura')))
const numeric = run([movement('m', 300, { label: 'Altro', description: 'Saldo fattura n. 100' })], [invoice('i', 300, { number: '100' })]).suggestions[0]
assert.ok(numeric.reasons.some(r => r.includes('Numero fattura')))
const dateCollision = run([movement('m', 300, { label: 'Altro', description: 'Bonifico data 17/11/2026' })], [invoice('i', 300, { number: '11/2026' })]).suggestions[0]
assert.ok(!dateCollision.reasons.some(r => r.includes('Numero fattura')))
const year = run([movement('m', 300, { label: 'Altro', description: 'Bonifico anno 2026' })], [invoice('i', 300, { number: '2026' })]).suggestions[0]
assert.ok(!year.reasons.some(r => r.includes('Numero fattura')))
const partial = run([movement('m', 100)]).suggestions[0]
assert.equal(partial.total, 100)
assert.ok(!partial.exact && partial.warnings.some(w => w.includes('residuo')))
const rankedPartial = run([movement('m', 100)], [invoice('known', 1000), invoice('unknown', 100, { counterpartyName: 'Altra Impresa' })]).suggestions
assert.equal(rankedPartial[0].invoices[0], 'known', 'Identity supports partial payments ahead of unrelated equal amounts')
const group = run([movement()], [invoice('a', 100), invoice('b', 200)]).suggestions.find(p => p.invoices.length === 2)!
assert.ok(group && group.exact && group.total === 300)
const installments = run([movement('a', 100), movement('b', 200)], [invoice()]).suggestions.find(p => p.movements.length === 2)!
assert.ok(installments && installments.total === 300)
const triple = run([movement()], [invoice('a', 50), invoice('b', 100), invoice('c', 150)]).suggestions.find(p => p.invoices.length === 3)!
assert.ok(triple && triple.total === 300)
const ambiguous = run([movement()], [invoice('a'), invoice('b')]).suggestions
assert.ok(ambiguous.every(p => p.level !== 'alta' && p.warnings.some(w => w.includes('plausibili'))))
const outside = run([movement('a'), movement('b')], [invoice()], ['a']).suggestions[0]
assert.ok(outside.level !== 'alta' && outside.warnings.some(w => w.includes('fuori')))
const futureInvoice = run([movement('m', 300, { date: '2026-01-01' })]).suggestions[0]
assert.ok(futureInvoice.score <= 40 && futureInvoice.warnings.some(w => w.includes('prima')))
assert.equal(run([movement()], [invoice()], ['missing']).suggestions.length, 0)
const ms = [movement('a', 100), movement('b', 200)], ds = [invoice()]
for (const p of run(ms, ds).suggestions) assert.equal(matchingPlan(ms, ds, p.movements, p.invoices).issues.length, 0)
const saved = JSON.stringify({ ms, ds }); run(ms, ds); assert.equal(JSON.stringify({ ms, ds }), saved)
assert.deepEqual(run(ms, ds), run([...ms].reverse(), [...ds].reverse()), 'Ordering is reproducible')
const many = Array.from({ length: 420 }, (_, n) => movement(String(n), 300))
const bounded = run(many, [invoice()], ['419'])
assert.ok(bounded.limited && bounded.suggestions.some(p => p.movements.includes('419')), 'Selected sources stay in the bounded search')
const crowded = run([...Array.from({ length: 199 }, (_, n) => movement(String(n), 100)), movement('zz-strong', 1000)], Array.from({ length: 5 }, (_, n) => invoice(String(n), 1000)))
assert.ok(crowded.limited && crowded.suggestions[0].movements.includes('zz-strong'), 'Strong evidence is kept ahead of weaker candidates under search limits')
const historicalMovements = [movement('new', 300, { label: 'ACME Ced', description: '' }), movement('old1', 300, { label: 'ACME Ced', available: 0, why: 'Collegato' }), movement('old2', 300, { label: 'ACME Ced', available: 0, why: 'Collegato' })]
const historicalInvoices = [invoice('new', 300, { counterpartyName: 'Officina Mizar' }), invoice('old1', 300, { counterpartyName: 'Officina Mizar', remaining: 0, why: 'Coperta' }), invoice('old2', 300, { counterpartyName: 'Officina Mizar', remaining: 0, why: 'Coperta' })]
const history = [{ status: 'active', verified_at: '2026-11-15', items: [{ tx_id: 'old1', invoice_id: 'old1' }] }, { status: 'active', verified_at: '2026-11-15', items: [{ tx_id: 'old2', invoice_id: 'old2' }] }]
const learned = suggestReconciliations(historicalMovements, historicalInvoices, [], [], history).suggestions[0]
assert.ok(learned.reasons.some(r => r.includes('2 fatture verificate')))
assert.ok(learned.score > suggestReconciliations(historicalMovements, historicalInvoices).suggestions[0].score)
for (const h of [[history[0]], [history[0], { ...history[1], status: 'cancelled' }], [history[0], { ...history[1], verified_at: null }], [history[0], { ...history[1], items: [{ tx_id: 'old2', invoice_id: 'old1' }] }]]) assert.ok(!suggestReconciliations(historicalMovements, historicalInvoices, [], [], h).suggestions[0].reasons.some(r => r.includes('fatture verificate')))
const certain = (ms = [movement()], ds = [invoice('i', 300, { paid: 0 })]) => certainReconciliationPairs(ms, ds)
assert.equal(certain().length, 1)
assert.equal(certain([movement()], [invoice('i', 300, { paid: null })]).length, 1, 'No recorded bank share can have null paid; full comparable residual still required')
assert.equal(certain([movement()], [invoice('i', 300, { paid: 0, autoBlock: 'Originale assente' })]).length, 0)
assert.equal(certain([movement('a'), movement('b')]).length, 0, 'Competing bank facts are never automatic')
assert.equal(certain([movement()], [invoice('a', 300, { paid: 0 }), invoice('b', 300, { paid: 0 })]).length, 0, 'Competing documents are never automatic')
assert.equal(certain([movement('a', 300, { label: 'Sconosciuto', description: '' })]).length, 0)
assert.equal(certain([movement('a', 300, { label: 'Annalisa Smiraglia', description: 'Bonifico Annalisa Smiraglia' })], [invoice('i', 300, { counterpartyName: 'Gabriele Saraiello', paid: 0 })]).length, 0)
assert.equal(certain([movement('a', 300, { date: '2026-10-30' })]).length, 0, 'Anticipi need manual verification')
assert.equal(certain([movement('a', 300, { date: '2026-12-01' })]).length, 0)
assert.equal(certain([movement('a', 300, { available: 200 })], [invoice('i', 200, { paid: 0 })]).length, 0, 'Already split movements remain manual')
assert.equal(certain([movement()], [invoice('i', 400, { paid: 100, remaining: 300 })]).length, 0)
assert.equal(certain([movement('m', 300, { label: 'ChatGPT', description: 'OPENAI CHATGPT' })], [invoice('i', 300, { counterpartyName: 'OpenAI Ireland Limited', paid: 0 })]).length, 1)
assert.ok(run([movement('wide', 180)], [invoice('w1', 30), invoice('w2', 40), invoice('w3', 50), invoice('w4', 60)]).suggestions.some(p => p.invoices.length === 4 && p.exact), 'An exact cumulative payment can suggest more than three invoices')
console.log('Tutti i controlli passano')
