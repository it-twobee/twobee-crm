/* La stima del costo del lavoro dei mesi futuri (§443).
   Esegui: npx tsx lib/payroll-stima.check.ts

   Il costo da contratto non è la cassa: contiene ratei e TFR che quel mese non
   escono. La stima parte dal mese vero e aggiunge solo chi entra o esce — e a
   organico fermo deve dare esattamente il mese vero, non un euro di più. */

import { DEFAULT_PAYROLL_PARAMS } from '@/lib/payroll'
import { costoLavoroDaOrganico, stimaLavoro } from '@/lib/payroll-map'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(62)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const persona = (x: Record<string, unknown>) => ({ full_name: 'X', contract_kind: 'indeterminato', gross_year: 28000, months: 14, fte: 1, is_active: true, ...x })
const organico = [
  persona({ id: 'a', hired_on: '2024-01-15' }),
  persona({ id: 'b', hired_on: '2026-11-01' }),
  persona({ id: 'c', hired_on: '2023-03-01', end_date: '2026-10-31' }),
]
const P = DEFAULT_PAYROLL_PARAMS
const mese = (m: string) => costoLavoroDaOrganico(organico, P, m)

console.log('\n— Chi è in forza —')
is('ottobre: a e c, b non ancora', mese('2026-10-01').persone, 2)
is('novembre: entra b, esce c', mese('2026-11-01').persone, 2)
is('settembre: a e c', mese('2026-09-01').persone, 2)
is('chi non è attivo non conta', costoLavoroDaOrganico([persona({ is_active: false, hired_on: '2020-01-01' })], P, '2026-10-01').persone, 0)
const uno = costoLavoroDaOrganico([organico[0]], P, '2026-10-01').totale
is('una persona costa più di zero', uno > 0, true)
is('due persone uguali costano il doppio', costoLavoroDaOrganico([organico[0], { ...organico[0], id: 'z' }], P, '2026-10-01').totale, Math.round(uno * 2 * 100) / 100)

console.log('\n— La stima: il mese vero, più o meno chi cambia —')
const mappa = new Map(['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01'].map(m => [m, mese(m)]))
const base = { totale: 6949, mese: '2026-09-01' }
is('a organico fermo: esattamente il mese vero', stimaLavoro(base, mappa, '2026-10-01'), { totale: 6949, variazione: 0, persone: 2 })
const piu = stimaLavoro(base, new Map([...Array.from(mappa), ['2026-12-01', costoLavoroDaOrganico([...organico, persona({ id: 'd', hired_on: '2026-12-01' })], P, '2026-12-01')]]), '2026-12-01')
is('chi entra aggiunge il suo costo', [piu.variazione, piu.totale], [uno, Math.round((6949 + uno) * 100) / 100])
const meno = stimaLavoro(base, new Map([...Array.from(mappa), ['2026-12-01', costoLavoroDaOrganico([organico[0]], P, '2026-12-01')]]), '2026-12-01')
is('chi esce toglie il suo', meno.variazione, -uno)
is('mese che l\'organico non conosce: il mese vero, senza fingere di sapere', stimaLavoro(base, mappa, '2027-06-01'), { totale: 6949, variazione: 0, persone: null })
is('mai sotto zero', stimaLavoro({ totale: 100, mese: '2026-09-01' }, new Map([['2026-09-01', { totale: 9000, persone: 3 }], ['2026-10-01', { totale: 0, persone: 0 }]]), '2026-10-01').totale, 0)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
