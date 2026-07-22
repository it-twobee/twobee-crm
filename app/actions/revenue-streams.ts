'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { RevenueStream, ServiceLine, RevenueModel, BillingFrequency } from '@/lib/types/database'

/**
 * Accordi economici del cliente. Solo admin: `revenue_streams` è admin-only in
 * RLS e questi importi non devono mai raggiungere il Workspace.
 *
 * Ogni scrittura fa scattare il trigger `rs_sync_client_mrr`, che ricalcola
 * `clients.mrr`. Per questo non si scrive mai `mrr` a mano da nessuna parte.
 */

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles').select('email, app_role').eq('id', user.id).single()

  const isAdmin =
    SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') ||
    profile?.app_role === 'admin' ||
    profile?.app_role === 'super_admin' ||
    profile?.app_role === 'founder'

  if (!isAdmin) return { ok: false as const, error: 'Non autorizzato' }
  return { ok: true as const }
}

export async function listRevenueStreams(clientId: string) {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false as const, error: guard.error, streams: [] }

  const { data, error } = await createAdminClient()
    .from('revenue_streams')
    .select('*, project:projects(id, name)')
    .eq('client_id', clientId)
    .order('status')
    .order('start_date', { ascending: false })

  if (error) return { ok: false as const, error: error.message, streams: [] }
  return { ok: true as const, streams: (data ?? []) as unknown as RevenueStream[] }
}

export interface NewStreamInput {
  client_id: string
  project_id?: string | null
  label: string
  service_line: ServiceLine
  revenue_model: RevenueModel
  amount: number
  billing_frequency: BillingFrequency | null
  start_date: string
  end_date?: string | null
  notes?: string | null
}

export async function createRevenueStream(input: NewStreamInput) {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false as const, error: guard.error }

  const recurring = input.revenue_model === 'recurring' || input.revenue_model === 'maintenance'
  // Il CHECK `rs_recurring_needs_frequency` rifiuta un ricorrente senza frequenza:
  // meglio un messaggio chiaro qui che un errore Postgres in faccia all'utente.
  if (recurring && (!input.billing_frequency || input.billing_frequency === 'una_tantum')) {
    return { ok: false as const, error: 'Un canone ricorrente richiede una frequenza di fatturazione' }
  }

  const { error } = await createAdminClient().from('revenue_streams').insert({
    client_id: input.client_id,
    project_id: input.project_id || null,
    label: input.label,
    service_line: input.service_line,
    revenue_model: input.revenue_model,
    amount: input.amount,
    billing_frequency: recurring ? input.billing_frequency : 'una_tantum',
    start_date: input.start_date,
    end_date: input.end_date || null,
    status: 'attivo',
    source: 'manuale',
    notes: input.notes || null,
  })

  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/clienti/${input.client_id}`)
  return { ok: true as const }
}

/**
 * Chiude un accordo con una data di fine. Non lo cancella: lo storico serve a
 * spiegare il churn (in produzione ci sono 3 canoni cessati che raccontano
 * perché l'MRR è sceso da 16.300 a 12.100).
 */
export async function closeRevenueStream(streamId: string, clientId: string, endDate: string) {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false as const, error: guard.error }

  const { error } = await createAdminClient()
    .from('revenue_streams')
    .update({ status: 'cessato', end_date: endDate })
    .eq('id', streamId)

  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/clienti/${clientId}`)
  return { ok: true as const }
}

export async function reactivateRevenueStream(streamId: string, clientId: string, endDate: string | null) {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false as const, error: guard.error }

  const { error } = await createAdminClient()
    .from('revenue_streams')
    .update({ status: 'attivo', end_date: endDate })
    .eq('id', streamId)

  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/clienti/${clientId}`)
  return { ok: true as const }
}

export async function deleteRevenueStream(streamId: string, clientId: string) {
  const guard = await requireAdmin()
  if (!guard.ok) return { ok: false as const, error: guard.error }

  const { error } = await createAdminClient().from('revenue_streams').delete().eq('id', streamId)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/clienti/${clientId}`)
  return { ok: true as const }
}
