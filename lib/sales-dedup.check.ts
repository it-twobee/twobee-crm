/* Riconoscere un lead che c'è già (§377).
   Esegui: npx tsx lib/sales-dedup.check.ts

   Qui si sbaglia in due modi opposti e vanno controllati tutti e due. Se il
   riconoscimento è troppo largo, due aziende diverse vengono segnalate come
   la stessa e chi inserisce impara a premere «aggiungi comunque» senza
   leggere — e allora tanto vale non averlo. Se è troppo stretto, il doppione
   entra e due storie commerciali dello stesso cliente vivono su due righe. */

import {
  telefonoChiave, emailChiave, nomeChiave, somiglianze, spiegaSomiglianza,
  SPIEGA, type Candidato,
} from '@/lib/sales-dedup'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Il telefono: lo stesso numero scritto in sei modi —')
const atteso = telefonoChiave('+39 320 267 7770')
for (const v of ['+393202677770', '320 267 7770', '3202677770', '0039 320 2677770', 'p:+393202677770', '+39-320-267-7770']) {
  is(`${v.padEnd(22)} → stesso`, telefonoChiave(v), atteso)
}
is('un numero diverso è diverso', telefonoChiave('+39 333 111 2222') === atteso, false)
is('quattro cifre non sono un telefono', telefonoChiave('1234'), null)
is('e il vuoto nemmeno', telefonoChiave(''), null)

console.log('\n— L\'email —')
is('maiuscole e spazi non contano', emailChiave('  Mario@Rossi.IT '), 'mario@rossi.it')
is('una non-email non è una chiave', emailChiave('mario@'), null)
is('e il vuoto nemmeno', emailChiave(null), null)

console.log('\n— Il nome: la forma societaria non distingue nessuno —')
const rossi = nomeChiave('Rossi S.r.l.')
for (const v of ['ROSSI SRL', 'Rossi  s.r.l', 'Rossi S R L', 'rossi srl.', 'Rossi Società a responsabilità limitata']) {
  is(`${v.padEnd(38)} → stesso`, nomeChiave(v) === rossi, true)
}
is('ma «Rossi Impianti» resta un\'altra cosa', nomeChiave('Rossi Impianti') === rossi, false)
is('un nome di due lettere non è una chiave', nomeChiave('AB'), null)
is('gli accenti restano: «cit√†» non è «citta»', nomeChiave('Caffè Roma'), 'caffè roma')

console.log('\n— Cosa trova, e con quanta certezza —')
const esistenti: Candidato[] = [
  { id: '1', company_name: 'Rossi S.r.l.', contact_phone: '+39 320 267 7770', contact_email: 'info@rossi.it' },
  { id: '2', company_name: 'Bianchi SpA', contact_phone: '+39 333 111 2222', contact_email: null },
  { id: '3', company_name: 'Verdi', contact_phone: null, contact_email: null, sheet_row_id: '1036108579342210' },
]
is('stesso telefono, scritto diverso',
  somiglianze({ contactPhone: '3202677770' }, esistenti).map(s => s.esistente.id), ['1'])
is('ed è un riconoscimento certo',
  somiglianze({ contactPhone: '3202677770' }, esistenti)[0].certo, true)
is('stessa email', somiglianze({ contactEmail: 'INFO@ROSSI.IT' }, esistenti).map(s => s.esistente.id), ['1'])
is('stessa riga del foglio',
  somiglianze({ sheetRowId: '1036108579342210' }, esistenti).map(s => s.esistente.id), ['3'])

/* Il nome da solo non è una certezza: «Rossi Srl» e «Rossi S.r.l.» possono
   essere due fratelli in due capannoni diversi, e solo chi inserisce lo sa. */
const soloNome = somiglianze({ companyName: 'ROSSI SRL' }, esistenti)
is('solo il nome: trovato', soloNome.map(s => s.esistente.id), ['1'])
is('ma non è certo', soloNome[0].certo, false)

console.log('\n— Quando non deve trovare niente —')
is('un\'azienda nuova', somiglianze({ companyName: 'Neri Impianti', contactPhone: '+39 340 000 0000' }, esistenti), [])
is('un lead senza dati non somiglia a tutti', somiglianze({}, esistenti), [])
is('e nemmeno con dei campi vuoti',
  somiglianze({ companyName: '', contactPhone: '', contactEmail: '' }, esistenti), [])
/* Il caso che rende inutile un controllo troppo largo: due aziende diverse
   senza recapiti non devono essere «la stessa». */
is('due righe senza telefono né mail non si toccano',
  somiglianze({ companyName: 'Neri' }, [{ id: 'x', company_name: 'Gialli' }]), [])

console.log('\n— Più indizi, e più di un candidato —')
const doppio = somiglianze(
  { companyName: 'Rossi srl', contactPhone: '320 267 7770', contactEmail: 'info@rossi.it' }, esistenti)
is('tre motivi sulla stessa riga', doppio[0].motivi.sort(), ['email', 'nome', 'telefono'])
/* Se lo stesso telefono sta su due righe, il problema non è quale scegliere:
   è che ce ne sono due, e chi inserisce lo deve vedere. */
const due = somiglianze({ contactPhone: '3202677770' }, [
  ...esistenti, { id: '4', company_name: 'Rossi vecchio', contact_phone: '+393202677770' },
])
is('due candidati, tutti e due mostrati', due.length, 2)
is('i certi vengono prima', due.every(s => s.certo), true)

console.log('\n— La frase che legge chi inserisce —')
is('dice chi e perché',
  spiegaSomiglianza(somiglianze({ contactPhone: '3202677770' }, esistenti)[0]),
  'Rossi S.r.l. ha lo stesso telefono')
is('con più motivi li elenca', spiegaSomiglianza(doppio[0]).includes(' e '), true)
is('ogni motivo ha una spiegazione', Object.values(SPIEGA).filter(v => !v.trim()).length, 0)
is('e un lead senza nome non diventa «undefined»',
  spiegaSomiglianza(somiglianze({ contactPhone: '3202677770' },
    [{ id: 'z', contact_phone: '3202677770' }])[0]).startsWith('Un lead senza nome'), true)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
