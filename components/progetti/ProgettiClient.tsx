'use client'

import { useState, useEffect } from 'react'
import {
  RefreshCw, Plus, Search, FolderKanban, CheckCircle2, Clock, AlertCircle,
  Loader2, ExternalLink, X, Brain, Zap, LayoutGrid, List, ArrowUpDown,
  TrendingDown, Flag, Pencil, Trash2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ProjectWizard } from '@/components/projects/ProjectWizard'
import Link from 'next/link'
import { toast } from 'sonner'
import type { ProjectStatus } from '@/lib/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskMin {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  assignee_id: string | null
}

interface SprintMin {
  id: string
  name: string
  status: string
  end_date: string | null
}

interface Project {
  id: string
  name: string
  description: string | null
  status: ProjectStatus
  sprint_current: number
  project_type: string
  project_kind: string | null
  client_id: string
  created_at: string
  clients: { id: string; company_name: string; client_type: string; client_label: string; status: string } | null
  tasks: TaskMin[]
  sprints: SprintMin[]
}

type SortKey = 'newest' | 'health_asc' | 'progress_desc' | 'overdue_desc' | 'alpha'
type ViewMode = 'grid' | 'list'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  attivo:     'bg-success/15 text-success border border-success/20',
  in_pausa:   'bg-warning/15 text-warning border border-warning/20',
  completato: 'bg-surface-active text-text-secondary border border-border',
  archiviato: 'bg-surface-active text-text-secondary border border-border',
}
const STATUS_LABEL: Record<string, string> = {
  attivo: 'Attivo', in_pausa: 'In pausa', completato: 'Completato', archiviato: 'Archiviato',
}

const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  ecommerce: { icon: '🛒', label: 'E-commerce',   color: 'text-orange' },
  lead_gen:  { icon: '🎯', label: 'Lead Gen',      color: 'text-gold-text' },
  sito_web:  { icon: '🌐', label: 'Sito Web',      color: 'text-info' },
  app_ai:    { icon: '🤖', label: 'App AI',        color: 'text-accent' },
  campagna:  { icon: '📣', label: 'Campagna',      color: 'text-success' },
  custom:    { icon: '📁', label: 'Custom',        color: 'text-text-secondary' },
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest',       label: 'Più recenti' },
  { key: 'health_asc',   label: 'Più critici prima' },
  { key: 'progress_desc',label: 'Progresso ↓' },
  { key: 'overdue_desc', label: 'Task scadute ↓' },
  { key: 'alpha',        label: 'Alfabetico' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function projectProgress(tasks: TaskMin[]) {
  if (!tasks.length) return 0
  return Math.round(tasks.filter(t => t.status === 'completato').length / tasks.length * 100)
}

function projectHealthScore(tasks: TaskMin[]) {
  if (!tasks.length) return { score: 50, color: 'text-text-secondary', bg: 'bg-surface-active', border: 'border-border', label: '—' }
  const total   = tasks.length
  const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completato').length
  const noAsgn  = tasks.filter(t => !t.assignee_id && t.status !== 'completato').length
  const done    = tasks.filter(t => t.status === 'completato').length
  let score = 100
  score -= Math.min(40, Math.round(overdue / total * 80))
  score -= Math.min(20, Math.round(noAsgn  / total * 40))
  if (done / total > 0.5) score += Math.round((done / total - 0.5) * 40)
  score = Math.max(0, Math.min(100, score))
  if (score >= 70) return { score, color: 'text-success', bg: 'bg-success/10', border: 'border-success/20', label: 'Sano' }
  if (score >= 40) return { score, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', label: 'A rischio' }
  return { score, color: 'text-error', bg: 'bg-error/10', border: 'border-error/20', label: 'Critico' }
}

function activeSprint(sprints: SprintMin[]) {
  return sprints.find(s => s.status === 'in_corso') ?? sprints.find(s => s.status === 'pianificato') ?? null
}

function kindBadge(kind: string | null) {
  if (kind === 'growth')    return { label: '🌱 Growth',    style: 'bg-gold/10 text-gold-text border-gold/25' }
  if (kind === 'marketing') return { label: '📣 Marketing', style: 'bg-warning/10 text-warning border-warning/25' }
  if (kind === 'digital')   return { label: '💻 Digital',   style: 'bg-info/10 text-info border-info/25' }
  if (kind === 'ai')        return { label: '🤖 AI',        style: 'bg-accent/10 text-accent border-accent/25' }
  return null
}

// ─── SprintBadge ─────────────────────────────────────────────────────────────

function SprintBadge({ sprint }: { sprint: SprintMin | null }) {
  if (!sprint) return null
  const isActive = sprint.status === 'in_corso'
  const overdue  = sprint.end_date && new Date(sprint.end_date) < new Date()
  return (
    <span className={`inline-flex items-center gap-1 text-2xs font-semibold px-2 py-0.5 rounded-full border ${
      isActive && overdue ? 'bg-error/10 text-error border-error/20' :
      isActive            ? 'bg-gold/10 text-gold-text border-gold/20' :
                            'bg-surface text-text-tertiary border-border'
    }`}>
      {isActive ? '⚡' : '○'} {sprint.name}
      {sprint.end_date && isActive && (
        <span className="opacity-70">
          · {new Date(sprint.end_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
        </span>
      )}
    </span>
  )
}

// ─── ProjectCard (grid) ───────────────────────────────────────────────────────

function ProjectCard({ proj, onSprint, onSync, onEdit, onDelete }: {
  proj: Project
  onSprint: () => void
  onSync: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const pct     = projectProgress(proj.tasks)
  const total   = proj.tasks.length
  const done    = proj.tasks.filter(t => t.status === 'completato').length
  const overdue = proj.tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completato').length
  const inProg  = proj.tasks.filter(t => t.status === 'in_corso').length
  const health  = projectHealthScore(proj.tasks)
  const sprint  = activeSprint(proj.sprints)
  const kind    = kindBadge(proj.project_kind)
  const typeMeta = TYPE_META[proj.project_type] ?? TYPE_META.custom

  return (
    <div className="bg-surface border border-border rounded-card p-5 hover:border-border transition-all group flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${STATUS_BADGE[proj.status]}`}>
              {STATUS_LABEL[proj.status]}
            </span>
            {total > 0 && (
              <span className={`text-2xs font-bold px-1.5 py-0.5 rounded border ${health.bg} ${health.color} ${health.border}`}>
                {health.label}
              </span>
            )}
            {kind && (
              <span className={`text-2xs font-bold px-1.5 py-0.5 rounded border ${kind.style}`}>
                {kind.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-base">{typeMeta.icon}</span>
            <h3 className="text-sm font-bold text-text-primary truncate">{proj.name}</h3>
          </div>
          <p className="text-xs text-text-secondary truncate">{proj.clients?.company_name ?? '—'}</p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
          <button onClick={onEdit} className="p-1.5 text-text-secondary hover:text-text-primary border border-border rounded-lg" title="Modifica progetto">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-text-secondary hover:text-error border border-border rounded-lg" title="Elimina progetto">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onSprint} className="p-1.5 text-text-secondary hover:text-gold-text border border-border rounded-lg" title="AI Sprint Planner">
            <Brain className="w-3.5 h-3.5" />
          </button>
          <button onClick={onSync} className="p-1.5 text-text-secondary hover:text-[#F06A35] border border-border rounded-lg" title="Sync da Asana">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-2xs mb-1">
          <span className="text-text-secondary">{done}/{total} task</span>
          <span className={`font-bold ${pct === 100 ? 'text-success' : 'text-text-primary'}`}>{pct}%</span>
        </div>
        <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-success' : pct > 50 ? 'bg-gold' : 'bg-warning'}`}
            style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 mb-3 min-h-[18px]">
        {inProg > 0 && (
          <span className="flex items-center gap-1 text-2xs text-warning">
            <Clock className="w-3 h-3" />{inProg} in corso
          </span>
        )}
        {overdue > 0 && (
          <span className="flex items-center gap-1 text-2xs text-error">
            <AlertCircle className="w-3 h-3" />{overdue} scadute
          </span>
        )}
        {done === total && total > 0 && (
          <span className="flex items-center gap-1 text-2xs text-success">
            <CheckCircle2 className="w-3 h-3" />Completato
          </span>
        )}
      </div>

      {/* Sprint */}
      <div className="mb-4 min-h-[22px]">
        <SprintBadge sprint={sprint} />
      </div>

      {/* Footer — CTA progetto */}
      <div className="mt-auto pt-3 border-t border-border flex items-center justify-between">
        <Link href={`/clienti/${proj.client_id}`}
          className="flex items-center gap-1 text-2xs text-text-secondary hover:text-text-primary transition-colors">
          <ExternalLink className="w-3 h-3" /> Cliente
        </Link>
        <Link href={`/clienti/${proj.client_id}/progetto/${proj.id}`}
          className="flex items-center gap-1.5 text-xs font-bold text-gold-text hover:text-gold-text transition-colors">
          Apri progetto →
        </Link>
      </div>
    </div>
  )
}

// ─── ProjectRow (list) ────────────────────────────────────────────────────────

function ProjectRow({ proj, onSprint, onSync, onEdit, onDelete }: {
  proj: Project
  onSprint: () => void
  onSync: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const pct     = projectProgress(proj.tasks)
  const total   = proj.tasks.length
  const done    = proj.tasks.filter(t => t.status === 'completato').length
  const overdue = proj.tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completato').length
  const health  = projectHealthScore(proj.tasks)
  const sprint  = activeSprint(proj.sprints)
  const kind    = kindBadge(proj.project_kind)
  const typeMeta = TYPE_META[proj.project_type] ?? TYPE_META.custom

  return (
    <div className="group flex items-center gap-4 px-4 py-3 bg-surface border border-border rounded-xl hover:border-border transition-all">
      {/* Type icon */}
      <span className="text-lg shrink-0">{typeMeta.icon}</span>

      {/* Name + client */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-text-primary truncate">{proj.name}</span>
          {kind && (
            <span className={`text-2xs font-bold px-1.5 py-0.5 rounded border ${kind.style}`}>{kind.label}</span>
          )}
          <span className={`text-2xs font-bold px-1.5 py-0.5 rounded ${STATUS_BADGE[proj.status]}`}>
            {STATUS_LABEL[proj.status]}
          </span>
        </div>
        <p className="text-2xs text-text-secondary">{proj.clients?.company_name ?? '—'}</p>
      </div>

      {/* Health */}
      {total > 0 && (
        <span className={`shrink-0 text-2xs font-bold px-2 py-1 rounded border hidden sm:inline ${health.bg} ${health.color} ${health.border}`}>
          {health.label} {health.score}
        </span>
      )}

      {/* Progress */}
      <div className="w-28 shrink-0 hidden md:block">
        <div className="flex items-center justify-between text-2xs mb-1">
          <span className="text-text-secondary">{done}/{total}</span>
          <span className="font-bold text-text-primary">{pct}%</span>
        </div>
        <div className="w-full h-1 bg-background rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${pct === 100 ? 'bg-success' : 'bg-gold'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Overdue */}
      {overdue > 0 && (
        <span className="shrink-0 text-2xs text-error flex items-center gap-0.5 hidden lg:flex">
          <AlertCircle className="w-3 h-3" />{overdue}
        </span>
      )}

      {/* Sprint */}
      <div className="shrink-0 hidden lg:block">
        <SprintBadge sprint={sprint} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-1.5 text-text-secondary hover:text-text-primary border border-border rounded-lg" title="Modifica">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-text-secondary hover:text-error border border-border rounded-lg" title="Elimina">
            <Trash2 className="w-3 h-3" />
          </button>
          <button onClick={onSprint} className="p-1.5 text-text-secondary hover:text-gold-text border border-border rounded-lg" title="AI Sprint Planner">
            <Brain className="w-3 h-3" />
          </button>
          <button onClick={onSync} className="p-1.5 text-text-secondary hover:text-[#F06A35] border border-border rounded-lg" title="Sync Asana">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        <Link href={`/clienti/${proj.client_id}/progetto/${proj.id}`}
          className="ml-1 flex items-center gap-1 text-xs font-bold text-gold-text hover:text-gold-text px-3 py-1.5 bg-gold/5 border border-gold/20 hover:border-gold/40 rounded-lg transition-all">
          Apri →
        </Link>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ProgettiClient({ projects: initialProjects, clients = [], profiles = [], isAdmin = false }: {
  projects: Project[]
  clients?: { id: string; company_name: string }[]
  profiles?: { id: string; full_name: string | null }[]
  isAdmin?: boolean
}) {
  const [projects, setProjects]       = useState(initialProjects)
  const [search, setSearch]           = useState('')
  const [filterStatus, setFilterStatus] = useState('tutti')
  const [filterKind, setFilterKind]   = useState('tutti')
  const [sortKey, setSortKey]         = useState<SortKey>('newest')
  const [viewMode, setViewMode]       = useState<ViewMode>('grid')
  const [syncProject, setSyncProject] = useState<Project | null>(null)
  const [sprintProject, setSprintProject] = useState<Project | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [deleteProject, setDeleteProject] = useState<Project | null>(null)

  const statuses = ['tutti', 'attivo', 'in_pausa', 'completato', 'archiviato']

  const filtered = projects
    .filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.clients?.company_name.toLowerCase().includes(search.toLowerCase())
      const matchStatus = filterStatus === 'tutti' || p.status === filterStatus
      const matchKind = filterKind === 'tutti' || p.project_kind === filterKind
      return matchSearch && matchStatus && matchKind
    })
    .sort((a, b) => {
      if (sortKey === 'alpha')        return a.name.localeCompare(b.name, 'it')
      if (sortKey === 'progress_desc') return projectProgress(b.tasks) - projectProgress(a.tasks)
      if (sortKey === 'overdue_desc') {
        const today = new Date()
        const od = (p: Project) => p.tasks.filter(t => t.due_date && new Date(t.due_date) < today && t.status !== 'completato').length
        return od(b) - od(a)
      }
      if (sortKey === 'health_asc')   return projectHealthScore(a.tasks).score - projectHealthScore(b.tasks).score
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const activeCount = projects.filter(p => p.status === 'attivo').length
  const criticalCount = projects.filter(p => projectHealthScore(p.tasks).label === 'Critico').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-black text-text-primary">Progetti</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-xs text-text-secondary">{activeCount} attivi · {projects.length} totali</p>
              {criticalCount > 0 && (
                <span className="flex items-center gap-1 text-2xs font-bold text-error">
                  <TrendingDown className="w-3 h-3" />{criticalCount} critici
                </span>
              )}
            </div>
          </div>
          <button onClick={() => setShowNewProject(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 transition-colors">
            <Plus className="w-4 h-4" /> Nuovo Progetto
          </button>
        </div>

        {/* Filters row */}
        <div className="flex gap-2 flex-wrap items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca progetto o cliente..."
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
          </div>

          {/* Status filter */}
          <div className="flex bg-surface border border-border rounded-lg p-0.5">
            {statuses.map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${filterStatus === s ? 'bg-gold text-on-gold font-bold' : 'text-text-secondary hover:text-text-primary'}`}>
                {s === 'tutti' ? 'Tutti' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {/* Kind filter */}
          <div className="flex bg-surface border border-border rounded-lg p-0.5">
            {['tutti', 'growth', 'digital', 'marketing', 'ai'].map(k => (
              <button key={k} onClick={() => setFilterKind(k)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${filterKind === k ? 'bg-gold text-on-gold font-bold' : 'text-text-secondary hover:text-text-primary'}`}>
                {k === 'tutti' ? 'Tutti' : k === 'growth' ? '🌱 Growth' : k === 'digital' ? '💻 Digital' : k === 'marketing' ? '📣 Marketing' : '🤖 AI'}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="relative">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg">
              <ArrowUpDown className="w-3.5 h-3.5 text-text-secondary" />
              <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
                className="bg-transparent text-xs text-text-primary focus:outline-none cursor-pointer pr-1">
                {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* View toggle */}
          <div className="flex bg-surface border border-border rounded-lg p-0.5">
            <button onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'}`}>
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'}`}>
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary">
            <FolderKanban className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">Nessun progetto trovato</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(proj => (
              <ProjectCard key={proj.id} proj={proj}
                onSprint={() => setSprintProject(proj)}
                onSync={() => setSyncProject(proj)}
                onEdit={() => setEditProject(proj)}
                onDelete={() => setDeleteProject(proj)} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(proj => (
              <ProjectRow key={proj.id} proj={proj}
                onSprint={() => setSprintProject(proj)}
                onSync={() => setSyncProject(proj)}
                onEdit={() => setEditProject(proj)}
                onDelete={() => setDeleteProject(proj)} />
            ))}
          </div>
        )}
      </div>

      {syncProject   && <AsanaSyncModal  project={syncProject}   onClose={() => setSyncProject(null)} />}
      {sprintProject && <SprintPlannerModal project={sprintProject} onClose={() => setSprintProject(null)} />}
      {/* Wizard unico (§6): sostituisce NewProgettoModal, che non chiedeva il
          servizio né collegava un accordo economico. */}
      <ProjectWizard
        open={showNewProject}
        onClose={() => setShowNewProject(false)}
        clients={clients}
        profiles={profiles}
        isAdmin={isAdmin}
      />
      {false && (
        <NewProgettoModal onClose={() => setShowNewProject(false)}
          onCreated={p => { setProjects(prev => [p, ...prev]); setShowNewProject(false) }} />
      )}
      {editProject && (
        <EditProgettoModal project={editProject} onClose={() => setEditProject(null)}
          onSaved={updated => {
            setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
            setEditProject(null)
          }} />
      )}
      {deleteProject && (
        <DeleteConfirmModal project={deleteProject} onClose={() => setDeleteProject(null)}
          onDeleted={id => {
            setProjects(prev => prev.filter(p => p.id !== id))
            setDeleteProject(null)
          }} />
      )}
    </div>
  )
}

// ─── EditProgettoModal ────────────────────────────────────────────────────────

function EditProgettoModal({ project, onClose, onSaved }: {
  project: Project
  onClose: () => void
  onSaved: (updated: Partial<Project> & { id: string }) => void
}) {
  const [clients, setClients] = useState<{ id: string; company_name: string }[]>([])
  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? '',
    status: project.status,
    client_id: project.client_id,
    project_type: project.project_type,
    project_kind: project.project_kind ?? '',
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    createClient().from('clients').select('id, company_name').order('company_name').then(({ data }) => setClients(data ?? []))
  }, [])

  const inp = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold'

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await createClient().from('projects').update({
      name: form.name,
      description: form.description || null,
      status: form.status as ProjectStatus,
      client_id: form.client_id,
      project_type: form.project_type,
      project_kind: form.project_kind || null,
    }).eq('id', project.id)
    setLoading(false)
    if (error) { toast.error('Errore: ' + error.message); return }
    toast.success('Progetto aggiornato')
    onSaved({ id: project.id, name: form.name, description: form.description || null,
      status: form.status as ProjectStatus, client_id: form.client_id,
      project_type: form.project_type, project_kind: form.project_kind || null })
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Modifica progetto</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary hover:text-text-primary" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Cliente *</label>
            <select required value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))} className={inp}>
              <option value="">Seleziona...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Nome *</label>
            <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Descrizione</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} className={`${inp} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Stato</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as ProjectStatus }))} className={inp}>
                <option value="attivo">Attivo</option>
                <option value="in_pausa">In pausa</option>
                <option value="completato">Completato</option>
                <option value="archiviato">Archiviato</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Tipo</label>
              <select value={form.project_type} onChange={e => setForm(p => ({ ...p, project_type: e.target.value }))} className={inp}>
                <option value="campagna">📣 Campagna</option>
                <option value="ecommerce">🛒 E-commerce</option>
                <option value="lead_gen">🎯 Lead Gen</option>
                <option value="app_ai">🤖 App AI</option>
                <option value="sito_web">🌐 Sito Web</option>
                <option value="custom">📁 Custom</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Kind</label>
            <div className="grid grid-cols-5 gap-1.5">
              {([
                { v: 'growth',    label: '🌱 Growth',    active: 'bg-gold/15 text-gold-text border-gold/40' },
                { v: 'marketing', label: '📣 Marketing',  active: 'bg-warning/15 text-warning border-warning/40' },
                { v: 'digital',   label: '💻 Digital',   active: 'bg-info/15 text-info border-info/40' },
                { v: 'ai',        label: '🤖 AI',        active: 'bg-accent/15 text-accent border-accent/40' },
                { v: '',          label: '— Nessuno',    active: 'bg-surface-active text-text-primary border-border' },
              ] as const).map(({ v, label, active }) => (
                <button key={v} type="button" onClick={() => setForm(p => ({ ...p, project_kind: v }))}
                  className={`py-2 rounded-lg border text-2xs font-bold transition-all ${
                    form.project_kind === v ? active : 'border-border text-text-secondary hover:border-border'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Annulla</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Salva
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

function DeleteConfirmModal({ project, onClose, onDeleted }: {
  project: Project
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const [loading, setLoading] = useState(false)

  const doDelete = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.from('tasks').delete().eq('project_id', project.id)
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    setLoading(false)
    if (error) { toast.error('Errore: ' + error.message); return }
    toast.success('Progetto eliminato')
    onDeleted(project.id)
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-error" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary">Elimina progetto</p>
            <p className="text-xs text-text-secondary mt-0.5">Questa azione è irreversibile</p>
          </div>
        </div>
        <p className="text-sm text-text-secondary mb-5">
          Stai per eliminare <span className="font-bold text-text-primary">{project.name}</span> e tutte le sue task. Continuare?
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Annulla</button>
          <button onClick={doDelete} disabled={loading}
            className="flex-1 py-2.5 bg-error text-text-primary font-bold rounded-lg text-sm hover:bg-error disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />} Elimina
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── SprintPlannerModal ───────────────────────────────────────────────────────

function SprintPlannerModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [result, setResult]   = useState<{ selected: { id: string; reason: string }[]; summary: string } | null>(null)
  const [error, setError]     = useState('')

  useEffect(() => {
    fetch('/api/ai/sprint-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, tasks: project.tasks }),
    }).then(r => r.json()).then(data => {
      if (data.error) { setError(data.error); setLoading(false); return }
      setResult(data); setLoading(false)
    }).catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  const taskMap = Object.fromEntries(project.tasks.map(t => [t.id, t]))

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Brain className="w-4 h-4 text-gold-text" /> AI Sprint Planner
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">Sprint {project.sprint_current + 1} · <span className="text-gold-text">{project.name}</span></p>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">✕</button>
        </div>
        <div className="p-6">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 text-gold-text animate-spin" />
              <p className="text-sm text-text-secondary">L&apos;AI sta analizzando i task...</p>
            </div>
          )}
          {error && <p className="text-sm text-error">{error}</p>}
          {result && (
            <div className="space-y-4">
              <div className="bg-gold/5 border border-gold/20 rounded-xl p-3">
                <p className="text-xs text-gold-text font-semibold mb-1">Sintesi sprint suggerito</p>
                <p className="text-sm text-text-primary">{result.summary}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-text-secondary uppercase tracking-wider font-semibold">Task selezionati ({result.selected.length})</p>
                {result.selected.map(item => {
                  const task = taskMap[item.id]
                  if (!task) return null
                  const pc: Record<string, string> = { alta: 'bg-error', media: 'bg-warning', bassa: 'bg-success' }
                  return (
                    <div key={item.id} className="flex items-start gap-3 p-3 bg-background border border-border rounded-lg">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${pc[task.priority] ?? 'bg-surface-active'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary font-medium truncate">{task.title}</p>
                        <p className="text-xs text-text-secondary">{item.reason}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <button onClick={onClose} className="w-full py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90">
                Capito, grazie!
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── AsanaSyncModal ───────────────────────────────────────────────────────────

function AsanaSyncModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [workspaces, setWorkspaces]             = useState<{ gid: string; name: string }[]>([])
  const [asanaProjects, setAsanaProjects]        = useState<{ gid: string; name: string }[]>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState('')
  const [selectedAsanaProject, setSelectedAsanaProject] = useState('')
  const [loading, setLoading]   = useState(false)
  const [loadingWs, setLoadingWs] = useState(true)
  const [result, setResult]     = useState<{ created: number; updated: number; total: number } | null>(null)

  useEffect(() => {
    fetch('/api/asana/workspaces').then(r => r.json()).then(({ workspaces: ws }) => {
      setWorkspaces(ws ?? [])
      if (ws?.length === 1) setSelectedWorkspace(ws[0].gid)
      setLoadingWs(false)
    })
  }, [])

  const loadProjects = async (wsGid: string) => {
    setSelectedWorkspace(wsGid)
    const r = await fetch(`/api/asana/projects?workspace=${wsGid}`)
    const { projects: ps } = await r.json()
    setAsanaProjects(ps ?? [])
  }

  const sync = async () => {
    if (!selectedAsanaProject) return
    setLoading(true)
    const r = await fetch('/api/asana/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectGid: selectedAsanaProject, localProjectId: project.id }),
    })
    const data = await r.json()
    setLoading(false)
    if (data.error) { toast.error(data.error); return }
    setResult(data)
    toast.success(`Sync completata: ${data.created} nuove, ${data.updated} aggiornate`)
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary">Sync da Asana</h2>
            <p className="text-xs text-text-secondary mt-0.5">Importa task in <span className="text-gold-text">{project.name}</span></p>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {loadingWs ? (
            <div className="flex items-center gap-2 text-text-secondary text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Caricamento workspace...
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Workspace Asana</label>
                <select value={selectedWorkspace} onChange={e => loadProjects(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                  <option value="">Seleziona...</option>
                  {workspaces.map(w => <option key={w.gid} value={w.gid}>{w.name}</option>)}
                </select>
              </div>
              {selectedWorkspace && (
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5">Progetto Asana</label>
                  <select value={selectedAsanaProject} onChange={e => setSelectedAsanaProject(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                    <option value="">Seleziona...</option>
                    {asanaProjects.map(p => <option key={p.gid} value={p.gid}>{p.name}</option>)}
                  </select>
                </div>
              )}
              {result && (
                <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-xs">
                  <p className="text-text-primary font-semibold">✓ Sync completata</p>
                  <p className="text-text-secondary mt-0.5">{result.total} task · {result.created} nuove · {result.updated} aggiornate</p>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="flex-1 py-2 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Chiudi</button>
                <button onClick={sync} disabled={!selectedAsanaProject || loading}
                  className="flex-1 py-2 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-1">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />} Sincronizza
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Template definitions ──────────────────────────────────────────────────────

type ProjectType = 'ecommerce' | 'lead_gen' | 'sito_web' | 'app_ai' | 'campagna' | 'custom'

type ProjectKind = 'growth' | 'digital'

interface ProjectTemplate {
  type: ProjectType
  kind: ProjectKind
  icon: string
  label: string
  desc: string
  color: string
  milestones: string[]
}

const TEMPLATES: ProjectTemplate[] = [
  {
    type: 'campagna', kind: 'growth', icon: '📣', label: 'Campagna Performance',
    color: 'border-warning/40 bg-warning/5',
    desc: 'Meta, Google Ads, marketing automation',
    milestones: ['Analisi & strategia', 'Setup account & tracking', 'Creatività & copy', 'Lancio campagne', 'Ottimizzazione settimanale', 'Report mensile'],
  },
  {
    type: 'ecommerce', kind: 'growth', icon: '🛒', label: 'E-commerce',
    color: 'border-orange/40 bg-orange/5',
    desc: 'Shop online, marketplace, integrazione pagamenti',
    milestones: ['Brief & strategia', 'Architettura & tech stack', 'Design UI/UX', 'Sviluppo frontend', 'Backend & integrazioni', 'SEO & performance', 'Go-Live', 'Post-launch & analytics'],
  },
  {
    type: 'lead_gen', kind: 'growth', icon: '🎯', label: 'Lead Generation',
    color: 'border-success/40 bg-success/5',
    desc: 'Funnel, landing page, CRM automation',
    milestones: ['Analisi target & buyer persona', 'Strategia funnel', 'Design landing page', 'Setup tracking & CRM', 'Attivazione campagne', 'Ottimizzazione CRO', 'Reporting'],
  },
  {
    type: 'app_ai', kind: 'digital', icon: '🤖', label: 'App AI / Custom',
    color: 'border-accent/40 bg-accent/5',
    desc: 'Applicativi AI, CRM custom, automazioni',
    milestones: ['Discovery & specifiche', 'Architettura & setup', 'Sviluppo core', 'Integrazioni AI/API', 'Testing & QA', 'Deploy & documentazione', 'Formazione'],
  },
  {
    type: 'sito_web', kind: 'digital', icon: '🌐', label: 'Sito Web / Landing',
    color: 'border-info/40 bg-info/5',
    desc: 'Siti corporate, landing page, portfolio',
    milestones: ['Brief & contenuti', 'Wireframe & design', 'Sviluppo', 'SEO tecnico', 'Revisioni cliente', 'Go-Live'],
  },
  {
    type: 'custom', kind: 'growth', icon: '📁', label: 'Personalizzato',
    color: 'border-border bg-transparent',
    desc: 'Progetto libero senza milestone predefinite',
    milestones: [],
  },
]

// ─── NewProgettoModal ─────────────────────────────────────────────────────────

function NewProgettoModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const [step, setStep]                   = useState<1 | 2>(1)
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null)
  const [clients, setClients]             = useState<{ id: string; company_name: string }[]>([])
  const [form, setForm]                   = useState({ name: '', description: '', status: 'attivo' as Project['status'], client_id: '' })
  const [loading, setLoading]             = useState(false)

  useEffect(() => {
    createClient().from('clients').select('id, company_name').order('company_name').then(({ data }) => setClients(data ?? []))
  }, [])

  const selectTemplate = (tpl: ProjectTemplate) => {
    setSelectedTemplate(tpl)
    if (!form.description && tpl.desc) setForm(p => ({ ...p, description: tpl.desc }))
    setStep(2)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTemplate) return
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('projects').insert({
      client_id: form.client_id, name: form.name, description: form.description || null,
      status: form.status, project_type: selectedTemplate.type,
      project_kind: selectedTemplate.kind, sprint_current: 1,
    }).select('*, clients(id, company_name, client_type, client_label, status), tasks(id, status, priority, due_date), sprints(id, name, status, end_date)').single()
    if (error) { toast.error('Errore: ' + error.message); setLoading(false); return }
    if (selectedTemplate.milestones.length > 0) {
      const today = new Date()
      await Promise.all(selectedTemplate.milestones.map((title, i) => {
        const due = new Date(today)
        due.setDate(due.getDate() + (i + 1) * 7)
        return supabase.from('tasks').insert({
          project_id: data.id, title, status: 'da_fare', priority: 'normale',
          is_milestone: true, position: i, due_date: due.toISOString().split('T')[0],
          tags: [], logged_hours: 0, depth: 0,
        })
      }))
    }
    setLoading(false)
    toast.success(`Progetto creato con ${selectedTemplate.milestones.length} milestone!`)
    onCreated(data as Project)
  }

  const inputCls = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold'

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button onClick={() => setStep(1)} className="text-text-secondary hover:text-text-primary transition-colors mr-1">←</button>
            )}
            <h2 className="text-base font-bold text-text-primary">
              {step === 1 ? 'Tipo di progetto' : `${selectedTemplate?.icon} ${selectedTemplate?.label}`}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xs text-text-tertiary">Step {step} di 2</span>
            <button onClick={onClose}><X className="w-5 h-5 text-text-secondary hover:text-text-primary" /></button>
          </div>
        </div>
        {step === 1 && (
          <div className="p-5 space-y-3">
            {(['growth', 'digital'] as ProjectKind[]).map(kind => (
              <div key={kind}>
                <p className={`text-2xs font-black uppercase tracking-widest mb-2 ${kind === 'growth' ? 'text-gold-text' : 'text-info'}`}>
                  {kind === 'growth' ? '📈 Growth' : '💻 Digital'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.filter(t => t.kind === kind).map(tpl => (
                    <button key={tpl.type} onClick={() => selectTemplate(tpl)}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all hover:border-gold/40 hover:bg-gold/5 group ${tpl.color}`}>
                      <span className="text-xl leading-none mt-0.5 shrink-0">{tpl.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-text-primary group-hover:text-gold-text transition-colors">{tpl.label}</p>
                        <p className="text-2xs text-text-secondary mt-0.5 leading-snug">{tpl.desc}</p>
                        {tpl.milestones.length > 0 && (
                          <p className="text-2xs text-text-tertiary mt-1">{tpl.milestones.length} milestone</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {step === 2 && selectedTemplate && (
          <form onSubmit={submit} className="p-6 space-y-4">
            {selectedTemplate.milestones.length > 0 && (
              <div className="bg-background border border-border rounded-xl px-4 py-3">
                <p className="text-2xs text-text-tertiary font-bold uppercase tracking-wider mb-2">Milestone che verranno create</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTemplate.milestones.map((m, i) => (
                    <span key={i} className="text-2xs bg-gold/10 text-gold-text border border-gold/20 px-2 py-0.5 rounded-full">{m}</span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs text-text-secondary mb-1">Cliente *</label>
              <select required value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))} className={inputCls}>
                <option value="">Seleziona cliente...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Nome progetto *</label>
              <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder={`es. ${selectedTemplate.label} — ${new Date().getFullYear()}`}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Descrizione</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2} className={`${inputCls} resize-none`} />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary">Annulla</button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : selectedTemplate.icon}
                {loading ? 'Creazione…' : 'Crea Progetto'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
