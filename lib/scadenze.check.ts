/* Lo scadenzario fiscale unico (§448).
   Esegui: npx tsx lib/scadenze.check.ts */

import { scadenzaF24, scadenzeF24Personale, scadenzario, daFiscale } from '@/lib/scadenze'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(62)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Il 16 del mese dopo —')
is('settembre → 16 ottobre (venerdì)', scadenzaF24('2026-09-01'), '2026-10-16')
is('luglio → 16 agosto è domenica: lunedì 17', scadenzaF24('2026-07-01'), '2026-08-17')
is('dicembre → gennaio dell\'anno dopo', scadenzaF24('2026-12-01'), '2027-01-18')

console.log('\n— Da dove viene l\'importo —')
const s = scadenzeF24Personale(['2026-08-01', '2026-09-01', '2026-10-01'],
  [{ month: '2026-08-01', total: 3120.5, paidOn: '2026-09-16' }],
  new Map([['2026-09-01', { trattenute: 800, oneri: 2100, n: 3 }]]))
is('agosto: dall\'F24, pagato', [s[0].importo, s[0].fonte, s[0].pagata], [3120.5, 'documento', true])
is('settembre: stima dai cedolini', [s[1].importo, s[1].fonte], [2900, 'cedolini'])
is('ottobre: niente numero, detto', [s[2].importo, s[2].fonte], [null, 'nessuna'])

console.log('\n— Tutto insieme —')
const tutto = scadenzario(s, daFiscale([{ id: 'iva3', date: '2026-11-16', label: 'IVA 3º trimestre', detail: '', kind: 'iva', amount: 4000, daysLeft: 0, past: false }]))
is('in ordine di data', tutto.map(x => x.data), ['2026-09-16', '2026-10-16', '2026-11-16', '2026-11-16'])
is('stesso giorno: prima quella da pagare', tutto.slice(2).map(x => x.tipo), ['f24_personale', 'iva'])

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
