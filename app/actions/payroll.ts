'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { ContractKind, PayrollParams } from '@/lib/payroll'

async function requireAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role, email').eq('id', user.id).single()
  const ok = p?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(p?.email ?? '')
  if (!ok) throw new Error('Le retribuzioni le gestiscono solo gli admin')
  return user.id
}

function rev() {
  revalidatePath('/economics/personale')
  revalidatePath('/economics')
  revalidatePath('/economics/costi')
}

export type PersonPatch = Partial<{
  full_name: string
  role_label: string | null
  contract_kind: ContractKind
  gross_year: number
  months: number
  fte: number
  benefits_year: number
  meal_days: number
  meal_value: number
  with_rivalsa: boolean
  startup_rate: boolean
  from_month: number
  to_month: number
  tfr_opening: number
  birth_date: string | null
  has_children: boolean
  children_count: number
  dependent_spouse: boolean
  agreed_net: number | null
  status: 'attiva' | 'sospesa' | 'cessata'
  is_active: boolean
  note: string | null
  profile_id: string | null
}>

export async function addPerson(input: PersonPatch = {}): Promise<string> {
  await requireAdmin()
  const db = createAdminClient()
  const { data: last } = await db.from('hr_people')
    .select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await db.from('hr_people').insert({
    full_name: input.full_name?.trim() || 'Nuova persona',
    role_label: input.role_label ?? null,
    contract_kind: input.contract_kind ?? 'indeterminato',
    gross_year: input.gross_year ?? 0,
    months: input.months ?? 14,
    fte: input.fte ?? 1,
    sort_order: ((last as { sort_order: number } | null)?.sort_order ?? 0) + 10,
  }).select('id').single()

  if (error) throw new Error(error.message)
  rev()
  return data.id as string
}

export async function updatePerson(id: string, patch: PersonPatch) {
  await requireAdmin()
  /* Il mese di uscita non può precedere quello d'ingresso: il motore si difende
     da solo, ma un dato incoerente nel database confonde chiunque lo legga. */
  if (patch.from_month != null && patch.to_month != null && patch.to_month < patch.from_month) {
    throw new Error('Il mese di uscita viene prima di quello di ingresso')
  }
  const { error } = await createAdminClient().from('hr_people').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

export async function deletePerson(id: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('hr_people').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

export type ParamsPatch = Partial<Record<keyof PayrollParams, unknown>>

/**
 * Le aliquote si cambiano qui, non nel codice. Chi le tocca dichiara anche
 * quando le ha verificate: un numero senza una data di conferma resta una stima
 * e la pagina continua a dirlo.
 */
export async function updateParams(year: number, patch: Record<string, unknown>) {
  await requireAdmin()
  const { error } = await createAdminClient().from('hr_payroll_params')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('year', year)
  if (error) throw new Error(error.message)
  rev()
}

/** «Verificate col consulente il …»: è quello che toglie l'avviso dalla pagina. */
export async function markParamsVerified(year: number, by: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('hr_payroll_params').update({
    verified_at: new Date().toISOString().slice(0, 10),
    verified_by: by.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('year', year)
  if (error) throw new Error(error.message)
  rev()
}

/**
 * Porta il costo dell'organico nella voce «Persone» del mese.
 *
 * Una riga per persona, non un totale: dal conto economico si deve poter
 * risalire a chi genera quel costo. La riga è **sostituita**, non sommata —
 * rilanciare non raddoppia niente.
 */
export async function pushToProfitLoss(month: string): Promise<{ rows: number; total: number }> {
  await requireAdmin()
  const db = createAdminClient()

  const { data: monthRow } = await db.from('pl_months').select('id, status').eq('month', month).maybeSingle()
  if (!monthRow) throw new Error('Apri prima il mese dal conto economico')
  if (monthRow.status === 'chiuso') throw new Error('Il mese è chiuso: non si riscrive')

  const [{ data: people }, { data: prm }, { data: center }] = await Promise.all([
    db.from('hr_people').select('*').eq('is_active', true),
    db.from('hr_payroll_params').select('*').eq('year', Number(month.slice(0, 4))).maybeSingle(),
    db.from('cost_centers').select('id').ilike('name', 'Persone').maybeSingle(),
  ])
  if (!people?.length) throw new Error('Nessuna persona in organico')

  const { personCost, DEFAULT_PAYROLL_PARAMS, emptyPerson } = await import('@/lib/payroll')
  const { rowToParams, rowToPerson } = await import('@/lib/payroll-map')
  const params = prm ? rowToParams(prm as Record<string, unknown>) : DEFAULT_PAYROLL_PARAMS

  const rows = (people as Record<string, unknown>[]).map((r, i) => {
    const p = rowToPerson(r) ?? emptyPerson()
    const c = personCost(p, params)
    return {
      month_id: monthRow.id,
      center_id: (center as { id: string } | null)?.id ?? null,
      cost_item_id: null,
      project_id: null,
      category: 'Persone',
      label: `${p.name}${r.role_label ? ` — ${String(r.role_label)}` : ''}`,
      cost_type: 'F' as const,
      // il costo mensile di competenza: TFR e ratei inclusi, che è il punto
      budget: c.monthly,
      actual: 0,
      paid: false,
      sort_order: (i + 1) * 10,
    }
  })

  // sostituzione, non accumulo: si cancellano le righe generate prima
  await db.from('pl_cost_lines').delete().eq('month_id', monthRow.id).eq('category', 'Persone').is('project_id', null)
  const { error } = await db.from('pl_cost_lines').insert(rows)
  if (error) throw new Error(error.message)

  rev()
  return { rows: rows.length, total: Math.round(rows.reduce((s, r) => s + r.budget, 0) * 100) / 100 }
}

// ── §182: cedolini, fatture, F24, TFR ────────────────────────────────────────

export async function upsertPayslip(personId: string, month: string, patch: Record<string, unknown>) {
  await requireAdmin()
  const db = createAdminClient()
  const { data: found } = await db.from('hr_payslips')
    .select('id').eq('person_id', personId).eq('month', month).maybeSingle()

  const { error } = found
    ? await db.from('hr_payslips').update(patch).eq('id', found.id)
    : await db.from('hr_payslips').insert({ person_id: personId, month, ...patch })
  if (error) throw new Error(error.message)
  rev()
}

export async function deletePayslip(id: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('hr_payslips').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

export async function upsertInvoice(personId: string, month: string, patch: Record<string, unknown>) {
  await requireAdmin()
  const db = createAdminClient()
  const { data: found } = await db.from('hr_invoices')
    .select('id').eq('person_id', personId).eq('month', month).maybeSingle()

  const { error } = found
    ? await db.from('hr_invoices').update(patch).eq('id', found.id)
    : await db.from('hr_invoices').insert({ person_id: personId, month, ...patch })
  if (error) throw new Error(error.message)
  rev()
}

export async function deleteInvoice(id: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('hr_invoices').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

export async function upsertF24(month: string, patch: Record<string, unknown>) {
  await requireAdmin()
  const db = createAdminClient()
  const { data: found } = await db.from('hr_f24').select('id').eq('month', month).maybeSingle()
  const { error } = found
    ? await db.from('hr_f24').update(patch).eq('id', found.id)
    : await db.from('hr_f24').insert({ month, ...patch })
  if (error) throw new Error(error.message)
  rev()
}

export async function addTfrMovement(personId: string, month: string, kind: string, amount: number, note?: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('hr_tfr_movements')
    .insert({ person_id: personId, month, kind, amount, note: note ?? null })
  if (error) throw new Error(error.message)
  rev()
}

export async function deleteTfrMovement(id: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('hr_tfr_movements').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev()
}

/**
 * Porta nel conto economico il **costo di competenza** del mese, letto dai
 * documenti quando ci sono.
 *
 * Sostituisce la versione della 181, che partiva dalla RAL annua e divideva per
 * dodici: una stima buona per pianificare, sbagliata per consuntivare. Ora se
 * c'è il cedolino vale il cedolino; se c'è la fattura vale la fattura; la stima
 * resta solo per chi non ha ancora nessuno dei due, e la riga lo dichiara.
 *
 * Nel P&L va **solo il costo di competenza**. Il netto e l'F24 sono uscite di
 * cassa: metterli qui significherebbe contare gli stessi soldi due volte.
 */
export async function pushLedgerToProfitLoss(month: string): Promise<{ rows: number; total: number; estimated: number }> {
  await requireAdmin()
  const db = createAdminClient()

  const { data: monthRow } = await db.from('pl_months').select('id, status').eq('month', month).maybeSingle()
  if (!monthRow) throw new Error('Apri prima il mese dal conto economico')
  if (monthRow.status === 'chiuso') throw new Error('Il mese è chiuso: non si riscrive')

  const [{ data: people }, { data: prm }, { data: slips }, { data: invoices }, { data: center }] = await Promise.all([
    db.from('hr_people').select('*').eq('is_active', true),
    db.from('hr_payroll_params').select('*').eq('year', Number(month.slice(0, 4))).maybeSingle(),
    db.from('hr_payslips').select('*').eq('month', month),
    db.from('hr_invoices').select('*').eq('month', month),
    db.from('cost_centers').select('id').ilike('name', 'Persone').maybeSingle(),
  ])
  if (!people?.length) throw new Error('Nessuna persona in organico')

  const { personCost, payslipViews, invoiceViews, DEFAULT_PAYROLL_PARAMS } = await import('@/lib/payroll')
  const { rowToParams, rowToPerson, rowToPayslip, rowToInvoice } = await import('@/lib/payroll-map')
  const params = prm ? rowToParams(prm as Record<string, unknown>) : DEFAULT_PAYROLL_PARAMS

  const slipBy = new Map((slips ?? []).map(r => [String(r.person_id), rowToPayslip(r as Record<string, unknown>)]))
  const invBy = new Map((invoices ?? []).map(r => [String(r.person_id), rowToInvoice(r as Record<string, unknown>)]))

  let estimated = 0
  const rows = (people as Record<string, unknown>[]).map((r, i) => {
    const p = rowToPerson(r)
    const slip = slipBy.get(p.id)
    const invoice = invBy.get(p.id)

    let amount: number
    let source: string
    if (slip) {
      const v = payslipViews(slip, p.kind, params)
      amount = v.economic
      source = v.estimated ? 'cedolino, oneri datore stimati' : 'cedolino'
      if (v.estimated) estimated++
    } else if (invoice) {
      amount = invoiceViews(invoice).economic
      source = 'fattura'
    } else {
      // nessun documento: si stima dal contratto, e la riga lo dice
      amount = personCost(p, params).monthly
      source = 'stima da contratto'
      estimated++
    }

    return {
      month_id: monthRow.id,
      center_id: (center as { id: string } | null)?.id ?? null,
      cost_item_id: null, project_id: null,
      category: 'Persone',
      label: `${p.name}${p.role ? ` — ${p.role}` : ''}`,
      cost_type: 'F' as const,
      budget: amount,
      actual: amount,
      paid: slip?.paymentStatus === 'pagato' || invoice?.paymentStatus === 'pagata',
      note: source,
      sort_order: (i + 1) * 10,
    }
  })

  await db.from('pl_cost_lines').delete().eq('month_id', monthRow.id).eq('category', 'Persone').is('project_id', null)
  const { error } = await db.from('pl_cost_lines').insert(rows)
  if (error) throw new Error(error.message)

  rev()
  return {
    rows: rows.length,
    total: Math.round(rows.reduce((s, r) => s + r.budget, 0) * 100) / 100,
    estimated,
  }
}
