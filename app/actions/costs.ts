'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { plannedForMonth, type CostItem } from '@/lib/costs'
import { buildSchedule, type ScheduleSpec } from '@/lib/revenue'

const PATH = '/economics/costi'

/** Budget e struttura di costo: admin e basta, come il resto dell'economics. */
async function requireAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role, email').eq('id', user.id).single()
  const ok = p?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(p?.email ?? '')
  if (!ok) throw new Error('Permesso negato: i costi aziendali sono riservati agli admin')
  return user.id
}

function rev() {
  revalidatePath(PATH)
  revalidatePath('/economics')
}

// ── Aree ─────────────────────────────────────────────────────────────────────

export type CenterInput = Partial<{
  name: string; description: string | null; monthly_budget: number
  sort_order: number; is_active: boolean
}>

export async function addCenter(input: CenterInput = {}) {
  await requireAdmin()
  const admin = createAdminClient()
  const { count } = await admin.from('cost_centers').select('id', { count: 'exact', head: true })
  const { data, error } = await admin.from('cost_centers')
    .insert({ name: 'Nuova area', sort_order: (count ?? 0) * 10, ...input })
    .select('*').single()
  if (error) throw new Error(error.message)
  rev()
  return data
}

export async function updateCenter(id: string, patch: CenterInput) {
  await requireAdmin()
  const { error } = await createAdminClient().from('cost_centers')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

/**
 * Eliminare un'area non deve far sparire la storia: le voci di piano e le
 * uscite già registrate restano, senza area (ON DELETE SET NULL). Se ci sono
 * ancora voci attive lo si dice, invece di lasciarle orfane in silenzio.
 */
export async function deleteCenter(id: string) {
  await requireAdmin()
  const admin = createAdminClient()
  const { count } = await admin.from('cost_items')
    .select('id', { count: 'exact', head: true }).eq('center_id', id).eq('is_active', true)
  const { error } = await admin.from('cost_centers').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev()
  return { orphaned: count ?? 0 }
}

// ── Voci di piano ────────────────────────────────────────────────────────────

export type ItemInput = Partial<{
  center_id: string | null; project_id: string | null; category: string; label: string
  cost_type: 'F' | 'V'; amount: number
  frequency: 'mensile' | 'bimestrale' | 'trimestrale' | 'semestrale' | 'annuale' | 'una_tantum'
  vat_applied: boolean; vat_rate: number; supplier: string | null; payment_terms: string | null
  start_month: string | null; end_month: string | null
  is_active: boolean; note: string | null; sort_order: number
}>

export async function addCostItem(input: ItemInput = {}) {
  await requireAdmin()
  const admin = createAdminClient()
  const { count } = await admin.from('cost_items').select('id', { count: 'exact', head: true })
  const { data, error } = await admin.from('cost_items')
    .insert({ category: 'Generale', label: 'Nuova voce', sort_order: (count ?? 0) * 10, ...input })
    .select('*').single()
  if (error) throw new Error(error.message)
  rev()
  return data
}

export async function updateCostItem(id: string, patch: ItemInput) {
  await requireAdmin()
  const { error } = await createAdminClient().from('cost_items')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

export async function deleteCostItem(id: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('cost_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

// ── Budget per mese ──────────────────────────────────────────────────────────

/** Il tetto di un'area per un mese preciso. Importo a zero = si torna all'ordinario. */
export async function setMonthBudget(centerId: string, month: string, amount: number | null) {
  await requireAdmin()
  const admin = createAdminClient()

  if (amount === null) {
    const { error } = await admin.from('cost_budgets').delete()
      .eq('center_id', centerId).eq('month', month)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await admin.from('cost_budgets')
      .upsert({ center_id: centerId, month, amount }, { onConflict: 'center_id,month' })
    if (error) throw new Error(error.message)
  }
  rev()
}

// ── Dal piano al conto economico ─────────────────────────────────────────────

/**
 * Porta nel mese le voci di piano che ci cadono.
 *
 * Il preventivato lo scrive il piano, la spesa reale no: quella è il consuntivo
 * e la si registra guardando l'estratto conto. Idempotente per costruzione —
 * l'indice unico su (mese, voce di piano) impedisce il doppione, e qui si
 * saltano a monte quelle già presenti, così rilanciarlo aggiunge soltanto ciò
 * che manca (una spesa nuova aggiunta a metà mese).
 */
export async function applyPlanToMonth(month: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: monthRow } = await admin.from('pl_months').select('id, status').eq('month', month).maybeSingle()
  if (!monthRow) throw new Error('Il mese non esiste ancora: aprilo dal conto economico')
  if (monthRow.status === 'chiuso') throw new Error('Il mese è chiuso: riaprilo prima di toccarne le uscite')

  const { data: items, error } = await admin.from('cost_items').select('*').eq('is_active', true).order('sort_order')
  if (error) throw new Error(error.message)

  const due = plannedForMonth((items ?? []) as CostItem[], month)
  if (!due.length) return 0

  const { data: existing } = await admin.from('pl_cost_lines')
    .select('cost_item_id').eq('month_id', monthRow.id).not('cost_item_id', 'is', null)
  const already = new Set((existing ?? []).map((r: { cost_item_id: string }) => r.cost_item_id))

  const { count } = await admin.from('pl_cost_lines')
    .select('id', { count: 'exact', head: true }).eq('month_id', monthRow.id)
  const base = count ?? 0

  const rows = due.filter(i => !already.has(i.id)).map((i, n) => ({
    month_id: monthRow.id,
    center_id: i.center_id,
    // il subappalto porta con sé il progetto: è così che la marginalità resta
    // leggibile anche a mese chiuso
    project_id: i.project_id ?? null,
    cost_item_id: i.id,
    category: i.category,
    label: i.label,
    cost_type: i.cost_type,
    budget: Number(i.amount),
    actual: 0,
    paid: false,
    vat_applied: i.vat_applied,
    vat_rate: Number(i.vat_rate),
    note: i.supplier,
    sort_order: (base + n) * 10,
  }))
  if (!rows.length) return 0

  const { error: e2 } = await admin.from('pl_cost_lines').insert(rows)
  if (e2) throw new Error(e2.message)
  rev()
  return rows.length
}

/**
 * L'opposto: una riga di uscita nata a mano diventa una voce ricorrente.
 * Le spese vere si scoprono quasi sempre così — pagando, non pianificando.
 */
export async function promoteLineToPlan(lineId: string, frequency: ItemInput['frequency'] = 'mensile') {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: line, error } = await admin.from('pl_cost_lines')
    .select('*, pl_months!inner(month)').eq('id', lineId).single()
  if (error) throw new Error(error.message)
  if (line.cost_item_id) throw new Error('Questa uscita viene già dal piano')

  const month = (line.pl_months as { month: string }).month
  const { data: item, error: e2 } = await admin.from('cost_items').insert({
    center_id: line.center_id,
    category: line.category,
    label: line.label,
    cost_type: line.cost_type,
    // il preventivato se c'è, altrimenti quanto è uscito davvero
    amount: Number(line.budget) || Number(line.actual),
    frequency,
    vat_applied: line.vat_applied,
    vat_rate: line.vat_rate,
    start_month: month,
  }).select('id').single()
  if (e2) throw new Error(e2.message)

  const { error: e3 } = await admin.from('pl_cost_lines')
    .update({ cost_item_id: item.id }).eq('id', lineId)
  if (e3) throw new Error(e3.message)
  rev()
  return item.id as string
}

// ── Subappalti: il costo che appartiene a un progetto ────────────────────────

const DELIVERY_AREA = 'Delivery & Fornitori'

/**
 * Una lavorazione affidata fuori. È una voce di piano come le altre — cade nei
 * mesi giusti, entra nel conto economico, pesa sul budget — con in più il
 * progetto a cui appartiene, che è quello che serve per la marginalità.
 *
 * Nasce **variabile**: un subappalto si paga perché c'è un lavoro venduto da
 * consegnare, non perché esiste l'azienda. E finisce da sé nell'area delivery,
 * senza che nessuno debba ricordarselo.
 */
export async function addProjectCost(projectId: string, input: ItemInput = {}) {
  await requireAdmin()
  const admin = createAdminClient()

  let centerId = input.center_id ?? null
  if (!centerId) {
    const { data: c } = await admin.from('cost_centers').select('id').eq('name', DELIVERY_AREA).maybeSingle()
    centerId = c?.id ?? null
  }

  const { data, error } = await admin.from('cost_items').insert({
    project_id: projectId,
    center_id: centerId,
    category: 'Subappalto',
    label: 'Nuovo fornitore',
    cost_type: 'V',
    frequency: 'una_tantum',
    amount: 0,
    // fattura di un fornitore: l'IVA c'è ed è detraibile. L'importo che si
    // scrive resta imponibile, come tutti gli accordi
    vat_applied: true,
    ...input,
  }).select('*').single()
  if (error) throw new Error(error.message)

  revalidatePath(`/progetti/${projectId}`)
  rev()
  return data
}

/**
 * Il subappalto ricalcato sull'accordo col cliente.
 *
 * Quando affidi fuori una lavorazione, il patto con chi la esegue parte quasi
 * sempre da quello che hai col cliente: stessa struttura (canone o a corpo),
 * stesse date, stesso metodo di pagamento. Non è una regola, è il punto di
 * partenza — l'importo lo fa il fornitore e tutto il resto si può cambiare.
 */
export async function addProjectCostFromContract(projectId: string, streamId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  // `select('*')`: il metodo di pagamento arriva con la 174 e prima non c'è.
  // Chiederlo per nome faceva fallire tutto il ricalco per una colonna che è
  // un di più — la struttura dell'accordo si copia comunque.
  const { data: s, error } = await admin.from('revenue_streams')
    .select('*').eq('id', streamId).single()
  if (error) throw new Error(error.message)

  const terms = (s as { payment_terms?: string | null }).payment_terms

  return addProjectCost(projectId, {
    label: `Subappalto — ${s.label}`,
    // canone del cliente → canone al fornitore; lavoro a corpo → una tantum
    frequency: s.billing === 'recurring' ? 'mensile' : 'una_tantum',
    start_month: s.start_date ? s.start_date.slice(0, 8) + '01' : null,
    end_month: s.billing === 'recurring' && s.end_date ? s.end_date.slice(0, 8) + '01' : null,
    ...(terms !== undefined ? { payment_terms: terms } : {}),
    category: 'Subappalto',
  })
}

/**
 * Le rate del fornitore ricalcate su quelle del cliente.
 *
 * Le stesse percentuali negli stessi mesi: se il cliente paga 40/30/30, il
 * fornitore incassa 40/30/30 e la cassa non va sotto in mezzo. Ogni rata
 * diventa una voce una tantum sul suo mese — è il modo in cui il motore dei
 * costi sa già far cadere una spesa in un mese preciso.
 *
 * La voce di partenza sparisce: al suo posto ci sono le sue rate.
 */
export async function splitCostLikeClient(itemId: string, streamId: string, projectId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const [{ data: item, error: e1 }, { data: stream, error: e2 }] = await Promise.all([
    admin.from('cost_items').select('*').eq('id', itemId).single(),
    admin.from('revenue_streams').select('amount').eq('id', streamId).single(),
  ])
  if (e1) throw new Error(e1.message)
  if (e2) throw new Error(e2.message)
  if (Number(item.amount) <= 0) throw new Error('Metti prima l\'importo concordato col fornitore')

  const { data: inst } = await admin.from('revenue_installments')
    .select('due_month, label, amount').eq('stream_id', streamId).order('due_month')
  if (!inst?.length) throw new Error('Il contratto col cliente non ha un piano di rate da ricalcare')

  const clientTotal = Number(stream.amount) || inst.reduce((s, i) => s + Number(i.amount), 0)
  const total = Number(item.amount)

  let used = 0
  const rate = inst.map((i, n) => {
    const share = clientTotal > 0 ? Number(i.amount) / clientTotal : 1 / inst.length
    // l'ultima assorbe l'arrotondamento: la somma deve fare il totale, sempre
    const amount = n === inst.length - 1
      ? Math.round((total - used) * 100) / 100
      : Math.round(total * share * 100) / 100
    used += amount
    return { month: i.due_month, label: i.label ?? `Rata ${n + 1}`, amount }
  })

  return materializeCostPlan(admin, item, projectId, rate)
}

/**
 * Il piano di pagamento del fornitore costruito a mano: acconto, rate, tranche.
 * Stesso costruttore del lato cliente — un accordo è un accordo, cambia solo
 * chi paga chi.
 */
export async function splitCostCustom(itemId: string, projectId: string, spec: ScheduleSpec) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: item, error } = await admin.from('cost_items').select('*').eq('id', itemId).single()
  if (error) throw new Error(error.message)
  if (Number(item.amount) <= 0) throw new Error('Metti prima l\'importo concordato col fornitore')

  const drafts = buildSchedule(Number(item.amount), spec)
  if (!drafts.length) throw new Error('Piano vuoto: controlla le percentuali')

  return materializeCostPlan(admin, item, projectId,
    drafts.map(d => ({ month: d.due_month, label: d.label, amount: d.amount })))
}

/**
 * Da una voce sola alle sue rate: ognuna diventa una voce una tantum sul mese
 * in cui si paga, perché è così che il motore dei costi sa farla cadere in un
 * mese preciso. La voce di partenza sparisce: al suo posto ci sono le sue rate.
 */
async function materializeCostPlan(
  admin: ReturnType<typeof createAdminClient>,
  item: Record<string, unknown>,
  projectId: string,
  rate: { month: string; label: string; amount: number }[],
) {
  const rows = rate.map((r, n) => ({
    project_id: projectId,
    center_id: item.center_id,
    category: item.category,
    label: `${item.label} — ${r.label}`,
    cost_type: item.cost_type,
    amount: r.amount,
    frequency: 'una_tantum',
    vat_applied: item.vat_applied,
    vat_rate: item.vat_rate,
    supplier: item.supplier,
    ...(item.payment_terms !== undefined ? { payment_terms: item.payment_terms } : {}),
    start_month: r.month,
    is_active: item.is_active,
    sort_order: (Number(item.sort_order) || 0) + n,
  }))

  const { error: e1 } = await admin.from('cost_items').insert(rows)
  if (e1) throw new Error(e1.message)
  const { error: e2 } = await admin.from('cost_items').delete().eq('id', item.id as string)
  if (e2) throw new Error(e2.message)

  revalidatePath(`/progetti/${projectId}`)
  rev()
  return rows.length
}

/** Come sopra ma dal lato progetto: revalida anche la sua scheda. */
export async function updateProjectCost(id: string, projectId: string, patch: ItemInput) {
  await requireAdmin()
  const { error } = await createAdminClient().from('cost_items')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/progetti/${projectId}`)
  rev()
}

export async function deleteProjectCost(id: string, projectId: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('cost_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/progetti/${projectId}`)
  rev()
}

/** L'area di una singola uscita: si corregge dal conto economico, riga per riga. */
export async function setLineCenter(lineId: string, centerId: string | null) {
  await requireAdmin()
  const { error } = await createAdminClient().from('pl_cost_lines')
    .update({ center_id: centerId }).eq('id', lineId)
  if (error) throw new Error(error.message)
  rev()
}
