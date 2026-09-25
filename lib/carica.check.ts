/* La pagina unica di caricamento (§449).
   Esegui: npx tsx lib/carica.check.ts */

import { contoSuggerito, daQuanto, esadecimale, ibanDelFile, righeExcelATesto, tipoFile } from '@/lib/carica'
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

/* §450 — quattro conti Vivid: decide l'IBAN, e dove non c'è ancora si sceglie */
const BPM = { id: 'b', label: 'Conto corrente Two Bee', bank_name: 'Banco BPM', is_primary: true, iban: null }
const quattro = [BPM,
  { id: 'm', label: 'Vivid Marco', bank_name: 'Vivid', is_primary: false, iban: 'IT11 A000 0000 0000 0000 0000 111' },
  { id: 't', label: 'Vivid Toto', bank_name: 'Vivid', is_primary: false, iban: null },
  { id: 'w', label: 'Vivid Walter', bank_name: 'Vivid', is_primary: false, iban: null },
]
is('IBAN noto: il suo conto', contoSuggerito('camt', quattro, 'IT11A0000000000000000000111'), 'm')
is('IBAN nuovo fra più Vivid senza IBAN: si sceglie', contoSuggerito('camt', quattro, 'IT22B0000000000000000000222'), null)
is('IBAN nuovo e un solo Vivid senza IBAN: quello', contoSuggerito('camt', quattro.slice(0, 3), 'IT22B0000000000000000000222'), 't')
is('il tracciato italiano su Banco BPM', contoSuggerito('italiano', quattro), 'b')
is('IBAN dal blocco del conto del camt',
  ibanDelFile('estratto.xml', '<Stmt><Acct>\n <Id>\n  <IBAN>IT22B0000000000000000000222</IBAN></Id></Acct><Ntry><RltdPties><CdtrAcct><Id><IBAN>IT99Z9999999999999999999999</IBAN></Id></CdtrAcct></RltdPties></Ntry>'),
  'IT22B0000000000000000000222')
is('IBAN dal nome del file Vivid', ibanDelFile('Statement_IT22B0000000000000000000222_2026_09_01.xml', '<Ntry/>'), 'IT22B0000000000000000000222')
is('nessun IBAN nel CSV della banca', ibanDelFile('MovimentiCC_OnLine_21_09_2026_11.04.49.csv', '"Data contabile";"Importo"'), null)

is('da quanto: oggi, ieri, giorni, mai',
  [daQuanto('2026-09-25', '2026-09-25').testo, daQuanto('2026-09-24T10:00:00Z', '2026-09-25').testo, daQuanto('2026-09-01', '2026-09-25').testo, daQuanto(null, '2026-09-25').testo],
  ['oggi', 'ieri', '24 giorni fa', 'mai'])
is('impronta in esadecimale', esadecimale(new Uint8Array([0, 15, 255]).buffer), '000fff')

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
