/* La voce di TwoBee (§365). Esegui: npx tsx lib/voce-twobee.check.ts

   Qui si controlla la cosa più delicata di tutto il sistema: la differenza fra
   una battuta che mette chi legge dalla parte di tutti gli altri e una che lo
   isola. È una differenza di **persona grammaticale**, e per questo si può
   controllare invece di doverla ricordare. */

import { VOCE, DRAMMI, drammaDelGiorno, VIETATE } from '@/lib/voce-twobee'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const vietata = (t: string) => VIETATE.some(v => v.schema.test(t))

console.log('\n— Burnout e impostore: di noi sì, di te no —')
/* Il caso che giustifica l'intero controllo: le stesse parole, la stessa
   battuta, e due effetti opposti a seconda di chi è il soggetto. */
for (const ok of [
  'Qui dentro non ha capito niente nessuno: sei in ottima compagnia.',
  'Ci sentiamo tutti degli impostori il lunedì. Passa verso le undici.',
  'Siamo tutti a pezzi di giovedì, è nella natura del giovedì.',
  'La sindrome dell\'impostore qui è un requisito d\'ingresso.',
]) is(`solidarietà: ${ok.slice(0, 42)}…`, vietata(ok), false)

for (const no of [
  'Ti senti un impostore, eh?',
  'Sei a pezzi, si vede.',
  'Sembri esaurito: stacca.',
  'Hai l\'ansia da prestazione, lo sappiamo.',
  'Stai andando in burnout.',
]) is(`diagnosi: ${no.slice(0, 42)}`, vietata(no), true)

console.log('\n— Gli altri divieti —')
for (const [t, atteso] of [
  ['Sii felice, è lunedì!', true],
  ['Sorridi, dai.', true],
  ['Dovresti chiuderne almeno una.', true],
  ['Datti una mossa.', true],
  ['Sei proprio un pigro.', true],
  ['Giornata di quelle. Ne chiudi una e va bene così.', false],
  ['Il traffico ha già fatto la sua parte: il resto è in discesa.', false],
  ['Dieci minuti in piedi e un bicchiere d\'acqua. Poi si riparte.', false],
  ['Giornata storta, capita. Scegline una corta.', false],
] as const) is(`${atteso ? 'vietata' : 'passa  '}: ${t.slice(0, 44)}`, vietata(t), atteso)

console.log('\n— I drammi minori —')
is('ce n\'è più d\'uno, o sarebbe una battuta sola', DRAMMI.length >= 6, true)
is('nessuno parla di come uno lavora',
  DRAMMI.filter(d => /task|scaden|ritardo|progett|client|lavor/i.test(d)).length, 0)
is('la scelta è deterministica', drammaDelGiorno(7), drammaDelGiorno(7))
is('e cambia col seme', drammaDelGiorno(0) !== drammaDelGiorno(1), true)
is('un seme enorme non esce dall\'elenco',
  DRAMMI.includes(drammaDelGiorno(999_999) as typeof DRAMMI[number]), true)
is('e nemmeno uno negativo',
  DRAMMI.includes(drammaDelGiorno(-42) as typeof DRAMMI[number]), true)

console.log('\n— La voce dice quello che deve dire —')
const testo = VOCE.join('\n')
is('dichiara da che parte sta', /dalla parte di chi/i.test(testo), true)
is('vieta la diagnosi in seconda persona', /NOI sì, TU no/.test(testo), true)
is('e spiega cos\'è «pungente»', /bordo, non che ha un bersaglio/.test(testo), true)
/* La voce è un testo che un modello legge: se un giorno qualcuno ci scrive
   dentro un esempio che infrange i propri divieti, insegna l'errore. Le righe
   marcate «no:» sono esempi di cosa NON fare, quindi sono esenti. */
const esempiPositivi = VOCE.filter(r => r.trim().startsWith('sì:'))
is('gli esempi «sì» rispettano i divieti', esempiPositivi.filter(vietata).length, 0)
is('e ce n\'è almeno uno', esempiPositivi.length > 0, true)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
