'use server'

import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isSuperAdminRaw, isAdminRole } from '@/lib/permissions'

/**
 * Collegamenti di un cliente verso l'esterno.
 *
 * I token NON passano mai da qui verso la UI, tranne quello del form: è un
 * URL da incollare in una landing page, quindi va per forza mostrato. Tutti
 * gli altri (Shopify, Meta, Google) si scrivono e non si rileggono più.
 */

export type Provider = 'shopify' | 'meta_ads' | 'google_ads' | 'web_form'

export interface Integration {
  id: string
  client_id: string
  project_id: string | null
  provider: Provider
  status: 'non_configurata' | 'attiva' | 'errore' | 'scaduta'
  external_account_id: string | null
  label: string | null
  config: Record<string, unknown>
  last_sync_at: string | null
  last_error: string | null
  is_active: boolean
}

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: me } = await sb
    .from('profiles').select('email, app_role, role').eq('id', user.id).single()

  const admin = isSuperAdminRaw(me?.email, me?.app_role) || isAdminRole(me?.app_role) || me?.role === 'admin'
  if (!admin) return { error: 'Solo un admin può gestire le integrazioni' }
  return { userId: user.id }
}

export async function listIntegrations(clientId: string, projectId?: string | null) {
  const sb = await createClient()
  let q = sb.from('client_integrations').select('*').eq('client_id', clientId)
  if (projectId) q = q.eq('project_id', projectId)
  const { data, error } = await q.order('provider')
  if (error) return { ok: false as const, error: error.message, integrations: [] }
  return { ok: true as const, integrations: (data ?? []) as Integration[] }
}

/**
 * Crea (o rigenera) il collegamento del form e restituisce l'URL da incollare.
 *
 * Rigenerare invalida il token precedente all'istante: è la via d'uscita se
 * l'URL finisce dove non doveva.
 */
export async function ensureWebFormIntegration(
  clientId: string,
  projectId: string | null,
  opts?: { rotate?: boolean; appUrl?: string },
) {
  const guard = await requireAdmin()
  if ('error' in guard) return { ok: false as const, error: guard.error }

  const admin = createAdminClient()

  const q = admin.from('client_integrations').select('id')
    .eq('client_id', clientId).eq('provider', 'web_form')
  const { data: existing } = await (
    projectId ? q.eq('project_id', projectId) : q.is('project_id', null)
  ).maybeSingle()

  let integrationId = (existing as { id: string } | null)?.id ?? null

  if (!integrationId) {
    const { data, error } = await admin.from('client_integrations').insert({
      client_id: clientId,
      project_id: projectId,
      provider: 'web_form',
      status: 'non_configurata',
      label: 'Form sito / landing page',
      config: {},
    } as never).select('id').single()
    if (error || !data) return { ok: false as const, error: error?.message ?? 'Errore' }
    integrationId = (data as { id: string }).id
  }

  const { data: sec } = await admin
    .from('client_integration_secrets').select('access_token')
    .eq('integration_id', integrationId).maybeSingle()

  let token = (sec as { access_token: string | null } | null)?.access_token ?? null

  if (!token || opts?.rotate) {
    token = randomBytes(24).toString('base64url')   // 32 caratteri, non indovinabile
    const { error } = await admin.from('client_integration_secrets')
      .upsert({ integration_id: integrationId, access_token: token } as never,
              { onConflict: 'integration_id' })
    if (error) return { ok: false as const, error: error.message }
  }

  const base = opts?.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  revalidatePath(`/clienti/${clientId}`)
  return { ok: true as const, url: `${base}/api/leads/inbound/${token}`, integrationId }
}

export async function setIntegrationActive(integrationId: string, clientId: string, active: boolean) {
  const guard = await requireAdmin()
  if ('error' in guard) return { ok: false as const, error: guard.error }

  const { error } = await createAdminClient()
    .from('client_integrations').update({ is_active: active } as never).eq('id', integrationId)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/clienti/${clientId}`)
  return { ok: true as const }
}

export interface LeadRow {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  source: string | null
  status: string
  created_at: string
  metadata: Record<string, unknown>
}

export async function listLeads(clientId: string, projectId?: string | null) {
  const sb = await createClient()
  let q = sb.from('lead_contacts')
    .select('id, full_name, email, phone, source, status, created_at, metadata')
    .eq('client_id', clientId)
  if (projectId) q = q.eq('project_id', projectId)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(200)
  if (error) return { ok: false as const, error: error.message, leads: [] }
  return { ok: true as const, leads: (data ?? []) as LeadRow[] }
}

export async function updateLeadStatus(leadId: string, clientId: string, status: string) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false as const, error: 'Non autenticato' }

  // I lead li lavora il team, non solo l'admin: la RLS di lead_contacts già
  // limita a chi di dovere, quindi qui basta la sessione utente.
  const { error } = await sb.from('lead_contacts')
    .update({ status } as never).eq('id', leadId)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/clienti/${clientId}`)
  return { ok: true as const }
}
