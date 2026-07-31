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
  project_id: string
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
  project_id: string
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

/** Rate uguali su N mesi a partire dal mese d'avvio. L'ultima assorbe l'arrotondamento. */
export function splitEven(total: number, months: number, startMonth: string): InstallmentDraft[] {
  if (months < 1) return []
  const each = Math.round((total / months) * 100) / 100
  return Array.from({ length: months }, (_, i) => ({
    due_month: shiftMonth(startMonth, i),
    label: `Rata ${i + 1} di ${months}`,
    amount: i === months - 1 ? Math.round((total - each * (months - 1)) * 100) / 100 : each,
  }))
}

/**
 * Rate a percentuali, una per tappa: `[40, 30, 30]` su tre mesi consecutivi.
 * L'ultima assorbe l'arrotondamento, così la somma fa sempre il totale.
 */
export function splitByPercent(total: number, percents: number[], startMonth: string): InstallmentDraft[] {
  const n = percents.length
  if (!n) return []
  let used = 0
  return percents.map((p, i) => {
    const amount = i === n - 1
      ? Math.round((total - used) * 100) / 100
      : Math.round(total * (p / 100) * 100) / 100
    used += amount
    return { due_month: shiftMonth(startMonth, i), label: `${p}%`, amount }
  })
}

/** Numero di mesi coperti da un contratto a termine, estremi inclusi. */
export function monthSpan(start: string, end: string): number {
  const [ys, ms] = start.split('-').map(Number)
  const [ye, me] = end.split('-').map(Number)
  return Math.max(1, (ye - ys) * 12 + (me - ms) + 1)
}

/** Le rate che coprono l'intera durata del lavoro: il default sensato. */
export function autoInstallments(s: RevenueStream): InstallmentDraft[] {
  if (s.billing !== 'one_off' || !s.start_date) return []
  const start = first(s.start_date)
  const months = s.end_date ? monthSpan(start, first(s.end_date)) : 1
  return splitEven(s.amount, months, start)
}

/**
 * La manutenzione si attiva quando il lavoro che la genera è concluso.
 * Restituisce gli id da portare in 'attivo': è una decisione, non un effetto,
 * quindi la esegue chi chiama.
 */
export function readyToActivate(streams: RevenueStream[]): RevenueStream[] {
  const byId = new Map(streams.map(s => [s.id, s]))
  return streams.filter(s =>
    s.status === 'bozza' &&
    s.activates_after_id &&
    byId.get(s.activates_after_id)?.status === 'concluso',
  )
}

/** Mese corrente, per i default dell'interfaccia. */
export const currentMonth = () => monthKey(new Date())
