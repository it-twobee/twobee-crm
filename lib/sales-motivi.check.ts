/* I motivi del perso (§435).
   Esegui: npx tsx lib/sales-motivi.check.ts */

import { chiaveDa, problemiMotivi, rinumera, type Motivo } from '@/lib/sales-motivi'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const m = (chiave: string, etichetta: string, attivo = true): Motivo => ({ chiave, etichetta, ordine: 0, attivo })

console.log('\n— La chiave nasce dal nome —')
is('minuscole e trattini bassi', chiaveDa('Ha scelto un concorrente', []), 'ha_scelto_un_concorrente')
is('senza accenti', chiaveDa('Non è più attivo', []), 'non_e_piu_attivo')
is('unica fra le esistenti', chiaveDa('Prezzo', ['prezzo', 'prezzo_2']), 'prezzo_3')
is('non comincia con un numero', chiaveDa('3 preventivi migliori', []), 'm_3_preventivi_migliori')
is('un nome di soli simboli ha comunque una chiave', chiaveDa('€€', []), 'motivo')
is('e la chiave passa il vincolo della 258', /^[a-z][a-z0-9_]{1,40}$/.test(chiaveDa('Un nome davvero lunghissimo che non finisce mai più', [])), true)

console.log('\n— Cosa non si può salvare —')
is('un elenco sano non ha problemi', problemiMotivi([m('prezzo', 'Prezzo'), m('altro', 'Altro', false)]), [])
is('almeno uno in uso', problemiMotivi([m('prezzo', 'Prezzo', false)]).length, 1)
is('niente nomi vuoti', problemiMotivi([m('prezzo', '  ')]).some(p => p.includes('senza nome')), true)
is('niente nomi oltre i 40 caratteri', problemiMotivi([m('x_lungo', 'x'.repeat(41))]).some(p => p.includes('40')), true)
is('la stessa chiave due volte', problemiMotivi([m('prezzo', 'Prezzo'), m('prezzo', 'Costo')]).some(p => p.includes('2 volte')), true)
is('lo stesso nome due volte, anche con maiuscole diverse',
  problemiMotivi([m('prezzo', 'Prezzo'), m('prezzo_2', 'prezzo')]).some(p => p.includes('due volte')), true)
is('una chiave scritta a mano storta', problemiMotivi([m('Prezzo Alto', 'Prezzo alto')]).some(p => p.includes('chiave')), true)

console.log('\n— L\'ordine a decine —')
is('dieci, venti, trenta', rinumera([m('a_a', 'A'), m('b_b', 'B'), m('c_c', 'C')]).map(x => x.ordine), [10, 20, 30])

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
