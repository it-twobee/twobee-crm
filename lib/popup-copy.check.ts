/* I messaggi del riquadro (§366). Esegui: npx tsx lib/popup-copy.check.ts

   Due regole tengono in piedi questa funzione, e sono l'unica differenza fra
   un compagno di giornata e una notifica che si disattiva: il popup **non
   conta le task**, e il serbatoio **finisce**. Tutto il resto è contorno. */

import {
  MOMENTI, OGNI_MINUTI, ANGOLI, SISTEMA_POPUP, vocabolarioPopup, utentePopup, momentiDiOggi,
} from '@/lib/popup-copy'
import { valida, offerte, rendiCon, type FattiPersona } from '@/lib/person-copy'
import { VIETATE } from '@/lib/voce-twobee'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const F: FattiPersona = {
  profileId: 'io', nome: 'Marco', ruolo: 'founder', oggi: '2026-09-20',
  aperte: 9, late: 5, scadonoOggi: 2, chiuseOggi: 1, chiuseSettimana: 4, progetti: 2,
  anzianitaMesi: 18, anniversario: null, primoGiorno: false, compleanno: null,
  twobeeAnni: null, twobeeInGiorni: null,
  ferieInGiorni: 12, ferieDurata: 5, assenteDaGiorni: null,
  festivo: 'Ognissanti', festivoInGiorni: 9, ponte: false,
  colleghi: [{ id: 'p1', nome: 'Sara', task: 3 }], colleghiAssenti: [],
}
const ROSA = ['Marco', 'Sara', 'Luca']
const V = vocabolarioPopup(F, ROSA)

console.log('\n— Il popup non conta le task —')
/* La regola che rende corretto renderlo dalla fotografia del mattino: quello
   che si muove durante il giorno non entra. Un messaggio scritto stanotte che
   dice «cinque scadute» alle cinque del pomeriggio è il numero plausibile e
   sbagliato che nessuno va a controllare. */
for (const k of ['late', 'aperte', 'oggi', 'chiuseOggi', 'chiuseSettimana']) {
  is(`{${k}} non è offerto`, offerte(V).includes(k), false)
  is(`e il validatore lo rifiuta`, valida(`Una riga lunga abbastanza con {${k}} dentro.`, V).ok, false)
}
console.log('\n— Quello che invece sta fermo tutto il giorno —')
for (const k of ['nome', 'collega1', 'ferieGiorni', 'festivo', 'anzianitaMesi']) {
  is(`{${k}} si può usare`, offerte(V).includes(k), true)
}
is('e rende il valore vero',
  rendiCon('Fra {ferieGiorni} {ferieGiorni|giorno|giorni} stacchi, {nome}.', V),
  'Fra 12 giorni stacchi, Marco.')

console.log('\n— Il serbatoio finisce —')
is('dieci messaggi al giorno', MOMENTI, 10)
is('tanti angoli quanti messaggi', ANGOLI.length, MOMENTI)
is('ogni angolo ha una chiave sua', new Set(ANGOLI.map(a => a.chiave)).size, MOMENTI)
is('e un\'istruzione diversa', new Set(ANGOLI.map(a => a.istruzione)).size, MOMENTI)
is('venti minuti', OGNI_MINUTI, 20)
/* Dieci × venti minuti ≈ tre ore e mezza: accompagna la mattina e poi tace.
   Se un giorno lo si vuole più lungo, la leva è MOMENTI — non l'intervallo,
   che è quanto spesso interrompe. */
is('copre poco più di tre ore, non la giornata', MOMENTI * OGNI_MINUTI <= 240, true)

console.log('\n— Quello che arriva alla pagina —')
const righe = ANGOLI.map(a => ({ chiave: a.chiave, template: 'Bevi qualcosa, {nome}: sei fatto per lo più di quello.' }))
const resi = momentiDiOggi(righe, F, ROSA, { valida })
is('tutti resi, in ordine', resi.map(m => m.chiave), ANGOLI.map(a => a.chiave))
is('e col nome dentro', resi[0].testo, 'Bevi qualcosa, Marco: sei fatto per lo più di quello.')
is('una riga che non passa più il validatore sparisce invece di uscire rotta',
  momentiDiOggi([{ chiave: 'momento-1', template: 'Chiedi a {collega2} come va oggi, dai.' }], F, ROSA, { valida }).length, 0)
is('e una chiave che non è un angolo non entra',
  momentiDiOggi([{ chiave: 'saluto', template: 'Ciao {nome}, come butta oggi?' }], F, ROSA, { valida }).length, 0)

console.log('\n— La voce è la stessa —')
is('le regole del marchio ci sono', /NOI sì, TU no/.test(SISTEMA_POPUP), true)
is('e dice che qui i numeri delle task non esistono',
  /Non parlare di quante task/.test(SISTEMA_POPUP), true)
is('e che il riquadro si chiude, non si esegue',
  /si chiude, non si esegue/.test(SISTEMA_POPUP), true)
const esempi = SISTEMA_POPUP.split('\n').filter(r => r.startsWith('- '))
is('gli esempi rispettano i divieti della voce',
  esempi.filter(e => VIETATE.some(v => v.schema.test(e))).length, 0)
is('e nessuno di loro conta le task',
  esempi.filter(e => /\{(late|aperte|oggi|chiuseOggi|chiuseSettimana)\}/.test(e)).length, 0)

console.log('\n— Il messaggio al modello —')
const msg = utentePopup(ANGOLI[1], F, V, offerte(V), 3)
is('l\'angolo del dramma minore ne suggerisce uno', /appiglio:/.test(msg), true)
is('un altro angolo no', /appiglio:/.test(utentePopup(ANGOLI[7], F, V, offerte(V), 3)), false)
is('non offre mai un contatore', /\{late\}|\{aperte\}/.test(msg), false)
/* Il caso vero di chi è appena arrivato: nessuna ferie approvata, nessun
   collega condiviso, nessun festivo vicino, e il nome che ancora non c'è in
   anagrafica. Il prompt deve dirlo, non offrire un elenco vuoto. */
const senzaNiente: FattiPersona = {
  ...F, nome: '', colleghi: [], colleghiAssenti: [], progetti: 0,
  ferieInGiorni: null, ferieDurata: null, festivo: null, festivoInGiorni: null,
  anzianitaMesi: null, anniversario: null, compleanno: null,
  twobeeAnni: null, twobeeInGiorni: null,
}
const scarno = vocabolarioPopup(senzaNiente, ROSA)
is('davvero senza fatti', offerte(scarno).length, 0)
is('senza fatti, lo dice invece di offrire il vuoto',
  /Nessun segnaposto disponibile/.test(utentePopup(ANGOLI[0], senzaNiente, scarno, offerte(scarno), 1)), true)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
