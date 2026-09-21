/* Le date che tornano ogni anno (§361). Esegui: npx tsx lib/ricorrenze-azienda.check.ts

   Due cose si controllano più delle altre, perché sono quelle che sbagliano in
   silenzio: il giorno zero (nascere non è compiere un anno) e il 29 febbraio. */

import { FONDAZIONE, prossima, compleannoTwoBee, etaTwoBee } from '@/lib/ricorrenze-azienda'
import { nomeFestivo } from '@/lib/calendario-lavorativo'
import { isMarketing } from '@/lib/date-marketing'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Nascere non è compiere un anno —')
is('il giorno della fondazione non è un anniversario',
  prossima(FONDAZIONE, FONDAZIONE, 0), { data: '2026-03-10', inGiorni: 0, anni: null })
is('il primo anniversario è un anno dopo',
  prossima(FONDAZIONE, '2027-03-10', 0), { data: '2027-03-10', inGiorni: 0, anni: 1 })
is('e il secondo due anni dopo', prossima(FONDAZIONE, '2028-03-10', 0)?.anni, 2)
is('un\'assunzione che deve ancora cominciare non produce anniversari',
  prossima('2027-01-15', '2026-09-19', 366)?.anni, null)

console.log('\n— La finestra —')
is('fuori finestra è come se non ci fosse', prossima(FONDAZIONE, '2026-09-19', 14), null)
is('dentro la finestra si vede',
  prossima(FONDAZIONE, '2027-03-01', 14), { data: '2027-03-10', inGiorni: 9, anni: 1 })
is('il giorno stesso conta come dentro', prossima(FONDAZIONE, '2027-03-10', 0)?.inGiorni, 0)
is('il giorno dopo salta all\'anno prossimo',
  prossima(FONDAZIONE, '2027-03-11', 366), { data: '2028-03-10', inGiorni: 365, anni: 2 })
is('una data vuota non inventa niente', prossima(null, '2026-09-19'), null)
is('e nemmeno una data storta', prossima('non-una-data', '2026-09-19'), null)

console.log('\n— Il 29 febbraio —')
is('negli anni normali si festeggia il 28',
  prossima('2000-02-29', '2027-02-01', 60), { data: '2027-02-28', inGiorni: 27, anni: 27 })
is('e negli anni bisestili al suo posto',
  prossima('2000-02-29', '2028-02-01', 60), { data: '2028-02-29', inGiorni: 28, anni: 28 })
/* Lo scalino vale **dentro** il mese: il 31 marzo resta il 31 marzo, non
   diventa il 28 febbraio. Il caso esiste solo per il 29 febbraio, ed è bene
   che sia così: una data che si sposta di mese non è più la stessa data. */
is('il 31 marzo resta il 31 marzo', prossima('1990-03-31', '2027-02-01', 60)?.data, '2027-03-31')
is('e il 31 gennaio non diventa il 3 marzo', prossima('1990-01-31', '2027-01-01', 40)?.data, '2027-01-31')

console.log('\n— L\'età di TwoBee —')
is('nel primo anno di vita ha zero anni', etaTwoBee('2026-09-19'), 0)
is('il giorno prima del compleanno ancora zero', etaTwoBee('2027-03-09'), 0)
is('il giorno del compleanno uno', etaTwoBee('2027-03-10'), 1)
is('e il compleanno si sa due settimane prima', compleannoTwoBee('2027-02-24')?.inGiorni, 14)
is('quindici giorni prima ancora no', compleannoTwoBee('2027-02-23'), null)

console.log('\n— Una ricorrenza non è un giorno di chiusura —')
/* Se il 10 marzo finisse fra i festivi, il calendario milestone spegnerebbe la
   colonna (§355) e le scadenze slitterebbero: il compleanno dell'azienda
   sposterebbe le consegne ai clienti. E non è una data marketing (§357): non
   muove il piano editoriale di nessuno. */
is('il 10 marzo si lavora', nomeFestivo('2027-03-10'), null)
is('e non muove nessuna campagna', isMarketing('2027-03-10'), false)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
