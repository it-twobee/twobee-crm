/* Riconoscere le colonne di un CSV esterno (§377).
   Esegui: npx tsx lib/sales-csv-esterno.check.ts

   Il difetto da evitare è uno e silenzioso: una colonna che finisce nel
   campo sbagliato. Il file entra, le righe si creano, e il referente si
   ritrova nel nome azienda — nessun errore, solo dati storti che qualcuno
   scopre chiamando. */

import { riconosci, converti, spiegaMappa, NOME_CAMPO } from '@/lib/sales-csv-esterno'
import { leggiCsv, conIntestazioni } from '@/lib/sales-import'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Le intestazioni si riconoscono in italiano e in inglese —')
is('italiano', riconosci(['Azienda', 'Referente', 'Email', 'Telefono']),
  { companyName: 'Azienda', contactName: 'Referente', contactEmail: 'Email', contactPhone: 'Telefono' })
is('inglese', riconosci(['Company', 'Contact Person', 'Work Email', 'Phone Number']),
  { companyName: 'Company', contactName: 'Contact Person', contactEmail: 'Work Email', contactPhone: 'Phone Number' })
is('maiuscole, accenti e trattini non contano',
  riconosci(['RAGIONE SOCIALE', 'E-Mail']), { companyName: 'RAGIONE SOCIALE', contactEmail: 'E-Mail' })

console.log('\n— Il caso che rovina un import: la colonna sbagliata —')
/* Con «Nome azienda» e «Nome referente» insieme, chi cerca «nome» a caso
   mette il referente nel nome azienda. Le più specifiche vanno prima. */
const ambiguo = riconosci(['Nome azienda', 'Nome referente'])
is('«Nome azienda» va nell\'azienda', ambiguo.companyName, 'Nome azienda')
is('e «Nome referente» nel referente', ambiguo.contactName, 'Nome referente')
is('«Email referente» non viene rubata da chi cerca «email»',
  riconosci(['Azienda', 'Email referente']).contactEmail, 'Email referente')
is('una colonna non si usa due volte',
  Object.values(riconosci(['Contatto'])).length, 1)

console.log('\n— Quando l\'azienda non c\'è, non si indovina —')
/* Prendere la prima colonna «perché di solito è quella» è il modo di
   importare duecento righe con il telefono come ragione sociale. */
const senza = riconosci(['Telefono', 'Email'])
is('nessun nome azienda riconosciuto', senza.companyName, undefined)
is('e la conversione non produce niente',
  converti([{ Telefono: '333', Email: 'a@b.it' }], senza), { lead: [], senzaAzienda: 1, origine: [] })

console.log('\n— La conversione —')
const righe = [
  { Azienda: 'Rossi Srl', Referente: 'Mario', Email: 'm@rossi.it', Telefono: '+39 333', Note: '-' },
  { Azienda: '', Referente: 'Nessuno', Email: '', Telefono: '', Note: '' },
  { Azienda: 'Bianchi', Referente: '', Email: '', Telefono: '', Note: 'richiamare' },
]
const mappa = riconosci(['Azienda', 'Referente', 'Email', 'Telefono', 'Note'])
const out = converti(righe, mappa)
is('due lead su tre', out.lead.length, 2)
is('la riga senza azienda si conta, non si inventa', out.senzaAzienda, 1)
is('i campi finiscono al posto giusto',
  out.lead[0], { companyName: 'Rossi Srl', contactName: 'Mario', contactEmail: 'm@rossi.it', contactPhone: '+39 333', notes: null, source: null })
/* Un trattino in una cella vuol dire «vuoto» in mezzo mondo dei fogli: se
   entrasse così, in anagrafica comparirebbe un referente che si chiama «-». */
is('il trattino è un vuoto, non un valore', out.lead[0].notes, null)
is('i campi assenti dal file restano null', out.lead[1].contactEmail, null)

console.log('\n— L\'anteprima dice cosa ha capito —')
const s = spiegaMappa(['Azienda', 'Referente', 'Partita IVA', 'Note'], riconosci(['Azienda', 'Referente', 'Partita IVA', 'Note']))
is('elenca le colonne riconosciute', s.riconosciute.map(r => r.colonna).sort(), ['Azienda', 'Note', 'Referente'])
/* Le ignorate si mostrano: chi importa deve sapere che la partita IVA non
   entra, invece di scoprirlo cercandola. */
is('e dichiara quelle ignorate', s.ignorate, ['Partita IVA'])
is('ogni campo ha un nome leggibile',
  s.riconosciute.filter(r => !NOME_CAMPO[r.campo]?.trim()).length, 0)

console.log('\n— Su un CSV vero, virgole e virgolette comprese —')
const csv = 'Ragione sociale,Contatto,E-Mail,Tel\n"Rossi, Mario e figli srl",Mario Rossi,M@ROSSI.IT,+39 320 267 7770\nBianchi SpA,,,\n'
const dati = conIntestazioni(leggiCsv(csv))
const m2 = riconosci(Object.keys(dati[0]))
const o2 = converti(dati, m2)
is('la virgola dentro il nome non spezza la riga', o2.lead[0].companyName, 'Rossi, Mario e figli srl')
is('due righe lette', o2.lead.length, 2)
is('e la seconda ha solo l\'azienda', o2.lead[1], { companyName: 'Bianchi SpA', contactName: null, contactEmail: null, contactPhone: null, notes: null, source: null })

console.log('\n— La riga del file si ritrova (§433) —')
const conBuchi = converti([{ Azienda: 'A' }, { Azienda: '' }, { Azienda: 'C' }], { companyName: 'Azienda' })
is('le righe saltate non spostano il conto', conBuchi.origine, [0, 2])

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
