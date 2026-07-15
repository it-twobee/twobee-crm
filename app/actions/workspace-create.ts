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
  const clientId = await clientIdOf(g.admin, input.projectId)
  revalidateConnected(clientId)
  return { ok: true, sprint: data as { id: string; name: string }, projectId: input.projectId, clientId }
}

// Milestone = task con is_milestone=true dentro un progetto.
export async function createMilestoneWs(input: {
  projectId: string; title: string; sprintId: string; dueDate?: string
}) {
  const g = await guard()
  if ('error' in g) return { ok: false, error: g.error }
  if (!input.projectId || !input.title.trim()) return { ok: false, error: 'Progetto e nome obbligatori' }
  if (!input.sprintId) return { ok: false, error: 'La milestone va legata a uno sprint' }

  const { data, error } = await g.admin.from('tasks').insert({
    project_id: input.projectId,
    title: input.title.trim(),
    status: 'da_fare',
    priority: 'media',
    is_milestone: true,
    sprint_id: input.sprintId,
    due_date: input.dueDate || null,
    tags: [],
    logged_hours: 0,
    depth: 0,
    position: 0,
  } as never).select('id, title').single()

  if (error) return { ok: false, error: error.message }
  const clientId = await clientIdOf(g.admin, input.projectId)
  revalidateConnected(clientId)
  return { ok: true, milestone: data as { id: string; title: string }, projectId: input.projectId, clientId }
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
  // La task si lega a una milestone; una subtask si lega invece a una task padre.
  if (!input.parentTaskId && !input.milestoneId) return { ok: false, error: 'La task va legata a una milestone' }

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
  const clientId = await clientIdOf(g.admin, input.projectId)
  revalidateConnected(clientId)
  return { ok: true, task: data as { id: string; title: string }, projectId: input.projectId, clientId }
}

// Crea in un colpo un intero piano (sprint → milestone → task) da una bozza AI,
// su un progetto esistente o su uno nuovo. Service role dopo il guard (manager+).
// Rispecchia handlePlanGenerated della pagina progetto, ma lato server.
interface AiPlanInput {
  clientId?: string
  projectId?: string
  newProjectName?: string
  projectKind?: 'growth' | 'digital'
  plan: {
    name: string; duration_weeks: number
    milestones: {
      title: string; due_date?: string; assignee_id?: string
      tasks: { title: string; priority?: string; due_date?: string; assignee_id?: string }[]
    }[]
  }[]
}

export async function createAiPlan(input: AiPlanInput) {
  const g = await guard()
  if ('error' in g) return { ok: false as const, error: g.error }
  if (!input.plan?.length) return { ok: false as const, error: 'Piano vuoto' }

  // Target: progetto esistente oppure nuovo (richiede cliente + nome).
  let projectId = input.projectId ?? ''
  if (!projectId) {
    if (!input.clientId || !input.newProjectName?.trim()) {
      return { ok: false as const, error: 'Serve un progetto esistente oppure cliente + nome del nuovo progetto' }
    }
    const { data: proj, error: pErr } = await g.admin.from('projects').insert({
      client_id: input.clientId, name: input.newProjectName.trim(), status: 'attivo',
      project_kind: input.projectKind ?? 'growth', project_type: 'custom', sprint_current: 1,
    } as never).select('id').single()
    if (pErr || !proj) return { ok: false as const, error: pErr?.message ?? 'Errore creazione progetto' }
    projectId = (proj as { id: string }).id
  }

  const iso = (base: number, days: number) => new Date(base + days * 86400000).toISOString().slice(0, 10)
  const today = Date.now()
  let weekOffset = 0
  const assignRows: { task_id: string; profile_id: string }[] = []

  for (const sp of input.plan) {
    const dur = sp.duration_weeks || 2
    const start = iso(today, weekOffset * 7)
    const end = iso(today, (weekOffset + dur) * 7)
    weekOffset += dur

    const { data: spData, error: spErr } = await g.admin.from('sprints').insert({
      project_id: projectId, name: sp.name, status: 'pianificato', start_date: start, end_date: end,
    } as never).select('id').single()
    if (spErr || !spData) return { ok: false as const, error: `Errore sprint: ${spErr?.message ?? 'sconosciuto'}` }
    const sprintId = (spData as { id: string }).id

    const nMil = Math.max(1, sp.milestones.length)
    for (let mi = 0; mi < sp.milestones.length; mi++) {
      const m = sp.milestones[mi]
      const mDue = m.due_date || iso(today, weekOffset * 7 - dur * 7 + Math.ceil((mi + 1) / nMil * dur * 7))
      const { data: mData, error: mErr } = await g.admin.from('tasks').insert({
        project_id: projectId, title: m.title, status: 'da_fare', priority: 'media',
        is_milestone: true, sprint_id: sprintId, due_date: mDue,
        assignee_id: m.assignee_id || null, tags: [], logged_hours: 0, depth: 0, position: mi,
      } as never).select('id').single()
      if (mErr || !mData) return { ok: false as const, error: `Errore milestone: ${mErr?.message ?? 'sconosciuto'}` }
      const milestoneId = (mData as { id: string }).id
      if (m.assignee_id) assignRows.push({ task_id: milestoneId, profile_id: m.assignee_id })

      if (m.tasks?.length) {
        const { data: tData, error: tErr } = await g.admin.from('tasks').insert(
          m.tasks.map((t, ti) => ({
            project_id: projectId, title: t.title, status: 'da_fare', priority: t.priority || 'media',
            is_milestone: false, milestone_id: milestoneId, sprint_id: sprintId,
            due_date: t.due_date || mDue, assignee_id: t.assignee_id || null,
            tags: [], logged_hours: 0, depth: 0, position: ti,
          })) as never
        ).select('id')
        if (tErr) return { ok: false as const, error: `Errore task: ${tErr.message}` }
        ;(tData as { id: string }[] | null)?.forEach((row, idx) => {
          const pid = m.tasks[idx]?.assignee_id
          if (pid) assignRows.push({ task_id: row.id, profile_id: pid })
        })
      }
    }
  }

  // task_assignees è la fonte canonica: allineo gli assegnatari.
  if (assignRows.length) {
    await g.admin.from('task_assignees').upsert(
      assignRows.map(r => ({ ...r, is_primary_owner: true, role: 'owner', assigned_by: g.userId })) as never,
      { onConflict: 'task_id,profile_id' },
    )
  }

  const clientId = await clientIdOf(g.admin, projectId)
  revalidateConnected(clientId)
  return { ok: true as const, projectId, clientId }
}

// Aggancia milestone (con task) generate dall'AI a uno sprint esistente.
export async function createAiMilestones(input: {
  projectId: string; sprintId: string
  milestones: { title: string; due_date?: string; assignee_id?: string; tasks?: { title: string; priority?: string; due_date?: string; assignee_id?: string }[] }[]
}) {
  const g = await guard()
  if ('error' in g) return { ok: false as const, error: g.error }
  if (!input.projectId || !input.sprintId) return { ok: false as const, error: 'Progetto e sprint obbligatori' }
  if (!input.milestones?.length) return { ok: false as const, error: 'Nessuna milestone' }

  const assignRows: { task_id: string; profile_id: string }[] = []
  for (let mi = 0; mi < input.milestones.length; mi++) {
    const m = input.milestones[mi]
    const { data: mData, error: mErr } = await g.admin.from('tasks').insert({
      project_id: input.projectId, title: m.title, status: 'da_fare', priority: 'media',
      is_milestone: true, sprint_id: input.sprintId, due_date: m.due_date || null,
      assignee_id: m.assignee_id || null, tags: [], logged_hours: 0, depth: 0, position: mi,
    } as never).select('id').single()
    if (mErr || !mData) return { ok: false as const, error: `Errore milestone: ${mErr?.message ?? 'sconosciuto'}` }
    const milestoneId = (mData as { id: string }).id
    if (m.assignee_id) assignRows.push({ task_id: milestoneId, profile_id: m.assignee_id })

    if (m.tasks?.length) {
      const { data: tData, error: tErr } = await g.admin.from('tasks').insert(
        m.tasks.map((t, ti) => ({
          project_id: input.projectId, title: t.title, status: 'da_fare', priority: t.priority || 'media',
          is_milestone: false, milestone_id: milestoneId, sprint_id: input.sprintId,
          due_date: t.due_date || m.due_date || null, assignee_id: t.assignee_id || null,
          tags: [], logged_hours: 0, depth: 0, position: ti,
        })) as never
      ).select('id')
      if (tErr) return { ok: false as const, error: `Errore task: ${tErr.message}` }
      ;(tData as { id: string }[] | null)?.forEach((row, idx) => {
        const pid = m.tasks![idx]?.assignee_id
        if (pid) assignRows.push({ task_id: row.id, profile_id: pid })
      })
    }
  }

  if (assignRows.length) {
    await g.admin.from('task_assignees').upsert(
      assignRows.map(r => ({ ...r, is_primary_owner: true, role: 'owner', assigned_by: g.userId })) as never,
      { onConflict: 'task_id,profile_id' },
    )
  }
  const clientId = await clientIdOf(g.admin, input.projectId)
  revalidateConnected(clientId)
  return { ok: true as const, projectId: input.projectId, clientId }
}

// Aggancia task generate dall'AI a una milestone esistente.
export async function createAiTasks(input: {
  projectId: string; milestoneId: string; sprintId?: string | null
  tasks: { title: string; priority?: string; due_date?: string; assignee_id?: string }[]
}) {
  const g = await guard()
  if ('error' in g) return { ok: false as const, error: g.error }
  if (!input.projectId || !input.milestoneId) return { ok: false as const, error: 'Progetto e milestone obbligatori' }
  if (!input.tasks?.length) return { ok: false as const, error: 'Nessuna task' }

  const { data: tData, error: tErr } = await g.admin.from('tasks').insert(
    input.tasks.map((t, ti) => ({
      project_id: input.projectId, title: t.title, status: 'da_fare', priority: t.priority || 'media',
      is_milestone: false, milestone_id: input.milestoneId, sprint_id: input.sprintId || null,
      due_date: t.due_date || null, assignee_id: t.assignee_id || null,
      tags: [], logged_hours: 0, depth: 0, position: ti,
    })) as never
  ).select('id')
  if (tErr) return { ok: false as const, error: `Errore task: ${tErr.message}` }

  const assignRows: { task_id: string; profile_id: string }[] = []
  ;(tData as { id: string }[] | null)?.forEach((row, idx) => {
    const pid = input.tasks[idx]?.assignee_id
    if (pid) assignRows.push({ task_id: row.id, profile_id: pid })
  })
  if (assignRows.length) {
    await g.admin.from('task_assignees').upsert(
      assignRows.map(r => ({ ...r, is_primary_owner: true, role: 'owner', assigned_by: g.userId })) as never,
      { onConflict: 'task_id,profile_id' },
    )
  }
  const clientId = await clientIdOf(g.admin, input.projectId)
  revalidateConnected(clientId)
  return { ok: true as const, projectId: input.projectId, clientId }
}
