/* Verifica del modello contratti. Esegui: npx tsx lib/revenue.check.ts */
import {
  linesForMonth, splitEven, splitByPercent, autoInstallments, monthSpan,
  readyToActivate, activeInMonth, type RevenueStream, type Installment,
} from '@/lib/revenue'

let fail = 0
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${l.padEnd(52)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const S = (o: Partial<RevenueStream>): RevenueStream => ({
  id: 's', project_id: 'p', client_id: 'c', label: 'x', service_type: null, service_subtype: null,
  price_source: 'custom', kind: 'growth', billing: 'recurring', amount: 0, vat_rate: 0.22,
  start_date: null, end_date: null, status: 'attivo', sales_owner_id: null, activates_after_id: null, ...o,
})
const I = (o: Partial<Installment>): Installment => ({
  id: 'i', stream_id: 's', due_month: '2026-01-01', label: null, amount: 0,
  invoiced: false, paid: false, ...o,
})

console.log('— Il cliente con tre contratti insieme —')
const growth = S({ id: 'g', label: 'Growth continuativo', amount: 3600, start_date: '2026-01-01' })
const digital = S({ id: 'd', label: 'Sito e-commerce', kind: 'digital', billing: 'one_off',
  amount: 24000, start_date: '2026-03-01', end_date: '2026-05-01', status: 'attivo' })
const manut = S({ id: 'm', label: 'Manutenzione', kind: 'digital', amount: 500,
  start_date: '2026-06-01', status: 'bozza', activates_after_id: 'd' })
const rate = autoInstallments(digital).map((r, k) => I({ id: `i${k}`, stream_id: 'd', ...r }))

eq('il digital si spalma su 3 mesi', rate.map(r => r.amount), [8000, 8000, 8000])
eq('febbraio: solo il canone growth',
  linesForMonth([growth, digital, manut], rate, '2026-02-01').map(l => [l.label, l.amount_net]),
  [['Growth continuativo', 3600]])
eq('aprile: canone + rata del progetto',
  linesForMonth([growth, digital, manut], rate, '2026-04-01').map(l => l.amount_net), [3600, 8000])
eq('giugno: la manutenzione in bozza non entra',
  linesForMonth([growth, digital, manut], rate, '2026-06-01').map(l => l.amount_net), [3600])

console.log('\n— La manutenzione si attiva a progetto concluso —')
eq('progetto ancora attivo: niente da attivare', readyToActivate([growth, digital, manut]).length, 0)
const chiuso = { ...digital, status: 'concluso' as const }
eq('progetto concluso: la manutenzione è pronta',
  readyToActivate([growth, chiuso, manut]).map(s => s.label), ['Manutenzione'])
eq('attivata, a giugno entra',
  linesForMonth([growth, chiuso, { ...manut, status: 'attivo' as const }], rate, '2026-06-01')
    .map(l => l.amount_net), [3600, 500])

console.log('\n— Le rate valgono anche a lavoro finito —')
eq('saldo dopo la fine del progetto',
  linesForMonth([chiuso], [I({ id: 'x', stream_id: 'd', due_month: '2026-07-01', amount: 4000 })], '2026-07-01')
    .map(l => l.amount_net), [4000])

console.log('\n— Piani di fatturazione —')
eq('40/30/30 su 12.000', splitByPercent(12000, [40, 30, 30], '2026-01-01').map(r => r.amount), [4800, 3600, 3600])
eq('somma esatta anche con arrotondamenti', splitEven(10000, 3, '2026-01-01').reduce((s, r) => s + r.amount, 0), 10000)
eq('durata marzo→maggio', monthSpan('2026-03-01', '2026-05-01'), 3)

console.log('\n— Confini del canone —')
eq('prima dell\'avvio non vale', activeInMonth(growth, '2025-12-01'), false)
eq('sospeso non vale', activeInMonth({ ...growth, status: 'sospeso' }, '2026-02-01'), false)
eq('dopo la fine non vale', activeInMonth({ ...growth, end_date: '2026-03-01' }, '2026-04-01'), false)

console.log(fail === 0 ? '\nTutti i controlli passano.' : `\n${fail} falliti.`)
process.exit(fail ? 1 : 0)
