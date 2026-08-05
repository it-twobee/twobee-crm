/**
 * Rischio cliente — calcoli puri, nessun I/O.
 *
 * Il motore precedente (`compute_client_risk`, migration 014) leggeva fatture,
 * KPI e ticket. La 146 ha droppato la funzione insieme alla tabella `invoices`,
 * e `client_kpis`/`tickets` sono rimaste vuote: da allora `clients.risk_score`
 * valeva 0 su tutti, compresi i clienti che non pagavano. Uno zero fermo è
 * peggio di un campo vuoto — un campo vuoto lo si nota, uno zero lo si crede.
 *
 * Questo motore legge **solo sorgenti vive**: le righe di conto economico e le
 * loro spunte, i contratti con le loro scadenze, la sospensione (§176),
 * l'etichetta. Tre regole:
 *
 * 1. **Un segnale che non si può calcolare non vale zero.** Finisce in
 *    `unknown` con scritto perché. Zero significa «guardato, e va bene».
 * 2. **Sotto due segnali calcolabili non esce un numero** (`ready: false`):
 *    un punteggio costruito su un solo indizio ha la stessa faccia di uno
 *    costruito su cinque, e non è la stessa cosa.
 * 3. **Il tempo è un parametro.** Serve a rispondere «sta peggiorando?»
 *    rieseguendo lo stesso calcolo trenta giorni indietro, invece di tenere in
 *    tabella un punteggio vecchio da confrontare.
 */

import { shiftMonth } from '@/lib/pl'
import type { ClientMonth } from '@/lib/client-economics'

export type RiskFactor = { key: string; score: number; msg: string }
export type RiskUnknown = { key: string; msg: string }
export type RiskBand = 'basso' | 'medio' | 'alto'
export type RiskTrend = 'migliora' | 'stabile' | 'peggiora'

export type RiskResult = {
  /** null = non valutabile: mostra `basis`, non un numero */
  score: number | null
  band: RiskBand | null
  ready: boolean
  /** su cosa è calcolato, in una riga */
  basis: string
  factors: RiskFactor[]
  unknown: RiskUnknown[]
  trend: RiskTrend | null
}

export type RiskInput = {
  id: string
  name: string
  client_label: string | null
  is_internal?: boolean | null
  /** §176: data dell'ultima sospensione */
  paused_at?: string | null
  /** un record per mese di conto economico: maturato e incassato */
  history: ClientMonth[]
  /* Il motore legge di un contratto solo se è venduto e fino a quando copre:
     chiedere l'oggetto intero obbligherebbe ogni chiamante a una select larga
     per campi che qui non si guardano. */
  streams: { status: string; end_date: string | null }[]
  /** §177: le rate contano quanto le righe. Servono per i mesi mai aperti. */
  installments: { due_month: string; amount: number; paid: boolean }[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

/* Il punto delle migliaia a mano: `toLocaleString('it-IT')` dipende dai dati
   ICU con cui è compilato Node, e un motore puro che cambia messaggio fra il
   check e la pagina non è verificabile. */
const eur = (n: number) => '€' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Il badge parte da qui: sotto 35 basso, sotto 60 medio, oltre alto. */
export function bandOf(score: number): RiskBand {
  return score >= 60 ? 'alto' : score >= 35 ? 'medio' : 'basso'
}

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000)

const monthsBetween = (from: string, to: string) => {
  const [y1, m1] = from.slice(0, 7).split('-').map(Number)
  const [y2, m2] = to.slice(0, 7).split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

/**
 * Un cliente perso, un partner o una società del gruppo non hanno un rischio da
 * gestire: il perso è già andato, il partner non è una relazione commerciale, e
 * l'interno è Two Bee stessa. Un punteggio lì è rumore che copre i clienti veri.
 */
export const scorable = (c: Pick<RiskInput, 'client_label' | 'is_internal'>) =>
  !c.is_internal && c.client_label !== 'perso' && c.client_label !== 'partner'

// ── I segnali ───────────────────────────────────────────────────────────────

/**
 * A. Insoluto (0–35). §177: la fattura del mese vale fino al 15, quindi il mese
 * in corso non è mai in ritardo — pesa **da quanto** il più vecchio scoperto è
 * lì, che è la domanda che distingue un ritardo da un credito che non rientra.
 */
function unpaid(c: RiskInput, today: string): RiskFactor | RiskUnknown {
  const month = today.slice(0, 8) + '01'
  const past = c.history.filter(h => h.month < month)

  /* §193: una rata aperta nel mese è già diventata una riga, e sommarle
     entrambe conterebbe due volte lo stesso credito. Restano da guardare le
     rate dei mesi che nessuno ha ancora aperto: lì la riga non esiste, e senza
     questo pezzo un cliente che non paga da marzo risulta in regola solo
     perché marzo non è mai stato preparato. */
  const opened = new Set(c.history.map(h => h.month))
  const stray = c.installments.filter(i => !i.paid && i.due_month < month && !opened.has(i.due_month))

  if (!past.length && !stray.length) {
    return { key: 'insoluto', msg: 'nessun mese passato di conto economico registrato' }
  }

  const open = past.filter(h => h.amount - h.paid > 0.01)
  if (!open.length && !stray.length) {
    return { key: 'insoluto', score: 0, msg: `${past.length} mesi passati, tutti incassati` }
  }

  const amount = r2(
    open.reduce((s, h) => s + (h.amount - h.paid), 0) + stray.reduce((s, i) => s + i.amount, 0),
  )
  const oldest = [...open.map(h => h.month), ...stray.map(i => i.due_month)].sort()[0]
  const age = monthsBetween(oldest, month)

  const score = age >= 3 ? 35 : age === 2 ? 25 : 15
  const when = age >= 3 ? `da ${age} mesi` : age === 2 ? 'da due mesi' : 'dal mese scorso'
  return { key: 'insoluto', score, msg: `${eur(amount)} scoperti ${when}` }
}

/**
 * B. Fatturato che si spegne (0–25, con un bonus se cresce). Tre mesi contro i
 * tre precedenti: sotto i sei mesi di storico il confronto non esiste e lo dice.
 */
function billingTrend(c: RiskInput, today: string): RiskFactor | RiskUnknown {
  const month = today.slice(0, 8) + '01'
  const window = (from: number, to: number) => c.history
    .filter(h => h.month >= shiftMonth(month, from) && h.month < shiftMonth(month, to))
  const sum = (from: number, to: number) => r2(window(from, to).reduce((s, h) => s + h.amount, 0))

  /* Non basta che la finestra precedente non sia vuota: **due mesi su tre**
     devono aver fatturato. Con uno solo il confronto misura l'inizio dello
     storico, non l'andamento — un cliente registrato da aprile risultava
     «+461%» contro un trimestre che conteneva un mese, e quel bonus finiva
     per abbassare il rischio di chi non paga. */
  const filled = window(-6, -3).filter(h => h.amount > 0).length
  if (filled < 2) {
    return { key: 'fatturato', msg: 'storico troppo corto per un confronto a tre mesi' }
  }

  const before = sum(-6, -3)
  const recent = sum(-3, 0)
  const delta = (recent - before) / before
  const pct = `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}%`
  const tail = ` (${eur(recent)} contro ${eur(before)})`

  if (delta <= -0.5) return { key: 'fatturato', score: 25, msg: `fatturato ${pct}${tail}` }
  if (delta <= -0.25) return { key: 'fatturato', score: 15, msg: `fatturato ${pct}${tail}` }
  if (delta < -0.02) return { key: 'fatturato', score: 8, msg: `fatturato ${pct}${tail}` }
  if (delta > 0.1) return { key: 'fatturato', score: -5, msg: `fatturato ${pct}${tail}` }
  return { key: 'fatturato', score: 0, msg: `fatturato stabile${tail}` }
}

/**
 * C. Copertura contrattuale (0–20). Un canone a tempo indeterminato non ha un
 * rinnovo da aspettare (§179): è la copertura migliore, non un dato mancante.
 * Un cliente che fattura senza un contratto registrato è un rischio di natura
 * diversa — l'accordo esiste solo nella testa di qualcuno — e pesa meno.
 */
function coverage(c: RiskInput, today: string): RiskFactor | RiskUnknown {
  const sold = c.streams.filter(s => s.status !== 'bozza')
  const billing = c.history.some(h => h.amount > 0)

  if (!sold.length) {
    if (!billing) return { key: 'contratti', msg: 'cliente non ancora quotato: niente da valutare' }
    return { key: 'contratti', score: 12, msg: 'fattura senza un contratto registrato' }
  }

  const active = sold.filter(s => s.status === 'attivo')
  if (!active.length) return { key: 'contratti', score: 20, msg: `${sold.length} contratti, nessuno attivo` }
  if (active.some(s => !s.end_date)) {
    return { key: 'contratti', score: 0, msg: 'coperto da un canone a tempo indeterminato' }
  }

  const last = active.map(s => s.end_date!).sort().pop()!
  const days = daysBetween(last, today)
  if (days < 0) return { key: 'contratti', score: 20, msg: `l'ultimo contratto è scaduto da ${-days} giorni` }
  if (days <= 60) return { key: 'contratti', score: 20, msg: `tutto scade fra ${days} giorni` }
  if (days <= 120) return { key: 'contratti', score: 10, msg: `tutto scade fra ${days} giorni` }
  return { key: 'contratti', score: 0, msg: `coperto fino al ${last}` }
}

/**
 * D. Sospensione (0–20). §176: oltre i 60 giorni un rapporto fermo che nessuno
 * richiama diventa un rapporto perso. Sotto, il segnale non si emette: un
 * cliente che lavora non ha una riga «non è sospeso» da leggere.
 */
function paused(c: RiskInput, today: string): RiskFactor | null {
  if (c.client_label !== 'pending') return null
  if (!c.paused_at) return { key: 'sospensione', score: 8, msg: 'sospeso da data ignota' }
  const days = daysBetween(today, c.paused_at.slice(0, 10))
  const score = days > 90 ? 20 : days > 60 ? 15 : days > 30 ? 8 : 3
  return { key: 'sospensione', score, msg: `lavorazioni ferme da ${days} giorni` }
}

/** E. L'etichetta (0–10). Qualcuno l'ha guardato in faccia e l'ha segnato. */
function labelled(c: RiskInput): RiskFactor | null {
  return c.client_label === 'in_bilico'
    ? { key: 'etichetta', score: 10, msg: 'segnato in bilico' }
    : null
}

const isFactor = (x: RiskFactor | RiskUnknown | null): x is RiskFactor =>
  !!x && typeof (x as RiskFactor).score === 'number'

// ── Il punteggio ────────────────────────────────────────────────────────────

const NOT_SCORABLE: RiskResult = {
  score: null, band: null, ready: false, factors: [], unknown: [], trend: null,
  basis: 'perso, partner o interno: nessun rischio da gestire',
}

export function clientRisk(c: RiskInput, today = new Date().toISOString().slice(0, 10)): RiskResult {
  if (!scorable(c)) return NOT_SCORABLE

  /* Un cliente sospeso non fattura per definizione (§176): leggergli un
     insoluto o un fatturato in calo vorrebbe dire trovare pericoloso il fatto
     che stia fermo, che è la premessa, non la conclusione. */
  const suspended = c.client_label === 'pending'
  const signals: (RiskFactor | RiskUnknown | null)[] = suspended
    ? [paused(c, today), coverage(c, today), labelled(c)]
    : [unpaid(c, today), billingTrend(c, today), coverage(c, today), labelled(c)]

  const raw = signals.filter(isFactor)
  const unknown = signals.filter((x): x is RiskUnknown => !!x && !isFactor(x))

  /* Il bonus per il fatturato in crescita serve a distinguere due clienti per
     il resto identici, non a cancellare un segnale negativo: su un cliente con
     3.500 € scoperti e i contratti in scadenza fra 26 giorni portava il totale
     da 35 («medio») a 30 («basso»), che è la bugia da cui nasce tutto questo
     motore. Quindi vale solo se **non c'è niente altro che non va** — e quando
     non vale lo dice, invece di sparire. */
  const hasBadNews = raw.some(f => f.score > 0)
  const factors = raw.map(f => f.score < 0 && hasBadNews
    ? { ...f, score: 0, msg: `${f.msg} — non compensa il resto` }
    : f)

  if (factors.length < 2) {
    return {
      score: null, band: null, ready: false, factors, unknown, trend: null,
      basis: unknown.length
        ? `un solo segnale leggibile: ${unknown.map(u => u.msg).join(' · ')}`
        : 'dati insufficienti per un punteggio',
    }
  }

  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.score, 0)))
  return {
    score,
    band: bandOf(score),
    ready: true,
    basis: `${factors.length} segnali su ${factors.length + unknown.length}`,
    factors,
    unknown,
    trend: null,
  }
}

/**
 * «Sta peggiorando?» — stesso motore, stessi dati, orologio indietro di N
 * giorni. Il confronto è fra due letture della stessa realtà, non fra il
 * punteggio di oggi e un numero rimasto in tabella da quando qualcuno lo scrisse.
 * Banda morta di 5 punti: sotto è rumore, e un'icona che oscilla non si guarda più.
 */
export function withTrend(c: RiskInput, today = new Date().toISOString().slice(0, 10), backDays = 30): RiskResult {
  const now = clientRisk(c, today)
  if (!now.ready || now.score == null) return now

  const then = new Date(today + 'T00:00:00')
  then.setDate(then.getDate() - backDays)
  const before = clientRisk(c, then.toISOString().slice(0, 10))
  if (!before.ready || before.score == null) return { ...now, trend: 'stabile' }

  const delta = now.score - before.score
  return { ...now, trend: delta > 5 ? 'peggiora' : delta < -5 ? 'migliora' : 'stabile' }
}

/**
 * Il riepilogo che serve alla dashboard: quanti sono alti, quanti stanno
 * peggiorando, e **quanti non sono valutabili** — che è il numero che dice se
 * si può credere agli altri due.
 */
export function riskSummary(results: RiskResult[]) {
  const scored = results.filter(r => r.ready && r.score != null)
  return {
    scored: scored.length,
    notReady: results.filter(r => !r.ready && r.basis !== NOT_SCORABLE.basis).length,
    high: scored.filter(r => r.band === 'alto').length,
    medium: scored.filter(r => r.band === 'medio').length,
    worsening: scored.filter(r => r.trend === 'peggiora').length,
  }
}

// ── Dalle righe del database ai punteggi ────────────────────────────────────

/**
 * Le tabelle così come arrivano dalle select, senza chiedere ai chiamanti di
 * costruirsi l'input a mano: la lista clienti, la scheda e la dashboard leggono
 * le stesse quattro tabelle, e tre mappatori scritti a mano sono tre posti dove
 * dimenticare una colonna quando il motore ne chiederà una in più.
 */
export type RiskRows = {
  clients: {
    id: string
    company_name: string
    display_name?: string | null
    client_label: string | null
    is_internal?: boolean | null
    paused_at?: string | null
  }[]
  /** tutti i contratti: il filtro sulle bozze lo fa il motore */
  streams: { id: string; client_id: string | null; status: string; end_date: string | null }[]
  installments: { stream_id: string; amount: unknown; paid: boolean; due_month: string }[]
  /** righe di conto economico di **tutti** i mesi: il rischio guarda lo storico */
  lines: { client_id: string | null; amount_net: unknown; paid: boolean; pl_months: { month: string } | null }[]
}

export function risksFor(rows: RiskRows, today = new Date().toISOString().slice(0, 10)): Record<string, RiskResult> {
  const n = (v: unknown) => Number(v ?? 0)
  const clientOfStream = new Map(rows.streams.map(s => [s.id, s.client_id]))

  const history = new Map<string, Map<string, ClientMonth>>()
  for (const l of rows.lines) {
    const month = l.pl_months?.month
    if (!l.client_id || !month) continue
    const mine = history.get(l.client_id) ?? new Map<string, ClientMonth>()
    const cur = mine.get(month) ?? { month, amount: 0, paid: 0 }
    cur.amount += n(l.amount_net)
    if (l.paid) cur.paid += n(l.amount_net)
    mine.set(month, cur)
    history.set(l.client_id, mine)
  }

  const out: Record<string, RiskResult> = {}
  for (const c of rows.clients) {
    out[c.id] = withTrend({
      id: c.id,
      name: c.display_name || c.company_name,
      client_label: c.client_label,
      is_internal: c.is_internal,
      paused_at: c.paused_at,
      history: Array.from((history.get(c.id) ?? new Map()).values())
        .sort((a, b) => a.month.localeCompare(b.month)),
      streams: rows.streams
        .filter(s => s.client_id === c.id && s.status !== 'bozza')
        .map(s => ({ status: s.status, end_date: s.end_date })),
      installments: rows.installments
        .filter(i => clientOfStream.get(i.stream_id) === c.id)
        .map(i => ({ due_month: i.due_month, amount: n(i.amount), paid: i.paid })),
    }, today)
  }
  return out
}

/** Adattatore per chi vuole ancora la mappa: `{ chiave: { score, msg } }`. */
export function factorMap(r: RiskResult): Record<string, { score: number; msg: string }> {
  return Object.fromEntries(r.factors.map(f => [f.key, { score: f.score, msg: f.msg }]))
}
