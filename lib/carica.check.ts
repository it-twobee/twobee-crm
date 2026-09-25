/* La pagina unica di caricamento (§449).
   Esegui: npx tsx lib/carica.check.ts */

import { contoSuggerito, righeExcelATesto, tipoFile } from '@/lib/carica'
import { parseStatement } from '@/lib/bank-import'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(62)} ${JSON.stringify(got)?.slice(0, 90)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Che file è, dal contenuto —')
is('una fattura anche se si chiama .txt', tipoFile('scarico.txt', '<?xml version="1.0"?><p:FatturaElettronica versione="FPR12">'), 'fattura')
is('un camt anche senza estensione giusta', tipoFile('vivid.txt', '<?xml?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">'), 'banca_camt')
is('i firmati e gli zip dall\'estensione', [tipoFile('IT01_1.xml.p7m', ''), tipoFile('fatture.zip', '')], ['fattura_p7m', 'zip'])
is('un PDF anche rinominato', tipoFile('estratto', '%PDF-1.7'), 'pdf')
is('un CSV', tipoFile('movimenti.csv', 'Data contabile;Importo'), 'banca_testo')
is('un XML qualunque: non riconosciuto', tipoFile('altro.xml', '<ciao/>'), 'sconosciuto')

console.log('\n— L\'estratto conto Excel —')
const righe = [
  ['Intesa Sanpaolo - Movimenti conto', '', '', ''],
  ['Periodo dal 01/09/2026 al 25/09/2026', '', '', ''],
  ['Data contabile', 'Data valuta', 'Descrizione', 'Importo'],
  ['46266', '46266', 'Bonifico da Acme srl', '1220'],
  ['46267', '46267', 'Addebito\tcarta', '-45.5'],
]
const x = righeExcelATesto(righe)
is('salta titolo e periodo, parte dall\'intestazione', 'dialetto' in x && x.dialetto, 'italiano')
const letti = 'testo' in x ? parseStatement(x.testo) : null
is('le date Excel tornano giorno/mese/anno e si leggono', letti?.rows.map(r => r.booked_on), ['2026-09-01', '2026-09-02'])
is('gli importi con il segno', letti?.rows.map(r => r.amount), [1220, -45.5])
is('un foglio senza intestazione lo dice', 'errore' in righeExcelATesto([['a', 'b'], ['1', '2']]), true)

console.log('\n— Su che conto va —')
const conti = [
  { id: 'i', label: 'Conto principale', bank_name: 'Intesa Sanpaolo', is_primary: true },
  { id: 'v', label: 'Vivid Business', bank_name: 'Vivid Money', is_primary: false },
]
is('Vivid e camt sul conto Vivid', [contoSuggerito('vivid', conti), contoSuggerito('camt', conti)], ['v', 'v'])
is('il tracciato italiano su Intesa', contoSuggerito('italiano', conti), 'i')
is('senza un conto col nome: il principale', contoSuggerito('vivid', [conti[0]]), 'i')

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
