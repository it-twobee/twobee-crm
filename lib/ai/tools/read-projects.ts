import { fetchWorkloadData } from '@/lib/workload-data'
import { computeResourceLoads } from '@/lib/workload'
import { schema, S, capLimit, type AnyTool } from './types'

const PROJECT_STATUSES = ['attivo', 'in_pausa', 'completato', 'archiviato'] as const
const PROJECT_KINDS = ['growth', 'marketing', 'digital', 'ai'] as const

export const listProjects: AnyTool = {
  name: 'list_projects',
  description: 'Elenca i progetti, filtrabili per cliente, stato e tipo.',
  parameters: schema({
    cliente_id: S.str('UUID del cliente'),
    stato: S.enum('Filtra per stato. Default: solo attivi.', PROJECT_STATUSES),
    tipo: S.enum('Filtra per tipo di progetto', PROJECT_KINDS),
    limite: S.num('Massimo risultati (default 20)'),
  }),
  mutating: false,
  risky: false,
  canUse: () => true,
  async run(args: { cliente_id?: string; stato?: string; tipo?: string; limite?: number }, c) {
    let q = c.sb
      .from('projects')
      .select('id, name, status, project_kind, project_type, sprint_current, client_id, manager_id, clients(company_name)')
    if (args.cliente_id) q = q.eq('client_id', args.cliente_id)
    q = args.stato ? q.eq('status', args.stato) : q.eq('status', 'attivo')
    if (args.tipo) q = q.eq('project_kind', args.tipo)

    const { data, error } = await q.order('name').limit(capLimit(args.limite))
    if (error) return { error: error.message }

    const rows = (data ?? []) as unknown as {
      id: string; name: string; status: string; project_kind: string | null
      project_type: string | null; sprint_current: number | null
      client_id: string | null; manager_id: string | null; clients: { company_name: string } | null
    }[]
    return {
      progetti: rows.map((p) => ({
        id: p.id, nome: p.name, stato: p.status, tipo: p.project_kind,
        categoria: p.project_type, sprint_corrente: p.sprint_current,
        cliente: p.clients?.company_name ?? null, cliente_id: p.client_id, pm_id: p.manager_id,
      })),
    }
  },
}

export const getProject: AnyTool = {
  name: 'get_project',
  description: 'Leggi un progetto con avanzamento task, sprint e milestone.',
  parameters: schema({ progetto_id: S.str('UUID del progetto') }, ['progetto_id']),
  mutating: false,
  risky: false,
  canUse: () => true,
  async run(args: { progetto_id: string }, c) {
    const { data: p, error } = await c.sb
      .from('projects')
      .select('id, name, description, status, project_kind, project_type, sprint_current, manager_id, created_at, clients(company_name)')
      .eq('id', args.progetto_id).maybeSingle()
    if (error) return { error: error.message }
    if (!p) return { error: 'Progetto non trovato o non visibile con i tuoi permessi' }

    const proj = p as unknown as {
      id: string; name: string; description: string | null; status: string
      project_kind: string | null; project_type: string | null; sprint_current: number | null
      manager_id: string | null; created_at: string; clients: { company_name: string } | null
    }

    const [{ data: tasks }, { data: sprints }] = await Promise.all([
      c.sb.from('tasks').select('status, is_milestone, title, due_date')
        .eq('project_id', args.progetto_id).is('deleted_at', null),
      c.sb.from('sprints').select('id, name, status, start_date, end_date')
        .eq('project_id', args.progetto_id).order('start_date'),
    ])

    const t = (tasks ?? []) as { status: string; is_milestone: boolean; title: string; due_date: string | null }[]
    const done = t.filter((x) => x.status === 'completato').length

    return {
      id: proj.id,
      nome: proj.name,
      descrizione: proj.description,
      stato: proj.status,
      tipo: proj.project_kind,
      categoria: proj.project_type,
      cliente: proj.clients?.company_name ?? null,
      pm_id: proj.manager_id,
      task_totali: t.length,
      task_completate: done,
      avanzamento_pct: t.length ? Math.round((done / t.length) * 100) : 0,
      milestone: t.filter((x) => x.is_milestone).map((x) => ({ titolo: x.title, scadenza: x.due_date })),
      sprint: ((sprints ?? []) as { id: string; name: string; status: string; start_date: string; end_date: string }[])
        .map((s) => ({ id: s.id, nome: s.name, stato: s.status, dal: s.start_date, al: s.end_date })),
    }
  },
}

export const listSprints: AnyTool = {
  name: 'list_sprints',
  description: 'Elenca gli sprint di un progetto con date e stato.',
  parameters: schema({ progetto_id: S.str('UUID del progetto') }, ['progetto_id']),
  mutating: false,
  risky: false,
  canUse: () => true,
  async run(args: { progetto_id: string }, c) {
    const { data, error } = await c.sb
      .from('sprints').select('id, name, status, start_date, end_date')
      .eq('project_id', args.progetto_id).order('start_date')
    if (error) return { error: error.message }
    return {
      sprint: ((data ?? []) as { id: string; name: string; status: string; start_date: string; end_date: string }[])
        .map((s) => ({ id: s.id, nome: s.name, stato: s.status, dal: s.start_date, al: s.end_date })),
    }
  },
}

export const getWorkload: AnyTool = {
  name: 'get_workload',
  description: 'Calcola il carico di lavoro per risorsa: ore, task attive, task in ritardo.',
  parameters: schema({
    risorsa_id: S.str('UUID di una persona, per il carico di una sola risorsa'),
    limite: S.num('Quante risorse riportare (default 10)'),
  }),
  mutating: false,
  risky: false,
  canUse: () => true,
  async run(args: { risorsa_id?: string; limite?: number }, c) {
    // Stessa fonte della vista /workload: nessun dato economico, e nel workspace
    // il perimetro resta ristretto ai progetti dell'utente.
    const restrict = c.isAdmin || c.isManager ? null : c.userId
    const wl = await fetchWorkloadData(c.sb, c.userId, restrict)
    const projectById = new Map(wl.projects.map((p) => [p.id, p]))
    const multi = new Map(Object.entries(wl.multiAssignees))

    let loads = computeResourceLoads(wl.tasks, projectById, wl.resources, multi)
    if (args.risorsa_id) loads = loads.filter((l) => l.resource.id === args.risorsa_id)

    return {
      carico: loads.slice(0, capLimit(args.limite, 10, 30)).map((l) => ({
        risorsa: l.resource.full_name,
        risorsa_id: l.resource.id,
        ore_stimate: l.totalHours,
        capacita_settimanale: l.resource.weekly_capacity_hours ?? 40,
        task_attive: l.activeTasks,
        task_in_ritardo: l.overdue,
        principali_progetti: l.byProject.slice(0, 3).map((p) => ({ progetto: p.projectName, ore: p.hours })),
      })),
    }
  },
}

export const READ_PROJECT_TOOLS: AnyTool[] = [listProjects, getProject, listSprints, getWorkload]
