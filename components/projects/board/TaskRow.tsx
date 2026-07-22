'use client'

import { useState, useRef } from 'react'
import { GripVertical, ChevronDown, ChevronRight, Check, X, MoreHorizontal, Plus, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { softDeleteTasks } from '@/app/actions/tasks-trash'
import { notifyTasksDeleted } from '@/lib/task-undo'
import { toast } from 'sonner'
import { useSeen } from '@/lib/hooks/useSeen'
import { NewBadge } from '@/components/ui/NewBadge'
import { TaskDrawer } from '@/components/tasks/TaskDrawer'
import type { Task, Profile } from '@/lib/types/database'
import { Avatar, InlineEdit, DatePicker } from '../ProjectPrimitives'
import { PRIORITY_COLORS, type ExtTask } from './types'

// ─── TaskRow ───────────────────────────────────────────────────────────────────
export function TaskRow({ task, allTasks, profiles, isAdmin, depth, projectId, milestoneId, workstreamId, accent, onUpdate, onOpenDrawer }: {
  task: ExtTask; allTasks: ExtTask[]; profiles: Profile[]; isAdmin: boolean
  depth: number; projectId: string; milestoneId: string | null; workstreamId: string; accent: string
  onUpdate: (tasks: ExtTask[]) => void
  onOpenDrawer?: (t: ExtTask) => void
}) {
  const { isNew, markSeen } = useSeen()
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
    notifyTasksDeleted(Array.from(ids))
  }

  const addChild = async () => {
    if (!addDraft.trim()) return
    setAddSaving(true)
    const { data, error } = await createClient().from('tasks').insert({
      project_id: projectId, title: addDraft.trim(), status: 'da_fare',
      priority: 'media', task_type: 'action',
      parent_id: task.id, workstream_id: workstreamId, milestone_id: milestoneId, order: children.length,
    } as never).select().single()
    setAddSaving(false)
    if (error) { toast.error(error.message); return }
    onUpdate([...allTasks, data as ExtTask])
    setAddDraft(''); setAdding(false); setExpanded(true)
    toast.success('Sub-task aggiunto')
  }

  const pl = depth * 18

  return (
    <div id={`task-${task.id}`}>
      {/* Click ovunque sulla riga → editor laterale (i controlli interni fermano l'evento) */}
      <div className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-background transition-colors cursor-pointer"
        style={{ paddingLeft: pl + 12 }}
        onClick={() => { markSeen(task.id, 'task'); if (onOpenDrawer) onOpenDrawer(task); else setShowDetail(true) }}>
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

        {isNew(task.id, task.created_at) && <NewBadge />}

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
          workstreamId={workstreamId} accent={accent} onUpdate={onUpdate} />
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
