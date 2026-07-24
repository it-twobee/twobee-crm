'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface WizardTaskInput {
  title: string
  description?: string | null
  status?: string
  priority?: string
  assignee_id?: string | null
  due_date?: string | null
  estimated_hours?: number | null
  visibility?: string
  sort_order?: number
}
export interface WizardMilestoneInput {
  title: string
  description?: string | null
  milestone_type?: string
  status?: string
  owner_id?: string | null
  due_date?: string | null
  approval_required?: boolean
  deliverable?: string | null
  visibility?: string
  sort_order?: number
  tasks?: WizardTaskInput[]
}
export interface WizardRecurringInput {
  title: string
  description?: string | null
  frequency: string
  interval?: number
  weekdays?: number[] | null
  day_of_month?: number | null
  start_date?: string | null
  end_date?: string | null
  generation_lead_days?: number
  owner_id?: string | null
  priority?: string
  estimated_hours?: number | null
  visibility?: string
}
export interface WizardWorkstreamInput {
  name: string
  description?: string | null
  workstream_type?: string
  status?: string
  owner_id?: string | null
  priority?: string
  visibility?: string
  sort_order?: number
  milestones?: WizardMilestoneInput[]
  recurring?: WizardRecurringInput[]
}
export interface WizardPayload {
  project: {
    client_id: string
    name: string
    description?: string | null
    area: string
    service_type: string
    service_subtype?: string | null
    operating_model?: string | null
    revenue_model?: string | null
    status?: string
    manager_id?: string | null
    priority?: string
    visibility?: string
    start_date?: string | null
    target_end_date?: string | null
  }
  members?: string[]
  workstreams?: WizardWorkstreamInput[]
}

export async function createProjectFromWizard(payload: WizardPayload): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await sb
    .from('profiles').select('role, app_role').eq('id', user.id).single()
  const canCreate = profile?.role === 'admin' || profile?.app_role === 'manager'
  if (!canCreate) throw new Error('Permesso negato: solo admin o manager possono creare progetti')

  if (!payload.project?.client_id) throw new Error('Cliente mancante')
  if (!payload.project?.name?.trim()) throw new Error('Nome progetto mancante')

  const { data, error } = await createAdminClient()
    .rpc('create_project_from_template', { p_payload: payload, p_created_by: user.id })
  if (error) throw new Error(error.message)

  revalidatePath('/progetti')
  revalidatePath(`/clienti/${payload.project.client_id}`)
  return data as string
}
