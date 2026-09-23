/**
 * §410 — quanto tempo si passa dentro il tool, misurato sulle interazioni.
 *
 * La domanda è «chi lavora nel tool, quanto, e da quanto non entra». La risposta
 * facile — un tab aperto, una sessione di login — è quella sbagliata: una scheda
 * dimenticata la mattina dice «online» fino a sera, e il tempo fra login e
 * logout conta le riunioni, il pranzo e la notte. Quello che si misura qui sono
 * i **minuti in cui è successo qualcosa**: il browser conta click, tasti,
 * rotella e cambi di pagina, e manda un battito solo se ne ha contata almeno una
 * nel minuto passato, solo se la scheda è in primo piano. Niente interazioni,
 * niente battito: il tempo non avanza.
 *
 * Da lì le due misure, e la loro differenza è l'informazione:
 *   · **attivo** = battiti × un minuto. Risponde a «quanto ha lavorato».
 *   · **durata** = dal primo all'ultimo battito. È la finestra in cui la
 *     sessione è avvenuta, comprese le pause corte. Serve al contesto
 *     («dalle 9:12 alle 10:40»), non al conto.
 *
 * `attivo ≤ durata` sempre, e quanto le due si allontanano dice quanto la
 * sessione era fatta di pause.
 *
 * Qui dentro non c'è nessuna query: sono funzioni pure, verificate da
 * `lib/presenza.check.ts`. La scrittura sta nella migration 252, la lettura
 * nella pagina del super admin.
 */

/** Ogni battito vale il minuto che lo precede: è la finestra che il client usa. */
export const INTERVALLO_BEAT_MS = 60_000

/**
 * Dopo questo silenzio la sessione è finita: il battito successivo ne apre una
 * nuova. **Lo stesso numero è nella migration 252** (`interval '15 minutes'`) —
 * il controllo legge il file SQL e confronta, perché una regola scritta due
 * volte non è una regola.
 */
export const GAP_SESSIONE_MIN = 15

/**
 * «Online adesso». Un battito arriva ogni minuto **se** c'è interazione: chi sta
 * leggendo una pagina lunga senza toccare niente non manda niente. Tre minuti
 * direbbero offline a chi sta solo leggendo; quindici sarebbero la sessione
 * intera. Cinque è la finestra in cui «è al tool» è ancora vero.
 */
export const ONLINE_MS = 5 * 60_000

/** Quante sessioni si mostrano per persona. */
export const SESSIONI_MOSTRATE = 5

/**
 * §412 — la data da cui la cronologia è di nuovo completa.
 *
 * La colonna delle modifiche legge `activity_log`, e quel registro era **cieco
 * sulle task**: la migration 144 ha droppato il dominio progetti con `CASCADE`
 * — che porta via anche i trigger — e la 147 l'ha ricostruito senza rimettere
 * `trg_log_tasks` e `trg_log_projects`. Dal 20 luglio 2026 al giorno qui sotto
 * chi lavora in workspace ha mosso task ogni giorno senza lasciare una riga.
 *
 * La 253 rimette i trigger, ma **il passato non si ricostruisce**: una finestra
 * che comincia prima di questa data conta solo una parte delle modifiche, e uno
 * zero lì dentro non vuol dire «non ha fatto niente». Si dichiara, non si mostra.
 */
export const CRONOLOGIA_COMPLETA_DA = '2026-09-23'

export type StatoPresenza = 'online' | 'offline' | 'mai'

/** La riga come arriva dal database (migration 252). */
export type SessioneRow = {
  id: string
  profile_id: string
  portale: string
  started_at: string
  last_beat_at: string
  beats: number
  interactions: number
  last_route: string | null
  sezioni: Record<string, number> | null
}

export type TotaliRow = {
  profile_id: string
  sessioni: number
  battiti: number
  interazioni: number
  azioni: number
  ultima_azione: string | null
}

export type SessioneVista = {
  id: string
  portale: string
  inizio: string
  fine: string
  attivoMs: number
  durataMs: number
  interazioni: number
  sezione: string | null
}

export type PersonaUtilizzo = {
  profileId: string
  stato: StatoPresenza
  ultimoBattito: string | null
  /** Da quanto non tocca niente. `null` se non è mai entrato. */
  assenteMs: number | null
  /** Le ultime sessioni, la più recente per prima. */
  sessioni: SessioneVista[]
  attivoUltimeMs: number
  interazioniUltime: number
  /** La finestra lunga (di solito 30 giorni) — arriva già aggregata dal DB. */
  sessioniFinestra: number
  attivoFinestraMs: number
  interazioniFinestra: number
  /** Righe di cronologia scritte nella finestra: il lavoro lasciato sui dati. */
  azioni: number
  ultimaAzione: string | null
  sezioniTop: { sezione: string; battiti: number }[]
}

const ms = (iso: string | null | undefined) => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/** I minuti in cui è successo qualcosa. */
export function attivoMs(beats: number): number {
  return Math.max(0, Math.trunc(beats)) * INTERVALLO_BEAT_MS
}

/**
 * La finestra della sessione. Il primo battito arriva a fine minuto, quindi
 * `fine - inizio` è zero su una sessione di un solo battito: si aggiunge il
 * minuto che quel battito rappresenta, come si fa per l'attivo. Così una
 * sessione lampo vale un minuto e non zero, e `attivo ≤ durata` resta vero.
 */
export function durataMs(s: Pick<SessioneRow, 'started_at' | 'last_beat_at'>): number {
  const a = ms(s.started_at), b = ms(s.last_beat_at)
  if (a === null || b === null) return 0
  return Math.max(0, b - a) + INTERVALLO_BEAT_MS
}

/** La sezione dove sono finiti più battiti — `null` se la mappa è vuota. */
export function sezionePrincipale(sezioni: Record<string, number> | null | undefined): string | null {
  if (!sezioni) return null
  let vinta: string | null = null
  let max = 0
  for (const [k, v] of Object.entries(sezioni)) {
    const n = Number(v) || 0
    if (n > max) { max = n; vinta = k }
  }
  return vinta
}

export function vistaSessione(s: SessioneRow): SessioneVista {
  return {
    id: s.id,
    portale: s.portale,
    inizio: s.started_at,
    fine: s.last_beat_at,
    attivoMs: attivoMs(s.beats),
    durataMs: durataMs(s),
    interazioni: Math.max(0, s.interactions ?? 0),
    sezione: sezionePrincipale(s.sezioni),
  }
}

export function statoDi(ultimoBattito: string | null, ora: number): StatoPresenza {
  const t = ms(ultimoBattito)
  if (t === null) return 'mai'
  return ora - t <= ONLINE_MS ? 'online' : 'offline'
}

export function assenteMs(ultimoBattito: string | null, ora: number): number | null {
  const t = ms(ultimoBattito)
  if (t === null) return null
  return Math.max(0, ora - t)
}

/** «1h 20m» · «45 min» · «—» quando non c'è niente da dire. */
export function durataTesto(v: number | null | undefined): string {
  if (v === null || v === undefined || v <= 0) return '—'
  const min = Math.round(v / 60_000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Da quanto manca, in parole. `null` = non è mai entrato. */
export function assenzaTesto(v: number | null): string {
  if (v === null) return 'mai entrato'
  const min = Math.floor(v / 60_000)
  if (min < 1) return 'adesso'
  if (min < 60) return `${min} min fa`
  const h = Math.floor(min / 60)
  if (h < 24) return h === 1 ? '1 ora fa' : `${h} ore fa`
  const g = Math.floor(h / 24)
  if (g < 30) return g === 1 ? 'ieri' : `${g} giorni fa`
  const mesi = Math.floor(g / 30)
  return mesi === 1 ? '1 mese fa' : `${mesi} mesi fa`
}

/** Le sezioni più battute, sommando quelle delle sessioni passate. */
export function sezioniTop(sessioni: SessioneRow[], quante = 3): { sezione: string; battiti: number }[] {
  const somma = new Map<string, number>()
  for (const s of sessioni) {
    for (const [k, v] of Object.entries(s.sezioni ?? {})) {
      somma.set(k, (somma.get(k) ?? 0) + (Number(v) || 0))
    }
  }
  return Array.from(somma.entries())
    .map(([sezione, battiti]) => ({ sezione, battiti }))
    .sort((a, b) => b.battiti - a.battiti || a.sezione.localeCompare(b.sezione))
    .slice(0, quante)
}

/**
 * Una riga per persona: presenza, ultime sessioni, totali della finestra.
 *
 * Le persone arrivano **tutte**, anche chi non ha mai fatto un battito: la riga
 * che dice «mai entrato» è quella che si sta cercando quando si apre questa
 * pagina, e una lista costruita partendo dalle sessioni non l'avrebbe.
 */
export function componiUtilizzo(
  profileIds: string[],
  sessioni: SessioneRow[],
  totali: TotaliRow[],
  ora: number,
  quante = SESSIONI_MOSTRATE,
): PersonaUtilizzo[] {
  const perPersona = new Map<string, SessioneRow[]>()
  for (const s of sessioni) {
    const lista = perPersona.get(s.profile_id) ?? []
    lista.push(s)
    perPersona.set(s.profile_id, lista)
  }
  const tot = new Map(totali.map(t => [t.profile_id, t]))

  return profileIds.map((profileId) => {
    const mie = (perPersona.get(profileId) ?? [])
      .slice()
      .sort((a, b) => (ms(b.last_beat_at) ?? 0) - (ms(a.last_beat_at) ?? 0))
      .slice(0, quante)
    const ultimo = mie[0]?.last_beat_at ?? null
    const t = tot.get(profileId)
    return {
      profileId,
      stato: statoDi(ultimo, ora),
      ultimoBattito: ultimo,
      assenteMs: assenteMs(ultimo, ora),
      sessioni: mie.map(vistaSessione),
      attivoUltimeMs: mie.reduce((n, s) => n + attivoMs(s.beats), 0),
      interazioniUltime: mie.reduce((n, s) => n + Math.max(0, s.interactions ?? 0), 0),
      sessioniFinestra: t?.sessioni ?? 0,
      attivoFinestraMs: attivoMs(t?.battiti ?? 0),
      interazioniFinestra: t?.interazioni ?? 0,
      azioni: t?.azioni ?? 0,
      ultimaAzione: t?.ultima_azione ?? null,
      sezioniTop: sezioniTop(mie),
    }
  })
}

/**
 * Prima chi c'è, poi chi c'era da meno tempo, in fondo chi non è mai entrato.
 * Non è un ordine alfabetico per scelta: la domanda che porta qui è «chi manca».
 */
export function ordinaPerPresenza(a: PersonaUtilizzo, b: PersonaUtilizzo): number {
  if (a.stato !== b.stato) {
    const peso = { online: 0, offline: 1, mai: 2 }
    return peso[a.stato] - peso[b.stato]
  }
  if (a.assenteMs === null) return b.assenteMs === null ? 0 : 1
  if (b.assenteMs === null) return -1
  return a.assenteMs - b.assenteMs
}

/**
 * La finestra chiesta copre un periodo in cui il registro non vedeva tutto?
 *
 * Due ragioni, e bastano l'una o l'altra: comincia prima che la cronologia
 * tornasse completa, oppure va più indietro di quanto la cronologia conservi —
 * oltre la conservazione non c'è «zero modifiche», non c'è niente.
 */
export function modificheParziali(finestraDaIso: string, retentionGiorni: number, oraMs: number): boolean {
  const da = Date.parse(finestraDaIso)
  if (Number.isNaN(da)) return true
  if (da < Date.parse(CRONOLOGIA_COMPLETA_DA)) return true
  return retentionGiorni > 0 && oraMs - da > retentionGiorni * 86_400_000
}

export type EtichettaStato = { testo: string; tono: 'online' | 'assente' | 'senza' }

/**
 * Cosa si scrive nella colonna dello stato.
 *
 * «Mai entrato» era la frase sbagliata: per chi non ha sessioni la misura è
 * cominciata ieri, non la sua assenza. La riga dice solo che sessioni non ce ne
 * sono; **da quando** si misura lo dichiara l'intestazione, una volta per tutte,
 * invece di ripeterlo su ogni riga.
 */
export function etichettaStato(
  stato: StatoPresenza, assenteMs: number | null, misuraAttiva: boolean,
): EtichettaStato {
  if (stato === 'online') return { testo: 'online', tono: 'online' }
  if (stato === 'offline') return { testo: assenzaTesto(assenteMs), tono: 'assente' }
  return { testo: misuraAttiva ? 'nessuna sessione' : 'misura non attiva', tono: 'senza' }
}

/**
 * §417 — l'ultimo accesso, che è un fatto diverso dall'ultimo utilizzo.
 *
 * `auth.users.last_sign_in_at` esiste da sempre, anche per chi non è mai stato
 * misurato: è l'unica risposta disponibile a «da quanto non c'è» per il periodo
 * precedente al battito, ed è la ragione per cui sta in questa vista.
 *
 * Ma va chiamato col suo nome. È **l'ultima volta che ha messo le credenziali**,
 * non l'ultima volta che ha lavorato: una sessione dura a lungo e si rinnova da
 * sola, quindi si può usare il tool per mesi senza rifare login. Agostino ne è
 * la prova: accesso il 10 luglio, interazioni oggi. Presentarlo come «ultimo
 * utilizzo» direbbe che è sparito da settantacinque giorni una persona che
 * stava lavorando mezz'ora fa.
 */
export function etichettaAccesso(ultimoAccesso: string | null, ora: number): string {
  const t = ultimoAccesso ? Date.parse(ultimoAccesso) : NaN
  if (Number.isNaN(t)) return 'nessun accesso'
  const g = Math.floor(Math.max(0, ora - t) / 86_400_000)
  if (g === 0) return 'accesso oggi'
  if (g === 1) return 'accesso ieri'
  if (g < 30) return `accesso ${g} giorni fa`
  const mesi = Math.floor(g / 30)
  return mesi === 1 ? 'accesso 1 mese fa' : `accesso ${mesi} mesi fa`
}

/** Il portale da cui arriva il battito, dedotto dall'indirizzo. */
export function portaleDi(pathname: string): 'admin' | 'workspace' | 'portale' | 'risorsa' {
  if (pathname.startsWith('/workspace')) return 'workspace'
  if (pathname.startsWith('/portale')) return 'portale'
  if (pathname.startsWith('/risorsa')) return 'risorsa'
  return 'admin'
}
