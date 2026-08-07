'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS, ADMIN_ROLES } from '@/lib/permissions'
import type {
  Client, ClientContact, ClientStakeholder, StakeholderRole,
  ClientType, ClientLabel, PaymentStatus,
} from '@/lib/types/database'

/** Le policy su `clients` sono admin-only: senza questo guard il service role le scavalcherebbe. */
async function requireAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role, email').eq('id', user.id).single()
  const ok = p?.role === 'admin' || SUPER_ADMIN_EMAILS.includes(p?.email ?? '')
  if (!ok) throw new Error('Permesso negato: solo gli admin gestiscono le anagrafiche')
  return user.id
}

/** I referenti del cliente li tiene aggiornati chi ci parla: anche i manager, dal workspace. */
async function requireContactManager(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role, app_role, email').eq('id', user.id).single()
  const ok = p?.role === 'admin' || p?.app_role === 'manager' || SUPER_ADMIN_EMAILS.includes(p?.email ?? '')
  if (!ok) throw new Error('Permesso negato: solo admin e manager gestiscono i referenti')
  return user.id
}

function revClient(clientId: string) {
  revalidatePath(`/clienti/${clientId}`)
  revalidatePath(`/workspace/clienti/${clientId}`)
}

export type NewClientContact = {
  full_name: string
  email: string
  phone?: string
  role?: string
  is_primary: boolean
}

export type NewClientInput = {
  display_name: string
  legal_name?: string | null
  client_type: ClientType
  client_label: ClientLabel
  is_internal: boolean
  industry?: string | null
  market_area?: string | null
  active_channels: string[]
  notes?: string | null
  mrr: number
  ad_budget_monthly?: number | null
  contract_start: string
  /** §169: NULL = canone a tempo indeterminato. Alla creazione non si sa ancora. */
  contract_end: string | null
  payment_status: PaymentStatus
  target_leads_monthly?: number | null
  target_roas?: number | null
  target_revenue_monthly?: number | null
  target_cpa?: number | null
  target_followers_monthly?: number | null
  target_ctr?: number | null
  target_conv_rate?: number | null
  goals_notes?: string | null
  contacts: NewClientContact[]
}

const slug = (s: string, max: number) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max) || 'cliente'

export async function createClientRecord(input: NewClientInput): Promise<Client> {
  const uid = await requireAdmin()
  // §179: la cronologia deve sapere chi ha creato il cliente, non «Sistema»
  const admin = createActorClient(uid)

  const name = input.display_name.trim()
  if (!name) throw new Error('Il nome è obbligatorio')

  const { data: client, error } = await admin.from('clients').insert({
    // company_name resta la colonna storica: la teniamo allineata al nome visualizzato
    company_name: name,
    display_name: name,
    legal_name: input.legal_name?.trim() || null,
    client_type: input.client_type,
    client_label: input.client_label,
    is_internal: input.is_internal,
    industry: input.industry || null,
    market_area: input.market_area?.trim() || null,
    active_channels: input.active_channels,
    notes: input.notes?.trim() || null,
    mrr: input.mrr,
    ad_budget_monthly: input.ad_budget_monthly ?? null,
    contract_start: input.contract_start,
    contract_end: input.contract_end,
    payment_status: input.payment_status,
    target_leads_monthly: input.target_leads_monthly ?? null,
    target_roas: input.target_roas ?? null,
    target_revenue_monthly: input.target_revenue_monthly ?? null,
    target_cpa: input.target_cpa ?? null,
    target_followers_monthly: input.target_followers_monthly ?? null,
    target_ctr: input.target_ctr ?? null,
    target_conv_rate: input.target_conv_rate ?? null,
    goals_notes: input.goals_notes?.trim() || null,
    created_by: uid,
  }).select('*').single()
  if (error) throw new Error(error.message)

  const contacts = input.contacts
    .map(c => ({ ...c, full_name: c.full_name.trim(), email: c.email.trim() }))
    .filter(c => c.full_name && c.email)
  if (contacts.length) {
    const { error: eC } = await admin.from('client_contacts').insert(
      contacts.map(c => ({
        client_id: client.id, full_name: c.full_name, email: c.email,
        phone: c.phone?.trim() || null, role: c.role?.trim() || null, is_primary: c.is_primary,
      })),
    )
    if (eC) throw new Error(`Cliente creato, ma i referenti no: ${eC.message}`)
  }

  // INSERT su chat_channels richiede role='admin' in RLS: dal browser falliva in silenzio
  const { error: eCh } = await admin.from('chat_channels').insert([
    { name: slug(name, 40), type: 'cliente', client_id: client.id },
    { name: `cc-${slug(name, 37)}`, type: 'customer_care', client_id: client.id },
  ])
  if (eCh) throw new Error(`Cliente creato, ma i canali no: ${eCh.message}`)

  revalidatePath('/clienti')
  revalidatePath('/dashboard')
  return client as Client
}

/** Colonne che l'anagrafica può toccare: il resto (risk_*, created_*, status) è calcolato. */
const EDITABLE = [
  // §178: `client_type` non c'è più — lo derivano i progetti (trigger)
  'display_name', 'legal_name', 'phone', 'website', 'client_label',
  'industry', 'market_area', 'notes', 'active_channels', 'is_internal', 'workspace_hidden',
  'sales_owner_id', 'sales_owner_name',
  'piva', 'fiscal_code', 'address', 'city', 'cap', 'country', 'sdi_code', 'pec',
  'mrr', 'contract_start', 'contract_end', 'payment_status', 'ad_budget_monthly',
  'target_leads_monthly', 'target_roas', 'target_revenue_monthly', 'target_cpa',
  'target_followers_monthly', 'target_ctr', 'target_conv_rate', 'goals_notes',
] as const

export type ClientPatch = Partial<Pick<Client, typeof EDITABLE[number]>>

export async function updateClientRecord(clientId: string, patch: ClientPatch) {
  const uid = await requireAdmin()
  const clean: Record<string, unknown> = {}
  // il label ha effetti collaterali (canali, notifica di perdita): passa da applyLabelChange
  for (const k of EDITABLE) if (k in patch && k !== 'client_label') clean[k] = patch[k]

  if (Object.keys(clean).length) {
    const { error } = await createActorClient(uid).from('clients').update(clean).eq('id', clientId)
    if (error) throw new Error(error.message)
  }
  if (patch.client_label) await applyLabelChange(clientId, patch.client_label, uid)

  revClient(clientId)
  revalidatePath('/clienti')
  /* §213 — `workspace_hidden` cambia cosa vede un altro portale: senza questa
     la lista operativa continuava a mostrarlo fino alla scadenza della cache. */
  revalidatePath('/workspace/clienti')
}

/** Cambio label dalla scheda cliente (badge in testata). */
export async function setClientLabel(clientId: string, label: ClientLabel) {
  const uid = await requireAdmin()
  await applyLabelChange(clientId, label, uid)
  revClient(clientId)
  revalidatePath('/clienti')
  revalidatePath('/dashboard')
}

/**
 * Perdere un cliente non è una modifica come le altre: archivia le chat e — la
 * prima volta soltanto — avvisa gli admin. `lost_at` non si azzera se il cliente
 * torna attivo, così un secondo passaggio da "perso" non rinotifica.
 */
async function applyLabelChange(clientId: string, label: ClientLabel, actorId: string) {
  const admin = createActorClient(actorId)
  const COLS = 'client_label, company_name, display_name, mrr'
  // finché la 161 non è applicata si degrada: si cambia label, ma senza memoria
  // della prima perdita (quindi senza garanzia di notifica una-tantum)
  const first = await admin.from('clients').select(`${COLS}, lost_at`).eq('id', clientId).single()
  const hasLostAt = !(first.error?.code === '42703')
  const res = hasLostAt ? first : await admin.from('clients').select(COLS).eq('id', clientId).single()
  if (res.error) throw new Error(res.error.message)
  const before = res.data as { client_label: ClientLabel; company_name: string; display_name: string | null; mrr: number | null; lost_at?: string | null }
  if (before.client_label === label) return

  const firstLoss = label === 'perso' && !before.lost_at
  // §176: la sospensione tiene l'ULTIMA data, non la prima — serve a sapere da
  // quanto è fermo, e riparte da zero ogni volta che si ferma di nuovo
  const pausing = label === 'pending' && before.client_label !== 'pending'
  const resuming = label !== 'pending' && before.client_label === 'pending'
  const patch: Record<string, unknown> = { client_label: label }
  if (firstLoss && hasLostAt) patch.lost_at = new Date().toISOString()
  if (pausing) patch.paused_at = new Date().toISOString().slice(0, 10)
  if (resuming) patch.paused_at = null

  let { error: eUp } = await admin.from('clients').update(patch).eq('id', clientId)
  // la 176 può non essere ancora eseguita: il cambio di stato deve funzionare
  // lo stesso, si perde solo la data di sospensione
  if (eUp && (pausing || resuming)) {
    delete patch.paused_at
    ;({ error: eUp } = await admin.from('clients').update(patch).eq('id', clientId))
  }
  if (eUp) throw new Error(eUp.message)

  if (label === 'perso') {
    await admin.from('chat_channels').update({ is_archived: true, is_read_only: true }).eq('client_id', clientId)
  } else if (before.client_label === 'perso') {
    await admin.from('chat_channels').update({ is_archived: false, is_read_only: false }).eq('client_id', clientId)
  }

  if (firstLoss) {
    const name = before.display_name || before.company_name
    const { data: admins } = await admin.from('profiles')
      .select('id').eq('is_active', true).in('app_role', ADMIN_ROLES)
    const rows = (admins ?? []).map((a: { id: string }) => ({
      user_id: a.id, profile_id: a.id,
      type: 'client_lost',
      title: `Cliente perso — ${name}`,
      body: before.mrr ? `Churn: -€${Number(before.mrr).toLocaleString('it-IT')}/mese` : null,
      link: `/clienti/${clientId}`,
      entity_type: 'client', entity_id: clientId,
    }))
    if (rows.length) await admin.from('notifications').insert(rows)
  }
}

// ── Referenti (admin + manager) ──────────────────────────────────────────────

export type ContactInput = {
  full_name: string
  email: string
  phone?: string | null
  role?: string | null
  is_primary?: boolean
}

function cleanContact(input: ContactInput) {
  const full_name = input.full_name.trim()
  const email = input.email.trim()
  if (!full_name || !email) throw new Error('Nome ed email sono obbligatori')
  return {
    full_name, email,
    phone: input.phone?.trim() || null,
    role: input.role?.trim() || null,
    is_primary: !!input.is_primary,
  }
}

/** Il referente principale è uno solo: promuoverne uno declassa gli altri. */
async function demoteOtherPrimaries(clientId: string, keepId?: string) {
  const admin = createAdminClient()
  let q = admin.from('client_contacts').update({ is_primary: false })
    .eq('client_id', clientId).eq('is_primary', true)
  if (keepId) q = q.neq('id', keepId)
  const { error } = await q
  if (error) throw new Error(error.message)
}

export async function createClientContact(clientId: string, input: ContactInput): Promise<ClientContact> {
  await requireContactManager()
  const row = cleanContact(input)
  if (row.is_primary) await demoteOtherPrimaries(clientId)

  const { data, error } = await createAdminClient().from('client_contacts')
    .insert({ client_id: clientId, ...row }).select('*').single()
  if (error) throw new Error(error.message)
  revClient(clientId)
  return data as ClientContact
}

export async function updateClientContact(contactId: string, clientId: string, input: ContactInput): Promise<ClientContact> {
  await requireContactManager()
  const row = cleanContact(input)
  if (row.is_primary) await demoteOtherPrimaries(clientId, contactId)

  const { data, error } = await createAdminClient().from('client_contacts')
    .update(row).eq('id', contactId).eq('client_id', clientId).select('*').single()
  if (error) throw new Error(error.message)
  revClient(clientId)
  return data as ClientContact
}

export async function deleteClientContact(contactId: string, clientId: string) {
  await requireContactManager()
  const { error } = await createAdminClient().from('client_contacts')
    .delete().eq('id', contactId).eq('client_id', clientId)
  if (error) throw new Error(error.message)
  revClient(clientId)
}

// ── Stakeholder e team assegnato (solo admin) ────────────────────────────────

export type StakeholderInput = {
  full_name: string
  email: string
  role: StakeholderRole
  phone?: string | null
  company?: string | null
  piva?: string | null
  notes?: string | null
}

export async function saveClientStakeholder(
  clientId: string, input: StakeholderInput, stakeholderId?: string,
): Promise<ClientStakeholder> {
  await requireAdmin()
  const full_name = input.full_name.trim()
  const email = input.email.trim()
  if (!full_name || !email) throw new Error('Nome ed email sono obbligatori')
  const row = {
    full_name, email, role: input.role,
    phone: input.phone?.trim() || null,
    company: input.company?.trim() || null,
    piva: input.piva?.trim() || null,
    notes: input.notes?.trim() || null,
  }
  const admin = createAdminClient()
  const { data, error } = stakeholderId
    ? await admin.from('client_stakeholders').update(row).eq('id', stakeholderId).eq('client_id', clientId).select('*').single()
    : await admin.from('client_stakeholders').insert({ client_id: clientId, ...row }).select('*').single()
  if (error) throw new Error(error.message)
  revClient(clientId)
  return data as ClientStakeholder
}

export async function deleteClientStakeholder(stakeholderId: string, clientId: string) {
  await requireAdmin()
  const { error } = await createAdminClient().from('client_stakeholders')
    .delete().eq('id', stakeholderId).eq('client_id', clientId)
  if (error) throw new Error(error.message)
  revClient(clientId)
}

/**
 * `client_assignments` non è solo una lista: alimenta `get_my_client_ids()`,
 * quindi decide chi vede il cliente. Resta in mano agli admin.
 */
export async function setClientTeam(clientId: string, profileIds: string[]) {
  await requireAdmin()
  const admin = createAdminClient()
  const ids = Array.from(new Set(profileIds))

  const { error: eDel } = await admin.from('client_assignments').delete().eq('client_id', clientId)
  if (eDel) throw new Error(eDel.message)
  if (ids.length) {
    const { error } = await admin.from('client_assignments')
      .insert(ids.map(profile_id => ({ client_id: clientId, profile_id })))
    if (error) throw new Error(error.message)
  }
  revClient(clientId)
}
