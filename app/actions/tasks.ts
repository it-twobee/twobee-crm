'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminRaw, isAdminRole } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'

// Scritture centralizzate sui campi scalari di una task, dal TaskDrawer condiviso.
// Authz applicativa + service role (un 'team' è role='team' e la RLS non gli darebbe
// necessariamente l'update fuori dai propri client). Chi può modificare:
// admin/manager · PM del progetto · l'assegnatario primario · un collaboratore
// (riga in task_assignees). Gli owner NON si toccano qui: passano da setTaskAssignees.

const ALLOWED_FIELDS = [
  'title', 'description', 'status', 'priority', 'due_date', 'estimated_hours',
  'sprint_id', 'milestone_id',
] as const

async function assertCanEditTask(taskId: string): Promise<{ userId: string } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const admin = createAdminClient()
  const [{ data: me }, { data: task }] = await Promise.all([
    admin.from('profiles').select('email, app_role, role').eq('id', user.id).single(),
    admin.from('tasks').select('id, assignee_id, project_id').eq('id', taskId).single(),
  ])
  if (!task) return { error: 'Task non trovata' }

  if (isSuperAdminRaw(me?.email, me?.app_role) || isAdminRole(me?.app_role) || me?.role === 'admin' || me?.app_role === 'manager') {
    return { userId: user.id }
  }
  if (task.assignee_id === user.id) return { userId: user.id }

  if (task.project_id) {
    const { data: proj } = await admin.from('projects').select('manager_id').eq('id', task.project_id).single()
    if (proj?.manager_id === user.id) return { userId: user.id }
  }
  const { data: ta } = await admin.from('task_assignees')
    .select('task_id').eq('task_id', taskId).eq('profile_id', user.id).maybeSingle()
  if (ta) return { userId: user.id }

  return { error: 'Non autorizzato a modificare questa task' }
}

export async function updateTaskFields(
  taskId: string,
  patch: Record<string, unknown>,
): Promise<{ ok: true } | { error: string }> {
  const auth = await assertCanEditTask(taskId)
  if ('error' in auth) return { error: auth.error }

  const updates = Object.fromEntries(
    Object.entries(patch).filter(([k]) => (ALLOWED_FIELDS as readonly string[]).includes(k)),
  )
  if (Object.keys(updates).length === 0) return { ok: true }

  const { error } = await createAdminClient()
    .from('tasks').update(updates as never).eq('id', taskId)
  if (error) return { error: error.message }

  revalidatePath('/le-mie-attivita')
  revalidatePath('/workspace/attivita')
  return { ok: true }
}
