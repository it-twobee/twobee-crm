/* Giorni non lavorativi e conti senza fusi (§355).
   Esegui: npx tsx lib/calendario-lavorativo.check.ts

   Questo gate nasce da un difetto vero: il calendario milestone evidenziava
   **domani**. Le colonne erano costruite a mezzanotte locale e rilette con
   `toISOString()`, che è UTC — a Roma due ore indietro — quindi la cella del 19
   si dichiarava «18». Un errore di un giorno non alza nessuna eccezione: si
   vede solo se qualcuno guarda il calendario sapendo che giorno è. */
import {
  giornoUTC, isoUTC, oggiLocale, pasqua, pasquetta, isFestivo, isWeekend, nonLavorativo, perche,
} from '@/lib/calendario-lavorativo'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Andata e ritorno senza perdere un giorno —')
/* La regressione in una riga: costruire il giorno e rileggerlo deve restituire
   la stessa data, sotto qualunque fuso. Con la mezzanotte locale non succedeva. */
for (const iso of ['2026-01-01', '2026-03-29', '2026-06-15', '2026-09-19', '2026-10-25', '2026-12-31']) {
  is(`${iso} torna se stesso`, isoUTC(giornoUTC(iso)), iso)
}
is('il giorno dopo è il giorno dopo', isoUTC(giornoUTC('2026-09-19') + 86400000), '2026-09-20')
/* Le due domeniche del cambio d'ora sono il posto dove i conti in locale si
   rompono: 23 ore l'una, 25 l'altra. In UTC durano 24 ore come tutte. */
is('cambio ora di marzo', isoUTC(giornoUTC('2026-03-28') + 86400000), '2026-03-29')
is('cambio ora di ottobre', isoUTC(giornoUTC('2026-10-24') + 86400000), '2026-10-25')

console.log('\n— «Oggi» è quello di chi guarda —')
/* `toISOString()` sul fuso di Roma, dopo le 22, dà già il giorno dopo: l'orologio
   del server non è quello della persona, e il segno di oggi deve stare dove la
   persona vede oggi. */
const seraTardi = new Date('2026-09-19T22:30:00+02:00')
is('alle 22:30 del 19 siamo ancora al 19', oggiLocale(seraTardi), '2026-09-19')
is('e non al 20 come direbbe UTC', seraTardi.toISOString().slice(0, 10), '2026-09-19')
const primoMattino = new Date('2026-09-19T00:30:00+02:00')
is('alle 00:30 del 19 siamo al 19', oggiLocale(primoMattino), '2026-09-19')

console.log('\n— Sabato e domenica —')
is('sabato 19 settembre 2026', isWeekend('2026-09-19'), true)
is('domenica 20', isWeekend('2026-09-20'), true)
is('venerdì 18 no', isWeekend('2026-09-18'), false)
is('lunedì 21 no', isWeekend('2026-09-21'), false)
is('e il perché si scrive', [perche('2026-09-19'), perche('2026-09-20'), perche('2026-09-18')],
  ['Sabato', 'Domenica', null])

console.log('\n— Le feste italiane —')
is('Capodanno', isFestivo('2027-01-01'), true)
is('Epifania', isFestivo('2027-01-06'), true)
is('25 aprile', isFestivo('2026-04-25'), true)
is('1 maggio', isFestivo('2026-05-01'), true)
is('2 giugno', isFestivo('2026-06-02'), true)
is('Ferragosto', isFestivo('2026-08-15'), true)
is('Ognissanti', isFestivo('2026-11-01'), true)
is('Immacolata', isFestivo('2026-12-08'), true)
is('Natale e Santo Stefano', [isFestivo('2026-12-25'), isFestivo('2026-12-26')], [true, true])
is('un mercoledì qualunque no', isFestivo('2026-09-16'), false)
/* Il patrono resta fuori: cambia da città a città, e spegnere un giorno
   lavorativo per metà squadra fa più danno che non spegnerne nessuno. */
is('il patrono non è nell\'elenco', isFestivo('2026-06-24'), false)

console.log('\n— Pasqua, l\'unica mobile —')
is('Pasqua 2026', pasqua(2026), '2026-04-05')
is('Pasqua 2027', pasqua(2027), '2027-03-28')
is('Pasqua 2024', pasqua(2024), '2024-03-31')
is('Pasqua 2025', pasqua(2025), '2025-04-20')
is('Pasquetta 2026 è il lunedì dopo', pasquetta(2026), '2026-04-06')
is('e risulta festiva', isFestivo('2026-04-06'), true)
is('la domenica di Pasqua è già festiva di suo', nonLavorativo('2026-04-05'), true)
is('il martedì dopo si lavora', nonLavorativo('2026-04-07'), false)

console.log('\n— Non lavorativo = weekend oppure festa —')
/* Il 25 dicembre 2026 cade di **venerdì**: non è weekend, è festa — ed è il caso
   che distingue le due domande. La prima versione di questo controllo diceva
   «true» anche al weekend, cioè chiedeva al codice di sbagliare. */
is('Natale 2026 è venerdì: festa, non weekend',
  [isWeekend('2026-12-25'), isFestivo('2026-12-25'), nonLavorativo('2026-12-25')],
  [false, true, true])
is('il 26 aprile 2026 è domenica', nonLavorativo('2026-04-26'), true)
is('un martedì di lavoro', nonLavorativo('2026-09-22'), false)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
