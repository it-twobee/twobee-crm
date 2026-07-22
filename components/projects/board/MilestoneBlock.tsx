'use client'

import { useState, useRef, useEffect } from 'react'
import { GripVertical, ChevronDown, ChevronRight, Flag, Plus, Trash2, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useSeen } from '@/lib/hooks/useSeen'
import { NewBadge } from '@/components/ui/NewBadge'
import type { Profile } from '@/lib/types/database'
import { Avatar, InlineEdit, DatePicker } from '../ProjectPrimitives'
import { updateMilestone, deleteMilestone } from '@/app/actions/workstream-milestones'
import { TaskRow } from './TaskRow'
import { MILESTONE_TYPE_LABEL, type DragHandlers, type ExtTask, type Milestone } from './types'

/**
 * Milestone V2 (139): entità propria, non più una task con `is_milestone`.
 * Le sue task si legano con `tasks.milestone_id`; la milestone resta
 * FACOLTATIVA sulla task (D-2), quindi un'area di lavoro può avere task
 * che non stanno sotto nessuna milestone.
 */
export function MilestoneBlock({ milestone, allTasks, profiles, isAdmin, projectId, workstreamId, accent,
  onUpdate, onMilestonePatched, onMilestoneDeleted, dragHandlers, focusIds, onOpenDrawer }: {
  milestone: Milestone; allTasks: ExtTask[]; profiles: Profile[]
  isAdmin: boolean; projectId: string; workstreamId: string; accent: string
  onUpdate: (t: ExtTask[]) => void
  onMilestonePatched: (id: string, patch: Partial<Milestone>) => void
  onMilestoneDeleted: (id: string) => void
  dragHandlers: DragHandlers<Milestone>
  focusIds?: string[]
  onOpenDrawer?: (t: ExtTask) => void
}) {
  const { isNew, markSeen } = useSeen()
  const [open, setOpen] = useState(false)
  // Arrivo dal Gantt o da "+ Crea": la milestone si apre da sola.
  useEffect(() => { if (focusIds?.includes(milestone.id)) setOpen(true) }, [focusIds, milestone.id])
  const [saving, setSaving] = useState(false)

  const tasks = allTasks
    .filter(t => t.milestone_id === milestone.id && !t.parent_id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const done = tasks.filter(t => t.status === 'completato').length
  const isDone = milestone.status === 'completata'
  const isOver = !isDone && milestone.expected_date && milestone.expected_date < new Date().toISOString().slice(0, 10)
  const milColor = isDone ? 'var(--color-success)' : isOver ? 'var(--color-error)' : accent
  const isD = dragHandlers.dragging === milestone.id
  const isOver2 = dragHandlers.dragOver === milestone.id
  const owner = profiles.find(p => p.id === milestone.owner_id)

  const save = async (patch: Partial<Milestone>) => {
    onMilestonePatched(milestone.id, patch)
    const r = await updateMilestone(milestone.id, projectId, patch)
    if (!r.ok) toast.error(r.error)
  }

  const remove = async () => {
    // Le task NON si cancellano: restano nell'area di lavoro senza milestone.
    if (!confirm("Eliminare la milestone? Le sue task restano nell'area di lavoro.")) return
    onMilestoneDeleted(milestone.id)
    const r = await deleteMilestone(milestone.id, projectId)
    if (!r.ok) toast.error(r.error)
  }

  // "Aggiungi task": crea subito e apre l'editor laterale per compilarla.
  const addTask = async () => {
    setSaving(true)
    const { data, error } = await createClient().from('tasks').insert({
      project_id: projectId, title: 'Nuova task', status: 'da_fare',
      priority: 'media', task_type: 'action',
      workstream_id: workstreamId, milestone_id: milestone.id, order: tasks.length,
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
      onDragOver={e => dragHandlers.onDragOver(e, milestone.id)}
      onDrop={e => dragHandlers.onDrop(e, milestone.id)}
      onDragEnd={dragHandlers.onDragEnd}
    >
      <div className="group flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors cursor-pointer hover:bg-surface-hover"
        onClick={() => { markSeen(milestone.id, 'task'); setOpen(o => !o) }}>
        {isAdmin && <GripVertical className="w-3 h-3 text-text-tertiary shrink-0 cursor-grab" onClick={e => e.stopPropagation()} />}

        <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }} className="shrink-0"
          style={{ color: isDone ? 'var(--color-success)' : 'var(--color-border)' }}
          aria-label={open ? 'Comprimi' : 'Espandi'}>
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <button onClick={e => { e.stopPropagation(); if (isAdmin) save({ status: isDone ? 'da_avviare' : 'completata' }) }}
          className={`shrink-0 transition-all hover:scale-110 ${isAdmin ? 'cursor-pointer' : ''}`}
          aria-label={isDone ? 'Riapri milestone' : 'Completa milestone'}>
          <Flag className="w-3.5 h-3.5" style={{ color: milColor }} fill={isDone ? milColor : 'none'} />
        </button>

        <div className="flex-1 min-w-0">
          <InlineEdit
            value={milestone.title}
            onSave={v => save({ title: v })}
            disabled={!isAdmin}
            className={`text-sm font-semibold block w-full ${isDone ? 'line-through text-text-tertiary' : 'text-text-secondary'}`}
          />
        </div>

        {isNew(milestone.id, milestone.created_at) && <NewBadge />}

        <div className="flex items-center gap-2 ml-1 shrink-0" onClick={e => e.stopPropagation()}>
          {milestone.milestone_type !== 'delivery' && (
            <span className="hidden md:inline text-2xs px-1.5 py-0.5 rounded-full bg-surface text-text-tertiary">
              {MILESTONE_TYPE_LABEL[milestone.milestone_type] ?? milestone.milestone_type}
            </span>
          )}
          {milestone.approval_required && (
            <ShieldCheck className="w-3 h-3 text-info shrink-0" aria-label="Richiede approvazione" />
          )}

          {tasks.length > 0 && (
            <span className="text-2xs font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: done === tasks.length ? 'color-mix(in srgb, var(--color-success) 12%, transparent)' : 'var(--color-surface)',
                color: done === tasks.length ? 'var(--color-success)' : 'var(--color-text-tertiary)',
              }}>
              {done}/{tasks.length}
            </span>
          )}

          <div className="hidden sm:block">
            <DatePicker
              value={milestone.expected_date}
              onChange={v => isAdmin && save({ expected_date: v })}
              disabled={!isAdmin}
              placeholder="Prevista"
              accent={isOver ? 'var(--color-error)' : accent}
            />
          </div>

          {owner && <Avatar name={owner.full_name} size={18} color={accent} />}

          {isAdmin && (
            <button onClick={remove} aria-label="Elimina milestone"
              className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all text-text-tertiary hover:text-error hover:bg-error/10">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="px-2 pb-2 pt-1">
          {tasks.map(t => (
            <TaskRow key={t.id} task={t} allTasks={allTasks} profiles={profiles} onOpenDrawer={onOpenDrawer}
              isAdmin={isAdmin} depth={0} projectId={projectId} milestoneId={milestone.id}
              workstreamId={workstreamId} accent={accent} onUpdate={onUpdate} />
          ))}

          {tasks.length === 0 && (
            <p className="px-3 py-2 text-2xs text-text-tertiary">Nessuna task in questa milestone.</p>
          )}

          {isAdmin && (
            <button onClick={addTask} disabled={saving}
              className="flex items-center gap-1.5 w-full px-3 py-1.5 text-2xs text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-40">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Aggiungi task
            </button>
          )}
        </div>
      )}
    </div>
  )
}
