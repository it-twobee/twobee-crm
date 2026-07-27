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
  revAdHoc(input.client_id)
  return data.id as string
}

/** le viste che mostrano task ad hoc: cliente + elenco globale nei due portali */
function revAdHoc(clientId: string | null) {
  if (clientId) revalidatePath(`/clienti/${clientId}`)
  revalidatePath('/ad-hoc')
  revalidatePath('/workspace/ad-hoc')
}

export async function setAdHocTaskStatus(taskId: string, clientId: string | null, status: TaskStatusV2) {
  await requireStaff()
  const { error } = await createAdminClient().from('tasks').update({ status }).eq('id', taskId)
  if (error) throw new Error(error.message)
  revAdHoc(clientId)
}

/** modifica dall'elenco o dal pannello di dettaglio */
export async function updateAdHocTask(taskId: string, clientId: string | null, updates: {
  title?: string
  description?: string | null
  status?: TaskStatusV2
  assignee_id?: string | null
  due_date?: string | null
  priority?: Priority
  visibility?: Visibility
}) {
  await requireStaff()
  const admin = createAdminClient()
  const { assignee_id, ...rest } = updates

  if (Object.keys(rest).length) {
    const patch: Record<string, unknown> = { ...rest }
    if (rest.title !== undefined) {
      const t = rest.title.trim()
      if (!t) throw new Error('Il titolo non può essere vuoto')
      patch.title = t
    }
    if (rest.description !== undefined) patch.description = rest.description?.trim() || null
    const { error } = await admin.from('tasks').update(patch).eq('id', taskId)
    if (error) throw new Error(error.message)
  }

  // task_assignees è la sorgente canonica: il trigger risincronizza tasks.assignee_id
  if (assignee_id !== undefined) {
    const { error: eDel } = await admin.from('task_assignees').delete().eq('task_id', taskId)
    if (eDel) throw new Error(eDel.message)
    if (assignee_id) {
      const { error: eIns } = await admin.from('task_assignees')
        .insert({ task_id: taskId, profile_id: assignee_id, is_primary_owner: true })
      if (eIns) throw new Error(eIns.message)
    } else {
      const { error: eNull } = await admin.from('tasks').update({ assignee_id: null }).eq('id', taskId)
      if (eNull) throw new Error(eNull.message)
    }
  }
  revAdHoc(clientId)
}

export async function deleteAdHocTask(taskId: string, clientId: string | null) {
  await requireStaff()
  const { error } = await createAdminClient().from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', taskId)
  if (error) throw new Error(error.message)
  revAdHoc(clientId)
}
