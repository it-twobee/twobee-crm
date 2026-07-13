'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminRaw, isAdminRole } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import type { TrashedTask } from '@/lib/types/trash'

// Cestino task: soft-delete (deleted_at), ripristino, eliminazione definitiva.
// Tutto via service role (bypassa la RLS che nasconde le task cestinate).

async function actor() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: p } = await sb.from('profiles').select('email, role, app_role').eq('id', user.id).single()
  const prof = (p ?? {}) as { email?: string; role?: string; app_role?: string }
  const isAdmin = isSuperAdminRaw(prof.email, prof.app_role) || isAdminRole(prof.app_role) || prof.role === 'admin'
  const isManager = isAdmin || prof.app_role === 'manager'
  const isStaff = isAdmin || prof.role === 'team'
  return { userId: user.id, isAdmin, isManager, isStaff }
}

function revalidateTaskViews() {
  for (const p of ['/dashboard', '/le-mie-attivita', '/progetti', '/workload', '/cestino']) revalidatePath(p)
}

/** Sposta una task nel cestino (soft-delete). Staff. */
export async function softDeleteTask(taskId: string): Promise<{ ok: true } | { error: string }> {
  const a = await actor()
  if (!a) return { error: 'Non autenticato' }
  if (!a.isStaff) return { error: 'Non autorizzato' }
  const { error } = await createAdminClient().from('tasks')
    .update({ deleted_at: new Date().toISOString(), deleted_by: a.userId } as never)
    .eq('id', taskId).is('deleted_at', null)
  if (error) return { error: error.message }
  revalidateTaskViews()
  return { ok: true }
}

/** Soft-delete multiplo. Staff. */
export async function softDeleteTasks(taskIds: string[]): Promise<{ ok: true } | { error: string }> {
  const a = await actor()
  if (!a) return { error: 'Non autenticato' }
  if (!a.isStaff) return { error: 'Non autorizzato' }
  if (!taskIds.length) return { ok: true }
  const { error } = await createAdminClient().from('tasks')
    .update({ deleted_at: new Date().toISOString(), deleted_by: a.userId } as never)
    .in('id', taskIds).is('deleted_at', null)
  if (error) return { error: error.message }
  revalidateTaskViews()
  return { ok: true }
}

/** Ripristina una task dal cestino. Admin/manager o chi l'ha cestinata. */
export async function restoreTask(taskId: string): Promise<{ ok: true } | { error: string }> {
  const a = await actor()
  if (!a) return { error: 'Non autenticato' }
  const admin = createAdminClient()
  const { data: row } = await admin.from('tasks').select('deleted_by').eq('id', taskId).single()
  if (!row) return { error: 'Task non trovata' }
  if (!a.isManager && (row as { deleted_by: string | null }).deleted_by !== a.userId) return { error: 'Non autorizzato' }
  const { error } = await admin.from('tasks')
    .update({ deleted_at: null, deleted_by: null } as never).eq('id', taskId)
  if (error) return { error: error.message }
  revalidateTaskViews()
  return { ok: true }
}

/** Elimina definitivamente una task dal cestino. Admin/manager o chi l'ha cestinata. */
export async function purgeTask(taskId: string): Promise<{ ok: true } | { error: string }> {
  const a = await actor()
  if (!a) return { error: 'Non autenticato' }
  const admin = createAdminClient()
  const { data: row } = await admin.from('tasks').select('deleted_by, deleted_at').eq('id', taskId).single()
  if (!row) return { error: 'Task non trovata' }
  const r = row as { deleted_by: string | null; deleted_at: string | null }
  if (!r.deleted_at) return { error: 'La task non è nel cestino' }
  if (!a.isManager && r.deleted_by !== a.userId) return { error: 'Non autorizzato' }
  await admin.from('task_assignees').delete().eq('task_id', taskId)
  const { error } = await admin.from('tasks').delete().eq('id', taskId)
  if (error) return { error: error.message }
  revalidatePath('/cestino')
  return { ok: true }
}

/** Elenco task nel cestino. Admin/manager: tutte. Altri: solo quelle cestinate da loro. */
export async function listDeletedTasks(): Promise<TrashedTask[]> {
  const a = await actor()
  if (!a) return []
  const admin = createAdminClient()
  let q = admin.from('tasks')
    .select('id, title, status, deleted_at, project:projects(name), deleter:profiles!tasks_deleted_by_fkey(full_name)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  if (!a.isManager) q = q.eq('deleted_by', a.userId)
  const { data } = await q
  return ((data ?? []) as unknown as Array<{
    id: string; title: string | null; status: string | null; deleted_at: string | null
    project: { name: string | null } | null; deleter: { full_name: string | null } | null
  }>).map(t => ({
    id: t.id, title: t.title, status: t.status, deleted_at: t.deleted_at,
    project_name: t.project?.name ?? null, deleted_by_name: t.deleter?.full_name ?? null,
  }))
}
