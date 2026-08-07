/**
 * §207 — riportare le righe del mese a quello che dice il contratto.
 *
 * Una riga di conto economico nata da un accordo ne è una **copia**, presa nel
 * momento in cui il mese si prepara. Per i fatti del mese è giusto così: se ad
 * agosto la fattura è partita, l'ha detto agosto. Ma il **tipo** di lavoro non
 * è un fatto del mese, è l'accordo: correggerlo sul contratto e lasciare la
 * riga com'era significa continuare a pagare il 15% growth su un digital, e
 * nessuna pagina lo dice — c'è solo un lucchetto che rimanda a una sezione dove
 * la correzione non produce niente.
 *
 * Due regole:
 *   · si toccano **solo i mesi aperti**. Un mese chiuso è una fotografia, e una
 *     fotografia non si aggiorna perché la realtà è cambiata dopo.
 *   · si toccano **solo i campi dell'accordo** (tipo, progetto, IVA, partita di
 *     giro). Gli importi no: un canone partito a metà mese vale mezzo canone, e
 *     quella è una decisione presa da una persona guardando il mese.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  contractDrift, type ContractDrift, type Coverage, type LineFacts, type RevenueStream,
} from '@/lib/revenue'

type Admin = ReturnType<typeof createAdminClient>

/**
 * §188 — quali progetti copre ciascun accordo. Se la 188 non è stata eseguita
 * la tabella non c'è: si degrada a `revenue_streams.project_id`, che è come
 * funzionava prima, invece di far fallire la pagina.
 */
export async function loadCoverage(admin: Admin, streamIds?: string[]): Promise<Coverage> {
  const q = admin.from('revenue_stream_projects').select('stream_id, project_id')
  const { data, error } = streamIds?.length ? await q.in('stream_id', streamIds) : await q
  const out: Coverage = new Map()
  if (error) return out
  for (const r of (data ?? []) as { stream_id: string; project_id: string }[]) {
    out.set(r.stream_id, [...(out.get(r.stream_id) ?? []), r.project_id])
  }
  return out
}

type LineRow = LineFacts & { month_id: string }

/**
 * Le righe da contratto dei mesi **aperti**, con quello che serve a confrontarle.
 * Il filtro sullo stato passa dal join: filtrare dopo, sulle righe già caricate,
 * vorrebbe dire caricare anche i mesi chiusi per poi scartarli — e prima o poi
 * qualcuno si dimentica di scartarli.
 */
async function openLines(admin: Admin, opts: { streamIds?: string[]; month?: string }) {
  let q = admin.from('pl_revenue_lines')
    .select('id, label, stream_id, kind, project_id, vat_rate, pass_through, month_id, pl_months!inner(month, status)')
    .not('stream_id', 'is', null)
    .eq('pl_months.status', 'aperto')
  if (opts.streamIds?.length) q = q.in('stream_id', opts.streamIds)
  if (opts.month) q = q.eq('pl_months.month', opts.month)
  const { data, error } = await q
  if (error) return []
  return (data ?? []) as unknown as LineRow[]
}

/**
 * Cosa non combacia più, senza scrivere niente. È la stessa funzione pura che
 * usa la pagina: la diagnosi e la riparazione non possono divergere.
 */
export async function driftFor(
  admin: Admin,
  opts: { streamIds?: string[]; month?: string } = {},
): Promise<ContractDrift[]> {
  const lines = await openLines(admin, opts)
  if (!lines.length) return []

  const ids = Array.from(new Set(lines.map(l => l.stream_id!).filter(Boolean)))
  const [{ data: streams }, coverage] = await Promise.all([
    admin.from('revenue_streams').select('*').in('id', ids),
    loadCoverage(admin, ids),
  ])
  return contractDrift(lines, (streams ?? []) as unknown as RevenueStream[], coverage)
}

/**
 * Riallinea e dice quante righe ha toccato. Zero non è un errore: vuol dire
 * che il mese già diceva quello che dice l'accordo.
 */
export async function realignLines(
  opts: { streamIds?: string[]; month?: string } = {},
): Promise<number> {
  const admin = createAdminClient()
  const drift = await driftFor(admin, opts)
  if (!drift.length) return 0

  for (const d of drift) {
    const { error } = await admin.from('pl_revenue_lines').update(d.patch).eq('id', d.lineId)
    if (error) throw new Error(error.message)
  }
  return drift.length
}

/* ── §209 — spostare la scadenza sposta il mese ────────────────────────────── */

/**
 * Cambiare il mese di una rata o di una lavorazione e lasciare la riga dov'era
 * significa **due mesi sbagliati**: quello che perde il fatto continua a
 * contarlo e quello che lo riceve non lo vede. Sul digital il danno è doppio,
 * perché il margine è ricavo meno subappalti *dello stesso mese*: spostare il
 * grafico da luglio ad agosto senza spostarne la riga tiene 650 € fuori dal
 * margine di luglio e li lascia dentro quello di agosto.
 *
 * I compensi non vanno riallineati: non sono scritti da nessuna parte, si
 * ricalcolano a ogni lettura da queste righe. È il motivo per cui basta mettere
 * la riga nel mese giusto perché tutto il resto torni da sé.
 */
export type MoveOutcome =
  | { moved: true; from: string; to: string }
  | { moved: false; reason: 'ferma' | 'non materializzata' | 'mese chiuso' }

/** Il mese di destinazione, creandolo se non c'è. Null se è chiuso. */
async function openMonthId(admin: Admin, month: string): Promise<string | null> {
  const { data } = await admin.from('pl_months').select('id, status').eq('month', month).maybeSingle()
  if (data) return (data as { status: string }).status === 'chiuso' ? null : (data as { id: string }).id
  /* Il mese non c'è: si crea vuoto. Cancellare la riga e aspettare che qualcuno
     apra il mese giusto sarebbe più prudente e meno vero — la scadenza esiste,
     e un mese vuoto lo dice; una riga cancellata no. */
  const { data: created, error } = await admin.from('pl_months')
    .insert({ month }).select('id').single()
  if (error) throw new Error(error.message)
  return (created as { id: string }).id
}

async function moveLine(
  admin: Admin,
  table: 'pl_revenue_lines' | 'pl_cost_lines',
  lineId: string,
  currentMonth: string,
  currentStatus: string,
  target: string,
): Promise<MoveOutcome> {
  if (currentMonth === target) return { moved: false, reason: 'ferma' }
  // un mese chiuso è una fotografia: non perde una riga e non ne guadagna una
  if (currentStatus === 'chiuso') return { moved: false, reason: 'mese chiuso' }
  const to = await openMonthId(admin, target)
  if (!to) return { moved: false, reason: 'mese chiuso' }

  const { error } = await admin.from(table).update({ month_id: to }).eq('id', lineId)
  if (error) throw new Error(error.message)
  return { moved: true, from: currentMonth, to: target }
}

const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`

/** La rata si è spostata: la riga di ricavo la segue. */
export async function moveInstallmentLine(installmentId: string): Promise<MoveOutcome> {
  const admin = createAdminClient()
  const { data: inst } = await admin.from('revenue_installments')
    .select('due_month').eq('id', installmentId).maybeSingle()
  if (!inst) return { moved: false, reason: 'non materializzata' }

  const { data: line } = await admin.from('pl_revenue_lines')
    .select('id, pl_months!inner(month, status)').eq('installment_id', installmentId).maybeSingle()
  if (!line) return { moved: false, reason: 'non materializzata' }

  const m = (line as unknown as { pl_months: { month: string; status: string } }).pl_months
  return moveLine(admin, 'pl_revenue_lines', (line as { id: string }).id,
    firstOfMonth(m.month), m.status, firstOfMonth((inst as { due_month: string }).due_month))
}

/** L'importo della rata è cambiato: nel mese aperto vale il nuovo. */
export async function syncInstallmentAmount(installmentId: string, amount: number): Promise<void> {
  if (!Number.isFinite(amount)) return
  const admin = createAdminClient()
  const { data: line } = await admin.from('pl_revenue_lines')
    .select('id, pl_months!inner(status)').eq('installment_id', installmentId).maybeSingle()
  if (!line) return
  if ((line as unknown as { pl_months: { status: string } }).pl_months.status === 'chiuso') return
  const { error } = await admin.from('pl_revenue_lines')
    .update({ amount_net: amount, plan_amount: amount }).eq('id', (line as { id: string }).id)
  if (error) throw new Error(error.message)
}

/**
 * La rata non esiste più: la riga del mese neanche.
 *
 * Il vincolo è `ON DELETE SET NULL`, quindi senza questo la riga resterebbe nel
 * conto economico come ricavo `origin='contratto'` senza più un contratto
 * dietro — invisibile a ogni controllo, perché tutti partono dalla rata.
 */
export async function dropInstallmentLines(installmentIds: string[]): Promise<number> {
  if (!installmentIds.length) return 0
  const admin = createAdminClient()
  const { data: lines } = await admin.from('pl_revenue_lines')
    .select('id, pl_months!inner(status)').in('installment_id', installmentIds)
  const removable = ((lines ?? []) as unknown as { id: string; pl_months: { status: string } }[])
    .filter(l => l.pl_months.status !== 'chiuso').map(l => l.id)
  if (!removable.length) return 0
  const { error } = await admin.from('pl_revenue_lines').delete().in('id', removable)
  if (error) throw new Error(error.message)
  return removable.length
}

/**
 * Le occorrenze già nel conto economico di una voce di piano che sta per
 * sparire — perché la si rateizza, e al suo posto arrivano le sue tranche.
 *
 * Il vincolo è `ON DELETE SET NULL`: senza toglierle, la riga intera resta nel
 * suo mese come costo senza più una voce dietro **e** le tranche entrano nei
 * loro mesi. Lo stesso lavoro pagato due volte, con la seconda invisibile a
 * ogni controllo che parte dal piano.
 *
 * Quelle **pagate** non si toccano e si restituiscono al chiamante: lì il
 * denaro è uscito davvero, e cancellare un fatto per far quadrare un piano è
 * il modo sbagliato di far tornare i conti.
 */
export async function dropCostItemLines(itemId: string): Promise<{
  dropped: number
  paid: { label: string; month: string }[]
}> {
  const admin = createAdminClient()
  const { data } = await admin.from('pl_cost_lines')
    .select('id, label, paid, pl_months!inner(month, status)').eq('cost_item_id', itemId)
  const rows = (data ?? []) as unknown as
    { id: string; label: string; paid: boolean; pl_months: { month: string; status: string } }[]

  const paid = rows.filter(r => r.paid || r.pl_months.status === 'chiuso')
    .map(r => ({ label: r.label, month: r.pl_months.month }))
  const removable = rows.filter(r => !r.paid && r.pl_months.status !== 'chiuso').map(r => r.id)
  if (removable.length) {
    const { error } = await admin.from('pl_cost_lines').delete().in('id', removable)
    if (error) throw new Error(error.message)
  }
  return { dropped: removable.length, paid }
}

/**
 * Una lavorazione «una tantum» vive in un mese solo (§193): se il piano la
 * sposta, si sposta l'occorrenza invece di crearne una seconda — che il
 * database rifiuterebbe, dicendo giustamente «spostala invece di duplicarla».
 * Le ricorrenti non si spostano: hanno un'occorrenza per mese, e cambiare la
 * finestra non dice quale mese debba emigrare dove.
 */
export async function moveOneShotCostLine(itemId: string): Promise<MoveOutcome> {
  const admin = createAdminClient()
  const { data: item } = await admin.from('cost_items')
    .select('frequency, start_month').eq('id', itemId).maybeSingle()
  const it = item as { frequency: string; start_month: string | null } | null
  if (!it || it.frequency !== 'una_tantum' || !it.start_month) {
    return { moved: false, reason: 'non materializzata' }
  }

  const { data: line } = await admin.from('pl_cost_lines')
    .select('id, pl_months!inner(month, status)').eq('cost_item_id', itemId).maybeSingle()
  if (!line) return { moved: false, reason: 'non materializzata' }

  const m = (line as unknown as { pl_months: { month: string; status: string } }).pl_months
  return moveLine(admin, 'pl_cost_lines', (line as { id: string }).id,
    firstOfMonth(m.month), m.status, firstOfMonth(it.start_month))
}
