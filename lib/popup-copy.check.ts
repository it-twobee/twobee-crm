/* I messaggi del riquadro (§366). Esegui: npx tsx lib/popup-copy.check.ts

   Due regole tengono in piedi questa funzione, e sono l'unica differenza fra
   un compagno di giornata e una notifica che si disattiva: il popup **non
   conta le task**, e il serbatoio **finisce**. Tutto il resto è contorno. */

import {
  MOMENTI, OGNI_MINUTI, ANGOLI, SISTEMA_POPUP, vocabolarioPopup, utentePopup, momentiDiOggi,
  prossimoMomento,
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
is('un\'ora fra un messaggio e l\'altro', OGNI_MINUTI, 60)
/* Dieci × un'ora copre una giornata lavorativa intera senza mai raddoppiare:
   è la combinazione che rende inutile il riciclo. Se il serbatoio fosse più
   piccolo dell'orario di lavoro, il pomeriggio resterebbe muto; se
   l'intervallo fosse più stretto, finirebbe prima di pranzo. */
is('copre una giornata di lavoro', MOMENTI * OGNI_MINUTI >= 480, true)
is('e non due', MOMENTI * OGNI_MINUTI <= 720, true)

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

console.log('\n— L\'orologio, non la sessione —')
const POOL = ANGOLI.map(a => ({ chiave: a.chiave, testo: `riga ${a.chiave}` }))
const T0 = Date.parse('2026-09-20T09:00:00Z')
const ORA = 60 * 60_000
const dopo = (n: number) => T0 + Math.round(n * ORA)
const vuoto = { viste: [] as string[], ultimo: 0 }
const prossimo = (st: { viste: string[]; ultimo: number }, quando: number) =>
  prossimoMomento(POOL, st, quando, OGNI_MINUTI)?.chiave ?? null

is('alla prima apertura del giorno c\'è sempre', prossimo(vuoto, T0), 'momento-1')

/* Il caso che ha fatto cambiare la regola: dieci aperture in mezz'ora non
   sono dieci messaggi. La distanza è fra due messaggi, non fra due aperture. */
const dopoIlPrimo = { viste: ['momento-1'], ultimo: T0 }
is('riaprendo dopo mezz\'ora, niente', prossimo(dopoIlPrimo, dopo(0.5)), null)
is('a cinquantanove minuti ancora niente', prossimo(dopoIlPrimo, dopo(59 / 60)), null)
is('all\'ora esatta, il secondo', prossimo(dopoIlPrimo, dopo(1)), 'momento-2')

/* «Se riapro dopo due o tre ore ritrovo **un** nuovo messaggio»: le ore in cui
   il portale era chiuso non lasciano un arretrato. */
is('tornando dopo tre ore, uno solo', prossimo(dopoIlPrimo, dopo(3)), 'momento-2')
is('e dopo altre tre, il successivo',
  prossimo({ viste: ['momento-1', 'momento-2'], ultimo: dopo(3) }, dopo(6)), 'momento-3')
is('non si recupera quello che si è saltato',
  prossimo({ viste: ['momento-1'], ultimo: T0 }, dopo(8)), 'momento-2')

console.log('\n— Quando il serbatoio è finito, tace —')
const tutti = { viste: POOL.map(m => m.chiave), ultimo: T0 }
is('niente da mostrare, anche a ore di distanza', prossimo(tutti, dopo(9)), null)
is('e non ricomincia da capo', prossimo(tutti, dopo(48)), null)
is('«basta per oggi» ha lo stesso effetto',
  prossimo({ viste: POOL.map(m => m.chiave), ultimo: dopo(0.1) }, dopo(5)), null)

console.log('\n— Una giornata intera, simulata —')
/* Il controllo che conta davvero: nove ore di lavoro con aperture sparse a
   caso non devono mai produrre due messaggi nella stessa ora, né ripeterne uno. */
let st = { viste: [] as string[], ultimo: 0 }
const usciti: string[] = []
for (const q of [0, 0.2, 0.4, 0.9, 1.0, 1.1, 1.5, 2.0, 2.3, 3.0, 3.2, 4.0, 5.0, 5.5, 6.0, 7.0, 8.0, 9.0]) {
  const m = prossimoMomento(POOL, st, dopo(q), OGNI_MINUTI)
  if (m) { usciti.push(m.chiave); st = { viste: [...st.viste, m.chiave], ultimo: dopo(q) } }
}
is('nessun messaggio ripetuto', new Set(usciti).size, usciti.length)
is('e nessuno fuori dall\'elenco', usciti.every(k => POOL.some(m => m.chiave === k)), true)
/* Diciotto aperture, dieci messaggi: quello dell'apertura più uno per ogni ora
   passata. Il numero che conta non è dieci, è che non sono diciotto. */
is('diciotto aperture, dieci messaggi', [POOL.length, usciti.length], [10, 10])
is('nell\'ordine degli angoli', usciti, ANGOLI.map(a => a.chiave))
is('e l\'undicesima apertura non produce niente',
  prossimoMomento(POOL, st, dopo(12), OGNI_MINUTI), null)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
