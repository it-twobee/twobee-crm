'use server'

import { createClient } from '@/lib/supabase/server'
import { createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPERVISOR_ROLE } from '@/lib/task-roles'
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
  /** 'ad_hoc' (nostra) oppure 'cliente' (la deve fare il cliente) */
  task_type?: 'ad_hoc' | 'cliente'
  /** secondo livello: un nostro interno che presidia una task in carico al cliente */
  supervisor_id?: string | null
}) {
  const uid = await requireStaff()
  // §179: la cronologia attribuisce leggendo l'header, non auth.uid()
  const admin = createActorClient(uid)
  const kind = input.task_type ?? 'ad_hoc'
  const { data, error } = await admin.from('tasks').insert({
    client_id: input.client_id,
    task_type: kind,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    priority: input.priority ?? 'media',
    // una cosa che deve fare il cliente è per forza visibile a lui
    visibility: kind === 'cliente' ? 'client_visible' : (input.visibility ?? 'internal'),
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
  // il supervisore non è il titolare: resta secondo livello, così tasks.assignee_id
  // continua a puntare a chi la deve fare davvero
  if (input.supervisor_id && input.supervisor_id !== input.assignee_id) {
    const { error: e3 } = await admin.from('task_assignees').insert({
      task_id: data.id, profile_id: input.supervisor_id,
      is_primary_owner: false, role_in_task: SUPERVISOR_ROLE,
    })
    if (e3) throw new Error(e3.message)
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
  const uid = await requireStaff()
  /* §283 — la data di completamento la scriveva solo `updateTaskStatus`: le ad
     hoc chiuse da qui restavano senza, e la sezione delle completate non sapeva
     quando erano state finite né da quando contare i sessanta giorni. */
  const { error } = await createActorClient(uid).from('tasks')
    .update({ status, completed_at: status === 'completato' ? new Date().toISOString() : null })
    .eq('id', taskId)
  if (error) throw new Error(error.message)
  revAdHoc(clientId)
}

/** modifica dall'elenco o dal pannello di dettaglio */
export async function updateAdHocTask(taskId: string, clientId: string | null, updates: {
  title?: string
  description?: string | null
  status?: TaskStatusV2
  assignee_id?: string | null
  supervisor_id?: string | null
  due_date?: string | null
  priority?: Priority
  visibility?: Visibility
}) {
  const uid = await requireStaff()
  const admin = createActorClient(uid)
  const { assignee_id, supervisor_id, ...rest } = updates

  if (Object.keys(rest).length) {
    const patch: Record<string, unknown> = { ...rest }
    if (rest.title !== undefined) {
      const t = rest.title.trim()
      if (!t) throw new Error('Il titolo non può essere vuoto')
      patch.title = t
    }
    if (rest.description !== undefined) patch.description = rest.description?.trim() || null
    /* §283 — anche da qui: cambiare stato dal pannello di dettaglio è lo stesso
       fatto che spuntare la casella, e deve lasciare la stessa traccia. */
    if (rest.status !== undefined) {
      patch.completed_at = rest.status === 'completato' ? new Date().toISOString() : null
    }
    const { error } = await admin.from('tasks').update(patch).eq('id', taskId)
    if (error) throw new Error(error.message)
  }

  // task_assignees è la sorgente canonica: il trigger risincronizza tasks.assignee_id.
  // Titolare e supervisore si toccano separatamente: cambiare l'uno non cancella l'altro.
  if (assignee_id !== undefined) {
    const { error: eDel } = await admin.from('task_assignees')
      .delete().eq('task_id', taskId).eq('is_primary_owner', true)
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

  if (supervisor_id !== undefined) {
    const { error: eDel } = await admin.from('task_assignees')
      .delete().eq('task_id', taskId).eq('role_in_task', SUPERVISOR_ROLE)
    if (eDel) throw new Error(eDel.message)
    if (supervisor_id) {
      const { error: eIns } = await admin.from('task_assignees').insert({
        task_id: taskId, profile_id: supervisor_id,
        is_primary_owner: false, role_in_task: SUPERVISOR_ROLE,
      })
      if (eIns) throw new Error(eIns.message)
    }
  }
  revAdHoc(clientId)
}

export async function deleteAdHocTask(taskId: string, clientId: string | null) {
  const uid = await requireStaff()
  const { error } = await createActorClient(uid).from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', taskId)
  if (error) throw new Error(error.message)
  revAdHoc(clientId)
}
