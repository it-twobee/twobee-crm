'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminRaw, isAdminRole } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'

// Rinomina di sprint/milestone dal Gantt del Workload. SOLO il nome: date, task
// collegate, stato e gerarchia restano invariati.
async function assertCanManage(projectId: string): Promise<{ ok: true } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const admin = createAdminClient()
  const { data: me } = await admin.from('profiles').select('email, app_role, role').eq('id', user.id).single()
  const m = me as { email: string | null; app_role: string | null; role: string | null } | null

  if (isSuperAdminRaw(m?.email, m?.app_role) || isAdminRole(m?.app_role) || m?.role === 'admin' || m?.app_role === 'manager') {
    return { ok: true }
  }
  const { data: proj } = await admin.from('projects').select('manager_id').eq('id', projectId).single()
  if ((proj as { manager_id: string | null } | null)?.manager_id === user.id) return { ok: true }

  return { error: 'Solo il PM del progetto o un admin può rinominare sprint e milestone' }
}

export async function renameSprint(
  projectId: string, sprintId: string, name: string,
): Promise<{ ok: true } | { error: string }> {
  const auth = await assertCanManage(projectId)
  if ('error' in auth) return { error: auth.error }
  if (!name.trim()) return { error: 'Il nome non può essere vuoto' }

  const { error } = await createAdminClient()
    .from('sprints').update({ name: name.trim() } as never).eq('id', sprintId).eq('project_id', projectId)
  if (error) return { error: error.message }

  revalidatePath('/workload'); revalidatePath('/workspace/workload')
  return { ok: true }
}

export async function renameMilestone(
  projectId: string, milestoneId: string, title: string,
): Promise<{ ok: true } | { error: string }> {
  const auth = await assertCanManage(projectId)
  if ('error' in auth) return { error: auth.error }
  if (!title.trim()) return { error: 'Il nome non può essere vuoto' }

  // Le milestone sono task con is_milestone=true: cambia solo il titolo.
  const { error } = await createAdminClient()
    .from('tasks').update({ title: title.trim() } as never)
    .eq('id', milestoneId).eq('project_id', projectId).eq('is_milestone', true)
  if (error) return { error: error.message }

  revalidatePath('/workload'); revalidatePath('/workspace/workload')
  return { ok: true }
}
