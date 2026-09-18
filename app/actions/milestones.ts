'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { notificaAssegnazione } from '@/lib/notify'
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
  owner_id?: string | null
}) {
  const uid = await requireStaff()
  const admin = createAdminClient()
  const patch: Record<string, unknown> = { ...updates }
  if (updates.status === 'completata') patch.completed_at = new Date().toISOString()
  /* §350 — prendere in carico una consegna è la seconda cosa che vale una
     notifica: si legge **prima** di scrivere, perché rimettere lo stesso
     responsabile non è un'assegnazione nuova e non deve suonare. */
  const { data: prima } = updates.owner_id !== undefined
    ? await admin.from('milestones').select('title, owner_id, workstream_id').eq('id', id).maybeSingle()
    : { data: null }
  const { error } = await admin.from('milestones').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  const before = prima as { title?: string; owner_id?: string | null; workstream_id?: string } | null
  if (before && updates.owner_id && updates.owner_id !== before.owner_id) {
    await notificaAssegnazione({
      destinatario: updates.owner_id, autore: uid, tipo: 'milestone_assigned',
      titolo: before.title ?? 'Milestone', dettaglio: 'milestone da consegnare',
      link: `/workspace/progetti/${projectId}/workstream/${before.workstream_id}`,
      db: admin,
    })
  }
  rev(projectId)
}

export async function deleteMilestone(id: string, projectId: string) {
  await requireStaff()
  // le task collegate cadono via ON DELETE CASCADE
  const { error } = await createAdminClient().from('milestones').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}
