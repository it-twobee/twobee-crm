/* Le osservazioni di «Le mie attività» (§363).
   Esegui: npx tsx lib/attivita-copy.check.ts

   Il controllo che conta di più è quello che verifica il **silenzio**: una
   lista in ordine non deve produrre nessuna frase. È facile scrivere un
   sistema che parla sempre, e quello parlava già. */

import {
  osserva, vocabolarioAttivita, CHIAVI_ATTIVITA, GLOSSARIO_ATTIVITA,
  ESEMPI_ATTIVITA, SISTEMA_ATTIVITA, scenaAttivita, utenteAttivita,
  type IngressoAttivita, type RigaTaskAttivita, type Osservazione,
} from '@/lib/attivita-copy'
import { valida, rendiCon, offerte } from '@/lib/person-copy'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const OGGI = '2026-09-20'
// mezzanotte esatta: così «trenta giorni fa» sono trenta, non ventinove e mezzo
const giorniFa = (n: number) => new Date(Date.parse(`${OGGI}T00:00:00Z`) - n * 86_400_000).toISOString()
const fra = (n: number) => new Date(Date.parse(`${OGGI}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

const task = (o: Partial<RigaTaskAttivita> = {}): RigaTaskAttivita => ({
  id: Math.random().toString(36).slice(2), status: 'da_fare',
  due_date: fra(5), created_at: giorniFa(3), updated_at: giorniFa(1), ...o,
})
const base = (o: Partial<IngressoAttivita> = {}): IngressoAttivita => ({
  oggi: OGGI, nome: 'Marco', tasks: [task(), task()], milestone: [], colleghi: [], ...o,
})

console.log('\n— Il silenzio è la risposta normale —')
is('una lista in ordine non dice niente', osserva(base()), null)
is('nemmeno una lista vuota', osserva(base({ tasks: [] })), null)
is('un ritardo di ieri è normale, non è una notizia',
  osserva(base({ tasks: [task({ due_date: fra(-1) })] })), null)
is('due senza data capitano',
  osserva(base({ tasks: [task({ due_date: null }), task({ due_date: null })] })), null)
is('una task ferma da una settimana sta lavorando',
  osserva(base({ tasks: [task({ updated_at: giorniFa(7) })] })), null)
is('un collega in ferie fra un mese non cambia la giornata',
  osserva(base({ colleghi: [{ nome: 'Sara', task: 2, assenteDa: fra(30), assenteA: fra(40) }] })), null)
is('e nemmeno uno con cui non condividi niente',
  osserva(base({ colleghi: [{ nome: 'Sara', task: 0, assenteDa: fra(1), assenteA: fra(9) }] })), null)

console.log('\n— Quando invece c\'è qualcosa —')
is('il collega che sparisce fra due giorni',
  osserva(base({ colleghi: [{ nome: 'Sara', task: 3, assenteDa: fra(2), assenteA: fra(9) }] })),
  { tipo: 'collega_via', collega: 'Sara', task: 3, giorni: 2 })
const giaVia = osserva(base({ colleghi: [{ nome: 'Sara', task: 1, assenteDa: fra(-3), assenteA: fra(4) }] }))
is('e quello già via oggi conta zero, non negativo',
  giaVia?.tipo === 'collega_via' ? giaVia.giorni : null, 0)
is('la milestone tua di domani',
  osserva(base({ milestone: [{ id: 'm', status: 'da_fare', due_date: fra(1), owner_id: 'io' }] })),
  { tipo: 'milestone', giorni: 1, quante: 1 })
/* Quella di giovedì la pagina la mostra gi\u00e0: se scatta per tutti, maschera
   quello che va davvero letto \u2014 successo sui dati veri al primo giro. */
is('quella fra quattro giorni no',
  osserva(base({ milestone: [{ id: 'm', status: 'da_fare', due_date: fra(4), owner_id: 'io' }] })), null)
is('una milestone già chiusa no',
  osserva(base({ milestone: [{ id: 'm', status: 'completato', due_date: fra(2), owner_id: 'io' }] })), null)
is('una scaduta da tre settimane',
  osserva(base({ tasks: [task({ due_date: fra(-21) })] })),
  { tipo: 'scadute_vecchie', quante: 1, giorni: 21 })
is('una ferma da un mese',
  osserva(base({ tasks: [task({ due_date: null, updated_at: giorniFa(30) })] })),
  { tipo: 'ferma', giorni: 30 })
is('quattro senza data sono un\'abitudine',
  osserva(base({ tasks: Array.from({ length: 4 }, () => task({ due_date: null })) })),
  { tipo: 'senza_data', quante: 4 })

console.log('\n— Una sola per volta, la più urgente —')
/* Due segnalazioni insieme sono zero segnalazioni: se tutto è urgente, niente
   lo è. L'ordine mette davanti quello che cambia cosa fai **oggi**. */
const tutto = base({
  tasks: [task({ due_date: fra(-30) }), task({ due_date: null, updated_at: giorniFa(40) }),
    ...Array.from({ length: 5 }, () => task({ due_date: null }))],
  milestone: [{ id: 'm', status: 'da_fare', due_date: fra(1), owner_id: 'io' }],
  colleghi: [{ nome: 'Sara', task: 2, assenteDa: fra(1), assenteA: fra(8) }],
})
is('il collega batte tutto', osserva(tutto)?.tipo, 'collega_via')
is('senza collega, la milestone', osserva({ ...tutto, colleghi: [] })?.tipo, 'milestone')
is('poi le scadute vecchie', osserva({ ...tutto, colleghi: [], milestone: [] })?.tipo, 'scadute_vecchie')
is('la pulizia delle date sta in fondo',
  osserva({ ...tutto, colleghi: [], milestone: [], tasks: Array.from({ length: 5 }, () => task({ due_date: null })) })?.tipo,
  'senza_data')

console.log('\n— Il vocabolario passa dalle regole condivise —')
const o = osserva(base({ colleghi: [{ nome: 'Sara', task: 3, assenteDa: fra(2), assenteA: fra(9) }] }))!
const V = vocabolarioAttivita(o, 'Marco', ['Marco', 'Sara', 'Luca'])
is('si offre solo quello che l\'osservazione contiene',
  offerte(V).sort(), ['collega', 'collegaGiorni', 'collegaTask', 'nome'])
const TPL = '{collega} sparisce fra {collegaGiorni} {collegaGiorni|giorno|giorni} e avete {collegaTask} task insieme.'
is('un template buono passa', valida(TPL, V).ok, true)
is('e rende i numeri di adesso', rendiCon(TPL, V),
  'Sara sparisce fra 2 giorni e avete 3 task insieme.')
is('le stesse regole valgono qui: niente cifre',
  valida('Sara sparisce fra 2 giorni, e avete tre task.', V).ok, false)
is('niente nomi fuori dall\'osservazione',
  valida('Chiedi a Luca prima che sparisca, non aspettare.', V).ok, false)
is('niente tag', valida('<think>', V).ok, false)
is('e un fatto di un\'altra osservazione non esiste oggi',
  valida('Hai {senzaData} attività senza una data addosso.', V).ok, false)
is('ogni chiave dichiarata ha un valore',
  CHIAVI_ATTIVITA.filter(k => !(k in V.valori)).length, 0)

console.log('\n— Il prompt insegna quello che il validatore pretende —')
/* Stesso patto del saluto: un esempio che infrange la regola che sta dettando
   insegna l'errore meglio di quanto la regola lo vieti. Ogni esempio si prova
   contro l'osservazione che lo riguarda, perché è l'unica in cui quei
   segnaposto esistono. */
const CASI: { o: Osservazione; chiavi: string[] }[] = [
  { o: { tipo: 'collega_via', collega: 'Sara', task: 3, giorni: 2 }, chiavi: ['collega', 'collegaTask', 'collegaGiorni'] },
  { o: { tipo: 'milestone', giorni: 4, quante: 2 }, chiavi: ['milestoneGiorni', 'milestoneQuante'] },
  { o: { tipo: 'scadute_vecchie', quante: 3, giorni: 22 }, chiavi: ['scaduteVecchie', 'scaduteGiorni'] },
  { o: { tipo: 'ferma', giorni: 30 }, chiavi: ['fermaGiorni'] },
  { o: { tipo: 'senza_data', quante: 5 }, chiavi: ['senzaData'] },
]
let rotti = 0
for (const e of ESEMPI_ATTIVITA) {
  const caso = CASI.find(c => c.chiavi.some(k => e.includes(`{${k}}`) || e.includes(`{${k}|`)))
  if (!caso) { rotti++; console.log(`      ↳ nessuna osservazione contiene i segnaposto di: ${e}`); continue }
  const r = valida(e, vocabolarioAttivita(caso.o, 'Marco', ['Marco', 'Sara']))
  if (!r.ok) { rotti++; console.log(`      ↳ ${e}\n         — ${r.motivo}`) }
}
is('ogni esempio passa il validatore', rotti, 0)
is('e ogni chiave ha una spiegazione',
  CHIAVI_ATTIVITA.filter(k => !GLOSSARIO_ATTIVITA[k]?.trim()).length, 0)
is('ogni osservazione ha una scena da raccontare',
  CASI.filter(c => !scenaAttivita(c.o).trim()).length, 0)

/* L'invariante fra prompt e validatore, sull'altro asse: quello che il
   messaggio offre è quello che il validatore accetta. */
let incoerenti = 0
for (const c of CASI) {
  const v = vocabolarioAttivita(c.o, 'Marco', ['Marco', 'Sara'])
  const msg = utenteAttivita(c.o, 'Marco', v, offerte(v))
  for (const k of CHIAVI_ATTIVITA) {
    const offerto = msg.includes(`{${k}}`)
    const accettato = valida(`Una frase di prova lunga abbastanza con {${k}} dentro.`, v).ok
    if (offerto !== accettato) incoerenti++
  }
}
is('ogni segnaposto offerto è un segnaposto accettato', incoerenti, 0)
is('le regole condivise ci sono anche qui',
  /non scrivere MAI un numero/i.test(SISTEMA_ATTIVITA) && /CONCORDANZA/.test(SISTEMA_ATTIVITA), true)
is('ma l\'attacco è di questa pagina',
  /Le mie attività/.test(SISTEMA_ATTIVITA) && !/Ciao, <nome>/.test(SISTEMA_ATTIVITA), true)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
