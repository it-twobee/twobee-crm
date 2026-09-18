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
  { frase: n => `${n} in ritardo. Il passato bussa, e stavolta ha le chiavi.` },
  { frase: n => `${n} scadute. Il tempo è passato, loro sono rimaste.` },
  { frase: n => `${n} in ritardo. «Lo faccio dopo» ha vinto ${n} volte su ${n}.` },
  { frase: n => `${n} scadute. Nessun giudizio, solo un conteggio imbarazzantemente preciso.` },
  { frase: n => `${n} in ritardo. Il cliente non lo sa ancora. Ancora.` },
  { frase: n => `${n} fuori tempo massimo. Il calendario ha già voltato pagina, tu no.` },
  { quando: mattina, frase: n => `${n} in ritardo e il caffè è già finito. Iniziamo bene.` },
  { quando: mattina, frase: n => `Buongiorno: ${n} scadute ti hanno aspettato tutta la notte.` },
  { quando: pomeriggio, frase: n => `${n} in ritardo. Sono le ore in cui si decide se diventano ${n + 1}.` },
  { quando: sera, frase: n => `${n} in ritardo. Domani alle 9 saranno ancora lì, puntualissime.` },
  { quando: venerdi, frase: n => `${n} in ritardo di venerdì: il weekend parte con un peso a bordo.` },
  { quando: lunedi, frase: n => `${n} in ritardo già di lunedì. Record personale?` },
  { quando: weekend, frase: n => `${n} in ritardo, ed è weekend. Nessuno guarda: chiudine una di nascosto.` },
]

// ── scadono a breve ──────────────────────────────────────────────────────────
const IN_ARRIVO: Voce[] = [
  { frase: n => `${n} in scadenza entro sette giorni. Sette. Non «una settimana circa».` },
  { frase: n => `${n} in arrivo. Il futuro è quella cosa che verso giovedì diventa presente.` },
  { frase: n => `${n} in scadenza: ancora in tempo, tecnicamente, per pochissimo.` },
  { frase: n => `${n} in arrivo. Adesso sono progetti, fra sei giorni sono problemi.` },
  { quando: mattina, frase: n => `${n} in scadenza. Si comincia adesso o alle 18 col fiatone?` },
  { quando: pomeriggio, frase: n => `${n} in scadenza. Il pomeriggio sembra lungo e non lo è mai.` },
  { quando: sera, frase: n => `${n} in scadenza. Domani è già uno di quei sette giorni.` },
  { quando: venerdi, frase: n => `${n} in scadenza, ed è venerdì: il lunedì arriva prima di quanto meriti.` },
]

// ── tutto chiuso ─────────────────────────────────────────────────────────────
const PULITO: Voce[] = [
  { frase: () => 'Tutto chiuso. Fai uno screenshot, nessuno ti crederà.' },
  { frase: () => 'Zero aperte. O sei bravissimo, o qualcuno sta per rimediare.' },
  { frase: () => 'Niente da fare qui. Goditelo: dura il tempo di una mail.' },
  { frase: () => 'Elenco vuoto. Sospettosamente vuoto.' },
  { quando: venerdi, frase: () => 'Tutto chiuso di venerdì. Questa non è fortuna, è mestiere.' },
  { quando: sera, frase: () => 'Tutto chiuso a fine giornata. Spegni tutto e vattene, davvero.' },
  { quando: lunedi, frase: () => 'Lunedì e già zero aperte. Chi sei e cosa hai fatto?' },
]

// ── in pari ──────────────────────────────────────────────────────────────────
const IN_PARI: Voce[] = [
  { frase: n => `Zero ritardi, ${n} aperte. Equilibrio precario, ma è pur sempre equilibrio.` },
  { frase: n => `${n} aperte, niente scaduto. Tutto sotto controllo — finché non arriva una mail.` },
  { frase: n => `Zero scadute, ${n} in lavorazione. Continua così e diventi noioso.` },
  { frase: n => `${n} aperte e nessun rimorso. Raro.` },
  { quando: lunedi, frase: n => `Lunedì, ${n} aperte, zero ritardi. Partenza da manuale.` },
  { quando: sera, frase: n => `${n} aperte e niente di scaduto: si chiude la giornata da vincitori.` },
]

// ── niente di niente ─────────────────────────────────────────────────────────
const VUOTO: Voce[] = [
  { frase: () => 'Nessuna task assegnata. Goditela: non è uno stato stabile.' },
  { frase: () => 'Zero task. O è un miracolo, o si sono scordati di te. Scommetto sul secondo.' },
  { frase: () => 'Lista vuota. Il momento giusto per chiedere lavoro, o per sparire.' },
  { quando: weekend, frase: () => 'Niente da fare ed è weekend. Combinazione perfetta, chiudi la scheda.' },
  { quando: lunedi, frase: () => 'Lunedì e lista vuota. Durerà fino alle 10:30.' },
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
  { frase: () => 'Tutte le task dell\'agenzia, dentro e fuori dai progetti.' },
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
