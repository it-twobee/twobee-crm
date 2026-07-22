'use client'

import { useState, useRef, useEffect } from 'react'
import { GripVertical, ChevronDown, ChevronRight, Flag, Check, X, Trash2, Loader2, Plus, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useSeen } from '@/lib/hooks/useSeen'
import { NewBadge } from '@/components/ui/NewBadge'
import type { Profile } from '@/lib/types/database'
import { InlineEdit, DatePicker, ProgressBar } from '../ProjectPrimitives'
import { updatePhase, deletePhase } from '@/app/actions/project-phases'
import { createMilestone, reorderMilestones } from '@/app/actions/workstream-milestones'
import { MilestoneBlock } from './MilestoneBlock'
import { TaskRow } from './TaskRow'
import { useDragReorder } from './useDragReorder'
import { STATUS_WS_OPTS, STATUS_WS_LABEL, type DragHandlers, type ExtTask, type Milestone, type Workstream } from './types'

/**
 * Area di lavoro (`project_workstreams`) — ha preso il posto dello Sprint.
 * Differenza sostanziale: lo sprint era una finestra TEMPORALE e le milestone
 * ci stavano dentro per data; l'area di lavoro è un filone LOGICO e più aree
 * corrono in parallelo.
 *
 * Dentro ci stanno le Milestone e — poiché la milestone è facoltativa (D-2) —
 * anche le task che non ne hanno nessuna, raccolte in fondo.
 */
export function WorkstreamBlock({ workstream, allTasks, milestones, profiles, isAdmin, projectId, accent,
  index, onUpdateTasks, onPatched, onDeleted,
  onMilestoneAdded, onMilestonePatched, onMilestoneDeleted, onMilestonesReordered,
  dragHandlers, focusIds, onOpenDrawer }: {
  workstream: Workstream; allTasks: ExtTask[]; milestones: Milestone[]; profiles: Profile[]
  isAdmin: boolean; projectId: string; accent: string; index: number
  onUpdateTasks: (t: ExtTask[]) => void
  onPatched: (id: string, patch: Partial<Workstream>) => void
  onDeleted: (id: string) => void
  onMilestoneAdded: (m: Milestone) => void
  onMilestonePatched: (id: string, patch: Partial<Milestone>) => void
  onMilestoneDeleted: (id: string) => void
  onMilestonesReordered: (ordered: Milestone[]) => void
  dragHandlers: DragHandlers<Workstream>
  focusIds?: string[]
  onOpenDrawer?: (t: ExtTask) => void
}) {
  const { isNew, markSeen } = useSeen()
  const [open, setOpen] = useState(false)
  useEffect(() => { if (focusIds?.includes(workstream.id)) setOpen(true) }, [focusIds, workstream.id])
  const [addingM, setAddM] = useState(false)
  const [mDraft, setMDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const addRef = useRef<HTMLInputElement>(null)

  const mine = milestones
    .filter(m => m.workstream_id === workstream.id)
    .sort((a, b) => a.sort_order - b.sort_order)

  const tasksHere = allTasks.filter(t => t.workstream_id === workstream.id && !t.parent_id)
  // La milestone è facoltativa: queste task stanno nell'area ma sotto nessuna.
  const loose = tasksHere.filter(t => !t.milestone_id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const done = tasksHere.filter(t => t.status === 'completato').length
  const total = tasksHere.length
  const pct = total ? Math.round(done / total * 100) : 0

  const isActive = workstream.status === 'in_corso'
  const isDone = workstream.status === 'completata'
  const isD = dragHandlers.dragging === workstream.id
  const isOver = dragHandlers.dragOver === workstream.id

  const save = async (patch: Partial<Workstream>) => {
    onPatched(workstream.id, patch)
    const r = await updatePhase(workstream.id, projectId, patch as Record<string, never>)
    if (!r.ok) toast.error(r.error)
  }

  const remove = async () => {
    if (!confirm("Eliminare l'area di lavoro? Le task restano nel progetto, senza area.")) return
    onDeleted(workstream.id)
    const r = await deletePhase(workstream.id, projectId)
    if (!r.ok) toast.error(r.error)
  }

  const addMilestone = async () => {
    if (!mDraft.trim()) return
    setSaving(true)
    const r = await createMilestone(projectId, { workstreamId: workstream.id, title: mDraft.trim() })
    setSaving(false)
    if (!r.ok) { toast.error(r.error); return }
    onMilestoneAdded(r.milestone)
    setMDraft(''); setAddM(false); setOpen(true)
  }

  const addLooseTask = async () => {
    const { data, error } = await createClient().from('tasks').insert({
      project_id: projectId, title: 'Nuova task', status: 'da_fare',
      priority: 'media', task_type: 'action',
      workstream_id: workstream.id, order: loose.length,
    } as never).select().single()
    if (error) { toast.error(error.message); return }
    const created = data as ExtTask
    onUpdateTasks([...allTasks, created])
    setOpen(true)
    onOpenDrawer?.(created)
  }

  const milDrag = useDragReorder<Milestone>(
    () => mine,
    updated => onMilestonesReordered(updated),
    updated => reorderMilestones(projectId, workstream.id, updated.map(m => m.id)),
  )

  const borderColor = isDone
    ? 'color-mix(in srgb, var(--color-success) 25%, transparent)'
    : isActive ? `color-mix(in srgb, ${accent} 21%, transparent)` : 'var(--color-surface)'
  const accentColor = isDone ? 'var(--color-success)' : isActive ? accent : 'var(--color-border-strong)'
  const owner = profiles.find(p => p.id === workstream.owner_id)

  return (
    <div id={`workstream-${workstream.id}`}
      className={`rounded-2xl overflow-hidden mb-3 transition-all ${isD ? 'opacity-30 scale-[0.99]' : ''} ${isOver ? 'ring-1 ring-warning/20' : ''}`}
      style={{ border: `1px solid ${borderColor}` }}
      draggable={isAdmin}
      onDragStart={e => dragHandlers.onDragStart(e, workstream.id)}
      onDragOver={e => dragHandlers.onDragOver(e, workstream.id)}
      onDrop={e => dragHandlers.onDrop(e, workstream.id)}
      onDragEnd={dragHandlers.onDragEnd}
    >
      <div className="group"
        style={{
          background: isDone ? 'color-mix(in srgb, var(--color-success) 4%, transparent)'
            : isActive ? `color-mix(in srgb, ${accent} 2%, transparent)` : 'var(--color-background)',
          borderBottom: open ? `1px solid ${borderColor}` : 'none',
        }}>
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${accentColor} 38%, transparent), transparent)` }} />

        <div className="flex items-center gap-2.5 px-4 py-3 cursor-pointer"
          onClick={() => { markSeen(workstream.id, 'sprint'); setOpen(o => !o) }}>
          {isAdmin && <GripVertical className="w-3.5 h-3.5 text-text-tertiary shrink-0 cursor-grab" onClick={e => e.stopPropagation()} />}

          <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }} className="shrink-0"
            style={{ color: isDone ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
            aria-label={open ? 'Comprimi' : 'Espandi'}>
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          <div className="w-6 h-6 rounded-md flex items-center justify-center text-2xs font-black shrink-0"
            style={{ background: `color-mix(in srgb, ${accentColor} 8%, transparent)`, color: accentColor }}>
            {index + 1}
          </div>

          <div className="flex-1 min-w-0">
            <InlineEdit
              value={workstream.name}
              onSave={v => save({ name: v })}
              disabled={!isAdmin}
              className={`text-sm font-bold block w-full ${isDone ? 'text-success' : isActive ? 'text-text-primary' : 'text-text-tertiary'}`}
            />
          </div>

          {isNew(workstream.id, workstream.created_at) && <NewBadge />}

          {isAdmin ? (
            <select value={workstream.status}
              onChange={e => save({ status: e.target.value })}
              onClick={e => e.stopPropagation()}
              aria-label="Stato area di lavoro"
              className="text-2xs font-bold px-2 py-1 rounded-lg border focus:outline-none bg-transparent cursor-pointer shrink-0"
              style={{ borderColor: `color-mix(in srgb, ${accentColor} 19%, transparent)`, color: accentColor }}>
              {STATUS_WS_OPTS.map(v => <option key={v} value={v} className="bg-background text-text-primary">{STATUS_WS_LABEL[v]}</option>)}
            </select>
          ) : (
            <span className="text-2xs font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: `color-mix(in srgb, ${accentColor} 7%, transparent)`, color: accentColor }}>
              {STATUS_WS_LABEL[workstream.status]}
            </span>
          )}

          <div className="hidden lg:flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
            <DatePicker value={workstream.start_date} onChange={v => save({ start_date: v })}
              disabled={!isAdmin} placeholder="Inizio" accent={accentColor} showIcon={false} />
            <span className="text-text-tertiary text-xs">→</span>
            <DatePicker value={workstream.end_date} onChange={v => save({ end_date: v })}
              disabled={!isAdmin} placeholder="Fine" accent={accentColor} showIcon={false} />
          </div>

          {owner && (
            <span className="hidden xl:flex items-center gap-1 text-2xs text-text-tertiary shrink-0">
              <Users className="w-3 h-3" /> {owner.full_name?.split(' ')[0]}
            </span>
          )}

          {total > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 w-20 shrink-0">
              <ProgressBar pct={pct} accent={accentColor} />
            </div>
          )}

          {isAdmin && (
            <button onClick={e => { e.stopPropagation(); remove() }} aria-label="Elimina area di lavoro"
              className="p-1.5 rounded-lg text-text-tertiary hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="p-3 space-y-1.5 bg-background">
          {mine.length === 0 && loose.length === 0 && !addingM && (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <Flag className="w-5 h-5 text-text-tertiary" />
              <p className="text-xs text-text-tertiary">Nessuna milestone in quest&apos;area di lavoro</p>
            </div>
          )}

          {mine.map(m => (
            <MilestoneBlock key={m.id} milestone={m} allTasks={allTasks} profiles={profiles}
              isAdmin={isAdmin} projectId={projectId} workstreamId={workstream.id} accent={accent}
              focusIds={focusIds} onOpenDrawer={onOpenDrawer}
              onUpdate={onUpdateTasks}
              onMilestonePatched={onMilestonePatched}
              onMilestoneDeleted={onMilestoneDeleted}
              dragHandlers={milDrag} />
          ))}

          {/* Task senza milestone: legittime (D-2), non un errore da correggere. */}
          {loose.length > 0 && (
            <div className="border border-dashed border-border rounded-xl px-2 pb-2 pt-1 mt-2">
              <p className="px-2 py-1 text-2xs text-text-tertiary uppercase tracking-wider font-bold">
                Senza milestone · {loose.length}
              </p>
              {loose.map(t => (
                <TaskRow key={t.id} task={t} allTasks={allTasks} profiles={profiles} onOpenDrawer={onOpenDrawer}
                  isAdmin={isAdmin} depth={0} projectId={projectId} milestoneId={null}
                  workstreamId={workstream.id} accent={accent} onUpdate={onUpdateTasks} />
              ))}
            </div>
          )}

          {isAdmin && (addingM ? (
            <div className="flex items-center gap-2 px-3 py-2.5 border border-dashed rounded-xl"
              style={{ borderColor: `color-mix(in srgb, ${accent} 19%, transparent)`, background: `color-mix(in srgb, ${accent} 2%, transparent)` }}>
              <Flag className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />
              <input ref={addRef} value={mDraft} onChange={e => setMDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addMilestone(); if (e.key === 'Escape') { setAddM(false); setMDraft('') } }}
                placeholder="Nome milestone… premi Invio"
                aria-label="Nome milestone"
                className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none placeholder:text-text-tertiary"
                autoFocus />
              <button onClick={addMilestone} disabled={saving || !mDraft.trim()} aria-label="Conferma" className="p-1 text-success disabled:opacity-40">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </button>
              <button onClick={() => { setAddM(false); setMDraft('') }} aria-label="Annulla" className="p-1 text-text-tertiary hover:text-text-primary"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setAddM(true); setTimeout(() => addRef.current?.focus(), 30) }}
                className="flex items-center gap-2 flex-1 px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary border border-dashed border-border rounded-xl transition-all">
                <Flag className="w-3 h-3" /> Aggiungi milestone
              </button>
              <button onClick={addLooseTask}
                className="flex items-center gap-2 px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary border border-dashed border-border rounded-xl transition-all">
                <Plus className="w-3 h-3" /> Task
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
