'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { kindFromClientType, shiftMonth, type PlConfig } from '@/lib/pl'
import { linesForMonth } from '@/lib/revenue'

const PATH = '/economics'

/** Il P&L è il dato più sensibile che c'è: admin e basta. */
async function requireAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role, email').eq('id', user.id).single()
  const ok = p?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(p?.email ?? '')
  if (!ok) throw new Error('Permesso negato: il conto economico è riservato agli admin')
  return user.id
}

export async function ensureMonth(month: string): Promise<string> {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  const { data: found } = await admin.from('pl_months').select('id').eq('month', month).maybeSingle()
  if (found) return found.id as string

  const { data, error } = await admin.from('pl_months')
    .insert({ month, created_by: uid }).select('id').single()
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
  return data.id as string
}

/**
 * Popola il mese dai clienti attivi e paganti.
 *
 * Copia, non collega: un mese chiuso deve restare quello che era anche se
 * domani l'MRR cambia. Non tocca le righe già presenti — rilanciarlo aggiunge
 * solo i clienti che mancano, così si può usare a mese iniziato.
 */
export async function generateRevenueFromClients(month: string) {
  await requireAdmin()
  const monthId = await ensureMonth(month)
  const admin = createAdminClient()

  const { data: existing } = await admin.from('pl_revenue_lines')
    .select('client_id, label').eq('month_id', monthId)
  const already = new Set((existing ?? []).map((r: { client_id: string | null; label: string }) =>
    `${r.client_id ?? ''}|${r.label}`))
  const base = existing?.length ?? 0

  // I contratti sono la fonte giusta: un cliente può averne più d'uno, con vite
  // diverse. Finché non ce ne sono, si ripiega sull'MRR in anagrafica, così chi
  // non ha ancora migrato continua a generare il mese.
  const { data: streams, error: streamErr } = await admin.from('revenue_streams').select('*')

  if (!streamErr && (streams ?? []).length) {
    const ids = (streams ?? []).map((s: { id: string }) => s.id)
    const { data: inst } = await admin.from('revenue_installments')
      .select('*').in('stream_id', ids)
    const { data: clients } = await admin.from('clients')
      .select('id, company_name, display_name, client_label, is_internal, sales_owner_id, sales_owner_name')

    const info = new Map((clients ?? []).map(c => [c.id, c]))
    // il commerciale scende a cascata: contratto → cliente. Il nome libero
    // copre chi porta clienti senza avere un account nel tool.
    const owner = (l: { client_id: string | null; sales_owner_id: string | null }, streamName: string | null) => {
      const c = l.client_id ? info.get(l.client_id) : null
      return {
        sales_owner_id: l.sales_owner_id ?? c?.sales_owner_id ?? null,
        sales_owner: streamName ?? c?.sales_owner_name ?? null,
      }
    }
    const streamName = new Map((streams ?? []).map((x: { id: string; sales_owner_name: string | null }) =>
      [x.id, x.sales_owner_name ?? null]))
    const rows = linesForMonth(streams as never, (inst ?? []) as never, month)
      .filter(l => {
        const c = info.get(l.client_id)
        return c && !c.is_internal && c.client_label !== 'perso'
      })
      .map((l, i) => ({
        month_id: monthId,
        client_id: l.client_id,
        // il nome del cliente davanti: in tabella si legge di chi è la riga
        label: `${info.get(l.client_id)?.display_name || info.get(l.client_id)?.company_name} · ${l.label}`,
        plan_amount: l.amount_net, invoices: 1, amount_net: l.amount_net,
        vat_rate: l.vat_rate, kind: l.kind,
        ...owner(l, streamName.get(l.stream_id) ?? null),
        invoice_sent: l.invoiced, paid: l.paid,
        sort_order: (base + i) * 10,
      }))
      .filter(r => !already.has(`${r.client_id}|${r.label}`))

    if (rows.length) {
      const { error } = await admin.from('pl_revenue_lines').insert(rows)
      if (error) throw new Error(error.message)
    }
    revalidatePath(PATH)
    return rows.length
  }

  const { data: clients } = await admin.from('clients')
    .select('id, company_name, display_name, mrr, client_type, client_label, is_internal, payment_status, sales_owner_id, sales_owner_name')
    .order('company_name')

  const rows = (clients ?? [])
    .filter(c => !c.is_internal && c.client_label !== 'perso' && Number(c.mrr) > 0)
    .map((c, i) => ({
      month_id: monthId,
      client_id: c.id,
      label: c.display_name || c.company_name,
      plan_amount: Number(c.mrr),
      invoices: 1,
      amount_net: Number(c.mrr),
      kind: kindFromClientType(c.client_type),
      sales_owner_id: c.sales_owner_id ?? null,
      sales_owner: c.sales_owner_name ?? null,
      paid: c.payment_status === 'pagato',
      invoice_sent: c.payment_status !== 'in_attesa',
      sort_order: (base + i) * 10,
    }))
    .filter(r => !already.has(`${r.client_id}|${r.label}`))

  if (rows.length) {
    const { error } = await admin.from('pl_revenue_lines').insert(rows)
    if (error) throw new Error(error.message)
  }
  revalidatePath(PATH)
  return rows.length
}

/**
 * Struttura di costo di partenza, quando non c'è un mese precedente da cui
 * ereditare. Ricalca le categorie del foglio di gestione: meglio una lista da
 * correggere che un foglio bianco davanti.
 */
const DEFAULT_COSTS: { category: string; label: string; cost_type: 'F' | 'V' }[] = [
  ...['Google Workspace', 'Project management', 'CRM', 'Comunicazione interna', 'Suite grafica',
    'Email marketing', 'AI tools', 'Fatturazione elettronica', 'Hosting e domini']
    .map(label => ({ category: 'Software & Tool', label, cost_type: 'F' as const })),
  ...['Advertising online', 'Materiale commerciale', 'Eventi e networking']
    .map(label => ({ category: 'Marketing TwoBee', label, cost_type: 'F' as const })),
  ...['Coworking', 'Trasferte e pasti', 'Fondo imprevisti']
    .map(label => ({ category: 'Overhead', label, cost_type: 'F' as const })),
  { category: 'Professionali', label: 'Commercialista', cost_type: 'F' },
  { category: 'Professionali', label: 'Consulenza legale', cost_type: 'F' },
  { category: 'Banca', label: 'Commissioni bancarie', cost_type: 'V' },
  { category: 'HR', label: 'Compensi collaboratori', cost_type: 'F' },
  { category: 'Outsourcing', label: 'Fornitori esterni', cost_type: 'V' },
]

/**
 * Voci di costo del mese: eredita dal mese precedente, altrimenti parte dalla
 * struttura di default. Il preventivato si porta dietro, la spesa reale no —
 * quella è il consuntivo e va inserita.
 */
export async function copyCostsFromPreviousMonth(month: string) {
  await requireAdmin()
  const admin = createAdminClient()
  const monthId = await ensureMonth(month)

  const { count } = await admin.from('pl_cost_lines')
    .select('id', { count: 'exact', head: true }).eq('month_id', monthId)
  if (count) throw new Error('Questo mese ha già delle voci di costo')

  // si risale fino a tre mesi indietro: un mese saltato non deve bloccare
  let src: Record<string, unknown>[] = []
  for (let back = 1; back <= 3 && src.length === 0; back++) {
    const { data: pm } = await admin.from('pl_months')
      .select('id').eq('month', shiftMonth(month, -back)).maybeSingle()
    if (!pm) continue
    const { data } = await admin.from('pl_cost_lines').select('*').eq('month_id', pm.id).order('sort_order')
    src = data ?? []
  }

  const rows = src.length
    ? src.map((c, i) => ({
        month_id: monthId,
        category: c.category, label: c.label, cost_type: c.cost_type,
        budget: c.budget, actual: 0, paid: false,
        vat_applied: c.vat_applied, vat_rate: c.vat_rate,
        sort_order: i * 10,
      }))
    : DEFAULT_COSTS.map((c, i) => ({
        month_id: monthId, category: c.category, label: c.label, cost_type: c.cost_type,
        budget: 0, actual: 0, paid: false, vat_applied: false, vat_rate: 0.22, sort_order: i * 10,
      }))

  const { error } = await admin.from('pl_cost_lines').insert(rows)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
  return rows.length
}

/** Precompila il mese in un colpo solo: ricavi dai clienti + struttura di costo. */
export async function prefillMonth(month: string) {
  await requireAdmin()
  const revenue = await generateRevenueFromClients(month)
  let costs = 0
  try { costs = await copyCostsFromPreviousMonth(month) } catch { /* già presenti: si tiene ciò che c'è */ }
  revalidatePath(PATH)
  return { revenue, costs }
}

// ── Righe ────────────────────────────────────────────────────────────────────

export type RevenuePatch = Partial<{
  label: string; client_id: string | null; plan_amount: number; invoices: number
  amount_net: number; vat_rate: number; invoice_sent: boolean; paid: boolean
  kind: 'growth' | 'digital'; sales_owner_id: string | null; sales_owner: string | null
  note: string | null; sort_order: number
}>

export async function addRevenueLine(month: string, input: RevenuePatch = {}) {
  await requireAdmin()
  const monthId = await ensureMonth(month)
  const admin = createAdminClient()
  const { count } = await admin.from('pl_revenue_lines')
    .select('id', { count: 'exact', head: true }).eq('month_id', monthId)
  const { data, error } = await admin.from('pl_revenue_lines')
    .insert({ month_id: monthId, label: 'Nuova voce', sort_order: (count ?? 0) * 10, ...input })
    .select('*').single()
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
  return data
}

export async function updateRevenueLine(id: string, patch: RevenuePatch) {
  await requireAdmin()
  const { error } = await createAdminClient().from('pl_revenue_lines').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

export async function deleteRevenueLine(id: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('pl_revenue_lines').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

export type CostPatch = Partial<{
  category: string; label: string; cost_type: 'F' | 'V'
  budget: number; actual: number; paid: boolean
  vat_applied: boolean; vat_rate: number; note: string | null; sort_order: number
}>

export async function addCostLine(month: string, input: CostPatch = {}) {
  await requireAdmin()
  const monthId = await ensureMonth(month)
  const admin = createAdminClient()
  const { count } = await admin.from('pl_cost_lines')
    .select('id', { count: 'exact', head: true }).eq('month_id', monthId)
  const { data, error } = await admin.from('pl_cost_lines')
    .insert({ month_id: monthId, category: 'Overhead', label: 'Nuova voce', sort_order: (count ?? 0) * 10, ...input })
    .select('*').single()
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
  return data
}

export async function updateCostLine(id: string, patch: CostPatch) {
  await requireAdmin()
  const { error } = await createAdminClient().from('pl_cost_lines').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

export async function deleteCostLine(id: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('pl_cost_lines').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

// ── Mese e piano ─────────────────────────────────────────────────────────────

export async function setMonthStatus(month: string, status: 'aperto' | 'chiuso') {
  await requireAdmin()
  const monthId = await ensureMonth(month)
  const { error } = await createAdminClient().from('pl_months')
    .update({ status, closed_at: status === 'chiuso' ? new Date().toISOString() : null })
    .eq('id', monthId)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

export async function updatePlConfig(patch: Partial<PlConfig>) {
  await requireAdmin()
  const { error } = await createAdminClient().from('pl_config')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', true)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
}

/**
 * Azioni in blocco sulle uscite. Esistono perché correggere trenta voci una a
 * una a fine mese è il motivo per cui i consuntivi non si compilano.
 */
export async function bulkCostAction(
  ids: string[], action: 'paid' | 'unpaid' | 'align' | 'zero' | 'delete',
) {
  await requireAdmin()
  if (!ids.length) return 0
  const admin = createAdminClient()

  if (action === 'delete') {
    const { error } = await admin.from('pl_cost_lines').delete().in('id', ids)
    if (error) throw new Error(error.message)
    revalidatePath(PATH)
    return ids.length
  }

  if (action === 'align') {
    // «speso quanto previsto»: il caso più comune a fine mese
    const { data } = await admin.from('pl_cost_lines').select('id, budget').in('id', ids)
    for (const r of data ?? []) {
      const { error } = await admin.from('pl_cost_lines')
        .update({ actual: r.budget }).eq('id', r.id)
      if (error) throw new Error(error.message)
    }
    revalidatePath(PATH)
    return (data ?? []).length
  }

  const patch = action === 'paid' ? { paid: true }
    : action === 'unpaid' ? { paid: false }
    : { actual: 0, paid: false }
  const { error } = await admin.from('pl_cost_lines').update(patch).in('id', ids)
  if (error) throw new Error(error.message)
  revalidatePath(PATH)
  return ids.length
}
