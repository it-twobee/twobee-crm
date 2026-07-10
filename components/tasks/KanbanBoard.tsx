'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, Calendar, Tag, Flag, X, UserPlus, Link2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SubtaskList } from './SubtaskList'
import { TaskComments } from './TaskComments'
import { TimeTracker } from './TimeTracker'
import { toast } from 'sonner'
import { getPriorityBadge, getInitials, formatDate } from '@/lib/utils'
import type { Task, Profile, Client, Sprint } from '@/lib/types/database'

interface TaskWithMeta extends Task {
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  project: { id: string; name: string; client_id: string; clients: { company_name: string } | null } | null
}

interface KanbanBoardProps {
  tasks: TaskWithMeta[]
  profiles: Profile[]
  clients: Client[]
}

const COLUMNS: { key: Task['status']; label: string; color: string }[] = [
  { key: 'da_fare', label: 'Da Fare', color: 'border-t-text-secondary' },
  { key: 'in_corso', label: 'In Corso', color: 'border-t-warning' },
  { key: 'in_revisione', label: 'In Revisione', color: 'border-t-gold' },
  { key: 'completato', label: 'Completato', color: 'border-t-success' },
]

const priorityDot: Record<string, string> = {
  alta: 'bg-error',
  media: 'bg-warning',
  bassa: 'bg-success',
}

// ── Inline card component with quick-assign popup ──────────────────────────
function KanbanCard({
  task,
  profiles,
  onDragStart,
  onClick,
  onAssign,
}: {
  task: TaskWithMeta
  profiles: Profile[]
  onDragStart: () => void
  onClick: () => void
  onAssign: (profileId: string | null) => void
}) {
  const [showAssign, setShowAssign] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showAssign) return
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowAssign(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAssign])

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-surface border border-border rounded-card p-4 cursor-grab active:cursor-grabbing hover:border-gold/30 transition-colors"
    >
      <div className="flex items-start gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${priorityDot[task.priority]}`} />
        <p className="text-sm font-semibold text-text-primary leading-snug">{task.title}</p>
      </div>

      {task.project?.clients?.company_name && (
        <p className="text-xs text-text-secondary mb-2 pl-4">{task.project.clients.company_name}</p>
      )}

      <div className="flex items-center justify-between pl-4">
        <div className="flex items-center gap-2">
          {task.due_date && (
            <span className="flex items-center gap-1 text-xs text-text-secondary">
              <Calendar className="w-3 h-3" />
              {formatDate(task.due_date)}
            </span>
          )}
        </div>

        {/* Assignee avatar / quick-assign button */}
        <div className="relative" ref={popupRef}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowAssign((v) => !v)
            }}
            title={task.assignee ? task.assignee.full_name : 'Assegna'}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold transition-colors ${
              task.assignee
                ? 'bg-gold/20 border border-gold/30 text-gold-text hover:bg-gold/30'
                : 'bg-surface-active border border-dashed border-border-strong text-text-secondary hover:border-gold/40 hover:text-gold-text'
            }`}
          >
            {task.assignee ? getInitials(task.assignee.full_name) : <UserPlus className="w-3 h-3" />}
          </button>

          {showAssign && (
            <div className="absolute bottom-8 right-0 z-50 bg-surface border border-border rounded-lg shadow-xl p-1 min-w-[160px]">
              <p className="text-2xs text-text-secondary px-2 py-1 uppercase tracking-wider">Assegna a</p>
              {task.assignee && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAssign(null); setShowAssign(false) }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-active text-xs text-text-secondary"
                >
                  <div className="w-5 h-5 rounded-full bg-surface-active flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </div>
                  Rimuovi assegnatario
                </button>
              )}
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={(e) => { e.stopPropagation(); onAssign(p.id); setShowAssign(false) }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-active text-xs ${
                    task.assignee?.id === p.id ? 'text-gold-text' : 'text-text-primary'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold ${
                    task.assignee?.id === p.id ? 'bg-gold/20 text-gold-text' : 'bg-surface-active text-text-primary'
                  }`}>
                    {getInitials(p.full_name)}
                  </div>
                  {p.full_name}
                  {task.assignee?.id === p.id && <span className="ml-auto text-gold-text">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DependenciesTab({ taskId, projectId }: { taskId: string; projectId: string }) {
  const [deps, setDeps] = useState<{ id: string; type: string; related: { id: string; title: string; status: string } }[]>([])
  const [projectTasks, setProjectTasks] = useState<{ id: string; title: string; status: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [selectedTask, setSelectedTask] = useState('')
  const [depType, setDepType] = useState<'blocking' | 'waiting_on'>('blocking')

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('task_dependencies').select('id, type, depends_on_id').eq('task_id', taskId),
      sb.from('tasks').select('id, title, status').eq('project_id', projectId).neq('id', taskId),
    ]).then(([depsRes, tasksRes]) => {
      const depIds = (depsRes.data ?? []).map((d) => d.depends_on_id)
      const taskLookup = Object.fromEntries((tasksRes.data ?? []).map((t) => [t.id, t]))
      setDeps(
        (depsRes.data ?? [])
          .filter((d) => taskLookup[d.depends_on_id])
          .map((d) => ({ id: d.id, type: d.type, related: taskLookup[d.depends_on_id] }))
      )
      setProjectTasks((tasksRes.data ?? []).filter((t) => !depIds.includes(t.id)))
      setLoading(false)
    })
  }, [taskId, projectId])

  const addDep = async () => {
    if (!selectedTask) return
    const sb = createClient()
    const { data, error } = await sb.from('task_dependencies')
      .insert({ task_id: taskId, depends_on_id: selectedTask, type: depType })
      .select('id, type, depends_on_id').single()
    if (error || !data) return
    const task = projectTasks.find((t) => t.id === selectedTask)
    if (!task) return
    setDeps((prev) => [...prev, { id: data.id, type: data.type, related: task }])
    setProjectTasks((prev) => prev.filter((t) => t.id !== selectedTask))
    setSelectedTask('')
    setAdding(false)
  }

  const removeDep = async (depId: string, relatedId: string) => {
    const sb = createClient()
    await sb.from('task_dependencies').delete().eq('id', depId)
    const removed = deps.find((d) => d.id === depId)
    if (removed) setProjectTasks((prev) => [...prev, { id: removed.related.id, title: removed.related.title, status: removed.related.status }])
    setDeps((prev) => prev.filter((d) => d.id !== depId))
  }

  const statusColor: Record<string, string> = {
    completato: 'text-success', in_corso: 'text-warning', in_revisione: 'text-gold-text', da_fare: 'text-text-secondary',
  }

  if (loading) return <div className="flex items-center gap-2 text-text-secondary text-sm py-4"><div className="w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin" /> Caricamento...</div>

  return (
    <div className="space-y-4">
      {deps.length === 0 && !adding && (
        <p className="text-sm text-text-secondary">Nessuna dipendenza impostata.</p>
      )}
      {deps.map((dep) => (
        <div key={dep.id} className="flex items-center gap-3 p-3 bg-background border border-border rounded-lg">
          <Link2 className="w-3.5 h-3.5 text-text-secondary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-secondary mb-0.5">{dep.type === 'blocking' ? 'Blocca' : 'Aspetta'}</p>
            <p className="text-sm text-text-primary truncate">{dep.related.title}</p>
            <p className={`text-xs ${statusColor[dep.related.status] ?? 'text-text-secondary'}`}>{dep.related.status.replace('_', ' ')}</p>
          </div>
          {dep.related.status !== 'completato' && dep.type === 'waiting_on' && (
            <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
          )}
          <button onClick={() => removeDep(dep.id, dep.related.id)} className="text-text-secondary hover:text-error shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="space-y-2 p-3 bg-background border border-border rounded-lg">
          <select value={depType} onChange={(e) => setDepType(e.target.value as 'blocking' | 'waiting_on')}
            className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold">
            <option value="blocking">Questo task blocca...</option>
            <option value="waiting_on">Questo task aspetta...</option>
          </select>
          <select value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold">
            <option value="">Seleziona task...</option>
            {projectTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 py-1.5 border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary">Annulla</button>
            <button onClick={addDep} disabled={!selectedTask} className="flex-1 py-1.5 bg-gold text-on-gold font-bold rounded-lg text-xs hover:bg-gold/90 disabled:opacity-50">Aggiungi</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-sm text-gold-text hover:underline">
          <Plus className="w-4 h-4" /> Aggiungi dipendenza
        </button>
      )}
    </div>
  )
}

function QuickAddBar({
  clients,
  onCreated,
  onClose,
}: {
  clients: { id: string; company_name: string }[]
  onCreated: (task: unknown) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [projectId, setProjectId] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const loadProjects = async (cId: string) => {
    setClientId(cId)
    setProjectId('')
    if (!cId) return
    const { data } = await createClient().from('projects').select('id, name').eq('client_id', cId).eq('status', 'attivo')
    setProjects(data ?? [])
  }

  const submit = async () => {
    if (!title.trim() || !projectId) return
    setSaving(true)
    const { data, error } = await createClient()
      .from('tasks')
      .insert({ title: title.trim(), project_id: projectId, status: 'da_fare', priority: 'media', tags: [], logged_hours: 0, depth: 0 })
      .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url), project:projects(id, name, client_id, clients(company_name))')
      .single()
    setSaving(false)
    if (!error && data) { onCreated(data); onClose() }
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-start justify-center pt-24 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-xl bg-surface border border-gold/30 rounded-xl shadow-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-gold-text font-bold uppercase tracking-wider">Quick Add</span>
          <span className="text-xs text-text-secondary">— Esc per chiudere</span>
        </div>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
          placeholder="Nome del task..."
          className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-base text-text-primary focus:outline-none focus:border-gold"
        />
        <div className="flex gap-2">
          <select value={clientId} onChange={(e) => loadProjects(e.target.value)}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
            <option value="">Cliente...</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!clientId}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold disabled:opacity-40">
            <option value="">Progetto...</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button onClick={submit} disabled={!title.trim() || !projectId || saving}
          className="w-full py-2 bg-gold text-on-gold font-bold rounded-lg text-sm hover:bg-gold/90 disabled:opacity-40 transition-colors">
          {saving ? 'Creazione...' : 'Crea Task → Da Fare'}
        </button>
      </div>
    </div>
  )
}

export function KanbanBoard({ tasks: initialTasks, profiles, clients }: KanbanBoardProps) {
  const [tasks, setTasks] = useState(initialTasks)
  const [filterClient, setFilterClient] = useState('tutti')
  const [filterAssignee, setFilterAssignee] = useState('tutti')
  const [filterPriority, setFilterPriority] = useState('tutti')
  const [showNewTask, setShowNewTask] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskWithMeta | null>(null)
  const dragging = useRef<string | null>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === '/' && !(e.target as HTMLElement).matches('input, textarea, select, [contenteditable]')) {
      e.preventDefault()
      setShowQuickAdd(true)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const filtered = tasks.filter((t) => {
    const matchClient = filterClient === 'tutti' || t.project?.client_id === filterClient
    const matchAssignee = filterAssignee === 'tutti' || t.assignee_id === filterAssignee
    const matchPriority = filterPriority === 'tutti' || t.priority === filterPriority
    return matchClient && matchAssignee && matchPriority
  })

  const byStatus = (status: Task['status']) => filtered.filter((t) => t.status === status)

  const handleDragStart = (taskId: string) => {
    dragging.current = taskId
  }

  const handleDrop = async (newStatus: Task['status']) => {
    const taskId = dragging.current
    if (!taskId) return

    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status === newStatus) return

    // Ottimistic update
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t))

    const supabase = createClient()
    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
    if (error) {
      toast.error('Errore nel salvataggio')
      setTasks(initialTasks)
    } else if (task.asana_gid) {
      fetch('/api/asana/task-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asana_gid: task.asana_gid, title: task.title, status: newStatus }),
      }).catch(() => {})
    }
    dragging.current = null
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-black text-text-primary">Task Board</h1>
            <p className="text-text-secondary text-sm mt-0.5">{filtered.length} task totali</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1 text-xs text-text-secondary border border-border rounded px-2 py-1">
              <kbd className="font-mono">/</kbd> Quick Add
            </span>
            <button
              onClick={() => setShowNewTask(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-gold text-on-gold rounded-lg hover:bg-gold/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nuova Task
            </button>
          </div>
        </div>

        {/* Filtri */}
        <div className="flex gap-3 flex-wrap">
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold"
          >
            <option value="tutti">Tutti i clienti</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
          </select>

          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold"
          >
            <option value="tutti">Tutti i membri</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold"
          >
            <option value="tutti">Tutte le priorità</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="bassa">Bassa</option>
          </select>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="flex-1 overflow-x-auto px-6 pb-6">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              className="w-72 flex flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(col.key)}
            >
              {/* Column header */}
              <div className={`bg-surface border border-border border-t-2 ${col.color} rounded-card px-4 py-3 mb-3 flex items-center justify-between`}>
                <span className="text-sm font-bold text-text-primary">{col.label}</span>
                <span className="text-xs bg-background text-text-secondary px-2 py-0.5 rounded-full">
                  {byStatus(col.key).length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 space-y-2 overflow-y-auto">
                {byStatus(col.key).map((task) => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    profiles={profiles}
                    onDragStart={() => handleDragStart(task.id)}
                    onClick={() => setSelectedTask(task)}
                    onAssign={(profileId) => {
                      setTasks((prev) => prev.map((t) =>
                        t.id === task.id
                          ? { ...t, assignee_id: profileId, assignee: profiles.find((p) => p.id === profileId) ?? null }
                          : t
                      ))
                      createClient().from('tasks').update({ assignee_id: profileId || null }).eq('id', task.id)
                    }}
                  />
                ))}

                {byStatus(col.key).length === 0 && (
                  <div className="h-20 border-2 border-dashed border-border rounded-card flex items-center justify-center text-xs text-text-secondary">
                    Trascina qui
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Task detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          profiles={profiles}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updated) => {
            setTasks((prev) => prev.map((t) => t.id === updated.id ? { ...t, ...updated } : t))
            setSelectedTask(null)
          }}
        />
      )}

      {/* New task modal */}
      {showNewTask && (
        <NewTaskModal
          clients={clients}
          profiles={profiles}
          onClose={() => setShowNewTask(false)}
          onCreated={(task) => {
            setTasks((prev) => [task as TaskWithMeta, ...prev])
            setShowNewTask(false)
          }}
        />
      )}

      {/* Quick Add overlay */}
      {showQuickAdd && (
        <QuickAddBar
          clients={clients}
          onCreated={(task) => setTasks((prev) => [task as TaskWithMeta, ...prev])}
          onClose={() => setShowQuickAdd(false)}
        />
      )}
    </div>
  )
}

const DETAIL_TABS = ['Dettagli', 'Subtask', 'Commenti', 'Ore', 'Dipendenze'] as const
type DetailTab = typeof DETAIL_TABS[number]

function TaskDetailPanel({
  task, profiles, onClose, onUpdate,
}: {
  task: TaskWithMeta
  profiles: Profile[]
  onClose: () => void
  onUpdate: (t: Partial<TaskWithMeta> & { id: string }) => void
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>('Dettagli')
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    status: task.status,
    due_date: task.due_date ?? '',
    assignee_id: task.assignee_id ?? '',
    estimated_hours: task.estimated_hours?.toString() ?? '',
    is_milestone: task.is_milestone ?? false,
    tags: (task.tags ?? []).join(', '),
  })
  const [saving, setSaving] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [tags, setTags] = useState<string[]>(task.tags ?? [])

  const save = async () => {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('tasks').update({
      title: form.title,
      description: form.description || null,
      priority: form.priority as Task['priority'],
      status: form.status as Task['status'],
      due_date: form.due_date || null,
      assignee_id: form.assignee_id || null,
      estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
      is_milestone: form.is_milestone,
      tags,
    }).eq('id', task.id)
    setSaving(false)
    if (error) { toast.error('Errore nel salvataggio'); return }
    toast.success('Task aggiornata')
    onUpdate({ id: task.id, ...form, tags } as unknown as Partial<TaskWithMeta> & { id: string })
  }

  const addTag = () => {
    const t = newTag.trim()
    if (!t || tags.includes(t)) return
    setTags((prev) => [...prev, t])
    setNewTag('')
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-end">
      <div className="w-full max-w-lg h-full bg-surface border-l border-border flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              {form.is_milestone && <Flag className="w-4 h-4 text-gold-text shrink-0" />}
              <span className="text-xs text-text-secondary">{task.project?.clients?.company_name} · {task.project?.name}</span>
            </div>
            <h2 className="text-base font-bold text-text-primary leading-snug">{form.title}</h2>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary shrink-0 mt-1">✕</button>
        </div>

        {/* Tab nav */}
        <div className="flex border-b border-border px-6 shrink-0">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-gold text-gold-text' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* TAB: Dettagli */}
          {activeTab === 'Dettagli' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Titolo</label>
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Descrizione</label>
                <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Priorità</label>
                  <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as typeof p.priority }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                    <option value="alta">🔴 Alta</option>
                    <option value="media">🟡 Media</option>
                    <option value="bassa">🟢 Bassa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Stato</label>
                  <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as typeof p.status }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                    <option value="da_fare">Da fare</option>
                    <option value="in_corso">In corso</option>
                    <option value="in_revisione">In revisione</option>
                    <option value="completato">Completato</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Deadline</label>
                  <input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Ore stimate</label>
                  <input type="number" min="0" step="0.5" value={form.estimated_hours}
                    onChange={(e) => setForm((p) => ({ ...p, estimated_hours: e.target.value }))}
                    placeholder="es. 8"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Assegnatario</label>
                <select value={form.assignee_id} onChange={(e) => setForm((p) => ({ ...p, assignee_id: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                  <option value="">— Nessuno —</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>

              {/* Milestone toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setForm((p) => ({ ...p, is_milestone: !p.is_milestone }))}
                  className={`w-9 h-5 rounded-full transition-colors ${form.is_milestone ? 'bg-gold' : 'bg-surface-active'} relative`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-surface transition-all ${form.is_milestone ? 'left-4' : 'left-0.5'}`} />
                </div>
                <Flag className="w-3.5 h-3.5 text-gold-text" />
                <span className="text-sm text-text-primary">Milestone</span>
              </label>

              {/* Tags */}
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Tag</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 text-xs bg-gold/10 text-gold-text border border-gold/30 px-2 py-0.5 rounded-full">
                      {tag}
                      <button onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}><X className="w-2.5 h-2.5" /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                    placeholder="Aggiungi tag..."
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold"
                  />
                  <button onClick={addTag} className="px-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-gold-text hover:border-gold transition-colors">
                    <Tag className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Subtask */}
          {activeTab === 'Subtask' && (
            <div>
              <p className="text-xs text-text-secondary mb-3">Gestisci le sottotask di questo task (max 2 livelli)</p>
              <SubtaskList parentTaskId={task.id} />
            </div>
          )}

          {/* TAB: Commenti */}
          {activeTab === 'Commenti' && (
            <TaskComments taskId={task.id} />
          )}

          {/* TAB: Ore */}
          {activeTab === 'Ore' && (
            <TimeTracker taskId={task.id} estimatedHours={task.estimated_hours ?? null} />
          )}

          {/* TAB: Dipendenze */}
          {activeTab === 'Dipendenze' && (
            <DependenciesTab taskId={task.id} projectId={task.project_id} />
          )}
        </div>

        {/* Footer save (solo tab Dettagli) */}
        {activeTab === 'Dettagli' && (
          <div className="px-6 py-4 border-t border-border flex gap-3 shrink-0">
            <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors">
              Annulla
            </button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50">
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function NewTaskModal({ clients, profiles, onClose, onCreated }: {
  clients: Client[]
  profiles: Profile[]
  onClose: () => void
  onCreated: (task: unknown) => void
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', priority: 'media', due_date: '',
    assignee_id: '', client_id: '', project_id: '',
  })
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])

  const loadProjects = async (clientId: string) => {
    if (!clientId) return
    const supabase = createClient()
    const { data } = await supabase.from('projects').select('id, name').eq('client_id', clientId)
    setProjects(data ?? [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.project_id) { toast.error('Inserisci titolo e progetto'); return }
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('tasks').insert({
      title: form.title,
      description: form.description || null,
      priority: form.priority as Task['priority'],
      status: 'da_fare',
      due_date: form.due_date || null,
      assignee_id: form.assignee_id || null,
      project_id: form.project_id,
    }).select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url), project:projects(id, name, client_id, clients(company_name))').single()
    setLoading(false)
    if (error) { toast.error('Errore nella creazione'); return }
    toast.success('Task creata!')
    onCreated(data)
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold">Nuova Task</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Titolo *</label>
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold"
              placeholder="Titolo della task..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Cliente *</label>
              <select value={form.client_id} onChange={(e) => { setForm((p) => ({ ...p, client_id: e.target.value, project_id: '' })); loadProjects(e.target.value) }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                <option value="">Seleziona cliente</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Progetto *</label>
              <select value={form.project_id} onChange={(e) => setForm((p) => ({ ...p, project_id: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                <option value="">Seleziona progetto</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Priorità</label>
              <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="bassa">Bassa</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Deadline</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Assegna a</label>
            <select value={form.assignee_id} onChange={(e) => setForm((p) => ({ ...p, assignee_id: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
              <option value="">— Nessuno —</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50">
              {loading ? 'Creazione...' : 'Crea Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
