/**
 * Gate di `lib/money.ts`. Il caso che ha fatto nascere il modulo è il primo:
 * l'italiano di CLDR non raggruppa i numeri di **quattro** cifre, quindi 2673
 * restava «2673 €» accanto a «12.673 €» nella stessa colonna, e due notazioni
 * per lo stesso numero fanno dubitare del totale prima ancora di leggerlo.
 *
 *   npx tsx lib/money.check.ts
 */
import { eur, eur2 } from './money'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (got === want) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}

// il caso che l'ha fatto nascere: quattro cifre
eq('quattro cifre si raggruppano lo stesso', eur(2673), '2.673 €')
eq('cinque anche', eur(12673), '12.673 €')
eq('sette pure', eur(1234567), '1.234.567 €')
eq('tre no, non c\'è niente da raggruppare', eur(999), '999 €')
eq('mille è il confine', eur(1000), '1.000 €')
eq('zero è zero', eur(0), '0 €')
// il meno tipografico, non il trattino della tastiera
eq('il negativo ha il segno giusto', eur(-2673), '−2.673 €')
eq('l\'euro sta dopo, come in tutta l\'interfaccia', eur(5).endsWith(' €'), true)
eq('si arrotonda all\'unità', eur(2672.6), '2.673 €')

eq('coi centesimi quando servono', eur2(2672.22), '2.672,22 €')
eq('e li tiene anche quando sono zero', eur2(1500), '1.500,00 €')
eq('negativo coi centesimi', eur2(-5), '−5,00 €')

if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)
