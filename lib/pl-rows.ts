/**
 * §287 — Dalla riga del database alla riga del motore. **Un posto solo.**
 *
 * `computeMonth` non legge il database: legge `RevenueLine` e `CostLine`, e
 * qualcuno deve costruirli. Quel qualcuno era **dieci volte**: la pagina del
 * conto economico, quella della banca, il caricamento del prospetto, l'azione
 * che scrive i compensi e sei script di verifica. Ogni copia portava un
 * sottoinsieme diverso dei campi, e la conseguenza non è un errore che si vede:
 * è un numero **plausibile e sbagliato**.
 *
 * Tre visti nello stesso giorno, tutti dello stesso tipo:
 *
 *   · `materializePayouts` — l'azione che **scrive** i compensi — costruiva le
 *     righe senza `project_value`. Nessuna risultava eleggibile al fondo
 *     rischio (§186: sopra 20.000 € ciascun socio scende dal 28% al 25%), e su
 *     Seven copiava in tabella **4.340,78 € a socio invece di 4.045,95**.
 *   · `verify-cash` aveva lo stesso buco, quindi il controllo confermava
 *     l'errore invece di trovarlo.
 *   · il report per il consiglio non portava `installment_id` e diceva un
 *     centesimo diverso dalla pagina: un centesimo, ma due cifre con lo stesso
 *     nome sotto gli occhi degli stessi tre soci.
 *
 * Il problema non è la disattenzione: è che **niente costringeva a ricordare**.
 * Perciò qui non c'è solo un mapper, c'è un elenco dei campi tipizzato come
 * `Record<keyof RevenueLine, true>`: aggiungere un campo al motore **rompe la
 * compilazione** finché non lo si dichiara, e il gate verifica che il mapper lo
 * porti davvero. La checklist è il tipo, non la buona volontà.
 *
 * Il contesto (chi è il commerciale del cliente, quali progetti copre un
 * accordo, quanto vale un progetto venduto) si costruisce una volta con
 * `rowContext` e si riusa: sono tre `Map`, non tre query.
 */

import type { RevenueLine, CostLine, PlKind } from './pl'
import { coveredProjects, type Coverage, type RevenueStream } from './revenue'

type Row = Record<string, unknown>

const num = (v: unknown) => Number(v ?? 0)
const str = (v: unknown): string | null => (v == null ? null : String(v))
const iso = (v: unknown): string | null => (v == null ? null : String(v).slice(0, 10))

/**
 * Quello che serve sapere **oltre alla riga** per costruirne una completa.
 *
 * Sono tutte cose che stanno su altre tabelle e che la riga da sola non può
 * dire: di che mese è (lo dice `pl_months`), chi è il commerciale del cliente
 * (§185, l'anagrafica), quali progetti copre l'accordo (§207) e quanto vale
 * quel lavoro venduto (§186, decide il fondo rischio).
 */
export type RowCtx = {
  /** mese di ripiego quando l'id del mese non è nella mappa */
  month: string
  /** `pl_months.id` → mese ISO */
  monthOf: Map<string, string>
  /** cliente → commerciale in anagrafica */
  ownerOf: Map<string, { id: string | null; name: string | null }>
  /** contratto → i progetti che copre */
  coverage: Coverage
  /** contratto → la riga, per il progetto e per il valore venduto */
  streamOf: Map<string, { id: string; project_id: string | null }>
  /** progetto → somma dei contratti non in bozza */
  soldOf: Map<string, number>
}

export function rowContext(input: {
  month: string
  months?: { id: unknown; month: unknown }[]
  clients?: Row[]
  streams?: Row[]
  streamProjects?: { stream_id: string; project_id: string }[]
}): RowCtx {
  const monthOf = new Map<string, string>()
  for (const m of input.months ?? []) monthOf.set(String(m.id), String(m.month).slice(0, 10))

  const ownerOf = new Map<string, { id: string | null; name: string | null }>()
  for (const c of input.clients ?? []) {
    ownerOf.set(String(c.id), {
      id: str(c.sales_owner_id), name: str(c.sales_owner_name),
    })
  }

  const coverage: Coverage = new Map()
  for (const b of input.streamProjects ?? []) {
    coverage.set(b.stream_id, [...(coverage.get(b.stream_id) ?? []), b.project_id])
  }

  const streamOf = new Map<string, { id: string; project_id: string | null }>()
  /* §186 — il valore venduto è la somma dei contratti **non in bozza**: una
     quotazione che nessuno ha firmato non rende un progetto «grosso». */
  const soldOf = new Map<string, number>()
  for (const s of input.streams ?? []) {
    const id = String(s.id)
    streamOf.set(id, { id, project_id: str(s.project_id) })
    const pid = str(s.project_id)
    if (!pid || s.status === 'bozza') continue
    soldOf.set(pid, (soldOf.get(pid) ?? 0) + num(s.amount))
  }

  return { month: input.month, monthOf, ownerOf, coverage, streamOf, soldOf }
}

/** Un contesto vuoto: per chi ha una riga sola e nessuna tabella intorno. */
export const emptyCtx = (month: string): RowCtx => rowContext({ month })

/**
 * I progetti che una riga tocca. Con un accordo su un solo lavoro è quello;
 * con più d'uno la riga **non ne porta nessuno** (§188) ma li conosce tutti,
 * perché il margine digital deve togliere i subappalti di ciascuno.
 */
function projectsOf(streamId: string | null, ctx: RowCtx): string[] {
  const s = streamId ? ctx.streamOf.get(streamId) : null
  return s ? coveredProjects(s as unknown as RevenueStream, ctx.coverage) : []
}

function soldValue(list: string[], fallback: string | null, ctx: RowCtx): number | null {
  const from = list.length ? list : fallback ? [fallback] : []
  const total = from.reduce((n, p) => n + (ctx.soldOf.get(p) ?? 0), 0)
  return total > 0 ? total : null
}

/**
 * Ogni campo che il motore legge da una riga di ricavo.
 *
 * `Record<keyof RevenueLine, true>` è la ragione per cui questo elenco esiste:
 * aggiungere un campo a `RevenueLine` senza aggiungerlo qui **non compila**, e
 * il gate controlla che il mapper lo porti davvero da una riga di database.
 * Prima l'unica difesa era ricordarsene in dieci posti.
 */
export const REVENUE_FIELDS: Record<keyof RevenueLine, true> = {
  id: true, label: true, client_id: true, plan_amount: true, invoices: true,
  amount_net: true, vat_rate: true, invoice_sent: true, paid: true, kind: true,
  sales_owner_id: true, sales_owner: true, sales_origin: true,
  client_sales_owner_id: true, client_sales_owner: true, origin: true,
  project_id: true, project_ids: true, stream_id: true, installment_id: true,
  project_value: true, risk_fund: true, pass_through: true,
  month: true, paid_on: true, due_date: true, terms: true,
  carried_at: true, carried_from: true, carry_count: true,
}

export const COST_FIELDS: Record<keyof CostLine, true> = {
  id: true, center_id: true, cost_item_id: true, project_id: true,
  installment_id: true, partner_id: true, deductible_pct: true,
  category: true, label: true, cost_type: true, budget: true, actual: true,
  paid: true, vat_applied: true, vat_rate: true,
  month: true, paid_on: true, due_date: true, terms: true,
  carried_at: true, carried_from: true, carry_count: true,
}

export type RevRow = RevenueLine & { month: string }
export type CostRow = CostLine & { month: string }

/** Da `pl_revenue_lines` alla riga che il motore capisce. */
export function toRevenueLine(r: Row, ctx: RowCtx): RevRow {
  const streamId = str(r.stream_id)
  const covered = projectsOf(streamId, ctx)
  const clientId = str(r.client_id)
  const owner = clientId ? ctx.ownerOf.get(clientId) : undefined

  return {
    id: String(r.id),
    label: String(r.label ?? ''),
    client_id: clientId,
    plan_amount: num(r.plan_amount),
    invoices: num(r.invoices),
    amount_net: num(r.amount_net),
    vat_rate: num(r.vat_rate),
    invoice_sent: r.invoice_sent === true,
    paid: r.paid === true,
    kind: (r.kind === 'digital' ? 'digital' : 'growth') as PlKind,
    sales_owner_id: str(r.sales_owner_id),
    sales_owner: str(r.sales_owner),
    sales_origin: (str(r.sales_origin) as RevenueLine['sales_origin']) ?? null,
    /* §185 — il commerciale dell'anagrafica, per le righe che non ne portano
       uno loro. Senza, `ownerOf` legge la riga come inbound e divide la
       provvigione fra i soci: il numero torna lo stesso, ma esce dalla tasca
       sbagliata. */
    client_sales_owner_id: owner?.id ?? null,
    client_sales_owner: owner?.name ?? null,
    origin: (str(r.origin) as RevenueLine['origin']) ?? 'manuale',
    project_id: str(r.project_id),
    // §207 — i progetti dell'accordo, non solo quello scritto sulla riga
    project_ids: covered,
    stream_id: streamId,
    // §285 — la rata da cui nasce: la chiave con cui il subappalto la trova
    installment_id: str(r.installment_id),
    // §186 — il valore venduto decide se l'opzione fondo rischio esiste
    project_value: soldValue(covered, str(r.project_id), ctx),
    risk_fund: r.risk_fund === true,
    pass_through: r.pass_through === true,
    // §224 — competenza e movimento: senza la 203 restano nulli e il motore
    // legge come prima, invece di spostare numeri su una data che non esiste
    month: ctx.monthOf.get(String(r.month_id)) ?? ctx.month,
    paid_on: iso(r.paid_on),
    due_date: iso(r.due_date),
    terms: str(r.terms),
    // §290 — il segno che la chiusura del mese lascia sulle righe scoperte. Il
    // motore non lo guarda: dice a chi la mostra da quanto quella riga gira.
    carried_at: iso(r.carried_at),
    carried_from: iso(r.carried_from),
    carry_count: r.carry_count == null ? 0 : num(r.carry_count),
  }
}

/** Da `pl_cost_lines` alla riga che il motore capisce. */
export function toCostLine(c: Row, ctx: RowCtx): CostRow {
  return {
    id: String(c.id),
    center_id: str(c.center_id),
    // se c'è la voce di piano, il preventivato lo scrive il piano
    cost_item_id: str(c.cost_item_id),
    // §186 — un costo con un progetto è un subappalto: esce dal margine digital
    project_id: str(c.project_id),
    // §285 — e se dichiara la rata, esce dal margine **di quella riga**
    installment_id: str(c.installment_id),
    // §191 — spesa di un socio col suo sottoconto: erogato, non struttura
    partner_id: str(c.partner_id),
    deductible_pct: c.deductible_pct == null ? 1 : num(c.deductible_pct),
    category: String(c.category ?? ''),
    label: String(c.label ?? ''),
    cost_type: c.cost_type === 'V' ? 'V' : 'F',
    budget: num(c.budget),
    actual: num(c.actual),
    paid: c.paid === true,
    vat_applied: c.vat_applied === true,
    vat_rate: num(c.vat_rate),
    month: ctx.monthOf.get(String(c.month_id)) ?? ctx.month,
    paid_on: iso(c.paid_on),
    due_date: iso(c.due_date),
    terms: str(c.terms),
    // §290 — vedi `toRevenueLine`
    carried_at: iso(c.carried_at),
    carried_from: iso(c.carried_from),
    carry_count: c.carry_count == null ? 0 : num(c.carry_count),
  }
}

/** Le due mappature in blocco: è così che le usano tutti i chiamanti. */
export const toRevenueLines = (rows: Row[] | null | undefined, ctx: RowCtx): RevRow[] =>
  (rows ?? []).map(r => toRevenueLine(r, ctx))
export const toCostLines = (rows: Row[] | null | undefined, ctx: RowCtx): CostRow[] =>
  (rows ?? []).map(c => toCostLine(c, ctx))
