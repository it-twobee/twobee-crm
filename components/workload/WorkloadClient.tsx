'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Gauge, Users, FolderKanban, Filter, X, ChevronDown, ChevronRight,
  AlertTriangle, Clock, Trash2, Loader2, Crown, UserCog, CalendarRange, Sparkles,
  ExternalLink, Flag,
} from 'lucide-react'
import {
  filterTasks, computeResourceLoads, computeProjectLoads, computeIntensity, workloadSignals, taskHoverText,
  computeEffortBuckets, teamWeeklyCapacity, detectPeaks, EMPTY_FILTERS,
  type WLTask, type WLProject, type WLResource, type WLSprint, type WLFilters, type IntensityWindow,
  type EffortBucket, type EffortPeak,
} from '@/lib/workload'
import { AssigneePicker } from '@/components/tasks/AssigneePicker'
import { setTaskAssignees } from '@/app/actions/task-assignees'
import { pmUpdateTask, pmDeleteTask } from '@/app/actions/workload-tasks'
import { usePortalRoutes } from '@/lib/portal-routes'

type View = 'progetti' | 'timeline' | 'risorse' | 'intensita'

const KIND_UI: Record<string, { label: string; cls: string }> = {
  growth:  { label: 'Growth',  cls: 'text-success bg-success-dim' },
  digital: { label: 'Digital', cls: 'text-info bg-info-dim' },
}
const STATUS_LABEL: Record<string, string> = {
  da_fare: 'Da fare', in_corso: 'In corso', in_revisione: 'In revisione', completato: 'Completato',
}
const STATUS_OPTS = ['da_fare', 'in_corso', 'in_revisione', 'completato']

// Carico settimanale di riferimento: oltre questo la barra vira sul rosso.
const WEEKLY_CAPACITY = 40

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

  // Previsione cross-progetto: effort settimanale combinato e periodi di picco.
  const effortBuckets = useMemo(() => computeEffortBuckets(filtered, projectById), [filtered, projectById])
  const capacity = useMemo(() => teamWeeklyCapacity(resources), [resources])
  const peaks = useMemo(() => detectPeaks(effortBuckets, capacity), [effortBuckets, capacity])

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
          {([['progetti', 'Progetti', FolderKanban], ['timeline', 'Timeline', CalendarRange], ['risorse', 'Risorse', Users], ['intensita', 'Intensità', Gauge]] as const).map(([k, lbl, Icon]) => (
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
      <EffortForecast buckets={effortBuckets} capacity={capacity} peaks={peaks}
        windows={intensity.windows} signals={signals} needsAttention={aiNeeds} />

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
      {view === 'timeline' && (
        <TimelineView
          tasks={filtered}
          projects={visibleProjects}
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
      {view === 'intensita' && (
        <IntensityView windows={intensity.windows} estimateCoverage={intensity.estimateCoverage} signals={signals}
          needsAttention={aiNeeds} peaks={peaks} capacity={capacity} />
      )}
    </div>
  )
}

/* ── AI Planning Assistant (§9.4): propone, non applica ──────────────────────── */
type AISuggestion = { type: string; title: string; detail: string }
function AIPlanningPanel({ windows, signals, needsAttention, peaks, capacity }: {
  windows: IntensityWindow[]
  signals: { noEstimate: number; noDue: number; noOwner: number; projectsNoPm: number }
  needsAttention: { title: string; project: string; due_date: string | null; estimated_hours: number | null; owner: string | null; issue: string }[]
  peaks: EffortPeak[]
  capacity: number
}) {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<AISuggestion[] | null>(null)
  const [summary, setSummary] = useState('')

  const ask = async () => {
    setLoading(true)
    try {
      const payload = {
        windows: windows.map(w => ({ days: w.days, overloaded: w.overloaded, top: w.cells.slice(0, 4).map(c => ({ name: c.resourceName, hours: c.hours, capacity: c.capacity })) })),
        signals,
        needsAttention,
        // Accavallamenti cross-progetto: settimane in cui più progetti concorrono.
        peaks: peaks.slice(0, 6).map(p => ({
          from: p.bucket.start, to: p.bucket.end, hours: p.bucket.hours,
          capacity: Math.round(capacity), ratio: Math.round(p.ratio * 100),
          projects: p.bucket.byProject.slice(0, 4).map(x => ({ name: x.projectName, hours: x.hours })),
        })),
      }
      const res = await fetch('/api/ai/workload-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.error) { toast.error(data.error); return }
      setSuggestions(data.suggestions ?? []); setSummary(data.summary ?? '')
    } catch { toast.error('Errore analisi AI') } finally { setLoading(false) }
  }

  return (
    <div className="rounded-xl border border-gold/25 bg-gold-dim/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-text-primary flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-gold-text" aria-hidden="true" /> AI Planning
        </p>
        <button onClick={ask} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-on-gold text-2xs font-bold rounded-lg hover:bg-gold/90 disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
          {suggestions ? 'Rianalizza' : 'Chiedi suggerimenti'}
        </button>
      </div>
      <p className="text-2xs text-text-tertiary mt-1">L&apos;AI analizza carichi e segnali e propone azioni. Non modifica nulla: decidi tu.</p>

      {suggestions && (
        <div className="mt-3 space-y-2">
          {summary && <p className="text-xs text-text-secondary italic">{summary}</p>}
          {suggestions.length === 0 ? (
            <p className="text-xs text-text-tertiary">Nessun suggerimento: il carico sembra bilanciato.</p>
          ) : suggestions.map((s, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface px-3 py-2">
              <p className="text-xs font-semibold text-text-primary">
                <span className="text-2xs font-bold uppercase tracking-wider text-gold-text mr-1.5">{s.type}</span>{s.title}
              </p>
              <p className="text-2xs text-text-secondary mt-0.5">{s.detail}</p>
            </div>
          ))}
          <p className="text-2xs text-text-tertiary pt-1">Fonte: intensità per finestra, segnali qualità, {needsAttention.length} task in attenzione.</p>
        </div>
      )}
    </div>
  )
}

/* ── Vista Intensità futura (§9.3) ───────────────────────────────────────────── */
function IntensityView({ windows, estimateCoverage, signals, needsAttention, peaks, capacity }: {
  windows: IntensityWindow[]
  estimateCoverage: number
  signals: { noEstimate: number; noDue: number; noOwner: number; projectsNoPm: number }
  needsAttention: { title: string; project: string; due_date: string | null; estimated_hours: number | null; owner: string | null; issue: string }[]
  peaks: EffortPeak[]
  capacity: number
}) {
  const [days, setDays] = useState(30)
  const win = windows.find(w => w.days === days) ?? windows[0]

  return (
    <div className="space-y-4">
      <AIPlanningPanel windows={windows} signals={signals} needsAttention={needsAttention} peaks={peaks} capacity={capacity} />
      {/* Warning qualità previsione */}
      {estimateCoverage < 100 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-dim px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-2xs text-text-secondary">
            Previsione a bassa affidabilità: solo <span className="font-bold text-warning">{estimateCoverage}%</span> delle
            ore è basato su stime reali (il resto usa un default di {`4h`}). Compila le ore stimate per un calcolo più accurato.
          </p>
        </div>
      )}

      {/* Segnali operativi */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Stat label="Task senza stima" value={signals.noEstimate} tone={signals.noEstimate > 0 ? 'warn' : undefined} />
        <Stat label="Task senza scadenza" value={signals.noDue} tone={signals.noDue > 0 ? 'warn' : undefined} />
        <Stat label="Task senza owner" value={signals.noOwner} tone={signals.noOwner > 0 ? 'warn' : undefined} />
        <Stat label="Progetti senza PM" value={signals.projectsNoPm} tone={signals.projectsNoPm > 0 ? 'warn' : undefined} />
      </div>

      {/* Selettore finestra */}
      <div className="flex gap-1 rounded-xl bg-surface border border-border p-1 w-fit" role="tablist" aria-label="Finestra">
        {windows.map(w => (
          <button key={w.days} role="tab" aria-selected={w.days === days} onClick={() => setDays(w.days)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              w.days === days ? 'bg-gold-dim text-gold-text' : 'text-text-tertiary hover:text-text-primary'
            }`}>
            {w.days}gg{w.overloaded > 0 && <span className="ml-1 text-warning">·{w.overloaded}</span>}
          </button>
        ))}
      </div>

      {/* Carico per risorsa nella finestra */}
      {!win || win.cells.length === 0 ? (
        <p className="text-center py-12 text-text-tertiary text-sm">Nessun carico pianificato in questa finestra.</p>
      ) : (
        <div className="rounded-xl border border-border bg-surface divide-y divide-border">
          {win.cells.map(c => {
            const pct = Math.min(100, Math.round(c.ratio * 100))
            const over = c.ratio > 1
            const bar = over ? 'bg-error' : c.ratio > 0.8 ? 'bg-warning' : 'bg-success'
            return (
              <div key={c.resourceId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{c.resourceName}</span>
                <div className="w-40 h-2 rounded-full bg-surface-active overflow-hidden shrink-0">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                </div>
                <span className={`text-2xs tabular shrink-0 w-24 text-right ${over ? 'text-error font-bold' : 'text-text-tertiary'}`}>
                  {c.hours}h / {c.capacity}h
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Previsione effort cross-progetto: accavallamenti e periodi critici ───────── */
function EffortForecast({ buckets, capacity, peaks, windows, signals, needsAttention }: {
  buckets: EffortBucket[]
  capacity: number
  peaks: EffortPeak[]
  windows: IntensityWindow[]
  signals: { noEstimate: number; noDue: number; noOwner: number; projectsNoPm: number }
  needsAttention: { title: string; project: string; due_date: string | null; estimated_hours: number | null; owner: string | null; issue: string }[]
}) {
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[] | null>(null)
  const [aiSummary, setAiSummary] = useState('')

  const askAI = async () => {
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/workload-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          windows: windows.map(w => ({ days: w.days, overloaded: w.overloaded, top: w.cells.slice(0, 4).map(c => ({ name: c.resourceName, hours: c.hours, capacity: c.capacity })) })),
          signals,
          needsAttention,
          peaks: peaks.slice(0, 6).map(p => ({
            from: p.bucket.start, to: p.bucket.end, hours: p.bucket.hours,
            capacity: Math.round(capacity), ratio: Math.round(p.ratio * 100),
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
  const maxH = Math.max(capacity, ...buckets.map(b => b.hours))
  const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  const critical = peaks.filter(p => p.ratio >= 1)
  const heavy = peaks.filter(p => p.ratio < 1)

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-text-primary flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-gold-text" aria-hidden="true" />
            Previsione effort combinato
          </p>
          <p className="text-2xs text-text-tertiary mt-0.5">
            Ore/settimana su tutti i progetti · capacità team {Math.round(capacity)}h
          </p>
        </div>
        <button onClick={askAI} disabled={aiLoading}
          className="flex items-center gap-1.5 px-3 py-2 bg-gold text-on-gold text-xs font-bold rounded-lg hover:bg-gold/90 disabled:opacity-50 shrink-0">
          {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
          {aiLoading ? 'Analizzo…' : aiSuggestions ? 'Rianalizza' : "Pianifica con l'AI"}
        </button>
      </div>

      {/* Istogramma settimanale con linea di capacità */}
      <div className="relative">
        <div className="flex items-end gap-1 h-24">
          {buckets.map(b => {
            const h = Math.max(2, (b.hours / maxH) * 100)
            const over = capacity > 0 && b.hours > capacity
            const near = capacity > 0 && !over && b.hours >= capacity * 0.85
            const cls = over ? 'bg-error' : near ? 'bg-warning' : 'bg-success/70'
            return (
              <div key={b.start} className="flex-1 flex flex-col justify-end h-full"
                title={`Settimana ${fmt(b.start)} – ${fmt(b.end)}\nEffort: ${b.hours}h (capacità ${Math.round(capacity)}h)\nProgetti: ${b.byProject.length}\n${b.byProject.slice(0, 4).map(p => `· ${p.projectName}: ${p.hours}h`).join('\n')}`}>
                <div className={`w-full rounded-t ${cls}`} style={{ height: `${h}%` }} />
              </div>
            )
          })}
        </div>
        {capacity > 0 && capacity <= maxH && (
          <div className="absolute left-0 right-0 border-t border-dashed border-text-tertiary/60 pointer-events-none"
            style={{ bottom: `${(capacity / maxH) * 100}%` }}>
            <span className="absolute -top-3.5 right-0 text-2xs text-text-tertiary bg-surface px-1">capacità</span>
          </div>
        )}
      </div>
      <div className="flex justify-between text-2xs text-text-tertiary">
        <span>{fmt(buckets[0].start)}</span>
        <span>{fmt(buckets[buckets.length - 1].end)}</span>
      </div>

      {/* Periodi critici: dove più progetti si accavallano */}
      {peaks.length === 0 ? (
        <p className="text-2xs text-success flex items-center gap-1.5">
          <Gauge className="w-3 h-3" aria-hidden="true" /> Nessun periodo di sovraccarico previsto: il carico resta sotto la capacità del team.
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-2xs uppercase tracking-wider text-text-tertiary flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-warning" aria-hidden="true" />
            {critical.length > 0 ? `${critical.length} settimane oltre capacità` : `${heavy.length} settimane ad alta intensità`}
          </p>
          {peaks.slice(0, 4).map(p => (
            <div key={p.bucket.start}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${p.ratio >= 1 ? 'border-error/30 bg-error-dim' : 'border-warning/30 bg-warning-dim'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-2xs font-bold text-text-primary">
                  {fmt(p.bucket.start)} – {fmt(p.bucket.end)}: {p.bucket.hours}h su {Math.round(capacity)}h
                  <span className={`ml-1.5 ${p.ratio >= 1 ? 'text-error' : 'text-warning'}`}>({Math.round(p.ratio * 100)}%)</span>
                </p>
                <p className="text-2xs text-text-secondary mt-0.5 truncate">
                  {p.projects > 1
                    ? `${p.projects} progetti in parallelo: ${p.bucket.byProject.slice(0, 3).map(x => `${x.projectName} (${x.hours}h)`).join(' · ')}`
                    : `${p.bucket.byProject[0]?.projectName ?? '—'}: ${p.bucket.byProject[0]?.hours ?? 0}h`}
                </p>
              </div>
            </div>
          ))}
          <p className="text-2xs text-text-tertiary pt-0.5">
            Le task di progetti diversi si accavallano in questi periodi: pianifica in dettaglio o chiedi all&apos;AI di riequilibrare.
          </p>
        </div>
      )}

      {/* Suggerimenti AI in-place (propone, non applica) */}
      {aiSuggestions && (
        <div className="rounded-xl border border-gold/25 bg-gold-dim/40 p-3 space-y-2">
          <p className="text-2xs font-bold text-text-primary flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-gold-text" aria-hidden="true" /> Piano suggerito dall&apos;AI
          </p>
          {aiSummary && <p className="text-2xs text-text-secondary italic">{aiSummary}</p>}
          {aiSuggestions.length === 0 ? (
            <p className="text-2xs text-text-tertiary">Nessun suggerimento: il carico è bilanciato.</p>
          ) : aiSuggestions.map((s, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface px-3 py-2">
              <p className="text-2xs font-semibold text-text-primary">
                <span className="font-bold uppercase tracking-wider text-gold-text mr-1.5">{s.type}</span>{s.title}
              </p>
              <p className="text-2xs text-text-secondary mt-0.5">{s.detail}</p>
            </div>
          ))}
          <p className="text-2xs text-text-tertiary">L&apos;AI propone: nessuna modifica è stata applicata. Decidi tu.</p>
        </div>
      )}
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
          <ProjectGantt project={p} sprints={sprints} milestones={milestones} tasks={tasks} />

          {!p.manager_id && (
            <Link href={projectHref(p.client_id, p.id)}
              className="px-4 py-2 text-2xs text-warning hover:underline flex items-center gap-1.5 border-t border-border">
              <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Nessun responsabile — assegna un PM
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Gantt di progetto su calendario: SOLO sprint + milestone ─────────────────── */
type GanttItem =
  | { kind: 'sprint'; id: string; title: string; start: string; end: string; status: string; tasks: number; done: number }
  | { kind: 'milestone'; id: string; title: string; start: string; end: string; status: string }

function ProjectGantt({ project, sprints, milestones, tasks }: {
  project: WLProject
  sprints: WLSprint[]
  milestones: WLTask[]
  tasks: WLTask[]
}) {
  const { projectHref } = usePortalRoutes()
  const [detail, setDetail] = useState<GanttItem | null>(null)
  const todayStr = new Date().toISOString().slice(0, 10)

  const items: GanttItem[] = useMemo(() => {
    const s: GanttItem[] = sprints.map(sp => {
      const inSprint = tasks.filter(t => !t.is_milestone && t.due_date && t.due_date >= sp.start_date && t.due_date <= sp.end_date)
      return {
        kind: 'sprint', id: sp.id, title: sp.name, start: sp.start_date, end: sp.end_date, status: sp.status,
        tasks: inSprint.length, done: inSprint.filter(t => t.status === 'completato').length,
      }
    })
    const m: GanttItem[] = milestones.filter(x => x.due_date)
      .map(x => ({ kind: 'milestone', id: x.id, title: x.title, start: x.due_date!, end: x.due_date!, status: x.status }))
    return [...s, ...m].sort((a, b) => a.start.localeCompare(b.start))
  }, [sprints, milestones, tasks])

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

  // Scala mensile leggibile: dal primo inizio all'ultima fine, in mesi.
  const min = items.map(i => i.start).sort()[0]
  const max = items.map(i => i.end).sort().slice(-1)[0]
  const t0 = new Date(min.slice(0, 8) + '01T00:00:00')
  const lastEnd = new Date(max + 'T00:00:00')
  const months: Date[] = []
  const cur = new Date(t0)
  while (cur <= lastEnd && months.length < 18) { months.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1) }
  if (months.length === 0) months.push(new Date(t0))
  const gStart = months[0].getTime()
  const gEnd = new Date(months[months.length - 1].getFullYear(), months[months.length - 1].getMonth() + 1, 0).getTime()
  const total = Math.max(1, gEnd - gStart)
  const pct = (iso: string) => ((new Date(iso + 'T00:00:00').getTime() - gStart) / total) * 100
  const MW = 90 // larghezza mese

  const sprintCls = (s: GanttItem) => {
    if (s.status === 'completato') return 'bg-success/70 border-success'
    if (s.end < todayStr) return 'bg-error/60 border-error'
    if (s.status === 'in_corso') return 'bg-gold/70 border-gold'
    return 'bg-info/50 border-info'
  }

  return (
    <div className="px-4 py-3 bg-surface-hover/40">
      <div className="overflow-x-auto">
        <div style={{ minWidth: months.length * MW }}>
          {/* Asse mesi */}
          <div className="flex border-b border-border pb-1 mb-2">
            {months.map((m, i) => (
              <div key={i} style={{ width: MW }} className="shrink-0 text-2xs text-text-tertiary capitalize border-l border-border first:border-l-0 pl-1.5">
                {m.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}
              </div>
            ))}
          </div>

          {/* Righe: sprint come barre */}
          <div className="space-y-1.5 relative">
            {/* linea oggi */}
            {todayStr >= min && todayStr <= max && (
              <div className="absolute top-0 bottom-0 w-px bg-error/60 z-10 pointer-events-none" style={{ left: `${pct(todayStr)}%` }} />
            )}
            {items.filter(i => i.kind === 'sprint').map(sp => {
              const left = pct(sp.start)
              const width = Math.max(3, pct(sp.end) - left)
              const progress = sp.kind === 'sprint' && sp.tasks > 0 ? Math.round((sp.done / sp.tasks) * 100) : 0
              return (
                <div key={sp.id} className="relative h-8">
                  <button onClick={() => setDetail(sp)}
                    title={`Sprint: ${sp.title}\n${new Date(sp.start + 'T00:00:00').toLocaleDateString('it-IT')} → ${new Date(sp.end + 'T00:00:00').toLocaleDateString('it-IT')}\nStato: ${sp.status}${sp.kind === 'sprint' ? `\nTask: ${sp.done}/${sp.tasks} completate` : ''}`}
                    className={`absolute h-8 rounded-lg border flex items-center px-2 gap-1.5 hover:brightness-110 hover:ring-1 hover:ring-gold transition-all ${sprintCls(sp)}`}
                    style={{ left: `${left}%`, width: `${width}%`, minWidth: 60 }}>
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

          {/* Milestone: marker cliccabili sotto l'asse */}
          {items.some(i => i.kind === 'milestone') && (
            <div className="relative h-10 mt-3 border-t border-border pt-2">
              {items.filter(i => i.kind === 'milestone').map(m => {
                const done = m.status === 'completato'
                const late = !done && m.start < todayStr
                return (
                  <button key={m.id} onClick={() => setDetail(m)}
                    title={`Milestone: ${m.title}\nData: ${new Date(m.start + 'T00:00:00').toLocaleDateString('it-IT')}\nStato: ${done ? 'Completata' : late ? 'In ritardo' : 'Da fare'}`}
                    className="absolute -translate-x-1/2 flex flex-col items-center gap-0.5 hover:scale-110 transition-transform"
                    style={{ left: `${pct(m.start)}%` }}>
                    <Flag className={`w-3.5 h-3.5 ${done ? 'text-success' : late ? 'text-error' : 'text-gold-text'}`} aria-hidden="true" />
                    <span className="text-2xs text-text-tertiary whitespace-nowrap max-w-[7rem] truncate">{m.title}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Popup dettaglio: sprint o milestone → CTA alla sezione dedicata */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-surface border border-border rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-2xs uppercase tracking-wider text-text-tertiary">
                  {detail.kind === 'sprint' ? 'Sprint' : 'Milestone'} · {project.name}
                </p>
                <h3 className="text-base font-bold text-text-primary mt-0.5">{detail.title}</h3>
              </div>
              <button onClick={() => setDetail(null)} aria-label="Chiudi" className="p-1 text-text-tertiary hover:text-text-primary">
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

function TaskLine({ task, resources, assignees, resourceById, editable }: {
  task: WLTask
  resources: WLResource[]
  assignees: string[]
  resourceById: Map<string, WLResource>
  editable: boolean
}) {
  const [pending, start] = useTransition()
  const [ids, setIds] = useState(assignees)
  const [status, setStatus] = useState(task.status)
  const [editingAssignee, setEditingAssignee] = useState(false)
  const overdue = task.status !== 'completato' && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)

  const changeStatus = (s: string) => {
    setStatus(s)
    start(async () => {
      const res = await pmUpdateTask(task.project_id, task.id, { status: s })
      if ('error' in res) { toast.error(res.error); setStatus(task.status) }
    })
  }
  const saveAssignees = (next: string[]) => {
    setIds(next)
    start(async () => {
      const res = await setTaskAssignees(task.id, next)
      if ('error' in res) toast.error(res.error)
    })
  }
  const del = () => start(async () => {
    const res = await pmDeleteTask(task.project_id, task.id)
    if ('error' in res) toast.error(res.error)
    else toast.success('Task eliminata')
  })

  return (
    <div className="px-4 py-2.5 flex flex-wrap items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
        status === 'completato' ? 'bg-success' : status === 'in_corso' ? 'bg-warning' : status === 'in_revisione' ? 'bg-accent' : 'bg-text-tertiary'
      }`} aria-hidden="true" />
      <span className="flex-1 min-w-[8rem] text-sm text-text-primary truncate">{task.title}</span>

      {task.due_date && (
        <span className={`text-2xs tabular shrink-0 ${overdue ? 'text-error' : 'text-text-tertiary'}`}>
          {overdue && '⚠ '}{new Date(task.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
        </span>
      )}
      <span className="text-2xs text-text-tertiary tabular shrink-0 w-8 text-right">
        {task.estimated_hours ?? 4}h
      </span>

      {/* Assegnatari */}
      <div className="shrink-0 min-w-[9rem]">
        {editable && editingAssignee ? (
          <AssigneePicker profiles={resources.map(r => ({ id: r.id, full_name: r.full_name, avatar_url: r.avatar_url }))}
            value={ids} onChange={saveAssignees} />
        ) : (
          <button
            onClick={() => editable && setEditingAssignee(true)}
            disabled={!editable}
            className={`flex items-center gap-1 text-2xs ${editable ? 'text-text-secondary hover:text-text-primary' : 'text-text-tertiary cursor-default'}`}
          >
            {ids.length === 0 ? 'Non assegnata'
              : ids.length === 1 ? (resourceById.get(ids[0])?.full_name.split(' ')[0] ?? '—')
              : `${resourceById.get(ids[0])?.full_name.split(' ')[0] ?? '—'} +${ids.length - 1}`}
          </button>
        )}
      </div>

      {editable ? (
        <select value={status} onChange={e => changeStatus(e.target.value)} disabled={pending}
          aria-label={`Stato di ${task.title}`}
          className="shrink-0 bg-background border border-border-interactive rounded-lg px-2 py-1 text-2xs text-text-primary focus:outline-none">
          {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      ) : (
        <span className="shrink-0 text-2xs text-text-tertiary">{STATUS_LABEL[status]}</span>
      )}

      {editable && (
        <button onClick={del} disabled={pending} aria-label={`Elimina ${task.title}`}
          className="shrink-0 p-1 rounded text-text-tertiary hover:text-error hover:bg-error-dim transition-colors">
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
        </button>
      )}
    </div>
  )
}

/* ── Vista Timeline (task in parallelo, scala settimana/mese) ─────────────────── */
type TScale = 'settimana' | 'mese'
function mondayOf(d: Date) {
  const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x
}
function bucketStart(d: Date, scale: TScale) {
  if (scale === 'mese') { const x = new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0, 0, 0, 0); return x }
  return mondayOf(d)
}
function stepNext(d: Date, scale: TScale) {
  const x = new Date(d)
  if (scale === 'mese') x.setMonth(x.getMonth() + 1)
  else x.setDate(x.getDate() + 7)
  return x
}

function TimelineView({ tasks, projects, resources, multiMap, canEditProject, resourceById }: {
  tasks: WLTask[]
  projects: WLProject[]
  resources: WLResource[]
  multiMap: Map<string, string[]>
  canEditProject: (pid: string) => boolean
  resourceById: Map<string, WLResource>
}) {
  const [selected, setSelected] = useState<WLTask | null>(null)
  const [scale, setScale] = useState<TScale>('settimana')
  const { projectHref } = usePortalRoutes()
  const todayStr = new Date().toISOString().slice(0, 10)
  const dated = useMemo(() => tasks.filter(t => !t.is_milestone && t.due_date), [tasks])
  // Milestone: cittadine di prima classe della timeline (marker con data).
  const datedMilestones = useMemo(() => tasks.filter(t => t.is_milestone && t.due_date), [tasks])
  const noDate = tasks.filter(t => !t.is_milestone && !t.due_date).length
  const cap = scale === 'mese' ? 24 : 16

  const cols = useMemo(() => {
    const all = [...dated, ...datedMilestones]
    if (all.length === 0) return [] as Date[]
    const ds = all.map(t => t.due_date!).sort()
    let start = bucketStart(new Date(ds[0] + 'T00:00:00'), scale)
    const todayBucket = bucketStart(new Date(), scale)
    if (start > todayBucket) start = todayBucket
    const last = bucketStart(new Date(ds[ds.length - 1] + 'T00:00:00'), scale)
    const arr: Date[] = []
    let cur = new Date(start)
    while (cur <= last && arr.length < cap) { arr.push(new Date(cur)); cur = stepNext(cur, scale) }
    if (arr.length === 0) arr.push(new Date(start))
    return arr
  }, [dated, scale, cap])

  const colIndexOf = (due: string) => {
    const d = bucketStart(new Date(due + 'T00:00:00'), scale).getTime()
    for (let i = cols.length - 1; i >= 0; i--) if (cols[i].getTime() <= d) return i
    return 0
  }
  const ownersOf = (t: WLTask) => (multiMap.get(t.id) ?? (t.assignee_id ? [t.assignee_id] : []))
    .map(id => resourceById.get(id)?.full_name ?? '—')

  const rows = projects
    .map(p => ({
      project: p,
      tasks: dated.filter(t => t.project_id === p.id),
      milestones: datedMilestones.filter(t => t.project_id === p.id),
    }))
    .filter(r => r.tasks.length > 0 || r.milestones.length > 0)

  if (cols.length === 0) {
    return <p className="text-center py-16 text-text-tertiary text-sm">Nessuna task con scadenza per questi filtri.</p>
  }

  const COL = 120
  const todayBucketMs = bucketStart(new Date(), scale).getTime()
  const colLabel = (c: Date) => scale === 'mese'
    ? c.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })
    : c.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-surface border border-border p-1 w-fit" role="tablist" aria-label="Scala">
        {(['settimana', 'mese'] as const).map(s => (
          <button key={s} role="tab" aria-selected={scale === s} onClick={() => setScale(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              scale === s ? 'bg-gold-dim text-gold-text' : 'text-text-tertiary hover:text-text-primary'
            }`}>{s}</button>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-surface overflow-x-auto">
        <div style={{ minWidth: 180 + cols.length * COL }}>
          <div className="flex border-b border-border bg-surface">
            <div className="w-[180px] shrink-0 px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-text-tertiary">Progetto</div>
            {cols.map((w, i) => (
              <div key={i} style={{ width: COL }}
                className={`shrink-0 px-2 py-2 text-2xs text-center border-l border-border ${w.getTime() === todayBucketMs ? 'text-gold-text font-semibold' : 'text-text-tertiary'}`}>
                {colLabel(w)}
              </div>
            ))}
          </div>
          {rows.map(row => (
            <div key={row.project.id} className="flex border-b border-border last:border-0">
              <div className="w-[180px] shrink-0 px-3 py-2">
                <Link href={projectHref(row.project.client_id, row.project.id)}
                  className="text-xs font-semibold text-text-primary truncate block hover:text-gold-text hover:underline transition-colors">
                  {row.project.name}
                </Link>
                <p className="text-2xs text-text-tertiary truncate">{row.project.client_name}</p>
              </div>
              {cols.map((w, i) => (
                <div key={i} style={{ width: COL }} className="shrink-0 border-l border-border p-1 space-y-1 min-h-[3rem]">
                  {/* Milestone: marker in evidenza con data */}
                  {row.milestones.filter(m => colIndexOf(m.due_date!) === i).map(m => {
                    const late = m.status !== 'completato' && m.due_date! < todayStr
                    return (
                      <div key={m.id}
                        title={`Milestone: ${m.title}\nData: ${new Date(m.due_date!).toLocaleDateString('it-IT')}\nStato: ${STATUS_LABEL[m.status] ?? m.status}`}
                        className={`flex items-center gap-1 rounded px-1.5 py-1 text-2xs font-semibold truncate border ${
                          m.status === 'completato' ? 'bg-success-dim text-success border-success/30'
                          : late ? 'bg-error-dim text-error border-error/30'
                          : 'bg-gold-dim text-gold-text border-gold/30'
                        }`}>
                        <Flag className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{m.title}</span>
                      </div>
                    )
                  })}
                  {row.tasks.filter(t => colIndexOf(t.due_date!) === i).map(t => {
                    const overdue = t.status !== 'completato' && t.due_date! < todayStr
                    const cls = t.status === 'completato' ? 'bg-success-dim text-success'
                      : overdue ? 'bg-error-dim text-error'
                      : t.status === 'in_corso' ? 'bg-warning-dim text-warning'
                      : t.status === 'in_revisione' ? 'bg-accent-dim text-accent'
                      : 'bg-surface-active text-text-secondary'
                    return (
                      <button key={t.id} onClick={() => setSelected(t)}
                        title={taskHoverText(t, row.project.name, ownersOf(t))}
                        className={`block w-full text-left rounded px-1.5 py-1 text-2xs truncate transition-shadow ${cls} ${selected?.id === t.id ? 'ring-1 ring-gold' : ''}`}>
                        {t.title}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {noDate > 0 && (
        <p className="text-2xs text-text-tertiary">+ {noDate} task senza scadenza (non collocabili in timeline).</p>
      )}

      {selected && (
        <div className="rounded-xl border border-gold/30 bg-surface">
          <div className="flex items-center justify-between px-4 pt-3">
            <p className="text-2xs text-text-tertiary">
              {projects.find(p => p.id === selected.project_id)?.name ?? '—'} · dettaglio task
            </p>
            <button onClick={() => setSelected(null)} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <TaskLine task={selected} resources={resources}
            assignees={multiMap.get(selected.id) ?? (selected.assignee_id ? [selected.assignee_id] : [])}
            resourceById={resourceById} editable={canEditProject(selected.project_id)} />
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
