/* L'importatore dei lead dal foglio (§370).
   Esegui: npx tsx lib/sales-import.check.ts

   Gira sul **foglio vero** (`lib/fixtures/lead-foglio.csv`, scaricato il 20
   settembre 2026), non su un CSV inventato: i difetti di questo pezzo sono
   tutti nella forma dei dati reali — i prefissi `p:` di Meta, le righe di
   prova, le virgole negli indirizzi — e un fixture pulito non li avrebbe mai
   trovati. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  leggiCsv, conIntestazioni, leggibile, eDiProva, faseDaStatus, daStatusFoglio, normalizza,
  leggiFoglio, DA_STATUS_FOGLIO, analizzaFoglio,
} from '@/lib/sales-import'
import { FASI_SEME, chiaveIngresso } from '@/lib/sales-stages'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— Il lettore CSV regge quello che c\'è nelle celle —')
is('una riga semplice', leggiCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']])
is('la virgola dentro le virgolette non spezza',
  leggiCsv('a,b\n"Via Bari, 3",x'), [['a', 'b'], ['Via Bari, 3', 'x']])
is('le virgolette doppie sono una virgoletta',
  leggiCsv('a\n"lui ha detto ""no"""'), [['a'], ['lui ha detto "no"']])
is('l\'a capo dentro la cella non fa una riga nuova',
  leggiCsv('a,b\n"prima\nseconda",x'), [['a', 'b'], ['prima\nseconda', 'x']])
is('il BOM di Excel non entra nel nome della colonna',
  leggiCsv('﻿id,nome\n1,x')[0], ['id', 'nome'])
is('le righe vuote si saltano', leggiCsv('a\n1\n\n2').length, 3)
is('le intestazioni diventano chiavi',
  conIntestazioni([['id', 'nome'], ['1', 'Ada']]), [{ id: '1', nome: 'Ada' }])

console.log('\n— Quello che Meta ci mette davanti —')
is('il prefisso del telefono se ne va',
  normalizza({ id: 'l:1', company_name: 'Acme', phone_number: 'p:+393202677770' })?.contactPhone,
  '+393202677770')
is('e quello dell\'id pure',
  normalizza({ id: 'l:1036108579342210', company_name: 'Acme' })?.sheetRowId, '1036108579342210')
is('le risposte del modulo diventano leggibili',
  leggibile('azienda_pmi_(piccola_media_impresa)_'), 'Azienda pmi (piccola media impresa)')
is('anche quelle con la valuta', leggibile('1_m€_–_5_m€_/_anno'), '1 m€ – 5 m€ / anno')
is('il punto finale se ne va', leggibile('tra_3_mesi.'), 'Tra 3 mesi')
is('e il punto esclamativo', leggibile('subito!'), 'Subito')

console.log('\n— Le righe di prova non entrano —')
is('riconosciute da lead_status', eDiProva({ lead_status: 'TEST' }), true)
is('e anche dal contenuto, se lo stato è stato corretto a mano',
  eDiProva({ lead_status: 'CREATED', full_name: '<test lead: dummy data for full_name>' }), true)
is('un lead vero no', eDiProva({ lead_status: 'CREATED', full_name: 'Ada Lovelace' }), false)
is('e normalizza le scarta', normalizza({ id: 'l:1', company_name: 'Acme', lead_status: 'TEST' }), null)

console.log('\n— Lo STATUS del foglio verso le fasi di Notion —')
is('da richiamare', faseDaStatus('Da richiamare'), 'in_contatto')
is('audit prenotata', faseDaStatus('Call/Meeting Audit prenotata'), 'call_fissata')
/* §424 — «Qualificato» non dice dove sta la trattativa, dice che il lead è
   buono: entra dalla porta d'ingresso e si porta dietro il giudizio. */
is('qualificato entra dalla porta e porta il giudizio',
  daStatusFoglio('Qualificato'), { fase: chiaveIngresso(FASI_SEME), qualifica: 'in_target' })
is('proposta', faseDaStatus('Proposta inviare/inviata'), 'preventivo_inviato')
is('pending', faseDaStatus('Pending'), 'pending')
is('non in target', faseDaStatus('Non in target (forse)'), 'perso')
/* «Chiuso» era ambiguo — poteva essere chiuso vinto — e l'ha deciso chi il
   foglio lo compila, non chi scrive il codice. */
is('chiuso vuol dire perso', faseDaStatus('Chiuso'), 'perso')
is('le maiuscole e gli spazi non contano', daStatusFoglio('  QUALIFICATO ').qualifica, 'in_target')
is('vuoto entra dalla porta d\'ingresso', faseDaStatus(''), chiaveIngresso(FASI_SEME))
is('e uno sconosciuto pure, invece di inventare', faseDaStatus('Boh'), chiaveIngresso(FASI_SEME))
/* §424 — due degli status non sono fasi ma qualifiche: hanno `fase: null` e
   entrano dalla porta d'ingresso portandosi dietro il giudizio. Le altre devono
   puntare a una fase che esiste davvero. */
is('ogni traduzione punta a una fase vera o a nessuna',
  Object.values(DA_STATUS_FOGLIO)
    .map(v => v.fase)
    .filter(f => f !== null && !FASI_SEME.map(x => x.chiave).includes(f)), [])
is('«Qualificato» è una qualifica, non una fase', DA_STATUS_FOGLIO['qualificato'], { fase: null, qualifica: 'in_target' })
is('«Non in target» porta il giudizio e chiude', DA_STATUS_FOGLIO['non in target (forse)'], { fase: 'perso', qualifica: 'non_in_target' })

console.log('\n— Il foglio vero, quello scaricato il 20 settembre —')
const csv = readFileSync(join(process.cwd(), 'lib/fixtures/lead-foglio.csv'), 'utf8')
const tutte = conIntestazioni(leggiCsv(csv))
const lead = leggiFoglio(csv)
const analisi = analizzaFoglio(csv)
is('il riepilogo conta record CSV, non righe di testo', analisi.righe, 31)
is('gli a capo nelle note non sono scarti', analisi.scartati, 3)
is('nessun duplicato nel fixture', analisi.duplicati, 0)
let schemaRespinto = false
try { analizzaFoglio('id,company_name\n1,Acme') } catch { schemaRespinto = true }
is('schema incompleto respinto prima di importare', schemaRespinto, true)
is('trentuno righe nel foglio', tutte.length, 31)
is('ventotto lead veri: tre sono prove', lead.length, 28)
is('nessuno senza azienda', lead.filter(l => !l.companyName.trim()).length, 0)
is('nessun id doppio', new Set(lead.map(l => l.sheetRowId)).size, lead.length)
is('nessun prefisso rimasto negli id', lead.filter(l => /^[a-z]+:/i.test(l.sheetRowId)).length, 0)
is('né nei telefoni', lead.filter(l => l.contactPhone && /^[a-z]+:/i.test(l.contactPhone)).length, 0)
is('ogni fase assegnata esiste', lead.filter(l => !FASI_SEME.map(f => f.chiave).includes(l.stage)).length, 0)
is('nessun «test lead» sopravvissuto',
  lead.filter(l => /test lead/i.test(JSON.stringify(l))).length, 0)

/* Il numero che dice se la traduzione dello STATUS serve davvero: se entrassero
   tutti come «New Lead», il lavoro già fatto sul foglio sarebbe buttato. */
const perFase: Record<string, number> = {}
for (const l of lead) perFase[l.stage] = (perFase[l.stage] ?? 0) + 1
console.log('     distribuzione:', JSON.stringify(perFase))
is('non entrano tutti dalla stessa porta', Object.keys(perFase).length > 1, true)
is('e lo stato originale resta leggibile su chi ce l\'aveva',
  lead.filter(l => l.stage !== chiaveIngresso(FASI_SEME) && !l.sheetStatus).length, 0)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
