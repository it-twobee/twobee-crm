/**
 * Da contratti a righe di conto economico — calcoli puri, nessun I/O.
 *
 * Un cliente non ha «un MRR»: ha dei contratti, ognuno con la sua vita.
 *
 *   recurring  il canone vale in ogni mese fra inizio e fine (fine assente =
 *              a tempo indeterminato). È il growth continuativo, ed è anche la
 *              manutenzione digital una volta attivata.
 *
 *   one_off    l'importo è il totale del lavoro, non il ricavo del mese in cui
 *              parte. Pesa attraverso le rate: un 40/30/30 e una divisione in
 *              sei mesi sono lo stesso meccanismo, cambia solo come le generi.
 *
 * Un contratto in 'bozza' non entra mai: è quotato ma non venduto. La
 * manutenzione futura vive lì finché il progetto che la genera non chiude.
 */

import { monthKey, shiftMonth, type PlKind } from '@/lib/pl'

export type Billing = 'recurring' | 'one_off'
export type StreamStatus = 'bozza' | 'attivo' | 'sospeso' | 'concluso'

/**
 * Una riga di contratto: pende dal **progetto**, non dal cliente, ed è un
 * singolo servizio erogato. Un growth che fa Lead Generation e Social sono due
 * righe: solo così si vede quale servizio regge il margine.
 *
 * `client_id` è derivato dal progetto (trigger), non si scrive a mano.
 * `price_source` ricorda se il prezzo è quello di listino o negoziato.
 */
export type RevenueStream = {
  id: string
  /**
   * Dove si eroga. Facoltativo: una quota partner o un retainer firmato prima
   * che il progetto esista sono ricavi veri senza un lavoro a cui appendersi.
   */
  project_id: string | null
  client_id: string | null
  label: string
  service_type: string | null
  service_subtype: string | null
  price_source: 'standard' | 'custom'
  kind: PlKind
  billing: Billing
  amount: number
  vat_rate: number
  start_date: string | null
  end_date: string | null
  status: StreamStatus
  sales_owner_id: string | null
  activates_after_id: string | null
  /** §174: metodo di pagamento concordato. È quello che il subappalto ricalca. */
  payment_terms?: string | null
}

export type Installment = {
  id: string
  stream_id: string
  due_month: string
  label: string | null
  amount: number
  invoiced: boolean
  paid: boolean
}

/** Riga pronta per il conto economico del mese. */
export type MonthLine = {
  stream_id: string
  installment_id: string | null
  client_id: string | null
  project_id: string | null
  label: string
  kind: PlKind
  amount_net: number
  vat_rate: number
  sales_owner_id: string | null
  invoiced: boolean
  paid: boolean
}

const first = (iso: string) => iso.slice(0, 8) + '01'

/** Un canone vale nel mese se il mese cade dentro l'intervallo del contratto. */
export function activeInMonth(s: RevenueStream, month: string): boolean {
  if (s.status !== 'attivo') return false
  const start = s.start_date ? first(s.start_date) : null
  const end = s.end_date ? first(s.end_date) : null
  if (start && month < start) return false
  if (end && month > end) return false
  return true
}

/**
 * Le righe di un mese: canoni attivi + rate in scadenza.
 *
 * Le rate si contano anche quando il contratto è 'concluso': un lavoro finito
 * a marzo può avere il saldo che matura ad aprile, e quel ricavo è di aprile.
 */
export function linesForMonth(
  streams: RevenueStream[],
  installments: Installment[],
  month: string,
): MonthLine[] {
  const out: MonthLine[] = []

  for (const s of streams) {
    if (s.billing === 'recurring') {
      if (!activeInMonth(s, month) || s.amount === 0) continue
      out.push({
        stream_id: s.id, installment_id: null, client_id: s.client_id, project_id: s.project_id,
        label: s.label, kind: s.kind, amount_net: s.amount, vat_rate: s.vat_rate,
        sales_owner_id: s.sales_owner_id, invoiced: false, paid: false,
      })
    }
  }

  const byId = new Map(streams.map(s => [s.id, s]))
  for (const i of installments) {
    if (first(i.due_month) !== month) continue
    const s = byId.get(i.stream_id)
    if (!s || s.status === 'bozza' || s.status === 'sospeso') continue
    out.push({
      stream_id: s.id, installment_id: i.id, client_id: s.client_id, project_id: s.project_id,
      label: i.label ? `${s.label} — ${i.label}` : s.label,
      kind: s.kind, amount_net: i.amount, vat_rate: s.vat_rate,
      sales_owner_id: s.sales_owner_id, invoiced: i.invoiced, paid: i.paid,
    })
  }

  return out
}

/** Quanto è già stato pianificato in rate: serve a non sforare il totale. */
export function scheduled(installments: Installment[], streamId: string): number {
  return installments.filter(i => i.stream_id === streamId)
    .reduce((s, i) => s + i.amount, 0)
}

export type InstallmentDraft = { due_month: string; label: string; amount: number }

/**
 * Come si paga un lavoro a corpo. I modi veri sono pochi e si combinano:
 * un acconto alla firma, una durata, un numero di rate, oppure tranche a
 * percentuali libere legate agli stati di avanzamento.
 *
 * `everyMonths` è la cadenza: 1 = mensile, 3 = trimestrale. Serve perché
 * «tre rate» non vuol dire per forza «tre mesi di fila».
 */
export type ScheduleSpec = {
  mode: 'even' | 'percent' | 'deposit'
  /** rate da generare (even) o rate dopo l'acconto (deposit) */
  count?: number
  /** tranche libere: [40, 30, 30]. La somma non deve per forza fare 100 */
  percents?: number[]
  /** acconto alla firma, in percentuale sul totale */
  depositPct?: number
  everyMonths?: number
  startMonth: string
}

/**
 * Il piano di pagamento dalla sua descrizione. Un solo posto che sa fare i
 * conti: l'ultima rata assorbe sempre l'arrotondamento, così la somma fa
 * esattamente il totale del contratto e non 5.999,98.
 */
export function buildSchedule(total: number, spec: ScheduleSpec): InstallmentDraft[] {
  const every = Math.max(1, spec.everyMonths ?? 1)
  const at = (i: number) => shiftMonth(spec.startMonth, i * every)
  const r2 = (n: number) => Math.round(n * 100) / 100

  if (spec.mode === 'percent') {
    const ps = (spec.percents ?? []).filter(p => p > 0)
    if (!ps.length) return []
    let used = 0
    return ps.map((p, i) => {
      const amount = i === ps.length - 1 ? r2(total - used) : r2(total * (p / 100))
      used += amount
      return { due_month: at(i), label: `${p}%`, amount }
    })
  }

  if (spec.mode === 'deposit') {
    const pct = Math.min(100, Math.max(0, spec.depositPct ?? 30))
    const n = Math.max(1, spec.count ?? 3)
    const deposit = r2(total * (pct / 100))
    const rest = r2(total - deposit)
    const each = r2(rest / n)
    let used = deposit
    const rows: InstallmentDraft[] = [{ due_month: at(0), label: `Acconto ${pct}%`, amount: deposit }]
    for (let i = 0; i < n; i++) {
      const amount = i === n - 1 ? r2(total - used) : each
      used += amount
      // le rate partono dal periodo dopo l'acconto: l'acconto è alla firma
      rows.push({ due_month: at(i + 1), label: `Rata ${i + 1} di ${n}`, amount })
    }
    return rows
  }

  const n = Math.max(1, spec.count ?? 1)
  const each = r2(total / n)
  return Array.from({ length: n }, (_, i) => ({
    due_month: at(i),
    label: n === 1 ? 'Saldo unico' : `Rata ${i + 1} di ${n}`,
    amount: i === n - 1 ? r2(total - each * (n - 1)) : each,
  }))
}

/** Numero di mesi coperti da un contratto a termine, estremi inclusi. */
export function monthSpan(start: string, end: string): number {
  const [ys, ms] = start.split('-').map(Number)
  const [ye, me] = end.split('-').map(Number)
  return Math.max(1, (ye - ys) * 12 + (me - ms) + 1)
}

/** Mese corrente, per i default dell'interfaccia. */
export const currentMonth = () => monthKey(new Date())
