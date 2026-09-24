/* Un foglio Excel letto come un CSV (§433).
   Esegui: npx tsx lib/sales-xlsx.check.ts

   Il difetto da cui difendersi è lo stesso del CSV: una cella che finisce
   nella colonna sbagliata non dà errore, dà un telefono al posto di una mail.
   Excel non scrive le celle vuote, quindi il posto va letto dal riferimento. */

import {
  testoXml, stringheCondivise, colonnaDi, numeroLeggibile, righeFoglio, percorsoPrimoFoglio, eExcel,
} from '@/lib/sales-xlsx'
import { conIntestazioni } from '@/lib/sales-import'
import { riconosci, trovaIntestazione } from '@/lib/sales-csv-esterno'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Il testo —')
is('le entità si risolvono', testoXml('Rossi &amp; figli &lt;srl&gt; &#233; &#x20AC;'), 'Rossi & figli <srl> é €')
is('un & che non è un\'entità resta', testoXml('A &b C'), 'A &b C')

const condivise = stringheCondivise(`<?xml version="1.0"?>
<sst count="5" uniqueCount="5">
  <si><t>Azienda</t></si>
  <si><t>Telefono</t></si>
  <si><t>Email</t></si>
  <si><r><rPr><b/></rPr><t>Pizzeria </t></r><r><t xml:space="preserve">da Mario</t></r></si>
  <si><t>東京</t><rPh sb="0" eb="2"><t>トウキョウ</t></rPh></si>
  <si><t/></si>
</sst>`)
is('le stringhe si leggono in ordine', condivise.slice(0, 3), ['Azienda', 'Telefono', 'Email'])
is('una stringa a pezzi si ricompone', condivise[3], 'Pizzeria da Mario')
is('la pronuncia fonetica non è testo', condivise[4], '東京')
is('una stringa vuota resta una stringa', condivise[5], '')

console.log('\n— Il posto della cella —')
is('A è la prima', colonnaDi('A1'), 0)
is('Z e AA', [colonnaDi('Z9'), colonnaDi('AA9')], [25, 26])
is('senza riferimento non si inventa', colonnaDi(undefined), null)

console.log('\n— I numeri come li scriverebbe una persona —')
is('il telefono lungo torna intero', numeroLeggibile('3.33123456E9'), '3331234560')
is('l\'errore di virgola mobile sparisce', numeroLeggibile('0.30000000000000004'), '0.3')
is('un intero resta intero', numeroLeggibile('42'), '42')

console.log('\n— Le righe —')
const foglio = `<worksheet><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
  <row r="2"><c r="A2" t="s"><v>3</v></c><c r="C2" t="inlineStr"><is><t>mario@pizza.it</t></is></c></row>
  <row r="3"></row>
  <row r="4"><c r="A4" t="str"><v>Bar &amp; Co</v></c><c r="B4"><v>3.33123456E9</v></c><c r="C4" s="2"/></row>
  <row r="5"><c r="A5" t="b"><v>1</v></c></row>
</sheetData></worksheet>`
const righe = righeFoglio(foglio, condivise)
is('le intestazioni', righe[0], ['Azienda', 'Telefono', 'Email'])
is('la cella saltata resta vuota, la mail resta in C', righe[1], ['Pizzeria da Mario', '', 'mario@pizza.it'])
is('la riga vuota in mezzo sparisce', righe.length, 4)
is('formula di testo, numero, cella senza valore', righe[2], ['Bar & Co', '3331234560', ''])
is('le righe corte si allungano alla larghezza', righe[3], ['VERO', '', ''])

console.log('\n— Da lì in poi, lo stesso percorso del CSV —')
const conTesta = conIntestazioni(righe)
is('diventano righe con intestazione', conTesta[0], { Azienda: 'Pizzeria da Mario', Telefono: '', Email: 'mario@pizza.it' })
is('e le colonne si riconoscono', riconosci(Object.keys(conTesta[0])),
  { companyName: 'Azienda', contactEmail: 'Email', contactPhone: 'Telefono' })

console.log('\n— Il titolo sopra la tabella non è l\'intestazione —')
/* Il caso vero: un Excel fatto a mano, col titolo in A1 e la tabella sotto. */
const conTitolo = [
  ['Lead fiera settembre', '', ''],
  ['', '', ''],
  ['Ragione sociale', 'Cellulare', 'Note'],
  ['Pizzeria da Mario', '333', 'richiamare'],
]
is('si salta il titolo', trovaIntestazione(conTitolo), 2)
is('una tabella normale parte da zero', trovaIntestazione(righe), 0)
is('l\'azienda pesa più di due campi qualunque',
  trovaIntestazione([['Email', 'Telefono', 'Note'], ['Azienda', 'x', 'y']]), 1)
is('se non si riconosce niente, la prima riga piena',
  trovaIntestazione([['Titolo', ''], ['Colonna A', 'Colonna B'], ['1', '2']]), 1)
is('un file vuoto non esplode', trovaIntestazione([]), 0)

console.log('\n— Dove sta il primo foglio —')
const wb = `<workbook><sheets><sheet name="Lead" sheetId="3" r:id="rId7"/><sheet name="Altro" sheetId="1" r:id="rId1"/></sheets></workbook>`
const rels = `<Relationships>
  <Relationship Id="rId1" Type="…/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId7" Type="…/worksheet" Target="worksheets/sheet3.xml"/>
</Relationships>`
is('il primo nell\'ordine del file, non sheet1', percorsoPrimoFoglio(wb, rels), 'xl/worksheets/sheet3.xml')
is('un percorso assoluto', percorsoPrimoFoglio(wb, rels.replace('worksheets/sheet3.xml', '/xl/worksheets/lead.xml')), 'xl/worksheets/lead.xml')
is('senza relazioni si prova il nome di default', percorsoPrimoFoglio(wb, null), 'xl/worksheets/sheet1.xml')
is('.xlsx sì, .xls e .csv no', [eExcel('Lead.XLSX'), eExcel('vecchio.xls'), eExcel('a.csv')], [true, false, false])

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
