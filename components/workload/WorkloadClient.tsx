'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Gauge, Users, FolderKanban, Filter, X, ChevronDown, ChevronRight,
  AlertTriangle, Loader2, Crown, UserCog, CalendarRange, Sparkles,
  ExternalLink, Flag, Plus, Pencil, Check,
} from 'lucide-react'
import {
  filterTasks, computeResourceLoads, computeProjectLoads, computeIntensity, workloadSignals,
  computeEffortBuckets, teamWeeklyCapacity, computeSprintDensity, periodSeverity, periodIntensity,
  MAX_PARALLEL_SPRINTS, bucketCapacity, EMPTY_FILTERS,
  type WLTask, type WLProject, type WLResource, type WLSprint, type WLFilters, type IntensityWindow,
  type EffortBucket, type Grain,
} from '@/lib/workload'
import { pmUpdateTask } from '@/app/actions/workload-tasks'
import { createMyTask } from '@/app/actions/workspace-create'
import { renameSprint, renameMilestone } from '@/app/actions/workload-sprints'
import { usePortalRoutes } from '@/lib/portal-routes'

type View = 'progetti' | 'risorse'

const KIND_UI: Record<string, { label: string; cls: string }> = {
  growth:  { label: 'Growth',  cls: 'text-success bg-success-dim' },
  digital: { label: 'Digital', cls: 'text-info bg-info-dim' },
}
const STATUS_LABEL: Record<string, string> = {
  da_fare: 'Da fare', in_corso: 'In corso', in_revisione: 'In revisione', completato: 'Completato',
}

// Carico settimanale di riferimento: oltre questo la barra vira sul rosso.
const WEEKLY_CAPACITY = 40

// Severità di un periodo (sprint accavallati + effort): verde stabile → rosso critico.
const SEV_BAR: Record<string, string> = {
  ok: 'bg-success/70',
  warn: 'bg-warning/80',
  high: 'bg-orange',
  critical: 'bg-error',
}

const dISO = (iso: string) => new Date(iso + 'T00:00:00')
const fmtRange = (a: string, b: string) =>
  `${dISO(a).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} – ${dISO(b).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })}`

/** Etichetta dell'asse temporale in base alla granularità scelta. */
function axisLabel(iso: string, grain: Grain): string {
  const d = dISO(iso)
  if (grain === 'settimana') return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  if (grain === 'mese') return d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })
  if (grain === 'trimestre') return `T${Math.floor(d.getMonth() / 3) + 1} '${String(d.getFullYear()).slice(2)}`
  return String(d.getFullYear())
}

function periodWindow(key: string): { from: string | null; to: string | null } {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (key === 'settimana') {
    const s = new Date(now); s.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    const e = new Date(s); e.setDate(s.getDate() + 6)
    return { from: iso(s), to: iso(e) }
  }
  if (key === 'mese') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  if (key === 'trimestre') {
    const q = Math.floor(now.getMonth() / 3)
    return { from: iso(new Date(now.getFullYear(), q * 3, 1)), to: iso(new Date(now.getFullYear(), q * 3 + 3, 0)) }
  }
  return { from: null, to: null }
}

export function WorkloadClient({
  projects, tasks, sprints = [], resources, clients, multiAssignees, canEditAll, managedProjectIds, title, subtitle,
}: {
  projects: WLProject[]
  tasks: WLTask[]
  sprints?: WLSprint[]
  resources: WLResource[]
  clients: { id: string; name: string }[]
  multiAssignees: Record<string, string[]>
  canEditAll: boolean
  managedProjectIds: string[]
  title: string
  subtitle: string
}) {
  const [view, setView] = useState<View>('progetti')
  const [period, setPeriod] = useState('all')
  const [kind, setKind] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [resourceId, setResourceId] = useState<string | null>(null)

  const multiMap = useMemo(() => new Map(Object.entries(multiAssignees)), [multiAssignees])
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])
  const managedSet = useMemo(() => new Set(managedProjectIds), [managedProjectIds])
  const canEditProject = (pid: string) => canEditAll || managedSet.has(pid)

  const filters: WLFilters = useMemo(() => {
    const win = periodWindow(period)
    return { ...EMPTY_FILTERS, kind, clientId, resourceId, from: win.from, to: win.to }
  }, [period, kind, clientId, resourceId])

  const filtered = useMemo(
    () => filterTasks(tasks, projectById, filters, multiMap),
    [tasks, projectById, filters, multiMap],
  )

  const resourceLoads = useMemo(
    () => computeResourceLoads(filtered, projectById, resources, multiMap).filter(l => l.activeTasks > 0),
    [filtered, projectById, resources, multiMap],
  )

  const visibleProjects = useMemo(() => {
    // I progetti che, dopo i filtri, hanno almeno una task.
    const ids = new Set(filtered.map(t => t.project_id))
    return projects.filter(p => ids.has(p.id))
  }, [filtered, projects])

  const projectLoads = useMemo(
    () => computeProjectLoads(filtered, visibleProjects),
    [filtered, visibleProjects],
  )

  const intensity = useMemo(() => computeIntensity(filtered, resources, multiMap), [filtered, resources, multiMap])
  const signals = useMemo(() => workloadSignals(filtered, visibleProjects, multiMap), [filtered, visibleProjects, multiMap])

  // Previsione cross-progetto: effort combinato per periodo (granularità selezionabile).
  const [grain, setGrain] = useState<Grain>('settimana')
  const effortBuckets = useMemo(() => computeEffortBuckets(filtered, projectById, grain), [filtered, projectById, grain])
  const capacity = useMemo(() => teamWeeklyCapacity(resources), [resources])

  const aiNeeds = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const resName = new Map(resources.map(r => [r.id, r.full_name]))
    const out: { title: string; project: string; due_date: string | null; estimated_hours: number | null; owner: string | null; issue: string }[] = []
    for (const t of filtered) {
      if (t.is_milestone || t.status === 'completato' || t.status === 'richiesta_supporto') continue
      const owners = multiMap.get(t.id) ?? (t.assignee_id ? [t.assignee_id] : [])
      const issues: string[] = []
      if (owners.length === 0) issues.push('senza owner')
      if (t.estimated_hours == null) issues.push('senza stima')
      if (!t.due_date) issues.push('senza scadenza')
      if (t.due_date && t.due_date < todayStr) issues.push('scaduta')
      if (issues.length) out.push({
        title: t.title, project: projectById.get(t.project_id)?.name ?? '—',
        due_date: t.due_date, estimated_hours: t.estimated_hours,
        owner: owners[0] ? (resName.get(owners[0]) ?? null) : null, issue: issues.join(', '),
      })
    }
    return out
  }, [filtered, multiMap, projectById, resources])

  const anyFilter = kind || clientId || resourceId || period !== 'all'
  const reset = () => { setKind(null); setClientId(null); setResourceId(null); setPeriod('all') }

  // Totali di sintesi
  const totals = useMemo(() => {
    const activeTasks = filtered.filter(t => t.status !== 'completato' && !t.is_milestone)
    const hours = resourceLoads.reduce((s, l) => s + l.totalHours, 0)
    const overloaded = resourceLoads.filter(l => l.totalHours > WEEKLY_CAPACITY).length
    return { projects: visibleProjects.length, tasks: activeTasks.length, hours: Math.round(hours), overloaded }
  }, [filtered, resourceLoads, visibleProjects])

  return (
    <div className="p-6 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Gauge className="w-5 h-5 text-gold-text" aria-hidden="true" />
            {title}
          </h1>
          <p className="text-text-tertiary text-sm mt-0.5">{subtitle}</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-surface border border-border p-1" role="tablist" aria-label="Vista">
          {([['progetti', 'Progetti', FolderKanban], ['risorse', 'Risorse', Users]] as const).map(([k, lbl, Icon]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                view === k ? 'bg-gold-dim text-gold-text' : 'text-text-tertiary hover:text-text-primary'
              }`}>
              <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {lbl}
            </button>
          ))}
        </div>
      </header>

      {/* Sintesi */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Progetti in corso" value={totals.projects} />
        <Stat label="Task attive" value={totals.tasks} />
        <Stat label="Ore stimate" value={`${totals.hours}h`} />
        <Stat label="Risorse sovraccariche" value={totals.overloaded}
          tone={totals.overloaded > 0 ? 'warn' : undefined} />
      </div>

      {/* Previsione cross-progetto: dove le task di progetti diversi si accavallano */}
      <EffortForecast buckets={effortBuckets} capacity={capacity}
        windows={intensity.windows} signals={signals} needsAttention={aiNeeds}
        tasks={filtered} projectById={projectById} resourceById={new Map(resources.map(r => [r.id, r]))}
        multiMap={multiMap} canEditProject={canEditProject} sprints={sprints}
        grain={grain} setGrain={setGrain} />

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5">
        <Filter className="w-4 h-4 text-text-tertiary shrink-0 ml-1" aria-hidden="true" />
        <Select value={kind ?? ''} onChange={v => setKind(v || null)} aria-label="Tipo progetto"
          options={[['', 'Tutti i tipi'], ['growth', 'Growth'], ['digital', 'Digital']]} />
        <Select value={clientId ?? ''} onChange={v => setClientId(v || null)} aria-label="Cliente"
          options={[['', 'Tutti i clienti'], ...clients.map(c => [c.id, c.name] as [string, string])]} />
        <Select value={resourceId ?? ''} onChange={v => setResourceId(v || null)} aria-label="Risorsa"
          options={[['', 'Tutte le risorse'], ...resources.map(r => [r.id, r.full_name] as [string, string])]} />
        <Select value={period} onChange={setPeriod} aria-label="Periodo"
          options={[['all', 'Sempre'], ['settimana', 'Questa settimana'], ['mese', 'Questo mese'], ['trimestre', 'Questo trimestre']]} />
        {anyFilter && (
          <button onClick={reset} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-2xs text-text-tertiary hover:text-text-primary transition-colors">
            <X className="w-3 h-3" aria-hidden="true" /> Azzera
          </button>
        )}
      </div>

      {view === 'progetti' && (
        <ProjectsView
          loads={projectLoads}
          tasksByProject={filtered}
          sprints={sprints}
          resources={resources}
          multiMap={multiMap}
          canEditProject={canEditProject}
          resourceById={new Map(resources.map(r => [r.id, r]))}
        />
      )}
      {view === 'risorse' && (
        <ResourcesView
          loads={resourceLoads}
          tasks={filtered}
          projectById={projectById}
          multiMap={multiMap}
        />
      )}
    </div>
  )
}

/* ── AI Planning Assistant (§9.4): propone, non applica ──────────────────────── */
type AISuggestion = { type: string; title: string; detail: string }
/* ── Previsione effort: barra continua + drill-down + AI ──────────────────────── */
function EffortForecast({ buckets, capacity, windows, signals, needsAttention, tasks, projectById, resourceById, multiMap, canEditProject, sprints, grain, setGrain }: {
  buckets: EffortBucket[]
  sprints: WLSprint[]
  grain: Grain
  setGrain: (g: Grain) => void
  capacity: number
  windows: IntensityWindow[]
  signals: { noEstimate: number; noDue: number; noOwner: number; projectsNoPm: number }
  needsAttention: { title: string; project: string; due_date: string | null; estimated_hours: number | null; owner: string | null; issue: string }[]
  tasks: WLTask[]
  projectById: Map<string, WLProject>
  resourceById: Map<string, WLResource>
  multiMap: Map<string, string[]>
  canEditProject: (pid: string) => boolean
}) {
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[] | null>(null)
  const [aiSummary, setAiSummary] = useState('')
  const [openWeek, setOpenWeek] = useState<string | null>(null)
  const [pending, startT] = useTransition()
  const [newTaskFor, setNewTaskFor] = useState<AISuggestion | null>(null)

  const { density } = useMemo(
    () => computeSprintDensity(sprints, buckets, projectById),
    [sprints, buckets, projectById],
  )
  const densityByWeek = useMemo(() => new Map(density.map(d => [d.weekStart, d])), [density])

  // Un'unica fonte di verità per lo stato di ogni periodo: usata da barra, elenco e alert.
  const periods = useMemo(() => buckets.map(b => {
    const nSprint = densityByWeek.get(b.start)?.count ?? 0
    const cap = bucketCapacity(capacity, b.days)
    const ratio = cap > 0 ? b.hours / cap : 0
    const intensity = periodIntensity(nSprint, ratio)   // 0 = scarico, 1 = al limite
    return { bucket: b, nSprint, cap, ratio, intensity, sev: periodSeverity(nSprint, ratio) }
  }), [buckets, densityByWeek, capacity])

  const hot = useMemo(() => periods.filter(p => p.sev === 'high' || p.sev === 'critical'), [periods])
  const selected = periods.find(p => p.bucket.start === openWeek) ?? null

  const weekTasks = useMemo(() => {
    if (!selected) return []
    const b = selected.bucket
    return tasks.filter(t => {
      if (t.is_milestone || t.status === 'completato' || !t.due_date) return false
      const s = t.start_date && t.start_date <= t.due_date ? t.start_date : t.due_date
      return s <= b.end && t.due_date >= b.start
    }).sort((x, y) => (x.due_date ?? '').localeCompare(y.due_date ?? ''))
  }, [selected, tasks])

  const shift = (t: WLTask, days: number) => startT(async () => {
    if (!t.due_date) return
    const nd = new Date(new Date(t.due_date + 'T00:00:00').getTime() + days * 86400000).toISOString().slice(0, 10)
    const res = await pmUpdateTask(t.project_id, t.id, { due_date: nd })
    if ('error' in res) toast.error(res.error)
    else toast.success(`"${t.title}" spostata al ${new Date(nd + 'T00:00:00').toLocaleDateString('it-IT')}`)
  })

  const askAI = async () => {
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/workload-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          windows: windows.map(w => ({ days: w.days, overloaded: w.overloaded, top: w.cells.slice(0, 4).map(c => ({ name: c.resourceName, hours: c.hours, capacity: c.capacity })) })),
          signals,
          needsAttention,
          peaks: hot.slice(0, 6).map(p => ({
            from: p.bucket.start, to: p.bucket.end, hours: p.bucket.hours,
            capacity: Math.round(p.cap), ratio: Math.round(p.ratio * 100),
            projects: p.bucket.byProject.slice(0, 4).map(x => ({ name: x.projectName, hours: x.hours })),
          })),
        }),
      })
      const data = await res.json()
      if (data.error) { toast.error(data.error); return }
      setAiSuggestions(data.suggestions ?? []); setAiSummary(data.summary ?? '')
    } catch { toast.error('Errore analisi AI') } finally { setAiLoading(false) }
  }

  if (buckets.length === 0) return null

  const showLabels = buckets.length <= 12

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap p-4 pb-3">
        <div>
          <p className="text-sm font-bold text-text-primary flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-gold-text" aria-hidden="true" />
            Previsione carico
          </p>
          <p className="text-2xs text-text-tertiary mt-0.5">
            Prossimi {buckets.length} {grain === 'settimana' ? 'settimane' : grain === 'mese' ? 'mesi' : grain === 'trimestre' ? 'trimestri' : 'anni'} · limite sostenibile {MAX_PARALLEL_SPRINTS} sprint in parallelo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-lg bg-background border border-border p-0.5" role="tablist" aria-label="Periodo">
            {(['settimana', 'mese', 'trimestre', 'anno'] as const).map(g => (
              <button key={g} role="tab" aria-selected={grain === g} onClick={() => { setGrain(g); setOpenWeek(null) }}
                className={`px-2.5 py-1 rounded-md text-2xs font-semibold capitalize transition-colors ${
                  grain === g ? 'bg-gold-dim text-gold-text' : 'text-text-tertiary hover:text-text-primary'
                }`}>{g}</button>
            ))}
          </div>
          <button onClick={askAI} disabled={aiLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-on-gold text-xs font-bold rounded-lg hover:bg-gold/90 disabled:opacity-50 shrink-0">
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
            {aiLoading ? 'Analizzo…' : aiSuggestions ? 'Rianalizza' : "Pianifica con l'AI"}
          </button>
        </div>
      </div>

      {/* Verdetto: una riga chiara, coerente con la barra */}
      <div className={`mx-4 mb-3 flex items-start gap-2 rounded-lg px-3 py-2 border ${
        hot.length === 0 ? 'border-success/25 bg-success-dim' : hot.some(p => p.sev === 'critical') ? 'border-error/30 bg-error-dim' : 'border-warning/30 bg-warning-dim'
      }`}>
        {hot.length === 0
          ? <Check className="w-4 h-4 text-success shrink-0 mt-px" aria-hidden="true" />
          : <AlertTriangle className={`w-4 h-4 shrink-0 mt-px ${hot.some(p => p.sev === 'critical') ? 'text-error' : 'text-warning'}`} aria-hidden="true" />}
        <p className="text-2xs text-text-secondary">
          {hot.length === 0 ? (
            <>Periodo tranquillo: nessuna fase supera il limite sostenibile ({MAX_PARALLEL_SPRINTS} sprint in parallelo).</>
          ) : (
            <>
              <span className="font-bold text-text-primary">{hot.length} {hot.length === 1 ? 'fase intensa' : 'fasi intense'}</span>
              {' — la peggiore è '}{fmtRange(hot[0].bucket.start, hot[0].bucket.end)}
              {': '}<span className="font-semibold text-text-primary">{hot[0].nSprint} sprint in parallelo</span>
              {' su ' + MAX_PARALLEL_SPRINTS + ' sostenibili'}
              {' '}({Math.round(hot[0].bucket.hours)}h di lavoro). Clicca quel tratto per riprogrammare.
            </>
          )}
        </p>
      </div>

      {/* ── Barra continua ─────────────────────────────────────────────────────── */}
      <div className="px-4">
        <div className="flex h-10 rounded-lg overflow-hidden border border-border" role="group" aria-label="Carico per periodo">
          {periods.map(p => {
            const sel = openWeek === p.bucket.start
            return (
              <button key={p.bucket.start} onClick={() => setOpenWeek(sel ? null : p.bucket.start)}
                aria-label={`${fmtRange(p.bucket.start, p.bucket.end)}: ${Math.round(p.bucket.hours)} ore, ${p.nSprint} sprint`}
                style={{ flexGrow: p.bucket.days, flexBasis: 0 }}
                className={`relative ${SEV_BAR[p.sev]} border-r border-background/50 last:border-r-0 transition-all hover:brightness-125 ${sel ? 'ring-2 ring-gold ring-inset z-10' : ''}`}
                title={`${fmtRange(p.bucket.start, p.bucket.end)}\n\nIntensità: ${Math.round(p.intensity * 100)}%  (${p.sev === 'ok' ? 'soft' : p.sev === 'warn' ? 'in tensione' : p.sev === 'high' ? 'intenso' : 'al limite'})\nSprint in parallelo: ${p.nSprint} su ${MAX_PARALLEL_SPRINTS} sostenibili\nOre pianificate: ${Math.round(p.bucket.hours)}h su ${Math.round(p.cap)}h\nProgetti: ${p.bucket.byProject.length}\n\nClicca per riprogrammare`}>
                {showLabels && (
                  <span className="absolute inset-0 flex items-center justify-center text-2xs font-bold text-on-gold/90 tabular">
                    {p.nSprint > 0 ? `${p.nSprint}` : ''}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Asse: etichette leggibili, mai sovrapposte */}
        <div className="flex mt-1">
          {periods.map((p, i) => (
            <div key={p.bucket.start} style={{ flexGrow: p.bucket.days, flexBasis: 0 }} className="min-w-0 text-center">
              <span className={`text-2xs block truncate ${openWeek === p.bucket.start ? 'text-gold-text font-bold' : 'text-text-tertiary'}`}>
                {showLabels || i % 2 === 0 ? axisLabel(p.bucket.start, grain) : ''}
              </span>
            </div>
          ))}
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-2xs text-text-tertiary">
          <span className="font-semibold">Intensità:</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-success/70" /> soft</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-warning/80" /> in tensione</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-orange" /> intenso</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-error" /> al limite ({MAX_PARALLEL_SPRINTS} sprint)</span>
          <span className="ml-auto">Il numero nella barra sono gli sprint in parallelo</span>
        </div>
      </div>

      {/* ── Drill-down del periodo selezionato ───────────────────────────────────── */}
      {selected && (
        <div className="mt-3 border-t border-border bg-background p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-text-primary">{fmtRange(selected.bucket.start, selected.bucket.end)}</p>
              <p className="text-2xs text-text-tertiary mt-0.5">
                Intensità <span className="font-semibold text-text-primary">{Math.round(selected.intensity * 100)}%</span>
                {` · ${selected.nSprint} sprint in parallelo su ${MAX_PARALLEL_SPRINTS}`}
                {` · ${Math.round(selected.bucket.hours)}h di lavoro`}
                {selected.bucket.byProject.length > 0 && ` · ${selected.bucket.byProject.length} progetti`}
              </p>
            </div>
            <button onClick={() => setOpenWeek(null)} aria-label="Chiudi" className="p-1 text-text-tertiary hover:text-text-primary">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Chi carica questo periodo */}
          {selected.bucket.byProject.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.bucket.byProject.slice(0, 5).map(pr => (
                <span key={pr.projectId} className="text-2xs px-2 py-0.5 rounded-full bg-surface border border-border text-text-secondary">
                  {pr.projectName} · <span className="tabular font-semibold text-text-primary">{Math.round(pr.hours)}h</span>
                </span>
              ))}
            </div>
          )}

          {weekTasks.length === 0 ? (
            <p className="text-2xs text-text-tertiary">Nessuna task attiva in questo periodo.</p>
          ) : (
            <ul className="space-y-1 max-h-60 overflow-y-auto">
              {weekTasks.map(t => {
                const proj = projectById.get(t.project_id)
                const owners = (multiMap.get(t.id) ?? (t.assignee_id ? [t.assignee_id] : [])).map(id => resourceById.get(id)?.full_name.split(' ')[0] ?? '—')
                const canEdit = canEditProject(t.project_id)
                return (
                  <li key={t.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{t.title}</p>
                      <p className="text-2xs text-text-tertiary truncate">
                        {proj?.name ?? '—'} · {t.estimated_hours != null ? `${t.estimated_hours}h` : '4h (stima mancante)'}
                        {owners.length > 0 && ` · ${owners.join(', ')}`}
                        {t.due_date && ` · scad. ${dISO(t.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}`}
                      </p>
                    </div>
                    {canEdit ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => shift(t, -7)} disabled={pending} aria-label={`Anticipa ${t.title}`} title="Anticipa di 1 settimana"
                          className="px-2 py-1 rounded-md border border-border text-2xs text-text-tertiary hover:text-info hover:border-info/40 transition-colors">← 1 sett.</button>
                        <button onClick={() => shift(t, 7)} disabled={pending} aria-label={`Posticipa ${t.title}`} title="Posticipa di 1 settimana"
                          className="px-2 py-1 rounded-md border border-border text-2xs text-text-tertiary hover:text-warning hover:border-warning/40 transition-colors">1 sett. →</button>
                      </div>
                    ) : (
                      <span className="text-2xs text-text-tertiary shrink-0">solo PM</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-2xs text-text-tertiary">Sposta le task fuori dal picco, o chiedi all&apos;AI un piano di riequilibrio.</p>
        </div>
      )}

      {/* ── Suggerimenti AI ──────────────────────────────────────────────────────── */}
      {aiSuggestions && (
        <div className="mt-3 border-t border-border bg-gold-dim/30 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-text-primary flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-gold-text" aria-hidden="true" /> Piano suggerito dall&apos;AI
            </p>
            <button onClick={() => { setAiSuggestions(null); setAiSummary('') }} aria-label="Chiudi suggerimenti"
              className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          {aiSummary && <p className="text-2xs text-text-secondary italic">{aiSummary}</p>}
          {aiSuggestions.length === 0 ? (
            <p className="text-2xs text-text-tertiary">Nessun suggerimento: il carico è bilanciato.</p>
          ) : aiSuggestions.map((s, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface px-3 py-2 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-primary">
                  <span className="text-2xs font-bold uppercase tracking-wider text-gold-text mr-1.5">{s.type}</span>{s.title}
                </p>
                <p className="text-2xs text-text-secondary mt-0.5">{s.detail}</p>
              </div>
              <button onClick={() => setNewTaskFor(s)}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border border-gold/40 text-2xs font-semibold text-gold-text hover:bg-gold-dim transition-colors">
                <Plus className="w-3 h-3" aria-hidden="true" /> Crea task
              </button>
              <button onClick={() => setAiSuggestions(prev => (prev ?? []).filter((_, j) => j !== i))}
                aria-label="Scarta suggerimento" title="Scarta"
                className="shrink-0 p-1 rounded text-text-tertiary hover:text-error hover:bg-error-dim transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <p className="text-2xs text-text-tertiary">L&apos;AI propone: nessuna modifica è stata applicata. Decidi tu.</p>
        </div>
      )}

      {newTaskFor && (
        <SuggestionTaskModal suggestion={newTaskFor} projects={Array.from(projectById.values())} onClose={() => setNewTaskFor(null)} />
      )}
    </div>
  )
}

/* ── Crea task da suggerimento AI ─────────────────────────────────────────────── */
function SuggestionTaskModal({ suggestion, projects, onClose }: {
  suggestion: AISuggestion
  projects: WLProject[]
  onClose: () => void
}) {
  const [title, setTitle] = useState(suggestion.title)
  const [projectId, setProjectId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('media')
  const [pending, startT] = useTransition()

  const inp = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-gold/40'

  const save = () => startT(async () => {
    if (!title.trim()) { toast.error('Titolo obbligatorio'); return }
    const res = await createMyTask({
      title: title.trim(),
      projectId: projectId || null,
      dueDate: dueDate || undefined,
      priority,
    })
    if (!res.ok) { toast.error(res.error ?? 'Errore creazione task'); return }
    toast.success(projectId ? 'Task creata sul progetto' : 'Task personale creata')
    onClose()
  })

  return (
    <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-2xs uppercase tracking-wider text-gold-text">Da suggerimento AI</p>
            <h3 className="text-base font-bold text-text-primary mt-0.5">Crea task di pianificazione</h3>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="p-1 text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-2xs text-text-secondary rounded-lg bg-surface-hover px-3 py-2">{suggestion.detail}</p>

        <div className="space-y-2">
          <input value={title} onChange={e => setTitle(e.target.value)} aria-label="Titolo" placeholder="Titolo" className={inp} />
          <select value={projectId} onChange={e => setProjectId(e.target.value)} aria-label="Progetto" className={inp}>
            <option value="">Task personale (nessun progetto)</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.client_name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} aria-label="Scadenza" className={inp} />
            <select value={priority} onChange={e => setPriority(e.target.value)} aria-label="Priorità" className={inp}>
              <option value="alta">Alta</option><option value="media">Media</option><option value="bassa">Bassa</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 border border-border rounded-xl text-xs text-text-secondary hover:text-text-primary">Annulla</button>
          <button onClick={save} disabled={pending}
            className="flex-1 py-2 bg-gold text-on-gold rounded-xl text-xs font-bold hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Plus className="w-3.5 h-3.5" aria-hidden="true" />} Crea task
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'warn' }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === 'warn' ? 'border-warning/30 bg-warning-dim' : 'border-border bg-surface'}`}>
      <p className="text-2xs uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className={`text-2xl font-bold tabular mt-0.5 ${tone === 'warn' ? 'text-warning' : 'text-text-primary'}`}>{value}</p>
    </div>
  )
}

function Select({ value, onChange, options, ...aria }: {
  value: string; onChange: (v: string) => void; options: [string, string][]
} & React.AriaAttributes) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      {...aria}
      className="bg-background border border-border-interactive rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/40"
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

/* ── Vista Progetti ─────────────────────────────────────────────────────────── */
function ProjectsView({ loads, tasksByProject, sprints, resources, multiMap, canEditProject, resourceById }: {
  loads: ReturnType<typeof computeProjectLoads>
  tasksByProject: WLTask[]
  sprints: WLSprint[]
  resources: WLResource[]
  multiMap: Map<string, string[]>
  canEditProject: (pid: string) => boolean
  resourceById: Map<string, WLResource>
}) {
  if (loads.length === 0) {
    return <p className="text-center py-16 text-text-tertiary text-sm">Nessun progetto con questi filtri.</p>
  }
  return (
    <div className="space-y-2">
      {loads.map(l => (
        <ProjectRow key={l.project.id}
          sprints={sprints.filter(s => s.project_id === l.project.id)}
          load={l}
          tasks={tasksByProject.filter(t => t.project_id === l.project.id)}
          resources={resources}
          multiMap={multiMap}
          resourceById={resourceById}
          editable={canEditProject(l.project.id)}
          manager={l.project.manager_id ? resourceById.get(l.project.manager_id) : null}
        />
      ))}
    </div>
  )
}

function ProjectRow({ load, tasks, sprints, resources, multiMap, resourceById, editable, manager }: {
  load: ReturnType<typeof computeProjectLoads>[number]
  tasks: WLTask[]
  sprints: WLSprint[]
  resources: WLResource[]
  multiMap: Map<string, string[]>
  resourceById: Map<string, WLResource>
  editable: boolean
  manager: WLResource | null | undefined
}) {
  const [open, setOpen] = useState(false)
  const { projectHref } = usePortalRoutes()
  const p = load.project
  const kindUi = p.project_kind ? KIND_UI[p.project_kind] : null
  const range = load.start && load.end
    ? `${new Date(load.start).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} – ${new Date(load.end).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`
    : 'senza date'

  // Milestone del progetto (task con is_milestone), ordinate per data.
  const milestones = tasks
    .filter(t => t.is_milestone)
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Header: il wrapper è un div (no button dentro button) — il link apre il progetto */}
      <div onClick={() => setOpen(o => !o)} role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-left cursor-pointer">
        {open ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
              : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={projectHref(p.client_id, p.id)} onClick={e => e.stopPropagation()}
              className="text-sm font-semibold text-text-primary truncate hover:text-gold-text hover:underline transition-colors">
              {p.name}
            </Link>
            {kindUi && <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full ${kindUi.cls}`}>{kindUi.label}</span>}
            {editable && <UserCog className="w-3 h-3 text-gold-text shrink-0" aria-label="Puoi gestire" />}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-2xs text-text-tertiary">
            <span className="truncate">{p.client_name}</span>
            <span>· {range}</span>
            {load.overdue > 0 && (
              <span className="flex items-center gap-0.5 text-error">
                <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" /> {load.overdue}
              </span>
            )}
          </div>
        </div>

        {/* Barra progresso */}
        <div className="hidden sm:flex items-center gap-2 w-32 shrink-0">
          <div className="flex-1 h-1.5 rounded-full bg-surface-active overflow-hidden">
            <div className="h-full rounded-full bg-gold" style={{ width: `${load.progress}%` }} />
          </div>
          <span className="text-2xs text-text-tertiary tabular w-8 text-right">{load.progress}%</span>
        </div>

        <div className="text-right shrink-0 w-16">
          <p className="text-sm font-bold text-text-primary tabular">{load.totalHours}h</p>
          <p className="text-2xs text-text-tertiary">{load.taskCount - load.doneCount} attive</p>
        </div>

        {manager ? (
          <span className="hidden md:flex items-center gap-1 shrink-0" title={`PM: ${manager.full_name}`}>
            <Crown className="w-3 h-3 text-gold-text" aria-hidden="true" />
            <span className="text-2xs text-text-tertiary">{manager.full_name.split(' ')[0]}</span>
          </span>
        ) : !editable && (
          <span className="hidden md:flex items-center gap-1 shrink-0 text-warning" title="Nessun responsabile assegnato">
            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
            <span className="text-2xs">senza PM</span>
          </span>
        )}

        <Link href={projectHref(p.client_id, p.id)} onClick={e => e.stopPropagation()}
          aria-label={`Apri progetto ${p.name}`} title="Apri progetto"
          className="shrink-0 p-1 rounded text-text-tertiary hover:text-gold-text hover:bg-surface-active transition-colors">
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      {open && (
        <div className="border-t border-border">
          {/* Gantt su calendario: SOLO sprint e milestone, cliccabili → popup → progetto */}
          <ProjectGantt project={p} sprints={sprints} milestones={milestones} tasks={tasks} editable={editable} />
        </div>
      )}
    </div>
  )
}

/* ── Gantt di progetto su calendario: SOLO sprint + milestone ─────────────────── */
type GanttItem =
  | { kind: 'sprint'; id: string; title: string; start: string; end: string; status: string; tasks: number; done: number }
  | { kind: 'milestone'; id: string; title: string; start: string; end: string; status: string }

function ProjectGantt({ project, sprints, milestones, tasks, editable }: {
  project: WLProject
  sprints: WLSprint[]
  milestones: WLTask[]
  tasks: WLTask[]
  editable: boolean
}) {
  const { projectHref } = usePortalRoutes()
  const [detail, setDetail] = useState<GanttItem | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [savingName, startRename] = useTransition()
  // Rinomine applicate localmente (le date e le task collegate non cambiano mai).
  const [renamed, setRenamed] = useState<Record<string, string>>({})
  const todayStr = new Date().toISOString().slice(0, 10)

  const saveName = (item: GanttItem) => startRename(async () => {
    const name = draftName.trim()
    if (!name || name === item.title) { setRenaming(false); return }
    const res = item.kind === 'sprint'
      ? await renameSprint(project.id, item.id, name)
      : await renameMilestone(project.id, item.id, name)
    if ('error' in res) { toast.error(res.error); return }
    setRenamed(prev => ({ ...prev, [item.id]: name }))
    setDetail({ ...item, title: name })
    setRenaming(false)
    toast.success('Nome aggiornato')
  })

  const items: GanttItem[] = useMemo(() => {
    const s: GanttItem[] = sprints.map(sp => {
      const inSprint = tasks.filter(t => !t.is_milestone && t.due_date && t.due_date >= sp.start_date && t.due_date <= sp.end_date)
      return {
        kind: 'sprint', id: sp.id, title: renamed[sp.id] ?? sp.name, start: sp.start_date, end: sp.end_date, status: sp.status,
        tasks: inSprint.length, done: inSprint.filter(t => t.status === 'completato').length,
      }
    })
    const m: GanttItem[] = milestones.filter(x => x.due_date)
      .map(x => ({ kind: 'milestone', id: x.id, title: renamed[x.id] ?? x.title, start: x.due_date!, end: x.due_date!, status: x.status }))
    return [...s, ...m].sort((a, b) => a.start.localeCompare(b.start))
  }, [sprints, milestones, tasks, renamed])

  if (items.length === 0) {
    return (
      <div className="px-4 py-5 text-center">
        <p className="text-2xs text-text-tertiary">Nessuno sprint o milestone con date: il Gantt non è tracciabile.</p>
        <Link href={projectHref(project.client_id, project.id)} className="text-2xs text-gold-text hover:underline mt-1 inline-block">
          Apri il progetto per pianificarli →
        </Link>
      </div>
    )
  }

  // Calendario RESPONSIVE: tutto in % sulla stessa scala temporale, così si adatta alla
  // larghezza della card. Le colonne dei mesi hanno flex proporzionale ai giorni reali →
  // barre sprint e marker milestone cadono esattamente sotto la data corrispondente.
  const min = items.map(i => i.start).sort()[0]
  const max = items.map(i => i.end).sort().slice(-1)[0]
  const gStartD = new Date(min.slice(0, 8) + '01T00:00:00')                     // 1° del mese iniziale
  const lastD = new Date(max + 'T00:00:00')
  const gEndD = new Date(lastD.getFullYear(), lastD.getMonth() + 1, 0)          // ultimo giorno del mese finale
  const dayIdx = (iso: string) =>
    Math.round((new Date(iso + 'T00:00:00').getTime() - gStartD.getTime()) / 86400000)
  const totalDays = Math.max(1, dayIdx(gEndD.toISOString().slice(0, 10)) + 1)
  const pctOf = (iso: string) => (dayIdx(iso) / totalDays) * 100                 // 0..100

  const months: { label: string; days: number }[] = []
  const cur = new Date(gStartD)
  while (cur <= gEndD && months.length < 24) {
    const dim = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()
    months.push({ label: cur.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }), days: dim })
    cur.setMonth(cur.getMonth() + 1)
  }

  const sprintCls = (s: GanttItem) => {
    if (s.status === 'completato') return 'bg-success/70 border-success'
    if (s.end < todayStr) return 'bg-error/60 border-error'
    if (s.status === 'in_corso') return 'bg-gold/70 border-gold'
    return 'bg-info/50 border-info'
  }
  const fmtD = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  const showToday = todayStr >= gStartD.toISOString().slice(0, 10) && todayStr <= gEndD.toISOString().slice(0, 10)

  // Milestone su più corsie: due marker troppo vicini non si accavallano più.
  const ms = items.filter(i => i.kind === 'milestone')
  const LANE_GAP = 14                                     // % minima fra due etichette sulla stessa corsia
  const laneOf = new Map<string, number>()
  const laneLastX: number[] = []
  for (const m of ms) {
    const x = pctOf(m.start)
    let lane = laneLastX.findIndex(last => x - last >= LANE_GAP)
    if (lane === -1) { lane = laneLastX.length; laneLastX.push(x) }
    else laneLastX[lane] = x
    laneOf.set(m.id, lane)
  }
  const laneCount = Math.max(1, laneLastX.length)

  return (
    <div className="px-4 py-3 bg-surface-hover/40">
      <div className="relative w-full">
        {/* Asse mesi: colonne con flex proporzionale ai giorni reali (responsive) */}
        <div className="flex border-b border-border pb-1 mb-2">
          {months.map((m, i) => (
            <div key={i} style={{ flexGrow: m.days, flexBasis: 0, minWidth: 0 }}
              className="text-2xs text-text-tertiary capitalize border-l border-border first:border-l-0 pl-1 truncate">
              {m.label}
            </div>
          ))}
        </div>

        {/* Linea "oggi" */}
        {showToday && (
          <div className="absolute top-5 bottom-0 w-px bg-error z-10 pointer-events-none" style={{ left: `${pctOf(todayStr)}%` }}>
            <span className="absolute -top-4 -translate-x-1/2 text-2xs text-error font-semibold bg-surface px-1">oggi</span>
          </div>
        )}

        {/* Sprint: una riga per sprint → mai sovrapposti fra loro */}
        <div className="space-y-1.5">
          {items.filter(i => i.kind === 'sprint').map(sp => {
            const left = pctOf(sp.start)
            const width = Math.max(2, pctOf(sp.end) + (100 / totalDays) - left)
            const progress = sp.kind === 'sprint' && sp.tasks > 0 ? Math.round((sp.done / sp.tasks) * 100) : 0
            return (
              <div key={sp.id} className="relative h-8">
                <button onClick={() => setDetail(sp)}
                  title={`Sprint: ${sp.title}\n${fmtD(sp.start)} → ${fmtD(sp.end)}\nStato: ${sp.status}${sp.kind === 'sprint' ? `\nTask: ${sp.done}/${sp.tasks} completate` : ''}`}
                  className={`absolute h-8 rounded-lg border flex items-center px-2 gap-1.5 hover:brightness-110 hover:ring-1 hover:ring-gold transition-all overflow-hidden ${sprintCls(sp)}`}
                  style={{ left: `${left}%`, width: `${width}%` }}>
                  <span className="text-2xs font-semibold text-text-primary truncate">{sp.title}</span>
                  {sp.kind === 'sprint' && sp.tasks > 0 && (
                    <span className="text-2xs text-text-primary/80 tabular shrink-0">{progress}%</span>
                  )}
                </button>
              </div>
            )
          })}
          {items.filter(i => i.kind === 'sprint').length === 0 && (
            <p className="text-2xs text-text-tertiary py-1">Nessuno sprint pianificato.</p>
          )}
        </div>

        {/* Milestone: corsie multiple per non accavallarsi */}
        {ms.length > 0 && (
          <div className="relative mt-3 border-t border-border pt-2" style={{ height: laneCount * 32 + 8 }}>
            {ms.map(m => {
              const done = m.status === 'completato'
              const late = !done && m.start < todayStr
              const lane = laneOf.get(m.id) ?? 0
              const x = pctOf(m.start)
              // I marker ai bordi si ancorano per non uscire dalla card.
              const anchor = x < 6 ? 'translate-x-0' : x > 94 ? '-translate-x-full' : '-translate-x-1/2'
              return (
                <button key={m.id} onClick={() => setDetail(m)}
                  title={`Milestone: ${m.title}\nData: ${fmtD(m.start)}\nStato: ${done ? 'Completata' : late ? 'In ritardo' : 'Da fare'}`}
                  className={`absolute ${anchor} flex flex-col items-start gap-0.5 hover:brightness-125 transition-all max-w-[9rem]`}
                  style={{ left: `${x}%`, top: lane * 32 }}>
                  <span className="flex items-center gap-1">
                    <Flag className={`w-3 h-3 shrink-0 ${done ? 'text-success' : late ? 'text-error' : 'text-gold-text'}`} aria-hidden="true" />
                    <span className="text-2xs text-text-tertiary whitespace-nowrap">{fmtD(m.start)}</span>
                  </span>
                  <span className="text-2xs text-text-primary truncate w-full text-left">{m.title}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Popup dettaglio: sprint o milestone → CTA alla sezione dedicata */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-surface border border-border rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-2xs uppercase tracking-wider text-text-tertiary">
                  {detail.kind === 'sprint' ? 'Sprint' : 'Milestone'} · {project.name}
                </p>
                {/* Rinomina: cambia SOLO il nome. Date, stato e task collegate restano invariati. */}
                {renaming && editable ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <input autoFocus value={draftName} onChange={e => setDraftName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveName(detail); if (e.key === 'Escape') setRenaming(false) }}
                      aria-label="Nome"
                      className="flex-1 bg-background border border-border-interactive rounded-lg px-2 py-1 text-sm font-bold text-text-primary focus:outline-none focus:border-gold/50" />
                    <button onClick={() => saveName(detail)} disabled={savingName} aria-label="Salva nome"
                      className="p-1 text-gold-text hover:bg-surface-hover rounded">
                      {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setRenaming(false)} aria-label="Annulla" className="p-1 text-text-tertiary hover:text-text-primary rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5 group">
                    <h3 className="text-base font-bold text-text-primary truncate">{detail.title}</h3>
                    {editable && (
                      <button onClick={() => { setDraftName(detail.title); setRenaming(true) }}
                        aria-label="Rinomina" title="Rinomina (non tocca le task collegate)"
                        className="p-1 text-text-tertiary hover:text-gold-text opacity-0 group-hover:opacity-100 transition-opacity">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setDetail(null)} aria-label="Chiudi" className="p-1 text-text-tertiary hover:text-text-primary shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-text-tertiary">{detail.kind === 'sprint' ? 'Periodo' : 'Data'}</dt>
                <dd className="text-text-primary font-medium">
                  {detail.kind === 'sprint'
                    ? `${new Date(detail.start + 'T00:00:00').toLocaleDateString('it-IT')} → ${new Date(detail.end + 'T00:00:00').toLocaleDateString('it-IT')}`
                    : new Date(detail.start + 'T00:00:00').toLocaleDateString('it-IT')}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-tertiary">Stato</dt>
                <dd className="text-text-primary font-medium">{STATUS_LABEL[detail.status] ?? detail.status}</dd>
              </div>
              {detail.kind === 'sprint' && (
                <div className="flex justify-between">
                  <dt className="text-text-tertiary">Task</dt>
                  <dd className="text-text-primary font-medium">{detail.done}/{detail.tasks} completate</dd>
                </div>
              )}
            </dl>
            <Link href={projectHref(project.client_id, project.id)}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-gold text-on-gold text-sm font-bold rounded-xl hover:bg-gold/90 transition-colors">
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              Apri nel progetto
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
/* ── Vista Risorse ──────────────────────────────────────────────────────────── */
function ResourcesView({ loads, tasks, projectById, multiMap }: {
  loads: ReturnType<typeof computeResourceLoads>
  tasks: WLTask[]
  projectById: Map<string, WLProject>
  multiMap: Map<string, string[]>
}) {
  if (loads.length === 0) {
    return <p className="text-center py-16 text-text-tertiary text-sm">Nessuna risorsa con task attive per questi filtri.</p>
  }
  return (
    <div className="space-y-2">
      {loads.map(l => (
        <ResourceCard key={l.resource.id} load={l}
          tasks={tasks.filter(t => !t.is_milestone && t.status !== 'completato'
            && (multiMap.get(t.id) ?? (t.assignee_id ? [t.assignee_id] : [])).includes(l.resource.id))}
          projectById={projectById} />
      ))}
    </div>
  )
}

function ResourceCard({ load: l, tasks, projectById }: {
  load: ReturnType<typeof computeResourceLoads>[number]
  tasks: WLTask[]
  projectById: Map<string, WLProject>
}) {
  const [open, setOpen] = useState(false)
  const todayStr = new Date().toISOString().slice(0, 10)
  const pct = Math.min(100, Math.round((l.totalHours / WEEKLY_CAPACITY) * 100))
  const over = l.totalHours > WEEKLY_CAPACITY
  const sorted = [...tasks].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 mb-2 text-left">
        {open ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
              : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />}
        <span className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-2xs font-bold text-text-secondary shrink-0">
          {l.resource.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{l.resource.full_name}</p>
          <p className="text-2xs text-text-tertiary">
            {l.activeTasks} task attive
            {l.overdue > 0 && <span className="text-error"> · {l.overdue} in ritardo</span>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-lg font-bold tabular ${over ? 'text-error' : 'text-text-primary'}`}>{l.totalHours}h</p>
          <p className="text-2xs text-text-tertiary">/ {WEEKLY_CAPACITY}h rif.</p>
        </div>
      </button>

      <div className="h-2 rounded-full bg-surface-active overflow-hidden mb-2" role="progressbar"
        aria-valuenow={l.totalHours} aria-valuemin={0} aria-valuemax={WEEKLY_CAPACITY}>
        <div className={`h-full rounded-full ${over ? 'bg-error' : pct > 80 ? 'bg-warning' : 'bg-success'}`}
          style={{ width: `${Math.max(4, pct)}%` }} />
      </div>

      {!open ? (
        <div className="flex flex-wrap gap-1.5">
          {l.byProject.map(bp => (
            <span key={bp.projectId}
              className="inline-flex items-center gap-1 rounded-lg bg-surface-active px-2 py-0.5 text-2xs text-text-secondary">
              <span className="truncate max-w-[10rem]">{bp.projectName}</span>
              <span className="tabular text-text-tertiary">{bp.hours}h</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-1 border-t border-border divide-y divide-border">
          {sorted.length === 0 && <p className="py-2 text-2xs text-text-tertiary">Nessuna task attiva.</p>}
          {sorted.map(t => {
            const overdue = t.due_date && t.due_date < todayStr
            return (
              <div key={t.id} className="flex items-center gap-2 py-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  t.status === 'in_corso' ? 'bg-warning' : t.status === 'in_revisione' ? 'bg-accent' : 'bg-text-tertiary'
                }`} aria-hidden="true" />
                <span className="flex-1 min-w-0 text-xs text-text-primary truncate">{t.title}</span>
                <span className="text-2xs text-text-tertiary truncate max-w-[10rem]">{projectById.get(t.project_id)?.name ?? '—'}</span>
                <span className="text-2xs text-text-tertiary shrink-0">{STATUS_LABEL[t.status] ?? t.status}</span>
                {t.due_date && (
                  <span className={`text-2xs tabular shrink-0 ${overdue ? 'text-error' : 'text-text-tertiary'}`}>
                    {overdue && '⚠ '}{new Date(t.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
