'use client'

import { useState, useMemo } from 'react'
import {
  CheckCircle2, Circle, Calendar, Flag, Plus, Loader2, ChevronDown, ChevronRight,
  List, LayoutGrid, GanttChartSquare, CalendarDays, BarChart3, Trash2, AlertTriangle,
  X, ExternalLink, Clock,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { formatDate, getInitials } from '@/lib/utils'
import type { Task, Profile } from '@/lib/types/database'

interface TaskWithMeta extends Task {
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  project: { id: string; name: string; client_id: string; clients: { company_name: string } | null } | null
}

type View = 'elenco' | 'bacheca' | 'timeline' | 'calendario' | 'analitica'
type Section = 'oggi' | 'prossimi' | 'dopo' | 'completati'
type TaskStatus = 'da_fare' | 'in_corso' | 'in_revisione' | 'completato'

const VIEWS: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: 'elenco',     label: 'Elenco',     icon: <List className="w-4 h-4" /> },
  { key: 'bacheca',    label: 'Bacheca',     icon: <LayoutGrid className="w-4 h-4" /> },
  { key: 'timeline',   label: 'Timeline',    icon: <GanttChartSquare className="w-4 h-4" /> },
  { key: 'calendario', label: 'Calendario',  icon: <CalendarDays className="w-4 h-4" /> },
  { key: 'analitica',  label: 'Analitica',   icon: <BarChart3 className="w-4 h-4" /> },
]

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  da_fare:       { label: 'Da fare',       color: 'text-[#888]' },
  in_corso:      { label: 'In corso',      color: 'text-blue-400' },
  in_revisione:  { label: 'In revisione',  color: 'text-purple-400' },
  completato:    { label: 'Completato',    color: 'text-green-400' },
}

const SECTION_META: Record<Section, { label: string; color: string; emptyMsg: string }> = {
  oggi:       { label: 'Oggi / Scadute',     color: 'text-error',           emptyMsg: 'Nessun task in scadenza oggi' },
  prossimi:   { label: 'Prossimi 7 giorni',  color: 'text-warning',         emptyMsg: 'Nessun task nei prossimi 7 giorni' },
  dopo:       { label: 'Più tardi',          color: 'text-text-secondary',  emptyMsg: 'Nessun task senza scadenza prossima' },
  completati: { label: 'Completati',         color: 'text-success',         emptyMsg: 'Nessun task completato' },
}

function categorizeTasks(tasks: TaskWithMeta[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7)
  const out: Record<Section, TaskWithMeta[]> = { oggi: [], prossimi: [], dopo: [], completati: [] }
  for (const t of tasks) {
    if (t.status === 'completato') { out.completati.push(t); continue }
    if (!t.due_date) { out.dopo.push(t); continue }
    const d = new Date(t.due_date); d.setHours(0, 0, 0, 0)
    if (d <= today) out.oggi.push(t)
    else if (d <= in7) out.prossimi.push(t)
    else out.dopo.push(t)
  }
  return out
}

function deadlineColor(due: string | null): string {
  if (!due) return ''
  const d = new Date(due); d.setHours(0, 0, 0, 0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return 'text-red-500 font-bold'
  if (diff <= 3) return 'text-red-400'
  if (diff <= 7) return 'text-orange-400'
  if (diff <= 15) return 'text-yellow-400'
  return 'text-green-400'
}

export function MieAttivitaClient({ tasks: initialTasks, profile, profiles }: {
  tasks: TaskWithMeta[]
  profile: Profile
  profiles: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
}) {
  const [tasks, setTasks] = useState(initialTasks)
  const [view, setView] = useState<View>('elenco')
  const [collapsed, setCollapsed] = useState<Record<Section, boolean>>({ oggi: false, prossimi: false, dopo: false, completati: true })
  const [addingIn, setAddingIn] = useState<Section | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<TaskWithMeta | null>(null)

  const sections = categorizeTasks(tasks)
  const active = tasks.filter(t => t.status !== 'completato')
  const done = tasks.filter(t => t.status === 'completato')

  const toggleStatus = async (task: TaskWithMeta) => {
    const ns = task.status === 'completato' ? 'da_fare' : 'completato'
    await createClient().from('tasks').update({ status: ns }).eq('id', task.id)
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: ns } : t))
    if (ns === 'completato') toast.success('Task completata!')
  }

  const updateStatus = async (id: string, ns: TaskStatus) => {
    await createClient().from('tasks').update({ status: ns }).eq('id', id)
    setTasks(p => p.map(t => t.id === id ? { ...t, status: ns } : t))
  }

  const addTask = async (section: Section) => {
    if (!newTitle.trim()) return
    setAdding(true)
    const dueDate = section === 'oggi' ? new Date().toISOString().slice(0, 10) : newDue || null
    const { data, error } = await createClient().from('tasks').insert({
      title: newTitle.trim(), assignee_id: profile.id, status: 'da_fare' as const,
      priority: 'media' as const, due_date: dueDate, project_id: null as unknown as string,
    }).select(`*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url), project:projects(id, name, client_id, clients(company_name))`).single()
    setAdding(false)
    if (error) { toast.error('Errore: ' + error.message); return }
    setTasks(p => [data as TaskWithMeta, ...p])
    setNewTitle(''); setNewDue(''); setAddingIn(null)
    toast.success('Task aggiunta!')
  }

  const requestDelete = async (task: TaskWithMeta) => {
    setDeleting(task.id)
    const sb = createClient()
    const { error } = await sb.from('approvals').insert({
      type: 'task_delete', title: `Eliminare task: ${task.title}`,
      description: `Richiesta eliminazione task "${task.title}" (progetto: ${task.project?.name ?? 'nessuno'})`,
      requested_by: profile.id, entity_type: 'task', entity_id: task.id,
      payload: { task_title: task.title, project_name: task.project?.name ?? null },
    })
    setDeleting(null)
    if (error) { toast.error('Errore richiesta: ' + error.message); return }
    toast.success('Richiesta di eliminazione inviata al supervisore')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-5 border-b border-[#2A2A2A] shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold font-bold">
              {getInitials(profile.full_name)}
            </div>
            <div>
              <h1 className="text-xl font-black text-white">Le mie attività</h1>
              <p className="text-xs text-text-secondary">{active.length} attive · {done.length} completate</p>
            </div>
          </div>
          <div className="flex bg-surface border border-[#2A2A2A] rounded-lg p-0.5">
            {VIEWS.map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  view === v.key ? 'bg-gold text-black' : 'text-text-secondary hover:text-white'
                }`}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        </div>
        {(active.length + done.length) > 0 && (
          <div className="w-full h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden mt-3">
            <div className="h-full bg-success rounded-full transition-all"
              style={{ width: `${Math.round((done.length / (active.length + done.length)) * 100)}%` }} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">
        <div className={`flex-1 overflow-hidden ${selectedTask ? 'hidden md:block' : ''}`}>
          {view === 'elenco' && <ElencoView tasks={tasks} sections={sections} collapsed={collapsed} setCollapsed={setCollapsed}
            addingIn={addingIn} setAddingIn={setAddingIn} newTitle={newTitle} setNewTitle={setNewTitle}
            newDue={newDue} setNewDue={setNewDue} adding={adding} addTask={addTask} toggleStatus={toggleStatus}
            requestDelete={requestDelete} deleting={deleting} onSelect={setSelectedTask} />}
          {view === 'bacheca' && <BachecaView tasks={tasks} updateStatus={updateStatus} />}
          {view === 'timeline' && <TimelineView tasks={active} />}
          {view === 'calendario' && <CalendarioView tasks={tasks} />}
          {view === 'analitica' && <AnaliticaView tasks={tasks} />}
        </div>

        {/* Detail panel */}
        {selectedTask && (
          <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} toggleStatus={toggleStatus} />
        )}
      </div>
    </div>
  )
}

/* ── ELENCO (enhanced original) ────────────────────── */
function ElencoView({ tasks, sections, collapsed, setCollapsed, addingIn, setAddingIn, newTitle, setNewTitle, newDue, setNewDue, adding, addTask, toggleStatus, requestDelete, deleting, onSelect }: {
  tasks: TaskWithMeta[]; sections: Record<Section, TaskWithMeta[]>
  collapsed: Record<Section, boolean>; setCollapsed: (fn: (p: Record<Section, boolean>) => Record<Section, boolean>) => void
  addingIn: Section | null; setAddingIn: (s: Section | null) => void
  newTitle: string; setNewTitle: (s: string) => void; newDue: string; setNewDue: (s: string) => void
  adding: boolean; addTask: (s: Section) => Promise<void>; toggleStatus: (t: TaskWithMeta) => Promise<void>
  requestDelete: (t: TaskWithMeta) => Promise<void>; deleting: string | null
  onSelect: (t: TaskWithMeta) => void
}) {
  const sectionEntries: [Section, TaskWithMeta[]][] = [
    ['oggi', sections.oggi], ['prossimi', sections.prossimi], ['dopo', sections.dopo], ['completati', sections.completati],
  ]
  return (
    <div className="h-full overflow-y-auto px-8 py-6 space-y-6">
      {sectionEntries.map(([key, list]) => {
        const meta = SECTION_META[key]
        return (
          <div key={key}>
            <button onClick={() => setCollapsed(p => ({ ...p, [key]: !p[key] }))} className="flex items-center gap-2 mb-3 group">
              {collapsed[key] ? <ChevronRight className="w-4 h-4 text-text-secondary" /> : <ChevronDown className="w-4 h-4 text-text-secondary" />}
              <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
              <span className="text-xs text-text-secondary bg-[#2A2A2A] px-1.5 py-0.5 rounded">{list.length}</span>
            </button>
            {!collapsed[key] && (
              <div className="space-y-px">
                {list.length === 0 ? (
                  <p className="text-xs text-text-secondary pl-6 py-2 italic">{meta.emptyMsg}</p>
                ) : list.map(task => (
                  <TaskRow key={task.id} task={task} toggleStatus={toggleStatus} requestDelete={requestDelete} deleting={deleting} onSelect={onSelect} />
                ))}
                {addingIn === key ? (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Circle className="w-5 h-5 text-text-secondary shrink-0" />
                    <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addTask(key); if (e.key === 'Escape') { setAddingIn(null); setNewTitle('') } }}
                      placeholder="Titolo task..." className="flex-1 bg-background border border-gold rounded px-2 py-1 text-sm text-white focus:outline-none" />
                    {key !== 'oggi' && (
                      <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
                        className="bg-background border border-[#2A2A2A] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-gold" />
                    )}
                    <button onClick={() => addTask(key)} disabled={adding}
                      className="px-3 py-1 bg-gold text-black text-xs font-bold rounded hover:bg-yellow-400 disabled:opacity-50 flex items-center gap-1">
                      {adding && <Loader2 className="w-3 h-3 animate-spin" />} Aggiungi
                    </button>
                    <button onClick={() => { setAddingIn(null); setNewTitle('') }} className="text-text-secondary hover:text-white text-xs">✕</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingIn(key)} className="flex items-center gap-2 px-3 py-2 text-text-secondary hover:text-gold text-xs transition-colors w-full">
                    <Plus className="w-4 h-4" /> Aggiungi task
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TaskRow({ task, toggleStatus, requestDelete, deleting, onSelect }: {
  task: TaskWithMeta; toggleStatus: (t: TaskWithMeta) => Promise<void>
  requestDelete: (t: TaskWithMeta) => Promise<void>; deleting: string | null
  onSelect: (t: TaskWithMeta) => void
}) {
  const completed = task.status === 'completato'
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] group transition-colors cursor-pointer"
      onClick={() => onSelect(task)}>
      <button onClick={e => { e.stopPropagation(); toggleStatus(task) }} className={`shrink-0 transition-colors ${completed ? 'text-success' : 'text-text-secondary hover:text-gold'}`}>
        {completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
      </button>
      <span className={`flex-1 text-sm ${completed ? 'line-through text-text-secondary' : 'text-white hover:text-gold transition-colors'}`}>{task.title}</span>
      {task.is_milestone && <Flag className="w-3.5 h-3.5 text-gold shrink-0" />}
      {task.project && (
        <span className="text-xs text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {task.project.clients?.company_name ?? task.project.name}
        </span>
      )}
      {task.due_date && (
        <div className={`flex items-center gap-1 text-xs shrink-0 ${deadlineColor(task.due_date)}`}>
          <Calendar className="w-3 h-3" />{formatDate(task.due_date)}
        </div>
      )}
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${task.priority === 'alta' ? 'bg-error' : task.priority === 'media' ? 'bg-warning' : 'bg-success'}`} />
      <button onClick={e => { e.stopPropagation(); requestDelete(task) }} disabled={deleting === task.id}
        className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-red-400 transition-all shrink-0">
        {deleting === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

/* ── TASK DETAIL PANEL ─────────────────────────────── */
function TaskDetailPanel({ task, onClose, toggleStatus }: {
  task: TaskWithMeta; onClose: () => void; toggleStatus: (t: TaskWithMeta) => Promise<void>
}) {
  const completed = task.status === 'completato'
  const priorityLabel = task.priority === 'alta' ? 'Alta' : task.priority === 'media' ? 'Media' : 'Bassa'
  const priorityColor = task.priority === 'alta' ? 'text-red-400 bg-red-400/10' : task.priority === 'media' ? 'text-yellow-400 bg-yellow-400/10' : 'text-green-400 bg-green-400/10'
  const statusLabel = STATUS_META[task.status as TaskStatus]

  return (
    <div className="w-80 lg:w-96 border-l border-white/[0.06] flex flex-col bg-[rgba(255,255,255,0.02)] shrink-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <h3 className="text-sm font-bold text-white truncate flex-1">Dettaglio Task</h3>
        <button onClick={onClose} className="p-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04]">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Title + status toggle */}
        <div>
          <h2 className="text-base font-bold text-white mb-3">{task.title}</h2>
          <button onClick={() => toggleStatus(task)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${completed ? 'bg-green-500/10 text-green-400' : 'bg-white/[0.04] text-white/60 hover:bg-gold/10 hover:text-gold'}`}>
            {completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
            {completed ? 'Completata' : 'Segna come completata'}
          </button>
        </div>

        {/* Info grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/30">Stato</span>
            <span className={`text-xs font-semibold ${statusLabel?.color ?? ''}`}>{statusLabel?.label ?? task.status}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/30">Priorità</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priorityColor}`}>{priorityLabel}</span>
          </div>
          {task.due_date && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/30">Scadenza</span>
              <span className={`flex items-center gap-1 text-xs font-semibold ${deadlineColor(task.due_date)}`}>
                <Clock className="w-3 h-3" /> {formatDate(task.due_date)}
              </span>
            </div>
          )}
          {task.assignee && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/30">Assegnata a</span>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-gold/20 flex items-center justify-center text-[9px] font-bold text-gold">
                  {getInitials(task.assignee.full_name)}
                </div>
                <span className="text-xs text-white/70">{task.assignee.full_name}</span>
              </div>
            </div>
          )}
          {task.is_milestone && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/30">Tipo</span>
              <span className="flex items-center gap-1 text-xs font-semibold text-gold"><Flag className="w-3 h-3" /> Milestone</span>
            </div>
          )}
        </div>

        {/* Project link */}
        {task.project && (
          <div className="glass rounded-xl p-4">
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Progetto</p>
            <p className="text-sm font-bold text-white mb-1">{task.project.name}</p>
            {task.project.clients && (
              <p className="text-xs text-white/40 mb-3">{task.project.clients.company_name}</p>
            )}
            <Link
              href={`/clienti/${task.project.client_id}/progetto/${task.project.id}`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all bg-gold/10 text-gold hover:bg-gold/20 border border-gold/20">
              <ExternalLink className="w-3.5 h-3.5" /> Apri pagina progetto
            </Link>
          </div>
        )}

        {task.description && (
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Descrizione</p>
            <p className="text-xs text-white/60 leading-relaxed">{task.description}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── BACHECA (kanban by status) ────────────────────── */
function BachecaView({ tasks, updateStatus }: { tasks: TaskWithMeta[]; updateStatus: (id: string, s: TaskStatus) => Promise<void> }) {
  const cols: TaskStatus[] = ['da_fare', 'in_corso', 'in_revisione', 'completato']
  const grouped = useMemo(() => {
    const m: Record<TaskStatus, TaskWithMeta[]> = { da_fare: [], in_corso: [], in_revisione: [], completato: [] }
    for (const t of tasks) m[t.status as TaskStatus]?.push(t)
    return m
  }, [tasks])

  return (
    <div className="h-full overflow-x-auto p-6">
      <div className="flex gap-4 min-w-max h-full">
        {cols.map(status => {
          const meta = STATUS_META[status]
          const list = grouped[status]
          return (
            <div key={status} className="w-72 flex flex-col bg-[#141414] border border-[#2A2A2A] rounded-xl">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2A2A2A]">
                <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
                <span className="text-xs text-[#555] bg-[#2A2A2A] px-1.5 py-0.5 rounded">{list.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {list.map(task => (
                  <div key={task.id} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-3 space-y-2 hover:border-gold/30 transition-colors">
                    <p className="text-sm text-white font-medium">{task.title}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {task.project && (
                        <span className="text-[10px] text-[#888] bg-[#2A2A2A] px-1.5 py-0.5 rounded">
                          {task.project.clients?.company_name ?? task.project.name}
                        </span>
                      )}
                      {task.due_date && (
                        <span className={`text-[10px] ${deadlineColor(task.due_date)}`}>{formatDate(task.due_date)}</span>
                      )}
                      {task.is_milestone && <Flag className="w-3 h-3 text-gold" />}
                    </div>
                    {status !== 'completato' && (
                      <div className="flex gap-1">
                        {cols.filter(s => s !== status).map(ns => (
                          <button key={ns} onClick={() => updateStatus(task.id, ns)}
                            className={`text-[9px] px-1.5 py-0.5 rounded ${STATUS_META[ns].color} bg-white/5 hover:bg-white/10 transition-colors`}>
                            → {STATUS_META[ns].label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── TIMELINE (Gantt semplificato) ────────────────────── */
function TimelineView({ tasks }: { tasks: TaskWithMeta[] }) {
  const withDate = tasks.filter(t => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))
  if (withDate.length === 0) return <div className="p-8 text-text-secondary text-sm">Nessun task con scadenza da visualizzare.</div>

  const now = new Date(); now.setHours(0, 0, 0, 0)
  const minDate = new Date(Math.min(now.getTime(), new Date(withDate[0].due_date!).getTime()))
  minDate.setDate(minDate.getDate() - 7)
  const maxDate = new Date(withDate[withDate.length - 1].due_date!)
  maxDate.setDate(maxDate.getDate() + 14)
  const rangeMs = maxDate.getTime() - minDate.getTime()
  const todayPct = ((now.getTime() - minDate.getTime()) / rangeMs) * 100

  const months: { label: string; left: number; width: number }[] = []
  const d = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
  while (d <= maxDate) {
    const mStart = Math.max(d.getTime(), minDate.getTime())
    const nextM = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const mEnd = Math.min(nextM.getTime(), maxDate.getTime())
    months.push({ label: d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }), left: ((mStart - minDate.getTime()) / rangeMs) * 100, width: ((mEnd - mStart) / rangeMs) * 100 })
    d.setMonth(d.getMonth() + 1)
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="relative min-w-[800px]">
        {/* Month headers */}
        <div className="flex h-8 mb-2 relative">
          {months.map((m, i) => (
            <div key={i} className="absolute text-[10px] font-bold text-[#555] uppercase border-l border-[#2A2A2A] pl-2"
              style={{ left: `${m.left}%`, width: `${m.width}%` }}>{m.label}</div>
          ))}
        </div>
        {/* Today line */}
        <div className="absolute top-8 bottom-0 w-px bg-gold/40 z-10" style={{ left: `${todayPct}%` }}>
          <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-gold" />
        </div>
        {/* Tasks */}
        <div className="space-y-1.5">
          {withDate.map(task => {
            const due = new Date(task.due_date!)
            const pct = ((due.getTime() - minDate.getTime()) / rangeMs) * 100
            const barW = Math.max(8, Math.min(20, pct * 0.15))
            return (
              <div key={task.id} className="relative h-8 flex items-center">
                <div className="absolute rounded-md h-6 flex items-center px-2 gap-1 border text-[10px] font-medium truncate max-w-[200px]"
                  style={{ left: `${Math.max(0, pct - barW)}%`, width: `${barW}%`,
                    background: task.status === 'completato' ? 'rgba(34,197,94,0.15)' : due < now ? 'rgba(239,68,68,0.15)' : 'rgba(245,200,0,0.1)',
                    borderColor: task.status === 'completato' ? 'rgba(34,197,94,0.3)' : due < now ? 'rgba(239,68,68,0.3)' : 'rgba(245,200,0,0.2)',
                    color: task.status === 'completato' ? '#22C55E' : due < now ? '#EF4444' : '#F5C800',
                  }}>
                  {task.is_milestone && <Flag className="w-2.5 h-2.5 shrink-0" />}
                  <span className="truncate">{task.title}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── CALENDARIO (mini cal con task) ────────────────────── */
function CalendarioView({ tasks }: { tasks: TaskWithMeta[] }) {
  const [month, setMonth] = useState(new Date())
  const y = month.getFullYear(); const m = month.getMonth()
  const firstDay = new Date(y, m, 1)
  const startDow = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const tasksByDay = useMemo(() => {
    const map: Record<string, TaskWithMeta[]> = {}
    for (const t of tasks) {
      if (!t.due_date) continue
      const key = t.due_date.slice(0, 10)
      ;(map[key] ??= []).push(t)
    }
    return map
  }, [tasks])

  const cells: (number | null)[] = Array.from({ length: startDow }, () => null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7) cells.push(null)

  const prevMonth = () => setMonth(new Date(y, m - 1, 1))
  const nextMonth = () => setMonth(new Date(y, m + 1, 1))
  const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center gap-4 mb-4">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[#2A2A2A] text-text-secondary hover:text-white"><ChevronRight className="w-4 h-4 rotate-180" /></button>
        <h2 className="text-lg font-bold text-white capitalize">{month.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</h2>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[#2A2A2A] text-text-secondary hover:text-white"><ChevronRight className="w-4 h-4" /></button>
        <button onClick={() => setMonth(new Date())} className="px-3 py-1 text-xs bg-[#2A2A2A] rounded-lg text-text-secondary hover:text-white">Oggi</button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-[#2A2A2A] rounded-xl overflow-hidden">
        {dayNames.map(d => (
          <div key={d} className="bg-[#1A1A1A] px-2 py-2 text-xs font-semibold text-text-secondary text-center">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="bg-[#111] min-h-[90px]" />
          const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayTasks = tasksByDay[dateStr] ?? []
          const isToday = new Date(y, m, day).getTime() === today.getTime()
          return (
            <div key={dateStr} className="bg-[#111] p-2 min-h-[90px]">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium mb-1 ${isToday ? 'bg-gold text-black' : 'text-white'}`}>{day}</div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map(t => (
                  <div key={t.id} className={`text-[10px] px-1.5 py-0.5 rounded truncate border ${
                    t.status === 'completato' ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : new Date(t.due_date!) < today ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-gold/10 text-gold border-gold/20'
                  }`}>{t.title}</div>
                ))}
                {dayTasks.length > 3 && <div className="text-[10px] text-[#555] px-1">+{dayTasks.length - 3}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── ANALITICA (dashboard stats) ────────────────────── */
function AnaliticaView({ tasks }: { tasks: TaskWithMeta[] }) {
  const active = tasks.filter(t => t.status !== 'completato')
  const completed = tasks.filter(t => t.status === 'completato')
  const overdue = active.filter(t => t.due_date && new Date(t.due_date) < new Date())
  const byStatus: Record<string, number> = {}
  const byPriority: Record<string, number> = {}
  const byProject: Record<string, { name: string; count: number; done: number }> = {}

  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1
    const pn = t.project?.clients?.company_name ?? t.project?.name ?? 'Senza progetto'
    const bp = byProject[pn] ??= { name: pn, count: 0, done: 0 }
    bp.count++
    if (t.status === 'completato') bp.done++
  }

  const statusColors: Record<string, string> = { da_fare: '#888', in_corso: '#3B82F6', in_revisione: '#A855F7', completato: '#22C55E' }
  const prioColors: Record<string, string> = { alta: '#EF4444', media: '#F59E0B', bassa: '#22C55E' }
  const projectList = Object.values(byProject).sort((a, b) => b.count - a.count).slice(0, 10)

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Totali', value: tasks.length, color: 'text-white' },
          { label: 'Attive', value: active.length, color: 'text-blue-400' },
          { label: 'Completate', value: completed.length, color: 'text-green-400' },
          { label: 'Scadute', value: overdue.length, color: overdue.length > 0 ? 'text-red-400' : 'text-green-400' },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
            <p className="text-[10px] text-[#555] uppercase font-bold tracking-wider">{k.label}</p>
            <p className={`text-2xl font-black mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* By Status */}
        <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
          <p className="text-[10px] text-[#555] uppercase font-bold tracking-wider mb-3">Per stato</p>
          <div className="space-y-2">
            {Object.entries(STATUS_META).map(([s, meta]) => {
              const cnt = byStatus[s] ?? 0
              const pct = tasks.length ? Math.round((cnt / tasks.length) * 100) : 0
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: statusColors[s] }} />
                  <span className="text-xs text-[#888] flex-1">{meta.label}</span>
                  <span className="text-xs text-white font-bold">{cnt}</span>
                  <div className="w-16 h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: statusColors[s] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* By Priority */}
        <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
          <p className="text-[10px] text-[#555] uppercase font-bold tracking-wider mb-3">Per priorità</p>
          <div className="space-y-2">
            {(['alta', 'media', 'bassa'] as const).map(p => {
              const cnt = byPriority[p] ?? 0
              const pct = tasks.length ? Math.round((cnt / tasks.length) * 100) : 0
              return (
                <div key={p} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: prioColors[p] }} />
                  <span className="text-xs text-[#888] flex-1 capitalize">{p}</span>
                  <span className="text-xs text-white font-bold">{cnt}</span>
                  <div className="w-16 h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: prioColors[p] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* By Project */}
        <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
          <p className="text-[10px] text-[#555] uppercase font-bold tracking-wider mb-3">Per progetto</p>
          <div className="space-y-2">
            {projectList.map(p => {
              const pct = p.count ? Math.round((p.done / p.count) * 100) : 0
              return (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="text-xs text-[#888] flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-white font-bold">{p.done}/{p.count}</span>
                  <div className="w-16 h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-bold text-red-400">{overdue.length} task scadute</span>
          </div>
          <div className="space-y-1">
            {overdue.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="text-red-400 font-medium">{formatDate(t.due_date!)}</span>
                <span className="text-white flex-1 truncate">{t.title}</span>
                <span className="text-[#555]">{t.project?.clients?.company_name ?? t.project?.name ?? ''}</span>
              </div>
            ))}
            {overdue.length > 5 && <p className="text-[10px] text-red-400/60">e altre {overdue.length - 5}…</p>}
          </div>
        </div>
      )}
    </div>
  )
}
