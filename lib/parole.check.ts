/* §359 — la parola che non ci descrive. Esegui: npx tsx lib/parole.check.ts
 *
 * TwoBee è una **società di consulenza digitale**, non un'agenzia: è la cosa
 * più lontana da come lavoriamo, e finché la parola resta scritta da qualche
 * parte torna su da sola — in un prompt dell'assistente, in un report al
 * cliente, nel sottotitolo di una lista. Una regola di lingua che vive solo
 * nella testa di chi l'ha detta dura fino al prossimo che scrive un testo.
 *
 * Qui non si vieta la parola in assoluto: si vieta **su di noi**. Un fornitore
 * può essere un'agenzia, il cliente può averne una di supporto, e l'Agenzia
 * delle Entrate si chiama così. Quelle restano, una per una, con il motivo
 * scritto accanto: se ne serve una nuova si aggiunge qui, e aggiungerla è il
 * momento in cui qualcuno si chiede se sta parlando di noi o di altri.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

/** Dove la parola parla di **altri**, e quindi è legittima. */
const AMMESSE: { schema: RegExp; perche: string }[] = [
  { schema: /agenzia\s*entrate|agenziaentrate/i, perche: 'si chiama così: è l\'ente' },
  { schema: /agenzia partner/i, perche: 'un fornitore, non noi' },
  { schema: /agenzia che lavora per noi/i, perche: 'un fornitore, non noi' },
  { schema: /agenzia[ _]di[ _]supporto|agenzia_supporto/i, perche: 'l\'agenzia del cliente, non la nostra' },
  { schema: /studi, consulenti, agenzie/i, perche: 'elenco di tipi di fornitore' },
  { schema: /agenzia, studio, software house/i, perche: 'elenco di tipi di fornitore' },
]

const RADICI = ['app', 'components', 'lib', 'docs']
const SALTA = new Set(['node_modules', '.next', '.git'])
const ESTENSIONI = ['.ts', '.tsx', '.md']

function file(dir: string): string[] {
  const out: string[] = []
  for (const voce of readdirSync(dir)) {
    if (SALTA.has(voce)) continue
    const p = join(dir, voce)
    if (statSync(p).isDirectory()) out.push(...file(p))
    else if (ESTENSIONI.some(e => voce.endsWith(e))) out.push(p)
  }
  return out
}

const colpevoli: string[] = []
const giustificate: string[] = []
for (const p of RADICI.flatMap(r => file(r))) {
  // questo controllo la parola deve poterla nominare, o non potrebbe cercarla
  if (p.endsWith('lib/parole.check.ts')) continue
  const righe = readFileSync(p, 'utf8').split('\n')
  righe.forEach((riga, i) => {
    if (!/agenzi[ae]/i.test(riga)) return
    const ok = AMMESSE.find(a => a.schema.test(riga))
    if (ok) giustificate.push(`${p}:${i + 1} (${ok.perche})`)
    else colpevoli.push(`${p}:${i + 1} · ${riga.trim().slice(0, 90)}`)
  })
}

console.log('\n— «Agenzia» non ci descrive —')
if (colpevoli.length) colpevoli.forEach(c => console.log(`     ${c}`))
is('nessuna riga ci chiama agenzia', colpevoli.length, 0)
/* Le eccezioni non sono un buco: sono l'elenco di quando la parola parla di
   altri. Se diventasse vuoto vorrebbe dire che qualcuno ha riscritto anche
   quelle, e allora questo controllo non serve più a niente. */
is('e le eccezioni sono poche e motivate', giustificate.length > 0 && giustificate.length < 20, true)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
