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

export async function createAdHocTask(input: {
  client_id: string
  title: string
  assignee_id?: string | null
  due_date?: string | null
  priority?: Priority
  visibility?: Visibility
  description?: string | null
}) {
  const uid = await requireStaff()
  const admin = createAdminClient()
  const { data, error } = await admin.from('tasks').insert({
    client_id: input.client_id,
    task_type: 'ad_hoc',
    title: input.title.trim(),
    description: input.description?.trim() || null,
    priority: input.priority ?? 'media',
    visibility: input.visibility ?? 'internal',
    due_date: input.due_date || null,
    created_by: uid,
  }).select('id').single()
  if (error) throw new Error(error.message)

  // assegnatario primario via task_assignees (il trigger sincronizza tasks.assignee_id)
  if (input.assignee_id) {
    const { error: e2 } = await admin.from('task_assignees')
      .insert({ task_id: data.id, profile_id: input.assignee_id, is_primary_owner: true })
    if (e2) throw new Error(e2.message)
  }
  revalidatePath(`/clienti/${input.client_id}`)
  return data.id as string
}

export async function setAdHocTaskStatus(taskId: string, clientId: string, status: TaskStatusV2) {
  await requireStaff()
  const { error } = await createAdminClient().from('tasks').update({ status }).eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidatePath(`/clienti/${clientId}`)
}

export async function deleteAdHocTask(taskId: string, clientId: string) {
  await requireStaff()
  const { error } = await createAdminClient().from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidatePath(`/clienti/${clientId}`)
}
