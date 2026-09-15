/* Verifica di cosa manca da generare (§337). Esegui: npx tsx lib/recurrence-run.check.ts */
import { missingFor } from '@/lib/recurrence-run'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(56)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const t = (o: Partial<Parameters<typeof missingFor>[0][number]> = {}) => ({
  id: 't1', generation_lead_days: 30, frequency: 'weekly' as const, interval: 1,
  weekdays: [1], day_of_month: null, start_date: '2026-09-01', end_date: null, ...o,
})

console.log('\n— La finestra è del template, non del motore —')
is('trenta giorni di lunedì', missingFor([t()], [], '2026-09-15').map(x => x.date),
  ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'])
is('tre giorni non ne prendono nessuno',
  missingFor([t({ generation_lead_days: 3 })], [], '2026-09-15').map(x => x.date), [])
is('novanta giorni ne prendono di più',
  missingFor([t({ generation_lead_days: 90 })], [], '2026-09-15').length, 13)

console.log('\n— Rilanciare non duplica —')
const tutte = missingFor([t()], [], '2026-09-15')
const esistenti = tutte.map(x => ({ recurring_template_id: 't1', generated_for_date: x.date }))
is('al secondo giro non manca più niente', missingFor([t()], esistenti, '2026-09-15'), [])
is('e se ne cancello una, torna solo quella',
  missingFor([t()], esistenti.slice(1), '2026-09-15').map(x => x.date), ['2026-09-21'])
/* L'occorrenza di un'altra serie non conta come «già fatta»: le due chiavi sono
   template **e** data, e guardare solo la data farebbe sparire la ricorrente di
   un cliente perché quella di un altro cade lo stesso giorno. */
is('una data presa da un\'altra serie non blocca questa',
  missingFor([t()], [{ recurring_template_id: 'altro', generated_for_date: '2026-09-21' }], '2026-09-15')
    .map(x => x.date).slice(0, 1), ['2026-09-21'])

console.log('\n— Più serie insieme —')
is('ognuna con la sua finestra',
  missingFor([
    t({ id: 'a', generation_lead_days: 7 }),
    t({ id: 'b', frequency: 'monthly', day_of_month: 25, generation_lead_days: 30 }),
  ], [], '2026-09-15').map(x => `${x.template.id}:${x.date}`),
  ['a:2026-09-21', 'b:2026-09-25'])

console.log('\n— Quello che non deve generare —')
is('una serie finita non produce niente',
  missingFor([t({ end_date: '2026-09-10' })], [], '2026-09-15'), [])
is('una che parte dopo la finestra nemmeno',
  missingFor([t({ start_date: '2027-01-01' })], [], '2026-09-15'), [])
/* `custom` è una RRULE che nessuno qui sa leggere: non inventa occorrenze. */
is('custom non genera', missingFor([t({ frequency: 'custom' })], [], '2026-09-15'), [])

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
