'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { scriviAssegnatari, elencoAssegnatari } from '@/lib/task-assignees'
import type { TaskStatusV2, Priority, Visibility } from '@/lib/types/database'
import { motivoFuoriCalendario, type TaskDaSegnare } from '@/lib/task-calendario'

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
  /** §353 — `tasks.description`: si chiama «Dettagli» ovunque nella UI */
  description?: string | null
  priority?: Priority
  assignee_id?: string | null
  /** più persone già alla nascita: il primo è il primario */
  assignee_ids?: string[]
  due_date?: string | null
  visibility?: Visibility
  parent_task_id?: string | null
}) {
  const uid = await requireStaff()
  // §179: il trigger di cronologia legge l'attore dall'header, non da auth.uid()
  const admin = createActorClient(uid)
  const { data, error } = await admin.from('tasks').insert({
    client_id: input.client_id, task_type: 'project',
    project_id: input.project_id, workstream_id: input.workstream_id, milestone_id: input.milestone_id,
    title: input.title.trim(), description: input.description?.trim() || null,
    priority: input.priority ?? 'media',
    due_date: input.due_date || null, visibility: input.visibility ?? 'internal',
    parent_task_id: input.parent_task_id || null,
    created_by: uid,
  }).select('id').single()
  if (error) throw new Error(error.message)
  /* §347 — chi ha assegnato, anche da qui; §350 — e chi la riceve lo sa adesso.
     §470 — tutte le persone insieme: prima se ne sceglieva una, si salvava e si
     riapriva per aggiungere la seconda. */
  await scriviAssegnatari(admin, {
    taskId: data.id, ids: elencoAssegnatari(input.assignee_id, input.assignee_ids),
    autore: uid, titolo: input.title.trim(),
  })
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
  const uid = await requireStaff()
  const { error } = await createActorClient(uid).from('tasks').update(updates).eq('id', taskId)
  if (error) throw new Error(error.message)
}

export async function updateTaskStatus(taskId: string, status: TaskStatusV2) {
  const uid = await requireStaff()
  /* §283 — la data di completamento la garantisce il **trigger** (migration
     211): copre anche i percorsi che non passano da qui — l'import Asana, una
     UPDATE a mano, una futura azione che qualcuno scriverà. Qui si scrive lo
     stesso perché finché la 211 non è stata eseguita il trigger non c'è, e una
     task chiusa senza data sarebbe una task che la retention non vede mai. */
  const { error } = await createActorClient(uid).from('tasks')
    .update({ status, completed_at: status === 'completato' ? new Date().toISOString() : null })
    .eq('id', taskId)
  if (error) throw new Error(error.message)
}

export async function setTaskAssignees(taskId: string, profileIds: string[], primaryId?: string | null) {
  const uid = await requireStaff()
  const admin = createActorClient(uid)
  const { error: del } = await admin.from('task_assignees').delete().eq('task_id', taskId)
  if (del) throw new Error(del.message)
  if (profileIds.length) {
    const { data: t } = await admin.from('tasks').select('title').eq('id', taskId).maybeSingle()
    await scriviAssegnatari(admin, {
      taskId, ids: elencoAssegnatari(profileIds), primario: primaryId, autore: uid,
      titolo: (t as { title?: string } | null)?.title ?? 'Task assegnata',
    })
  } else {
    // nessun assegnatario: azzera il primario (il trigger scatta solo su task_assignees)
    const { error } = await admin.from('tasks').update({ assignee_id: null }).eq('id', taskId)
    if (error) throw new Error(error.message)
  }
}

export async function deleteTask(taskId: string) {
  const uid = await requireStaff()
  const { error } = await createActorClient(uid).from('tasks')
    .update({ deleted_at: new Date().toISOString() }).eq('id', taskId)
  if (error) throw new Error(error.message)
}

/**
 * §479 — la task va (o esce) dal calendario di Progetti e **resta dov'è**:
 * stessa milestone, stessi commenti, checklist e assegnatari. Si scrive solo
 * il segno: niente milestone nuova, niente eliminazione.
 */
export async function mettiNelCalendario(taskId: string, on: boolean) {
  const uid = await requireStaff()
  const admin = createActorClient(uid)
  const { data, error } = await admin.from('tasks')
    .select('id, task_type, project_id, workstream_id, milestone_id, parent_task_id, is_recurring_instance, deleted_at')
    .eq('id', taskId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Task non trovata')
  const t = data as TaskDaSegnare & { id: string }
  const no = on ? motivoFuoriCalendario(t) : null
  if (no) throw new Error(no)
  const { error: e } = await admin.from('tasks').update({ on_calendar: on }).eq('id', taskId)
  if (e) throw new Error(/on_calendar/.test(e.message) ? 'Manca la migration del calendario delle task' : e.message)
  if (t.project_id) { revalidatePath(`/progetti/${t.project_id}`); revalidatePath(`/workspace/progetti/${t.project_id}`) }
  revalidatePath('/progetti')
  revalidatePath('/workspace/progetti')
}

/**
 * §486 — l'ordine delle task dentro una milestone. Le posizioni le calcola
 * `nuovePosizioni` (`lib/task-order.ts`): di solito una riga sola. Qui si
 * controlla che le task siano tutte di quella milestone e di primo livello —
 * un id preso da un'altra milestone non deve cambiare posto a niente.
 */
export async function riordinaTask(milestoneId: string, posizioni: { id: string; position: number }[]) {
  const uid = await requireStaff()
  if (!posizioni.length) return
  if (posizioni.length > 500 || posizioni.some(p => !Number.isFinite(p.position))) throw new Error('Ordine non valido')
  const admin = createActorClient(uid)
  const ids = Array.from(new Set(posizioni.map(p => p.id)))
  const { data, error } = await admin.from('tasks').select('id, milestone_id, parent_task_id, project_id, deleted_at').in('id', ids)
  if (error) throw new Error(error.message)
  const righe = (data ?? []) as { id: string; milestone_id: string | null; parent_task_id: string | null; project_id: string | null; deleted_at: string | null }[]
  if (righe.length !== ids.length || righe.some(t => t.milestone_id !== milestoneId || t.parent_task_id || t.deleted_at)) {
    throw new Error('Le task non sono tutte di questa milestone')
  }
  for (const p of posizioni) {
    const { error: e } = await admin.from('tasks').update({ position: p.position }).eq('id', p.id).eq('milestone_id', milestoneId)
    if (e) throw new Error(/position/.test(e.message) ? 'Manca la migration dell\'ordine delle task' : e.message)
  }
  const projectId = righe[0]?.project_id
  if (projectId) revalidatePath(`/progetti/${projectId}`)
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

/* §346 — **il motore è uno.** Qui c'era `generateRecurringNow`, che chiamava la
   funzione SQL della 152: §337 l'aveva sostituita con `lib/recurrence-run.ts` —
   quella scrive anche `task_assignees`, tiene le tappe ricorrenti e dice cosa ha
   fatto — ma il bottone della scheda progetto puntava ancora alla vecchia, e due
   motori sulla stessa regola danno la stessa risposta solo finché nessuno ne
   corregge uno. Adesso si passa da `generateRecurrencesNow` in
   `app/actions/recurring.ts`. Un file `'use server'` esporta endpoint (§329):
   lasciare qui il vecchio voleva dire lasciare raggiungibile il motore sbagliato. */
