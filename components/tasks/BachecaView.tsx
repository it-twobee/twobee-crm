'use client'

import { useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDroppable, useDraggable, closestCorners,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Flag, FileText, Link2, FolderKanban, GripVertical, Loader2, X, ArrowRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Task, Profile } from '@/lib/types/database'

type TaskStatus = 'da_fare' | 'in_corso' | 'in_revisione' | 'completato'

export interface TaskWithMeta extends Task {
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  project: { id: string; name: string; client_id: string; clients: { company_name: string } | null } | null
}

const COLS: TaskStatus[] = ['da_fare', 'in_corso', 'in_revisione', 'completato']

const STATUS_META: Record<TaskStatus, { label: string; color: string; dot: string }> = {
  da_fare:      { label: 'Da fare',      color: 'text-text-secondary', dot: 'bg-text-tertiary' },
  in_corso:     { label: 'In corso',     color: 'text-info',           dot: 'bg-info' },
  in_revisione: { label: 'In revisione', color: 'text-accent',         dot: 'bg-accent' },
  completato:   { label: 'Completato',   color: 'text-success',        dot: 'bg-success' },
}

function deadlineColor(due: string): string {
  const d = new Date(due); d.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (d < today) return 'text-error'
  if (d.getTime() === today.getTime()) return 'text-warning'
  return 'text-text-tertiary'
}

export function BachecaView({ tasks, updateStatus, onSelect }: {
  tasks: TaskWithMeta[]
  updateStatus: (id: string, s: TaskStatus) => Promise<void>
  onSelect: (t: TaskWithMeta) => void
}) {
  // Su schermo stretto si vede una colonna alla volta: quattro colonne a 375px
  // sarebbero illeggibili, e il drag orizzontale in quello spazio è inutilizzabile.
  const [mobileStatus, setMobileStatus] = useState<TaskStatus>('da_fare')
  const [dragging, setDragging] = useState<TaskWithMeta | null>(null)
  const [pending, setPending] = useState<{ task: TaskWithMeta; to: TaskStatus } | null>(null)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(
    // Una piccola soglia distingue il tap dal drag: senza, ogni click aprirebbe
    // il dettaglio invece di iniziare il trascinamento (e viceversa su touch).
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const grouped = useMemo(() => {
    const m: Record<TaskStatus, TaskWithMeta[]> = { da_fare: [], in_corso: [], in_revisione: [], completato: [] }
    for (const t of tasks) m[t.status as TaskStatus]?.push(t)
    return m
  }, [tasks])

  const onDragStart = (e: DragStartEvent) => {
    setDragging(tasks.find(t => t.id === e.active.id) ?? null)
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    const to = e.over?.id as TaskStatus | undefined
    if (!to || !COLS.includes(to)) return
    const task = tasks.find(t => t.id === e.active.id)
    if (!task || task.status === to) return
    // Nessun aggiornamento ottimistico: la card resta dov'è finché non si conferma.
    setPending({ task, to })
  }

  const confirm = async () => {
    if (!pending) return
    setSaving(true)
    await updateStatus(pending.task.id, pending.to)
    setSaving(false)
    setPending(null)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {/* Selettore di stato — solo mobile */}
      <div className="sm:hidden px-4 pt-4">
        <div className="flex gap-1 p-1 rounded-xl bg-surface border border-border" role="tablist" aria-label="Stato">
          {COLS.map(s => (
            <button key={s} role="tab" aria-selected={mobileStatus === s}
              onClick={() => setMobileStatus(s)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-2xs font-semibold transition-colors ${
                mobileStatus === s ? 'bg-gold-dim text-gold-text' : 'text-text-tertiary'
              }`}>
              {STATUS_META[s].label}
              <span className="ml-1 tabular opacity-60">{grouped[s].length}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: una colonna. Tablet: scroll orizzontale con snap. Desktop: 4 colonne. */}
      <div className="h-full overflow-x-auto overflow-y-hidden p-4 sm:snap-x sm:snap-mandatory lg:overflow-x-hidden">
        <div className="flex gap-3 h-full sm:min-w-max lg:min-w-0 lg:grid lg:grid-cols-4">
          {COLS.map(status => (
            <Column
              key={status}
              status={status}
              tasks={grouped[status]}
              onSelect={onSelect}
              updateStatus={updateStatus}
              hiddenOnMobile={status !== mobileStatus}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && <Card task={dragging} isOverlay />}
      </DragOverlay>

      {pending && (
        <ConfirmMoveModal
          task={pending.task}
          to={pending.to}
          saving={saving}
          onCancel={() => setPending(null)}
          onConfirm={confirm}
        />
      )}
    </DndContext>
  )
}

function Column({ status, tasks, onSelect, updateStatus, hiddenOnMobile }: {
  status: TaskStatus
  tasks: TaskWithMeta[]
  onSelect: (t: TaskWithMeta) => void
  updateStatus: (id: string, s: TaskStatus) => Promise<void>
  hiddenOnMobile: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const meta = STATUS_META[status]

  return (
    <section
      ref={setNodeRef}
      aria-label={`${meta.label}, ${tasks.length} task`}
      className={[
        hiddenOnMobile ? 'hidden sm:flex' : 'flex',
        'flex-col rounded-xl border bg-surface transition-colors',
        'w-full sm:w-72 sm:shrink-0 sm:snap-start lg:w-auto',
        isOver ? 'border-gold/50 bg-gold-dim' : 'border-border',
      ].join(' ')}
    >
      <header className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 border-b border-border bg-surface rounded-t-xl">
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
        <h3 className={`text-sm font-bold ${meta.color}`}>{meta.label}</h3>
        <span className="text-xs text-text-tertiary bg-surface-active px-1.5 py-0.5 rounded tabular ml-auto">
          {tasks.length}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[8rem]">
        {tasks.length === 0 && (
          <p className="text-2xs text-text-tertiary text-center py-6">Nessun task</p>
        )}
        {tasks.map(task => (
          <DraggableCard key={task.id} task={task} onSelect={onSelect} updateStatus={updateStatus} />
        ))}
      </div>
    </section>
  )
}

function DraggableCard({ task, onSelect, updateStatus }: {
  task: TaskWithMeta
  onSelect: (t: TaskWithMeta) => void
  updateStatus: (id: string, s: TaskStatus) => Promise<void>
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      className="relative"
    >
      <Card task={task} onSelect={onSelect} updateStatus={updateStatus}
        handleProps={{ ...listeners, ...attributes }} />
    </div>
  )
}

function Card({ task, onSelect, updateStatus, handleProps, isOverlay = false }: {
  task: TaskWithMeta
  onSelect?: (t: TaskWithMeta) => void
  updateStatus?: (id: string, s: TaskStatus) => Promise<void>
  handleProps?: Record<string, unknown>
  isOverlay?: boolean
}) {
  return (
    <article className={[
      'bg-surface border rounded-lg p-3 space-y-2 transition-colors',
      isOverlay ? 'border-gold shadow-lg cursor-grabbing' : 'border-border hover:border-gold/30',
    ].join(' ')}>
      <div className="flex items-start gap-2">
        {!isOverlay && (
          <button
            {...handleProps}
            aria-label={`Sposta ${task.title}`}
            className="shrink-0 mt-0.5 text-text-tertiary hover:text-text-secondary cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
        <button
          onClick={() => onSelect?.(task)}
          disabled={isOverlay}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-sm text-text-primary font-medium">{task.title}</p>
        </button>
      </div>

      {task.project && (
        <div className="flex items-center gap-1.5">
          <FolderKanban className="w-3 h-3 text-text-secondary shrink-0" aria-hidden="true" />
          <span className="text-2xs text-text-secondary truncate">{task.project.name}</span>
          {task.project.clients && (
            <>
              <span className="text-2xs text-text-tertiary">·</span>
              <span className="text-2xs text-text-secondary truncate">{task.project.clients.company_name}</span>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {task.due_date && (
          <span className={`text-2xs tabular ${deadlineColor(task.due_date)}`}>{formatDate(task.due_date)}</span>
        )}
        {task.is_milestone && <Flag className="w-3 h-3 text-gold-text" aria-label="Milestone" />}
        {task.description && <FileText className="w-3 h-3 text-text-tertiary" aria-label="Ha una descrizione" />}
        {(task.links?.length ?? 0) > 0 && <Link2 className="w-3 h-3 text-info" aria-label="Ha dei link" />}
      </div>

      {/* Percorso alternativo al drag: tastiera, screen reader, mobile. */}
      {!isOverlay && updateStatus && (
        <div className="flex gap-1 flex-wrap pt-1 border-t border-border">
          {COLS.filter(s => s !== task.status).map(ns => (
            <button key={ns}
              onClick={e => { e.stopPropagation(); updateStatus(task.id, ns) }}
              className={`text-2xs px-1.5 py-0.5 rounded ${STATUS_META[ns].color} hover:bg-surface-hover transition-colors`}
            >
              → {STATUS_META[ns].label}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}

function ConfirmMoveModal({ task, to, saving, onCancel, onConfirm }: {
  task: TaskWithMeta
  to: TaskStatus
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const from = STATUS_META[task.status as TaskStatus]
  const dest = STATUS_META[to]

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="confirm-move-title"
      className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 id="confirm-move-title" className="text-sm font-bold text-text-primary">Confermi lo spostamento?</h2>
          <button onClick={onCancel} aria-label="Annulla" className="text-text-tertiary hover:text-text-primary">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-text-primary font-medium">{task.title}</p>

          <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <span className={`text-xs font-semibold ${from.color}`}>{from.label}</span>
            <ArrowRight className="w-4 h-4 text-text-tertiary shrink-0" aria-hidden="true" />
            <span className={`text-xs font-semibold ${dest.color}`}>{dest.label}</span>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button onClick={onConfirm} disabled={saving} autoFocus
            className="flex-1 py-2.5 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" aria-hidden="true" /> : 'Conferma'}
          </button>
          <button onClick={onCancel} disabled={saving}
            className="px-4 py-2.5 text-text-tertiary text-sm rounded-xl hover:text-text-primary transition-colors">
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}
