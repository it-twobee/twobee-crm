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
  start_date?: string | null
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
  weekly_capacity_hours?: number | null
}

export interface WLFilters {
  kind: string | null        // 'growth' | 'digital' | null
  clientId: string | null
  resourceId: string | null
  from: string | null        // ISO date, inclusivo
  to: string | null          // ISO date, inclusivo
}

export const EMPTY_FILTERS: WLFilters = { kind: null, clientId: null, resourceId: null, from: null, to: null }

const isActive = (t: WLTask) => t.status !== 'completato' && t.status !== 'richiesta_supporto' && !t.is_milestone
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

// ─── Effort spalmato nel tempo: Gantt di progetto + previsione cross-progetto ────
export interface EffortBucket {
  start: string          // lunedì (ISO date)
  end: string            // domenica (ISO date)
  hours: number          // effort totale che cade in questa settimana
  taskCount: number
  byProject: { projectId: string; projectName: string; hours: number }[]
}

const mondayISO = (d: Date) => {
  const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0)
  return x.toISOString().slice(0, 10)
}
const addDaysISO = (iso: string, n: number) =>
  new Date(new Date(iso + 'T00:00:00').getTime() + n * 86400000).toISOString().slice(0, 10)

/** Intervallo effettivo di una task: start_date→due_date (se manca start, è puntuale sulla scadenza). */
export function taskSpan(t: WLTask): { start: string; end: string } | null {
  if (!t.due_date) return null
  const start = t.start_date && t.start_date <= t.due_date ? t.start_date : t.due_date
  return { start, end: t.due_date }
}

/**
 * Effort settimanale spalmato sull'intervallo di ogni task. Usato sia per il Gantt
 * del singolo progetto (aree ad alto effort) sia per la previsione cross-progetto
 * (accavallamenti fra progetti diversi nello stesso periodo).
 */
export function computeEffortBuckets(
  tasks: WLTask[],
  projectById: Map<string, WLProject>,
  today = new Date(),
  maxWeeks = 26,
): EffortBucket[] {
  const spans = tasks.filter(isActive).map(t => {
    const s = taskSpan(t)
    if (!s) return null
    return { t, ...s, days: daysInclusive(s.start, s.end) }
  }).filter(Boolean) as { t: WLTask; start: string; end: string; days: number }[]
  if (spans.length === 0) return []

  const first = mondayISO(new Date(Math.min(...spans.map(s => new Date(s.start + 'T00:00:00').getTime()), today.getTime())))
  const lastEnd = spans.map(s => s.end).sort().slice(-1)[0]

  const out: EffortBucket[] = []
  let wk = first
  while (wk <= lastEnd && out.length < maxWeeks) {
    const wkEnd = addDaysISO(wk, 6)
    const b: EffortBucket = { start: wk, end: wkEnd, hours: 0, taskCount: 0, byProject: [] }
    for (const s of spans) {
      const ov = overlapDays(s.start, s.end, wk, wkEnd)
      if (ov <= 0) continue
      const h = (effortOf(s.t) / s.days) * ov
      b.hours += h
      b.taskCount += 1
      const pname = projectById.get(s.t.project_id)?.name ?? '—'
      const row = b.byProject.find(x => x.projectId === s.t.project_id)
      if (row) row.hours += h
      else b.byProject.push({ projectId: s.t.project_id, projectName: pname, hours: h })
    }
    b.hours = Math.round(b.hours * 10) / 10
    b.byProject.forEach(r => { r.hours = Math.round(r.hours * 10) / 10 })
    b.byProject.sort((a, b2) => b2.hours - a.hours)
    out.push(b)
    wk = addDaysISO(wk, 7)
  }
  return out
}

export interface EffortPeak {
  bucket: EffortBucket
  ratio: number            // hours / capacità team nella settimana
  projects: number         // quanti progetti concorrono (accavallamento)
}

/** Capacità settimanale del team (somma delle capacità delle risorse). */
export function teamWeeklyCapacity(resources: WLResource[]): number {
  return resources.reduce((s, r) => s + capacityOf(r), 0)
}

/**
 * Periodi di picco: settimane in cui l'effort combinato supera la soglia della
 * capacità del team. `projects > 1` = task di progetti diversi si accavallano.
 */
export function detectPeaks(buckets: EffortBucket[], capacity: number, threshold = 0.85): EffortPeak[] {
  if (capacity <= 0) return []
  return buckets
    .map(b => ({ bucket: b, ratio: b.hours / capacity, projects: b.byProject.length }))
    .filter(p => p.ratio >= threshold)
    .sort((a, b) => b.ratio - a.ratio)
}

// ─── Hover condiviso (§9.2 / §15.2): stesso tooltip in Workload timeline e Gantt ──
const STATUS_IT: Record<string, string> = {
  da_fare: 'Da fare', in_corso: 'In corso', in_revisione: 'In revisione',
  completato: 'Completato', richiesta_supporto: 'Richiesta supporto',
}
const fmtIt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })

/** Testo hover multilinea per una task (data, intervallo, progetto, owner, effort, stato). */
export function taskHoverText(
  t: WLTask,
  projectName: string | null,
  ownerNames: string[],
): string {
  const lines = [t.title]
  if (projectName) lines.push(`Progetto: ${projectName}`)
  if (t.start_date && t.due_date && t.start_date !== t.due_date) lines.push(`Periodo: ${fmtIt(t.start_date)} → ${fmtIt(t.due_date)}`)
  else if (t.due_date) lines.push(`Scadenza: ${fmtIt(t.due_date)}`)
  if (ownerNames.length) lines.push(`Owner: ${ownerNames.join(', ')}`)
  lines.push(`Effort: ${t.estimated_hours != null ? `${t.estimated_hours}h` : `${DEFAULT_TASK_HOURS}h (stima mancante)`}`)
  lines.push(`Stato: ${STATUS_IT[t.status] ?? t.status}`)
  return lines.join('\n')
}

// ─── Intensità lavorativa futura (§9.3) ─────────────────────────────────────────
export const INTENSITY_WINDOWS = [7, 14, 30, 60, 90]

export interface IntensityCell {
  resourceId: string
  resourceName: string
  hours: number
  capacity: number
  ratio: number             // hours / capacity (>1 = sovraccarico)
}
export interface IntensityWindow {
  days: number
  cells: IntensityCell[]    // solo risorse con carico > 0, per ratio desc
  overloaded: number        // quante risorse con ratio > 1
}

const dayStr = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10)
const daysInclusive = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1)
function overlapDays(s1: string, e1: string, s2: string, e2: string): number {
  const start = s1 > s2 ? s1 : s2
  const end = e1 < e2 ? e1 : e2
  return start > end ? 0 : daysInclusive(start, end)
}
const capacityOf = (r: WLResource) => (r.weekly_capacity_hours && r.weekly_capacity_hours > 0 ? r.weekly_capacity_hours : 40)

/**
 * Intensità futura per risorsa nelle finestre 7/14/30/60/90 giorni. L'effort di
 * ogni task attiva è **spalmato** sull'intervallo start_date→due_date (D6): la
 * quota che cade nella finestra conta. La capacità è `weekly_capacity_hours` per la
 * durata della finestra (D5). `estimateCoverage` = % di ore coperte da stime reali
 * (il resto è il default 4h: la previsione è meno affidabile — vedi §9.3 warning).
 */
export function computeIntensity(
  tasks: WLTask[],
  resources: WLResource[],
  multiAssignees?: Map<string, string[]>,
  today = new Date(),
): { windows: IntensityWindow[]; estimateCoverage: number } {
  const todayStr = dayStr(today)
  const nameOf = new Map(resources.map(r => [r.id, r.full_name]))

  let estHours = 0, totalHours = 0
  const spread = tasks.filter(t => isActive(t) && t.due_date).map(t => {
    const due = t.due_date!
    const start = t.start_date && t.start_date <= due ? t.start_date : due
    const eff = effortOf(t)
    totalHours += eff
    if (t.estimated_hours != null) estHours += eff
    const assignees = multiAssignees?.get(t.id) ?? (t.assignee_id ? [t.assignee_id] : [])
    return { start, due, perDay: eff / daysInclusive(start, due), assignees }
  })

  const windows: IntensityWindow[] = INTENSITY_WINDOWS.map(days => {
    const winEnd = dayStr(new Date(today.getTime() + (days - 1) * 86400000))
    const cells: IntensityCell[] = resources.map(r => {
      let hours = 0
      for (const s of spread) {
        if (!s.assignees.includes(r.id)) continue
        const from = s.start < todayStr ? todayStr : s.start
        const ov = overlapDays(from, s.due, todayStr, winEnd)
        if (ov > 0) hours += (s.perDay * ov) / s.assignees.length
      }
      const capacity = Math.round(capacityOf(r) * days / 7)
      return { resourceId: r.id, resourceName: nameOf.get(r.id) ?? '—', hours: Math.round(hours * 10) / 10, capacity, ratio: capacity > 0 ? hours / capacity : 0 }
    }).filter(c => c.hours > 0).sort((a, b) => b.ratio - a.ratio)
    return { days, cells, overloaded: cells.filter(c => c.ratio > 1).length }
  })

  return { windows, estimateCoverage: totalHours > 0 ? Math.round((estHours / totalHours) * 100) : 100 }
}

export interface WorkloadSignals {
  noEstimate: number
  noDue: number
  noOwner: number
  projectsNoPm: number
}

/** Segnali di qualità/rischio operativo sul set filtrato (§9.3). */
export function workloadSignals(
  tasks: WLTask[],
  projects: WLProject[],
  multiAssignees?: Map<string, string[]>,
): WorkloadSignals {
  const active = tasks.filter(isActive)
  return {
    noEstimate: active.filter(t => t.estimated_hours == null).length,
    noDue: active.filter(t => !t.due_date).length,
    noOwner: active.filter(t => {
      const a = multiAssignees?.get(t.id) ?? (t.assignee_id ? [t.assignee_id] : [])
      return a.length === 0
    }).length,
    projectsNoPm: projects.filter(p => !p.manager_id).length,
  }
}
