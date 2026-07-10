'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Gauge, Users, FolderKanban, Filter, X, ChevronDown, ChevronRight,
  AlertTriangle, Clock, Trash2, Loader2, Crown, UserCog,
} from 'lucide-react'
import {
  filterTasks, computeResourceLoads, computeProjectLoads, EMPTY_FILTERS,
  type WLTask, type WLProject, type WLResource, type WLFilters,
} from '@/lib/workload'
import { AssigneePicker } from '@/components/tasks/AssigneePicker'
import { setTaskAssignees } from '@/app/actions/task-assignees'
import { pmUpdateTask, pmDeleteTask } from '@/app/actions/workload-tasks'

type View = 'progetti' | 'risorse'

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
  projects, tasks, resources, clients, multiAssignees, canEditAll, managedProjectIds, title, subtitle,
}: {
  projects: WLProject[]
  tasks: WLTask[]
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

      {view === 'progetti' ? (
        <ProjectsView
          loads={projectLoads}
          tasksByProject={filtered}
          resources={resources}
          multiMap={multiMap}
          canEditProject={canEditProject}
          resourceById={new Map(resources.map(r => [r.id, r]))}
        />
      ) : (
        <ResourcesView loads={resourceLoads} />
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
function ProjectsView({ loads, tasksByProject, resources, multiMap, canEditProject, resourceById }: {
  loads: ReturnType<typeof computeProjectLoads>
  tasksByProject: WLTask[]
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

function ProjectRow({ load, tasks, resources, multiMap, resourceById, editable, manager }: {
  load: ReturnType<typeof computeProjectLoads>[number]
  tasks: WLTask[]
  resources: WLResource[]
  multiMap: Map<string, string[]>
  resourceById: Map<string, WLResource>
  editable: boolean
  manager: WLResource | null | undefined
}) {
  const [open, setOpen] = useState(false)
  const p = load.project
  const kindUi = p.project_kind ? KIND_UI[p.project_kind] : null
  const range = load.start && load.end
    ? `${new Date(load.start).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} – ${new Date(load.end).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`
    : 'senza date'

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-left">
        {open ? <ChevronDown className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
              : <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary truncate">{p.name}</span>
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

        {manager && (
          <span className="hidden md:flex items-center gap-1 shrink-0" title={`PM: ${manager.full_name}`}>
            <Crown className="w-3 h-3 text-gold-text" aria-hidden="true" />
            <span className="text-2xs text-text-tertiary">{manager.full_name.split(' ')[0]}</span>
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {tasks.filter(t => !t.is_milestone).length === 0 && (
            <p className="px-4 py-3 text-2xs text-text-tertiary">Nessuna task.</p>
          )}
          {tasks.filter(t => !t.is_milestone).map(t => (
            <TaskLine key={t.id} task={t} resources={resources}
              assignees={multiMap.get(t.id) ?? (t.assignee_id ? [t.assignee_id] : [])}
              resourceById={resourceById} editable={editable} />
          ))}
          {!editable && (
            <p className="px-4 py-2 text-2xs text-text-tertiary flex items-center gap-1.5">
              <Crown className="w-3 h-3" aria-hidden="true" /> Solo il PM del progetto o un admin può modificare queste task.
            </p>
          )}
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

/* ── Vista Risorse ──────────────────────────────────────────────────────────── */
function ResourcesView({ loads }: { loads: ReturnType<typeof computeResourceLoads> }) {
  if (loads.length === 0) {
    return <p className="text-center py-16 text-text-tertiary text-sm">Nessuna risorsa con task attive per questi filtri.</p>
  }
  return (
    <div className="space-y-2">
      {loads.map(l => {
        const pct = Math.min(100, Math.round((l.totalHours / WEEKLY_CAPACITY) * 100))
        const over = l.totalHours > WEEKLY_CAPACITY
        return (
          <div key={l.resource.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-3 mb-2">
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
            </div>

            <div className="h-2 rounded-full bg-surface-active overflow-hidden mb-2" role="progressbar"
              aria-valuenow={l.totalHours} aria-valuemin={0} aria-valuemax={WEEKLY_CAPACITY}>
              <div className={`h-full rounded-full ${over ? 'bg-error' : pct > 80 ? 'bg-warning' : 'bg-success'}`}
                style={{ width: `${Math.max(4, pct)}%` }} />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {l.byProject.map(bp => (
                <span key={bp.projectId}
                  className="inline-flex items-center gap-1 rounded-lg bg-surface-active px-2 py-0.5 text-2xs text-text-secondary">
                  <span className="truncate max-w-[10rem]">{bp.projectName}</span>
                  <span className="tabular text-text-tertiary">{bp.hours}h</span>
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
