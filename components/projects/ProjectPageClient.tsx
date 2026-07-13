'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Flag, BarChart3, Loader2, Plus, Trash2, MessageCircle,
  Send, TrendingUp, TrendingDown, GripVertical, ChevronDown, ChevronRight,
  Sparkles, Check, X, Edit2, FileText, Zap, ChevronUp, AlertCircle,
  Clock, Calendar, MoreHorizontal, MapPin, Users, BookOpen, Upload,
  Printer, Tag, Link as LinkIcon, RefreshCw, UserCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { softDeleteTasks } from '@/app/actions/tasks-trash'
import { toast } from 'sonner'
import { formatDate, formatCurrency } from '@/lib/utils'
import { AssigneePicker } from '@/components/tasks/AssigneePicker'
import { bulkSetTaskAssignees } from '@/app/actions/task-assignees'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { Client, Project, Sprint, Task, ClientKpi, ClientKpiConfig, Profile, MeetingNote, ProjectAppointment } from '@/lib/types/database'
import { Section, timeAgo, trendDir, type ProjectComment } from './project-shared'
import { Avatar, ProgressBar, ProgressRing, InlineEdit, DatePicker } from './ProjectPrimitives'
import { TaskDrawer } from '@/components/tasks/TaskDrawer'
import { ContextualCreate } from '@/components/shared/ContextualCreate'
import { ProjectGantt } from '@/components/shared/ProjectGantt'
import { AppointmentsSection } from './tabs/AppuntamentiTab'
import { MeetingRecapsSection } from './tabs/RiunioniTab'
import { KpiSection } from './tabs/KpiTab'
import { AggiornamentiFeed } from './tabs/AggiornamentiTab'
import { ProjectChatSection } from './tabs/ChatTab'
import { ClientPlanSection } from './tabs/ClientPlanTab'

export type { ProjectComment }

// ─── Local types ───────────────────────────────────────────────────────────────
type PageTab   = 'progetto' | 'appuntamenti' | 'riunioni' | 'kpi' | 'aggiornamenti' | 'chat' | 'piano_cliente'
type ExtTask   = Task & { milestone_id?: string | null; parent_id?: string | null; order?: number }
type ExtSprint = Sprint & { order?: number }
interface AiPlanTask      { title: string; priority: string }
interface AiPlanMilestone { title: string; tasks: AiPlanTask[] }
interface AiPlanSprint    { name: string; duration_weeks: number; milestones: AiPlanMilestone[] }

interface Props {
  client: Client; project: Project; tasks: Task[]; sprints: Sprint[]
  kpis: ClientKpi[]; kpiConfig: ClientKpiConfig | null
  currentProfile: Profile; allProfiles: Profile[]; comments: ProjectComment[]
  appointments: ProjectAppointment[]; meetings: MeetingNote[]
  backHref?: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<string, string>  = { alta: 'var(--color-error)', media: 'var(--color-warning)', bassa: 'var(--color-text-tertiary)' }
const PRIORITY_LABELS: Record<string, string>  = { alta: 'Alta', media: 'Media', bassa: 'Bassa' }
const STATUS_TASK_OPTS  = ['da_fare', 'in_corso', 'in_revisione', 'completato']
const STATUS_TASK_LABEL: Record<string, string> = { da_fare: 'Da fare', in_corso: 'In corso', in_revisione: 'In revisione', completato: 'Fatto' }
const STATUS_SPRINT_OPTS: Sprint['status'][]   = ['pianificato', 'in_corso', 'completato']
const STATUS_SPRINT_LABEL: Record<string, string> = { pianificato: 'Pianificato', in_corso: 'In corso', completato: 'Completato' }
const STATUS_PROJECT: { v: Project['status']; l: string }[] = [
  { v: 'attivo', l: 'Attivo' }, { v: 'in_pausa', l: 'In pausa' },
  { v: 'completato', l: 'Completato' }, { v: 'archiviato', l: 'Archiviato' },
]
// ─── Helpers ───────────────────────────────────────────────────────────────────

// ─── TaskRow ───────────────────────────────────────────────────────────────────
function TaskRow({ task, allTasks, profiles, isAdmin, depth, projectId, milestoneId, accent, onUpdate, onOpenDrawer }: {
  task: ExtTask; allTasks: ExtTask[]; profiles: Profile[]; isAdmin: boolean
  depth: number; projectId: string; milestoneId: string; accent: string
  onUpdate: (tasks: ExtTask[]) => void
  onOpenDrawer?: (t: ExtTask) => void
}) {
  const [expanded, setExpanded]   = useState(false)
  const [addingChild, setAdding]  = useState(false)
  const [addDraft, setAddDraft]   = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const addRef = useRef<HTMLInputElement>(null)

  const children = allTasks.filter(t => (t as ExtTask).parent_id === task.id)
    .sort((a, b) => ((a as ExtTask).order ?? 0) - ((b as ExtTask).order ?? 0))

  const isDone    = task.status === 'completato'
  const isBlocked = task.status === 'in_revisione'
  const isOver    = !isDone && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)
  const assignee  = profiles.find(p => p.id === task.assignee_id)
  const canAdd    = depth < 2 && isAdmin

  const toggleDone = async () => {
    const next: Task['status'] = isDone ? 'da_fare' : 'completato'
    onUpdate(allTasks.map(t => t.id === task.id ? { ...t, status: next } : t))
    await createClient().from('tasks').update({ status: next }).eq('id', task.id)
  }

  const saveField = async (patch: Partial<ExtTask>) => {
    onUpdate(allTasks.map(t => t.id === task.id ? { ...t, ...patch } : t))
    await createClient().from('tasks').update(patch as Record<string, unknown>).eq('id', task.id)
  }

  const deleteTask = async () => {
    const ids = new Set<string>()
    const col = (id: string) => { ids.add(id); allTasks.filter(t => (t as ExtTask).parent_id === id).forEach(c => col(c.id)) }
    col(task.id)
    onUpdate(allTasks.filter(t => !ids.has(t.id)))
    await softDeleteTasks(Array.from(ids))
    toast.success('Task eliminata')
  }

  const addChild = async () => {
    if (!addDraft.trim()) return
    setAddSaving(true)
    const { data, error } = await createClient().from('tasks').insert({
      project_id: projectId, title: addDraft.trim(), status: 'da_fare',
      priority: 'media', is_milestone: false,
      parent_id: task.id, milestone_id: milestoneId, order: children.length,
    } as never).select().single()
    setAddSaving(false)
    if (error) { toast.error(error.message); return }
    onUpdate([...allTasks, data as ExtTask])
    setAddDraft(''); setAdding(false); setExpanded(true)
    toast.success('Sub-task aggiunto')
  }

  const pl = depth * 18

  return (
    <div>
      {/* Click ovunque sulla riga → editor laterale (i controlli interni fermano l'evento) */}
      <div className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-background transition-colors cursor-pointer"
        style={{ paddingLeft: pl + 12 }}
        onClick={() => (onOpenDrawer ? onOpenDrawer(task) : setShowDetail(true))}>
        {/* Grip */}
        {isAdmin && <GripVertical className="w-3 h-3 text-text-tertiary group-hover:text-text-tertiary shrink-0 cursor-grab" onClick={e => e.stopPropagation()} />}

        {/* Expand toggle */}
        <button onClick={e => { e.stopPropagation(); setExpanded(x => !x) }} className="w-4 shrink-0 flex items-center justify-center text-text-tertiary hover:text-text-tertiary">
          {children.length > 0 ? (expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) :
           canAdd ? <div className="w-1 h-1 rounded-full bg-surface-active" /> : null}
        </button>

        {/* Checkbox */}
        <button onClick={e => { e.stopPropagation(); toggleDone() }}
          className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${
            isDone    ? 'bg-success border-success' :
            isBlocked ? 'border-error' : 'border-border hover:border-border-strong'
          }`}>
          {isDone && <Check className="w-2.5 h-2.5 text-on-gold" />}
          {isBlocked && <X className="w-2.5 h-2.5 text-error" />}
        </button>

        {/* Priority dot */}
        <div className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: PRIORITY_COLORS[task.priority] ?? 'var(--color-border)' }} />

        {/* Title — inline edit */}
        <div className="flex-1 min-w-0">
          <InlineEdit
            value={task.title}
            onSave={v => saveField({ title: v })}
            disabled={!isAdmin}
            className={`text-sm block w-full ${isDone ? 'line-through text-text-tertiary' : 'text-text-primary'}`}
          />
        </div>

        {/* Meta — i controlli non devono aprire il drawer */}
        <div className="flex items-center gap-1.5 ml-1 shrink-0" onClick={e => e.stopPropagation()}>
          <div className="hidden md:block">
            <DatePicker
              value={task.due_date}
              onChange={v => saveField({ due_date: v })}
              disabled={!isAdmin}
              placeholder=""
              accent={isOver ? 'var(--color-error)' : '#888'}
            />
          </div>
          {assignee && <Avatar name={assignee.full_name} size={18} color="#60A5FA" />}

          {/* Actions */}
          <div className="hidden group-hover:flex items-center gap-0.5">
            <button onClick={() => setShowDetail(true)}
              className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors">
              <MoreHorizontal className="w-3 h-3" />
            </button>
            {canAdd && (
              <button onClick={() => { setAdding(true); setExpanded(true); setTimeout(() => addRef.current?.focus(), 30) }}
                className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors" title="Aggiungi sub-task">
                <Plus className="w-3 h-3" />
              </button>
            )}
            {isAdmin && (
              <button onClick={() => { if (confirm('Eliminare task e sub-task?')) deleteTask() }}
                className="p-1 rounded text-text-tertiary hover:text-error hover:bg-error/10 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Children */}
      {expanded && children.map(c => (
        <TaskRow key={c.id} task={c} allTasks={allTasks} profiles={profiles} onOpenDrawer={onOpenDrawer}
          isAdmin={isAdmin} depth={depth + 1} projectId={projectId} milestoneId={milestoneId}
          accent={accent} onUpdate={onUpdate} />
      ))}

      {/* Add child row */}
      {expanded && addingChild && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ paddingLeft: (depth + 1) * 18 + 12 }}>
          <div className="w-3 shrink-0" />
          <div className="w-4 h-4 rounded border border-border shrink-0" />
          <div className="w-1.5 h-1.5 rounded-full bg-surface-active shrink-0" />
          <input ref={addRef} value={addDraft} onChange={e => setAddDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addChild(); if (e.key === 'Escape') { setAdding(false); setAddDraft('') } }}
            placeholder="Sub-task… (Invio)"
            className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none placeholder:text-text-tertiary" />
          <button onClick={addChild} disabled={addSaving || !addDraft.trim()} className="p-1 text-success disabled:opacity-40">
            {addSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          </button>
          <button onClick={() => { setAdding(false); setAddDraft('') }} className="p-1 text-text-tertiary hover:text-text-primary"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Detail — drawer condiviso (Fase 1b) in overlay laterale */}
      {showDetail && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" onClick={() => setShowDetail(false)}>
          <div className="absolute inset-y-0 right-0 flex" onClick={e => e.stopPropagation()}>
            <TaskDrawer
              task={task}
              profiles={profiles}
              canEdit={isAdmin}
              onClose={() => setShowDetail(false)}
              onDelete={() => { deleteTask(); setShowDetail(false) }}
              onPatched={p => onUpdate(allTasks.map(t => t.id === task.id ? { ...t, ...p } : t))}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MilestoneBlock ────────────────────────────────────────────────────────────
function MilestoneBlock({ milestone, allTasks, profiles, isAdmin, projectId, accent, onUpdate, dragHandlers, focusIds, onOpenDrawer }: {
  milestone: ExtTask; allTasks: ExtTask[]; profiles: Profile[]
  isAdmin: boolean; projectId: string; accent: string
  onUpdate: (t: ExtTask[]) => void
  dragHandlers: DragHandlers<ExtTask>
  focusIds?: string[]
  onOpenDrawer?: (t: ExtTask) => void
}) {
  const [open, setOpen]         = useState(false)
  // Arrivo dal Gantt: la milestone si apre da sola.
  useEffect(() => { if (focusIds?.includes(milestone.id)) setOpen(true) }, [focusIds, milestone.id])
  const [addingTask, setAdding] = useState(false)
  const [taskDraft, setDraft]   = useState('')
  const [saving, setSaving]     = useState(false)
  const addRef = useRef<HTMLInputElement>(null)

  const tasks = allTasks
    .filter(t => !t.is_milestone && (t as ExtTask).milestone_id === milestone.id && !(t as ExtTask).parent_id)
    .sort((a, b) => ((a as ExtTask).order ?? 0) - ((b as ExtTask).order ?? 0))

  const done  = tasks.filter(t => t.status === 'completato').length
  const isDone = milestone.status === 'completato'
  const isOver = !isDone && milestone.due_date && milestone.due_date < new Date().toISOString().slice(0, 10)
  const milColor = isDone ? 'var(--color-success)' : isOver ? 'var(--color-error)' : accent
  const isD    = dragHandlers.dragging === milestone.id
  const isOver2 = dragHandlers.dragOver === milestone.id
  const assignee = profiles.find(p => p.id === milestone.assignee_id)

  const saveField = async (patch: Partial<ExtTask>) => {
    onUpdate(allTasks.map(t => t.id === milestone.id ? { ...t, ...patch } : t))
    await createClient().from('tasks').update(patch as Record<string, unknown>).eq('id', milestone.id)
  }

  const deleteMilestone = async () => {
    if (!confirm('Eliminare milestone e tutti i task?')) return
    const ids = new Set<string>()
    const col = (id: string) => { ids.add(id); allTasks.filter(t => (t as ExtTask).parent_id === id || (t as ExtTask).milestone_id === id).forEach(c => col(c.id)) }
    col(milestone.id)
    onUpdate(allTasks.filter(t => !ids.has(t.id)))
    await softDeleteTasks(Array.from(ids))
    toast.success('Milestone eliminata')
  }

  // "Aggiungi task": crea subito la task e apre l'EDITOR LATERALE per compilarla
  // (stesso drawer che si apre cliccando una task esistente).
  const addTask = async () => {
    setSaving(true)
    const { data, error } = await createClient().from('tasks').insert({
      project_id: projectId, title: 'Nuova task', status: 'da_fare',
      priority: 'media', is_milestone: false, milestone_id: milestone.id, order: tasks.length,
    } as never).select().single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    const created = data as ExtTask
    onUpdate([...allTasks, created])
    setOpen(true)
    onOpenDrawer?.(created)
  }

  return (
    <div id={`milestone-${milestone.id}`}
      className={`rounded-xl border transition-all mb-1.5 ${isD ? 'opacity-30' : ''} ${isOver2 ? 'ring-1 ring-warning/30' : ''}`}
      style={{ borderColor: open ? `color-mix(in srgb, ${milColor} 13%, transparent)` : 'var(--color-surface)' }}
      draggable={isAdmin}
      onDragStart={e => dragHandlers.onDragStart(e, milestone.id)}
      onDragOver={e  => dragHandlers.onDragOver(e, milestone.id)}
      onDrop={e      => dragHandlers.onDrop(e, milestone.id)}
      onDragEnd={dragHandlers.onDragEnd}
    >
      {/* Milestone header */}
      {/* Click ovunque sulla riga → apre/chiude la milestone */}
      <div className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors cursor-pointer hover:bg-surface-hover`}
        onClick={() => setOpen(o => !o)}>
        {isAdmin && <GripVertical className="w-3 h-3 text-text-tertiary group-hover:text-text-tertiary shrink-0 cursor-grab transition-colors" onClick={e => e.stopPropagation()} />}

        <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }} className="shrink-0 transition-colors" style={{ color: isDone ? 'var(--color-success)' : 'var(--color-border)' }}>
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Flag + done toggle */}
        <button onClick={e => { e.stopPropagation(); if (isAdmin) saveField({ status: isDone ? 'da_fare' : 'completato' }) }}
          className={`shrink-0 transition-all hover:scale-110 ${isAdmin ? 'cursor-pointer' : ''}`}>
          <Flag className="w-3.5 h-3.5" style={{ color: milColor }} fill={isDone ? milColor : 'none'} />
        </button>

        {/* Title inline edit */}
        <div className="flex-1 min-w-0">
          <InlineEdit
            value={milestone.title}
            onSave={v => saveField({ title: v })}
            disabled={!isAdmin}
            className={`text-sm font-semibold block w-full ${isDone ? 'line-through text-text-tertiary' : 'text-text-secondary'}`}
          />
        </div>

        {/* Meta row — i controlli non devono aprire/chiudere la milestone */}
        <div className="flex items-center gap-2 ml-1 shrink-0" onClick={e => e.stopPropagation()}>
          {/* Task progress pill */}
          {tasks.length > 0 && (
            <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: done === tasks.length ? '#22C55E18' : 'var(--color-surface)',
                color: done === tasks.length ? 'var(--color-success)' : '#444',
              }}>
              {done}/{tasks.length}
            </span>
          )}

          {/* Due date */}
          <div className="hidden sm:block">
            <DatePicker
              value={milestone.due_date}
              onChange={v => isAdmin && saveField({ due_date: v })}
              disabled={!isAdmin}
              placeholder="Scadenza"
              accent={isOver ? 'var(--color-error)' : accent}
            />
          </div>

          {assignee && <Avatar name={assignee.full_name} size={18} color={accent} />}

          {isAdmin && (
            <button onClick={deleteMilestone}
              className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all text-text-tertiary hover:text-error hover:bg-error/10">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tasks list */}
      {open && (
        <div className="px-2 pb-2 pt-1">
          {tasks.map(t => (
            <TaskRow key={t.id} task={t} allTasks={allTasks} profiles={profiles} onOpenDrawer={onOpenDrawer}
              isAdmin={isAdmin} depth={0} projectId={projectId} milestoneId={milestone.id}
              accent={accent} onUpdate={onUpdate} />
          ))}

          {/* Inline add task */}
          {addingTask ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl">
              <div className="w-4 h-4 rounded border border-border shrink-0" />
              <div className="w-1.5 h-1.5 rounded-full bg-surface-active shrink-0" />
              <input ref={addRef} value={taskDraft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') { setAdding(false); setDraft('') } }}
                placeholder="Nuova task… (Invio)"
                className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none placeholder:text-text-tertiary"
                autoFocus />
              <button onClick={addTask} disabled={saving || !taskDraft.trim()} className="p-1 text-success disabled:opacity-40">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </button>
              <button onClick={() => { setAdding(false); setDraft('') }} className="p-1 text-text-tertiary hover:text-text-primary"><X className="w-3 h-3" /></button>
            </div>
          ) : isAdmin && (
            <button onClick={() => { setAdding(true); setTimeout(() => addRef.current?.focus(), 30) }}
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-2xs text-text-tertiary hover:text-text-tertiary transition-colors">
              <Plus className="w-3 h-3" /> Aggiungi task
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Generic drag helpers ──────────────────────────────────────────────────────
interface DragHandlers<T extends { id: string }> {
  dragging: string | null; dragOver: string | null
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver:  (e: React.DragEvent, id: string) => void
  onDrop:      (e: React.DragEvent, id: string) => void
  onDragEnd:   () => void
}

function useDragReorder<T extends { id: string }>(
  getItems: () => T[],
  onReorder: (items: T[]) => void,
  persist: (items: T[]) => void
): DragHandlers<T> {
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  return {
    dragging, dragOver,
    onDragStart: (_e, id) => setDragging(id),
    onDragOver:  (e, id)  => { e.preventDefault(); setDragOver(id) },
    onDrop: (e, targetId) => {
      e.preventDefault()
      if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return }
      const arr = [...getItems()]
      const from = arr.findIndex(x => x.id === dragging)
      const to   = arr.findIndex(x => x.id === targetId)
      const [m]  = arr.splice(from, 1); arr.splice(to, 0, m)
      const updated = arr.map((x, i) => ({ ...x, order: i }))
      onReorder(updated)
      persist(updated)
      setDragging(null); setDragOver(null)
    },
    onDragEnd: () => { setDragging(null); setDragOver(null) },
  }
}

// ─── Sprint block ──────────────────────────────────────────────────────────────
function SprintBlock({ sprint, allTasks, profiles, isAdmin, projectId, accent, allSprints,
  onUpdateTasks, onUpdateSprint, onDeleteSprint, dragHandlers, focusIds, onOpenDrawer }: {
  sprint: ExtSprint; allTasks: ExtTask[]; profiles: Profile[]
  isAdmin: boolean; projectId: string; accent: string; allSprints: ExtSprint[]
  onUpdateTasks: (t: ExtTask[]) => void
  onUpdateSprint: (s: ExtSprint) => void
  onDeleteSprint: (id: string) => void
  dragHandlers: DragHandlers<ExtSprint>
  focusIds?: string[]
  onOpenDrawer?: (t: ExtTask) => void
}) {
  const [open, setOpen]     = useState(false)
  // Arrivo dal Gantt: lo sprint si apre da solo (anche quando il target è una sua milestone).
  useEffect(() => { if (focusIds?.includes(sprint.id)) setOpen(true) }, [focusIds, sprint.id])
  const [addingM, setAddM]  = useState(false)
  const [mDraft, setMDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const addRef = useRef<HTMLInputElement>(null)

  const milestones = allTasks
    .filter(t => t.is_milestone && t.sprint_id === sprint.id)
    .sort((a, b) => ((a as ExtTask).order ?? 0) - ((b as ExtTask).order ?? 0))

  const allTasksInSprint = allTasks.filter(t => {
    if (t.is_milestone) return false
    const mid = (t as ExtTask).milestone_id
    return mid ? milestones.some(m => m.id === mid) : false
  })
  const done  = allTasksInSprint.filter(t => !(t as ExtTask).parent_id && t.status === 'completato').length
  const total = allTasksInSprint.filter(t => !(t as ExtTask).parent_id).length
  const pct   = total ? Math.round(done / total * 100) : 0

  const isActive = sprint.status === 'in_corso'
  const isDone   = sprint.status === 'completato'
  const isD      = dragHandlers.dragging === sprint.id
  const isOver   = dragHandlers.dragOver === sprint.id

  const saveField = async (patch: Partial<ExtSprint>) => {
    onUpdateSprint({ ...sprint, ...patch })
    await createClient().from('sprints').update(patch as Record<string, unknown>).eq('id', sprint.id)
  }

  // "Aggiungi milestone": crea subito e apre l'EDITOR LATERALE per compilarla.
  const addMilestone = async () => {
    setSaving(true)
    const { data, error } = await createClient().from('tasks').insert({
      project_id: projectId, title: 'Nuova milestone', status: 'da_fare', priority: 'media',
      is_milestone: true, sprint_id: sprint.id, order: milestones.length,
    } as never).select().single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    const created = data as ExtTask
    onUpdateTasks([...allTasks, created])
    setOpen(true)
    onOpenDrawer?.(created)
  }

  const milDrag = useDragReorder(
    () => milestones,
    updated => onUpdateTasks(allTasks.map(t => updated.find(u => u.id === t.id) ?? t)),
    updated => Promise.all(updated.map(m => createClient().from('tasks').update({ order: (m as ExtTask).order } as never).eq('id', m.id)))
  )

  const borderColor = isDone ? '#22C55E25' : isActive ? `color-mix(in srgb, ${accent} 21%, transparent)` : 'var(--color-surface)'
  const accentColor = isDone ? 'var(--color-success)' : isActive ? accent : 'var(--color-border-strong)'

  return (
    <div id={`sprint-${sprint.id}`}
      className={`rounded-2xl overflow-hidden mb-3 transition-all ${isD ? 'opacity-30 scale-[0.99]' : ''} ${isOver ? 'ring-1 ring-warning/20' : ''}`}
      style={{ border: `1px solid ${borderColor}` }}
      draggable={isAdmin}
      onDragStart={e => dragHandlers.onDragStart(e, sprint.id)}
      onDragOver={e  => dragHandlers.onDragOver(e, sprint.id)}
      onDrop={e      => dragHandlers.onDrop(e, sprint.id)}
      onDragEnd={dragHandlers.onDragEnd}
    >
      {/* Sprint header */}
      <div className="group"
        style={{ background: isDone ? '#22C55E06' : isActive ? `color-mix(in srgb, ${accent} 2%, transparent)` : 'var(--color-background)', borderBottom: open ? `1px solid ${borderColor}` : 'none' }}>
        {/* Color accent bar */}
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${accentColor} 38%, transparent), transparent)` }} />

        {/* Click ovunque sulla riga → apre/chiude lo sprint (i controlli fermano l'evento) */}
        <div className="flex items-center gap-2.5 px-4 py-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
          {isAdmin && <GripVertical className="w-3.5 h-3.5 text-text-tertiary group-hover:text-text-tertiary shrink-0 cursor-grab transition-colors" onClick={e => e.stopPropagation()} />}

          <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }} className="shrink-0 transition-colors" style={{ color: isDone ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {/* Sprint number badge */}
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-2xs font-black shrink-0"
            style={{ background: `color-mix(in srgb, ${accentColor} 8%, transparent)`, color: accentColor }}>
            {(allSprints.indexOf(sprint) + 1) || '·'}
          </div>

          {/* Sprint name */}
          <div className="flex-1 min-w-0">
            <InlineEdit
              value={sprint.name}
              onSave={v => saveField({ name: v })}
              disabled={!isAdmin}
              className={`text-sm font-bold block w-full ${isDone ? 'text-success' : isActive ? 'text-text-primary' : 'text-text-tertiary'}`}
            />
          </div>

          {/* Status */}
          {isAdmin ? (
            <select value={sprint.status}
              onChange={e => saveField({ status: e.target.value as Sprint['status'] })}
              onClick={e => e.stopPropagation()}
              className="text-2xs font-bold px-2 py-1 rounded-lg border focus:outline-none bg-transparent cursor-pointer shrink-0"
              style={{ borderColor: `color-mix(in srgb, ${accentColor} 19%, transparent)`, color: accentColor }}>
              {STATUS_SPRINT_OPTS.map(v => <option key={v} value={v} className="bg-background text-text-primary">{STATUS_SPRINT_LABEL[v]}</option>)}
            </select>
          ) : (
            <span className="text-2xs font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: `color-mix(in srgb, ${accentColor} 7%, transparent)`, color: accentColor }}>
              {STATUS_SPRINT_LABEL[sprint.status]}
            </span>
          )}

          {/* Dates */}
          <div className="hidden lg:flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
            <DatePicker
              value={sprint.start_date.slice(0, 10)}
              onChange={v => v && saveField({ start_date: v })}
              disabled={!isAdmin}
              placeholder="Inizio"
              accent={accentColor}
              showIcon={false}
            />
            <span className="text-text-tertiary text-xs">→</span>
            <DatePicker
              value={sprint.end_date.slice(0, 10)}
              onChange={v => v && saveField({ end_date: v })}
              disabled={!isAdmin}
              placeholder="Fine"
              accent={accentColor}
              showIcon={false}
            />
          </div>

          {/* Progress */}
          {total > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 w-20 shrink-0">
              <ProgressBar pct={pct} accent={accentColor} />
            </div>
          )}

          {/* Delete */}
          {isAdmin && (
            <button onClick={e => { e.stopPropagation(); if (confirm('Eliminare sprint e tutto il contenuto?')) onDeleteSprint(sprint.id) }}
              className="p-1.5 rounded-lg text-text-tertiary hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Milestones */}
      {open && (
        <div className="p-3 space-y-1.5 bg-background">
          {milestones.length === 0 && !addingM && (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <Flag className="w-5 h-5 text-text-tertiary" />
              <p className="text-xs text-text-tertiary">Nessuna milestone in questo sprint</p>
            </div>
          )}

          {milestones.map(m => (
            <MilestoneBlock key={m.id} milestone={m} allTasks={allTasks} profiles={profiles}
              isAdmin={isAdmin} projectId={projectId} accent={accent}
              focusIds={focusIds} onOpenDrawer={onOpenDrawer}
              onUpdate={onUpdateTasks} dragHandlers={milDrag as DragHandlers<ExtTask>} />
          ))}

          {/* Add milestone */}
          {addingM ? (
            <div className="flex items-center gap-2 px-3 py-2.5 border border-dashed rounded-xl"
              style={{ borderColor: `color-mix(in srgb, ${accent} 19%, transparent)`, background: `color-mix(in srgb, ${accent} 2%, transparent)` }}>
              <Flag className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />
              <input ref={addRef} value={mDraft} onChange={e => setMDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addMilestone(); if (e.key === 'Escape') { setAddM(false); setMDraft('') } }}
                placeholder="Nome milestone… premi Invio"
                className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none placeholder:text-text-tertiary"
                autoFocus />
              <button onClick={addMilestone} disabled={saving || !mDraft.trim()} className="p-1 text-success disabled:opacity-40">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </button>
              <button onClick={() => { setAddM(false); setMDraft('') }} className="p-1 text-text-tertiary hover:text-text-primary"><X className="w-3 h-3" /></button>
            </div>
          ) : isAdmin && (
            <button onClick={() => { setAddM(true); setTimeout(() => addRef.current?.focus(), 30) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-tertiary hover:text-text-tertiary border border-dashed border-border hover:border-border rounded-xl transition-all">
              <Flag className="w-3 h-3" /> Aggiungi milestone
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Plan templates ────────────────────────────────────────────────────────────
const PLAN_TEMPLATES: Record<string, { label: string; emoji: string; desc: string; plan: AiPlanSprint[] }> = {
  ecommerce: {
    label: 'E-commerce', emoji: '🛒', desc: 'Shop online, pagamenti, catalogo prodotti',
    plan: [
      { name: 'Sprint 1 — Discovery & Setup', duration_weeks: 2, milestones: [
        { title: 'Kickoff & Brief', tasks: [{ title: 'Allineamento obiettivi', priority: 'alta' }, { title: 'Definizione KPI', priority: 'alta' }, { title: 'Benchmark competitor', priority: 'media' }] },
        { title: 'Architettura piattaforma', tasks: [{ title: 'Scelta piattaforma', priority: 'alta' }, { title: 'Setup ambiente dev', priority: 'alta' }, { title: 'Configurazione dominio', priority: 'media' }] },
      ]},
      { name: 'Sprint 2 — Design & Contenuti', duration_weeks: 3, milestones: [
        { title: 'Design UI/UX', tasks: [{ title: 'Wireframe homepage', priority: 'alta' }, { title: 'Design scheda prodotto', priority: 'alta' }, { title: 'Design checkout', priority: 'alta' }] },
        { title: 'Catalogo prodotti', tasks: [{ title: 'Import prodotti', priority: 'alta' }, { title: 'Categorie e filtri', priority: 'media' }, { title: 'SEO schede prodotto', priority: 'media' }] },
      ]},
      { name: 'Sprint 3 — Sviluppo & Integrazioni', duration_weeks: 3, milestones: [
        { title: 'Sviluppo frontend', tasks: [{ title: 'Homepage', priority: 'alta' }, { title: 'Listing + filtri', priority: 'alta' }, { title: 'Scheda prodotto', priority: 'alta' }] },
        { title: 'Pagamenti & Logistica', tasks: [{ title: 'Integrazione pagamenti', priority: 'alta' }, { title: 'Configurazione spedizioni', priority: 'alta' }, { title: 'Email transazionali', priority: 'media' }] },
      ]},
      { name: 'Sprint 4 — Test & Launch', duration_weeks: 2, milestones: [
        { title: 'QA & Test', tasks: [{ title: 'Test funzionale completo', priority: 'alta' }, { title: 'Test mobile', priority: 'alta' }, { title: 'Test pagamenti', priority: 'alta' }] },
        { title: 'Go Live', tasks: [{ title: 'Deploy produzione', priority: 'alta' }, { title: 'Analytics setup', priority: 'media' }, { title: 'Handover cliente', priority: 'media' }] },
      ]},
    ],
  },
  lead_gen: {
    label: 'Lead Generation', emoji: '🎯', desc: 'Funnel, landing page, CRM, email automation',
    plan: [
      { name: 'Sprint 1 — Strategia & Copy', duration_weeks: 2, milestones: [
        { title: 'Strategia funnel', tasks: [{ title: 'Mappa customer journey', priority: 'alta' }, { title: 'Definizione lead magnet', priority: 'alta' }, { title: 'Analisi target audience', priority: 'media' }] },
        { title: 'Copy & Contenuti', tasks: [{ title: 'Copywriting landing page', priority: 'alta' }, { title: 'Email sequence', priority: 'alta' }, { title: 'Materiale lead magnet', priority: 'media' }] },
      ]},
      { name: 'Sprint 2 — Build & Integrazioni', duration_weeks: 2, milestones: [
        { title: 'Landing page', tasks: [{ title: 'Design LP', priority: 'alta' }, { title: 'Sviluppo LP', priority: 'alta' }, { title: 'Form + thank you page', priority: 'alta' }] },
        { title: 'CRM & Automation', tasks: [{ title: 'Setup CRM', priority: 'alta' }, { title: 'Sequenza email automatica', priority: 'alta' }, { title: 'Lead scoring', priority: 'media' }] },
      ]},
      { name: 'Sprint 3 — Traffic & Ottimizzazione', duration_weeks: 3, milestones: [
        { title: 'Campagna traffico', tasks: [{ title: 'Setup Meta Ads', priority: 'alta' }, { title: 'Setup Google Ads', priority: 'media' }, { title: 'A/B test headline', priority: 'alta' }] },
        { title: 'Analisi & Scale', tasks: [{ title: 'Report performance', priority: 'media' }, { title: 'Ottimizzazione CPL', priority: 'alta' }, { title: 'Scale budget vincitori', priority: 'alta' }] },
      ]},
    ],
  },
  sito_web: {
    label: 'Sito Web', emoji: '🌐', desc: 'Sito corporate, istituzionale o landing page',
    plan: [
      { name: 'Sprint 1 — Discovery & Design', duration_weeks: 2, milestones: [
        { title: 'Briefing & Struttura', tasks: [{ title: 'Sitemap', priority: 'alta' }, { title: 'Definizione stile grafico', priority: 'alta' }, { title: 'Raccolta materiali', priority: 'media' }] },
        { title: 'Design UI', tasks: [{ title: 'Homepage design', priority: 'alta' }, { title: 'Template pagine interne', priority: 'alta' }, { title: 'Mobile responsive', priority: 'alta' }] },
      ]},
      { name: 'Sprint 2 — Sviluppo & Contenuti', duration_weeks: 3, milestones: [
        { title: 'Sviluppo', tasks: [{ title: 'Setup CMS', priority: 'alta' }, { title: 'Sviluppo homepage', priority: 'alta' }, { title: 'Pagine interne', priority: 'alta' }] },
        { title: 'SEO & Contenuti', tasks: [{ title: 'Copy pagine principali', priority: 'alta' }, { title: 'SEO on-page', priority: 'media' }, { title: 'Blog setup', priority: 'bassa' }] },
      ]},
      { name: 'Sprint 3 — Test & Launch', duration_weeks: 1, milestones: [
        { title: 'QA & Go Live', tasks: [{ title: 'Test cross-browser', priority: 'alta' }, { title: 'Performance check', priority: 'alta' }, { title: 'Deploy + DNS', priority: 'alta' }] },
      ]},
    ],
  },
  app_ai: {
    label: 'App / AI / Gestionale', emoji: '🤖', desc: 'Software custom, AI, app web o mobile',
    plan: [
      { name: 'Sprint 1 — Analysis & Architecture', duration_weeks: 2, milestones: [
        { title: 'Requirements', tasks: [{ title: 'User stories', priority: 'alta' }, { title: 'Functional spec', priority: 'alta' }, { title: 'Tech stack decision', priority: 'alta' }] },
        { title: 'Architettura DB', tasks: [{ title: 'Schema database', priority: 'alta' }, { title: 'API design', priority: 'alta' }, { title: 'Auth flow', priority: 'alta' }] },
      ]},
      { name: 'Sprint 2 — MVP Core', duration_weeks: 3, milestones: [
        { title: 'Backend MVP', tasks: [{ title: 'Setup progetto', priority: 'alta' }, { title: 'CRUD principali', priority: 'alta' }, { title: 'Auth & autorizzazioni', priority: 'alta' }] },
        { title: 'Frontend MVP', tasks: [{ title: 'UI base', priority: 'alta' }, { title: 'Flusso principale', priority: 'alta' }, { title: 'Gestione errori', priority: 'media' }] },
      ]},
      { name: 'Sprint 3 — Features & Integrazioni', duration_weeks: 3, milestones: [
        { title: 'Feature avanzate', tasks: [{ title: 'Dashboard & analytics', priority: 'alta' }, { title: 'Notifiche', priority: 'media' }, { title: 'Esportazione dati', priority: 'media' }] },
        { title: 'Integrazioni API', tasks: [{ title: 'API esterne', priority: 'alta' }, { title: 'Webhook', priority: 'media' }, { title: 'Test integrazioni', priority: 'alta' }] },
      ]},
      { name: 'Sprint 4 — QA & Deploy', duration_weeks: 2, milestones: [
        { title: 'Test & Security', tasks: [{ title: 'Test unitari', priority: 'alta' }, { title: 'Security audit', priority: 'alta' }, { title: 'Performance test', priority: 'media' }] },
        { title: 'Deploy & Handover', tasks: [{ title: 'Setup produzione', priority: 'alta' }, { title: 'Documentazione', priority: 'media' }, { title: 'Training cliente', priority: 'media' }] },
      ]},
    ],
  },
  campagna: {
    label: 'Campagna Ads', emoji: '📣', desc: 'Performance marketing su Meta / Google / TikTok',
    plan: [
      { name: 'Sprint 1 — Setup & Creativita', duration_weeks: 2, milestones: [
        { title: 'Strategia media', tasks: [{ title: 'Definizione obiettivi', priority: 'alta' }, { title: 'Budget allocation', priority: 'alta' }, { title: 'Audience mapping', priority: 'alta' }] },
        { title: 'Creativita', tasks: [{ title: 'Copy ads', priority: 'alta' }, { title: 'Visual/video', priority: 'alta' }, { title: 'Landing page', priority: 'alta' }] },
      ]},
      { name: 'Sprint 2 — Launch & Ottimizzazione', duration_weeks: 4, milestones: [
        { title: 'Go Live', tasks: [{ title: 'Setup campagne', priority: 'alta' }, { title: 'Pixel & tracciamento', priority: 'alta' }, { title: 'Primo report', priority: 'media' }] },
        { title: 'Scale & Reporting', tasks: [{ title: 'Ottimizzazione bidding', priority: 'alta' }, { title: 'A/B test creativita', priority: 'alta' }, { title: 'Report mensile', priority: 'media' }] },
      ]},
    ],
  },
  custom: {
    label: 'Progetto Custom', emoji: '✨', desc: 'Template generico adattabile a qualsiasi progetto',
    plan: [
      { name: 'Sprint 1 — Discovery', duration_weeks: 2, milestones: [
        { title: 'Kickoff & Pianificazione', tasks: [{ title: 'Allineamento obiettivi', priority: 'alta' }, { title: 'Definizione scope', priority: 'alta' }, { title: 'Piano di progetto', priority: 'media' }] },
      ]},
      { name: 'Sprint 2 — Execution', duration_weeks: 3, milestones: [
        { title: 'Deliverable principale', tasks: [{ title: 'Task principale 1', priority: 'alta' }, { title: 'Task principale 2', priority: 'alta' }, { title: 'Review interna', priority: 'media' }] },
      ]},
      { name: 'Sprint 3 — Delivery', duration_weeks: 1, milestones: [
        { title: 'Consegna & Handover', tasks: [{ title: 'Review finale', priority: 'alta' }, { title: 'Consegna al cliente', priority: 'alta' }, { title: 'Raccolta feedback', priority: 'media' }] },
      ]},
    ],
  },
}

// ─── Template picker modal ─────────────────────────────────────────────────────
function TemplatePickerModal({ onClose, onSelect, projectType, accent }: {
  onClose: () => void; onSelect: (plan: AiPlanSprint[], label: string) => void
  projectType?: string | null; accent: string
}) {
  const suggested = projectType && PLAN_TEMPLATES[projectType] ? projectType : null
  const [sel, setSel] = useState<string>(suggested ?? 'custom')
  const tmpl = PLAN_TEMPLATES[sel]
  const tot  = tmpl.plan.reduce((a, s) => a + s.milestones.reduce((b, m) => b + m.tasks.length + 1, 0) + 1, 0)

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border shrink-0">
          <Zap className="w-4 h-4 shrink-0" style={{ color: accent }} />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-text-primary">Scegli un template</h2>
            <p className="text-2xs text-text-tertiary mt-0.5">Piano predefinito + brief AI generato automaticamente</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 overflow-hidden min-h-0">
          {/* Template list */}
          <div className="sm:w-60 shrink-0 border-b sm:border-b-0 sm:border-r border-border overflow-y-auto bg-background">
            <div className="p-2 space-y-0.5">
              {Object.entries(PLAN_TEMPLATES).map(([key, t]) => (
                <button key={key} onClick={() => setSel(key)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                    sel === key
                      ? 'bg-background border border-border shadow-sm'
                      : 'hover:bg-background border border-transparent'
                  }`}>
                  <span className="text-2xl shrink-0">{t.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-xs font-bold ${sel === key ? 'text-text-primary' : 'text-text-tertiary'}`}>{t.label}</p>
                      {key === suggested && (
                        <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: `color-mix(in srgb, ${accent} 13%, transparent)`, color: accent }}>✓ suggerito</span>
                      )}
                    </div>
                    <p className="text-2xs text-text-tertiary mt-0.5 leading-tight">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview piano */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{tmpl.emoji}</span>
              <div>
                <p className="text-sm font-bold text-text-primary">{tmpl.label}</p>
                <p className="text-2xs text-text-tertiary">{tmpl.plan.length} sprint · {tot - tmpl.plan.length} elementi</p>
              </div>
            </div>
            <div className="space-y-2">
              {tmpl.plan.map((s, si) => (
                <div key={si} className="border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-background">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-2xs font-black shrink-0"
                      style={{ background: `color-mix(in srgb, ${accent} 13%, transparent)`, color: accent }}>{si + 1}</div>
                    <span className="text-xs font-bold text-text-primary flex-1">{s.name}</span>
                    <span className="text-2xs text-text-tertiary font-medium">{s.duration_weeks} sett.</span>
                  </div>
                  <div className="divide-y divide-border">
                    {s.milestones.map((m, mi) => (
                      <div key={mi} className="px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Flag className="w-3 h-3 shrink-0" style={{ color: accent, opacity: 0.6 }} />
                          <span className="text-xs font-semibold text-text-tertiary">{m.title}</span>
                          <span className="text-2xs px-1.5 py-0.5 rounded-full ml-auto"
                            style={{ background: `color-mix(in srgb, ${accent} 6%, transparent)`, color: accent }}>{m.tasks.length}</span>
                        </div>
                        <div className="pl-4 space-y-1">
                          {m.tasks.map((t, ti) => (
                            <div key={ti} className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full shrink-0" style={{ background: PRIORITY_COLORS[t.priority] ?? 'var(--color-border)' }} />
                              <span className="text-2xs text-text-tertiary">{t.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
          <button onClick={onClose}
            className="px-5 py-2.5 border border-border rounded-xl text-sm text-text-tertiary hover:text-text-primary transition-colors">
            Annulla
          </button>
          <button onClick={() => onSelect(tmpl.plan, tmpl.label)}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-on-gold transition-all hover:opacity-90 flex items-center justify-center gap-2"
            style={{ background: accent }}>
            <Sparkles className="w-3.5 h-3.5" />
            Usa {tmpl.label} · {tot} elementi
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Brief Panel ───────────────────────────────────────────────────────────────
function BriefPanel({ project, client, isAdmin, accent, onPlanGenerated, sprintsCount, tasksCount }: {
  project: Project; client: Client; isAdmin: boolean; accent: string
  onPlanGenerated: (plan: AiPlanSprint[]) => void
  sprintsCount: number; tasksCount: number
}) {
  const [brief, setBrief]           = useState(project.brief ?? '')
  const [saving, setSaving]         = useState(false)
  const [briefLoading, setBriefLoad] = useState(false)
  const [aiLoading, setAiLoad]      = useState(false)
  const [aiPlan, setAiPlan]         = useState<AiPlanSprint[] | null>(null)
  const [aiError, setAiErr]         = useState('')
  const [showAi, setShowAi]         = useState(false)
  const [showTmpl, setShowTmpl]     = useState(false)
  const [briefAiGenerated, setBriefAiGenerated] = useState(false)
  // §15.1: dopo il salvataggio il brief resta in LETTURA. Template/AI/genera-piano
  // compaiono solo in edit mode. Un brief vuoto parte già in edit (non c'è nulla da leggere).
  const [editMode, setEditMode] = useState(!project.brief)

  const isDirty = brief !== (project.brief ?? '')

  const saveBrief = async () => {
    setSaving(true)
    await createClient().from('projects').update({ brief: brief.trim() || null }).eq('id', project.id)
    setSaving(false)
    setBriefAiGenerated(false)
    setEditMode(false)                       // torna in lettura
    toast.success('Brief salvato')
  }

  // Annulla: ripristina il testo salvato — le modifiche non confermate si perdono, il brief no.
  const cancelEdit = () => {
    setBrief(project.brief ?? '')
    setBriefAiGenerated(false)
    setEditMode(false)
  }

  const clearBrief = async () => {
    setBrief('')
    setBriefAiGenerated(false)
    await createClient().from('projects').update({ brief: null }).eq('id', project.id)
    toast.success('Brief rimosso')
  }

  const generatePlan = async () => {
    if (!brief.trim()) { toast.error('Scrivi prima il brief oppure usa un template'); return }
    setAiLoad(true); setAiErr(''); setAiPlan(null); setShowAi(true)
    const r = await fetch('/api/ai/generate-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief, project_type: project.project_type, project_name: project.name, company_name: client.company_name, kind: project.project_kind }),
    })
    const data = await r.json()
    setAiLoad(false)
    if (data.error) { setAiErr(data.error); return }
    setAiPlan(data.sprints ?? [])
  }

  const generateBriefFromExisting = async () => {
    setBriefLoad(true)
    setBriefAiGenerated(false)
    try {
      const r = await fetch('/api/ai/generate-brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_type: project.project_type, project_name: project.name,
          company_name: client.company_name, kind: project.project_kind,
          template_label: `${sprintsCount} sprint, ${tasksCount} task già configurati`,
        }),
      })
      const data = await r.json()
      if (data.brief) {
        setBrief(data.brief)
        setBriefAiGenerated(true)
        setEditMode(true)          // il brief AI si rivede prima di confermare
        await createClient().from('projects').update({ brief: data.brief }).eq('id', project.id)
        toast.success('Brief generato!')
      }
    } catch {
      toast.error('Errore generazione brief')
    }
    setBriefLoad(false)
  }

  const handleTemplateSelect = async (plan: AiPlanSprint[], templateLabel: string) => {
    setShowTmpl(false)
    onPlanGenerated(plan)
    setBriefLoad(true)
    setBriefAiGenerated(false)
    try {
      const r = await fetch('/api/ai/generate-brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_type: project.project_type, project_name: project.name,
          company_name: client.company_name, kind: project.project_kind,
          template_label: templateLabel,
        }),
      })
      const data = await r.json()
      if (data.brief) {
        setBrief(data.brief)
        setBriefAiGenerated(true)
        setEditMode(true)          // il brief da template si rivede prima di confermare
        await createClient().from('projects').update({ brief: data.brief }).eq('id', project.id)
      }
    } catch {
      // brief generation is best-effort
    }
    setBriefLoad(false)
  }

  const wordCount = brief.trim().split(/\s+/).filter(Boolean).length

  return (
    <>
      <Section title="Brief del progetto" icon={<FileText className="w-3.5 h-3.5" />} accent={accent}>
        <div className="px-4 pb-4 pt-3">
          {/* Brief AI badge */}
          {briefAiGenerated && (
            <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg w-fit"
              style={{ background: `color-mix(in srgb, ${accent} 7%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 15%, transparent)` }}>
              <Sparkles className="w-3 h-3" style={{ color: accent }} />
              <span className="text-2xs font-bold" style={{ color: accent }}>Brief generato dall&apos;AI — modificalo liberamente</span>
            </div>
          )}

          {/* Empty state with AI generate button when project already has sprints */}
          {isAdmin && !brief && !briefLoading && sprintsCount > 0 && (
            <div className="flex items-center gap-3 mb-3 p-3 rounded-xl border border-dashed border-border">
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: accent }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-primary">Piano già configurato</p>
                <p className="text-2xs text-text-tertiary">{sprintsCount} sprint · {tasksCount} task</p>
              </div>
              <button onClick={generateBriefFromExisting}
                className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: `color-mix(in srgb, ${accent} 8%, transparent)`, color: accent, border: `1px solid color-mix(in srgb, ${accent} 19%, transparent)` }}>
                Genera brief AI
              </button>
            </div>
          )}

          {/* Corpo: LETTURA (default) o EDIT */}
          {briefLoading ? (
            <div className="flex flex-col items-center gap-2.5 py-10">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
              <p className="text-xs text-text-tertiary">L&apos;AI sta scrivendo il brief del progetto…</p>
            </div>
          ) : editMode && isAdmin ? (
            <textarea value={brief} onChange={e => { setBrief(e.target.value); setBriefAiGenerated(false) }}
              autoFocus
              rows={brief ? Math.min(12, Math.max(5, brief.split('\n').length + 2)) : 5}
              placeholder="Descrivi il progetto: obiettivi, target, vincoli, aspettative del cliente…&#10;&#10;Usa un template per generare il brief automaticamente con AI."
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm leading-relaxed text-text-primary resize-none focus:outline-none focus:border-gold/40 placeholder:text-text-tertiary" />
          ) : brief ? (
            <p className="text-sm leading-relaxed text-text-secondary whitespace-pre-line">{brief}</p>
          ) : (
            <p className="text-sm text-text-tertiary italic">Nessun brief disponibile.</p>
          )}

          {/* Azioni */}
          {isAdmin && !briefLoading && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-3">
                <span className="text-2xs text-text-tertiary">{wordCount} parole</span>
                {editMode && brief && (
                  <button onClick={clearBrief}
                    className="text-2xs text-text-tertiary hover:text-error transition-colors flex items-center gap-1">
                    <Trash2 className="w-2.5 h-2.5" /> Elimina
                  </button>
                )}
              </div>

              {editMode ? (
                /* EDIT MODE: template, AI, genera piano, annulla, salva */
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowTmpl(true)}
                    className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary px-3 py-1.5 border border-border hover:border-border-strong rounded-lg transition-colors">
                    <Zap className="w-3 h-3" /> Template + AI
                  </button>
                  {brief.trim() && (
                    <button onClick={generatePlan}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 border rounded-lg transition-colors"
                      style={{ color: accent, borderColor: `color-mix(in srgb, ${accent} 19%, transparent)` }}>
                      <Sparkles className="w-3.5 h-3.5" /> Genera piano
                    </button>
                  )}
                  <button onClick={cancelEdit}
                    className="text-xs px-3 py-1.5 rounded-lg text-text-tertiary hover:text-text-primary border border-border transition-colors">
                    Annulla
                  </button>
                  <button onClick={saveBrief} disabled={saving || !isDirty}
                    className="text-xs px-4 py-1.5 rounded-lg font-bold bg-gold text-on-gold disabled:opacity-30 transition-colors">
                    {saving ? 'Salvo…' : 'Salva'}
                  </button>
                </div>
              ) : (
                /* VIEW MODE: solo la CTA per entrare in modifica */
                <button onClick={() => setEditMode(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors">
                  <Edit2 className="w-3 h-3" /> Modifica brief
                </button>
              )}
            </div>
          )}
        </div>
      </Section>

      {showAi && (
        <AiPlanModal plan={aiPlan} loading={aiLoading} error={aiError}
          onClose={() => { setShowAi(false); setAiPlan(null) }}
          onRegenerate={generatePlan}
          onAccept={plan => { setShowAi(false); setAiPlan(null); onPlanGenerated(plan) }}
          accent={accent}
        />
      )}
      {showTmpl && (
        <TemplatePickerModal
          onClose={() => setShowTmpl(false)}
          onSelect={handleTemplateSelect}
          projectType={project.project_type}
          accent={accent}
        />
      )}
    </>
  )
}

// ─── AI Plan Modal ─────────────────────────────────────────────────────────────
function AiPlanModal({ plan, loading, error, onClose, onRegenerate, onAccept, accent }: {
  plan: AiPlanSprint[] | null; loading: boolean; error: string; accent: string
  onClose: () => void; onAccept: (p: AiPlanSprint[]) => void; onRegenerate: () => void
}) {
  // Il piano è una BOZZA modificabile: si rinomina, si elimina, si seleziona.
  // Solo ciò che resta selezionato viene creato davvero.
  const [draft, setDraft] = useState<AiPlanSprint[]>([])
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => {
    if (!plan) return
    setDraft(plan)
    const init: Record<string, boolean> = {}
    plan.forEach((s, si) => {
      init[`s${si}`] = true
      s.milestones.forEach((m, mi) => {
        init[`m${si}_${mi}`] = true
        m.tasks.forEach((_, ti) => { init[`t${si}_${mi}_${ti}`] = true })
      })
    })
    setSel(init)
    setEditing(null)
  }, [plan])

  const toggle = (k: string) => setSel(p => ({ ...p, [k]: !p[k] }))

  const renameSprintDraft = (si: number, v: string) =>
    setDraft(d => d.map((s, i) => i === si ? { ...s, name: v } : s))
  const renameMilestoneDraft = (si: number, mi: number, v: string) =>
    setDraft(d => d.map((s, i) => i !== si ? s : { ...s, milestones: s.milestones.map((m, j) => j === mi ? { ...m, title: v } : m) }))
  const renameTaskDraft = (si: number, mi: number, ti: number, v: string) =>
    setDraft(d => d.map((s, i) => i !== si ? s : {
      ...s, milestones: s.milestones.map((m, j) => j !== mi ? m : { ...m, tasks: m.tasks.map((t, k) => k === ti ? { ...t, title: v } : t) }),
    }))

  // Elimina = escludi dal piano (basta deselezionare a cascata: niente indici da rinumerare).
  const dropSprint = (si: number) => setSel(p => {
    const n = { ...p, [`s${si}`]: false }
    draft[si]?.milestones.forEach((m, mi) => {
      n[`m${si}_${mi}`] = false
      m.tasks.forEach((_, ti) => { n[`t${si}_${mi}_${ti}`] = false })
    })
    return n
  })
  const dropMilestone = (si: number, mi: number) => setSel(p => {
    const n = { ...p, [`m${si}_${mi}`]: false }
    draft[si]?.milestones[mi]?.tasks.forEach((_, ti) => { n[`t${si}_${mi}_${ti}`] = false })
    return n
  })

  const filtered = draft.map((s, si) => ({
    ...s,
    milestones: s.milestones
      .map((m, mi) => ({ m, mi }))
      .filter(({ mi }) => sel[`m${si}_${mi}`])
      .map(({ m, mi }) => ({ ...m, tasks: m.tasks.filter((_, ti) => sel[`t${si}_${mi}_${ti}`]) })),
  })).filter((_, si) => sel[`s${si}`])

  const total = filtered.reduce((a, s) => a + s.milestones.reduce((b, m) => b + m.tasks.length + 1, 0) + 1, 0)

  const editableTitle = (key: string, value: string, onChange: (v: string) => void, cls: string) =>
    editing === key ? (
      <input autoFocus value={value} onChange={e => onChange(e.target.value)}
        onBlur={() => setEditing(null)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditing(null) }}
        className={`flex-1 bg-background border border-gold/40 rounded px-1.5 py-0.5 focus:outline-none ${cls}`} />
    ) : (
      <button onClick={() => setEditing(key)} title="Clicca per rinominare"
        className={`flex-1 text-left truncate hover:text-gold-text transition-colors ${cls}`}>
        {value}
      </button>
    )

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border shrink-0">
          <Sparkles className="w-4 h-4 text-gold-text" />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-text-primary">Piano AI generato</h2>
            <p className="text-2xs text-text-tertiary">Rinomina, deseleziona o elimina prima di creare</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi"><X className="w-4 h-4 text-text-tertiary hover:text-text-primary" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="w-10 h-10 text-gold-text animate-spin" />
              <p className="text-sm text-text-tertiary">L&apos;AI sta analizzando il brief…</p>
            </div>
          )}
          {error && !loading && <p className="text-sm text-error p-4 bg-error/10 rounded-xl">{error}</p>}
          {!loading && draft.length > 0 && (
            <div className="space-y-3">
              {draft.map((s, si) => {
                const sOn = !!sel[`s${si}`]
                return (
                  <div key={si} className={`border rounded-xl overflow-hidden ${sOn ? 'border-gold/20 bg-background' : 'border-border opacity-40'}`}>
                    {/* Sprint */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                      <button onClick={() => toggle(`s${si}`)} aria-label="Includi sprint"
                        className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${sOn ? 'bg-gold border-gold' : 'border-border'}`}>
                        {sOn && <Check className="w-2.5 h-2.5 text-on-gold" />}
                      </button>
                      <Zap className="w-3.5 h-3.5 text-gold-text shrink-0" />
                      {editableTitle(`s${si}`, s.name, v => renameSprintDraft(si, v), 'text-sm font-bold text-text-primary')}
                      <span className="text-2xs text-text-tertiary shrink-0">{s.duration_weeks} sett.</span>
                      <button onClick={() => dropSprint(si)} aria-label="Elimina sprint dal piano" title="Elimina dal piano"
                        className="shrink-0 p-1 rounded text-text-tertiary hover:text-error hover:bg-error-dim transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {s.milestones.map((m, mi) => {
                      const mOn = !!sel[`m${si}_${mi}`]
                      return (
                        <div key={mi} className={`px-4 py-2.5 border-b border-border last:border-0 ${mOn ? '' : 'opacity-50'}`}>
                          {/* Milestone */}
                          <div className="flex items-center gap-2 mb-1.5">
                            <button onClick={() => toggle(`m${si}_${mi}`)} aria-label="Includi milestone"
                              className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${mOn ? 'bg-gold border-gold' : 'border-border'}`}>
                              {mOn && <Check className="w-2 h-2 text-on-gold" />}
                            </button>
                            <Flag className="w-3 h-3 text-gold-text shrink-0" />
                            {editableTitle(`m${si}_${mi}`, m.title, v => renameMilestoneDraft(si, mi, v), 'text-xs font-bold text-text-primary')}
                            <button onClick={() => dropMilestone(si, mi)} aria-label="Elimina milestone dal piano" title="Elimina dal piano"
                              className="shrink-0 p-1 rounded text-text-tertiary hover:text-error hover:bg-error-dim transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Task */}
                          <div className="pl-7 space-y-1">
                            {m.tasks.map((t, ti) => {
                              const tOn = !!sel[`t${si}_${mi}_${ti}`]
                              return (
                                <div key={ti} className={`flex items-center gap-2 ${tOn ? '' : 'opacity-50'}`}>
                                  <button onClick={() => toggle(`t${si}_${mi}_${ti}`)} aria-label="Includi task"
                                    className={`w-3 h-3 rounded border shrink-0 flex items-center justify-center ${tOn ? 'bg-success border-success' : 'border-border'}`}>
                                    {tOn && <Check className="w-2 h-2 text-on-gold" />}
                                  </button>
                                  <div className="w-1 h-1 rounded-full shrink-0"
                                    style={{ background: PRIORITY_COLORS[t.priority] ?? 'var(--color-border)' }} />
                                  {editableTitle(`t${si}_${mi}_${ti}`, t.title, v => renameTaskDraft(si, mi, ti, v), 'text-2xs text-text-secondary')}
                                  <button onClick={() => setSel(p => ({ ...p, [`t${si}_${mi}_${ti}`]: false }))}
                                    aria-label="Elimina task dal piano" title="Elimina dal piano"
                                    className="shrink-0 p-0.5 rounded text-text-tertiary hover:text-error transition-colors">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {!loading && draft.length > 0 && (
          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
            <button onClick={onRegenerate}
              className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary border border-border px-4 py-2.5 rounded-xl transition-colors">
              <Sparkles className="w-3.5 h-3.5" /> Rigenera
            </button>
            <button onClick={() => onAccept(filtered)} disabled={!total}
              className="flex-1 py-2.5 font-bold rounded-xl text-sm bg-gold text-on-gold disabled:opacity-40 transition-colors">
              Crea piano ({total} elementi)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sprint Timeline mini ──────────────────────────────────────────────────────
function SprintTimeline({ sprints, milestones }: { sprints: ExtSprint[]; milestones: ExtTask[] }) {
  const [hov, setHov] = useState<string | null>(null)
  if (!sprints.length) return null
  const sorted = [...sprints].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
  const rangeS = new Date(sorted[0].start_date).getTime()
  const rangeE = new Date(sorted[sorted.length - 1].end_date).getTime()
  const tot    = rangeE - rangeS || 1
  const spW    = (s: ExtSprint) => Math.max(10, Math.round((new Date(s.end_date).getTime() - new Date(s.start_date).getTime()) / tot * 100))
  const flagP  = (m: ExtTask) => m.due_date ? Math.min(97, Math.max(3, (new Date(m.due_date).getTime() - rangeS) / tot * 100)) : null

  return (
    <div className="pb-4 pt-1">
      <p className="text-2xs text-text-tertiary uppercase tracking-widest font-bold mb-2">Timeline</p>
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(240, sorted.length * 80) }}>
          <div className="flex gap-px h-5 mb-1">
            {sorted.map((s, i) => {
              const a = s.status === 'in_corso', d = s.status === 'completato'
              return (
                <div key={s.id} className={`h-full flex items-center px-1.5 text-2xs font-bold overflow-hidden shrink-0 ${
                  d ? 'bg-success/12 border border-success/20 text-success' :
                  a ? 'bg-gold/12 border border-gold/30 text-gold-text' :
                      'bg-background border border-border text-text-tertiary'
                }`} style={{ width: `${spW(s)}%`, borderRadius: i === 0 ? '4px 0 0 4px' : i === sorted.length - 1 ? '0 4px 4px 0' : 0 }}>
                  <span className="truncate">{d ? '✓ ' : a ? '⚡ ' : ''}{s.name}</span>
                </div>
              )
            })}
          </div>
          {milestones.length > 0 && (
            <div className="relative mt-2" style={{ height: 22 }}>
              <div className="absolute top-2.5 left-0 right-0 h-px bg-surface-hover" />
              {milestones.map(m => {
                const pos = flagP(m); if (pos === null) return null
                const d  = m.status === 'completato'
                const ov = !d && m.due_date && m.due_date < new Date().toISOString().slice(0, 10)
                const c  = d ? 'var(--color-success)' : ov ? 'var(--color-error)' : 'var(--color-gold-text)'
                return (
                  <div key={m.id} className="absolute flex flex-col items-center cursor-pointer"
                    style={{ left: `${pos}%`, transform: 'translateX(-50%)', top: 0 }}
                    onMouseEnter={() => setHov(m.id)} onMouseLeave={() => setHov(null)}>
                    {hov === m.id && (
                      <div className="absolute bottom-full mb-1 whitespace-nowrap bg-background border border-border rounded-lg px-2 py-1 shadow-xl z-20"
                        style={{ left: '50%', transform: 'translateX(-50%)' }}>
                        <p className="text-2xs font-bold text-text-primary">{m.title}</p>
                        {m.due_date && <p className="text-2xs mt-0.5" style={{ color: c }}>{formatDate(m.due_date)}</p>}
                      </div>
                    )}
                    <Flag className="w-2.5 h-2.5" style={{ color: c }} fill={d ? c : 'none'} />
                    <div className="w-px h-1.5" style={{ background: c, opacity: 0.4 }} />
                    <div className="w-1 h-1 rounded-full" style={{ background: c }} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ProgettoView ──────────────────────────────────────────────────────────────
function ProgettoView({ project, client, allSprints, allTasks, profiles, isAdmin, accent, onUpdateTasks, onUpdateSprints }: {
  project: Project; client: Client; allSprints: ExtSprint[]; allTasks: ExtTask[]
  profiles: Profile[]; isAdmin: boolean; accent: string
  onUpdateTasks: (t: ExtTask[]) => void; onUpdateSprints: (s: ExtSprint[]) => void
}) {
  const [addingSprint, setAddSprint]   = useState(false)
  const [sprintDraft, setSprintDraft]  = useState('')
  const [savingSprint, setSavingSprint] = useState(false)
  const spAddRef = useRef<HTMLInputElement>(null)

  const [showReassign, setShowReassign] = useState(false)

  const sorted = [...allSprints].sort((a, b) => ((a.order ?? 0) - (b.order ?? 0)) || new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
  const unassigned = allTasks
    .filter(t => t.is_milestone && !t.sprint_id)
    .sort((a, b) => ((a as ExtTask).order ?? 0) - ((b as ExtTask).order ?? 0))

  const unassignedDrag = useDragReorder(
    () => unassigned,
    updated => onUpdateTasks(allTasks.map(t => updated.find(u => u.id === t.id) ?? t)),
    updated => Promise.all(updated.map(m => createClient().from('tasks').update({ order: (m as ExtTask).order } as never).eq('id', m.id)))
  )

  const sprintDrag = useDragReorder(
    () => sorted,
    updated => onUpdateSprints(updated),
    updated => Promise.all(updated.map(s => createClient().from('sprints').update({ order: s.order } as never).eq('id', s.id)))
  )

  const handlePlanGenerated = async (plan: AiPlanSprint[]) => {
    toast.loading('Creazione piano…', { id: 'plan' })
    const sb = createClient()
    const today = new Date()
    let weekOffset = 0
    const newSprints: ExtSprint[] = []
    const newTasks: ExtTask[] = []

    for (let si = 0; si < plan.length; si++) {
      const sp = plan[si]
      const start = new Date(today); start.setDate(start.getDate() + weekOffset * 7)
      const end   = new Date(today); end.setDate(end.getDate() + (weekOffset + sp.duration_weeks) * 7)
      weekOffset += sp.duration_weeks

      const { data: spData, error: spErr } = await sb.from('sprints').insert({
        project_id: project.id, name: sp.name, status: 'pianificato',
        start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10),
      }).select().single()
      if (spErr || !spData) {
        toast.error(`Errore sprint: ${spErr?.message ?? 'sconosciuto'}`, { id: 'plan' })
        return
      }
      newSprints.push(spData as ExtSprint)

      for (let mi = 0; mi < sp.milestones.length; mi++) {
        const m = sp.milestones[mi]
        const mDate = new Date(start)
        mDate.setDate(mDate.getDate() + Math.ceil((mi + 1) / sp.milestones.length * sp.duration_weeks * 7))

        const { data: mData, error: mErr } = await sb.from('tasks').insert({
          project_id: project.id, title: m.title, status: 'da_fare', priority: 'media',
          is_milestone: true, sprint_id: (spData as ExtSprint).id,
          due_date: mDate.toISOString().slice(0, 10),
        } as never).select().single()
        if (mErr || !mData) {
          toast.error(`Errore milestone: ${mErr?.message ?? 'sconosciuto'}`, { id: 'plan' })
          continue
        }
        newTasks.push(mData as ExtTask)

        if (m.tasks.length) {
          const { data: tData, error: tErr } = await sb.from('tasks').insert(
            m.tasks.map((t: AiPlanTask) => ({
              project_id: project.id, title: t.title, status: 'da_fare',
              priority: t.priority || 'media', is_milestone: false,
              milestone_id: (mData as ExtTask).id,
            }))
          ).select()
          if (tErr) toast.error(`Errore task: ${tErr.message}`)
          if (tData) newTasks.push(...(tData as ExtTask[]))
        }
      }
    }

    onUpdateSprints([...allSprints, ...newSprints])
    onUpdateTasks([...allTasks, ...newTasks])
    toast.success(`Piano creato: ${newSprints.length} sprint, ${newTasks.filter(t => t.is_milestone).length} milestone`, { id: 'plan' })
  }

  const addSprint = async () => {
    if (!sprintDraft.trim()) return
    setSavingSprint(true)
    const today = new Date().toISOString().slice(0, 10)
    const in14  = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
    const { data, error } = await createClient().from('sprints').insert({
      project_id: project.id, name: sprintDraft.trim(), status: 'pianificato',
      start_date: today, end_date: in14, order: allSprints.length,
    } as never).select().single()
    setSavingSprint(false)
    if (error) { toast.error(error.message); return }
    onUpdateSprints([...allSprints, data as ExtSprint])
    setSprintDraft(''); setAddSprint(false)
    toast.success('Sprint aggiunto')
  }

  const deleteSprint = async (id: string) => {
    const milIds = allTasks.filter(t => t.is_milestone && t.sprint_id === id).map(t => t.id)
    const taskIds = allTasks.filter(t => !t.is_milestone && milIds.includes((t as ExtTask).milestone_id ?? '')).map(t => t.id)
    const toDelete = [...milIds, ...taskIds]
    if (toDelete.length) await createClient().from('tasks').delete().in('id', toDelete)
    await createClient().from('sprints').delete().eq('id', id)
    onUpdateSprints(allSprints.filter(s => s.id !== id))
    onUpdateTasks(allTasks.filter(t => !toDelete.includes(t.id)))
    toast.success('Sprint eliminato')
  }

  const allMilestonesInSprints = allTasks.filter(t => t.is_milestone)

  // Editor laterale condiviso: si apre cliccando una task e anche creando
  // una nuova task/milestone da "Aggiungi …".
  const [drawerTask, setDrawerTask] = useState<ExtTask | null>(null)

  // Dal Gantt: porta all'elemento nella pagina (lo apre e ci scrolla), niente popup.
  // Per una milestone va aperto anche lo SPRINT che la contiene, altrimenti resta
  // collassata (non è nel DOM) e lo scroll non trova nulla.
  const [focusIds, setFocusIds] = useState<string[]>([])
  const goToItem = (item: { kind: 'sprint' | 'milestone'; id: string }) => {
    const ids = [item.id]
    if (item.kind === 'milestone') {
      const sprintId = (allTasks.find(t => t.id === item.id) as ExtTask & { sprint_id?: string | null })?.sprint_id
      if (sprintId) ids.push(sprintId)
    }
    setFocusIds(ids)
    // Attende l'espansione dello sprint prima di scrollare all'elemento.
    setTimeout(() => {
      document.getElementById(`${item.kind}-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 160)
  }

  return (
    <div>
      {/* Editor laterale condiviso (task e milestone) */}
      {drawerTask && (
        <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm" onClick={() => setDrawerTask(null)}>
          <div className="absolute inset-y-0 right-0 flex" onClick={e => e.stopPropagation()}>
            <TaskDrawer
              task={drawerTask}
              profiles={profiles}
              canEdit={isAdmin}
              onClose={() => setDrawerTask(null)}
              onPatched={p => {
                onUpdateTasks(allTasks.map(t => t.id === drawerTask.id ? { ...t, ...p } as ExtTask : t))
                setDrawerTask(prev => prev ? { ...prev, ...p } as ExtTask : null)
              }}
              onDelete={async () => {
                await createClient().from('tasks').delete().eq('id', drawerTask.id)
                onUpdateTasks(allTasks.filter(t => t.id !== drawerTask.id))
                setDrawerTask(null)
                toast.success('Eliminata')
              }}
            />
          </div>
        </div>
      )}

      {showReassign && (
        <BulkReassignModal
          tasks={allTasks.filter(t => !t.is_milestone)}
          profiles={profiles}
          onClose={() => setShowReassign(false)}
          onDone={(ids, assigneeId) => {
            onUpdateTasks(allTasks.map(t => ids.includes(t.id) ? { ...t, assignee_id: assigneeId } : t))
            setShowReassign(false)
          }}
        />
      )}

      <BriefPanel project={project} client={client} isAdmin={isAdmin} accent={accent}
        onPlanGenerated={handlePlanGenerated}
        sprintsCount={allSprints.length}
        tasksCount={allTasks.filter(t => !t.is_milestone).length} />

      {/* Gantt: LO STESSO del Workload (componente condiviso) */}
      <Section title="Gantt" icon={<BarChart3 className="w-3.5 h-3.5" />} accent={accent}>
        <ProjectGantt
          project={{
            id: project.id, name: project.name, status: project.status,
            project_kind: project.project_kind, client_id: client.id,
            client_name: client.display_name ?? client.company_name,
            manager_id: project.manager_id ?? null,
          }}
          sprints={allSprints.map(s => ({
            id: s.id, project_id: project.id, name: s.name,
            start_date: s.start_date, end_date: s.end_date, status: s.status,
          }))}
          milestones={allTasks.filter(t => t.is_milestone) as unknown as Parameters<typeof ProjectGantt>[0]['milestones']}
          tasks={allTasks as unknown as Parameters<typeof ProjectGantt>[0]['tasks']}
          editable={isAdmin}
          onItemClick={goToItem}
        />
      </Section>

      {/* Sprint tree */}
      <Section title="Sprint & Milestone" icon={<Zap className="w-3.5 h-3.5" />}
        count={sorted.length} accent={accent}
        right={
          <button
            onClick={() => setShowReassign(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-2xs text-text-tertiary hover:text-text-secondary hover:bg-surface border border-transparent hover:border-border transition-colors"
          >
            <UserCheck className="w-3 h-3" />
            Riassegna
          </button>
        }
      >
        <div className="p-3">
          {sorted.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${accent} 6%, transparent)` }}>
                <Zap className="w-6 h-6" style={{ color: `color-mix(in srgb, ${accent} 31%, transparent)` }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-tertiary">Nessuno sprint ancora</p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {isAdmin ? 'Usa "Template + AI" nel brief per generare un piano, oppure aggiungi sprint manualmente' : 'Il piano di progetto non è ancora stato definito'}
                </p>
              </div>
            </div>
          )}

          {sorted.map(s => (
            <SprintBlock key={s.id} sprint={s} allTasks={allTasks} profiles={profiles}
              isAdmin={isAdmin} projectId={project.id} accent={accent} allSprints={allSprints}
              focusIds={focusIds} onOpenDrawer={setDrawerTask}
              onUpdateTasks={onUpdateTasks}
              onUpdateSprint={updated => onUpdateSprints(allSprints.map(x => x.id === updated.id ? updated : x))}
              onDeleteSprint={deleteSprint}
              dragHandlers={sprintDrag as DragHandlers<ExtSprint>}
            />
          ))}

          {/* Unassigned milestones — fully editable */}
          {(unassigned.length > 0 || isAdmin) && unassigned.length > 0 && (
            <div className="border border-dashed border-border rounded-2xl px-2 pb-2 pt-1 mb-3">
              <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                <Flag className="w-3 h-3 text-text-tertiary shrink-0" />
                <span className="text-2xs text-text-tertiary uppercase tracking-wider font-bold flex-1">Non assegnate a sprint</span>
                <span className="text-2xs text-text-tertiary">{unassigned.length}</span>
              </div>
              {unassigned.map(m => (
                <MilestoneBlock key={m.id} milestone={m} allTasks={allTasks} profiles={profiles}
                  isAdmin={isAdmin} projectId={project.id} accent={accent}
                  onUpdate={onUpdateTasks}
                  dragHandlers={unassignedDrag as DragHandlers<ExtTask>}
                />
              ))}
            </div>
          )}

          {/* Add sprint */}
          {isAdmin && (addingSprint ? (
            <div className="flex items-center gap-2 px-4 py-3 border border-dashed border-border rounded-2xl">
              <Zap className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
              <input ref={spAddRef} value={sprintDraft} onChange={e => setSprintDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addSprint(); if (e.key === 'Escape') { setAddSprint(false); setSprintDraft('') } }}
                placeholder="Nome sprint… es. Sprint 1 — Discovery"
                className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none placeholder:text-text-tertiary" autoFocus />
              <button onClick={addSprint} disabled={savingSprint || !sprintDraft.trim()} className="p-1 text-success disabled:opacity-40">
                {savingSprint ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => { setAddSprint(false); setSprintDraft('') }} className="p-1 text-text-tertiary hover:text-text-primary"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => { setAddSprint(true); setTimeout(() => spAddRef.current?.focus(), 30) }}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm text-text-tertiary hover:text-text-tertiary border border-dashed border-border hover:border-border rounded-2xl transition-colors">
              <Plus className="w-4 h-4" /> Nuovo sprint
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ─── Bulk Reassign Modal ──────────────────────────────────────────────────────
function BulkReassignModal({ tasks, profiles, onClose, onDone }: {
  tasks: ExtTask[]
  profiles: Profile[]
  onClose: () => void
  onDone: (ids: string[], assigneeId: string | null) => void
}) {
  const [selected, setSelected] = useState<string[]>(tasks.map(t => t.id))
  const [assigneeIds, setAssigneeIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const confirm = async () => {
    if (assigneeIds.length === 0 || selected.length === 0) return
    setSaving(true)
    const res = await bulkSetTaskAssignees(selected, assigneeIds)
    setSaving(false)
    if ('error' in res) { toast.error(res.error); return }
    toast.success(`${selected.length} task riassegnat${selected.length === 1 ? 'a' : 'e'}`)
    onDone(selected, res.primaryId)
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-gold-text" />
              Riassegna task
            </h2>
            <p className="text-text-tertiary text-xs mt-0.5">{selected.length} di {tasks.length} selezionate</p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Assignee picker — una o più risorse; la prima è la primaria */}
        <div className="px-5 py-3 border-b border-border shrink-0">
          <label className="text-text-tertiary text-xs mb-1.5 block">Assegna a</label>
          <AssigneePicker profiles={profiles} value={assigneeIds} onChange={setAssigneeIds} />
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-text-tertiary text-xs">Task disponibili</span>
            <button
              onClick={() => setSelected(selected.length === tasks.length ? [] : tasks.map(t => t.id))}
              className="text-xs text-gold-text/60 hover:text-gold-text transition-colors"
            >
              {selected.length === tasks.length ? 'Deseleziona tutte' : 'Seleziona tutte'}
            </button>
          </div>
          {tasks.map(t => {
            const isSelected = selected.includes(t.id)
            const assignee = profiles.find(p => p.id === t.assignee_id)
            return (
              <button
                key={t.id}
                onClick={() => toggle(t.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                  isSelected ? 'bg-gold/5 border border-gold/20' : 'bg-surface border border-border hover:border-border/80'
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? 'bg-gold border-gold' : 'border-border'
                }`}>
                  {isSelected && <Check className="w-2.5 h-2.5 text-on-gold" />}
                </div>
                <span className="text-text-primary text-sm flex-1 truncate">{t.title}</span>
                {assignee && (
                  <span className="text-text-tertiary text-xs shrink-0">{assignee.full_name.split(' ')[0]}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0">
          <button
            onClick={confirm}
            disabled={assigneeIds.length === 0 || selected.length === 0 || saving}
            className="flex-1 py-2.5 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Riassegna ${selected.length} task`}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-text-tertiary text-sm rounded-xl hover:text-text-primary transition-colors">
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit project modal ────────────────────────────────────────────────────────
function EditProjectModal({ project, onClose, onSaved }: {
  project: Project; onClose: () => void; onSaved: (p: Partial<Project>) => void
}) {
  const [form, setForm] = useState({
    name: project.name, description: project.description ?? '', status: project.status,
    project_kind: project.project_kind ?? '',
  })
  const [loading, setLoading] = useState(false)
  const inp = 'w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-gold'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    const patch = {
      name: form.name.trim() || project.name,
      description: form.description || null,
      status: form.status,
      project_kind: form.project_kind || null,
    }
    await createClient().from('projects').update(patch).eq('id', project.id)
    setLoading(false)
    toast.success('Progetto aggiornato')
    onSaved(patch as Partial<Project>)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">Modifica progetto</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-text-tertiary hover:text-text-primary" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div><label className="block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">Nome *</label>
            <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inp} /></div>
          <div><label className="block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">Descrizione</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className={`${inp} resize-none`} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">Stato</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Project['status'] }))} className={inp}>
                {STATUS_PROJECT.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select></div>
            <div><label className="block text-2xs text-text-tertiary mb-1.5 uppercase tracking-wider">Kind</label>
              <select value={form.project_kind} onChange={e => setForm(p => ({ ...p, project_kind: e.target.value }))} className={inp}>
                <option value="">—</option><option value="growth">📈 Growth</option><option value="digital">💻 Digital</option>
              </select></div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-text-tertiary hover:text-text-primary">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-xl text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}Salva
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
let accent = 'var(--color-gold-text)'

export function ProjectPageClient({
  client, project: initialProject, tasks: initialTasks, sprints: initialSprints,
  kpis, currentProfile, allProfiles, comments: initialComments,
  appointments, meetings, backHref,
}: Props) {
  const [activeTab, setActiveTab]         = useState<PageTab>('progetto')
  const [localTasks, setLocalTasks]       = useState<ExtTask[]>(initialTasks as ExtTask[])
  const [localSprints, setLocalSprints]   = useState<ExtSprint[]>(initialSprints as ExtSprint[])
  const [localComments, setLocalComments] = useState(initialComments)
  const [localProject, setLocalProject]   = useState(initialProject)
  const [editOpen, setEditOpen]           = useState(false)
  const [showTimeline, setShowTimeline]   = useState(true)

  const isAdmin = SUPER_ADMIN_EMAILS.includes(currentProfile?.email ?? '')
    || currentProfile?.app_role === 'admin'
    || currentProfile?.app_role === 'manager'

  const isG = localProject.project_kind === 'growth'
  accent = isG ? 'var(--color-gold-text)' : 'var(--color-info)'

  const allMilestones = localTasks.filter(t => t.is_milestone)
  const leafTasks     = localTasks.filter(t => !t.is_milestone && !(t as ExtTask).parent_id)
  const done          = leafTasks.filter(t => t.status === 'completato').length
  const total         = leafTasks.length
  const pct           = total ? Math.round(done / total * 100) : 0
  const overdue       = leafTasks.filter(t => t.status !== 'completato' && t.due_date && t.due_date < new Date().toISOString().slice(0, 10)).length
  const newUpdates    = localComments.filter(c => !c.parent_id && Date.now() - new Date(c.created_at).getTime() < 7 * 86400000).length

  const statusBadgeStyle: Record<string, string> = {
    attivo:      'bg-success/10 text-success border-success/20',
    in_pausa:    'bg-warning/10 text-warning border-warning/20',
    completato:  'bg-surface text-text-tertiary border-border',
    archiviato:  'bg-surface text-text-tertiary border-border',
  }

  const TABS: { key: PageTab; label: string; badge?: number }[] = [
    { key: 'progetto',      label: '📋 Progetto' },
    { key: 'appuntamenti',  label: '📅 Appuntamenti', badge: appointments.filter(a => a.date >= new Date().toISOString().slice(0, 10)).length || undefined },
    { key: 'riunioni',      label: '📖 Riunioni', badge: meetings.length || undefined },
    { key: 'kpi',           label: '📊 KPI' },
    { key: 'aggiornamenti', label: '💬 Aggiornamenti', badge: newUpdates || undefined },
    { key: 'piano_cliente', label: '⭐ Task al cliente' },
    { key: 'chat',          label: '🗨️ Customer Care' },
  ]

  const activeSprint = localSprints.find(s => s.status === 'in_corso')

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* ── Header ── */}
      <div className="border-b border-border bg-background">
        {/* Breadcrumb */}
        <div className="px-4 sm:px-6 pt-4 pb-0">
          <Link href={backHref ?? `/clienti/${client.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> {client.company_name}
          </Link>

          {/* Project info row */}
          <div className="flex items-start gap-3 sm:gap-4 mb-3">
            <ProgressRing pct={pct} size={48} accent={accent} />

            <div className="flex-1 min-w-0">
              {/* Title + edit */}
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-lg sm:text-xl font-black text-text-primary leading-tight">{localProject.name}</h1>
                {isAdmin && (
                  <button onClick={() => setEditOpen(true)}
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors shrink-0">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Badges row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${statusBadgeStyle[localProject.status] ?? ''}`}>
                  {STATUS_PROJECT.find(o => o.v === localProject.status)?.l}
                </span>
                {localProject.project_kind && (
                  <span className="text-2xs font-bold px-2 py-0.5 rounded-full border"
                    style={{ background: `color-mix(in srgb, ${accent} 7%, transparent)`, color: accent, borderColor: `color-mix(in srgb, ${accent} 15%, transparent)` }}>
                    {isG ? '📈 Growth' : '💻 Digital'}
                  </span>
                )}
                {activeSprint && (
                  <span className="text-2xs font-bold px-2 py-0.5 rounded-full border"
                    style={{ background: `color-mix(in srgb, ${accent} 7%, transparent)`, color: accent, borderColor: `color-mix(in srgb, ${accent} 15%, transparent)` }}>
                    ⚡ {activeSprint.name}
                  </span>
                )}
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 mt-1.5 text-2xs text-text-tertiary flex-wrap">
                <span>{done}/{total} task</span>
                {overdue > 0 && <span className="text-error font-bold">⚠ {overdue} scadute</span>}
                {allMilestones.length > 0 && (
                  <span>{allMilestones.filter(m => m.status === 'completato').length}/{allMilestones.length} milestone</span>
                )}
              </div>
            </div>

            {/* §15: CTA "Crea" contestuale — cliente e progetto già precompilati */}
            <ContextualCreate canCreate={isAdmin} ctx={{
              clientId: client.id,
              clientName: client.display_name ?? client.company_name,
              projectId: localProject.id,
              projectName: localProject.name,
              sprints: localSprints.map(s => ({ id: s.id, name: s.name })),
            }} />
          </div>

          {/* Timeline toggle + bar */}
          {localSprints.length > 0 && (
            <div>
              <button onClick={() => setShowTimeline(o => !o)}
                className="flex items-center gap-1.5 text-2xs text-text-tertiary hover:text-text-tertiary transition-colors mb-1">
                {showTimeline ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showTimeline ? 'Nascondi timeline' : 'Mostra timeline'}
              </button>
              {showTimeline && <SprintTimeline sprints={localSprints} milestones={allMilestones} />}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-t border-border px-4 sm:px-6">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key ? '' : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
              style={activeTab === tab.key ? { borderBottomColor: accent, color: accent } : {}}>
              {tab.label}
              {tab.badge && tab.badge > 0 && (
                <span className="absolute -top-0.5 right-0 w-4 h-4 bg-error text-text-primary text-[8px] font-black rounded-full flex items-center justify-center">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 p-3 sm:p-5 w-full">
        {activeTab === 'progetto' && (
          <ProgettoView
            project={localProject} client={client}
            allSprints={localSprints} allTasks={localTasks}
            profiles={allProfiles} isAdmin={isAdmin} accent={accent}
            onUpdateTasks={setLocalTasks}
            onUpdateSprints={setLocalSprints}
          />
        )}
        {activeTab === 'appuntamenti' && (
          <AppointmentsSection project={localProject} client={client} isAdmin={isAdmin} accent={accent}
            profiles={allProfiles} currentUserId={currentProfile.id} />
        )}
        {activeTab === 'riunioni' && (
          <MeetingRecapsSection meetings={meetings} project={localProject} client={client}
            currentProfile={currentProfile} isAdmin={isAdmin} accent={accent}
            sprints={localSprints} milestones={allMilestones} profiles={allProfiles} />
        )}
        {activeTab === 'kpi' && (
          <KpiSection kpis={kpis} project={localProject} client={client} accent={accent} isAdmin={isAdmin} />
        )}
        {activeTab === 'aggiornamenti' && (
          <AggiornamentiFeed comments={localComments} currentProfile={currentProfile}
            projectId={localProject.id} allProfiles={allProfiles} isAdmin={isAdmin}
            onUpdate={setLocalComments} accent={accent} />
        )}
        {activeTab === 'piano_cliente' && (
          <ClientPlanSection project={localProject} client={client} isAdmin={isAdmin} accent={accent} />
        )}
        {activeTab === 'chat' && currentProfile && (
          <ProjectChatSection
            projectId={localProject.id}
            clientId={client.id}
            projectName={localProject.name}
            currentProfile={currentProfile}
            allProfiles={allProfiles}
            isAdmin={isAdmin}
            accent={accent}
          />
        )}
      </div>

      {/* Edit modal */}
      {editOpen && (
        <EditProjectModal project={localProject} onClose={() => setEditOpen(false)}
          onSaved={patch => setLocalProject(p => ({ ...p, ...patch }))} />
      )}
    </div>
  )
}
