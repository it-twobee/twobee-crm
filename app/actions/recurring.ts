'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { RecurrenceFrequency, Priority, Visibility } from '@/lib/types/database'

async function requireStaff(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin' && p?.role !== 'team') throw new Error('Permesso negato')
  return user.id
}

const rev = (projectId: string) => { revalidatePath(`/progetti/${projectId}`); revalidatePath(`/workspace/progetti/${projectId}`) }

export async function createRecurring(input: {
  client_id: string
  project_id: string
  workstream_id: string
  milestone_id: string
  title: string
  frequency: RecurrenceFrequency
  interval?: number
  weekdays?: number[] | null
  day_of_month?: number | null
  start_date?: string | null
  end_date?: string | null
  generation_lead_days?: number
  owner_id?: string | null
  priority?: Priority
  visibility?: Visibility
}) {
  const uid = await requireStaff()
  const { error } = await createAdminClient().from('recurring_task_templates').insert({
    client_id: input.client_id,
    project_id: input.project_id,
    workstream_id: input.workstream_id,
    milestone_id: input.milestone_id,
    title: input.title.trim(),
    frequency: input.frequency,
    interval: input.interval ?? 1,
    weekdays: input.weekdays && input.weekdays.length ? input.weekdays : null,
    day_of_month: input.day_of_month ?? null,
    start_date: input.start_date || new Date().toISOString().slice(0, 10),
    end_date: input.end_date || null,
    generation_lead_days: input.generation_lead_days ?? 3,
    owner_id: input.owner_id || null,
    priority: input.priority ?? 'media',
    visibility: input.visibility ?? 'internal',
    active: true,
    created_by: uid,
  })
  if (error) throw new Error(error.message)
  rev(input.project_id)
}

export async function updateRecurring(id: string, projectId: string, updates: {
  title?: string
  frequency?: RecurrenceFrequency
  interval?: number
  weekdays?: number[] | null
  day_of_month?: number | null
  end_date?: string | null
  generation_lead_days?: number
  owner_id?: string | null
  priority?: Priority
  visibility?: Visibility
  active?: boolean
}) {
  await requireStaff()
  const patch = { ...updates }
  if ('weekdays' in patch) patch.weekdays = patch.weekdays && patch.weekdays.length ? patch.weekdays : null
  const { error } = await createAdminClient().from('recurring_task_templates').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}

export async function deleteRecurring(id: string, projectId: string) {
  await requireStaff()
  // le occorrenze già generate restano (recurring_template_id -> SET NULL da schema)
  const { error } = await createAdminClient().from('recurring_task_templates').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}
