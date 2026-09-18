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
  { frase: n => `${n} in ritardo. Il passato bussa, e ha portato gli amici.` },
  { frase: n => `${n} già scadute: il tempo è passato, loro no.` },
  { frase: n => `${n} in ritardo. Qualcuno disse «lo faccio dopo». Dopo è adesso.` },
  { frase: n => `${n} scadute. Nessun giudizio — solo un conteggio molto preciso.` },
  { quando: mattina, frase: n => `${n} in ritardo, e il caffè non le chiude da solo.` },
  { quando: sera, frase: n => `${n} in ritardo: domani mattina saranno ancora lì, fedeli.` },
  { quando: venerdi, frase: n => `${n} in ritardo di venerdì. Il weekend le aspetta con te.` },
  { quando: lunedi, frase: n => `${n} in ritardo già di lunedì. Partenza sprint, direzione opposta.` },
  { quando: weekend, frase: n => `${n} in ritardo, ed è weekend. Nessuno ti guarda: chiudine una.` },
]

// ── scadono a breve ──────────────────────────────────────────────────────────
const IN_ARRIVO: Voce[] = [
  { frase: n => `${n} in scadenza entro sette giorni. Sette, non «una settimana circa».` },
  { frase: n => `${n} in arrivo. Il futuro è quella cosa che poi diventa oggi.` },
  { frase: n => `${n} in scadenza. Ancora in tempo, tecnicamente.` },
  { quando: mattina, frase: n => `${n} in scadenza questa settimana: si comincia adesso o alle 18?` },
  { quando: pomeriggio, frase: n => `${n} in scadenza a breve. Il pomeriggio è lungo, ma non infinito.` },
  { quando: venerdi, frase: n => `${n} in scadenza, e il venerdì dura meno di quanto sembri.` },
]

// ── tutto chiuso ─────────────────────────────────────────────────────────────
const PULITO: Voce[] = [
  { frase: () => 'Tutto chiuso. Screenshot, che nessuno ci crederà.' },
  { frase: () => 'Zero aperte. O sei bravissimo, o sta per arrivare qualcosa.' },
  { frase: () => 'Niente da fare qui. Sospetto, ma bello.' },
  { quando: venerdi, frase: () => 'Tutto chiuso di venerdì. Questa è tecnica.' },
  { quando: sera, frase: () => 'Tutto chiuso a fine giornata. Si può anche smettere.' },
]

// ── in pari ──────────────────────────────────────────────────────────────────
const IN_PARI: Voce[] = [
  { frase: n => `Niente in ritardo, ${n} aperte. Equilibrio precario ma dignitoso.` },
  { frase: n => `${n} aperte e nessun ritardo: la situazione è sotto controllo. Per ora.` },
  { frase: n => `Zero scadute, ${n} in lavorazione. Continua così e diventa noioso.` },
  { quando: lunedi, frase: n => `Lunedì con ${n} aperte e zero ritardi: parte bene.` },
]

// ── niente di niente ─────────────────────────────────────────────────────────
const VUOTO: Voce[] = [
  { frase: () => 'Nessuna task assegnata. Goditela finché dura.' },
  { frase: () => 'Zero task. O è un miracolo, o si sono dimenticati di te.' },
  { frase: () => 'Niente in lista. Il momento perfetto per farsi assegnare qualcosa.' },
  { quando: weekend, frase: () => 'Nessuna task, ed è weekend. Combinazione consigliata.' },
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
  { frase: () => 'Tutto quello che ti hanno messo in mano, progetti compresi.' },
  { frase: () => 'Le tue: quelle dei progetti e quelle arrivate «al volo».' },
  { frase: () => 'Roba tua. Chi te l\'ha data è scritto sulla riga.' },
  { quando: mattina, frase: () => 'La giornata, per intero. Niente sorprese nascoste altrove.' },
  { quando: sera, frase: () => 'Quello che resta. Domani è un altro elenco, uguale a questo.' },
]
const TUTTE: Voce[] = [
  { frase: () => 'Tutte le task, dentro e fuori dai progetti.' },
  { frase: () => 'Tutto il lavoro in giro per l\'agenzia, in un posto solo.' },
  { frase: () => 'Niente resta nascosto nella scheda di un progetto.' },
]
const DI_PROGETTO: Voce[] = [
  { frase: () => 'Quelle dentro un progetto: c\'è un cliente che aspetta.' },
  { frase: () => 'Lavoro di consegna, con un nome e una scadenza sopra.' },
]
const AD_HOC: Voce[] = [
  { frase: () => 'Fuori progetto: i «cinque minuti» che non sono mai cinque.' },
  { frase: () => 'Richieste veloci, extra, favori. Poi però esistono.' },
  { frase: () => 'Quelle che non stanno in nessun piano, ma tocca farle.' },
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
  { frase: () => 'Qui c\'è quello che ti riguarda. Il resto può aspettare.' },
  { frase: () => 'Un altro giorno, un altro elenco. Andiamo.' },
  { quando: mattina, frase: () => 'Buongiorno. Il caffè è tuo, le scadenze pure.' },
  { quando: pomeriggio, frase: () => 'Pomeriggio: l\'ora in cui le task diventano improvvisamente urgenti.' },
  { quando: sera, frase: () => 'È tardi. Chiudi una cosa e vai, che domani c\'è di nuovo.' },
  { quando: lunedi, frase: () => 'Lunedì. Si riparte, e l\'elenco se lo ricorda tutto.' },
  { quando: venerdi, frase: () => 'Venerdì. Quello che chiudi oggi non ti guarda male domenica sera.' },
  { quando: weekend, frase: () => 'È weekend e sei qui. Ammirevole, e un filo preoccupante.' },
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
