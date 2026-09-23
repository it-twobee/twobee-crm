/* §426 — come si legge l'elenco. Esegui: npx tsx lib/sales-elenco.check.ts */
import { dividiPersi, notaInRiga } from '@/lib/sales-elenco'
import { FASI_SEME } from '@/lib/sales-stages'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const r = (stage: string) => ({ stage })

console.log('\n— I persi scendono in fondo, gli altri no —')
const misto = [r('nuovo_lead'), r('perso'), r('in_contatto'), r('perso'), r('cliente_acquisito'), r('pending')]
is('i persi si separano', dividiPersi(FASI_SEME, misto).persi.length, 2)
is('e gli altri restano in ordine',
  dividiPersi(FASI_SEME, misto).vive.map(x => x.stage), ['nuovo_lead', 'in_contatto', 'cliente_acquisito', 'pending'])
/* Un cliente acquisito è un risultato: sta con i vivi e si vede. Una trattativa
   ferma pure — è sospesa, non chiusa. */
is('il vinto resta in elenco', dividiPersi(FASI_SEME, [r('cliente_acquisito')]).persi, [])
is('il sospeso pure', dividiPersi(FASI_SEME, [r('pending')]).persi, [])

console.log('\n— Il ruolo, non la chiave —')
/* Una fase «perso» rinominata o una seconda persa creata dalle impostazioni
   devono scendere in fondo lo stesso, o la regola varrebbe finché nessuno tocca
   la configurazione. */
const conDue = [...FASI_SEME, { chiave: 'non_in_target', etichetta: 'Non in target', ruolo: 'perso' as const, tinta: 'neutro' as const, ordine: 90, attiva: true }]
is('una seconda fase persa scende anche lei', dividiPersi(conDue, [r('non_in_target')]).persi.length, 1)
const rinominata = FASI_SEME.map(f => f.chiave === 'perso' ? { ...f, chiave: 'chiuso_ko' } : f)
is('e una persa rinominata pure', dividiPersi(rinominata, [r('chiuso_ko')]).persi.length, 1)
is('una fase che non esiste resta in elenco', dividiPersi(FASI_SEME, [r('mai_vista')]).vive.length, 1)
is('e una riga senza fase pure', dividiPersi(FASI_SEME, [{ stage: null }]).vive.length, 1)

console.log('\n— La nota sta su una riga sola —')
is('vuota', notaInRiga(''), null)
is('non è testo', notaInRiga(42), null)
is('solo spazi', notaInRiga('   \n  '), null)
is('corta passa intera', notaInRiga('Richiamare lunedì'), 'Richiamare lunedì')
/* Le note del foglio hanno gli a capo dentro la cella: messe così com'è
   spaccherebbero la riga dell'elenco in cinque. */
is('gli a capo diventano spazi', notaInRiga('Call venerdì\n7 agosto\n\nalle 15.00'), 'Call venerdì 7 agosto alle 15.00')
is('si taglia su una parola, non a metà',
  notaInRiga('Hanno chiesto un preventivo per il rifacimento completo del sito', 30), 'Hanno chiesto un preventivo…')
/* Se la parola è lunghissima e lo spazio è troppo indietro, si taglia netta:
   meglio una parola mozzata che tre quarti di riga vuota. */
is('una parola sola lunghissima si taglia netta',
  notaInRiga('Supercalifragilistichespiralidoso', 10), 'Supercalif…')
is('il limite esatto non si tocca', notaInRiga('12345', 5), '12345')

console.log(fail ? `\n${fail} controlli falliti.` : '\nTutti i controlli passano.')
process.exit(fail ? 1 : 0)
