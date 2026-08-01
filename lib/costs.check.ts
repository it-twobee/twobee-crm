/* Verifica del piano dei costi. Esegui: npx tsx lib/costs.check.ts */
import {
  rollup, monthTarget, plannedForMonth, dueInMonth, yearlyCost, costInsights,
  type CostCenter, type CostItem, type CostActual,
} from '@/lib/costs'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const center = (id: string, name: string): CostCenter => ({
  id, name, description: null, monthly_budget: 9999, sort_order: 0, is_active: true,
})
const item = (o: Partial<CostItem>): CostItem => ({
  id: 'i', center_id: 'c1', project_id: null, category: 'x', label: 'y',
  cost_type: 'F', amount: 0, frequency: 'mensile', vat_applied: false, vat_rate: 0.22,
  supplier: null, start_month: null, end_month: null, is_active: true, note: null, ...o,
})
const actual = (o: Partial<CostActual>): CostActual => ({
  id: 'a', center_id: 'c1', cost_item_id: null, project_id: null,
  category: 'x', label: 'y', cost_type: 'F', budget: 0, actual: 0, paid: false, ...o,
})

const M = '2026-08-01'

console.log('\n— Il tetto di un\'area è la somma delle sue voci (§180) —')
{
  const centers = [center('c1', 'Struttura')]
  const items = [
    item({ id: 'i1', amount: 300, frequency: 'mensile' }),
    item({ id: 'i2', amount: 240, frequency: 'mensile' }),
    // l'annuale di gennaio non pesa su agosto: non deve entrare nel tetto
    item({ id: 'i3', amount: 1200, frequency: 'annuale', start_month: '2026-01-01' }),
  ]
  const r = rollup(centers, items, [], M)[0]
  is('tetto = somma delle voci del mese', r.budget, 540)
  is('tetto e pianificato coincidono', r.budget === r.planned, true)
  is('monthly_budget d\'anagrafica ignorato', r.budget !== centers[0].monthly_budget, true)
  is('nessun budget è più «custom»', r.budgetCustom, false)
}

console.log('\n— «Usato» è spesa contro spesa prevista —')
{
  const centers = [center('c1', 'Struttura')]
  const items = [item({ id: 'i1', amount: 400, frequency: 'mensile' })]
  const r = rollup(centers, items, [actual({ actual: 100 })], M)[0]
  is('usato = speso / previsto', Math.round(r.usedPct * 100), 25)
  is('resta da spendere', r.left, 300)
}
{
  // sforo: è uscito più di quanto il piano prevedesse
  const r = rollup([center('c1', 'X')], [item({ amount: 100 })], [actual({ actual: 250 })], M)[0]
  is('sforo negativo su «left»', r.left, -150)
  const f = costInsights([r], [], [], M).find(x => x.id === 'over-budget')
  is('insight di sforo presente', !!f, true)
}
{
  // area senza voci a piano ma con uscite: il piano non conosce quella spesa
  const r = rollup([center('c1', 'X')], [], [actual({ actual: 80 })], M)[0]
  is('area senza voci: tetto zero', r.budget, 0)
  const f = costInsights([r], [], [actual({ actual: 80 })], M).find(x => x.id === 'no-budget')
  is('insight «senza voce a piano»', !!f, true)
}

console.log('\n— Il tetto del MESE è il 35% del fatturato —')
is('35% di 40.000', monthTarget(40000, 0.35).target, 14000)
is('la quota si configura (30%)', monthTarget(40000, 0.30).target, 12000)
is('con fatturato: calcolabile', monthTarget(40000, 0.35).known, true)
/* Senza ricavi il tetto non esiste: mostrare 0 farebbe leggere «non puoi
   spendere niente», che è una cosa diversa da «non lo so ancora». */
is('senza fatturato: non calcolabile', monthTarget(0, 0.35), { target: 0, known: false })
is('arrotonda ai centesimi', monthTarget(1234.567, 0.35).target, 432.1)

console.log('\n— Frequenze: una voce pesa nel mese in cui torna —')
is('mensile cade sempre', dueInMonth(item({ amount: 50, frequency: 'mensile' }), M), true)
is('annuale di gennaio non cade ad agosto',
  dueInMonth(item({ amount: 1200, frequency: 'annuale', start_month: '2026-01-01' }), M), false)
is('annuale di agosto cade ad agosto',
  dueInMonth(item({ amount: 1200, frequency: 'annuale', start_month: '2026-08-01' }), M), true)
// una voce da zero euro non è una voce: non deve pesare su nessun mese
is('importo zero: fuori dal piano', dueInMonth(item({ amount: 0, frequency: 'mensile' }), M), false)
is('annuale pesa tutto nel suo mese, non 1/12',
  yearlyCost(item({ amount: 1200, frequency: 'annuale' })), 1200)
is('mensile su base annua', yearlyCost(item({ amount: 100, frequency: 'mensile' })), 1200)
is('voce spenta fuori dal piano',
  plannedForMonth([item({ amount: 100, is_active: false })], M).length, 0)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
