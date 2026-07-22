'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isSuperAdminRaw, isAdminRole, isExternalResource } from '@/lib/permissions'

/**
 * Milestone V2 (migration 139): entità propria dentro un'Area di lavoro, non più
 * una task con `is_milestone=true`.
 *
 * Autorizzazione identica a `project-phases.ts`: admin e manager sempre, più il
 * PM designato del progetto (decisione D-3). Scrittura via service role perché
 * un manager è `role='team'` e la RLS scrive solo per admin+PM.
 */

export interface Milestone {
  id: string
  workstream_id: string
  project_id: string
  title: string
  description: string | null
  milestone_type: string
  status: string
  owner_id: string | null
  expected_date: string | null
  actual_date: string | null
  completion_criteria: string | null
  approval_required: boolean
  approved_at: string | null
  visibility: string
  sort_order: number
  created_at: string
}

async function assertCanManage(projectId: string): Promise<{ userId: string } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: me } = await sb
    .from('profiles').select('email, app_role, role').eq('id', user.id).single()

  if (isExternalResource(me?.app_role)) return { error: 'Le risorse esterne non possono modificare le milestone' }

  const admin = isSuperAdminRaw(me?.email, me?.app_role) || isAdminRole(me?.app_role) || me?.role === 'admin'
  if (admin || me?.app_role === 'manager') return { userId: user.id }

  const { data: proj } = await createAdminClient()
    .from('projects').select('manager_id').eq('id', projectId).single()
  if ((proj as { manager_id: string | null } | null)?.manager_id === user.id) return { userId: user.id }

  return { error: 'Solo il PM del progetto, un manager o un admin può modificare le milestone' }
}

function touch(projectId: string) {
  revalidatePath(`/progetti`)
  revalidatePath(`/workspace/progetti/${projectId}`)
  revalidatePath('/workload')
  revalidatePath('/workspace/workload')
}

export async function listMilestones(projectId: string) {
  const sb = await createClient()
  const { data, error } = await sb
    .from('workstream_milestones')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order')
  if (error) return { ok: false as const, error: error.message, milestones: [] }
  return { ok: true as const, milestones: (data ?? []) as unknown as Milestone[] }
}

export async function createMilestone(projectId: string, input: {
  workstreamId: string; title: string
  milestoneType?: string; expectedDate?: string | null
  approvalRequired?: boolean; visibility?: string
}) {
  const g = await assertCanManage(projectId)
  if ('error' in g) return { ok: false as const, error: g.error }
  if (!input.workstreamId) return { ok: false as const, error: "Serve l'area di lavoro" }
  if (!input.title.trim()) return { ok: false as const, error: 'Il titolo è obbligatorio' }

  const admin = createAdminClient()
  const { count } = await admin.from('workstream_milestones')
    .select('id', { count: 'exact', head: true }).eq('workstream_id', input.workstreamId)

  const { data, error } = await admin.from('workstream_milestones').insert({
    workstream_id: input.workstreamId,
    project_id: projectId,
    title: input.title.trim(),
    milestone_type: input.milestoneType ?? 'delivery',
    status: 'da_avviare',
    expected_date: input.expectedDate || null,
    approval_required: input.approvalRequired ?? false,
    visibility: input.visibility ?? 'internal',
    sort_order: count ?? 0,
  } as never).select('*').single()

  if (error) return { ok: false as const, error: error.message }
  touch(projectId)
  return { ok: true as const, milestone: data as unknown as Milestone }
}

export async function updateMilestone(milestoneId: string, projectId: string, patch: {
  title?: string; status?: string; expected_date?: string | null
  actual_date?: string | null; owner_id?: string | null
  milestone_type?: string; visibility?: string
  approval_required?: boolean; completion_criteria?: string | null
}) {
  const g = await assertCanManage(projectId)
  if ('error' in g) return { ok: false as const, error: g.error }

  // Completare una milestone data la sua data effettiva, se non c'è già:
  // "quando è successo" è un dato che nessuno inserisce a mano.
  const body: Record<string, unknown> = { ...patch }
  if (patch.status === 'completata' && patch.actual_date === undefined) {
    body.actual_date = new Date().toISOString().slice(0, 10)
  }

  const { error } = await createAdminClient()
    .from('workstream_milestones').update(body as never)
    .eq('id', milestoneId).eq('project_id', projectId)
  if (error) return { ok: false as const, error: error.message }
  touch(projectId)
  return { ok: true as const }
}

export async function deleteMilestone(milestoneId: string, projectId: string) {
  const g = await assertCanManage(projectId)
  if ('error' in g) return { ok: false as const, error: g.error }

  // Le task NON si cancellano: tasks.milestone_id è ON DELETE SET NULL, quindi
  // restano nell'area di lavoro senza milestone. Cancellare lavoro reale perché
  // si elimina un raggruppamento sarebbe una perdita silenziosa.
  const { error } = await createAdminClient()
    .from('workstream_milestones').delete()
    .eq('id', milestoneId).eq('project_id', projectId)
  if (error) return { ok: false as const, error: error.message }
  touch(projectId)
  return { ok: true as const }
}

export async function reorderMilestones(projectId: string, workstreamId: string, orderedIds: string[]) {
  const g = await assertCanManage(projectId)
  if ('error' in g) return { ok: false as const, error: g.error }
  const admin = createAdminClient()
  await Promise.all(orderedIds.map((id, i) =>
    admin.from('workstream_milestones').update({ sort_order: i } as never)
      .eq('id', id).eq('workstream_id', workstreamId)))
  touch(projectId)
  return { ok: true as const }
}
