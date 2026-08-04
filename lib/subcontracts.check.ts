/* Verifica del subappalto. Esegui: npx tsx lib/subcontracts.check.ts */
import {
  fallsIn, subcontractViews, bySupplierView, byProjectMargin, subcontractFindings,
  type SubItem, type SubLine,
} from '@/lib/subcontracts'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const eq = (label: string, got: number, want: number, tol = 0.01) => {
  const ok = Math.abs(got - want) <= tol
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${got.toFixed(2).padStart(11)}${ok ? '' : `  atteso ${want.toFixed(2)}`}`)
}

const item = (o: Partial<SubItem>): SubItem => ({
  id: 'i1', label: 'Affinity — CRM', supplier: 'Affinity', amount: 2500,
  frequency: 'mensile', is_active: true, project_id: 'p1', ...o,
})
const line = (o: Partial<SubLine>): SubLine => ({
  id: 'l1', label: 'Affinity — CRM', budget: 2500, actual: 2500, paid: false,
  project_id: 'p1', cost_item_id: 'i1', ...o,
})
const NAMES = {
  project: { p1: 'CRM ISF', p2: 'Sito Petito' },
  client: { c1: 'Industrial Service', c2: 'Petito' },
  clientOf: { p1: 'c1', p2: 'c2' },
}

console.log('\n— Quando cade una voce —')
{
  is('mensile senza inizio: sempre', fallsIn(item({ frequency: 'mensile' }), '2026-07-01'), true)
  is('sospesa: mai', fallsIn(item({ is_active: false }), '2026-07-01'), false)
  is('prima dell\'inizio: no', fallsIn(item({ start_month: '2026-08-01' }), '2026-07-01'), false)
  is('dopo la fine: no', fallsIn(item({ end_month: '2026-06-01' }), '2026-07-01'), false)
  const tri = item({ frequency: 'trimestrale', start_month: '2026-04-01' })
  is('trimestrale: aprile sì', fallsIn(tri, '2026-04-01'), true)
  is('maggio no', fallsIn(tri, '2026-05-01'), false)
  is('luglio sì', fallsIn(tri, '2026-07-01'), true)
  const una = item({ frequency: 'una_tantum', start_month: '2026-06-01' })
  is('una tantum: solo il suo mese', fallsIn(una, '2026-06-01'), true)
  is('e non quello dopo', fallsIn(una, '2026-07-01'), false)
}

console.log('\n— La vista del mese: patto, atterraggio, scarto —')
{
  const v = subcontractViews([item({})], [line({})], '2026-07-01', NAMES)
  is('una vista', v.length, 1)
  is('il progetto ha un nome', v[0].projectName, 'CRM ISF')
  is('e il cliente arriva dal progetto', v[0].clientName, 'Industrial Service')
  is('il link porta al progetto: è lì che si modifica', v[0].href, '/progetti/p1?tab=economics')
  is('stato: nel mese, non pagato', v[0].status, 'nel mese')
  eq('niente scarto', v[0].drift, 0)
  eq('pagato zero finché non è pagata', v[0].paid, 0)

  const pagata = subcontractViews([item({})], [line({ paid: true })], '2026-07-01', NAMES)
  is('pagata', pagata[0].status, 'pagato')
  eq('e il pagato è l\'importo', pagata[0].paid, 2500)
}
{
  // il fornitore ha chiesto di più: lo scarto si dichiara, non si assorbe
  const v = subcontractViews([item({})], [line({ actual: 2700 })], '2026-07-01', NAMES)
  is('stato scostato', v[0].status, 'scostato')
  eq('di 200', v[0].drift, 200)
  eq('il patto resta 2.500', v[0].planned, 2500)
}
{
  /* Il caso che rompeva i conti: una riga con un progetto e senza la sua voce di
     piano. Il margine del progetto la paga e la scheda progetto non la mostra. */
  const v = subcontractViews([], [line({ cost_item_id: null })], '2026-07-01', NAMES)
  is('orfana', v[0].status, 'orfano')
  is('senza sorgente', v[0].itemId, null)
  is('ma il fornitore si legge dalla nota',
    subcontractViews([], [line({ cost_item_id: null, note: 'Affinity' })], '2026-07-01', NAMES)[0].supplier,
    'Affinity')
}
{
  // un patto che cade e non è ancora atterrato: lavoro da fare, non errore
  const v = subcontractViews([item({})], [], '2026-07-01', NAMES)
  is('pianificato', v[0].status, 'pianificato')
  is('nessuna riga nel mese', v[0].lineId, null)
  eq('ma il patto vale', v[0].planned, 2500)

  // uno che NON cade non compare: un annuale non è dodici subappalti
  const annuale = item({ frequency: 'annuale', start_month: '2026-01-01' })
  is('fuori dal mese: nessuna vista', subcontractViews([annuale], [], '2026-07-01', NAMES).length, 0)
}

console.log('\n— Per subappaltatore: quanto do a chi —')
{
  const views = subcontractViews(
    [item({ id: 'i1', supplier: 'Affinity', amount: 2500 }),
     item({ id: 'i2', supplier: 'Affinity', amount: 1200, project_id: 'p2' }),
     item({ id: 'i3', supplier: null, amount: 300, project_id: 'p2' })],
    [line({ id: 'l1', cost_item_id: 'i1' }),
     line({ id: 'l2', cost_item_id: 'i2', budget: 1200, actual: 1200, project_id: 'p2', paid: true })],
    '2026-07-01', NAMES)
  const g = bySupplierView(views)
  is('due gruppi', g.length, 2)
  is('Affinity per primo (vale più)', g[0].supplier, 'Affinity')
  eq('pattuito', g[0].planned, 3700)
  eq('pagato solo una', g[0].paid, 1200)
  is('su due progetti', g[0].projects, 2)
  is('chi non ha nome resta ultimo', g[1].supplier, null)
}

console.log('\n— Margine per progetto: ricavo meno i lavori fuori —')
{
  const views = subcontractViews([item({})], [line({})], '2026-07-01', NAMES)
  const m = byProjectMargin(views, { p1: 4000, p2: 1500 })
  const p1 = m.find(x => x.projectId === 'p1')!
  eq('ricavo', p1.revenue, 4000)
  eq('subappalti', p1.external, 2500)
  eq('margine', p1.margin, 1500)
  eq('in percentuale', p1.pct, 0.375)
  const p2 = m.find(x => x.projectId === 'p2')!
  eq('un progetto senza subappalti tiene tutto', p2.margin, 1500)

  /* Un pianificato conta come costo: ignorarlo mostrerebbe un margine che il mese
     prossimo si sgonfia da solo. */
  const soloPatto = byProjectMargin(subcontractViews([item({})], [], '2026-07-01', NAMES), { p1: 4000 })
  eq('il pianificato pesa sul margine', soloPatto[0].external, 2500)
}

console.log('\n— Cosa non torna —')
{
  const orfana = subcontractViews([], [line({ cost_item_id: null })], '2026-07-01', NAMES)
  const f = subcontractFindings(orfana, byProjectMargin(orfana, { p1: 4000 }))
  is('l\'orfana è critica', f[0].severity, 'critico')
  is('e dice dove andare', f[0].href, '/progetti/p1?tab=economics')
}
{
  const views = subcontractViews([item({})], [line({ actual: 5000 })], '2026-07-01', NAMES)
  const margins = byProjectMargin(views, { p1: 4000 })
  const f = subcontractFindings(views, margins)
  is('margine negativo: critico', f.some(x => x.id.startsWith('margine-') && x.severity === 'critico'), true)
  is('e lo scarto è segnalato', f.some(x => x.id.startsWith('scarto-')), true)
}
{
  // subappalto senza ricavo nel mese: sfasamento, non perdita
  const views = subcontractViews([item({})], [line({})], '2026-07-01', NAMES)
  const f = subcontractFindings(views, byProjectMargin(views, {}))
  is('lo sfasamento si dichiara', f.some(x => x.id.startsWith('senza-ricavo-')), true)
}
{
  // niente da dire quando tutto torna
  const views = subcontractViews([item({})], [line({ paid: true })], '2026-07-01', NAMES)
  const f = subcontractFindings(views, byProjectMargin(views, { p1: 4000 }))
  is('nessun avviso su un mese in ordine', f.length, 0)
}

console.log('\n— §193 · Una una tantum in un mese che non è il suo —')
{
  const acconto = item({ frequency: 'una_tantum', start_month: '2026-06-01', amount: 2250 })
  const fuori = subcontractViews([acconto], [line({ budget: 2250, actual: 2250 })], '2026-07-01', NAMES)
  is('la riga dichiara il mese giusto', fuori[0].wrongMonth, '2026-06')
  const f = subcontractFindings(fuori, byProjectMargin(fuori, { p1: 4000 }))
  is('ed è un avviso critico', f.some(x => x.id.startsWith('mese-sbagliato-') && x.severity === 'critico'), true)

  const dentro = subcontractViews([acconto], [line({ budget: 2250, actual: 2250 })], '2026-06-01', NAMES)
  is('nel suo mese non si dice niente', dentro[0].wrongMonth, null)

  // un canone torna ogni mese: per lui non esiste un mese sbagliato
  const canone = subcontractViews(
    [item({ frequency: 'mensile', start_month: '2026-01-01' })],
    [line({})], '2026-07-01', NAMES)
  is('un ricorrente non ha mese sbagliato', canone[0].wrongMonth, null)
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
