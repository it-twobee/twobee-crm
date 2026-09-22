// Qual è il prossimo § libero. Esegui: npm run paragrafo
//
// I `§NNN` sono etichette condivise: servono a scrivere «vedi §329» e ritrovare
// la decisione. Quando su main lavorano tre sessioni in parallelo, ognuna
// sceglie «il prossimo libero» leggendo il repository — e nessuna vede il
// lavoro non ancora spinto delle altre. Così partono tutte dallo stesso numero
// e se ne accorgono al push: è successo sei volte in un giorno solo.
//
// La regola che costa meno: **il numero si prende alla fine**, un attimo prima
// del commit, dopo un fetch. Questo comando fa il fetch e guarda tre posti —
// `origin/main`, il tuo lavoro non ancora spinto, e i titoli dei commit — così
// il numero non si stima a occhio.
import { execFileSync } from 'node:child_process'

const argv = process.argv.slice(2)
const verifica = Number((argv.find(a => /^\d+$/.test(a)) ?? '').trim()) || null
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
const GLOBS = ['*.ts', '*.tsx', '*.sql', '*.md', '*.mjs']

if (!argv.includes('--senza-fetch')) {
  try { git('fetch', '--quiet', 'origin') }
  catch { console.error('Attenzione: fetch non riuscito — il confronto usa quello che hai in locale.\n') }
}

function raccogli(args, etichetta) {
  let out = ''
  // `git grep` esce 1 quando non trova niente: non è un errore.
  try { out = git(...args) } catch (error) { out = error.stdout ?? '' }
  const numeri = new Map()
  for (const riga of out.split('\n')) {
    const match = /^(.*?):.*?§(\d{1,3})/.exec(riga) ?? /§(\d{1,3})/.exec(riga)
    if (!match) continue
    const numero = Number(match[match.length - 1])
    if (!numeri.has(numero)) numeri.set(numero, etichetta)
  }
  return numeri
}

const remoto = raccogli(['grep', '-hoE', '§[0-9]{1,3}', 'origin/main', '--', ...GLOBS], 'origin/main')
const locale = raccogli(['grep', '--untracked', '-hoE', '§[0-9]{1,3}', '--', ...GLOBS], 'il tuo lavoro')
const titoli = new Map()
for (const riga of git('log', '--format=%h %s', '-60', 'origin/main').split('\n')) {
  const match = /§(\d{1,3})\)?\s*$/.exec(riga)
  if (match) titoli.set(Number(match[1]), riga)
}

const tutti = new Map(remoto)
for (const numero of titoli.keys()) if (!tutti.has(numero)) tutti.set(numero, 'origin/main')
for (const [numero, dove] of locale) if (!tutti.has(numero)) tutti.set(numero, dove)

const massimo = Math.max(0, ...tutti.keys())
const prossimo = massimo + 1

if (verifica) {
  // La domanda è una sola: **l'ha preso qualcun altro?** Trovarlo nel proprio
  // lavoro non spinto è il caso normale — è il numero che stai usando adesso.
  const altrui = remoto.has(verifica) || titoli.has(verifica)
  if (altrui) {
    console.log(`§${verifica} l'ha già preso qualcun altro (origin/main). Rinumera a §${prossimo} prima di committare.`)
    process.exit(1)
  }
  console.log(locale.has(verifica)
    ? `§${verifica} è tuo e su origin/main è ancora libero. Committa adesso: la finestra è questa.`
    : `§${verifica} è libero. Prendilo adesso e committa: la finestra è questa.`)
  process.exit(0)
}

console.log(`Prossimo § libero: §${prossimo}\n`)
const recenti = [...titoli.entries()].sort((a, b) => b[0] - a[0]).slice(0, 6)
if (recenti.length) {
  console.log('Ultimi presi su origin/main:')
  for (const [numero, riga] of recenti) console.log(`  §${numero}  ${riga.slice(0, 96)}`)
}
const soloLocali = [...locale.keys()].filter(n => !remoto.has(n) && !titoli.has(n)).sort((a, b) => a - b)
if (soloLocali.length) {
  console.log(`\nNel tuo lavoro non ancora spinto: ${soloLocali.map(n => `§${n}`).join(', ')}`)
}
console.log('\nPrendi il numero adesso, non a inizio lavorazione: fra le due cose ci stanno i commit degli altri.')
