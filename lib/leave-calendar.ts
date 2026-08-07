/**
 * §223 · Chi non c'è, e quando — calcoli puri, nessun I/O.
 *
 * Le assenze del team vivono in **due tabelle che non si parlano**:
 *
 *   · `hr_requests` — quello che la persona chiede dal Workspace. Stati in
 *     inglese (`pending`/`approved`/…), e comprende anche tipi che non sono
 *     assenze (una nota spesa, un documento).
 *   · `team_leaves` — il registro che l'admin tiene a mano. Stati in italiano
 *     (`in_attesa`/`approvato`/…), sempre con un intervallo di date.
 *
 * Approvare una richiesta scrive in `calendar_events`, **non** in `team_leaves`:
 * le due tabelle sono indipendenti, quindi normalmente non si sovrappongono. Ma
 * niente impedisce a un admin di registrare a mano la stessa assenza che la
 * persona aveva già chiesto, e in quel caso il calendario mostrerebbe due
 * assenze dove ce n'è una. Per questo si deduplica per (persona, tipo, date).
 *
 * Una domanda sola — «chi manca il 12 agosto?» — non può avere due risposte a
 * seconda di quale tabella si guarda. Qui diventano una lista sola.
 */

export type LeaveStatusView = 'approvata' | 'da approvare' | 'rifiutata'
export type LeaveKind = 'ferie' | 'permesso' | 'malattia' | 'altro'

export type Span = {
  id: string
  source: 'richiesta' | 'registro'
  profileId: string
  kind: LeaveKind
  status: LeaveStatusView
  /** inclusivi, formato YYYY-MM-DD */
  from: string
  to: string
  days: number
  notes: string | null
}

export type RawRequest = {
  id: string; profile_id: string; type: string; status: string
  start_date: string | null; end_date: string | null; notes: string | null
}
export type RawLeave = {
  id: string; user_id: string; type: string; status: string
  start_date: string; end_date: string; notes: string | null; days_count?: number | null
}

const DAY = 86_400_000
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`)
export const addDays = (d: string, n: number) => new Date(utc(d) + n * DAY).toISOString().slice(0, 10)
/** Giorni fra due date, estremi inclusi: dal 10 al 10 è un giorno, non zero. */
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY) + 1

const KIND: Record<string, LeaveKind> = {
  ferie: 'ferie', permesso: 'permesso', malattia: 'malattia',
  straordinario: 'altro', altro: 'altro',
}
const STATUS: Record<string, LeaveStatusView> = {
  approved: 'approvata', approvato: 'approvata',
  pending: 'da approvare', in_attesa: 'da approvare',
  rejected: 'rifiutata', rifiutato: 'rifiutata', cancelled: 'rifiutata',
}

const isDate = (s: string | null | undefined): s is string =>
  Boolean(s) && /^\d{4}-\d{2}-\d{2}$/.test(s as string)

/**
 * Da due tabelle a una lista.
 *
 * Cosa resta fuori, e perché lo si dichiara invece di filtrarlo in silenzio:
 *
 *  · **`spesa` e `documento_hr`** non sono assenze: hanno una data ma nessuno
 *    manca dall'ufficio. In un calendario delle assenze sarebbero rumore.
 *  · **Le righe senza date** — una richiesta appena aperta e non ancora
 *    compilata — non si possono mettere su un calendario.
 *  · **Gli intervalli rovesciati** (fine prima dell'inizio): sul database ce n'è
 *    uno vero, dal 24 agosto al 31 luglio. Non si «aggiusta» scambiando le date,
 *    perché non si sa quale delle due sia quella giusta: si scarta e si conta,
 *    così qualcuno può andare a correggerla.
 */
export function normalize(requests: RawRequest[], leaves: RawLeave[]): {
  spans: Span[]
  /** righe scartate, con la ragione: un calendario che nasconde non si controlla */
  dropped: { id: string; reason: string }[]
} {
  const spans: Span[] = []
  const dropped: { id: string; reason: string }[] = []

  const push = (s: Span, from: string, to: string) => {
    if (utc(to) < utc(from)) {
      dropped.push({ id: s.id, reason: `intervallo rovesciato: ${from} → ${to}` })
      return
    }
    spans.push({ ...s, from, to, days: daysBetween(from, to) })
  }

  for (const r of requests) {
    const kind = KIND[r.type]
    if (!kind) { dropped.push({ id: r.id, reason: `«${r.type}» non è un'assenza` }); continue }
    if (!isDate(r.start_date) || !isDate(r.end_date)) {
      dropped.push({ id: r.id, reason: 'senza date' }); continue
    }
    push({
      id: r.id, source: 'richiesta', profileId: r.profile_id, kind,
      status: STATUS[r.status] ?? 'da approvare', from: '', to: '', days: 0, notes: r.notes,
    }, r.start_date, r.end_date)
  }

  for (const l of leaves) {
    const kind = KIND[l.type] ?? 'altro'
    if (!isDate(l.start_date) || !isDate(l.end_date)) {
      dropped.push({ id: l.id, reason: 'senza date' }); continue
    }
    push({
      id: l.id, source: 'registro', profileId: l.user_id, kind,
      status: STATUS[l.status] ?? 'da approvare', from: '', to: '', days: 0, notes: l.notes,
    }, l.start_date, l.end_date)
  }

  /* Stessa persona, stesso tipo, stesse date: è un'assenza sola registrata due
     volte. Vince la richiesta, perché è quella che la persona ha scritto — il
     registro è una trascrizione. */
  const seen = new Map<string, Span>()
  for (const s of spans.sort((a, b) => (a.source === 'richiesta' ? -1 : 1))) {
    const key = `${s.profileId}|${s.kind}|${s.from}|${s.to}`
    if (!seen.has(key)) seen.set(key, s)
  }

  return {
    spans: Array.from(seen.values()).sort((a, b) => a.from.localeCompare(b.from)),
    dropped,
  }
}

/** Vale in quel giorno? Le rifiutate non valgono mai: non è successo niente. */
export const covers = (s: Span, day: string) =>
  s.status !== 'rifiutata' && s.from <= day && day <= s.to

/** Chi manca in un dato giorno. */
export const onDay = (spans: Span[], day: string) => spans.filter(s => covers(s, day))

export type Upcoming = Span & { inDays: number; started: boolean }

/**
 * Chi parte nei prossimi N giorni — l'avviso che serve a un admin.
 *
 * Include anche **chi è già via** (`inDays` negativo, `started`), perché la
 * domanda vera non è «chi parte» ma «su chi non posso contare la settimana
 * prossima», e una persona partita ieri non c'è esattamente come una che parte
 * domani. Le rifiutate restano fuori: non sono assenze.
 */
export function upcoming(spans: Span[], today: string, withinDays = 10): Upcoming[] {
  const limit = addDays(today, withinDays)
  return spans
    .filter(s => s.status !== 'rifiutata' && s.to >= today && s.from <= limit)
    .map(s => ({ ...s, inDays: Math.round((utc(s.from) - utc(today)) / DAY), started: s.from <= today }))
    .sort((a, b) => a.from.localeCompare(b.from))
}

export type GridDay = {
  date: string
  inMonth: boolean
  isToday: boolean
  isWeekend: boolean
  spans: Span[]
}

/**
 * Il mese come lo si guarda: sei righe da lunedì a domenica.
 *
 * I giorni degli altri mesi ci sono (`inMonth: false`) invece di essere celle
 * vuote: un'assenza che comincia il 31 e finisce il 3 si legge solo se le due
 * estremità sono visibili.
 */
export function monthGrid(spans: Span[], month: string, today: string): GridDay[][] {
  const first = `${month.slice(0, 7)}-01`
  const dow = (new Date(utc(first)).getUTCDay() + 6) % 7 // lunedì = 0
  const start = addDays(first, -dow)
  const weeks: GridDay[][] = []
  for (let w = 0; w < 6; w++) {
    const row: GridDay[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d)
      row.push({
        date,
        inMonth: date.slice(0, 7) === month.slice(0, 7),
        isToday: date === today,
        isWeekend: d >= 5,
        spans: onDay(spans, date),
      })
    }
    weeks.push(row)
  }
  return weeks
}

/**
 * Il giorno più scoperto del mese: quello da guardare prima di promettere una
 * consegna. A parità vince il primo — è il giorno su cui si inciampa, non
 * l'ultimo in cui il problema si ripete.
 */
export function busiestDay(weeks: GridDay[][]): { date: string; count: number } | null {
  let best: { date: string; count: number } | null = null
  for (const w of weeks) for (const d of w) {
    if (!d.inMonth) continue
    if (!best || d.spans.length > best.count) best = { date: d.date, count: d.spans.length }
  }
  return best && best.count > 0 ? best : null
}

// ── Il countdown del workspace ──────────────────────────────────────────────

export type Countdown = {
  span: Span
  /** giorni che mancano; 0 = si parte oggi, negativo = già in corso */
  inDays: number
  state: 'in corso' | 'domani' | 'vicine' | 'lontane'
  /** quanto è passato dell'attesa, 0..1 — per la barra */
  progress: number
  message: string
}

const PLURAL = (n: number, one: string, many: string) => (n === 1 ? one : many)

/**
 * §223 — Il countdown alle ferie, per la persona che guarda.
 *
 * Prende **la prima assenza approvata** che deve ancora finire: una richiesta
 * non ancora approvata non si festeggia, e mettere un countdown su qualcosa che
 * può essere rifiutato è il modo più veloce di far arrabbiare qualcuno.
 *
 * Il tono cambia con la distanza perché un messaggio uguale a 90 e a 2 giorni
 * non lo legge più nessuno dopo la seconda volta.
 */
export function countdown(spans: Span[], profileId: string, today: string): Countdown | null {
  const mine = spans
    .filter(s => s.profileId === profileId && s.status === 'approvata' && s.kind === 'ferie' && s.to >= today)
    .sort((a, b) => a.from.localeCompare(b.from))[0]
  if (!mine) return null

  const inDays = Math.round((utc(mine.from) - utc(today)) / DAY)
  const total = mine.days

  if (inDays <= 0) {
    const passed = Math.round((utc(today) - utc(mine.from)) / DAY) + 1
    const left = daysBetween(today, mine.to)
    return {
      span: mine, inDays, state: 'in corso',
      progress: Math.min(1, passed / Math.max(1, total)),
      message: left === 1
        ? 'Ultimo giorno. Fai finta di non aver letto.'
        : `Sei in ferie: ${left} ${PLURAL(left, 'giorno', 'giorni')} ancora. Chiudi questa pagina.`,
    }
  }
  if (inDays === 1) {
    return { span: mine, inDays, state: 'domani', progress: 0.97, message: 'Domani. Ultimo giro di consegne e sei fuori.' }
  }
  if (inDays <= 7) {
    return {
      span: mine, inDays, state: 'vicine',
      progress: 1 - inDays / 30,
      message: `${inDays} giorni. È il momento di dire a qualcuno dove hai lasciato le cose.`,
    }
  }
  const weeks = Math.round(inDays / 7)
  return {
    span: mine, inDays, state: 'lontane',
    progress: Math.max(0, 1 - inDays / 90),
    message: inDays <= 30
      ? `${inDays} giorni — ${weeks} ${PLURAL(weeks, 'settimana', 'settimane')} scarse.`
      : `${inDays} giorni. Lontane, ma esistono: è già qualcosa.`,
  }
}
