/* Verifica del piano dei costi. Esegui: npx tsx lib/costs.check.ts */
import {
  rollup, monthTarget, plannedForMonth, dueInMonth, yearlyCost, costInsights, bySupplier,
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

console.log('\n— Costi esterni raccolti per subappaltatore —')
{
  // le voci di un subappalto: nessuna area, il progetto attaccato, rate una tantum
  const it = (o: Partial<CostItem>) =>
    item({ center_id: null, category: 'Delivery', cost_type: 'V', frequency: 'una_tantum',
           start_month: '2026-03-01', ...o })

  const items = [
    it({ supplier: 'Zeta Studio', amount: 2000, project_id: 'p1' }),
    it({ supplier: 'Alfa Dev', amount: 2466.66, project_id: 'p1' }),
    it({ supplier: 'Alfa Dev', amount: 2672.22, project_id: 'p1' }),
    it({ supplier: 'Alfa Dev', amount: 2672.22, project_id: 'p2' }),
    it({ supplier: null, amount: 500, project_id: 'p3' }),
    it({ supplier: '  ', amount: 300 }),
  ]
  const groups = bySupplier(items)
  is('un gruppo per fornitore, più quello senza nome', groups.length, 3)
  is('in ordine alfabetico', groups.map(g => g.supplier), ['Alfa Dev', 'Zeta Studio', null])
  is('il totale del gruppo somma le rate', groups[0].total, 7811.1)
  is('tre voci sotto Alfa Dev', groups[0].items.length, 3)
  is('e due progetti toccati', groups[0].projectIds, ['p1', 'p2'])
  is('un subappalto non è un costo esterno puro', groups[0].external, false)

  // chi non ha il fornitore compilato sta in fondo: è il gruppo da sistemare
  const senza = groups[groups.length - 1]
  is('spazi bianchi contano come nessun nome', senza.supplier, null)
  is('e ci finiscono tutte le voci senza fornitore', senza.items.length, 2)
  is('col loro totale', senza.total, 800)

  // un costo esterno senza progetto si distingue da un subappalto
  is('senza progetto è costo esterno',
    bySupplier([it({ supplier: 'Studio Legale', amount: 900 })])[0].external, true)

  // il peso annuo segue la frequenza, il totale no: un canone mensile da 100
  // vale 100 come importo e 1.200 come peso dell'anno
  const canone = bySupplier([it({ supplier: 'Hosting', amount: 100, frequency: 'mensile' })])[0]
  is('importo dell\'occorrenza', canone.total, 100)
  is('peso annuo del canone', canone.yearly, 1200)

  is('nessuna voce, nessun gruppo', bySupplier([]).length, 0)
}

console.log('\n— Il personale non è una dimenticanza del piano —')
{
  const c = [center('c1', 'Personale'), center('c2', 'Struttura & Software')]
  const acts = [
    // righe scritte dall'organico: nessuna voce di piano, ed è giusto così
    actual({ center_id: 'c1', category: 'Personale', label: 'Michele', cost_item_id: null, actual: 3225 }),
    actual({ center_id: null, category: 'Personale', label: 'Sabrina', cost_item_id: null, actual: 2996 }),
    // una spesa vera fuori piano: questa sì va segnalata
    actual({ center_id: null, category: 'Software', label: 'Canva', cost_item_id: null, actual: 120 }),
  ]
  const r = rollup(c, [], acts, '2026-08-01')
  const ids = costInsights(r, [], acts, '2026-08-01').map(f => f.id)
  is('nessuna diagnosi «fuori piano»: la elenca la sezione, con l\'azione',
    ids.includes('off-plan'), false)
  is('le uscite senza area si segnalano ancora', ids.includes('loose-lines'), true)
  // e contano solo quelle vere: 120 €, non i 2.996 del cedolino senza area
  const loose = costInsights(r, [], acts, '2026-08-01').find(f => f.id === 'loose-lines')
  is('il personale non gonfia le uscite senza area', loose?.title.includes('120'), true)
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
