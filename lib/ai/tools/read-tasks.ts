import { ACTIVE_TASK_STATUSES } from '@/lib/task-status'
import type { AssistantCtx } from '../context'
import { schema, S, capLimit, type AnyTool } from './types'

const STATUSES = ['da_fare', 'in_corso', 'in_revisione', 'completato', 'richiesta_supporto'] as const
const PRIORITIES = ['alta', 'media', 'bassa'] as const

const TASK_SELECT =
  'id, title, status, priority, due_date, estimated_hours, logged_hours, is_milestone, project_id, sprint_id, assignee_id'

interface TaskRow {
  id: string; title: string; status: string; priority: string
  due_date: string | null; estimated_hours: number | null; logged_hours: number | null
  is_milestone: boolean; project_id: string | null; sprint_id: string | null; assignee_id: string | null
}

// Il modello riceve nomi, non UUID: "Setup GA4 · Acme · scade il 3/9" è
// utilizzabile in una risposta, "a3f1-…" no. Gli id restano per i tool di scrittura.
async function decorate(c: AssistantCtx, rows: TaskRow[]) {
  if (!rows.length) return []
  const projectIds = Array.from(new Set(rows.map((t) => t.project_id).filter(Boolean))) as string[]
  const peopleIds = Array.from(new Set(rows.map((t) => t.assignee_id).filter(Boolean))) as string[]

  const [projRes, peopleRes] = await Promise.all([
    projectIds.length
      ? c.sb.from('projects').select('id, name, client_id, clients(company_name)').in('id', projectIds)
      : Promise.resolve({ data: [] }),
    peopleIds.length
      ? c.sb.from('profiles').select('id, full_name').in('id', peopleIds)
      : Promise.resolve({ data: [] }),
  ])

  const projects = new Map(
    ((projRes.data ?? []) as unknown as { id: string; name: string; client_id: string | null; clients: { company_name: string } | null }[])
      .map((p) => [p.id, p]),
  )
  const people = new Map(((peopleRes.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]))

  return rows.map((t) => {
    const p = t.project_id ? projects.get(t.project_id) : undefined
    return {
      id: t.id,
      titolo: t.title,
      stato: t.status,
      priorita: t.priority,
      scadenza: t.due_date,
      ore_stimate: t.estimated_hours,
      ore_registrate: t.logged_hours,
      milestone: t.is_milestone || undefined,
      progetto: p?.name ?? (t.project_id ? null : 'personale'),
      progetto_id: t.project_id,
      cliente: p?.clients?.company_name ?? null,
      assegnatario: t.assignee_id ? people.get(t.assignee_id) ?? null : null,
      assegnatario_id: t.assignee_id,
    }
  })
}

export const listMyTasks: AnyTool = {
  name: 'list_my_tasks',
  description: 'Elenca le task assegnate a chi sta parlando, ordinate per scadenza.',
  parameters: schema({
    stato: S.enum('Filtra per stato. Ometti per vedere solo le task aperte.', STATUSES),
    scade_entro: S.date('Solo task con scadenza entro questa data'),
    limite: S.num('Massimo risultati (default 20)'),
  }),
  mutating: false,
  risky: false,
  canUse: () => true,
  async run(args: { stato?: string; scade_entro?: string; limite?: number }, c) {
    // Assegnatario primario OR collaboratore: task_assignees è la sorgente canonica
    // dei 0..N assegnatari, quindi guardare solo assignee_id perderebbe le task
    // in cui l'utente è secondo owner.
    const { data: bridge } = await c.sb
      .from('task_assignees').select('task_id').eq('profile_id', c.userId)
    const bridgeIds = ((bridge ?? []) as { task_id: string }[]).map((b) => b.task_id)

    let q = c.sb.from('tasks').select(TASK_SELECT).is('deleted_at', null)
    q = bridgeIds.length
      ? q.or(`assignee_id.eq.${c.userId},id.in.(${bridgeIds.join(',')})`)
      : q.eq('assignee_id', c.userId)

    if (args.stato) q = q.eq('status', args.stato)
    else q = q.in('status', ACTIVE_TASK_STATUSES as unknown as string[])
    if (args.scade_entro) q = q.lte('due_date', args.scade_entro)

    const { data, error } = await q
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(capLimit(args.limite))
    if (error) return { error: error.message }
    return { task: await decorate(c, (data ?? []) as TaskRow[]) }
  },
}

export const listTasks: AnyTool = {
  name: 'list_tasks',
  description: 'Cerca task del team con filtri: progetto, assegnatario, stato, finestra di scadenza.',
  parameters: schema({
    progetto_id: S.str('UUID del progetto'),
    assegnatario_id: S.str('UUID della persona assegnataria'),
    stato: S.enum('Filtra per stato', STATUSES),
    priorita: S.enum('Filtra per priorità', PRIORITIES),
    scade_da: S.date('Scadenza a partire da'),
    scade_a: S.date('Scadenza fino a'),
    solo_milestone: S.bool('Solo le milestone'),
    limite: S.num('Massimo risultati (default 20)'),
  }),
  mutating: false,
  risky: false,
  canUse: () => true,
  async run(
    args: {
      progetto_id?: string; assegnatario_id?: string; stato?: string; priorita?: string
      scade_da?: string; scade_a?: string; solo_milestone?: boolean; limite?: number
    },
    c,
  ) {
    let q = c.sb.from('tasks').select(TASK_SELECT).is('deleted_at', null)
    if (args.progetto_id) q = q.eq('project_id', args.progetto_id)
    if (args.assegnatario_id) q = q.eq('assignee_id', args.assegnatario_id)
    if (args.stato) q = q.eq('status', args.stato)
    else q = q.in('status', ACTIVE_TASK_STATUSES as unknown as string[])
    if (args.priorita) q = q.eq('priority', args.priorita)
    if (args.scade_da) q = q.gte('due_date', args.scade_da)
    if (args.scade_a) q = q.lte('due_date', args.scade_a)
    if (args.solo_milestone) q = q.eq('is_milestone', true)

    const { data, error } = await q
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(capLimit(args.limite))
    if (error) return { error: error.message }
    return { task: await decorate(c, (data ?? []) as TaskRow[]) }
  },
}

export const getTask: AnyTool = {
  name: 'get_task',
  description: 'Leggi il dettaglio completo di una task, inclusi descrizione e assegnatari.',
  parameters: schema({ task_id: S.str('UUID della task') }, ['task_id']),
  mutating: false,
  risky: false,
  canUse: () => true,
  async run(args: { task_id: string }, c) {
    const { data, error } = await c.sb
      .from('tasks')
      .select(`${TASK_SELECT}, description, tags, created_at`)
      .eq('id', args.task_id).is('deleted_at', null).maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: 'Task non trovata o non visibile con i tuoi permessi' }

    const row = data as unknown as TaskRow & { description: string | null; tags: string[]; created_at: string }
    const [base] = await decorate(c, [row])

    const { data: assignees } = await c.sb
      .from('task_assignees')
      .select('profile_id, is_primary_owner, profiles(full_name)')
      .eq('task_id', args.task_id)

    return {
      ...base,
      descrizione: row.description,
      tag: row.tags,
      creata_il: row.created_at,
      assegnatari: ((assignees ?? []) as unknown as { profile_id: string; is_primary_owner: boolean; profiles: { full_name: string } | null }[])
        .map((a) => ({ id: a.profile_id, nome: a.profiles?.full_name ?? null, primario: a.is_primary_owner })),
    }
  },
}

export const READ_TASK_TOOLS: AnyTool[] = [listMyTasks, listTasks, getTask]
