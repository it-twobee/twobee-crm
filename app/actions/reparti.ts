'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ClientTaskTemplate } from '@/lib/reparti-constants'

export async function assignTask(taskId: string, profileId: string | null) {
  await createAdminClient().from('tasks').update({ assignee_id: profileId, assigned_to: profileId }).eq('id', taskId)
  revalidatePath('/reparti')
}

export async function updateTaskStatus(taskId: string, status: string) {
  await createAdminClient().from('tasks').update({ status }).eq('id', taskId)
  revalidatePath('/reparti')
}

export async function updateTaskTags(taskId: string, tags: string[]) {
  await createAdminClient().from('tasks').update({ tags } as never).eq('id', taskId)
}

export async function bulkUpdateTags(taskIds: string[], tags: string[]) {
  await createAdminClient().from('tasks').update({ tags } as never).in('id', taskIds)
}

export async function createClientTasksFromTemplate(
  projectId: string,
  templates: ClientTaskTemplate[]
) {
  const sb = createAdminClient()
  const rows = templates.map((t, i) => ({
    project_id: projectId,
    title: t.title,
    priority: t.priority,
    status: 'da_fare',
    is_milestone: false,
    is_client_task: true,
    tags: [t.category, t.phase],
    order: i,
  }))
  await sb.from('tasks').insert(rows as never[])
  revalidatePath('/reparti')
}

export async function createClientTask(
  projectId: string,
  title: string,
  priority: string,
  phase: string,
  category: string
) {
  const { data } = await createAdminClient().from('tasks').insert({
    project_id: projectId,
    title,
    priority,
    status: 'da_fare',
    is_milestone: false,
    is_client_task: true,
    tags: [category, phase],
    order: 999,
  } as never).select('*').single()
  revalidatePath('/reparti')
  return data
}

export async function updateClientTaskStatus(taskId: string, status: string) {
  await createAdminClient().from('tasks').update({ status }).eq('id', taskId)
  revalidatePath('/reparti')
}

export async function deleteTask(taskId: string) {
  await createAdminClient().from('tasks').delete().eq('id', taskId)
  revalidatePath('/reparti')
}
