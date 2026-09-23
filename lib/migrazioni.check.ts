/* §423 — il numero di una migration è uno solo. Esegui: npx tsx lib/migrazioni.check.ts
 *
 * «La 254» deve portare a un file solo, come «vedi §329» a una decisione sola.
 * Il 23 settembre, con più sessioni su main, è successo due volte in un giorno:
 * due 254, e una bozza locale 255 contro la 255 arrivata da origin. Supabase
 * registra la sua versione e non il nome del file, quindi il database non si
 * rompe. Si rompe chi legge: il registro ha due righe con la stessa chiave, e
 * un «applica la 255» vuol dire due cose.
 *
 * La regola sta in `scripts/prossima-migrazione.mjs`: una migration in
 * lavorazione si chiama `XXX_nome.sql`, e il numero si prende un attimo prima
 * del commit con `npm run migrazione <bozza>`. Questo controllo è la rete sotto:
 * ferma i numeri doppi, le intestazioni rimaste al numero vecchio, e un
 * registro che indica come libera una migration già presa.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const DIR = 'supabase/migrations'
const NUMERATA = /^(\d{3})_.+\.sql$/

/** I doppi che c'erano già, applicati da tempo. Rinominarli adesso farebbe
    cercare un file che nel registro ha un altro nome, quindi restano. Uno
    nuovo non si aggiunge qui: si rinumera. */
const STORICI: Record<number, string> = {
  80: 'workspace clienti e visibilità documenti, prima che la regola esistesse',
  81: 'manager dei progetti e sezioni del workspace, idem',
  109: 'viste per utente e cartelle dello storage, idem',
  223: 'tappe ricorrenti e commerciale, applicate tutte e due (§337); la commerciale è registrata come 20260915125709',
}

const nomi = readdirSync(DIR).filter(n => NUMERATA.test(n))
const perNumero = new Map<number, string[]>()
for (const nome of nomi) {
  const n = Number(NUMERATA.exec(nome)![1])
  perNumero.set(n, [...(perNumero.get(n) ?? []), nome])
}
const doppi = Array.from(perNumero.entries()).filter(([, file]) => file.length > 1)

console.log('— Un numero, un file —')
is('nessun numero doppio oltre agli storici',
  doppi.filter(([n]) => !(n in STORICI)).map(([, file]) => file.join(' + ')), [])
/* Un'eccezione che non serve più è un buco: se uno storico è stato sistemato,
   va tolto da qui, o il prossimo doppio con quel numero passerebbe. */
is('e gli storici sono ancora doppi davvero',
  Object.keys(STORICI).map(Number).filter(n => (perNumero.get(n)?.length ?? 0) < 2), [])

console.log('\n— L\'intestazione dice lo stesso numero del nome —')
const storte = nomi.filter(nome => {
  const testa = /^-- (\d{3})\b/.exec(readFileSync(join(DIR, nome), 'utf8'))
  return testa !== null && testa[1] !== nome.slice(0, 3)
})
is('nessuna migration rinumerata col numero vecchio in testa', storte, [])

console.log('\n— Il registro dice la prossima giusta —')
const massimo = Math.max(...Array.from(perNumero.keys()))
const registro = readFileSync('docs/migrations.md', 'utf8')
const detta = /La prossima libera è la \*\*(\d{3})\*\*/.exec(registro)?.[1] ?? null
is('docs/migrations.md indica la prossima libera', detta, String(massimo + 1).padStart(3, '0'))

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
