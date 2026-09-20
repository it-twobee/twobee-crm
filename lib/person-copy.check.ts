/* I fatti della persona e il contratto dei segnaposto (§360).
   Esegui: npx tsx lib/person-copy.check.ts

   Qui non si controlla se una riga è simpatica — quello lo dirà chi la legge.
   Si controlla che non possa essere **falsa**: che i conteggi coincidano con
   quelli che la pagina mostra già, che un template con una cifra dentro venga
   respinto, e che un nome inventato non passi. Un validatore che accetta tutto
   è peggio di nessun validatore, quindi metà di questi controlli verifica che
   qualcosa venga **rifiutato**. */

import {
  carico, colleghiDiTask, prossimoFestivo, anzianita, assenzaDa, fattiPersona,
  valori, chiaviUsate, rendi, validaTemplate, nomiCitabili, CHIAVI, MAX_CARATTERI,
  rigaDiOggi, scenaDi, statoDa, giornoAzienda, chiaviOfferte, leggiFatti, conCaricoFresco,
  type FattiPersona, type RigaTask, type IngressoFatti,
} from '@/lib/person-copy'
import { salutoPersonale, situazione, type Momento, type Ruolo, type StatoPersona } from '@/lib/task-mood'
import { SISTEMA, ESEMPI, GLOSSARIO, utente } from '@/lib/person-copy-prompt'
import { ripulisci } from '@/lib/person-copy-gen'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const OGGI = '2026-04-01' // un mercoledì: Pasquetta cade il 6, un lunedì
const t = (o: Partial<RigaTask> & { id: string }): RigaTask =>
  ({ status: 'da_fare', due_date: null, completed_at: null, ...o })

// ── i conteggi ───────────────────────────────────────────────────────────────

console.log('\n— Il carico dice quello che dice la pagina —')
const TASKS: RigaTask[] = [
  t({ id: 'a', due_date: '2026-03-20' }),                                   // scaduta
  t({ id: 'b', due_date: '2026-03-31' }),                                   // scaduta
  t({ id: 'c', due_date: OGGI }),                                           // oggi
  t({ id: 'd', due_date: '2026-04-10' }),                                   // futura
  t({ id: 'e', status: 'in_corso', due_date: null }),                       // senza data
  t({ id: 'f', status: 'completato', completed_at: `${OGGI}T09:00:00Z` }),  // chiusa oggi
  t({ id: 'g', status: 'completato', completed_at: '2026-03-28T09:00:00Z' }), // chiusa in settimana
  t({ id: 'h', status: 'completato', completed_at: '2026-02-01T09:00:00Z' }), // vecchia
]
const c = carico(TASKS, OGGI)
is('le aperte escludono le completate', c.aperte, 5)
is('le scadute guardano solo le aperte', c.late, 2)
is('quelle di oggi non sono «entro la settimana»', c.scadonoOggi, 1)
is('chiuse oggi', c.chiuseOggi, 1)
is('chiuse in settimana, senza le vecchie', c.chiuseSettimana, 2)
is('una task chiusa e scaduta non è in ritardo',
  carico([t({ id: 'z', status: 'completato', due_date: '2026-01-01', completed_at: `${OGGI}T08:00:00Z` })], OGGI).late, 0)

// ── i colleghi ───────────────────────────────────────────────────────────────

console.log('\n— I colleghi si contano per task condivise —')
const PROFILI = [
  { id: 'io', full_name: 'Marco Lucci' },
  { id: 'p1', full_name: 'Toto Rossi' },
  { id: 'p2', full_name: 'Giulia Bianchi' },
  { id: 'p3', full_name: 'Sara Verdi' },
  { id: 'p4', full_name: 'Luca Neri' },
]
const ASSEGN = [
  { task_id: 'a', profile_id: 'io' }, { task_id: 'a', profile_id: 'p1' }, { task_id: 'a', profile_id: 'p2' },
  { task_id: 'b', profile_id: 'p1' },
  { task_id: 'c', profile_id: 'p2' }, { task_id: 'c', profile_id: 'p3' },
  { task_id: 'f', profile_id: 'p4' }, // task chiusa: non conta
]
const aperteMie = TASKS.filter(x => x.status !== 'completato').map(x => x.id)
const col = colleghiDiTask(aperteMie, ASSEGN, PROFILI, 'io')
is('solo il primo nome', col.map(x => x.nome), ['Giulia', 'Toto', 'Sara'])
is('e il conteggio delle task condivise', col.map(x => x.task), [2, 2, 1])
is('chi sta solo su task chiuse non compare', col.some(x => x.nome === 'Luca'), false)
is('non si conta se stesso', col.some(x => x.nome === 'Marco'), false)
is('al massimo tre', colleghiDiTask(aperteMie, ASSEGN, PROFILI, 'io', 2).length, 2)
is('a parità di task l\'ordine è stabile',
  colleghiDiTask(aperteMie, ASSEGN, PROFILI, 'io').map(x => x.nome),
  colleghiDiTask(aperteMie, [...ASSEGN].reverse(), PROFILI, 'io').map(x => x.nome))

// ── il calendario ────────────────────────────────────────────────────────────

console.log('\n— Il festivo, e il ponte —')
is('Pasquetta 2026 è fra cinque giorni', prossimoFestivo(OGGI)?.inGiorni, 5)
is('ed è un lunedì, quindi non è un ponte', prossimoFestivo(OGGI)?.ponte, false)
is('il 25 aprile 2026 cade di sabato: non è una notizia',
  prossimoFestivo('2026-04-20', 7), null)
is('il 2 giugno 2026 è un martedì: c\'è il ponte',
  prossimoFestivo('2026-06-01', 7), { nome: 'Festa della Repubblica', inGiorni: 1, ponte: true })
is('niente festivi all\'orizzonte è null', prossimoFestivo('2026-07-01', 10), null)

console.log('\n— Anzianità e assenza —')
is('i mesi in azienda', anzianita('2024-04-01', OGGI).anzianitaMesi, 24)
is('l\'anniversario solo il giorno giusto', anzianita('2024-04-01', OGGI).anniversario, 2)
is('e non il giorno prima', anzianita('2024-04-02', OGGI).anniversario, null)
is('il primo giorno non è un anniversario', anzianita(OGGI, OGGI), { anzianitaMesi: 0, anniversario: null, primoGiorno: true })
is('senza data di assunzione non si inventa niente', anzianita(null, OGGI).anzianitaMesi, null)
is('un giorno di assenza è rumore', assenzaDa('2026-03-31T18:00:00Z', OGGI), null)
is('quattro giorni sono un\'assenza', assenzaDa('2026-03-28T18:00:00Z', OGGI), 4)

// ── i fatti completi ─────────────────────────────────────────────────────────

console.log('\n— I fatti, montati —')
const INGRESSO: IngressoFatti = {
  profilo: { id: 'io', full_name: 'Marco Lucci', app_role: 'founder', hire_date: '2024-04-01', birth_date: '1988-04-01', last_seen_at: `${OGGI}T07:00:00Z` },
  oggi: OGGI,
  tasks: TASKS,
  assegnazioni: ASSEGN,
  profili: PROFILI,
  assenze: [
    { profileId: 'p1', from: '2026-03-30', to: '2026-04-03' }, // Toto è via adesso
    { profileId: 'io', from: '2026-08-10', to: '2026-08-21' },
  ],
  progetti: 3,
}
const F = fattiPersona(INGRESSO)
is('nome proprio, non completo', F.nome, 'Marco')
is('le ferie proprie in giorni', F.ferieInGiorni, 131)
is('e quanto durano, estremi compresi', F.ferieDurata, 12)
is('i colleghi assenti oggi', F.colleghiAssenti, ['Toto'])
is('stessi ingressi, stessi fatti', JSON.stringify(fattiPersona(INGRESSO)), JSON.stringify(F))
is('un omonimo non manda in ferie il collega sbagliato',
  fattiPersona({
    ...INGRESSO,
    profili: [...PROFILI, { id: 'p9', full_name: 'Toto Bianchi' }],
    assenze: [{ profileId: 'p9', from: OGGI, to: OGGI }],
  }).colleghiAssenti, [])

// ── il contratto dei segnaposto ──────────────────────────────────────────────

console.log('\n— Niente cifre nel template —')
const ROSA = { rosa: PROFILI.map(p => (p.full_name ?? '').split(' ')[0]) }
const v = (tpl: string, f: FattiPersona = F) => validaTemplate(tpl, f, ROSA)
const bocciato = (label: string, tpl: string, f?: FattiPersona) => {
  const r = v(tpl, f)
  is(label, r.ok, false)
  if (!r.ok) console.log(`      ↳ ${r.motivo}`)
}

const BUONO = '{late} in ritardo e {collega1} ti aspetta su {collega1Task}. Niente panico.'
const r = v(BUONO)
is('un template valido passa', r.ok, true)
is('e i numeri li mette il codice', r.ok && r.testo, '2 in ritardo e Giulia ti aspetta su 2. Niente panico.')

bocciato('una cifra scritta a mano viene respinta', 'Hai 4 task in ritardo, recuperale.')
bocciato('anche se è quella giusta', 'Hai 2 task in ritardo, recuperale.')
bocciato('una quantità in lettere pure', 'Hai due task in ritardo, recuperale.')
bocciato('un segnaposto inventato', '{scadute} in ritardo. Coraggio.')
bocciato('un fatto che oggi non esiste', 'Auguri: {anniversario} anni con noi!',
  { ...F, anniversario: null })
bocciato('un nome fuori dai colleghi', 'Chiedi a {nome}… anzi, chiedi a Luca.')
bocciato('la parola bandita (§359)', 'Giornata da {aperte}: sembri un\'agenzia.')
bocciato('il turpiloquio verso la persona', '{late} in ritardo. Sei proprio un pigro.')
bocciato('la formattazione', '**{late}** in ritardo.')
bocciato('le emoji', '{late} in ritardo 🔥')
bocciato('più di una riga', '{late} in ritardo.\nE domani?')
bocciato('la riga vuota', '   ')
bocciato('una riga troppo lunga',
  `{nome}, oggi ci sono {aperte} cose da guardare, {late} già scadute, {oggi} in scadenza e pure {chiuseSettimana} chiuse questa settimana, complimenti davvero.`)

console.log('\n— L\'assenza si saluta, non si rinfaccia —')
const ASSENTE: FattiPersona = { ...F, assenteDaGiorni: 4 }
is('il bentornato passa',
  v('Bentornato dopo {assenteDa} giorni: {late} ti hanno aspettato.', ASSENTE).ok, true)
bocciato('il richiamo no', 'Dopo {assenteDa} giorni finalmente ti degni di passare.', ASSENTE)
bocciato('nemmeno travestito da battuta', 'Spariti per {assenteDa} giorni, eh?', ASSENTE)

console.log('\n— Il raccordo col fallback —')
is('ogni chiave dichiarata ha un valore', Object.keys(valori(F)).sort(), [...CHIAVI].sort())
is('chiaviUsate non ripete', chiaviUsate('{late} e ancora {late} e {aperte}'), ['late', 'aperte'])
is('una chiave irrisolta resta visibile invece di sparire',
  rendi('{anniversario} anni', { ...F, anniversario: null }), '{anniversario} anni')

/* Se una frase deterministica non entrerebbe nello spazio, il limite è
   sbagliato: il fallback e il testo generato finiscono nello stesso paragrafo,
   e il posto deve bastare a tutti e due. */
const MOMENTI: Momento[] = [
  { ora: null, giorno: null },
  ...[7, 13, 20].flatMap(ora => [0, 1, 5].map(giorno => ({ ora, giorno }))),
]
const RUOLI: Ruolo[] = ['founder', 'manager', 'senior', 'junior', 'stage', 'freelance', 'partner', null]
const STATI: Partial<StatoPersona>[] = [
  { late: 4 }, { late: 0, chiuseOggi: 3 }, { late: 0, chiuseOggi: 0, oggi: 2 },
  { aperte: 0, late: 0, oggi: 0, chiuseOggi: 0, chiuseSettimana: 5 },
  { aperte: 0, late: 0, oggi: 0, chiuseOggi: 0, chiuseSettimana: 0 },
  { aperte: 9, late: 0, oggi: 0, chiuseOggi: 0 },
]
let sforate = 0
for (const m of MOMENTI) for (const seme of Array.from({ length: 12 }, (_, i) => i))
  for (const ruolo of RUOLI) for (const s of STATI) {
    const stato: StatoPersona = {
      aperte: 10, late: 0, oggi: 0, chiuseOggi: 0, chiuseSettimana: 0, progetti: 2, ruolo, ...s,
    }
    if (salutoPersonale(stato, m, seme).length > MAX_CARATTERI) sforate++
  }
is(`nessun fallback sfora i ${MAX_CARATTERI} caratteri`, sforate, 0)

console.log('\n— Il prompt insegna quello che il validatore pretende —')
/* Fatti con **tutto** presente: serve a provare gli esempi, che usano chiavi
   che in una giornata qualunque sarebbero nulle. */
const PIENO: FattiPersona = {
  ...F, anzianitaMesi: 18, anniversario: 2, ferieInGiorni: 12, ferieDurata: 5,
  assenteDaGiorni: 3, festivo: 'Ferragosto', festivoInGiorni: 9,
  compleanno: 38, twobeeAnni: 1, twobeeInGiorni: 9,
}
let esempiRotti = 0
for (const e of ESEMPI) {
  const r = validaTemplate(e, PIENO, ROSA)
  if (!r.ok) { esempiRotti++; console.log(`      ↳ \u00abesempio rifiutato\u00bb ${e} — ${r.motivo}`) }
}
is('ogni esempio del prompt passa il validatore', esempiRotti, 0)
is('e ogni chiave ha una spiegazione', CHIAVI.filter(k => !GLOSSARIO[k]?.trim()).length, 0)

const vPieno = valori(PIENO)
is('i segnaposto offerti sono tutti quelli veri', chiaviOfferte(PIENO).length, CHIAVI.length)
const magro: FattiPersona = {
  ...PIENO, anniversario: null, ferieInGiorni: null, ferieDurata: null,
  assenteDaGiorni: null, colleghi: [],
}
const offerti = chiaviOfferte(magro)
is('un fatto assente non viene offerto', offerti.includes('anniversario'), false)
is('n\u00e9 un collega che non c\'\u00e8', offerti.includes('collega1'), false)

const scena = situazione({
  aperte: magro.aperte, late: magro.late, oggi: magro.scadonoOggi,
  chiuseOggi: magro.chiuseOggi, chiuseSettimana: magro.chiuseSettimana,
  progetti: magro.progetti, ruolo: magro.ruolo,
})
const msg = utente(magro, valori(magro), scena)
is('la situazione la decide task-mood, non una copia', scena, 'ritardo')
is('e non compare nemmeno nel messaggio', /\{anniversario\}|\{collega1\}/.test(msg), false)
is('mentre quelli buoni ci sono', msg.includes('{late}') && msg.includes('{aperte}'), true)
is('lo stesso ingresso da\u0300 lo stesso messaggio', utente(magro, valori(magro), scena), msg)

/* Il prompt di sistema non dipende da nessuno: è la condizione perché la cache
   prenda dalla seconda chiamata in poi. Se un giorno ci finisce dentro il nome
   della persona, funziona lo stesso e costa il doppio senza dirlo. */
/* L'invariante fra i due moduli: se il prompt scrive un nome, il validatore
   lo deve accettare. Il fixture qui sotto è apposta incoerente — un assente
   che non è fra i colleghi — perché è il caso che romperebbe il patto. */
const SBILENCO: FattiPersona = { ...PIENO, colleghi: [], colleghiAssenti: ['Toto'] }
const citabili = nomiCitabili(SBILENCO)
const nelMessaggio = ROSA.rosa.filter(n =>
  new RegExp(`\\b${n}\\b`).test(utente(SBILENCO, valori(SBILENCO), 'ritardo')))
is('ogni nome che il prompt scrive, il validatore lo accetta',
  nelMessaggio.filter(n => !citabili.includes(n)), [])
is('e un nome che nessuno ha nominato resta fuori',
  validaTemplate('Chiedi a Luca.', SBILENCO, ROSA).ok, false)

is('il prompt di sistema non nomina nessuno',
  ROSA.rosa.some(n => SISTEMA.includes(n)), false)
is('e detta la regola che il validatore applica',
  /non scrivere MAI un numero/i.test(SISTEMA) && /agenzia/i.test(SISTEMA), true)

console.log('\n— Il giorno è sempre quello di Roma —')
is('d\'inverno il server UTC è ancora a ieri, Roma no',
  giornoAzienda(new Date('2026-01-01T23:30:00Z')), '2026-01-02')
is('e d\'estate lo è di due ore',
  giornoAzienda(new Date('2026-06-30T22:30:00Z')), '2026-07-01')

console.log('\n— La riga di stamattina, coi numeri di adesso —')
is('la scena la decide una funzione sola', scenaDi(F), situazione(statoDa(F)))
const salvata = { template: BUONO, situazione: scenaDi(F) }
is('template buono e scena invariata: si mostra',
  rigaDiOggi(salvata, F, ROSA), '2 in ritardo e Giulia ti aspetta su 2. Niente panico.')
is('niente scritto per oggi: si torna al deterministico', rigaDiOggi(null, F, ROSA), null)

/* Il caso che giustifica tutta l'architettura: chi aveva scadute a colazione
   le ha chiuse nel pomeriggio. La frase non si adatta — direbbe «0 in
   ritardo» — si ritira. */
const RIPULITO: FattiPersona = { ...F, late: 0, aperte: 3, scadonoOggi: 0 }
is('la scena è cambiata: si ritira', rigaDiOggi(salvata, RIPULITO, ROSA), null)
/* E il caso opposto: stessa scena, numeri diversi. La frase resta, il numero
   segue — è il motivo per cui si salva un template e non una frase finita. */
is('stessa scena, numero nuovo',
  rigaDiOggi(salvata, { ...F, late: 5 }, ROSA), '5 in ritardo e Giulia ti aspetta su 2. Niente panico.')
const SENZA_COLLEGHI: FattiPersona = { ...F, colleghi: [], colleghiAssenti: [] }
is('il collega citato non c\'è più: si ritira',
  rigaDiOggi({ template: BUONO, situazione: scenaDi(SENZA_COLLEGHI) }, SENZA_COLLEGHI,
    { rosa: nomiCitabili(SENZA_COLLEGHI) }), null)

console.log('\n— Quello che torna dal modello si sbuccia, non si aggiusta —')
is('le virgolette attorno alla frase', ripulisci('"{late} in ritardo."'), '{late} in ritardo.')
is('le caporali', ripulisci('«{late} in ritardo.»'), '{late} in ritardo.')
is('il trattino d\'elenco', ripulisci('- {late} in ritardo.'), '{late} in ritardo.')
is('le righe in più: si tiene la prima', ripulisci('\n{late} in ritardo.\nOppure: altro.'), '{late} in ritardo.')
is('una riga già pulita non si tocca', ripulisci('{late} in ritardo.'), '{late} in ritardo.')
/* Qwen 3.6 è un modello di reasoning: senza togliere il pensiero, la «prima
   riga» sarebbe l'inizio del ragionamento invece della frase. */
is('il ragionamento di un reasoning model si butta',
  ripulisci('<think>\nDevo scrivere una riga ironica.\nNiente cifre.\n</think>\n{late} in ritardo.'),
  '{late} in ritardo.')
is('anche se il tag di apertura manca',
  ripulisci('Sto pensando a cosa dire.\n</think>\n{late} in ritardo.'), '{late} in ritardo.')
/* Sbucciare non è correggere: una cifra resta una cifra, e il validatore la
   boccia. Se `ripulisci` cominciasse a sistemare il contenuto, il gate
   smetterebbe di misurare il modello e comincerebbe a misurare noi. */
is('ma una cifra non la toglie nessuno', v(ripulisci('"Hai 4 task in ritardo."')).ok, false)

console.log('\n— Uno zero è un valore, non una notizia —')
/* Scoperto sul database vero: a Toto venivano offerti `{oggi}` e `{chiuseOggi}`
   valendo zero, e «0 scadono oggi» è una frase vera che nessuno vuole leggere. */
const ZERI: FattiPersona = { ...F, scadonoOggi: 0, chiuseOggi: 0, progetti: 0 }
const offZeri = chiaviOfferte(ZERI)
is('un contatore a zero non si offre', offZeri.includes('oggi') || offZeri.includes('chiuseOggi'), false)
is('e il validatore lo rifiuta come il prompt lo tace',
  validaTemplate('{oggi} scadono oggi.', ZERI, ROSA).ok, false)
is('mentre lo stesso contatore pieno passa',
  validaTemplate('{oggi} scadono oggi.', { ...ZERI, scadonoOggi: 2 }, ROSA).ok, true)

/* I conti alla rovescia sono l'eccezione, ed è il motivo per cui esistono:
   zero giorni alle ferie vuol dire che cominciano stamattina. */
const PARTENZA: FattiPersona = { ...PIENO, ferieInGiorni: 0, festivoInGiorni: 0, anzianitaMesi: 0 }
const offPart = chiaviOfferte(PARTENZA)
is('zero giorni alle ferie si dice', offPart.includes('ferieGiorni'), true)
is('zero giorni al festivo pure', offPart.includes('festivoGiorni'), true)
is('e zero mesi vuol dire appena arrivato', offPart.includes('anzianitaMesi'), true)

/* L'invariante fra i due moduli, sull'altro asse: il prompt non può offrire
   quello che il validatore rifiuterebbe. */
let incoerenti = 0
for (const f of [F, PIENO, ZERI, PARTENZA, magro]) {
  const msg = utente(f, valori(f), scenaDi(f))
  for (const k of CHIAVI) {
    const offerto = new RegExp(`\\{${k}\\}`).test(msg)
    const accettato = validaTemplate(`prova {${k}} prova`, f, { rosa: nomiCitabili(f) }).ok
    if (offerto !== accettato) incoerenti++
  }
}
is('ogni segnaposto offerto è un segnaposto accettato', incoerenti, 0)

console.log('\n— Le ricorrenze (§361) —')
/* Il fixture nasce il 1° aprile ed è assunto il 1° aprile: oggi è il 2026-04-01,
   quindi oggi è tutt'e due. È una coincidenza voluta — serve a provare che le
   due ricorrenze non si sovrascrivono. */
is('il compleanno di oggi', F.compleanno, 38)
is('e l\'anniversario di assunzione insieme', F.anniversario, 2)
is('domani nessuno dei due',
  [fattiPersona({ ...INGRESSO, oggi: '2026-04-02' }).compleanno,
   fattiPersona({ ...INGRESSO, oggi: '2026-04-02' }).anniversario], [null, null])
is('senza data di nascita non si inventa un compleanno',
  fattiPersona({ ...INGRESSO, profilo: { ...INGRESSO.profilo, birth_date: null } }).compleanno, null)

/* TwoBee è nata il 10 marzo 2026: nel 2026 il 10 marzo è già passato e non era
   un compleanno, era la nascita. Il primo è nel 2027. */
is('a settembre il compleanno di TwoBee è lontano',
  fattiPersona({ ...INGRESSO, oggi: '2026-09-19' }).twobeeInGiorni, null)
const vigilia = fattiPersona({ ...INGRESSO, oggi: '2027-03-03' })
is('una settimana prima si vede', vigilia.twobeeInGiorni, 7)
is('e compie un anno, non zero', vigilia.twobeeAnni, 1)
is('il giorno della nascita non era un compleanno',
  fattiPersona({ ...INGRESSO, oggi: '2026-03-10' }).twobeeAnni, null)

console.log('\n— Una ricorrenza batte il carico —')
const msgFesta = utente(F, valori(F), scenaDi(F))
is('il compleanno diventa la priorità', /compleanno: parla di quello/.test(msgFesta), true)
const senzaFesta = fattiPersona({ ...INGRESSO, oggi: '2026-04-02' })
is('un giorno qualunque no',
  /parla di quello/.test(utente(senzaFesta, valori(senzaFesta), scenaDi(senzaFesta))), false)
/* `twobeeGiorni` è un conto alla rovescia, non un contatore: a zero vuol dire
   «oggi è il compleanno», ed è il giorno in cui serve di più. */
is('zero giorni al compleanno di TwoBee si dice',
  chiaviOfferte(fattiPersona({ ...INGRESSO, oggi: '2027-03-10' })).includes('twobeeGiorni'), true)

console.log('\n— Quello che torna dal database —')
is('i fatti buoni si rileggono', leggiFatti(JSON.parse(JSON.stringify(F)))?.nome, 'Marco')
is('un oggetto vuoto no', leggiFatti({}), null)
is('e nemmeno null', leggiFatti(null), null)
is('una riga scritta da una versione precedente, senza un contatore, si scarta',
  leggiFatti({ ...F, chiuseSettimana: undefined }), null)
is('n\u00e9 si accetta una stringa al posto di un numero',
  leggiFatti({ ...F, late: '2' }), null)

/* Il patto del passo 4: le task si muovono durante il giorno, i nomi no. */
const FRESCO = conCaricoFresco(F, { aperte: 8, late: 5, scadonoOggi: 1, chiuseOggi: 0, chiuseSettimana: 2 })
is('i conteggi sono quelli di adesso', [FRESCO.aperte, FRESCO.late], [8, 5])
is('i colleghi restano quelli di stamattina', FRESCO.colleghi.map(c => c.nome), ['Giulia', 'Toto', 'Sara'])
is('e le ricorrenze pure', FRESCO.compleanno, 38)
is('la riga segue i numeri nuovi',
  rigaDiOggi({ template: BUONO, situazione: scenaDi(FRESCO) }, FRESCO, ROSA),
  '5 in ritardo e Giulia ti aspetta su 2. Niente panico.')

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
