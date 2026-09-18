/* La voce delle liste (§351). Esegui: npx tsx lib/task-mood.check.ts
   Le frasi sono libere di essere simpatiche, non di mentire: qui si controlla
   che il numero ci sia sempre, che la stessa situazione dia sempre la stessa
   frase, e che nessuna variante sfori la riga. */
import { verdetto, sottotitolo, saluto, seme, type Momento } from '@/lib/task-mood'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const MOMENTI: Momento[] = [
  { ora: null, giorno: null },
  ...[7, 11, 13, 17, 20, 23].flatMap(ora => [0, 1, 3, 5, 6].map(giorno => ({ ora, giorno }))),
]
const SEMI = Array.from({ length: 40 }, (_, i) => i * 7 + 1)
const conti = (o: Partial<Parameters<typeof verdetto>[0]> = {}) =>
  ({ aperte: 10, late: 4, soon: 2, tutte: 16, ...o })

console.log('\n— Il numero non si tocca —')
let senzaNumero = 0, troppoLunghe = 0, vuote = 0
for (const m of MOMENTI) for (const s of SEMI) {
  for (const [c, n] of [
    [conti({ late: 4 }), 4],
    [conti({ late: 1 }), 1],
    [conti({ late: 0, soon: 3 }), 3],
    [conti({ late: 0, soon: 0, aperte: 7 }), 7],
  ] as const) {
    const t = verdetto(c, m, s).testo
    if (!t.includes(String(n))) senzaNumero++
    if (t.length > 92) troppoLunghe++
    if (!t.trim()) vuote++
  }
}
is('ogni verdetto con un conteggio lo scrive', senzaNumero, 0)
is('nessuna frase sfora la riga (92 caratteri)', troppoLunghe, 0)
is('nessuna frase vuota', vuote, 0)

console.log('\n— L\'ordine della gravità non cambia —')
is('il ritardo batte la scadenza vicina', verdetto(conti({ late: 2, soon: 9 }), MOMENTI[0], 1).tono, 'error')
is('la scadenza vicina batte le buone notizie', verdetto(conti({ late: 0, soon: 9 }), MOMENTI[0], 1).tono, 'warning')
is('tutto chiuso è un successo', verdetto(conti({ late: 0, soon: 0, aperte: 0 }), MOMENTI[0], 1).tono, 'success')
/* Con zero task in tutto non si può essere «in ritardo»: il caso vuoto viene
   prima di ogni altro, o la lista di chi è appena arrivato lo accoglierebbe
   con un rimprovero. */
is('nessuna task: tono neutro', verdetto({ aperte: 0, late: 0, soon: 0, tutte: 0 }, MOMENTI[0], 1).tono, 'neutro')
is('e non parla di ritardi',
  /ritard|scadut/i.test(verdetto({ aperte: 0, late: 0, soon: 0, tutte: 0 }, MOMENTI[0], 1).testo), false)

console.log('\n— Stessa situazione, stessa frase —')
const a = verdetto(conti(), { ora: 9, giorno: 1 }, seme('2026-09-18', 4, 10))
const b = verdetto(conti(), { ora: 9, giorno: 1 }, seme('2026-09-18', 4, 10))
is('due letture uguali danno lo stesso testo', a.testo === b.testo, true)
/* Il seme cambia col giorno e coi numeri: se non cambiasse, la stessa battuta
   resterebbe lì finché qualcuno non chiude una task — cioè per sempre. */
is('domani cambia', seme('2026-09-18', 4, 10) !== seme('2026-09-19', 4, 10), true)
is('e cambia se cambiano i numeri', seme('2026-09-18', 4, 10) !== seme('2026-09-18', 3, 10), true)
is('ma non cambia scrivendo nella ricerca', seme('2026-09-18', 4, 10), seme('2026-09-18', 4, 10))

console.log('\n— Prima che si sappia che ore sono —')
/* Il server sta su UTC e chi legge no: se il primo render scegliesse una frase
   dell'orologio, il browser ne scriverebbe un'altra e React protesterebbe. */
let orarieAlPrimoRender = 0
for (const s of SEMI) {
  const t = [
    verdetto(conti(), { ora: null, giorno: null }, s).testo,
    sottotitolo({ origin: 'tutte', personale: true }, { ora: null, giorno: null }, s),
    saluto({ ora: null, giorno: null }, s),
  ].join(' ')
  if (/caffè|mattina|pomeriggio|venerdì|lunedì|weekend|18:00|stasera/i.test(t)) orarieAlPrimoRender++
}
is('senza ora non si pescano frasi dell\'orologio', orarieAlPrimoRender, 0)

console.log('\n— Ce n\'è per ogni situazione —')
const combinazioni = MOMENTI.flatMap(m => SEMI.map(s => [m, s] as const))
is('il sottotitolo non è mai vuoto',
  combinazioni.filter(([m, s]) =>
    (['tutte', 'progetto', 'ad_hoc'] as const).some(o =>
      !sottotitolo({ origin: o, personale: true }, m, s).trim()
      || !sottotitolo({ origin: o, personale: false }, m, s).trim())).length, 0)
is('il saluto non è mai vuoto', combinazioni.filter(([m, s]) => !saluto(m, s).trim()).length, 0)
/* Quante ne vede davvero chi guarda: una sola variante è una frase fissa con
   più righe di codice intorno. */
const distinte = (fn: (m: Momento, s: number) => string) =>
  new Set(combinazioni.map(([m, s]) => fn(m, s))).size
is('il verdetto in ritardo ha più di quattro varianti',
  distinte((m, s) => verdetto(conti({ late: 4 }), m, s).testo) > 4, true)
is('il saluto ne ha più di quattro', distinte((m, s) => saluto(m, s)) > 4, true)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
