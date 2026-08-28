import type { AssistantCtx } from '../context'
import { schema, S, capLimit, type AnyTool } from './types'
import { accessFor, clientsTableFor } from './access'

/** I valori del CHECK `tasks_status_check` sul DB. Nota `in_review`, non `in_revisione`. */
const STATUSES = ['da_fare', 'in_corso', 'in_review', 'richiesta_supporto', 'completato'] as const
const ACTIVE_STATUSES = ['da_fare', 'in_corso', 'in_review', 'richiesta_supporto'] as const
const PRIORITIES = ['alta', 'media', 'bassa'] as const
const TASK_TYPES = ['project', 'ad_hoc', 'cliente'] as const

const TASK_SELECT =
  'id, title, status, priority, due_date, estimated_hours, logged_hours, task_type, project_id, milestone_id, client_id, assignee_id'

interface TaskRow {
  id: string; title: string; status: string; priority: string
  due_date: string | null; estimated_hours: number | null; logged_hours: number | null
  task_type: string; project_id: string | null; milestone_id: string | null
  client_id: string | null; assignee_id: string | null
}

/**
 * Il modello riceve nomi, non UUID: "Setup GA4 · Acme · scade il 3/9" è
 * utilizzabile in una risposta, "a3f1-…" no. Gli id restano per i tool di scrittura.
 *
 * Il cliente si risolve per due strade perché le task sono di due forme (§ CHECK
 * `tasks_hierarchy_chk`): quelle di progetto lo raggiungono via `projects`, le ad
 * hoc ce l'hanno addosso su `client_id` e non hanno progetto.
 */
async function decorate(c: AssistantCtx, rows: TaskRow[]) {
  if (!rows.length) return []
  const projectIds = Array.from(new Set(rows.map((t) => t.project_id).filter(Boolean))) as string[]
  const peopleIds = Array.from(new Set(rows.map((t) => t.assignee_id).filter(Boolean))) as string[]
  const clientIds = Array.from(new Set(rows.map((t) => t.client_id).filter(Boolean))) as string[]

  const clientsTable = clientsTableFor(c)

  const [projRes, peopleRes, clientRes] = await Promise.all([
    projectIds.length
      ? c.sb.from('projects').select('id, name, client_id').in('id', projectIds)
      : Promise.resolve({ data: [] }),
    peopleIds.length
      ? c.sb.from('profiles').select('id, full_name').in('id', peopleIds)
      : Promise.resolve({ data: [] }),
    clientIds.length
      ? c.sb.from(clientsTable).select('id, company_name').in('id', clientIds)
      : Promise.resolve({ data: [] }),
  ])

  const projects = new Map(
    ((projRes.data ?? []) as { id: string; name: string; client_id: string | null }[]).map((p) => [p.id, p]),
  )
  const people = new Map(((peopleRes.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]))
  const clients = new Map(((clientRes.data ?? []) as { id: string; company_name: string }[]).map((x) => [x.id, x.company_name]))

  return rows.map((t) => {
    const p = t.project_id ? projects.get(t.project_id) : undefined
    const clientId = t.client_id ?? p?.client_id ?? null
    return {
      id: t.id,
      titolo: t.title,
      stato: t.status,
      priorita: t.priority,
      scadenza: t.due_date,
      ore_stimate: t.estimated_hours,
      ore_registrate: t.logged_hours,
      tipo: t.task_type,
      progetto: p?.name ?? null,
      progetto_id: t.project_id,
      cliente: clientId ? clients.get(clientId) ?? null : null,
      cliente_id: clientId,
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
  canUse: accessFor('list_my_tasks'),
  async run(args: { stato?: string; scade_entro?: string; limite?: number }, c) {
    // Assegnatario primario OR collaboratore: task_assignees è la sorgente canonica
    // dei 0..N assegnatari, quindi guardare solo assignee_id perderebbe le task
    // in cui l'utente è secondo owner o supervisore.
    const { data: bridge } = await c.sb
      .from('task_assignees').select('task_id').eq('profile_id', c.userId)
    const bridgeIds = ((bridge ?? []) as { task_id: string }[]).map((b) => b.task_id)

    let q = c.sb.from('tasks').select(TASK_SELECT).is('deleted_at', null)
    q = bridgeIds.length
      ? q.or(`assignee_id.eq.${c.userId},id.in.(${bridgeIds.join(',')})`)
      : q.eq('assignee_id', c.userId)

    if (args.stato) q = q.eq('status', args.stato)
    else q = q.in('status', ACTIVE_STATUSES as unknown as string[])
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
    cliente_id: S.str('UUID del cliente'),
    assegnatario_id: S.str('UUID della persona assegnataria'),
    stato: S.enum('Filtra per stato', STATUSES),
    priorita: S.enum('Filtra per priorità', PRIORITIES),
    tipo: S.enum('Tipo di task: di progetto, ad hoc nostra, o in carico al cliente', TASK_TYPES),
    scade_da: S.date('Scadenza a partire da'),
    scade_a: S.date('Scadenza fino a'),
    limite: S.num('Massimo risultati (default 20)'),
  }),
  mutating: false,
  risky: false,
  canUse: accessFor('list_tasks'),
  async run(
    args: {
      progetto_id?: string; cliente_id?: string; assegnatario_id?: string; stato?: string
      priorita?: string; tipo?: string; scade_da?: string; scade_a?: string; limite?: number
    },
    c,
  ) {
    let q = c.sb.from('tasks').select(TASK_SELECT).is('deleted_at', null)
    if (args.progetto_id) q = q.eq('project_id', args.progetto_id)
    if (args.cliente_id) q = q.eq('client_id', args.cliente_id)
    if (args.assegnatario_id) q = q.eq('assignee_id', args.assegnatario_id)
    if (args.stato) q = q.eq('status', args.stato)
    else q = q.in('status', ACTIVE_STATUSES as unknown as string[])
    if (args.priorita) q = q.eq('priority', args.priorita)
    if (args.tipo) q = q.eq('task_type', args.tipo)
    if (args.scade_da) q = q.gte('due_date', args.scade_da)
    if (args.scade_a) q = q.lte('due_date', args.scade_a)

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
  canUse: accessFor('get_task'),
  async run(args: { task_id: string }, c) {
    const { data, error } = await c.sb
      .from('tasks')
      .select(`${TASK_SELECT}, description, created_at, completed_at`)
      .eq('id', args.task_id).is('deleted_at', null).maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: 'Task non trovata o non visibile con i tuoi permessi' }

    const row = data as unknown as TaskRow & {
      description: string | null; created_at: string; completed_at: string | null
    }
    const [base] = await decorate(c, [row])

    const { data: assignees } = await c.sb
      .from('task_assignees')
      .select('profile_id, is_primary_owner, role_in_task, profiles(full_name)')
      .eq('task_id', args.task_id)

    return {
      ...base,
      descrizione: row.description,
      creata_il: row.created_at,
      completata_il: row.completed_at,
      assegnatari: ((assignees ?? []) as unknown as {
        profile_id: string; is_primary_owner: boolean; role_in_task: string | null
        profiles: { full_name: string } | null
      }[]).map((a) => ({
        id: a.profile_id, nome: a.profiles?.full_name ?? null,
        primario: a.is_primary_owner, ruolo: a.role_in_task,
      })),
    }
  },
}

export const READ_TASK_TOOLS: AnyTool[] = [listMyTasks, listTasks, getTask]
