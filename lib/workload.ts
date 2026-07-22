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
  /** NULL per le task ad hoc di cliente: occupano una risorsa senza avere un progetto. */
  project_id: string | null
  client_id?: string | null
  client_name?: string | null
  scope_type?: 'project' | 'client' | 'personal'
  work_type?: 'project' | 'startup' | 'routine' | 'initiative' | 'adhoc'
  is_milestone?: boolean
  milestone_id?: string | null
}

export interface WLProject {
  id: string
  name: string
  status: string
  /** @deprecated Usa `service_line` (migration 115). */
  project_kind: string | null
  service_line?: string | null
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

export interface WLSprint {
  id: string
  project_id: string
  name: string
  start_date: string
  end_date: string
  status: string
}

export interface WLFilters {
  /** Linea di servizio: 'growth' | 'digital' | 'marketing' | 'ai' | … */
  kind: string | null
  /** Tipo di lavoro: 'routine' | 'initiative' | 'adhoc' | 'startup' | 'project' */
  workType: string | null
  clientId: string | null
  resourceId: string | null
  from: string | null        // ISO date, inclusivo
  to: string | null          // ISO date, inclusivo
}

export const EMPTY_FILTERS: WLFilters = {
  kind: null, workType: null, clientId: null, resourceId: null, from: null, to: null,
}

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
    // Le ad hoc di cliente non hanno progetto ma sono lavoro reale: si filtrano
    // sui campi della task, non su quelli del progetto.
    const p = t.project_id ? projectById.get(t.project_id) : undefined
    const isAdHoc = !t.project_id && t.scope_type === 'client'
    if (!p && !isAdHoc) return false

    const line = p ? (p.service_line ?? p.project_kind) : null
    if (filters.kind && line !== filters.kind) return false
    if (filters.workType && (t.work_type ?? 'project') !== filters.workType) return false

    const clientId = p ? p.client_id : t.client_id
    if (filters.clientId && clientId !== filters.clientId) return false
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
  const todayStr = isoLocal(today)
  const byRes = new Map<string, ResourceLoad>()
  for (const r of resources) {
    byRes.set(r.id, { resource: r, totalHours: 0, activeTasks: 0, overdue: 0, byProject: [] })
  }

  for (const t of tasks) {
    if (!isActive(t)) continue
    const assignees = multiAssignees?.get(t.id) ?? (t.assignee_id ? [t.assignee_id] : [])
    if (assignees.length === 0) continue
    const share = effortOf(t) / assignees.length
    const p = t.project_id ? projectById.get(t.project_id) : undefined
    // Le ad hoc si raggruppano per CLIENTE: non hanno progetto, ma finire tutte
    // in un unico "Senza progetto" renderebbe la riga inutile appena ce n'è più d'una.
    const bucketId = t.project_id ?? (t.client_id ? `client:${t.client_id}` : 'personal')
    const bucketName = p?.name
      ?? (t.client_id ? `${t.client_name ?? 'Cliente'} — ad hoc` : 'Attività personali')

    for (const rid of assignees) {
      const load = byRes.get(rid)
      if (!load) continue
      load.totalHours += share
      load.activeTasks += 1
      if (t.due_date && t.due_date < todayStr) load.overdue += 1

      const row = load.byProject.find(x => x.projectId === bucketId)
      if (row) { row.hours += share; row.tasks += 1 }
      else load.byProject.push({
        projectId: bucketId,
        projectName: bucketName,
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
  const todayStr = isoLocal(today)
  const byProj = new Map<string, WLTask[]>()
  for (const t of tasks) {
    if (t.is_milestone) continue
    // Le ad hoc non hanno progetto: restano fuori dagli aggregati di progetto
    // (compaiono nel carico risorsa e nei bucket di effort, dove pesano davvero).
    if (!t.project_id) continue
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
export type Grain = 'settimana' | 'mese' | 'trimestre' | 'anno'

export interface EffortBucket {
  start: string          // inizio periodo (ISO date)
  end: string            // fine periodo (ISO date)
  days: number           // durata del periodo in giorni (la capacità si scala su questa)
  hours: number          // effort totale che cade nel periodo
  taskCount: number
  byProject: { projectId: string; projectName: string; hours: number }[]
}

/**
 * Data locale in ISO (YYYY-MM-DD). NON usare toISOString(): converte in UTC e in
 * Europe/Rome fa slittare la data al giorno prima → confini dei periodi sballati.
 */
export function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const mondayISO = (d: Date) => {
  const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0)
  return isoLocal(x)
}
const addDaysISO = (iso: string, n: number) =>
  isoLocal(new Date(new Date(iso + 'T00:00:00').getTime() + n * 86400000))

/** Intervallo effettivo di una task: start_date→due_date (se manca start, è puntuale sulla scadenza). */
export function taskSpan(t: WLTask): { start: string; end: string } | null {
  if (!t.due_date) return null
  const start = t.start_date && t.start_date <= t.due_date ? t.start_date : t.due_date
  return { start, end: t.due_date }
}

/** Confini del periodo che contiene `d`, secondo la granularità scelta. */
function bucketBounds(d: Date, grain: Grain): { start: string; end: string } {
  const y = d.getFullYear(), m = d.getMonth()
  if (grain === 'settimana') {
    const s = mondayISO(d)
    return { start: s, end: addDaysISO(s, 6) }
  }
  if (grain === 'mese') {
    return {
      start: isoLocal(new Date(y, m, 1)),
      end: isoLocal(new Date(y, m + 1, 0)),
    }
  }
  if (grain === 'trimestre') {
    const q = Math.floor(m / 3)
    return {
      start: isoLocal(new Date(y, q * 3, 1)),
      end: isoLocal(new Date(y, q * 3 + 3, 0)),
    }
  }
  return {
    start: isoLocal(new Date(y, 0, 1)),
    end: isoLocal(new Date(y, 11, 31)),
  }
}
const nextBucket = (endISO: string) => new Date(new Date(endISO + 'T00:00:00').getTime() + 86400000)

/**
 * Effort spalmato sull'intervallo di ogni task, aggregato per periodo (settimana,
 * mese, trimestre o anno). Base della previsione cross-progetto: dove le lavorazioni
 * di progetti diversi si accavallano, le ore si sommano nello stesso periodo.
 */
/** Quanti periodi mostrare per granularità: orizzonte leggibile, non infinito. */
export const GRAIN_HORIZON: Record<Grain, number> = {
  settimana: 12,   // ~3 mesi
  mese: 12,        // 1 anno
  trimestre: 8,    // 2 anni
  anno: 5,
}

/**
 * Previsione: parte dal periodo CORRENTE (non dal passato) e copre un orizzonte
 * leggibile. Il passato non si pianifica: mostrarlo diluiva la barra e la rendeva
 * illeggibile.
 */
export function computeEffortBuckets(
  tasks: WLTask[],
  projectById: Map<string, WLProject>,
  grain: Grain = 'settimana',
  today = new Date(),
  maxBuckets = GRAIN_HORIZON[grain],
): EffortBucket[] {
  const spans = tasks.filter(isActive).map(t => {
    const s = taskSpan(t)
    if (!s) return null
    return { t, ...s, days: daysInclusive(s.start, s.end) }
  }).filter(Boolean) as { t: WLTask; start: string; end: string; days: number }[]
  if (spans.length === 0) return []

  // Orizzonte fisso: sempre `maxBuckets` periodi dal corrente. Anche i periodi
  // scarichi sono informativi (mostrano dove c'è spazio per pianificare).
  const out: EffortBucket[] = []
  let cur = bucketBounds(today, grain)     // dal periodo corrente in avanti
  while (out.length < maxBuckets) {
    const b: EffortBucket = {
      start: cur.start, end: cur.end, days: daysInclusive(cur.start, cur.end),
      hours: 0, taskCount: 0, byProject: [],
    }
    for (const s of spans) {
      const ov = overlapDays(s.start, s.end, b.start, b.end)
      if (ov <= 0) continue
      const h = (effortOf(s.t) / s.days) * ov
      b.hours += h
      b.taskCount += 1
      const bid = s.t.project_id ?? (s.t.client_id ? `client:${s.t.client_id}` : 'personal')
      const pname = s.t.project_id
        ? (projectById.get(s.t.project_id)?.name ?? '—')
        : (s.t.client_id ? `${s.t.client_name ?? 'Cliente'} — ad hoc` : 'Attività personali')
      const row = b.byProject.find(x => x.projectId === bid)
      if (row) row.hours += h
      else b.byProject.push({ projectId: bid, projectName: pname, hours: h })
    }
    b.hours = Math.round(b.hours * 10) / 10
    b.byProject.forEach(r => { r.hours = Math.round(r.hours * 10) / 10 })
    b.byProject.sort((a, b2) => b2.hours - a.hours)
    out.push(b)
    cur = bucketBounds(nextBucket(cur.end), grain)
  }
  return out
}

/** Capacità del team nel periodo (la settimanale scalata sui giorni del bucket). */
export function bucketCapacity(weeklyCapacity: number, days: number): number {
  return (weeklyCapacity * days) / 7
}

export interface EffortPeak {
  bucket: EffortBucket
  ratio: number            // hours / capacità team nella settimana
  projects: number         // quanti progetti concorrono (accavallamento)
}

export interface SprintLane {
  sprint: WLSprint
  projectName: string
  clientId: string
}
export interface SprintDensity {
  weekStart: string
  count: number            // sprint attivi nel periodo (distinti) — informativo
  avg: number              // MEDIA di sprint contemporanei per giorno → confrontabile col limite
  peak: number             // PICCO di sprint contemporanei in un giorno del periodo
  names: string[]
}

/**
 * Densità di sprint calcolata GIORNO per GIORNO e poi aggregata sul periodo.
 *
 * Il limite (MAX_PARALLEL_SPRINTS) è per definizione "contemporanei". Contare gli
 * sprint distinti che toccano un mese e dividerli per il limite sovrastimerebbe:
 * 8 sprint sparsi nel mese, mai più di 2 insieme, NON sono un mese al limite.
 * Perciò: `avg` = media dei contemporanei per giorno (calibra automaticamente
 * settimana/mese/trimestre/anno), `peak` = il momento peggiore del periodo.
 */
export function computeSprintDensity(
  sprints: WLSprint[],
  buckets: EffortBucket[],
  projectById: Map<string, WLProject>,
): { lanes: SprintLane[]; density: SprintDensity[] } {
  const active = sprints.filter(s => s.status !== 'completato' && s.start_date && s.end_date)
  const lanes: SprintLane[] = active
    .map(s => ({ sprint: s, projectName: projectById.get(s.project_id)?.name ?? '—', clientId: projectById.get(s.project_id)?.client_id ?? '' }))
    .sort((a, b) => a.sprint.start_date.localeCompare(b.sprint.start_date))

  const density: SprintDensity[] = buckets.map(b => {
    const hits = active.filter(s => s.start_date <= b.end && s.end_date >= b.start)
    let sum = 0, peak = 0
    for (let i = 0; i < b.days; i++) {
      const day = addDaysISO(b.start, i)
      const n = hits.filter(s => s.start_date <= day && s.end_date >= day).length
      sum += n
      if (n > peak) peak = n
    }
    const avg = b.days > 0 ? sum / b.days : 0
    return {
      weekStart: b.start,
      count: hits.length,
      avg: Math.round(avg * 10) / 10,
      peak,
      names: hits.map(s => s.name),
    }
  })
  return { lanes, density }
}

/**
 * Limite operativo attuale: oltre 5 sprint CONTEMPORANEI il team non regge (dato dal
 * numero di risorse). È una soglia di simultaneità, non un totale per periodo: vale
 * identica a ogni granularità, perché la si confronta sempre con la media/picco dei
 * contemporanei (vedi computeSprintDensity).
 */
export const MAX_PARALLEL_SPRINTS = 5

export type Severity = 'ok' | 'warn' | 'high' | 'critical'

/**
 * Intensità di un periodo: 0 = scarico, 1 = al limite. Prende il peggiore fra
 * (sprint contemporanei medi / limite) e (ore pianificate / capacità del periodo).
 * Entrambi i termini sono già calibrati sulla durata del periodo.
 */
export function periodIntensity(avgParallelSprints: number, effortRatio: number): number {
  return Math.max(avgParallelSprints / MAX_PARALLEL_SPRINTS, effortRatio)
}

export function severityOf(intensity: number): Severity {
  if (intensity >= 1) return 'critical'   // 5 sprint in parallelo, o oltre capacità
  if (intensity >= 0.75) return 'high'
  if (intensity >= 0.5) return 'warn'
  return 'ok'
}

/** Severità di un periodo: combina sprint concorrenti ed effort sulla capacità. */
export function periodSeverity(sprintCount: number, effortRatio: number): Severity {
  return severityOf(periodIntensity(sprintCount, effortRatio))
}

/** Capacità settimanale del team (somma delle capacità delle risorse). */
export function teamWeeklyCapacity(resources: WLResource[]): number {
  return resources.reduce((s, r) => s + capacityOf(r), 0)
}

/**
 * Periodi di picco: settimane in cui l'effort combinato supera la soglia della
 * capacità del team. `projects > 1` = task di progetti diversi si accavallano.
 */
export function detectPeaks(buckets: EffortBucket[], weeklyCapacity: number, threshold = 0.85): EffortPeak[] {
  if (weeklyCapacity <= 0) return []
  return buckets
    .map(b => ({ bucket: b, ratio: b.hours / bucketCapacity(weeklyCapacity, b.days), projects: b.byProject.length }))
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

const dayStr = (d: Date) => isoLocal(d)
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
