'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole, isSuperAdminRaw, isExternalResource } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'

// La RLS vieta ai ruoli 'team' di inserire progetti/sprint. Questi action girano
// col service role ma solo dopo aver verificato che il chiamante sia
// manager/senior (o admin+). Nessun altro ruolo può crearli dalla dashboard.
async function guard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' as const }
  const { data: me } = await supabase
    .from('profiles').select('app_role, email').eq('id', user.id).single()
  const role = me?.app_role ?? null
  const allowed = role === 'manager' || role === 'senior'
    || isAdminRole(role) || isSuperAdminRaw(me?.email, role)
  if (!allowed) return { error: 'Permessi insufficienti' as const }
  return { userId: user.id, admin: createAdminClient() }
}

// Tutto è connesso: quando si crea/aggiorna un nodo della catena
// cliente → progetto → sprint → milestone → task → subtask, invalidiamo ogni
// vista che lo mostra, in entrambi i portali, così l'aggiornamento appare ovunque.
function revalidateConnected(clientId?: string | null) {
  for (const p of [
    '/workspace', '/workspace/progetti', '/workspace/task', '/workspace/attivita',
    '/le-mie-attivita', '/dashboard', '/progetti', '/task', '/clienti',
  ]) revalidatePath(p)
  if (clientId) {
    revalidatePath(`/clienti/${clientId}`)
    revalidatePath(`/workspace/clienti/${clientId}`)
  }
}

// Le task personali (senza progetto) vivono solo nelle "Mie attività": non
// serve invalidare dashboard/clienti/progetti, che non le mostrano mai.
function revalidatePersonalTasks() {
  revalidatePath('/workspace/attivita')
  revalidatePath('/le-mie-attivita')
  revalidatePath('/workspace')
}

async function clientIdOf(admin: ReturnType<typeof createAdminClient>, projectId: string): Promise<string | null> {
  const { data } = await admin.from('projects').select('client_id').eq('id', projectId).maybeSingle()
  return (data as { client_id: string | null } | null)?.client_id ?? null
}

export async function createProjectWs(input: {
  clientId: string; name: string; description?: string
  projectKind?: 'growth' | 'digital'; projectType?: string
}) {
  const g = await guard()
  if ('error' in g) return { ok: false, error: g.error }
  if (!input.clientId || !input.name.trim()) return { ok: false, error: 'Cliente e nome obbligatori' }

  const { data, error } = await g.admin.from('projects').insert({
    client_id: input.clientId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    status: 'attivo',
    project_kind: input.projectKind ?? 'growth',
    project_type: input.projectType ?? 'custom',
    sprint_current: 1,
  } as never).select('id, name, client_id').single()

  if (error) return { ok: false, error: error.message }
  const project = data as { id: string; name: string; client_id: string }
  revalidateConnected(project.client_id)
  return { ok: true, project }
}

export async function createSprintWs(input: {
  projectId: string; name: string; startDate?: string; endDate?: string
}) {
  const g = await guard()
  if ('error' in g) return { ok: false, error: g.error }
  if (!input.projectId || !input.name.trim()) return { ok: false, error: 'Progetto e nome obbligatori' }

  // sprints.start_date/end_date sono NOT NULL: se mancano usiamo un default
  // sensato (oggi → +14gg) invece di far fallire l'insert con un errore DB grezzo.
  const today = new Date().toISOString().slice(0, 10)
  const plus14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)

  const { data, error } = await g.admin.from('sprints').insert({
    project_id: input.projectId,
    name: input.name.trim(),
    start_date: input.startDate || today,
    end_date: input.endDate || plus14,
    status: 'pianificato',
  } as never).select('id, name').single()

  if (error) return { ok: false, error: error.message }
  revalidateConnected(await clientIdOf(g.admin, input.projectId))
  return { ok: true, sprint: data as { id: string; name: string } }
}

// Milestone = task con is_milestone=true dentro un progetto.
export async function createMilestoneWs(input: {
  projectId: string; title: string; dueDate?: string
}) {
  const g = await guard()
  if ('error' in g) return { ok: false, error: g.error }
  if (!input.projectId || !input.title.trim()) return { ok: false, error: 'Progetto e nome obbligatori' }

  const { data, error } = await g.admin.from('tasks').insert({
    project_id: input.projectId,
    title: input.title.trim(),
    status: 'da_fare',
    priority: 'media',
    is_milestone: true,
    due_date: input.dueDate || null,
    tags: [],
    logged_hours: 0,
    depth: 0,
    position: 0,
  } as never).select('id, title').single()

  if (error) return { ok: false, error: error.message }
  revalidateConnected(await clientIdOf(g.admin, input.projectId))
  return { ok: true, milestone: data as { id: string; title: string } }
}

// Task delle "Mie attività": la crea qualunque membro interno per sé stesso.
// Con projectId è una task di progetto (condivisa); senza, è personale/privata
// (project_id NULL → invisibile ai colleghi via RLS, vedi migration 094).
// Passa dal service role perché la RLS vieta al team di scrivere task su clienti
// non assegnati; qui verifichiamo solo che sia staff interno e che assegni a sé.
export async function createMyTask(input: {
  title: string; projectId?: string | null; sprintId?: string | null; milestoneId?: string | null
  dueDate?: string; priority?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Non autenticato' }
  const { data: me } = await supabase.from('profiles').select('role, app_role').eq('id', user.id).single()
  if (me?.role !== 'admin' && me?.role !== 'team') return { ok: false, error: 'Permessi insufficienti' }
  if (!input.title.trim()) return { ok: false, error: 'Titolo obbligatorio' }
  // Le risorse esterne possono tenere todo personali, ma non iniettare task nei progetti.
  if (isExternalResource(me?.app_role) && input.projectId) {
    return { ok: false, error: 'Le risorse esterne non possono creare task di progetto' }
  }

  // Sprint e milestone hanno senso solo dentro un progetto: senza progetto la
  // task è personale e non può essere legata a nulla.
  const projectId = input.projectId || null
  const admin = createAdminClient()
  const { data, error } = await admin.from('tasks').insert({
    title: input.title.trim(),
    assignee_id: user.id,
    status: 'da_fare',
    priority: input.priority ?? 'media',
    project_id: projectId,
    sprint_id: projectId ? (input.sprintId || null) : null,
    milestone_id: projectId ? (input.milestoneId || null) : null,
    due_date: input.dueDate || null,
    is_milestone: false,
    tags: [],
    logged_hours: 0,
    depth: 0,
    position: 0,
  } as never)
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url), project:projects(id, name, client_id, clients(company_name))')
    .single()

  if (error) return { ok: false, error: error.message }
  // Task privata → invalido solo le "Mie attività". Task di progetto → propago
  // a tutte le viste connesse (board, dashboard, pagina cliente).
  if (projectId) revalidateConnected(await clientIdOf(admin, projectId))
  else revalidatePersonalTasks()
  return { ok: true, task: data }
}

// Elimina una task personale (senza progetto) di cui sei l'assegnatario.
// Le task di progetto restano soggette al flusso di approvazione (requestDelete).
export async function deleteMyTask(taskId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Non autenticato' }

  const admin = createAdminClient()
  const { data: task } = await admin.from('tasks').select('assignee_id, project_id').eq('id', taskId).single()
  if (!task) return { ok: false, error: 'Task non trovata' }
  const t = task as { assignee_id: string | null; project_id: string | null }
  if (t.project_id) return { ok: false, error: 'Le task di progetto vanno eliminate con approvazione' }
  if (t.assignee_id !== user.id) return { ok: false, error: 'Non è una tua task' }

  // Soft-delete: nel cestino, ripristinabile.
  const { error } = await admin.from('tasks')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id } as never)
    .eq('id', taskId).is('deleted_at', null)
  if (error) return { ok: false, error: error.message }
  revalidatePersonalTasks()  // solo task personali: nessuna vista aggregata le mostra
  revalidatePath('/cestino')
  return { ok: true }
}

export async function createTaskWs(input: {
  projectId: string; title: string; isMilestone?: boolean
  sprintId?: string; milestoneId?: string; parentTaskId?: string
  dueDate?: string; priority?: string; assigneeId?: string
}) {
  const g = await guard()
  if ('error' in g) return { ok: false, error: g.error }
  if (!input.projectId || !input.title.trim()) return { ok: false, error: 'Progetto e titolo obbligatori' }

  // Una subtask eredita profondità dal padre (depth 1); niente subtask di subtask qui.
  const { data, error } = await g.admin.from('tasks').insert({
    project_id: input.projectId,
    title: input.title.trim(),
    status: 'da_fare',
    priority: input.priority ?? 'media',
    is_milestone: input.isMilestone ?? false,
    sprint_id: input.sprintId || null,
    milestone_id: input.milestoneId || null,
    parent_task_id: input.parentTaskId || null,
    due_date: input.dueDate || null,
    assignee_id: input.assigneeId || g.userId,
    tags: [],
    logged_hours: 0,
    depth: input.parentTaskId ? 1 : 0,
    position: 0,
  } as never).select('id, title').single()

  if (error) return { ok: false, error: error.message }
  revalidateConnected(await clientIdOf(g.admin, input.projectId))
  return { ok: true, task: data as { id: string; title: string } }
}
