'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { MilestoneStatus, Visibility } from '@/lib/types/database'

async function requireStaff(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin' && p?.role !== 'team') throw new Error('Permesso negato')
  return user.id
}

const rev = (projectId: string) => { revalidatePath(`/progetti/${projectId}`); revalidatePath(`/workspace/progetti/${projectId}`) }

export async function createMilestone(input: {
  project_id: string
  workstream_id: string
  title: string
  due_date?: string | null
  approval_required?: boolean
  deliverable?: string | null
  visibility?: Visibility
}) {
  await requireStaff()
  const { data, error } = await createAdminClient().from('milestones').insert({
    project_id: input.project_id,
    workstream_id: input.workstream_id,
    title: input.title.trim(),
    milestone_type: 'delivery',
    status: 'da_fare',
    due_date: input.due_date || null,
    approval_required: input.approval_required ?? false,
    deliverable: input.deliverable?.trim() || null,
    visibility: input.visibility ?? 'internal',
  }).select('id').single()
  if (error) throw new Error(error.message)
  rev(input.project_id)
  return data.id as string
}

export async function updateMilestone(id: string, projectId: string, updates: {
  title?: string
  status?: MilestoneStatus
  due_date?: string | null
  deliverable?: string | null
  visibility?: Visibility
}) {
  await requireStaff()
  const patch: Record<string, unknown> = { ...updates }
  if (updates.status === 'completata') patch.completed_at = new Date().toISOString()
  const { error } = await createAdminClient().from('milestones').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}

export async function deleteMilestone(id: string, projectId: string) {
  await requireStaff()
  // le task collegate cadono via ON DELETE CASCADE
  const { error } = await createAdminClient().from('milestones').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}
