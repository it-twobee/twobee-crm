/**
 * Economics del cliente — calcoli puri, nessun I/O.
 *
 * Guarda un cliente nella sua interezza: quanto ha fatturato, quanto vale il
 * suo portafoglio contratti, quanto è vivo il rapporto, quanto rende.
 *
 * Regola che attraversa tutto il file: **un indicatore senza dati sufficienti
 * lo dice**, non restituisce zero. Uno zero si legge come «vale zero», e su
 * un'anagrafica appena avviata sarebbe una bugia che porta a decisioni sbagliate.
 * Per questo quasi ogni misura torna un `Metric` con `basis` e `ready`.
 */

import { shiftMonth, monthKey, type PlKind, type PlConfig } from '@/lib/pl'
import { linesForMonth, type RevenueStream, type Installment } from '@/lib/revenue'

export type Metric = {
  value: number
  /** false = non ci sono abbastanza dati: mostra il perché, non il numero */
  ready: boolean
  /** su cosa è calcolato, in una riga */
  basis: string
}

const ok = (value: number, basis: string): Metric => ({ value, ready: true, basis })
const na = (basis: string): Metric => ({ value: 0, ready: false, basis })
const r2 = (n: number) => Math.round(n * 100) / 100

export type ClientMonth = { month: string; amount: number; paid: number }

export type ClientInput = {
  id: string
  name: string
  contract_start: string | null
  contract_end: string | null
  client_label: string | null
  lost_at?: string | null
  /** righe di conto economico già filtrate su questo cliente, un record per mese */
  history: ClientMonth[]
  streams: RevenueStream[]
  installments: Installment[]
  projects: { id: string; name: string; status: string; start_date: string | null; target_end_date: string | null }[]
  lastInteraction: string | null
}

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000)

const monthsBetween = (from: string, to: string) => {
  const [y1, m1] = from.slice(0, 7).split('-').map(Number)
  const [y2, m2] = to.slice(0, 7).split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

// ── Fatturato e rapporto ────────────────────────────────────────────────────

export function billing(c: ClientInput, today = monthKey(new Date())) {
  const months = c.history.filter(h => h.amount > 0)
  const total = r2(months.reduce((s, h) => s + h.amount, 0))
  const collected = r2(c.history.reduce((s, h) => s + h.paid, 0))

  const last12 = c.history.filter(h => h.month > shiftMonth(today, -12))
  const last12Total = r2(last12.reduce((s, h) => s + h.amount, 0))

  return {
    /** quanto ha fatturato in tutto lo storico registrato */
    lifetime: months.length ? ok(total, `${months.length} mesi registrati`) : na('nessun mese di conto economico registrato'),
    collected: months.length ? ok(collected, `${Math.round((collected / (total || 1)) * 100)}% del fatturato`) : na('—'),
    unpaid: months.length ? ok(r2(total - collected), 'differenza fra maturato e incassato') : na('—'),
    last12: last12.some(h => h.amount > 0) ? ok(last12Total, 'ultimi 12 mesi') : na('meno di un mese di storico'),
    avgMonth: months.length >= 2
      ? ok(r2(total / months.length), `media su ${months.length} mesi`)
      : na('serve almeno un secondo mese per una media'),
    monthsBilled: months.length,
  }
}

/** Da quanto dura il rapporto e se è ancora vivo. */
export function relationship(c: ClientInput, today = new Date().toISOString().slice(0, 10)) {
  /* §179: la durata del rapporto la dice il primo contratto venduto su un
     progetto, non la data in anagrafica — quella è un residuo che nessuno
     scrive più e che farebbe risultare «12 mesi» un cliente mai quotato.
     Stessa cosa per il rinnovo: è l'ultimo contratto a scadere, e se qualcuno
     è a tempo indeterminato non c'è nessun rinnovo da aspettare. */
  const sold = c.streams.filter(s => s.status !== 'bozza')
  const starts = sold.map(s => s.start_date).filter((d): d is string => !!d).sort()
  const start = starts[0] ?? null

  const end = c.lost_at?.slice(0, 10) ?? (c.client_label === 'perso' ? today : null)

  const openEnded = sold.some(s => s.status === 'attivo' && s.billing === 'recurring' && !s.end_date)
  const ends = sold.map(s => s.end_date).filter((d): d is string => !!d).sort()
  const renewal = !openEnded && ends.length ? daysBetween(ends[ends.length - 1], today) : null

  if (!start) {
    return {
      months: na(sold.length
        ? 'i contratti non hanno una data di inizio'
        : 'nessun contratto: il rapporto si misura dal primo che vendi'),
      active: c.client_label !== 'perso' && c.client_label !== 'pending',
      renewalInDays: renewal,
      lost: c.client_label === 'perso',
    }
  }

  const span = monthsBetween(start, end ?? today)
  return {
    months: ok(Math.max(0, span), end
      ? `dal primo contratto (${start}) al ${end}`
      : `dal primo contratto, ${start}`),
    active: c.client_label !== 'perso' && c.client_label !== 'pending',
    renewalInDays: renewal,
    lost: c.client_label === 'perso',
  }
}

// ── Previsionale ────────────────────────────────────────────────────────────

/**
 * Ricavo atteso nei prossimi N mesi: **non è una stima statistica**, è la somma
 * di ciò che i contratti attivi produrranno se nessuno disdice. Un canone vale
 * fino alla sua data di fine, una rata vale nel mese in cui cade.
 */
export function forecast(c: ClientInput, months = 6, from = monthKey(new Date())) {
  const rows = Array.from({ length: months }, (_, i) => {
    const m = shiftMonth(from, i + 1)
    const amount = r2(linesForMonth(c.streams, c.installments, m).reduce((s, l) => s + l.amount_net, 0))
    return { month: m, amount }
  })
  const total = r2(rows.reduce((s, r) => s + r.amount, 0))
  const hasContracts = c.streams.some(s => s.status === 'attivo')
  return {
    rows,
    total: hasContracts ? ok(total, `${months} mesi dai contratti attivi`) : na('nessun contratto attivo registrato'),
    /** contratti che scadono dentro l'orizzonte: il previsionale cala lì */
    expiring: c.streams.filter(s =>
      s.status === 'attivo' && s.end_date && s.end_date <= shiftMonth(from, months) + '-31'),
  }
}

// ── RFM ─────────────────────────────────────────────────────────────────────

export type RfmRaw = { recencyDays: number | null; frequency: number; monetary: number }

/** Valori grezzi: il punteggio arriva dopo, confrontando con gli altri clienti. */
export function rfmRaw(c: ClientInput, today = monthKey(new Date())): RfmRaw {
  const billed = c.history.filter(h => h.amount > 0).map(h => h.month).sort()
  const lastBilled = billed[billed.length - 1] ?? null
  const lastEvent = [lastBilled, c.lastInteraction?.slice(0, 7) + '-01']
    .filter((x): x is string => !!x && x !== 'undefined-01').sort().pop() ?? null

  return {
    recencyDays: lastEvent ? Math.max(0, monthsBetween(lastEvent, today) * 30) : null,
    // quanti mesi su dodici hanno prodotto fatturato: la continuità, non il numero di ordini
    frequency: c.history.filter(h => h.amount > 0 && h.month > shiftMonth(today, -12)).length,
    monetary: r2(c.history.filter(h => h.month > shiftMonth(today, -12)).reduce((s, h) => s + h.amount, 0)),
  }
}

export type RfmScore = { r: number; f: number; m: number; label: string; ready: boolean; basis: string }

/**
 * Punteggio 1-5 per quintili **sulla base clienti reale**: RFM è relativo per
 * natura, un «monetary 5» esiste solo rispetto agli altri. Con meno di cinque
 * clienti confrontabili il quintile non ha senso e lo diciamo.
 */
export function rfmScore(mine: RfmRaw, base: RfmRaw[]): RfmScore {
  const usable = base.filter(b => b.monetary > 0)
  if (usable.length < 5) {
    return {
      r: 0, f: 0, m: 0, label: '—', ready: false,
      basis: `servono almeno 5 clienti con fatturato per un confronto, ce ne sono ${usable.length}`,
    }
  }

  const quintile = (v: number, all: number[], invert = false) => {
    const sorted = [...all].sort((a, b) => a - b)
    const below = sorted.filter(x => x < v).length
    const q = Math.min(5, Math.floor((below / sorted.length) * 5) + 1)
    return invert ? 6 - q : q
  }

  // recency: meno giorni = meglio, quindi il quintile va invertito
  const r = mine.recencyDays === null ? 1
    : quintile(mine.recencyDays, usable.map(b => b.recencyDays ?? 99999), true)
  const f = quintile(mine.frequency, usable.map(b => b.frequency))
  const m = quintile(mine.monetary, usable.map(b => b.monetary))

  return { r, f, m, label: rfmLabel(r, f, m), ready: true, basis: `quintili su ${usable.length} clienti con fatturato` }
}

/** Il segmento in parole: un punteggio 5-4-5 non dice cosa fare, «Campione» sì. */
export function rfmLabel(r: number, f: number, m: number): string {
  if (r >= 4 && f >= 4 && m >= 4) return 'Campione'
  if (r >= 4 && m >= 4) return 'Cliente forte'
  if (r >= 4 && f <= 2) return 'Nuovo o sporadico'
  if (r <= 2 && m >= 4) return 'Da recuperare'
  if (r <= 2 && f <= 2) return 'Dormiente'
  if (f >= 4) return 'Fedele'
  return 'Da coltivare'
}

// ── Marginalità e opportunità ───────────────────────────────────────────────

/** Quanto resta a TwoBee da questo cliente, secondo il piano compensi. */
export function contribution(c: ClientInput, config: PlConfig, kind: PlKind) {
  const rev = c.history.reduce((s, h) => s + h.amount, 0)
  if (rev <= 0) return { residual: na('nessun fatturato registrato'), riskFund: na('—') }
  const sales = kind === 'growth' ? config.growth_sales_pct : config.digital_sales_pct
  const delivery = kind === 'growth' ? config.growth_delivery_pct : config.digital_delivery_pct
  const residual = r2(rev * (1 - sales - delivery - config.cost_target_pct - config.risk_fund_pct))
  return {
    residual: ok(residual, 'residuo teorico sul fatturato storico'),
    riskFund: ok(r2(rev * config.risk_fund_pct), `${Math.round(config.risk_fund_pct * 100)}% accantonato`),
  }
}

/** Servizi a catalogo mai venduti a questo cliente: la lista da cui partire. */
export function upsell(
  c: ClientInput,
  catalog: { service_type: string; service_subtype: string | null; label: string; standard_price: number | null }[],
) {
  const sold = new Set(c.streams.map(s => `${s.service_type ?? ''}|${s.service_subtype ?? ''}`))
  return catalog.filter(s => !sold.has(`${s.service_type}|${s.service_subtype ?? ''}`))
}

/**
 * Ricavo degli ultimi 3 mesi contro i 3 precedenti: il rapporto cresce o si
 * spegne. Il mese corrente è escluso — è ancora aperto e falserebbe il taglio.
 */
export function trend(c: ClientInput, today = monthKey(new Date())) {
  const at = (from: number, to: number) => r2(c.history
    .filter(h => h.month >= shiftMonth(today, from) && h.month < shiftMonth(today, to))
    .reduce((s, h) => s + h.amount, 0))
  const recent = at(-3, 0)
  const before = at(-6, -3)
  if (before === 0) return na('servono sei mesi di storico per un confronto')
  return ok(r2((recent - before) / before), `ultimi 3 mesi (${recent}) contro i 3 precedenti (${before})`)
}
