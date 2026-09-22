'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { notificaAssegnazione } from '@/lib/notify'
import { generaSubito } from '@/lib/recurrence-kick'
import type { MilestoneStatus, Visibility, ProjectTemplateNode } from '@/lib/types/database'

async function requireStaff(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin' && p?.role !== 'team') throw new Error('Permesso negato')
  return user.id
}

const rev = (projectId: string) => { revalidatePath(`/progetti/${projectId}`); revalidatePath(`/workspace/progetti/${projectId}`) }

export async function createMilestone(input: {
  project_id: string
  workstream_id: string
  title: string
  due_date?: string | null
  approval_required?: boolean
  deliverable?: string | null
  visibility?: Visibility
}) {
  await requireStaff()
  const { data, error } = await createAdminClient().from('milestones').insert({
    project_id: input.project_id,
    workstream_id: input.workstream_id,
    title: input.title.trim(),
    milestone_type: 'delivery',
    status: 'da_fare',
    due_date: input.due_date || null,
    approval_required: input.approval_required ?? false,
    deliverable: input.deliverable?.trim() || null,
    visibility: input.visibility ?? 'internal',
  }).select('id').single()
  if (error) throw new Error(error.message)
  rev(input.project_id)
  return data.id as string
}

export async function updateMilestone(id: string, projectId: string, updates: {
  title?: string
  status?: MilestoneStatus
  due_date?: string | null
  deliverable?: string | null
  visibility?: Visibility
  owner_id?: string | null
}) {
  const uid = await requireStaff()
  const admin = createAdminClient()
  const patch: Record<string, unknown> = { ...updates }
  if (updates.status === 'completata') patch.completed_at = new Date().toISOString()
  /* §350 — prendere in carico una consegna è la seconda cosa che vale una
     notifica: si legge **prima** di scrivere, perché rimettere lo stesso
     responsabile non è un'assegnazione nuova e non deve suonare. */
  const { data: prima } = updates.owner_id !== undefined
    ? await admin.from('milestones').select('title, owner_id, workstream_id').eq('id', id).maybeSingle()
    : { data: null }
  const { error } = await admin.from('milestones').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  const before = prima as { title?: string; owner_id?: string | null; workstream_id?: string } | null
  if (before && updates.owner_id && updates.owner_id !== before.owner_id) {
    await notificaAssegnazione({
      destinatario: updates.owner_id, autore: uid, tipo: 'milestone_assigned',
      titolo: before.title ?? 'Milestone', dettaglio: 'milestone da consegnare',
      link: `/workspace/progetti/${projectId}/workstream/${before.workstream_id}`,
      db: admin,
    })
  }
  rev(projectId)
}

export async function deleteMilestone(id: string, projectId: string) {
  await requireStaff()
  // le task collegate cadono via ON DELETE CASCADE
  const { error } = await createAdminClient().from('milestones').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}

/**
 * §405 — la tappa che nasce dal modello, con i suoi task.
 *
 * Stessa regola della corsia (§402): quello che il servizio fa di solito sta
 * nei suoi modelli, e riscriverlo a mano è il modo di riscriverlo diverso ogni
 * volta. La scadenza si ancora all'avvio del progetto quando il modello ha un
 * `relative_due_days`, o la tappa nasce senza data e resta fuori dal calendario.
 */
export async function createMilestoneDaModello(input: {
  project_id: string
  workstream_id: string
  /** il nodo `milestone` del modello */
  node_id: string
  /** il titolo finale, già passato dalla convention. Senza, quello del modello */
  title?: string
  due_date?: string | null
  owner_id?: string | null
}): Promise<{ id: string; task: number; ricorrenti: number }> {
  const uid = await requireStaff()
  const admin = createActorClient(uid)

  const { data: nodo } = await admin.from('project_template_nodes')
    .select('*').eq('id', input.node_id).maybeSingle()
  if (!nodo || (nodo as { node_type: string }).node_type !== 'milestone') {
    throw new Error('Questo modello di tappa non esiste più')
  }
  const radice = nodo as ProjectTemplateNode

  const { data: prog } = await admin.from('projects')
    .select('id, client_id, manager_id, start_date').eq('id', input.project_id).maybeSingle()
  if (!prog) throw new Error('Questo progetto non esiste più')
  const progetto = prog as { client_id: string | null; manager_id: string | null; start_date: string | null }

  const { data: figli } = await admin.from('project_template_nodes')
    .select('*').eq('parent_id', radice.id).order('sort_order')
  const dentro = (figli ?? []) as ProjectTemplateNode[]

  const scadenza = (giorni: number | null) => {
    if (giorni === null || !progetto.start_date) return null
    const d = new Date(`${progetto.start_date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + giorni)
    return d.toISOString().slice(0, 10)
  }
  const responsabile = input.owner_id ?? progetto.manager_id ?? null

  const { data: ms, error } = await admin.from('milestones').insert({
    project_id: input.project_id,
    workstream_id: input.workstream_id,
    title: (input.title?.trim() || radice.name).trim(),
    description: radice.description,
    milestone_type: radice.milestone_type ?? 'delivery',
    status: 'da_fare',
    owner_id: responsabile,
    due_date: input.due_date !== undefined ? input.due_date : scadenza(radice.relative_due_days),
    visibility: radice.visibility,
  }).select('id').single()
  if (error) throw new Error(error.message)
  const msId = (ms as { id: string }).id

  const task = dentro.filter(n => n.node_type === 'task').map(n => ({
    client_id: progetto.client_id, task_type: 'project',
    project_id: input.project_id, workstream_id: input.workstream_id, milestone_id: msId,
    title: n.name, description: n.description,
    priority: n.priority ?? 'media', estimated_hours: n.estimated_hours,
    due_date: scadenza(n.relative_due_days), visibility: n.visibility,
    created_by: uid,
  }))
  if (task.length) {
    const { error: e1 } = await admin.from('tasks').insert(task)
    if (e1) throw new Error(e1.message)
  }

  const ricorrenti = dentro.filter(n => n.node_type === 'recurring_task').map(n => ({
    client_id: progetto.client_id, project_id: input.project_id,
    workstream_id: input.workstream_id, milestone_id: msId,
    title: n.name, description: n.description,
    frequency: n.frequency ?? 'weekly', interval: 1,
    start_date: progetto.start_date || new Date().toISOString().slice(0, 10),
    owner_id: responsabile, priority: n.priority ?? 'media',
    estimated_hours: n.estimated_hours, visibility: n.visibility,
    active: true, created_by: uid,
  }))
  if (ricorrenti.length) {
    const { error: e2 } = await admin.from('recurring_task_templates').insert(ricorrenti)
    if (e2) throw new Error(e2.message)
    // §346 — la prima occorrenza adesso: una regola senza occorrenze non si vede
    await generaSubito({ projectId: input.project_id })
  }

  rev(input.project_id)
  return { id: msId, task: task.length, ricorrenti: ricorrenti.length }
}
