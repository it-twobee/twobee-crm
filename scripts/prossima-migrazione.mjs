// Qual è la prossima migration libera, e dai un numero a una bozza.
//
//   npm run migrazione                          la prossima libera, guardando anche origin/main
//   npm run migrazione 258                      esce 1 se la 258 l'ha già presa qualcun altro
//   npm run migrazione XXX_area_file_link.sql   dà alla bozza il prossimo numero libero
//
// §423. È la stessa storia dei paragrafi (§406): il numero di una migration è
// un'etichetta condivisa («la 254») e su main spingono più sessioni. Chi lo
// sceglie a inizio lavorazione lo sceglie senza vedere quello che gli altri
// stanno per spingere. Il 23 settembre è successo due volte in un giorno: due
// 254 (una è diventata 255), e una bozza locale 255 che collideva con la 255
// arrivata su main.
//
// Quindi una migration in lavorazione **non ha numero**: si chiama
// `XXX_nome.sql`, con `-- XXX —` in testa. Il numero si prende alla fine, dopo
// un fetch, con questo comando, e si committa subito. Due file con lo stesso
// numero li ferma `lib/migrazioni.check.ts`, non questo comando.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const DIR = 'supabase/migrations'
const NUMERATA = /^(\d{3})_.+\.sql$/
const BOZZA = /^XXX_.+\.sql$/
const argv = process.argv.slice(2)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })

if (!argv.includes('--senza-fetch')) {
  try { git('fetch', '--quiet', 'origin') }
  catch { console.error('Attenzione: fetch non riuscito — il confronto usa quello che hai in locale.\n') }
}

const perNumero = nomi => {
  const mappa = new Map()
  for (const nome of nomi) {
    const m = NUMERATA.exec(nome)
    if (!m) continue
    const n = Number(m[1])
    mappa.set(n, [...(mappa.get(n) ?? []), nome])
  }
  return mappa
}

let nomiRemoti = []
try { nomiRemoti = git('ls-tree', '--name-only', 'origin/main', `${DIR}/`).split('\n').filter(Boolean).map(p => basename(p)) }
catch { console.error('Attenzione: origin/main non leggibile — il confronto usa solo il locale.\n') }
const nomiLocali = readdirSync(DIR)
const remote = perNumero(nomiRemoti)
const locali = perNumero(nomiLocali)
const massimo = Math.max(0, ...remote.keys(), ...locali.keys())
const prossimo = massimo + 1
const tre = n => String(n).padStart(3, '0')

const bozza = argv.find(a => a.endsWith('.sql'))
if (bozza) {
  const nome = basename(bozza)
  const percorso = join(DIR, nome)
  if (!BOZZA.test(nome)) {
    console.log(`${nome} non è una bozza: una bozza si chiama XXX_nome.sql. Il numero si dà una volta sola.`)
    process.exit(1)
  }
  if (!existsSync(percorso)) {
    console.log(`${percorso} non c'è.`)
    process.exit(1)
  }
  const nuovo = nome.replace(/^XXX_/, `${tre(prossimo)}_`)
  const testo = readFileSync(percorso, 'utf8')
  // Solo la prima riga: «XXX» dentro il corpo può essere un'altra cosa.
  writeFileSync(percorso, testo.replace(/^-- XXX\b/, `-- ${tre(prossimo)}`))
  let tracciata = true
  try { execFileSync('git', ['ls-files', '--error-unmatch', percorso], { stdio: 'ignore' }) } catch { tracciata = false }
  if (tracciata) git('mv', percorso, join(DIR, nuovo))
  else renameSync(percorso, join(DIR, nuovo))
  console.log(`${nome} → ${nuovo}\n`)
  let citata = ''
  try { citata = git('grep', '--untracked', '-l', nome.replace(/\.sql$/, ''), '--', '.', ':!node_modules') } catch { citata = '' }
  if (citata.trim()) console.log(`La citano ancora col nome di bozza, da aggiornare:\n${citata.trim().split('\n').map(f => `  ${f}`).join('\n')}\n`)
  console.log(`Nel registro (docs/migrations.md): «La prossima libera è la **${tre(prossimo + 1)}**».`)
  console.log('Committa e spingi adesso: fra il numero e il push ci stanno i commit degli altri.')
  process.exit(0)
}

const verifica = argv.find(a => /^\d+$/.test(a))
if (verifica) {
  // La domanda è una sola: su origin/main c'è già? Averla nel proprio lavoro
  // non spinto è il caso normale, è quella che stai per committare.
  const n = Number(verifica)
  if (remote.has(n)) {
    console.log(`La ${tre(n)} su origin/main è già presa: ${remote.get(n).join(', ')}. Usa la ${tre(prossimo)}.`)
    process.exit(1)
  }
  console.log(locali.has(n)
    ? `La ${tre(n)} è tua (${locali.get(n).join(', ')}) e su origin/main è ancora libera. Committa adesso.`
    : `La ${tre(n)} su origin/main è libera. Prendila adesso e committa: la finestra è questa.`)
  process.exit(0)
}

console.log(`Prossima migration libera: ${tre(prossimo)}\n`)
const ultime = [...remote.entries()].sort((a, b) => b[0] - a[0]).slice(0, 5)
if (ultime.length) {
  console.log('Ultime su origin/main:')
  for (const [, nomi] of ultime) console.log(`  ${nomi.join(', ')}`)
}
const soloLocali = [...locali.entries()].flatMap(([, nomi]) => nomi).filter(nome => !nomiRemoti.includes(nome))
if (soloLocali.length) console.log(`\nNel tuo lavoro, non su origin/main: ${soloLocali.join(', ')}`)
const bozze = nomiLocali.filter(nome => BOZZA.test(nome))
if (bozze.length) console.log(`\nBozze senza numero: ${bozze.join(', ')} — «npm run migrazione <bozza>» quando stai per committare.`)
console.log('\nUna migration in lavorazione si chiama XXX_nome.sql: il numero si prende alla fine, non all\'inizio.')
