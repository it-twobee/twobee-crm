/* Le date che muovono le campagne (§357). Esegui: npx tsx lib/date-marketing.check.ts

   Le date calcolate sono il punto debole: «venerdì dopo il quarto giovedì di
   novembre» si sbaglia di una settimana una volta ogni tanto, e ci si accorge
   l'anno in cui capita — cioè quando il piano è già in mano al cliente. */
import {
  ricorrenzaMarketing, isMarketing, ricorrenzeDi,
  blackFriday, cyberMonday, blackWeek, festaDellaMamma, saldiEstivi, rientro,
} from '@/lib/date-marketing'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const giorno = (iso: string) => ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][new Date(`${iso}T00:00:00Z`).getUTCDay()]

console.log('\n— Black Friday, cinque anni di fila —')
/* Date verificate: il Black Friday è il venerdì dopo il quarto giovedì di
   novembre, che **non** è sempre l'ultimo venerdì del mese. */
is('2024', blackFriday(2024), '2024-11-29')
is('2025', blackFriday(2025), '2025-11-28')
is('2026', blackFriday(2026), '2026-11-27')
is('2027', blackFriday(2027), '2027-11-26')
/* 2030: il 1° novembre è venerdì, il quarto giovedì cade il 28 → BF il 29. È
   l'anno in cui «ultimo venerdì di novembre» darebbe lo stesso risultato per
   caso; il 2025 no, e lì la scorciatoia si romperebbe. */
is('2030', blackFriday(2030), '2030-11-29')
is('ed è sempre un venerdì',
  [2024, 2025, 2026, 2027, 2030].map(a => giorno(blackFriday(a))), ['ven', 'ven', 'ven', 'ven', 'ven'])

console.log('\n— Cyber Monday e la settimana —')
is('Cyber Monday 2026', cyberMonday(2026), '2026-11-30')
is('ed è lunedì', giorno(cyberMonday(2026)), 'lun')
is('la Black Week parte di lunedì', giorno(blackWeek(2026).da), 'lun')
is('e finisce col Cyber Monday', blackWeek(2026), { da: '2026-11-23', a: '2026-11-30' })
/* Dentro la settimana i due giorni con un nome proprio lo tengono: chi guarda
   il venerdì deve leggere «Black Friday», non «Black Week». */
is('il venerdì si chiama col suo nome', ricorrenzaMarketing('2026-11-27')?.nome, 'Black Friday')
is('il lunedì dopo pure', ricorrenzaMarketing('2026-11-30')?.nome, 'Cyber Monday')
is('gli altri giorni sono la settimana', ricorrenzaMarketing('2026-11-25')?.nome, 'Black Week')
is('il venerdì prima è fuori', isMarketing('2026-11-20'), false)

console.log('\n— Le altre calcolate —')
is('festa della mamma 2026', festaDellaMamma(2026), '2026-05-10')
is('festa della mamma 2027', festaDellaMamma(2027), '2027-05-09')
is('ed è sempre domenica', [2024, 2025, 2026, 2027].map(a => giorno(festaDellaMamma(a))),
  ['dom', 'dom', 'dom', 'dom'])
is('saldi estivi 2026 (primo sabato di luglio)', saldiEstivi(2026), '2026-07-04')
is('ed è sabato', giorno(saldiEstivi(2026)), 'sab')
is('rientro 2026 (primo lunedì di settembre)', rientro(2026), '2026-09-07')
is('ed è lunedì', giorno(rientro(2026)), 'lun')

console.log('\n— Le fisse —')
for (const [data, nome] of [
  ['2026-02-14', 'San Valentino'], ['2026-03-08', 'Festa della donna'],
  ['2026-03-19', 'Festa del papà'], ['2026-10-31', 'Halloween'],
  ['2026-11-11', "Singles' Day"], ['2026-01-05', 'Saldi invernali'],
] as const) is(nome, ricorrenzaMarketing(data)?.nome, nome)
is('il 1° dicembre apre l\'avvento',
  ricorrenzaMarketing('2026-12-01')?.nome, 'Via il calendario dell\'avvento')

console.log('\n— Poche e vere —')
/* Il numero è la sostanza della regola: una colonna colorata dice «guarda qui»
   solo finché resta rara. Sopra le venti l'anno diventa decorazione. */
const a2026 = ricorrenzeDi(2026)
is('nel 2026 sono meno di venti', a2026.length < 20, true)
is('e più di otto', a2026.length > 8, true)
is('ogni giorno ha una nota', a2026.every(r => !!ricorrenzaMarketing(r.data)?.nota), true)
/* Un giorno qualunque non è una ricorrenza: se lo fosse, il calendario sarebbe
   tutto colorato e nessuno guarderebbe più le colonne. */
is('un martedì di marzo non lo è', isMarketing('2026-03-17'), false)
is('né un giovedì di ottobre', isMarketing('2026-10-15'), false)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
