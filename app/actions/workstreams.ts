'use server'

import { createClient } from '@/lib/supabase/server'
import { createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { generaSubito } from '@/lib/recurrence-kick'
import type {
  WorkstreamType, WorkstreamStatus, Priority, Visibility, ProjectTemplateNode,
} from '@/lib/types/database'

async function requireStaff(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin' && p?.role !== 'team') throw new Error('Permesso negato')
  return user.id
}

const rev = (projectId: string) => { revalidatePath(`/progetti/${projectId}`); revalidatePath(`/workspace/progetti/${projectId}`) }

// La milestone di sistema "Operatività continua" nasce dal trigger ensure_system_milestone
export async function createWorkstream(input: {
  project_id: string
  name: string
  workstream_type: WorkstreamType
  start_date?: string | null
  end_date?: string | null
  owner_id?: string | null
  visibility?: Visibility
}) {
  const uid = await requireStaff()
  const { data, error } = await createActorClient(uid).from('project_workstreams').insert({
    project_id: input.project_id,
    name: input.name.trim(),
    workstream_type: input.workstream_type,
    status: 'active',
    start_date: input.workstream_type === 'project' ? (input.start_date || null) : null,
    end_date: input.workstream_type === 'project' ? (input.end_date || null) : null,
    owner_id: input.owner_id || null,
    visibility: input.visibility ?? 'internal',
    created_by: uid,
  }).select('id').single()
  if (error) throw new Error(error.message)
  rev(input.project_id)
  return data.id as string
}

export async function updateWorkstream(id: string, projectId: string, updates: {
  name?: string
  status?: WorkstreamStatus
  start_date?: string | null
  end_date?: string | null
  owner_id?: string | null
  priority?: Priority
  visibility?: Visibility
}) {
  const uid = await requireStaff()
  const { error } = await createActorClient(uid).from('project_workstreams').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}

export async function deleteWorkstream(id: string, projectId: string) {
  const uid = await requireStaff()
  // milestone e task figlie cadono via ON DELETE CASCADE
  const { error } = await createActorClient(uid).from('project_workstreams').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}

/**
 * §402 — la corsia che nasce dal modello, con quello che ha dentro.
 *
 * Il wizard semina le corsie scelte con le loro tappe (§400); qui fuori la
 * stessa corsia nasceva vuota, e la stessa domanda non può avere due risposte a
 * seconda della pagina da cui ci si arriva (§322). Chi apre «Advertising» su un
 * progetto che esiste vuole quello che ha dentro, non un contenitore col nome
 * giusto — e riscriverlo a mano è il modo di non riscriverlo affatto.
 *
 * Le date delle tappe si ancorano all'avvio del progetto (`relative_due_days`),
 * come nel wizard: una tappa nata senza scadenza resta fuori dal calendario.
 */
export async function createWorkstreamDaModello(input: {
  project_id: string
  /** il nodo `workstream` del template da cui copiare */
  node_id: string
  /** il nome finale, già passato dalla convention. Senza, quello del modello */
  name?: string
  start_date?: string | null
  end_date?: string | null
  owner_id?: string | null
}): Promise<{ id: string; tappe: number; task: number; ricorrenti: number }> {
  const uid = await requireStaff()
  const admin = createActorClient(uid)

  const { data: nodo } = await admin.from('project_template_nodes')
    .select('*').eq('id', input.node_id).maybeSingle()
  if (!nodo || (nodo as { node_type: string }).node_type !== 'workstream') {
    throw new Error('Questo modello di corsia non esiste più')
  }
  const radice = nodo as ProjectTemplateNode

  const { data: prog } = await admin.from('projects')
    .select('id, client_id, manager_id, start_date, target_end_date').eq('id', input.project_id).maybeSingle()
  if (!prog) throw new Error('Questo progetto non esiste più')
  const progetto = prog as {
    client_id: string | null; manager_id: string | null
    start_date: string | null; target_end_date: string | null
  }

  const { data: figli } = await admin.from('project_template_nodes')
    .select('*').eq('template_id', radice.template_id).order('sort_order')
  const tutti = (figli ?? []) as ProjectTemplateNode[]
  const sotto = (id: string) => tutti.filter(n => n.parent_id === id)

  const perTermine = (radice.workstream_type ?? 'project') === 'project'
  const { data: ws, error } = await admin.from('project_workstreams').insert({
    project_id: input.project_id,
    name: (input.name?.trim() || radice.name).trim(),
    description: radice.description,
    workstream_type: radice.workstream_type ?? 'project',
    status: 'active',
    owner_id: input.owner_id ?? progetto.manager_id,
    visibility: radice.visibility,
    start_date: perTermine ? (input.start_date ?? progetto.start_date) || null : null,
    end_date: perTermine ? (input.end_date ?? progetto.target_end_date) || null : null,
    created_by: uid,
  }).select('id').single()
  if (error) throw new Error(error.message)
  const wsId = (ws as { id: string }).id

  const scadenza = (giorni: number | null) => {
    if (giorni === null || !progetto.start_date) return null
    const d = new Date(`${progetto.start_date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + giorni)
    return d.toISOString().slice(0, 10)
  }

  /* §346 — chi riceverà le occorrenze: la riga, la corsia, il PM. Senza
     responsabile una ricorrente non genera niente e resta ferma per mesi. */
  const responsabile = input.owner_id ?? progetto.manager_id ?? null
  const ricorrenti: Record<string, unknown>[] = []
  let tappe = 0, task = 0

  const aggiungiTask = (n: ProjectTemplateNode, milestoneId: string) => ({
    client_id: progetto.client_id, task_type: 'project',
    project_id: input.project_id, workstream_id: wsId, milestone_id: milestoneId,
    title: n.name, description: n.description,
    priority: n.priority ?? 'media', estimated_hours: n.estimated_hours,
    due_date: scadenza(n.relative_due_days), visibility: n.visibility,
    created_by: uid,
  })
  const aggiungiRicorrente = (n: ProjectTemplateNode, milestoneId: string | null) => ({
    client_id: progetto.client_id, project_id: input.project_id,
    workstream_id: wsId, milestone_id: milestoneId,
    title: n.name, description: n.description,
    frequency: n.frequency ?? 'weekly', interval: 1,
    start_date: progetto.start_date || new Date().toISOString().slice(0, 10),
    owner_id: responsabile, priority: n.priority ?? 'media',
    estimated_hours: n.estimated_hours, visibility: n.visibility,
    active: true, created_by: uid,
  })

  /* Un task appeso direttamente alla corsia non ha dove stare: `tasks` vuole
     tutti e tre i legami. Nel wizard finisce in una tappa «Attività», e qui
     deve finire nello stesso posto, o la stessa corsia risulta diversa a
     seconda di come è nata. */
  let attivita: string | null = null
  const tappaAttivita = async (): Promise<string> => {
    if (attivita) return attivita
    const { data, error: e } = await admin.from('milestones').insert({
      project_id: input.project_id, workstream_id: wsId, title: 'Attività',
      milestone_type: 'delivery', status: 'da_fare', visibility: radice.visibility,
    }).select('id').single()
    if (e) throw new Error(e.message)
    tappe++
    attivita = (data as { id: string }).id
    return attivita
  }

  for (const figlio of sotto(radice.id)) {
    if (figlio.node_type === 'milestone') {
      const { data: ms, error: e1 } = await admin.from('milestones').insert({
        project_id: input.project_id, workstream_id: wsId,
        title: figlio.name, description: figlio.description,
        milestone_type: figlio.milestone_type ?? 'delivery', status: 'da_fare',
        owner_id: responsabile, due_date: scadenza(figlio.relative_due_days),
        visibility: figlio.visibility,
      }).select('id').single()
      if (e1) throw new Error(e1.message)
      tappe++
      const msId = (ms as { id: string }).id
      const dentro = sotto(figlio.id)
      const righe = dentro.filter(n => n.node_type === 'task').map(n => aggiungiTask(n, msId))
      if (righe.length) {
        const { error: e2 } = await admin.from('tasks').insert(righe)
        if (e2) throw new Error(e2.message)
        task += righe.length
      }
      dentro.filter(n => n.node_type === 'recurring_task')
        .forEach(n => ricorrenti.push(aggiungiRicorrente(n, msId)))
    } else if (figlio.node_type === 'task') {
      const msId = await tappaAttivita()
      const { error: e3 } = await admin.from('tasks').insert(aggiungiTask(figlio, msId))
      if (e3) throw new Error(e3.message)
      task++
    } else if (figlio.node_type === 'recurring_task') {
      ricorrenti.push(aggiungiRicorrente(figlio, null))
    }
  }

  if (ricorrenti.length) {
    const { error: e4 } = await admin.from('recurring_task_templates').insert(ricorrenti)
    if (e4) throw new Error(e4.message)
    // §346 — la prima occorrenza adesso: una regola senza occorrenze non si vede
    await generaSubito({ projectId: input.project_id })
  }

  rev(input.project_id)
  revalidatePath('/ad-hoc')
  revalidatePath('/workspace/ad-hoc')
  return { id: wsId, tappe, task, ricorrenti: ricorrenti.length }
}
