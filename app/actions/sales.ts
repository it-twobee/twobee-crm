'use server'

import { revalidatePath } from 'next/cache'
import { createActorClient } from '@/lib/supabase/admin'
import { requireSalesAccess } from '@/lib/sales-guard'
import { OUTCOMES, canReadDeal, uuid, validDate, validateDeal, type DealInput, type Delivery, type SalesData, type SalesDeal, type SalesOutcome, type SalesActivity } from '@/lib/sales'
import { isWorkspaceRole } from '@/lib/permissions'

const DEAL_FIELDS = 'id,title,company_name,client_id,contact_id,assigned_to,stage,source,need,blocker,next_action,next_action_on,resume_on,monthly_value,setup_value,one_off_value,proposal_ref,loss_reason,created_at,updated_at,closed_at,last_interaction_at,revision,delivery,delivery_project_id,delivery_completed_at,delivery_owner_id'

function refreshSales() {
  revalidatePath('/commerciale')
  revalidatePath('/workspace/commerciale')
}
function dbError(error: { code?: string; message: string }): never {
  if (['PGRST202', 'PGRST204', '42703', '42P01'].includes(error.code ?? '')) throw new Error('Area commerciale da attivare: manca la migration 223 sul database.')
  if (error.code === 'P0001') throw new Error(error.message)
  console.error('Commerciale', error.code, error.message)
  throw new Error('Operazione non riuscita. I dati inseriti restano disponibili; riprova.')
}

export async function getSalesData(): Promise<SalesData> {
  const { actor, access, sb } = await requireSalesAccess()
  const { data: options, error } = await createActorClient(actor).rpc('sales_options', { p_actor: actor })
  if (error) dbError(error)
  const deals: SalesDeal[] = []
  for (let offset = 0; ; offset += 500) {
    const res = await sb.from('deals').select(DEAL_FIELDS).order('created_at', { ascending: false }).order('id').range(offset, offset + 499)
    if (res.error) dbError(res.error)
    deals.push(...(res.data ?? []) as SalesDeal[])
    if ((res.data?.length ?? 0) < 500) break
  }
  const names = new Map<string, string>((options.clients as SalesData['clients']).map(c => [c.id, c.name]))
  return { ...options, actor, access, deals: deals.map(d => ({ ...d, company_name: names.get(d.client_id ?? '') ?? d.company_name })), loadedAt: new Date().toISOString() }
}

export async function getSalesActivities(dealId: string, offset = 0): Promise<SalesActivity[]> {
  const { sb } = await requireSalesAccess()
  uuid(dealId)
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Pagina non valida')
  const { data, error } = await sb.from('deal_activities')
    .select('id,deal_id,content,outcome,created_at,created_by,next_action_on')
    .eq('deal_id', dealId).order('created_at', { ascending: false }).order('id').range(offset, offset + 49)
  if (error) dbError(error)
  return data ?? []
}

async function command(requestId: string, kind: string, dealId: string | null, input: Record<string, unknown>) {
  const { actor, access, sb } = await requireSalesAccess()
  uuid(requestId)
  if (dealId) {
    uuid(dealId)
    const { data, error } = await sb.from('deals').select('assigned_to').eq('id', dealId).maybeSingle()
    if (error) dbError(error)
    if (!data || !canReadDeal(access, actor, data.assigned_to)) throw new Error('Opportunità non accessibile')
    if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new Error('Versione scheda non valida')
  }
  const { data, error } = await createActorClient(actor).rpc('sales_command', {
    p_actor: actor, p_request: requestId, p_command: kind, p_deal: dealId, p_input: input,
  })
  if (error) dbError(error)
  refreshSales()
  if (kind === 'create' || kind === 'delivery_complete') {
    revalidatePath('/clienti'); revalidatePath('/workspace/clienti')
    revalidatePath('/progetti'); revalidatePath('/workspace/progetti')
  }
  return data as string
}

export async function createSalesDeal(requestId: string, input: DealInput) {
  await requireSalesAccess()
  validateDeal(input, true)
  return command(requestId, 'create', null, input)
}

export async function updateSalesDeal(requestId: string, dealId: string, revision: number, input: DealInput) {
  await requireSalesAccess()
  validateDeal(input)
  return command(requestId, 'update', dealId, { ...input, revision })
}

export async function addSalesContact(requestId: string, dealId: string, revision: number, input: {
  full_name: string; email: string; phone: string; role: string
}) {
  await requireSalesAccess()
  for (const key of ['full_name', 'email', 'phone', 'role'] as const) {
    if (typeof input?.[key] !== 'string' || input[key].length > 500) throw new Error('Referente non valido')
  }
  if (!input.full_name.trim() || (!input.email.trim() && !input.phone.trim())) throw new Error('Indica nome e almeno un recapito')
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error('Email non valida')
  return command(requestId, 'contact', dealId, { ...input, revision })
}

export async function recordSalesOutcome(requestId: string, dealId: string, revision: number, input: {
  outcome: SalesOutcome; content: string; date: string | null; next_action: string; proposal_ref: string
}) {
  await requireSalesAccess()
  if (!input || !Object.hasOwn(OUTCOMES, input.outcome)) throw new Error('Esito non valido')
  for (const key of ['content', 'next_action', 'proposal_ref'] as const) {
    if (typeof input[key] !== 'string' || input[key].length > 8000) throw new Error('Testo non valido')
  }
  if (!input.content.trim()) throw new Error('Indica cosa è successo')
  if (input.date && !validDate(input.date)) throw new Error('Data non valida')
  return command(requestId, 'outcome', dealId, { ...input, revision })
}

export async function saveSalesDelivery(requestId: string, dealId: string, revision: number, input: {
  delivery: Delivery; delivery_owner_id: string | null; project_id: string | null; service_id: string | null
  contact_id: string | null; proposal_ref: string; complete: boolean
}) {
  const { access } = await requireSalesAccess()
  if (input.complete && access === 'owner') throw new Error('Il responsabile commerciale deve confermare il passaggio')
  for (const key of ['delivery_owner_id', 'project_id', 'service_id', 'contact_id'] as const) if (input[key]) uuid(input[key])
  const delivery: Delivery = {}
  for (const key of ['goals', 'services', 'included', 'excluded', 'promises', 'materials', 'missing'] as const) {
    const text = input.delivery?.[key] ?? ''
    if (typeof text !== 'string' || text.length > 8000) throw new Error('Riepilogo troppo lungo')
    delivery[key] = text.trim()
  }
  if (typeof input.proposal_ref !== 'string' || input.proposal_ref.length > 500) throw new Error('Proposta non valida')
  return command(requestId, input.complete ? 'delivery_complete' : 'delivery_save', dealId, { ...input, delivery, revision })
}

export async function setSalesPermission(profileId: string, enabled: boolean) {
  const { actor, access } = await requireSalesAccess()
  if (access !== 'admin') throw new Error('Solo gli admin possono abilitare l’area commerciale')
  uuid(profileId)
  if (typeof enabled !== 'boolean') throw new Error('Permesso non valido')
  const db = createActorClient(actor)
  const { data: target, error } = await db.from('profiles').select('app_role,is_active').eq('id', profileId).single()
  if (error || !target || !isWorkspaceRole(target.app_role) || target.is_active === false) throw new Error('Scegli una persona attiva del workspace')
  const result = await db.from('profile_permissions').upsert({
    profile_id: profileId, permission: 'can_view_deals', granted: enabled, granted_by: actor,
  }, { onConflict: 'profile_id,permission' })
  if (result.error) dbError(result.error)
  refreshSales()
  revalidatePath('/workspace', 'layout')
}
