/**
 * §351 — la voce delle liste di lavoro: dinamica, e con le mani legate.
 *
 * Le frasi fisse di un gestionale si smettono di leggere al terzo giorno: «4 in
 * ritardo: recuperale prima di aprire altro» diventa parte dello sfondo, e da
 * lì il numero non lo guarda più nessuno. Qui le frasi ruotano, cambiano con
 * l'ora e col giorno, e si permettono di lamentarsi — ma sotto tre vincoli che
 * il gate controlla uno per uno:
 *
 * - **il numero non si tocca.** La battuta ci gira intorno, non lo sostituisce
 *   e non lo arrotonda: una riga simpatica che dice un numero sbagliato è una
 *   riga sbagliata, e questo posto ne ha già abbastanza da difendere;
 * - **stessa situazione, stessa frase.** La scelta è deterministica: cambia
 *   quando cambiano i numeri o il giorno, non a ogni tasto premuto nella
 *   ricerca. Un testo che balla mentre scrivi è un difetto, non brio;
 * - **l'ora arriva dopo.** Il server sta su UTC e chi legge no: se il saluto
 *   dipendesse dall'orologio al primo render, server e browser scriverebbero
 *   due cose diverse. Finché il momento non si conosce (`ora: null`) si pesca
 *   solo fra le frasi che valgono sempre.
 *
 * Gate: `npx tsx lib/task-mood.check.ts`.
 */

export type Momento = {
  /** 0-23, oppure null finché il browser non l'ha detto */
  ora: number | null
  /** 0 = domenica … 6 = sabato, oppure null */
  giorno: number | null
}

export type Tono = 'error' | 'warning' | 'success' | 'neutro'
export type Umore = { tono: Tono; testo: string }

export type ContiUmore = {
  /** task aperte nell'elenco che si sta guardando */
  aperte: number
  /** già scadute */
  late: number
  /** in scadenza entro sette giorni */
  soon: number
  /** quante ce ne sono in tutto, chiuse comprese */
  tutte: number
}

type Frase = (n: number, m: Momento) => string
type Voce = { quando?: (m: Momento) => boolean; frase: Frase }

const mattina = (m: Momento) => m.ora !== null && m.ora < 12
const pomeriggio = (m: Momento) => m.ora !== null && m.ora >= 12 && m.ora < 18
const sera = (m: Momento) => m.ora !== null && m.ora >= 18
const lunedi = (m: Momento) => m.giorno === 1
const venerdi = (m: Momento) => m.giorno === 5
const weekend = (m: Momento) => m.giorno === 0 || m.giorno === 6

/** deterministica: stessa situazione, stessa frase */
function pesca(voci: Voce[], m: Momento, seme: number): Voce {
  const buone = voci.filter(v => !v.quando || v.quando(m))
  const pool = buone.length ? buone : voci.filter(v => !v.quando)
  return pool[Math.abs(Math.trunc(seme)) % pool.length]
}

// ── in ritardo ───────────────────────────────────────────────────────────────
const IN_RITARDO: Voce[] = [
  { frase: n => `${n} in ritardo. Si recuperano una alla volta, non tutte insieme.` },
  { frase: n => `${n} scadute. La più vecchia per prima: è quella che pesa.` },
  { frase: n => `${n} oltre la data. Se qualcuna non serve più, chiuderla è lavoro fatto.` },
  { frase: n => `${n} in ritardo. Nessun dramma: scegli, sposta, riparti.` },
  { frase: n => `${n} fuori tempo. Se dipendono da qualcun altro, non sono tue: scrivilo.` },
  { frase: n => `${n} arretrate. Una data spostata onestamente vale più di una promessa tirata.` },
  { quando: mattina, frase: n => `${n} in ritardo e il caffè è ancora caldo. Comincia dalla più corta.` },
  { quando: sera, frase: n => `${n} in ritardo. Domani rendono di più: adesso stacca.` },
  { quando: venerdi, frase: n => `${n} in ritardo di venerdì. Scegline una e il weekend è più leggero.` },
  { quando: lunedi, frase: n => `${n} in ritardo di lunedì. Settimana nuova: metà se ne va senza accorgersene.` },
  { quando: weekend, frase: n => `${n} in ritardo, ed è weekend. Lasciale lì: ci sono anche lunedì.` },
]

// ── scadono a breve ──────────────────────────────────────────────────────────
const IN_ARRIVO: Voce[] = [
  { frase: n => `${n} in scadenza entro sette giorni. C'è tempo, se si comincia.` },
  { frase: n => `${n} in arrivo. Guardarle adesso costa meno che guardarle giovedì.` },
  { frase: n => `${n} in scadenza: ancora in tempo, e senza correre.` },
  { frase: n => `${n} in arrivo. Se una è troppo grande, spezzala in due.` },
  { quando: mattina, frase: n => `${n} in scadenza. La mattina è il momento buono per la più difficile.` },
  { quando: pomeriggio, frase: n => `${n} in scadenza. Dieci minuti in piedi e poi si riparte.` },
  { quando: sera, frase: n => `${n} in scadenza. Domani è un altro dei sette giorni: adesso basta.` },
  { quando: venerdi, frase: n => `${n} in scadenza, ed è venerdì. Decidi tu cosa vale la pena finire oggi.` },
]

// ── tutto chiuso ─────────────────────────────────────────────────────────────
const PULITO: Voce[] = [
  { frase: () => 'Tutto chiuso. Bel lavoro — e non capita per caso.' },
  { frase: () => 'Zero aperte. Momento buono per guardarsi intorno, o per respirare.' },
  { frase: () => 'Niente da fare qui. Goditelo davvero, senza cercarti altro.' },
  { frase: () => 'Elenco vuoto. Se hai un\'idea in sospeso, oggi c\'è lo spazio.' },
  { quando: venerdi, frase: () => 'Tutto chiuso di venerdì. Questa non è fortuna, è mestiere.' },
  { quando: sera, frase: () => 'Tutto chiuso a fine giornata. Spegni tutto e vattene, davvero.' },
  { quando: lunedi, frase: () => 'Lunedì e già zero aperte. Partenza come si deve.' },
]

// ── in pari ──────────────────────────────────────────────────────────────────
const IN_PARI: Voce[] = [
  { frase: n => `Zero ritardi, ${n} aperte. Situazione che si governa.` },
  { frase: n => `${n} aperte, niente scaduto. Si può lavorare con calma.` },
  { frase: n => `Zero scadute, ${n} in lavorazione. Continua così, funziona.` },
  { frase: n => `${n} aperte e nessun arretrato. Rara, e te la sei costruita.` },
  { quando: lunedi, frase: n => `Lunedì, ${n} aperte, zero ritardi. Partenza da manuale.` },
  { quando: sera, frase: n => `${n} aperte e niente di scaduto: chiudi la giornata tranquillo.` },
]

// ── niente di niente ─────────────────────────────────────────────────────────
const VUOTO: Voce[] = [
  { frase: () => 'Nessuna task assegnata. Capita, ed è il momento buono per respirare.' },
  { frase: () => 'Zero task. Se cercavi lavoro, chiedere è la mossa giusta.' },
  { frase: () => 'Lista vuota. Buon momento per portare avanti una cosa tua.' },
  { quando: weekend, frase: () => 'Niente da fare ed è weekend. Combinazione perfetta: chiudi la scheda.' },
  { quando: lunedi, frase: () => 'Lunedì e lista vuota. Comincia con calma.' },
]

/**
 * Il verdetto in testa alla lista personale.
 *
 * L'ordine è quello della gravità e non cambia: prima il ritardo, poi la
 * scadenza vicina, poi le buone notizie. La battuta non promuove niente.
 */
export function verdetto(c: ContiUmore, m: Momento, seme: number): Umore {
  if (c.tutte === 0) return { tono: 'neutro', testo: pesca(VUOTO, m, seme).frase(0, m) }
  if (c.late > 0) return { tono: 'error', testo: pesca(IN_RITARDO, m, seme).frase(c.late, m) }
  if (c.soon > 0) return { tono: 'warning', testo: pesca(IN_ARRIVO, m, seme).frase(c.soon, m) }
  if (c.aperte === 0) return { tono: 'success', testo: pesca(PULITO, m, seme).frase(0, m) }
  return { tono: 'success', testo: pesca(IN_PARI, m, seme).frase(c.aperte, m) }
}

// ── sottotitolo dell'elenco ──────────────────────────────────────────────────
const MIE: Voce[] = [
  { frase: () => 'Tutto quello che ti hanno messo in mano. Sì, anche quella lì.' },
  { frase: () => 'Le tue: quelle dei progetti e quelle arrivate «al volo», che poi restano.' },
  { frase: () => 'Roba tua. Chi te l\'ha rifilata è scritto sulla riga: nessun mistero.' },
  { quando: mattina, frase: () => 'La giornata per intero, senza sorprese nascoste in altre schede.' },
  { quando: sera, frase: () => 'Quello che resta. Domani ritrovi questo elenco, identico, che ti aspetta.' },
]
const TUTTE: Voce[] = [
  { frase: () => 'Tutte le task, dentro e fuori dai progetti. Nessuna esclusa.' },
  { frase: () => 'Tutto il lavoro in circolazione, in un posto solo. Coraggio.' },
  { frase: () => 'Niente più nascosto nella scheda di un progetto che nessuno apre.' },
]
const DI_PROGETTO: Voce[] = [
  { frase: () => 'Quelle dentro un progetto: in fondo a ognuna c\'è un cliente che aspetta.' },
  { frase: () => 'Lavoro di consegna, con un nome e una data sopra. Entrambi veri.' },
  { frase: () => 'Roba promessa a qualcuno. La promessa l\'abbiamo fatta noi.' },
]
const AD_HOC: Voce[] = [
  { frase: () => 'Fuori progetto: i «cinque minuti» che non sono mai stati cinque.' },
  { frase: () => 'Richieste veloci, extra, favori. Non fatturati, ma vivissimi.' },
  { frase: () => 'Quelle che non stanno in nessun piano e si fanno lo stesso.' },
]

export function sottotitolo(
  o: { origin: 'tutte' | 'progetto' | 'ad_hoc'; personale: boolean },
  m: Momento, seme: number,
): string {
  if (o.origin === 'ad_hoc') return pesca(AD_HOC, m, seme).frase(0, m)
  if (o.origin === 'progetto') return pesca(DI_PROGETTO, m, seme).frase(0, m)
  return pesca(o.personale ? MIE : TUTTE, m, seme).frase(0, m)
}

// ── saluto della home operativa ──────────────────────────────────────────────
const SALUTO: Voce[] = [
  { frase: () => 'Qui c\'è quello che ti riguarda. Il resto può aspettare, come sempre.' },
  { frase: () => 'Un altro giorno, un altro elenco. Fingiamo entusiasmo.' },
  { quando: mattina, frase: () => 'Buongiorno. Il caffè è tuo, le scadenze pure.' },
  { quando: mattina, frase: () => 'Mattina: l\'unico momento in cui il piano della giornata regge ancora.' },
  { quando: pomeriggio, frase: () => 'Pomeriggio, l\'ora in cui tutto diventa improvvisamente urgente.' },
  { quando: pomeriggio, frase: () => 'Metà giornata. Metà lista. Fai tu i conti.' },
  { quando: sera, frase: () => 'È tardi. Chiudi una cosa e vai: domani c\'è di nuovo, garantito.' },
  { quando: lunedi, frase: () => 'Lunedì. L\'elenco si ricorda tutto quello che venerdì hai lasciato lì.' },
  { quando: venerdi, frase: () => 'Venerdì. Quello che chiudi oggi non ti citofona domenica sera.' },
  { quando: weekend, frase: () => 'È weekend e sei qui. Ammirevole. Anche un filo preoccupante.' },
]

export function saluto(m: Momento, seme: number): string {
  return pesca(SALUTO, m, seme).frase(0, m)
}

/**
 * Il seme: cambia col giorno e con i numeri, non col resto.
 *
 * Deve restare uguale mentre si scrive nella ricerca — il testo che cambia a
 * ogni tasto è un difetto — e cambiare quando cambia la situazione, che è il
 * momento in cui rileggere la frase ha un senso.
 */
export function seme(oggi: string, ...numeri: number[]): number {
  const base = Number(oggi.replace(/\D/g, '')) || 0
  return numeri.reduce((acc, n, i) => acc + n * (i + 3), base)
}

// ── §351 · la voce delle altre sezioni del workspace ─────────────────────────

/**
 * Ogni sezione dice cosa c'è dentro, e lo dice con la faccia di chi ci lavora.
 *
 * La regola qui è più stretta che altrove: queste righe stanno **sotto un
 * titolo**, quindi non devono spiegare (lo fa il titolo) né promettere. Devono
 * dire perché guardarla adesso — o ammettere che non c'è motivo.
 */
/* Calendario e customer care non ci sono: le loro intestazioni sono barre
   compatte con dentro un conteggio, e una riga in più le spezzerebbe. Meglio
   due sezioni senza voce che due barre rotte — e nessun gruppo di frasi che
   non legge nessuno. */
export type Sezione =
  | 'clienti' | 'progetti' | 'ticket'
  | 'documenti' | 'documenti_personali' | 'buste_paga' | 'hr'
  | 'feedback' | 'cronologia' | 'profilo' | 'tracking'

const SEZIONI: Record<Sezione, Voce[]> = {
  clienti: [
    { frase: () => 'Chi paga, chi chiede, chi scrive alle 23. Spesso la stessa persona.' },
    { frase: () => 'L\'anagrafica vera. Quella nella tua testa non conta più.' },
    { frase: () => 'Tutti i clienti attivi. Sì, anche quello.' },
    { quando: lunedi, frase: () => 'Lunedì: il giorno in cui si ricordano tutti di noi insieme.' },
  ],
  progetti: [
    { frase: () => 'Il piano. Poi c\'è la realtà, ma intanto il piano c\'è.' },
    { frase: () => 'Ogni progetto ha una data che qualcuno, a un certo punto, ha promesso.' },
    { frase: () => 'Quello che stiamo consegnando davvero, non quello che raccontiamo in call.' },
    { quando: venerdi, frase: () => 'Venerdì: ottimo giorno per scoprire cosa scade lunedì.' },
  ],
  ticket: [
    { frase: () => 'Ogni riga è una persona che aspetta. Non un numero: una persona.' },
    { frase: () => 'Il ticket invecchia male. Come il pane, non come il vino.' },
    { quando: mattina, frase: () => 'Apri i più vecchi: sono quelli che stanno diventando telefonate.' },
  ],
  documenti: [
    { frase: () => 'Cercali qui prima di chiederli nel gruppo. Grazie da tutti.' },
    { frase: () => 'I file condivisi. Sì, c\'è anche quello che stai per chiedere.' },
    { frase: () => 'L\'archivio comune. Funziona solo se ci metti dentro anche tu.' },
  ],
  documenti_personali: [
    { frase: () => 'Contratti, certificati, carte che servono sempre di lunedì mattina.' },
    { frase: () => 'Roba tua, visibile solo a te. Nemmeno l\'admin ci guarda.' },
  ],
  buste_paga: [
    { frase: () => 'L\'unica sezione che tutti trovano al primo colpo.' },
    { frase: () => 'Le tue buste paga. Scaricale, controllale, poi lamentati pure.' },
    { quando: mattina, frase: () => 'Se è fine mese hai già capito perché sei qui.' },
  ],
  hr: [
    { frase: () => 'Ferie, permessi, note spese. Chiedi bene e chiedi presto.' },
    { frase: () => 'Le richieste si approvano più in fretta se hanno una data sensata.' },
    { quando: venerdi, frase: () => 'Venerdì: il momento statisticamente migliore per chiedere ferie.' },
  ],
  feedback: [
    { frase: () => 'Dicci cosa non va. Finisce in una lista vera, non in un cassetto.' },
    { frase: () => 'Se una cosa ti fa perdere tempo ogni giorno, scrivila. Vale doppio.' },
    { frase: () => 'Lamentarsi qui è produttivo. Lamentarsi al bar no.' },
  ],
  cronologia: [
    { frase: () => 'Chi ha toccato cosa, e quando. Nessuna accusa, solo date precise.' },
    { frase: () => 'Serve per ritrovare quello che «era lì ieri». Di solito c\'è ancora.' },
    { frase: () => 'La memoria del sistema. Più affidabile della tua, senza offesa.' },
  ],
  profilo: [
    { frase: () => 'Il tuo profilo. La foto la vedono tutti: regolati.' },
    { frase: () => 'Dati tuoi. Tienili aggiornati, poi ti serviranno di corsa.' },
  ],
  tracking: [
    { frase: () => 'I numeri che dicono se quello che facciamo funziona davvero.' },
    { frase: () => 'Qui non si discute di opinioni. Si guardano le curve.' },
    { quando: lunedi, frase: () => 'Lunedì: il giorno giusto per scoprire com\'è andato il weekend.' },
  ],
}

export function sottotitoloSezione(chiave: Sezione, m: Momento, seme: number): string {
  return pesca(SEZIONI[chiave], m, seme).frase(0, m)
}

/** tutte le chiavi, per il gate: una sezione senza frasi è una sezione muta */
export const SEZIONI_CHIAVI = Object.keys(SEZIONI) as Sezione[]

// ── §352 · il saluto che sa chi sei e come stai messo ────────────────────────

/**
 * La riga sotto «Ciao, nome 👋» nella home operativa.
 *
 * Un saluto uguale per tutti e uguale ogni giorno è carta da parati: si legge
 * due volte e poi diventa parte dello sfondo. Questo guarda **i numeri veri di
 * chi apre la pagina** — quante ne ha in ritardo, quante ne scadono oggi,
 * quante ne ha chiuse — e il suo **ruolo**, perché a uno stage e a un manager
 * la stessa frase non dice la stessa cosa.
 *
 * Le regole sono quelle di §351, con una in più: **il ruolo non si usa per
 * fare la morale.** Un junior non si tratta come un incapace e un manager non
 * si tratta come un capo: il ruolo cambia *di cosa* si parla — chiedere aiuto,
 * il lavoro degli altri, il pezzo difficile — non il rispetto.
 */
export type Ruolo =
  | 'super_admin' | 'founder' | 'admin' | 'manager' | 'senior'
  | 'junior' | 'stage' | 'freelance' | 'partner' | 'viewer' | null

export type StatoPersona = {
  aperte: number
  late: number
  oggi: number
  chiuseOggi: number
  chiuseSettimana: number
  /** progetti di cui è PM: zero per chi non ne governa nessuno */
  progetti: number
  ruolo: Ruolo
}

type VocePersona = {
  quando?: (m: Momento) => boolean
  chi?: (r: Ruolo) => boolean
  frase: (s: StatoPersona, m: Momento) => string
}

const capo = (r: Ruolo) => r === 'admin' || r === 'founder' || r === 'super_admin' || r === 'manager'
const giovane = (r: Ruolo) => r === 'junior' || r === 'stage'
const esterno = (r: Ruolo) => r === 'freelance' || r === 'partner'

function pescaPersona(voci: VocePersona[], s: StatoPersona, m: Momento, seme: number): VocePersona {
  const buone = voci.filter(v => (!v.quando || v.quando(m)) && (!v.chi || v.chi(s.ruolo)))
  const pool = buone.length ? buone : voci.filter(v => !v.quando && !v.chi)
  return pool[Math.abs(Math.trunc(seme)) % pool.length]
}

const P_RITARDO: VocePersona[] = [
  { frase: s => `${s.late} in ritardo. Non si chiudono oggi, e nessuno se lo aspetta: scegline una.` },
  { frase: s => `${s.late} scadute che ti aspettano. Una alla volta è il modo più veloce.` },
  { frase: s => `Hai ${s.late} task oltre la data. Succede: la più vecchia per prima.` },
  { chi: capo, frase: s => `${s.late} in ritardo tue. Se sono troppe, è il momento di darne via qualcuna.` },
  { chi: giovane, frase: s => `${s.late} in ritardo: se una si è incagliata, chiedi. Non è una sconfitta.` },
  { chi: esterno, frase: s => `${s.late} oltre la data concordata. Se le stime erano strette, dillo: si rivedono.` },
  { quando: mattina, frase: s => `${s.late} scadute e la giornata intera davanti. Comincia dalla più corta.` },
  { quando: sera, frase: s => `${s.late} in ritardo a fine giornata. Adesso però stacca: domani rendono di più.` },
  { quando: lunedi, frase: s => `${s.late} in ritardo di lunedì. Settimana nuova: se ne recupera metà senza accorgersene.` },
]

const P_SPRINT: VocePersona[] = [
  { frase: s => `${s.chiuseOggi} chiuse oggi. Bel ritmo: adesso bevi qualcosa e riparti.` },
  { frase: s => `${s.chiuseOggi} task completate oggi. Te lo diciamo noi perché nessun altro lo farà: bene.` },
  { frase: s => `${s.chiuseOggi} chiuse. Giornata che gira — non tirare troppo la corda.` },
  { chi: giovane, frase: s => `${s.chiuseOggi} chiuse oggi. Stai andando meglio di quanto pensi.` },
  { chi: capo, frase: s => `${s.chiuseOggi} chiuse oggi, e il team gira. Anche questo è lavoro fatto.` },
]

const P_OGGI: VocePersona[] = [
  { frase: s => `${s.oggi} scadono oggi. Se ne salta una il mondo regge: scegli tu quale.` },
  { frase: s => `${s.oggi} in scadenza. Le prossime ore hanno un programma — e va bene così.` },
  { frase: s => `${s.oggi} per oggi. Poche, se cominci dalla più breve.` },
  { chi: capo, frase: s => `${s.oggi} in scadenza oggi. Se non ci stanno tutte, spostane una tu: puoi.` },
  { quando: pomeriggio, frase: s => `${s.oggi} in scadenza e il pomeriggio è cominciato. Dieci minuti in piedi, poi si riparte.` },
  { quando: sera, frase: s => `${s.oggi} scadono oggi, ma la giornata è finita. Quello che resta, resta.` },
]

const P_PULITO: VocePersona[] = [
  { frase: s => `Zero aperte, ${s.chiuseSettimana} chiuse questa settimana. Te la sei guadagnata.` },
  { frase: () => 'Elenco pulito. Goditelo: non capita spesso, e non è un caso.' },
  { frase: s => `${s.chiuseSettimana} chiuse e niente in coda. Bel lavoro, davvero.` },
  { chi: capo, frase: () => 'Tutto chiuso da parte tua. Se il team è messo così, è merito anche tuo.' },
  { quando: venerdi, frase: () => 'Tutto chiuso di venerdì. Questo sì che è saper vivere.' },
]

const P_FERMO: VocePersona[] = [
  { frase: () => 'Niente in lista oggi. Capita, ed è il momento buono per respirare.' },
  { frase: () => 'Lista vuota. Se hai un\'idea da portare avanti, oggi c\'è lo spazio.' },
  { chi: giovane, frase: () => 'Niente in lista: chiedere qualcosa da fare è la mossa giusta, non un disturbo.' },
  { chi: capo, frase: () => 'Niente di tuo in lista. Buon momento per guardare come stanno gli altri.' },
  { chi: esterno, frase: () => 'Nessuna task aperta. Quando serviremo, ci sentiamo — grazie del lavoro fatto.' },
]

const P_NORMALE: VocePersona[] = [
  { frase: s => `${s.aperte} aperte, zero in ritardo. Giornata che si può governare.` },
  { frase: s => `${s.aperte} sul tavolo e niente di scaduto: oggi si lavora con calma.` },
  { frase: s => `${s.aperte} aperte. Nessuna emergenza, e è una buona notizia.` },
  { chi: capo, frase: s => `${s.aperte} aperte tue, più quelle che segui. Ricordati che anche seguire è lavoro.` },
  { chi: giovane, frase: s => `${s.aperte} aperte. Una alla volta, in ordine di scadenza: funziona sempre.` },
  { quando: mattina, frase: s => `${s.aperte} aperte e la giornata intera davanti. Scegli bene la prima.` },
  { quando: venerdi, frase: s => `${s.aperte} aperte di venerdì: decidi tu cosa vale la pena finire oggi.` },
]

/**
 * §360 — in che situazione è chi legge. Era una catena di ternari dentro
 * `salutoPersonale`, e serve **anche** al precalcolo notturno: il testo scritto
 * la mattina vale finché la situazione è quella, e se nel pomeriggio cambia si
 * torna alle frasi deterministiche. Scritta due volte, sarebbe divergita al
 * primo gruppo aggiunto.
 */
export type Situazione = 'ritardo' | 'sprint' | 'oggi' | 'pulito' | 'fermo' | 'normale'

export function situazione(s: StatoPersona): Situazione {
  if (s.late > 0) return 'ritardo'
  if (s.chiuseOggi >= 3) return 'sprint'
  if (s.oggi > 0) return 'oggi'
  if (s.aperte === 0) return s.chiuseSettimana > 0 ? 'pulito' : 'fermo'
  return 'normale'
}

const POOL: Record<Situazione, VocePersona[]> = {
  ritardo: P_RITARDO, sprint: P_SPRINT, oggi: P_OGGI,
  pulito: P_PULITO, fermo: P_FERMO, normale: P_NORMALE,
}

export function salutoPersonale(s: StatoPersona, m: Momento, seme: number): string {
  return pescaPersona(POOL[situazione(s)], s, m, seme).frase(s, m)
}
