'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { splitEven, splitByPercent, type RevenueStream } from '@/lib/revenue'

/** Contratti e prezzi: dati economici, admin e basta. */
async function requireAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role, email').eq('id', user.id).single()
  const ok = p?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(p?.email ?? '')
  if (!ok) throw new Error('Permesso negato: l\'economics è riservata agli admin')
  return user.id
}

function rev(projectId: string) {
  revalidatePath(`/progetti/${projectId}`)
  revalidatePath('/economics')
}

export type StreamInput = {
  label: string
  service_type?: string | null
  service_subtype?: string | null
  price_source?: 'standard' | 'custom'
  kind?: 'growth' | 'digital'
  billing?: 'recurring' | 'one_off'
  amount?: number
  vat_rate?: number
  start_date?: string | null
  end_date?: string | null
  status?: 'bozza' | 'attivo' | 'sospeso' | 'concluso'
  sales_owner_id?: string | null
  activates_after_id?: string | null
  note?: string | null
}

export async function addStream(projectId: string, input: StreamInput) {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  const { data, error } = await admin.from('revenue_streams')
    .insert({ project_id: projectId, created_by: uid, ...input })
    .select('*').single()
  if (error) throw new Error(error.message)
  rev(projectId)
  return data
}

export async function updateStream(id: string, projectId: string, patch: Partial<StreamInput>) {
  await requireAdmin()
  const { error } = await createAdminClient().from('revenue_streams')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}

export async function deleteStream(id: string, projectId: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('revenue_streams').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}

/**
 * Rate di un lavoro a corpo. Sostituisce quelle esistenti: un piano di
 * fatturazione si rifà intero, non si somma a quello vecchio.
 *
 * `mode` 'even' divide in parti uguali su `count` mesi, 'percent' segue le
 * percentuali date (40/30/30). In entrambi i casi l'ultima rata assorbe
 * l'arrotondamento, così la somma fa esattamente il totale del contratto.
 */
export async function generateInstallments(
  streamId: string, projectId: string,
  opts: { mode: 'even' | 'percent'; count?: number; percents?: number[]; startMonth: string },
) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: s, error: e0 } = await admin.from('revenue_streams')
    .select('amount, billing').eq('id', streamId).single()
  if (e0) throw new Error(e0.message)
  if (s.billing !== 'one_off') throw new Error('Le rate valgono solo sui lavori a corpo')

  const total = Number(s.amount)
  const drafts = opts.mode === 'percent'
    ? splitByPercent(total, opts.percents ?? [100], opts.startMonth)
    : splitEven(total, Math.max(1, opts.count ?? 1), opts.startMonth)

  const { error: eDel } = await admin.from('revenue_installments').delete().eq('stream_id', streamId)
  if (eDel) throw new Error(eDel.message)

  const { error } = await admin.from('revenue_installments').insert(
    drafts.map((d, i) => ({ stream_id: streamId, ...d, sort_order: i * 10 })),
  )
  if (error) throw new Error(error.message)
  rev(projectId)
  return drafts.length
}

export async function updateInstallment(
  id: string, projectId: string,
  patch: Partial<{ due_month: string; label: string | null; amount: number; invoiced: boolean; paid: boolean }>,
) {
  await requireAdmin()
  const { error } = await createAdminClient().from('revenue_installments').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}

export async function deleteInstallment(id: string, projectId: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('revenue_installments').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}

/**
 * Porta in 'attivo' una manutenzione la cui lavorazione è conclusa.
 * Il controllo sta qui e non nel database: attivare un canone è una decisione
 * commerciale, non un effetto collaterale della chiusura di un progetto.
 */
export async function activateStream(id: string, projectId: string) {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: s, error } = await admin.from('revenue_streams')
    .select('activates_after_id, status').eq('id', id).single()
  if (error) throw new Error(error.message)
  if (s.status !== 'bozza') throw new Error('Questo contratto non è in bozza')

  if (s.activates_after_id) {
    const { data: parent } = await admin.from('revenue_streams')
      .select('status, label').eq('id', s.activates_after_id).single()
    if (parent && parent.status !== 'concluso') {
      throw new Error(`«${parent.label}» non è ancora concluso: la manutenzione parte da lì`)
    }
  }

  const { error: eUp } = await admin.from('revenue_streams')
    .update({ status: 'attivo', updated_at: new Date().toISOString() }).eq('id', id)
  if (eUp) throw new Error(eUp.message)
  rev(projectId)
}

/** Prezzo di listino di un servizio: alimenta il default in fase di quotazione. */
export async function setServicePrice(id: string, price: number | null, unit: 'mese' | 'una_tantum') {
  await requireAdmin()
  const { error } = await createAdminClient().from('service_catalog')
    .update({ standard_price: price, price_unit: unit }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni/catalogo')
}

export type { RevenueStream }
