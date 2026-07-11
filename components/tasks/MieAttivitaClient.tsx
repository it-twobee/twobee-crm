'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  CheckCircle2, Circle, Calendar, Flag, Plus, Loader2, ChevronDown, ChevronRight,
  List, LayoutGrid, GanttChartSquare, CalendarDays, BarChart3, Trash2, AlertTriangle,
  X, ExternalLink, Clock, UserPlus, CheckSquare, Square, Users,
  Pencil, Save, Link2, FileText, FolderKanban, Lock,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { createMyTask, deleteMyTask } from '@/app/actions/workspace-create'
import { usePortalRoutes } from '@/lib/portal-routes'
import { toast } from 'sonner'
import { formatDate, getInitials } from '@/lib/utils'
import type { Task, Profile } from '@/lib/types/database'
import { BachecaView } from './BachecaView'
import { TimelineView } from './TimelineView'
import { isTaskDone, isTaskActive, isPendingRequest } from '@/lib/task-status'
import { TaskDrawer } from './TaskDrawer'
import { RequestInbox } from './RequestInbox'

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
  da_fare:       { label: 'Da fare',       color: 'text-text-secondary' },
  in_corso:      { label: 'In corso',      color: 'text-info' },
  in_revisione:  { label: 'In revisione',  color: 'text-accent' },
  completato:    { label: 'Completato',    color: 'text-success' },
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
    if (isPendingRequest(t.status)) continue // richieste in arrivo: sezione dedicata, non nelle liste normali
    if (isTaskDone(t.status)) { out.completati.push(t); continue }
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
  if (diff < 0) return 'text-error font-bold'
  if (diff <= 3) return 'text-error'
  if (diff <= 7) return 'text-orange'
  if (diff <= 15) return 'text-gold-text'
  return 'text-success'
}

export function MieAttivitaClient({ tasks: initialTasks, profile, profiles, projects = [] }: {
  tasks: TaskWithMeta[]
  profile: Profile
  profiles: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
  projects?: { id: string; name: string; company_name: string | null }[]
}) {
  const [tasks, setTasks] = useState(initialTasks)
  const [view, setView] = useState<View>('elenco')
  const [collapsed, setCollapsed] = useState<Record<Section, boolean>>({ oggi: false, prossimi: false, dopo: false, completati: true })
  const [addingIn, setAddingIn] = useState<Section | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newProjectId, setNewProjectId] = useState('')
  const [newSprintId, setNewSprintId] = useState('')
  const [newMilestoneId, setNewMilestoneId] = useState('')
  const [projectSprints, setProjectSprints] = useState<{ id: string; name: string }[]>([])
  const [projectMilestones, setProjectMilestones] = useState<{ id: string; title: string }[]>([])

  // Quando scelgo un progetto, carico le sue sprint e milestone per collegarle.
  useEffect(() => {
    setNewSprintId(''); setNewMilestoneId('')
    if (!newProjectId) { setProjectSprints([]); setProjectMilestones([]); return }
    const sb = createClient()
    let alive = true
    Promise.all([
      sb.from('sprints').select('id, name').eq('project_id', newProjectId).order('start_date'),
      sb.from('tasks').select('id, title').eq('project_id', newProjectId).eq('is_milestone', true).order('position'),
    ]).then(([s, m]) => {
      if (!alive) return
      setProjectSprints((s.data ?? []) as { id: string; name: string }[])
      setProjectMilestones((m.data ?? []) as { id: string; title: string }[])
    })
    return () => { alive = false }
  }, [newProjectId])
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<TaskWithMeta | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const activeTasks = tasks.filter(t => isTaskActive(t.status))
    if (selectedIds.size === activeTasks.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(activeTasks.map(t => t.id)))
  }

  const bulkAssign = async (profileIds: string[]) => {
    if (selectedIds.size === 0 || profileIds.length === 0) return
    setAssigning(true)
    const sb = createClient()
    let count = 0
    for (const taskId of Array.from(selectedIds)) {
      for (const profileId of profileIds) {
        const { error } = await sb.from('task_assignees').upsert(
          { task_id: taskId, profile_id: profileId, role: 'collaborator', assigned_by: profile.id },
          { onConflict: 'task_id,profile_id' }
        )
        if (!error) count++
      }
    }
    setAssigning(false)
    setShowAssignModal(false)
    setSelectedIds(new Set())
    toast.success(`${count} assegnazioni create per ${selectedIds.size} task`)
  }

  const sections = categorizeTasks(tasks)
  const pendingRequests = tasks.filter(t => isPendingRequest(t.status))
  const active = tasks.filter(t => isTaskActive(t.status))
  const done = tasks.filter(t => isTaskDone(t.status))

  const toggleStatus = async (task: TaskWithMeta) => {
    const ns = isTaskDone(task.status) ? 'da_fare' : 'completato'
    await createClient().from('tasks').update({ status: ns }).eq('id', task.id)
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: ns } : t))
    if (ns === 'completato') toast.success('Task completata!')
  }

  const updateStatus = async (id: string, ns: TaskStatus) => {
    const { error } = await createClient().from('tasks').update({ status: ns }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setTasks(p => p.map(t => t.id === id ? { ...t, status: ns } : t))
    if (selectedTask?.id === id) setSelectedTask(prev => prev ? { ...prev, status: ns } : null)
    toast.success(`Stato → ${STATUS_META[ns].label}`)
  }


  const addTask = async (section: Section) => {
    if (!newTitle.trim()) return
    setAdding(true)
    const dueDate = section === 'oggi' ? new Date().toISOString().slice(0, 10) : newDue || null
    // Server action: funziona per ogni membro (self-assign). Senza progetto la
    // task è personale/privata; con progetto è condivisa sul board di progetto.
    const r = await createMyTask({
      title: newTitle.trim(),
      projectId: newProjectId || null,
      sprintId: newSprintId || null,
      milestoneId: newMilestoneId || null,
      dueDate: dueDate ?? undefined,
    })
    setAdding(false)
    if (!r.ok) { toast.error('Errore: ' + (r.error ?? '')); return }
    setTasks(p => [r.task as TaskWithMeta, ...p])
    setNewTitle(''); setNewDue(''); setNewProjectId(''); setNewSprintId(''); setNewMilestoneId(''); setAddingIn(null)
    toast.success(newProjectId ? 'Task creata sul progetto!' : 'Task privata creata!')
  }

  const requestDelete = async (task: TaskWithMeta) => {
    setDeleting(task.id)
    // Task personale (senza progetto): eliminazione diretta dal proprietario.
    // Ci si basa su project_id, non sul join `project` (che la RLS può azzerare).
    if (!task.project_id) {
      const r = await deleteMyTask(task.id)
      setDeleting(null)
      if (!r.ok) { toast.error('Errore: ' + (r.error ?? '')); return }
      setTasks(p => p.filter(t => t.id !== task.id))
      if (selectedTask?.id === task.id) setSelectedTask(null)
      toast.success('Task eliminata')
      return
    }
    // Task di progetto: resta soggetta ad approvazione del supervisore.
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
      <div className="px-8 py-5 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold-text font-bold">
              {getInitials(profile.full_name)}
            </div>
            <div>
              <h1 className="text-xl font-black text-text-primary">Le mie attività</h1>
              <p className="text-xs text-text-secondary">{active.length} attive · {done.length} completate</p>
            </div>
          </div>
          <div className="flex bg-surface border border-border rounded-lg p-0.5">
            {VIEWS.map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  view === v.key ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'
                }`}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
        </div>
        {(active.length + done.length) > 0 && (
          <div className="w-full h-1.5 bg-surface-active rounded-full overflow-hidden mt-3">
            <div className="h-full bg-success rounded-full transition-all"
              style={{ width: `${Math.round((done.length / (active.length + done.length)) * 100)}%` }} />
          </div>
        )}

        {/* Selection toolbar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mt-3 px-4 py-2.5 bg-gold/10 border border-gold/20 rounded-xl">
            <button onClick={() => setSelectedIds(new Set())} className="p-1 text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
            <span className="text-sm font-bold text-gold-text">{selectedIds.size} task selezionate</span>
            <div className="flex-1" />
            <button onClick={selectAll} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors">
              <CheckSquare className="w-3.5 h-3.5" /> {selectedIds.size === active.length ? 'Deseleziona tutto' : 'Seleziona tutto'}
            </button>
            <button onClick={() => setShowAssignModal(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-gold text-on-gold rounded-lg text-xs font-bold hover:bg-gold/90 transition-colors">
              <UserPlus className="w-3.5 h-3.5" /> Assegna a...
            </button>
          </div>
        )}
      </div>

      {/* Richieste in arrivo (Fase 1d) */}
      {pendingRequests.length > 0 && (
        <div className="px-6 pt-4">
          <RequestInbox
            requests={pendingRequests.map(t => ({ id: t.id, title: t.title, description: t.description, due_date: t.due_date, project: t.project ? { name: t.project.name } : null }))}
            onResolved={(id, accepted) => setTasks(prev => accepted
              ? prev.map(t => t.id === id ? { ...t, status: 'da_fare' as TaskStatus } : t)
              : prev.filter(t => t.id !== id))}
          />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">
        <div className={`flex-1 overflow-hidden ${selectedTask ? 'hidden md:block' : ''}`}>
          {view === 'elenco' && <ElencoView tasks={tasks} sections={sections} collapsed={collapsed} setCollapsed={setCollapsed}
            addingIn={addingIn} setAddingIn={setAddingIn} newTitle={newTitle} setNewTitle={setNewTitle}
            newDue={newDue} setNewDue={setNewDue} adding={adding} addTask={addTask} toggleStatus={toggleStatus}
            requestDelete={requestDelete} deleting={deleting} onSelect={setSelectedTask}
            selectedIds={selectedIds} toggleSelect={toggleSelect}
            projects={projects} newProjectId={newProjectId} setNewProjectId={setNewProjectId}
            sprints={projectSprints} milestones={projectMilestones}
            newSprintId={newSprintId} setNewSprintId={setNewSprintId}
            newMilestoneId={newMilestoneId} setNewMilestoneId={setNewMilestoneId} />}
          {view === 'bacheca' && <BachecaView tasks={tasks} updateStatus={updateStatus} onSelect={setSelectedTask} />}
          {view === 'timeline' && <TimelineView tasks={active} onSelect={setSelectedTask} />}
          {view === 'calendario' && <CalendarioView tasks={tasks} onSelect={setSelectedTask} />}
          {view === 'analitica' && <AnaliticaView tasks={tasks} />}
        </div>

        {/* Detail panel — drawer condiviso (Fase 1b) */}
        {selectedTask && (
          <TaskDrawer
            task={selectedTask}
            profiles={profiles}
            onClose={() => setSelectedTask(null)}
            onPatched={(p) => {
              setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, ...p } : t))
              setSelectedTask(prev => prev ? { ...prev, ...p } : null)
            }}
          />
        )}
      </div>

      {/* Assign modal */}
      {showAssignModal && (
        <AssignModal
          profiles={profiles}
          taskCount={selectedIds.size}
          assigning={assigning}
          onAssign={bulkAssign}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </div>
  )
}

/* ── ELENCO (enhanced original) ────────────────────── */
function ElencoView({ tasks, sections, collapsed, setCollapsed, addingIn, setAddingIn, newTitle, setNewTitle, newDue, setNewDue, adding, addTask, toggleStatus, requestDelete, deleting, onSelect, selectedIds, toggleSelect, projects, newProjectId, setNewProjectId, sprints, milestones, newSprintId, setNewSprintId, newMilestoneId, setNewMilestoneId }: {
  tasks: TaskWithMeta[]; sections: Record<Section, TaskWithMeta[]>
  collapsed: Record<Section, boolean>; setCollapsed: (fn: (p: Record<Section, boolean>) => Record<Section, boolean>) => void
  addingIn: Section | null; setAddingIn: (s: Section | null) => void
  newTitle: string; setNewTitle: (s: string) => void; newDue: string; setNewDue: (s: string) => void
  adding: boolean; addTask: (s: Section) => Promise<void>; toggleStatus: (t: TaskWithMeta) => Promise<void>
  requestDelete: (t: TaskWithMeta) => Promise<void>; deleting: string | null
  onSelect: (t: TaskWithMeta) => void
  selectedIds: Set<string>; toggleSelect: (id: string) => void
  projects: { id: string; name: string; company_name: string | null }[]
  newProjectId: string; setNewProjectId: (s: string) => void
  sprints: { id: string; name: string }[]; milestones: { id: string; title: string }[]
  newSprintId: string; setNewSprintId: (s: string) => void
  newMilestoneId: string; setNewMilestoneId: (s: string) => void
}) {
  const sectionEntries: [Section, TaskWithMeta[]][] = [
    ['oggi', sections.oggi], ['prossimi', sections.prossimi], ['dopo', sections.dopo], ['completati', sections.completati],
  ]
  // §7.1: i conteggi private/operative escludono le completate (solo task attive).
  const activeForCount = tasks.filter(t => isTaskActive(t.status))
  const privateCount = activeForCount.filter(t => !t.project).length
  const operativeCount = activeForCount.length - privateCount
  return (
    <div className="h-full overflow-y-auto px-8 py-6 space-y-6">
      {/* Legenda: come distinguere le due nature delle task */}
      <div className="flex items-center gap-4 text-2xs text-text-tertiary">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-3 rounded-sm border-l-2 border-l-accent bg-accent-dim" aria-hidden="true" />
          <Lock className="w-3 h-3 text-accent" /> Private <span className="text-text-secondary font-semibold">{privateCount}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-3 rounded-sm border-l-2 border-l-gold bg-gold-dim" aria-hidden="true" />
          <FolderKanban className="w-3 h-3 text-gold-text" /> Operative <span className="text-text-secondary font-semibold">{operativeCount}</span>
        </span>
      </div>
      {sectionEntries.map(([key, list]) => {
        const meta = SECTION_META[key]
        return (
          <div key={key}>
            <button onClick={() => setCollapsed(p => ({ ...p, [key]: !p[key] }))} className="flex items-center gap-2 mb-3 group">
              {collapsed[key] ? <ChevronRight className="w-4 h-4 text-text-secondary" /> : <ChevronDown className="w-4 h-4 text-text-secondary" />}
              <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
              <span className="text-xs text-text-secondary bg-surface-active px-1.5 py-0.5 rounded">{list.length}</span>
            </button>
            {!collapsed[key] && (
              <div className="space-y-1.5">
                {list.length === 0 ? (
                  <p className="text-xs text-text-tertiary pl-3 py-2 italic">{meta.emptyMsg}</p>
                ) : list.map(task => (
                  <TaskRow key={task.id} task={task} toggleStatus={toggleStatus} requestDelete={requestDelete} deleting={deleting} onSelect={onSelect}
                    isSelected={selectedIds.has(task.id)} toggleSelect={toggleSelect} />
                ))}
                {addingIn === key ? (
                  <div className={`rounded-lg border-l-2 bg-surface p-3 space-y-2.5 ${newProjectId ? 'border-l-gold' : 'border-l-accent'} shadow-sm ring-1 ring-inset ring-border`}>
                    {/* Riga 1 — titolo + azioni */}
                    <div className="flex items-center gap-2">
                      <Circle className="w-5 h-5 text-text-tertiary shrink-0" />
                      <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addTask(key); if (e.key === 'Escape') { setAddingIn(null); setNewTitle('') } }}
                        placeholder="Cosa c'è da fare?" className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none" />
                      <button onClick={() => addTask(key)} disabled={adding || !newTitle.trim()}
                        className="px-3 py-1.5 bg-gold text-on-gold text-xs font-bold rounded-lg hover:bg-gold/90 disabled:opacity-40 flex items-center gap-1.5 transition-colors">
                        {adding && <Loader2 className="w-3 h-3 animate-spin" />} Aggiungi
                      </button>
                      <button onClick={() => { setAddingIn(null); setNewTitle(''); setNewProjectId('') }} aria-label="Annulla"
                        className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"><X className="w-4 h-4" /></button>
                    </div>
                    {/* Riga 2 — collegamenti e scadenza */}
                    <div className="flex flex-wrap items-center gap-2 pl-7">
                      <div className={`flex items-center gap-1.5 pr-1 rounded-lg ${newProjectId ? '' : 'text-accent'}`}>
                        {newProjectId ? <FolderKanban className="w-3.5 h-3.5 text-gold-text" /> : <Lock className="w-3.5 h-3.5 text-accent" />}
                        <select value={newProjectId} onChange={e => setNewProjectId(e.target.value)}
                          title="Collega a un progetto cliente, oppure lascia privata"
                          className="bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold max-w-[220px]">
                          <option value="">Privata · solo per te</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.company_name ? `${p.company_name} — ${p.name}` : p.name}</option>
                          ))}
                        </select>
                      </div>
                      {newProjectId && (
                        <select value={newSprintId} onChange={e => setNewSprintId(e.target.value)} title="Sprint"
                          className="bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold max-w-[150px]">
                          <option value="">Sprint —</option>
                          {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                      {newProjectId && (
                        <select value={newMilestoneId} onChange={e => setNewMilestoneId(e.target.value)} title="Milestone"
                          className="bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold max-w-[150px]">
                          <option value="">Milestone —</option>
                          {milestones.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                        </select>
                      )}
                      {key !== 'oggi' && (
                        <div className="flex items-center gap-1.5 text-text-tertiary">
                          <Calendar className="w-3.5 h-3.5" />
                          <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
                            className="bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold" />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingIn(key)}
                    className="flex items-center gap-2 px-3 py-2 text-text-tertiary hover:text-gold-text text-xs font-medium transition-colors w-full rounded-lg hover:bg-surface-hover">
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

function TaskRow({ task, toggleStatus, requestDelete, deleting, onSelect, isSelected, toggleSelect }: {
  task: TaskWithMeta; toggleStatus: (t: TaskWithMeta) => Promise<void>
  requestDelete: (t: TaskWithMeta) => Promise<void>; deleting: string | null
  onSelect: (t: TaskWithMeta) => void
  isSelected: boolean; toggleSelect: (id: string) => void
}) {
  const completed = isTaskDone(task.status)
  const isPrivate = !task.project_id
  // Rail sinistro: viola per le task private, oro per quelle operative (di progetto).
  // Il colore non è l'unico segnale: c'è anche l'icona/badge, per l'accessibilità.
  const rail = isPrivate ? 'border-l-accent' : 'border-l-gold'
  return (
    <div className={`flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-lg border-l-2 ${rail} hover:bg-surface-hover group transition-colors cursor-pointer ${
        isSelected ? 'bg-gold/[0.06] ring-1 ring-inset ring-gold/25' : 'bg-surface'}`}
      onClick={() => onSelect(task)}>
      <button onClick={e => { e.stopPropagation(); toggleSelect(task.id) }} aria-label="Seleziona"
        className={`shrink-0 transition-colors ${isSelected ? 'text-gold-text' : 'text-transparent group-hover:text-text-tertiary hover:!text-gold-text'}`}>
        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
      </button>
      <button onClick={e => { e.stopPropagation(); toggleStatus(task) }} aria-label="Completa"
        className={`shrink-0 transition-colors ${completed ? 'text-success' : 'text-text-secondary hover:text-gold-text'}`}>
        {completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
      </button>
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${completed ? 'line-through text-text-secondary' : 'text-text-primary group-hover:text-gold-text transition-colors'}`}>{task.title}</span>
        <div className="flex items-center gap-1.5 mt-1">
          {isPrivate ? (
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-accent bg-accent-dim px-1.5 py-0.5 rounded-full">
              <Lock className="w-2.5 h-2.5" /> Privata
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-gold-text bg-gold-dim px-1.5 py-0.5 rounded-full max-w-[220px]">
              <FolderKanban className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">
                {task.project
                  ? (task.project.clients ? `${task.project.clients.company_name} · ${task.project.name}` : task.project.name)
                  : 'Progetto'}
              </span>
            </span>
          )}
          {task.is_milestone && (
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-warning bg-warning-dim px-1.5 py-0.5 rounded-full">
              <Flag className="w-2.5 h-2.5" /> Milestone
            </span>
          )}
        </div>
      </div>
      {task.description && <FileText className="w-3.5 h-3.5 text-text-tertiary shrink-0" aria-label="Ha una descrizione" />}
      {(task.links?.length ?? 0) > 0 && <Link2 className="w-3.5 h-3.5 text-info shrink-0" aria-label="Ha dei link" />}
      {task.due_date && (
        <div className={`flex items-center gap-1 text-xs shrink-0 ${deadlineColor(task.due_date)}`}>
          <Calendar className="w-3 h-3" />{formatDate(task.due_date)}
        </div>
      )}
      <span title={`Priorità ${task.priority ?? 'media'}`}
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${task.priority === 'alta' ? 'bg-error' : task.priority === 'media' ? 'bg-warning' : 'bg-success'}`} />
      <button onClick={e => { e.stopPropagation(); requestDelete(task) }} disabled={deleting === task.id}
        aria-label={isPrivate ? 'Elimina task' : 'Richiedi eliminazione'}
        className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-error transition-all shrink-0">
        {deleting === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}


/* ── CALENDARIO (mini cal con task) ────────────────────── */
function CalendarioView({ tasks, onSelect }: { tasks: TaskWithMeta[]; onSelect: (t: TaskWithMeta) => void }) {
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
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-surface-active text-text-secondary hover:text-text-primary"><ChevronRight className="w-4 h-4 rotate-180" /></button>
        <h2 className="text-lg font-bold text-text-primary capitalize">{month.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</h2>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-surface-active text-text-secondary hover:text-text-primary"><ChevronRight className="w-4 h-4" /></button>
        <button onClick={() => setMonth(new Date())} className="px-3 py-1 text-xs bg-surface-active rounded-lg text-text-secondary hover:text-text-primary">Oggi</button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-surface-active rounded-xl overflow-hidden">
        {dayNames.map(d => (
          <div key={d} className="bg-surface px-2 py-2 text-xs font-semibold text-text-secondary text-center">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="bg-background min-h-[90px]" />
          const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayTasks = tasksByDay[dateStr] ?? []
          const isToday = new Date(y, m, day).getTime() === today.getTime()
          return (
            <div key={dateStr} className="bg-background p-2 min-h-[90px]">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium mb-1 ${isToday ? 'bg-gold text-on-gold' : 'text-text-primary'}`}>{day}</div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map(t => (
                  <div key={t.id} onClick={() => onSelect(t)} className={`text-2xs px-1.5 py-0.5 rounded truncate border cursor-pointer hover:opacity-80 transition-opacity ${
                    isTaskDone(t.status) ? 'bg-success/10 text-success border-success/20'
                    : new Date(t.due_date!) < today ? 'bg-error/10 text-error border-error/20'
                    : 'bg-gold/10 text-gold-text border-gold/20'
                  }`} title={t.project ? `${t.title} — ${t.project.name}` : t.title}>{t.title}</div>
                ))}
                {dayTasks.length > 3 && <div className="text-2xs text-text-tertiary px-1">+{dayTasks.length - 3}</div>}
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
  const active = tasks.filter(t => isTaskActive(t.status))
  const completed = tasks.filter(t => isTaskDone(t.status))
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
    if (isTaskDone(t.status)) bp.done++
  }

  const statusColors: Record<string, string> = { da_fare: '#888', in_corso: 'var(--color-info)', in_revisione: 'var(--color-accent)', completato: 'var(--color-success)' }
  const prioColors: Record<string, string> = { alta: 'var(--color-error)', media: 'var(--color-warning)', bassa: 'var(--color-success)' }
  const projectList = Object.values(byProject).sort((a, b) => b.count - a.count).slice(0, 10)

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Totali', value: tasks.length, color: 'text-text-primary' },
          { label: 'Attive', value: active.length, color: 'text-info' },
          { label: 'Completate', value: completed.length, color: 'text-success' },
          { label: 'Scadute', value: overdue.length, color: overdue.length > 0 ? 'text-error' : 'text-success' },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-border rounded-xl p-4">
            <p className="text-2xs text-text-tertiary uppercase font-bold tracking-wider">{k.label}</p>
            <p className={`text-2xl font-black mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* By Status */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-2xs text-text-tertiary uppercase font-bold tracking-wider mb-3">Per stato</p>
          <div className="space-y-2">
            {Object.entries(STATUS_META).map(([s, meta]) => {
              const cnt = byStatus[s] ?? 0
              const pct = tasks.length ? Math.round((cnt / tasks.length) * 100) : 0
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: statusColors[s] }} />
                  <span className="text-xs text-text-secondary flex-1">{meta.label}</span>
                  <span className="text-xs text-text-primary font-bold">{cnt}</span>
                  <div className="w-16 h-1.5 bg-surface-active rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: statusColors[s] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* By Priority */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-2xs text-text-tertiary uppercase font-bold tracking-wider mb-3">Per priorità</p>
          <div className="space-y-2">
            {(['alta', 'media', 'bassa'] as const).map(p => {
              const cnt = byPriority[p] ?? 0
              const pct = tasks.length ? Math.round((cnt / tasks.length) * 100) : 0
              return (
                <div key={p} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: prioColors[p] }} />
                  <span className="text-xs text-text-secondary flex-1 capitalize">{p}</span>
                  <span className="text-xs text-text-primary font-bold">{cnt}</span>
                  <div className="w-16 h-1.5 bg-surface-active rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: prioColors[p] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* By Project */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-2xs text-text-tertiary uppercase font-bold tracking-wider mb-3">Per progetto</p>
          <div className="space-y-2">
            {projectList.map(p => {
              const pct = p.count ? Math.round((p.done / p.count) * 100) : 0
              return (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-text-primary font-bold">{p.done}/{p.count}</span>
                  <div className="w-16 h-1.5 bg-surface-active rounded-full overflow-hidden">
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
        <div className="bg-error/5 border border-error/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-error" />
            <span className="text-sm font-bold text-error">{overdue.length} task scadute</span>
          </div>
          <div className="space-y-1">
            {overdue.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="text-error font-medium">{formatDate(t.due_date!)}</span>
                <span className="text-text-primary flex-1 truncate">{t.title}</span>
                <span className="text-text-tertiary">{t.project?.clients?.company_name ?? t.project?.name ?? ''}</span>
              </div>
            ))}
            {overdue.length > 5 && <p className="text-2xs text-error/60">e altre {overdue.length - 5}…</p>}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── ASSIGN MODAL ─────────────────────────────── */
function AssignModal({ profiles, taskCount, assigning, onAssign, onClose }: {
  profiles: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
  taskCount: number; assigning: boolean
  onAssign: (profileIds: string[]) => Promise<void>
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const filtered = profiles.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-8" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl w-full max-w-md flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-gold-text" />
            <div>
              <p className="text-sm font-bold text-text-primary">Assegna {taskCount} task</p>
              <p className="text-2xs text-text-secondary">Seleziona una o più risorse</p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 pt-3">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca risorsa..."
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40 placeholder:text-text-tertiary"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {filtered.map(p => {
            const isOn = selected.has(p.id)
            return (
              <button key={p.id} onClick={() => toggle(p.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isOn ? 'bg-gold/10 border border-gold/20' : 'hover:bg-surface-hover border border-transparent'}`}>
                <span className={`shrink-0 transition-colors ${isOn ? 'text-gold-text' : 'text-text-tertiary'}`}>
                  {isOn ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </span>
                <div className="w-8 h-8 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-xs font-bold text-gold-text shrink-0">
                  {p.avatar_url
                    ? <img src={p.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                    : getInitials(p.full_name)}
                </div>
                <span className="text-sm text-text-primary font-medium flex-1 text-left">{p.full_name}</span>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-text-secondary text-center py-6">Nessuna risorsa trovata</p>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <p className="text-2xs text-text-secondary">{selected.size} risorse selezionate</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs text-text-secondary hover:text-text-primary">Annulla</button>
            <button onClick={() => onAssign(Array.from(selected))} disabled={assigning || selected.size === 0}
              className="flex items-center gap-1.5 px-5 py-2 bg-gold text-on-gold rounded-lg text-xs font-bold hover:bg-gold/90 transition-colors disabled:opacity-50">
              {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Assegna
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
