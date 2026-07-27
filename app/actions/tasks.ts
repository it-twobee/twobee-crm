'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { TaskStatusV2, Priority, Visibility } from '@/lib/types/database'

async function requireStaff(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin' && p?.role !== 'team') throw new Error('Permesso negato')
  return user.id
}

export async function createProjectTask(input: {
  /** null sui progetti interni (migration 155) */
  client_id: string | null
  project_id: string
  workstream_id: string
  milestone_id: string
  title: string
  priority?: Priority
  assignee_id?: string | null
  due_date?: string | null
  visibility?: Visibility
  parent_task_id?: string | null
}) {
  const uid = await requireStaff()
  const admin = createAdminClient()
  const { data, error } = await admin.from('tasks').insert({
    client_id: input.client_id, task_type: 'project',
    project_id: input.project_id, workstream_id: input.workstream_id, milestone_id: input.milestone_id,
    title: input.title.trim(), priority: input.priority ?? 'media',
    due_date: input.due_date || null, visibility: input.visibility ?? 'internal',
    parent_task_id: input.parent_task_id || null,
    created_by: uid,
  }).select('id').single()
  if (error) throw new Error(error.message)
  if (input.assignee_id) {
    const { error: e2 } = await admin.from('task_assignees')
      .insert({ task_id: data.id, profile_id: input.assignee_id, is_primary_owner: true })
    if (e2) throw new Error(e2.message)
  }
  revalidatePath(`/progetti/${input.project_id}`)
  return data.id as string
}

export async function updateTask(taskId: string, updates: {
  title?: string
  description?: string | null
  priority?: Priority
  status?: TaskStatusV2
  start_date?: string | null
  due_date?: string | null
  estimated_hours?: number | null
  visibility?: Visibility
}) {
  await requireStaff()
  const { error } = await createAdminClient().from('tasks').update(updates).eq('id', taskId)
  if (error) throw new Error(error.message)
}

export async function updateTaskStatus(taskId: string, status: TaskStatusV2) {
  await requireStaff()
  const patch: Record<string, unknown> = { status }
  if (status === 'completato') patch.completed_at = new Date().toISOString()
  const { error } = await createAdminClient().from('tasks').update(patch).eq('id', taskId)
  if (error) throw new Error(error.message)
}

export async function setTaskAssignees(taskId: string, profileIds: string[], primaryId?: string | null) {
  await requireStaff()
  const admin = createAdminClient()
  const { error: del } = await admin.from('task_assignees').delete().eq('task_id', taskId)
  if (del) throw new Error(del.message)
  if (profileIds.length) {
    const primary = primaryId && profileIds.includes(primaryId) ? primaryId : profileIds[0]
    const rows = profileIds.map(pid => ({ task_id: taskId, profile_id: pid, is_primary_owner: pid === primary }))
    const { error } = await admin.from('task_assignees').insert(rows)
    if (error) throw new Error(error.message)
  } else {
    // nessun assegnatario: azzera il primario (il trigger scatta solo su task_assignees)
    const { error } = await admin.from('tasks').update({ assignee_id: null }).eq('id', taskId)
    if (error) throw new Error(error.message)
  }
}

export async function deleteTask(taskId: string) {
  await requireStaff()
  const { error } = await createAdminClient().from('tasks')
    .update({ deleted_at: new Date().toISOString() }).eq('id', taskId)
  if (error) throw new Error(error.message)
}

// ── commenti ──────────────────────────────────────────────────────────────────
export async function addTaskComment(taskId: string, content: string, visibility: Visibility = 'internal') {
  const uid = await requireStaff()
  const { error } = await createAdminClient().from('task_comments')
    .insert({ task_id: taskId, author_id: uid, content: content.trim(), visibility })
  if (error) throw new Error(error.message)
}
export async function deleteTaskComment(commentId: string) {
  await requireStaff()
  const { error } = await createAdminClient().from('task_comments').delete().eq('id', commentId)
  if (error) throw new Error(error.message)
}

// ── checklist ─────────────────────────────────────────────────────────────────
export async function addChecklistItem(taskId: string, content: string, sortOrder = 0) {
  await requireStaff()
  const { error } = await createAdminClient().from('task_checklist_items')
    .insert({ task_id: taskId, content: content.trim(), sort_order: sortOrder })
  if (error) throw new Error(error.message)
}
export async function toggleChecklistItem(itemId: string, isDone: boolean) {
  await requireStaff()
  const { error } = await createAdminClient().from('task_checklist_items').update({ is_done: isDone }).eq('id', itemId)
  if (error) throw new Error(error.message)
}
export async function deleteChecklistItem(itemId: string) {
  await requireStaff()
  const { error } = await createAdminClient().from('task_checklist_items').delete().eq('id', itemId)
  if (error) throw new Error(error.message)
}

// ── motore ricorrenze (trigger manuale, oltre al cron giornaliero) ─────────────
export async function generateRecurringNow(): Promise<number> {
  await requireStaff()
  const { data, error } = await createAdminClient().rpc('generate_recurring_task_occurrences')
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}
