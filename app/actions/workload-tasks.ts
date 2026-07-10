'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminRaw, isAdminRole } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'

/**
 * Modifiche alle task dalla vista Workload, riservate al PM del progetto o
 * all'admin. "PM" = manager_id del progetto, oppure app_role manager, oppure admin.
 *
 * L'autorizzazione la facciamo qui e scriviamo via service role: un manager è
 * `role='team'` e la RLS su tasks non gli darebbe necessariamente il delete.
 */
async function assertCanManage(projectId: string): Promise<{ userId: string } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: me } = await sb
    .from('profiles').select('email, app_role, role').eq('id', user.id).single()

  const admin = isSuperAdminRaw(me?.email, me?.app_role) || isAdminRole(me?.app_role) || me?.role === 'admin'
  if (admin) return { userId: user.id }

  // Manager di ruolo: può gestire qualunque progetto operativo.
  if (me?.app_role === 'manager') return { userId: user.id }

  // Altrimenti dev'essere il PM designato di QUESTO progetto.
  const { data: proj } = await createAdminClient()
    .from('projects').select('manager_id').eq('id', projectId).single()
  if (proj?.manager_id === user.id) return { userId: user.id }

  return { error: 'Solo il PM del progetto o un admin può modificare queste task' }
}

export async function pmUpdateTask(
  projectId: string,
  taskId: string,
  patch: { status?: string; due_date?: string | null; priority?: string },
): Promise<{ ok: true } | { error: string }> {
  const auth = await assertCanManage(projectId)
  if ('error' in auth) return { error: auth.error }

  const updates: Record<string, unknown> = {}
  if (patch.status !== undefined) updates.status = patch.status
  if (patch.due_date !== undefined) updates.due_date = patch.due_date
  if (patch.priority !== undefined) updates.priority = patch.priority
  if (Object.keys(updates).length === 0) return { ok: true }

  const { error } = await createAdminClient()
    .from('tasks').update(updates as never).eq('id', taskId).eq('project_id', projectId)
  if (error) return { error: error.message }

  revalidatePath('/workload')
  revalidatePath('/workspace/workload')
  return { ok: true }
}

export async function pmDeleteTask(
  projectId: string,
  taskId: string,
): Promise<{ ok: true } | { error: string }> {
  const auth = await assertCanManage(projectId)
  if ('error' in auth) return { error: auth.error }

  const admin = createAdminClient()
  // Il bridge multi-assegnatario va giù in cascata (ON DELETE CASCADE), ma
  // ripuliamo comunque per sicurezza prima di eliminare la task.
  await admin.from('task_assignees').delete().eq('task_id', taskId)
  const { error } = await admin.from('tasks').delete().eq('id', taskId).eq('project_id', projectId)
  if (error) return { error: error.message }

  revalidatePath('/workload')
  revalidatePath('/workspace/workload')
  return { ok: true }
}
