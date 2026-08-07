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
  /** §188: anticipo che torna al cliente (budget ads): fatturato sì, quote no */
  pass_through?: boolean
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
  /** §207 — tutti i progetti coperti dall'accordo, anche quando sono più d'uno */
  project_ids: string[]
  label: string
  kind: PlKind
  amount_net: number
  vat_rate: number
  sales_owner_id: string | null
  invoiced: boolean
  paid: boolean
  /** §188: partita di giro, dal contratto */
  pass_through?: boolean
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
 * §188 — quali progetti copre un accordo, letti da `revenue_stream_projects`.
 * Con un progetto solo vale `revenue_streams.project_id`, come sempre.
 */
export type Coverage = Map<string, string[]>

/**
 * I progetti di un contratto, e quale di essi finisce sulla riga del mese.
 *
 * §188 — con più progetti la riga **non ne porta nessuno**: dei 3.600 di iCura
 * non si sa quanto sia lead generation e quanto sito web, e attribuirli a uno
 * dei tre falserebbe due margini su tre. I progetti restano però noti, perché
 * il margine digital deve togliere i subappalti di **tutti** quelli coperti:
 * senza, la quota si prenderebbe su un ricavo che il fornitore si porta via.
 */
export function coveredProjects(s: RevenueStream, coverage?: Coverage): string[] {
  const listed = coverage?.get(s.id) ?? []
  if (listed.length > 1) return listed
  return s.project_id ? [s.project_id] : []
}

/** Il progetto da scrivere sulla riga: uno solo, oppure nessuno. */
const singleProject = (ids: string[]) => (ids.length === 1 ? ids[0] : null)

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
  coverage?: Coverage,
): MonthLine[] {
  const out: MonthLine[] = []

  for (const s of streams) {
    if (s.billing === 'recurring') {
      if (!activeInMonth(s, month) || s.amount === 0) continue
      const projects = coveredProjects(s, coverage)
      out.push({
        stream_id: s.id, installment_id: null, client_id: s.client_id,
        project_id: singleProject(projects), project_ids: projects,
        label: s.label, kind: s.kind, amount_net: s.amount, vat_rate: s.vat_rate,
        sales_owner_id: s.sales_owner_id, invoiced: false, paid: false,
        pass_through: !!s.pass_through,
      })
    }
  }

  const byId = new Map(streams.map(s => [s.id, s]))
  for (const i of installments) {
    if (first(i.due_month) !== month) continue
    const s = byId.get(i.stream_id)
    if (!s || s.status === 'bozza' || s.status === 'sospeso') continue
    const projects = coveredProjects(s, coverage)
    out.push({
      stream_id: s.id, installment_id: i.id, client_id: s.client_id,
      project_id: singleProject(projects), project_ids: projects,
      label: i.label ? `${s.label} — ${i.label}` : s.label,
      kind: s.kind, amount_net: i.amount, vat_rate: s.vat_rate,
      sales_owner_id: s.sales_owner_id, invoiced: i.invoiced, paid: i.paid,
      pass_through: !!s.pass_through,
    })
  }

  return out
}

/* ── §207 — quello che la riga ha copiato dal contratto, e non è più vero ──── */

/**
 * Una riga di conto economico nata da un contratto **copia** il contratto nel
 * momento in cui il mese si prepara: da lì in poi vive per conto suo. È giusto
 * per i fatti del mese — fatturata, incassata, chi era il commerciale allora —
 * ed è sbagliato per le **decisioni dell'accordo**: se il Tipo passa a digital
 * il mese già preparato continua a pagare il 15% invece del 6%, e nessuna
 * pagina lo dice. Un lucchetto che rimanda a una sezione che non cambia niente
 * è peggio di un campo modificabile.
 *
 * Qui si dice cosa non combacia più. `patch` contiene **solo** i campi
 * scostati, quindi si può scrivere così com'è.
 */
export type LineFacts = {
  id: string
  label: string
  stream_id: string | null
  kind: PlKind
  project_id: string | null
  vat_rate: number
  pass_through?: boolean
}

export type DriftField = 'kind' | 'project_id' | 'vat_rate' | 'pass_through'

export type ContractDrift = {
  lineId: string
  label: string
  streamId: string
  fields: DriftField[]
  patch: Partial<Pick<LineFacts, 'kind' | 'project_id' | 'vat_rate' | 'pass_through'>>
}

/** Come si legge uno scostamento, in italiano e senza gergo di colonna. */
export const DRIFT_LABEL: Record<DriftField, string> = {
  kind: 'tipo',
  project_id: 'progetto',
  vat_rate: 'aliquota IVA',
  pass_through: 'partita di giro',
}

/**
 * `amount_net` non è qui di proposito: il preventivato di un mese può essere
 * stato ridotto a mano — un canone partito a metà mese vale mezzo canone — e
 * riallinearlo d'ufficio riscriverebbe una decisione presa da una persona.
 * Il tipo, il progetto, l'IVA e la partita di giro invece non sono decisioni
 * del mese: sono l'accordo, e l'accordo sta in un posto solo.
 */
export function contractDrift(
  lines: LineFacts[],
  streams: RevenueStream[],
  coverage?: Coverage,
): ContractDrift[] {
  const byId = new Map(streams.map(s => [s.id, s]))
  const out: ContractDrift[] = []

  for (const l of lines) {
    if (!l.stream_id) continue
    const s = byId.get(l.stream_id)
    if (!s) continue

    const want = {
      kind: s.kind,
      project_id: singleProject(coveredProjects(s, coverage)),
      vat_rate: s.vat_rate,
      pass_through: !!s.pass_through,
    }
    const fields: DriftField[] = []
    const patch: ContractDrift['patch'] = {}

    if (l.kind !== want.kind) { fields.push('kind'); patch.kind = want.kind }
    if ((l.project_id ?? null) !== want.project_id) {
      fields.push('project_id'); patch.project_id = want.project_id
    }
    if (Math.abs(l.vat_rate - want.vat_rate) > 0.0001) {
      fields.push('vat_rate'); patch.vat_rate = want.vat_rate
    }
    if (!!l.pass_through !== want.pass_through) {
      fields.push('pass_through'); patch.pass_through = want.pass_through
    }

    if (fields.length) out.push({ lineId: l.id, label: l.label, streamId: s.id, fields, patch })
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
