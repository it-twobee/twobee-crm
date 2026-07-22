'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isSuperAdminRaw, isAdminRole, isExternalResource } from '@/lib/permissions'

/**
 * Fasi di progetto: create, modificate, riordinate e assegnate come sprint e task.
 *
 * Autorizzazione allineata a `workload-tasks.ts`: admin e manager sempre, più il
 * PM designato del progetto. Scrittura via service role perché un manager è
 * `role='team'` e la RLS su project_phases è admin-only.
 */

export interface Phase {
  id: string
  project_id: string
  key: string | null
  name: string
  position: number
  start_date: string | null
  end_date: string | null
  owner_id: string | null
  status: string
  requires_client_approval: boolean
  approved_at: string | null
  deliverables: unknown[]
}

async function assertCanManage(projectId: string): Promise<{ userId: string } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: me } = await sb
    .from('profiles').select('email, app_role, role').eq('id', user.id).single()

  if (isExternalResource(me?.app_role)) return { error: 'Le risorse esterne non possono modificare le fasi' }

  const admin = isSuperAdminRaw(me?.email, me?.app_role) || isAdminRole(me?.app_role) || me?.role === 'admin'
  if (admin || me?.app_role === 'manager') return { userId: user.id }

  const { data: proj } = await createAdminClient()
    .from('projects').select('manager_id').eq('id', projectId).single()
  if ((proj as { manager_id: string | null } | null)?.manager_id === user.id) return { userId: user.id }

  return { error: 'Solo il PM del progetto, un manager o un admin può modificare le fasi' }
}

export async function listPhases(projectId: string) {
  const sb = await createClient()
  const { data, error } = await sb
    .from('project_workstreams')
    .select('*, owner:profiles!project_phases_owner_id_fkey(id, full_name, avatar_url)')
    .eq('project_id', projectId).order('position')
  if (error) return { ok: false as const, error: error.message, phases: [] }
  return { ok: true as const, phases: (data ?? []) as unknown as Phase[] }
}

export async function createPhase(projectId: string, input: { name: string; position?: number }) {
  const guard = await assertCanManage(projectId)
  if ('error' in guard) return { ok: false as const, error: guard.error }
  if (!input.name.trim()) return { ok: false as const, error: 'Serve un nome' }

  const admin = createAdminClient()
  const { count } = await admin.from('project_workstreams')
    .select('id', { count: 'exact', head: true }).eq('project_id', projectId)

  const { error } = await admin.from('project_workstreams').insert({
    project_id: projectId,
    name: input.name.trim(),
    position: input.position ?? (count ?? 0),
    status: 'da_avviare',
  } as never)
  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/progetti')
  return { ok: true as const }
}

export async function updatePhase(
  phaseId: string,
  projectId: string,
  patch: Partial<Pick<Phase, 'name' | 'status' | 'start_date' | 'end_date' | 'owner_id' | 'requires_client_approval' | 'position'>>,
) {
  const guard = await assertCanManage(projectId)
  if ('error' in guard) return { ok: false as const, error: guard.error }

  const { error } = await createAdminClient()
    .from('project_workstreams').update(patch as never).eq('id', phaseId).eq('project_id', projectId)
  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/progetti')
  return { ok: true as const }
}

/**
 * Elimina la fase. Le task collegate NON vengono cancellate: `tasks.phase_id`
 * è ON DELETE SET NULL, quindi tornano semplicemente senza fase. Cancellare una
 * fase non deve mai portarsi via del lavoro.
 */
export async function deletePhase(phaseId: string, projectId: string) {
  const guard = await assertCanManage(projectId)
  if ('error' in guard) return { ok: false as const, error: guard.error }

  const { error } = await createAdminClient()
    .from('project_workstreams').delete().eq('id', phaseId).eq('project_id', projectId)
  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/progetti')
  return { ok: true as const }
}

/** Riordino: una scrittura per fase, in una sola andata. */
export async function reorderPhases(projectId: string, orderedIds: string[]) {
  const guard = await assertCanManage(projectId)
  if ('error' in guard) return { ok: false as const, error: guard.error }

  const admin = createAdminClient()
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      admin.from('project_workstreams').update({ position: i } as never).eq('id', id).eq('project_id', projectId)),
  )
  const failed = results.find(r => r.error)
  if (failed?.error) return { ok: false as const, error: failed.error.message }

  revalidatePath('/progetti')
  return { ok: true as const }
}

/** Sposta una task dentro una fase (o la stacca, con phaseId null). */
export async function assignTaskToPhase(taskId: string, projectId: string, phaseId: string | null) {
  const guard = await assertCanManage(projectId)
  if ('error' in guard) return { ok: false as const, error: guard.error }

  const { error } = await createAdminClient()
    .from('tasks').update({ workstream_id: phaseId } as never).eq('id', taskId)
  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/progetti')
  return { ok: true as const }
}
