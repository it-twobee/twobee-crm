import { schema, S, capLimit, escapeLike, listInfo, type AnyTool } from './types'
import { accessFor, clientsTableFor } from './access'

/** Valori del CHECK su `projects`: stati in inglese, aree in italiano. */
const PROJECT_STATUSES = ['draft', 'active', 'on_hold', 'completed', 'archived'] as const
const AREAS = ['marketing', 'growth', 'digital'] as const

const PROJECT_SELECT =
  'id, name, status, area, service_type, service_subtype, operating_model, client_id, manager_id, start_date, target_end_date'

interface ProjectRow {
  id: string; name: string; status: string; area: string | null
  service_type: string | null; service_subtype: string | null; operating_model: string | null
  client_id: string | null; manager_id: string | null
  start_date: string | null; target_end_date: string | null
}

export const listProjects: AnyTool = {
  name: 'list_projects',
  description: 'Cerca ed elenca i progetti per nome, cliente, stato o area.',
  parameters: schema({
    nome: S.str('Cerca per nome, anche parziale. Guarda in tutti gli stati.'),
    cliente_id: S.str('UUID del cliente'),
    stato: S.enum('Filtra per stato. Default: solo attivi.', PROJECT_STATUSES),
    area: S.enum('Filtra per area', AREAS),
    limite: S.num('Massimo risultati (default 20)'),
  }),
  mutating: false,
  risky: false,
  canUse: accessFor('list_projects'),
  async run(args: { nome?: string; cliente_id?: string; stato?: string; area?: string; limite?: number }, c) {
    let q = c.sb.from('projects').select(PROJECT_SELECT, { count: 'exact' }).is('deleted_at', null)
    if (args.nome) q = q.ilike('name', `%${escapeLike(args.nome)}%`)
    if (args.cliente_id) q = q.eq('client_id', args.cliente_id)
    // Il default "solo attivi" serve a "che progetti abbiamo in corso?". Ma se sta
    // cercando un nome preciso vuole QUEL progetto, anche se è in draft o chiuso:
    // restringere agli attivi qui produce un "non esiste" che è falso.
    if (args.stato) q = q.eq('status', args.stato)
    else if (!args.nome) q = q.eq('status', 'active')
    if (args.area) q = q.eq('area', args.area)

    const { data, error, count } = await q.order('name').limit(capLimit(args.limite))
    if (error) return { error: error.message }

    const rows = (data ?? []) as unknown as ProjectRow[]
    // I nomi cliente arrivano da una seconda query e non da una join annidata:
    // nel workspace la fonte è la VIEW clients_workspace, che una join su
    // `projects.clients(...)` scavalcherebbe riportando l'MRR vero.
    const clientIds = Array.from(new Set(rows.map((p) => p.client_id).filter(Boolean))) as string[]
    const clientsTable = clientsTableFor(c)
    const { data: cl } = clientIds.length
      ? await c.sb.from(clientsTable).select('id, company_name').in('id', clientIds)
      : { data: [] }
    const clients = new Map(((cl ?? []) as { id: string; company_name: string }[]).map((x) => [x.id, x.company_name]))

    return {
      ...listInfo(count, rows.length),
      progetti: rows.map((p) => ({
        id: p.id, nome: p.name, stato: p.status, area: p.area,
        servizio: p.service_type, sottoservizio: p.service_subtype,
        modello: p.operating_model,
        cliente: p.client_id ? clients.get(p.client_id) ?? null : 'interno',
        cliente_id: p.client_id, pm_id: p.manager_id,
        dal: p.start_date, al: p.target_end_date,
      })),
    }
  },
}

export const getProject: AnyTool = {
  name: 'get_project',
  description: 'Leggi un progetto con avanzamento task, workstream e milestone.',
  parameters: schema({ progetto_id: S.str('UUID del progetto') }, ['progetto_id']),
  mutating: false,
  risky: false,
  canUse: accessFor('get_project'),
  async run(args: { progetto_id: string }, c) {
    const { data: p, error } = await c.sb
      .from('projects')
      .select(`${PROJECT_SELECT}, description, created_at`)
      .eq('id', args.progetto_id).is('deleted_at', null).maybeSingle()
    if (error) return { error: error.message }
    if (!p) return { error: 'Progetto non trovato o non visibile con i tuoi permessi' }

    const proj = p as unknown as ProjectRow & { description: string | null; created_at: string }

    const [{ data: tasks }, { data: workstreams }, { data: milestones }] = await Promise.all([
      c.sb.from('tasks').select('status').eq('project_id', args.progetto_id).is('deleted_at', null),
      c.sb.from('project_workstreams').select('id, name, workstream_type, status, start_date, end_date')
        .eq('project_id', args.progetto_id).order('sort_order'),
      c.sb.from('milestones').select('id, title, status, due_date, milestone_type')
        .eq('project_id', args.progetto_id).order('due_date', { ascending: true, nullsFirst: false }),
    ])

    const t = (tasks ?? []) as { status: string }[]
    const done = t.filter((x) => x.status === 'completato').length

    return {
      id: proj.id,
      nome: proj.name,
      descrizione: proj.description,
      stato: proj.status,
      area: proj.area,
      servizio: proj.service_type,
      modello: proj.operating_model,
      cliente_id: proj.client_id,
      pm_id: proj.manager_id,
      task_totali: t.length,
      task_completate: done,
      avanzamento_pct: t.length ? Math.round((done / t.length) * 100) : 0,
      workstream: ((workstreams ?? []) as {
        id: string; name: string; workstream_type: string; status: string
        start_date: string | null; end_date: string | null
      }[]).map((s) => ({
        id: s.id, nome: s.name, tipo: s.workstream_type, stato: s.status, dal: s.start_date, al: s.end_date,
      })),
      milestone: ((milestones ?? []) as {
        id: string; title: string; status: string; due_date: string | null; milestone_type: string
      }[]).map((m) => ({
        id: m.id, titolo: m.title, stato: m.status, scadenza: m.due_date, tipo: m.milestone_type,
      })),
    }
  },
}

export const listWorkstreams: AnyTool = {
  name: 'list_workstreams',
  description: 'Elenca i workstream di un progetto con date e stato. Servono per creare task.',
  parameters: schema({ progetto_id: S.str('UUID del progetto') }, ['progetto_id']),
  mutating: false,
  risky: false,
  canUse: accessFor('list_workstreams'),
  async run(args: { progetto_id: string }, c) {
    const { data, error } = await c.sb
      .from('project_workstreams')
      .select('id, name, workstream_type, status, start_date, end_date')
      .eq('project_id', args.progetto_id).order('sort_order')
    if (error) return { error: error.message }
    return {
      workstream: ((data ?? []) as {
        id: string; name: string; workstream_type: string; status: string
        start_date: string | null; end_date: string | null
      }[]).map((s) => ({
        id: s.id, nome: s.name, tipo: s.workstream_type, stato: s.status, dal: s.start_date, al: s.end_date,
      })),
    }
  },
}

export const listMilestones: AnyTool = {
  name: 'list_milestones',
  description: 'Elenca le milestone di un progetto con scadenza e stato.',
  parameters: schema({
    progetto_id: S.str('UUID del progetto'),
    workstream_id: S.str('UUID del workstream, per restringere'),
  }, ['progetto_id']),
  mutating: false,
  risky: false,
  canUse: accessFor('list_milestones'),
  async run(args: { progetto_id: string; workstream_id?: string }, c) {
    let q = c.sb.from('milestones')
      .select('id, title, status, due_date, milestone_type, workstream_id, deliverable')
      .eq('project_id', args.progetto_id)
    if (args.workstream_id) q = q.eq('workstream_id', args.workstream_id)

    const { data, error } = await q.order('due_date', { ascending: true, nullsFirst: false })
    if (error) return { error: error.message }
    return {
      milestone: ((data ?? []) as {
        id: string; title: string; status: string; due_date: string | null
        milestone_type: string; workstream_id: string; deliverable: string | null
      }[]).map((m) => ({
        id: m.id, titolo: m.title, stato: m.status, scadenza: m.due_date,
        tipo: m.milestone_type, workstream_id: m.workstream_id, deliverabile: m.deliverable,
      })),
    }
  },
}

export const READ_PROJECT_TOOLS: AnyTool[] = [listProjects, getProject, listWorkstreams, listMilestones]
