/**
 * §360 — i fatti della persona, e il contratto con cui un modello può scriverci
 * sopra una riga.
 *
 * §352 ha messo sotto «Ciao, nome 👋» una frase che guarda i numeri di chi
 * legge. Le frasi però sono scritte a mano: una quarantina, e dopo un mese si
 * riconoscono tutte. Qui si prepara il passo dopo — la riga la scrive un
 * modello — senza rinunciare alla sola cosa che in questo progetto non si
 * negozia: **un numero plausibile e sbagliato è la sola categoria di errore che
 * nessuno va a controllare.**
 *
 * La difesa non è un controllo, è la forma del dato. Il modello **non scrive
 * cifre**: scrive segnaposto (`{late}`, `{collega1}`), e i valori li mette
 * `rendi()` leggendo i fatti. Un modello che sbaglia un numero non produce una
 * riga sbagliata: produce una riga che `validaTemplate()` rifiuta, e al suo
 * posto va il testo deterministico di `task-mood.ts`. Il peggio che può
 * succedere è il presente.
 *
 * Tre regole che il gate controlla una per una:
 *
 * - **niente cifre nel template.** Non «quasi nessuna»: zero. È l'unica regola
 *   che non ha casi limite da discutere, ed è per questo che regge;
 * - **niente nomi fuori dalla rosa.** Un modello che cita un collega con cui
 *   non condividi niente ha inventato un rapporto, ed è peggio di un numero
 *   sbagliato perché sembra vero;
 * - **la presenza non si rinfaccia.** `assenteDaGiorni` esiste per dire
 *   «bentornato», mai «dove eri». Lo stesso dato letto come sorveglianza costa
 *   più di quanto qualunque frase possa rendere.
 *
 * Questo file non chiama nessun modello e non tocca il database: prende righe
 * grezze e restituisce fatti. Gate: `npx tsx lib/person-copy.check.ts`.
 */

import { nomeFestivo } from './calendario-lavorativo'
import { compleannoTwoBee, prossima } from './ricorrenze-azienda'
import { VIETATE } from './voce-twobee'
import { situazione, type Ruolo, type Situazione, type StatoPersona } from './task-mood'

const DAY = 86400000
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const giorniTra = (da: string, a: string) => Math.round((utc(a) - utc(da)) / DAY)

// ── i fatti ──────────────────────────────────────────────────────────────────

/**
 * `id` non finisce mai in una riga: serve a sapere chi è assente senza passare
 * dal nome. Due Marco in azienda sono una possibilità concreta, e un omonimo
 * che manda in ferie il collega sbagliato è il genere di errore che si nota
 * solo quando lo legge la persona giusta.
 */
export type Collega = { id: string; nome: string; task: number }

/**
 * Tutto quello che si sa della persona oggi, e **solo** quello che è un fatto.
 *
 * Niente inferenze: «tre task aperte con Toto» sta qui, «il rapporto con Toto»
 * no — non è nel database, la costruiremmo dalla co-occorrenza delle task, e
 * sarebbe la misura di una relazione fra un dipendente e un socio ricavata da
 * un dato raccolto per tutt'altro.
 */
export type FattiPersona = {
  /** chi è: non finisce mai in una riga, serve a sapere su quale riga scriverla */
  profileId: string
  nome: string
  ruolo: Ruolo
  /** il giorno a cui i fatti si riferiscono, ISO: il seme e la cache stanno su questo */
  oggi: string

  // carico — gli stessi numeri che §352 già mostra
  aperte: number
  late: number
  scadonoOggi: number
  chiuseOggi: number
  chiuseSettimana: number
  /** progetti di cui è manager */
  progetti: number

  // tempo in azienda
  anzianitaMesi: number | null
  /** anni compiuti **oggi**, se oggi è l'anniversario di assunzione: altrimenti null */
  anniversario: number | null
  primoGiorno: boolean
  /** anni che compie **oggi**, se oggi è il suo compleanno */
  compleanno: number | null
  /** anni che TwoBee compie al prossimo giro, se è entro quattordici giorni */
  twobeeAnni: number | null
  twobeeInGiorni: number | null

  // assenze proprie
  /** giorni alle prossime ferie approvate; 0 = cominciano oggi, null = non ce ne sono */
  ferieInGiorni: number | null
  ferieDurata: number | null
  /** giorni dall'ultimo accesso, solo se ≥ 2. Vale per il bentornato, mai per il rimprovero */
  assenteDaGiorni: number | null

  // calendario
  festivo: string | null
  festivoInGiorni: number | null
  /** il festivo cade di martedì o giovedì: c'è un ponte da prendere */
  ponte: boolean

  // colleghi
  /** con chi ha task aperte in comune, dal più condiviso; al massimo tre */
  colleghi: Collega[]
  /** colleghi con cui condivide task e che oggi sono assenti */
  colleghiAssenti: string[]
}

// ── derivazione, su righe grezze ─────────────────────────────────────────────

export type RigaTask = {
  id: string
  status: string
  due_date: string | null
  completed_at: string | null
}
export type RigaAssegnazione = { task_id: string; profile_id: string }
export type RigaProfilo = { id: string; full_name: string | null }
/** un'assenza già normalizzata da `lib/leave-calendar.ts` */
export type RigaAssenza = { profileId: string; from: string; to: string }

export type Carico = Pick<
  FattiPersona,
  'aperte' | 'late' | 'scadonoOggi' | 'chiuseOggi' | 'chiuseSettimana'
>

/**
 * Gli stessi conteggi che `app/(workspace)/workspace/page.tsx` fa già in linea.
 * Qui stanno una volta sola perché il precalcolo notturno e la pagina devono
 * dire lo stesso numero: due conteggi scritti due volte divergono, e la prima
 * volta che succede nessuno se ne accorge.
 */
export function carico(tasks: RigaTask[], oggi: string): Carico {
  const settimanaFa = iso(utc(oggi) - 7 * DAY)
  const aperte = tasks.filter(t => t.status !== 'completato')
  const chiuse = tasks.filter(t => t.status === 'completato' && t.completed_at)
  return {
    aperte: aperte.length,
    late: aperte.filter(t => t.due_date && t.due_date < oggi).length,
    scadonoOggi: aperte.filter(t => t.due_date === oggi).length,
    chiuseOggi: chiuse.filter(t => (t.completed_at ?? '').slice(0, 10) === oggi).length,
    chiuseSettimana: chiuse.filter(t => (t.completed_at ?? '').slice(0, 10) >= settimanaFa).length,
  }
}

/**
 * Chi lavora sulle stesse task aperte. Si contano le **task condivise**, non le
 * assegnazioni: una task con quattro persone sopra vale uno a testa, altrimenti
 * il collega più presente sarebbe sempre quello dei progetti affollati.
 *
 * Il nome è il primo nome, perché è così che ci si chiama qui e perché un
 * cognome in una riga di saluto suona come una convocazione.
 */
export function colleghiDiTask(
  taskAperteMie: string[],
  assegnazioni: RigaAssegnazione[],
  profili: RigaProfilo[],
  ioId: string,
  max = 3,
): Collega[] {
  const mie = new Set(taskAperteMie)
  const nomi = new Map(profili.map(p => [p.id, (p.full_name ?? '').split(' ')[0]]))
  const conta = new Map<string, number>()
  for (const a of assegnazioni) {
    if (a.profile_id === ioId || !mie.has(a.task_id)) continue
    conta.set(a.profile_id, (conta.get(a.profile_id) ?? 0) + 1)
  }
  return Array.from(conta.entries())
    .map(([id, task]) => ({ id, nome: nomi.get(id) ?? '', task }))
    .filter(c => c.nome.length > 0)
    // a parità di task l'ordine alfabetico, o la riga cambierebbe da sola
    .sort((a, b) => b.task - a.task || a.nome.localeCompare(b.nome))
    .slice(0, max)
}

/**
 * Il prossimo giorno in cui non si lavora, entro `entro` giorni.
 *
 * Il ponte è martedì o giovedì: è l'unica informazione che cambia il
 * comportamento di qualcuno la settimana prima, e per questo vale la pena
 * dirla. Un festivo di sabato non è una notizia.
 */
export function prossimoFestivo(oggi: string, entro = 21): {
  nome: string
  inGiorni: number
  ponte: boolean
} | null {
  for (let i = 0; i <= entro; i++) {
    const g = iso(utc(oggi) + i * DAY)
    const nome = nomeFestivo(g)
    if (!nome) continue
    const dow = new Date(utc(g)).getUTCDay()
    if (dow === 0 || dow === 6) continue
    return { nome, inGiorni: i, ponte: dow === 2 || dow === 4 }
  }
  return null
}

export function anzianita(hireDate: string | null, oggi: string): {
  anzianitaMesi: number | null
  anniversario: number | null
  primoGiorno: boolean
} {
  if (!hireDate) return { anzianitaMesi: null, anniversario: null, primoGiorno: false }
  const anni = Number(oggi.slice(0, 4)) - Number(hireDate.slice(0, 4))
  /* Sul calendario, non dividendo i giorni per 30,44: due anni esatti facevano
     23 mesi, e «sei qui da 23 mesi» il giorno del secondo anniversario è il
     genere di numero che nessuno va a controllare ma che tutti notano. */
  const mesi = Math.max(0,
    anni * 12
    + (Number(oggi.slice(5, 7)) - Number(hireDate.slice(5, 7)))
    - (Number(oggi.slice(8, 10)) < Number(hireDate.slice(8, 10)) ? 1 : 0))
  return {
    anzianitaMesi: mesi,
    // §361: «è la ricorrenza di oggi?» la risponde `prossima`, qui e per tutte le altre
    anniversario: prossima(hireDate, oggi, 0)?.anni ?? null,
    primoGiorno: hireDate === oggi,
  }
}

/** giorni dall'ultimo accesso, solo da 2 in su: sotto è rumore, non un'assenza */
export function assenzaDa(lastSeenAt: string | null, oggi: string): number | null {
  if (!lastSeenAt) return null
  const g = giorniTra(lastSeenAt.slice(0, 10), oggi)
  return g >= 2 ? g : null
}

export type IngressoFatti = {
  profilo: { id: string; full_name: string | null; app_role: Ruolo; hire_date: string | null; birth_date: string | null; last_seen_at: string | null }
  oggi: string
  tasks: RigaTask[]
  assegnazioni: RigaAssegnazione[]
  profili: RigaProfilo[]
  assenze: RigaAssenza[]
  progetti: number
}

export function fattiPersona(i: IngressoFatti): FattiPersona {
  const { profilo: p, oggi } = i
  const aperteMie = i.tasks.filter(t => t.status !== 'completato').map(t => t.id)
  const colleghi = colleghiDiTask(aperteMie, i.assegnazioni, i.profili, p.id)

  const mieFerie = i.assenze
    .filter(a => a.profileId === p.id && a.to >= oggi)
    .sort((a, b) => a.from.localeCompare(b.from))[0]
  const assentiOggi = new Set(
    i.assenze.filter(a => a.from <= oggi && a.to >= oggi).map(a => a.profileId),
  )
  const festa = prossimoFestivo(oggi)
  const tb = compleannoTwoBee(oggi)

  return {
    profileId: p.id,
    nome: (p.full_name ?? '').split(' ')[0],
    ruolo: p.app_role,
    oggi,
    ...carico(i.tasks, oggi),
    progetti: i.progetti,
    ...anzianita(p.hire_date, oggi),
    compleanno: prossima(p.birth_date, oggi, 0)?.anni ?? null,
    twobeeAnni: tb?.anni ?? null,
    twobeeInGiorni: tb ? tb.inGiorni : null,
    ferieInGiorni: mieFerie ? Math.max(0, giorniTra(oggi, mieFerie.from)) : null,
    ferieDurata: mieFerie ? giorniTra(mieFerie.from, mieFerie.to) + 1 : null,
    assenteDaGiorni: assenzaDa(p.last_seen_at, oggi),
    festivo: festa?.nome ?? null,
    festivoInGiorni: festa?.inGiorni ?? null,
    ponte: festa?.ponte ?? false,
    colleghi,
    colleghiAssenti: colleghi.filter(c => assentiOggi.has(c.id)).map(c => c.nome),
  }
}

// ── il contratto dei segnaposto ──────────────────────────────────────────────

/**
 * L'elenco **chiuso** di quello che il modello può nominare. Una chiave che non
 * è qui è un errore del modello, non un'estensione: se serve un fatto nuovo si
 * aggiunge qui e nel prompt insieme, o il gate lo boccia.
 */
export const CHIAVI = [
  'nome', 'aperte', 'late', 'oggi', 'chiuseOggi', 'chiuseSettimana', 'progetti',
  'anzianitaMesi', 'anniversario', 'compleanno', 'twobeeAnni', 'twobeeGiorni',
  'ferieGiorni', 'ferieDurata', 'assenteDa',
  'festivo', 'festivoGiorni', 'collega1', 'collega1Task', 'collega2', 'collega2Task',
] as const
export type Chiave = (typeof CHIAVI)[number]

/** i valori di oggi; `null` = fatto assente, quindi segnaposto non usabile */
export function valori(f: FattiPersona): Record<Chiave, string | number | null> {
  return {
    nome: f.nome || null,
    aperte: f.aperte,
    late: f.late,
    oggi: f.scadonoOggi,
    chiuseOggi: f.chiuseOggi,
    chiuseSettimana: f.chiuseSettimana,
    progetti: f.progetti,
    anzianitaMesi: f.anzianitaMesi,
    anniversario: f.anniversario,
    compleanno: f.compleanno,
    twobeeAnni: f.twobeeAnni,
    twobeeGiorni: f.twobeeInGiorni,
    ferieGiorni: f.ferieInGiorni,
    ferieDurata: f.ferieDurata,
    assenteDa: f.assenteDaGiorni,
    festivo: f.festivo,
    festivoGiorni: f.festivoInGiorni,
    collega1: f.colleghi[0]?.nome ?? null,
    collega1Task: f.colleghi[0]?.task ?? null,
    collega2: f.colleghi[1]?.nome ?? null,
    collega2Task: f.colleghi[1]?.task ?? null,
  }
}

/**
 * I contatori: a zero non sono un fatto, sono l'**assenza** di un fatto. Offrire
 * `{oggi}` quando vale zero invita a scrivere «0 scadono oggi» — vero, e
 * inutile da leggere. La scena dice già che non c'è niente in scadenza; una
 * riga senza segnaposto è una riga valida.
 *
 * I conti alla rovescia stanno fuori apposta: `{ferieGiorni}` a zero vuol dire
 * **oggi**, ed è la cosa migliore che quella persona legga tutto l'anno.
 * `{festivoGiorni}` a zero vuol dire che oggi è festa. `{anzianitaMesi}` a zero
 * vuol dire che è appena arrivata. Nessuno dei tre è un vuoto.
 */
const CONTATORI: Chiave[] = [
  'aperte', 'late', 'oggi', 'chiuseOggi', 'chiuseSettimana', 'progetti',
  'collega1Task', 'collega2Task',
]

/**
 * I segnaposto usabili oggi. È **una funzione sola** perché il prompt offre e
 * il validatore pretende: se le due liste divergessero, chiederemmo al modello
 * una parola per poi buttargliela indietro.
 */
export function chiaviOfferte(f: FattiPersona): Chiave[] {
  const v = valori(f)
  return CHIAVI.filter(k => v[k] !== null && !(CONTATORI.includes(k) && v[k] === 0))
}

/**
 * `{late}` è il numero. `{late|scaduta|scadute}` è **la parola che lo
 * accompagna**, scelta dal codice sul valore.
 *
 * Non è una raffinatezza: il template è scritto la notte e il numero cambia
 * durante il giorno, quindi «una scaduta» scritto quando ne aveva una diventa
 * «5 scaduta» nel pomeriggio. La concordanza non può stare nel testo fisso per
 * la stessa ragione per cui non ci sta il numero — e la si toglie al modello
 * per lo stesso motivo: non perché sbagli, perché non può saperlo.
 */
const SEGNAPOSTO = /\{([a-zA-Z0-9]+)(?:\|([^|{}]+)\|([^|{}]+))?\}/g

/** le chiavi il cui valore è un numero: le uniche che possono reggere una concordanza */
const NUMERICHE: Chiave[] = [
  'aperte', 'late', 'oggi', 'chiuseOggi', 'chiuseSettimana', 'progetti',
  'anzianitaMesi', 'anniversario', 'compleanno', 'twobeeAnni', 'twobeeGiorni',
  // `festivoGiorni` mancava: una chiave numerica fuori da qui non può reggere
  // una concordanza, e il validatore rifiutava una frase corretta
  'festivoGiorni', 'ferieGiorni', 'ferieDurata', 'assenteDa', 'collega1Task', 'collega2Task',
]

/**
 * §363 — **il vocabolario di una superficie.**
 *
 * Le regole (niente cifre, niente nomi inventati, niente tag, la concordanza)
 * valgono per ogni riga che un modello scrive in questo prodotto. Le **parole**
 * no: il saluto parla di scadute e colleghi, «Le mie attività» parla della task
 * più vecchia e di chi va in ferie mentre la sua milestone scade.
 *
 * Copiare il validatore per la seconda superficie avrebbe prodotto due regole
 * dove ne serve una — e una regola scritta due volte è il posto dove la prossima
 * modifica ne aggiorna una sola. Quindi le regole stanno qui, una volta, e ogni
 * superficie porta il suo vocabolario.
 */
export type Vocabolario = {
  /** tutte le chiavi che questa superficie conosce, anche quelle vuote oggi */
  dichiarate: string[]
  /** i valori di adesso; `null` = fatto assente, quindi segnaposto non offerto */
  valori: Record<string, string | number | null>
  /** le chiavi il cui valore è un numero: le sole che reggono una concordanza */
  numeriche: string[]
  /** i contatori: a zero non sono un fatto, sono l'assenza di un fatto */
  contatori: string[]
  /** i nomi propri che la riga può contenere */
  citabili: string[]
  /** i nomi di tutta l'azienda: uno fuori dai citabili è un rapporto inventato */
  rosa: string[]
}

/** i segnaposto usabili adesso: niente fatti assenti, niente contatori a zero */
export function offerte(v: Vocabolario): string[] {
  return v.dichiarate.filter(k =>
    v.valori[k] !== null && v.valori[k] !== undefined
    && !(v.contatori.includes(k) && v.valori[k] === 0))
}

/** sostituisce i segnaposto; le chiavi non risolte restano visibili apposta */
export function rendiCon(tpl: string, v: Vocabolario): string {
  return tpl.replace(SEGNAPOSTO, (intero, k: string, sing?: string, plur?: string) => {
    const val = v.valori[k]
    if (val === null || val === undefined) return intero
    // con le due forme esce **la parola**, non il numero: il numero ha il suo segnaposto
    if (sing && plur) return val === 1 ? sing : plur
    return String(val)
  })
}

/** i plurali che compaiono in queste frasi: al singolare cambiano, e si sente */
const PLURALI = 'scadute|aperte|chiuse|nuove|giorni|progetti|anni|mesi|volte|ore|consegne|riunioni|cose|persone|colleghi|task aperte'

/** `{late} scadute` è giusto a cinque e sbagliato a uno: il modello deve dichiarare le due forme */
const concordanzaNuda = (numeriche: string[]) =>
  new RegExp(`\\{(${numeriche.join('|')})\\}\\s+(${PLURALI})\\b`, 'i')

/** i segnaposto usati nel template, in ordine di apparizione e senza ripetizioni */
export function chiaviUsate(tpl: string): string[] {
  return Array.from(new Set(Array.from(tpl.matchAll(SEGNAPOSTO)).map(m => m[1])))
}

/** sostituisce i segnaposto coi valori; le chiavi non risolte restano visibili apposta */
export function rendi(tpl: string, f: FattiPersona): string {
  const v = valori(f)
  return tpl.replace(SEGNAPOSTO, (intero, k: string, sing?: string, plur?: string) => {
    const val = v[k as Chiave]
    if (val === null || val === undefined) return intero
    // con le due forme esce **la parola**, non il numero: il numero ha il suo segnaposto
    if (sing && plur) return val === 1 ? sing : plur
    return String(val)
  })
}

// ── il validatore ────────────────────────────────────────────────────────────

/** la riga sta sotto un h1 e sopra il resto: oltre, va a capo e smette di essere un saluto */
export const MAX_CARATTERI = 118

/**
 * §359 — TwoBee è una società di consulenza digitale. La parola resta legittima
 * sugli altri, ma in una riga che parla a un dipendente non c'è nessun altro.
 */
const BANDITE: { schema: RegExp; motivo: string }[] = [
  { schema: /\bagenzi[ae]\b/i, motivo: 'TwoBee non è un\'agenzia (§359)' },
  { schema: /\b(licenzi|stipendi|fatturat|margin|compens)\w*/i, motivo: 'la riga non parla di soldi né di posto di lavoro' },
  /* §365 — il resto arriva dalla voce del marchio, dove il divieto sta accanto
     alla ragione. Qui si applica, là si decide: se l'elenco vivesse in due
     posti, il prompt e il controllo direbbero due cose diverse al primo ritocco. */
  ...VIETATE,
]

/** parole che trasformano il bentornato in un richiamo */
const RIMPROVERO = /\b(spariti?|spariti|sparit\w+|latitan\w+|dove eri|dove erav|finalmente ti|non ti si vede|ti degni)\b/i

/**
 * I nomi propri che una riga può contenere. È l'elenco che il validatore
 * applica **e** quello che il prompt può offrire: tenerli separati vorrebbe
 * dire chiedere al modello un nome che poi si rifiuta.
 */
export function nomiCitabili(f: FattiPersona): string[] {
  return Array.from(new Set([f.nome, ...f.colleghi.map(c => c.nome), ...f.colleghiAssenti]
    .filter(n => n.length > 0)))
}

export type Verdetto = { ok: true; testo: string } | { ok: false; motivo: string }

export type ContestoValidazione = {
  /** i nomi propri di tutta l'azienda: un nome citato fuori dai colleghi è un rapporto inventato */
  rosa: string[]
}

/**
 * Il controllo gira sul **template**, prima di interpolare, perché è lì che la
 * regola è netta: se non ci sono cifre, non ci possono essere cifre sbagliate.
 * Dopo l'interpolazione si ricontrolla solo quello che dipende dai valori — la
 * lunghezza — perché `{chiuseSettimana}` occupa quindici caratteri e `12` due.
 */
export function valida(tpl: string, v: Vocabolario): Verdetto {
  const t = tpl.trim()
  if (!t) return { ok: false, motivo: 'riga vuota' }
  if (t.includes('\n')) return { ok: false, motivo: 'più di una riga' }

  const senzaChiavi = t.replace(SEGNAPOSTO, '')
  if (/\d/.test(senzaChiavi)) {
    return { ok: false, motivo: 'cifre scritte a mano: i numeri passano dai segnaposto' }
  }
  if (/\b(due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\s+(task|progett|client|giorn|scadenz|attività|consegn|ore\b)/i.test(senzaChiavi)) {
    return { ok: false, motivo: 'quantità scritta in lettere: usa il segnaposto' }
  }
  /* `<` e `>` non compaiono in nessun saluto italiano, e compaiono in ogni tag:
     senza questo controllo «<think>» passava tutto — niente cifre, niente nomi,
     niente parole bandite — e finiva sotto il nome di un collega. Un validatore
     che accetta una cosa che non è una frase non sta validando. */
  if (/[*_#`~<>]|\[[^\]]*\]\(/.test(t)) return { ok: false, motivo: 'formattazione o tag: è testo semplice' }
  if (t.replace(SEGNAPOSTO, 'X').length < 15) return { ok: false, motivo: 'troppo corta per essere una frase' }
  // coppie surrogate (tutto il piano astrale) + i simboli BMP: il flag `u` non
  // è disponibile col target di questo progetto
  if (/[\uD800-\uDBFF][\uDC00-\uDFFF]|[☀-➿⬀-⯿️]/.test(t)) {
    return { ok: false, motivo: 'emoji: ce n\'è già una nel titolo' }
  }

  const nuda = concordanzaNuda(v.numeriche)
  if (nuda.test(t)) {
    const m = t.match(nuda)
    return {
      ok: false,
      motivo: `«${m?.[0].trim()}» è sbagliato quando il numero è uno: scrivi {${m?.[1]}} {${m?.[1]}|singolare|plurale}`,
    }
  }
  for (const m of Array.from(t.matchAll(SEGNAPOSTO))) {
    if (m[2] && !v.numeriche.includes(m[1])) {
      return { ok: false, motivo: `{${m[1]}} non è un numero: non ha singolare e plurale` }
    }
  }

  const usabili = offerte(v)
  for (const k of chiaviUsate(t)) {
    if (!v.dichiarate.includes(k)) return { ok: false, motivo: `segnaposto sconosciuto: {${k}}` }
    if (!usabili.includes(k)) return { ok: false, motivo: `fatto non offerto oggi: {${k}}` }
  }

  for (const b of BANDITE) if (b.schema.test(t)) return { ok: false, motivo: b.motivo }

  /* Un nome della rosa che non è né suo né di un collega di cui gli abbiamo
     parlato. `colleghiAssenti` è già dentro `colleghi` per costruzione, ma sta
     scritto lo stesso: il prompt li nomina, e ogni nome che entra nel prompt
     deve essere un nome che qui passa — altrimenti si chiede al modello di
     usare una parola che poi si rifiuta. Gate: `nomiCitabili`. */
  const ammessi = new Set(v.citabili.map(n => n.toLowerCase()))
  for (const n of v.rosa) {
    const scritto = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)
    if (scritto && !ammessi.has(n.toLowerCase())) {
      return { ok: false, motivo: `cita ${n}, con cui non condivide task aperte` }
    }
  }

  if (chiaviUsate(t).includes('assenteDa') && RIMPROVERO.test(t)) {
    return { ok: false, motivo: 'l\'assenza si saluta, non si rinfaccia' }
  }

  const reso = rendiCon(t, v)
  if (reso.length > MAX_CARATTERI) {
    return { ok: false, motivo: `${reso.length} caratteri, il massimo è ${MAX_CARATTERI}` }
  }
  return { ok: true, testo: reso }
}

/**
 * Il giorno su cui è indicizzata la riga, **sempre a Roma**.
 *
 * `oggiLocale()` legge il fuso del processo, e nel container è UTC: fra
 * mezzanotte e le due di notte il server è ancora al giorno prima. Il cron
 * delle 05:30 non se ne accorgerebbe mai, ma chi rilancia il giro a mezzanotte
 * e un quarto — cioè chi sta sistemando il prompt — scriverebbe sulla riga di
 * ieri e non capirebbe perché la pagina non cambia. Scrittura e lettura
 * chiedono la data alla stessa funzione, o non si incontrano.
 */
export function giornoAzienda(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })
}

/**
 * Il vocabolario del **saluto**: i fatti della persona, nella forma che le
 * regole condivise capiscono. Gli altri usi di `valida` portano il proprio.
 */
export function vocabolarioSaluto(f: FattiPersona, rosa: string[] = []): Vocabolario {
  return {
    dichiarate: [...CHIAVI],
    valori: valori(f),
    numeriche: NUMERICHE,
    contatori: CONTATORI,
    citabili: nomiCitabili(f),
    rosa,
  }
}

/** la firma di sempre, sopra le regole condivise: i chiamanti del saluto non cambiano */
export function validaTemplate(tpl: string, f: FattiPersona, ctx: ContestoValidazione): Verdetto {
  return valida(tpl, vocabolarioSaluto(f, ctx.rosa))
}

// ── il lato lettura ──────────────────────────────────────────────────────────

/**
 * I fatti nella forma che `task-mood.ts` conosce. Sta qui, e non in ogni
 * chiamante, perché il precalcolo notturno e la pagina devono chiedere la
 * **stessa** situazione: se la mappatura la scrivessero in due, basterebbe un
 * campo in più perché la riga scritta la notte non venisse mai mostrata, e
 * nessuno saprebbe perché.
 */
export function statoDa(f: FattiPersona): StatoPersona {
  return {
    aperte: f.aperte, late: f.late, oggi: f.scadonoOggi,
    chiuseOggi: f.chiuseOggi, chiuseSettimana: f.chiuseSettimana,
    progetti: f.progetti, ruolo: f.ruolo,
  }
}

export const scenaDi = (f: FattiPersona): Situazione => situazione(statoDa(f))

/**
 * La riga da mostrare adesso, o `null` per tornare al testo deterministico.
 *
 * Il template è di stamattina, i numeri sono di **adesso**: è tutto il motivo
 * per cui si salva un template invece di una frase finita. Ma la frase era
 * stata scritta per una scena, e la scena può cambiare durante il giorno —
 * quindi ci sono tre modi di ritirarsi, e nessuno dei tre è un guasto:
 *
 * - **non c'è niente per oggi**: il cron non è ancora passato, o la persona è
 *   arrivata stanotte;
 * - **la scena è cambiata**: chi aveva quattro scadute alle sette ne ha zero
 *   alle quattro, e «{late} in ritardo» diventa «0 in ritardo» — una frase che
 *   dice il vero e suona falsa. Non si adatta: si ritira;
 * - **il template non passa più il validatore**: il collega citato ha chiuso
 *   l'ultima task condivisa, e `{collega1}` non ha più un valore. Meglio una
 *   frase deterministica che un segnaposto in faccia a qualcuno.
 */
/**
 * I fatti di stamattina con sopra i conteggi di adesso.
 *
 * Non tutto invecchia alla stessa velocità, ed è il motivo per cui la pagina
 * non rifa il giro completo a ogni apertura. **Le task si muovono durante il
 * giorno**: una chiusa a mezzogiorno cambia tre numeri. Il nome di un collega,
 * la data delle ferie, un compleanno — no: sono gli stessi alle sette e alle
 * diciannove, e riandarli a prendere vorrebbe dire cinque query in più su ogni
 * apertura del workspace per riottenere le stesse righe.
 *
 * Il prezzo, dichiarato: `colleghi[].task` è il conto di stamattina. Se alle
 * quattro ne avete chiusa una insieme, la riga dice ancora quella di prima.
 * Vale la pena, perché il numero che qualcuno va a ricontrollare è quello
 * delle **proprie** scadute, non quello delle task condivise.
 */
export function conCaricoFresco(salvati: FattiPersona, ora: Carico): FattiPersona {
  return { ...salvati, ...ora }
}

/**
 * I fatti come tornano dal database. Solo il nostro cron scrive su quella
 * tabella — non c'è policy di scrittura — ma una riga di due settimane fa è
 * stata scritta da una versione precedente di questo file: se le manca un
 * campo non si va in errore, si torna al testo deterministico.
 */
export function leggiFatti(json: unknown): FattiPersona | null {
  if (!json || typeof json !== 'object') return null
  const f = json as Partial<FattiPersona>
  const interi: (keyof FattiPersona)[] = ['aperte', 'late', 'scadonoOggi', 'chiuseOggi', 'chiuseSettimana', 'progetti']
  if (typeof f.nome !== 'string' || !Array.isArray(f.colleghi)) return null
  if (interi.some(k => typeof f[k] !== 'number')) return null
  return f as FattiPersona
}

export function rigaDiOggi(
  salvata: { template: string; situazione: string } | null,
  f: FattiPersona,
  ctx: ContestoValidazione,
): string | null {
  if (!salvata || salvata.situazione !== scenaDi(f)) return null
  const r = validaTemplate(salvata.template, f, ctx)
  return r.ok ? r.testo : null
}
