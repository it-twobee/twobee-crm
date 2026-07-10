/**
 * Calcoli del carico di lavoro (workload). Puri e deterministici: nessuna
 * dipendenza da React o Supabase, così si testano da soli.
 *
 * "Effort" = ore stimate (`estimated_hours`). Dove manca, una task attiva pesa
 * un default (DEFAULT_TASK_HOURS) così non sparisce dal conteggio.
 */

export const DEFAULT_TASK_HOURS = 4

export interface WLTask {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  estimated_hours: number | null
  logged_hours: number
  assignee_id: string | null
  project_id: string
  is_milestone?: boolean
}

export interface WLProject {
  id: string
  name: string
  status: string
  project_kind: string | null
  client_id: string
  client_name: string
  manager_id: string | null
}

export interface WLResource {
  id: string
  full_name: string
  avatar_url?: string | null
}

export interface WLFilters {
  kind: string | null        // 'growth' | 'digital' | null
  clientId: string | null
  resourceId: string | null
  from: string | null        // ISO date, inclusivo
  to: string | null          // ISO date, inclusivo
}

export const EMPTY_FILTERS: WLFilters = { kind: null, clientId: null, resourceId: null, from: null, to: null }

const isActive = (t: WLTask) => t.status !== 'completato' && !t.is_milestone
const effortOf = (t: WLTask) => t.estimated_hours ?? DEFAULT_TASK_HOURS

/** Una task passa i filtri di data se la sua scadenza cade nella finestra (o non ha scadenza e non c'è finestra). */
function inDateWindow(due: string | null, from: string | null, to: string | null): boolean {
  if (!from && !to) return true
  if (!due) return false
  if (from && due < from) return false
  if (to && due > to) return false
  return true
}

/** Applica i filtri a task+progetti. `multiAssignees` mappa taskId → tutti gli assegnatari. */
export function filterTasks(
  tasks: WLTask[],
  projectById: Map<string, WLProject>,
  filters: WLFilters,
  multiAssignees?: Map<string, string[]>,
): WLTask[] {
  return tasks.filter(t => {
    const p = projectById.get(t.project_id)
    if (!p) return false
    if (filters.kind && p.project_kind !== filters.kind) return false
    if (filters.clientId && p.client_id !== filters.clientId) return false
    if (filters.resourceId) {
      const all = multiAssignees?.get(t.id) ?? (t.assignee_id ? [t.assignee_id] : [])
      if (!all.includes(filters.resourceId)) return false
    }
    if (!inDateWindow(t.due_date, filters.from, filters.to)) return false
    return true
  })
}

export interface ResourceLoad {
  resource: WLResource
  totalHours: number
  activeTasks: number
  overdue: number
  byProject: { projectId: string; projectName: string; hours: number; tasks: number }[]
}

/**
 * Carico per risorsa. Se una task ha più assegnatari, l'effort si **divide** fra
 * loro: altrimenti 3 persone su una task da 6h risulterebbero 18h di lavoro.
 */
export function computeResourceLoads(
  tasks: WLTask[],
  projectById: Map<string, WLProject>,
  resources: WLResource[],
  multiAssignees?: Map<string, string[]>,
  today = new Date(),
): ResourceLoad[] {
  const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().slice(0, 10)
  const byRes = new Map<string, ResourceLoad>()
  for (const r of resources) {
    byRes.set(r.id, { resource: r, totalHours: 0, activeTasks: 0, overdue: 0, byProject: [] })
  }

  for (const t of tasks) {
    if (!isActive(t)) continue
    const assignees = multiAssignees?.get(t.id) ?? (t.assignee_id ? [t.assignee_id] : [])
    if (assignees.length === 0) continue
    const share = effortOf(t) / assignees.length
    const p = projectById.get(t.project_id)

    for (const rid of assignees) {
      const load = byRes.get(rid)
      if (!load) continue
      load.totalHours += share
      load.activeTasks += 1
      if (t.due_date && t.due_date < todayStr) load.overdue += 1

      const row = load.byProject.find(x => x.projectId === t.project_id)
      if (row) { row.hours += share; row.tasks += 1 }
      else load.byProject.push({
        projectId: t.project_id,
        projectName: p?.name ?? 'Senza progetto',
        hours: share, tasks: 1,
      })
    }
  }

  const all = Array.from(byRes.values())
  for (const load of all) {
    load.totalHours = Math.round(load.totalHours * 10) / 10
    load.byProject.forEach(r => { r.hours = Math.round(r.hours * 10) / 10 })
    load.byProject.sort((a, b) => b.hours - a.hours)
  }

  return all.sort((a, b) => b.totalHours - a.totalHours)
}

export interface ProjectLoad {
  project: WLProject
  start: string | null       // prima scadenza task
  end: string | null         // ultima scadenza task
  totalHours: number
  taskCount: number
  doneCount: number
  overdue: number
  progress: number           // 0..100 su task
}

/** Aggregato per progetto: finestra temporale, effort, avanzamento. */
export function computeProjectLoads(
  tasks: WLTask[],
  projects: WLProject[],
  today = new Date(),
): ProjectLoad[] {
  const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().slice(0, 10)
  const byProj = new Map<string, WLTask[]>()
  for (const t of tasks) {
    if (t.is_milestone) continue
    if (!byProj.has(t.project_id)) byProj.set(t.project_id, [])
    byProj.get(t.project_id)!.push(t)
  }

  const out: ProjectLoad[] = []
  for (const p of projects) {
    const ts = byProj.get(p.id) ?? []
    const dates = ts.map(t => t.due_date).filter(Boolean).sort() as string[]
    const done = ts.filter(t => t.status === 'completato').length
    out.push({
      project: p,
      start: dates[0] ?? null,
      end: dates[dates.length - 1] ?? null,
      totalHours: Math.round(ts.filter(isActive).reduce((s, t) => s + effortOf(t), 0) * 10) / 10,
      taskCount: ts.length,
      doneCount: done,
      overdue: ts.filter(t => isActive(t) && t.due_date && t.due_date < todayStr).length,
      progress: ts.length > 0 ? Math.round((done / ts.length) * 100) : 0,
    })
  }
  // I progetti con task attive in cima, poi per effort.
  return out.sort((a, b) => (b.taskCount - b.doneCount) - (a.taskCount - a.doneCount) || b.totalHours - a.totalHours)
}
