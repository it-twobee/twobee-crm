'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  X, Plus, Flag, CheckSquare, ChevronDown, ChevronRight, Trash2, Repeat,
  Pencil, CornerDownRight, Loader2, Calendar, User,
} from 'lucide-react'
import { createMilestone, updateMilestone, deleteMilestone } from '@/app/actions/milestones'
import { updateWorkstream, deleteWorkstream } from '@/app/actions/workstreams'
import { createProjectTask, updateTaskStatus, deleteTask } from '@/app/actions/tasks'
import { createRecurring, updateRecurring, deleteRecurring } from '@/app/actions/recurring'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import type { RecurrenceFrequency } from '@/lib/types/database'
import type {
  ProjectWorkstream, Milestone, Task, RecurringTaskTemplate, WorkstreamStatus,
} from '@/lib/types/database'

type Person = { id: string; full_name: string; avatar_url: string | null }

const MS_BADGE: Record<string, string> = {
  da_fare: 'bg-surface-active text-text-tertiary', in_corso: 'bg-info-dim text-info',
  in_approvazione: 'bg-warning-dim text-warning', completata: 'bg-success-dim text-success',
}
const WS_STATUS: WorkstreamStatus[] = ['draft', 'active', 'paused', 'completed', 'archived']
const WS_STATUS_LABEL: Record<string, string> = {
  draft: 'Bozza', active: 'Attiva', paused: 'In pausa', completed: 'Completata', archived: 'Archiviata',
}

export function WorkstreamEditor({
  ws, projectId, clientId, milestones, tasks, recurring, profiles, canEdit, focusMilestoneId, onClose,
}: {
  ws: ProjectWorkstream
  projectId: string
  clientId: string
  milestones: Milestone[]
  tasks: Task[]
  recurring: RecurringTaskTemplate[]
  profiles: Person[]
  canEdit: boolean
  focusMilestoneId?: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [taskDetail, setTaskDetail] = useState<Task | null>(null)
  const [addingMs, setAddingMs] = useState(false)
  const [newMs, setNewMs] = useState('')

  const act = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const wsMilestones = milestones.filter(m => m.workstream_id === ws.id)
    .sort((a, b) => (a.milestone_type === 'system' ? 1 : 0) - (b.milestone_type === 'system' ? 1 : 0) || a.sort_order - b.sort_order)
  const systemMilestoneId = milestones.find(m => m.workstream_id === ws.id && m.milestone_type === 'system')?.id
    ?? wsMilestones[0]?.id ?? ''
  const topTasks = (msId: string) => tasks.filter(t => t.milestone_id === msId && !t.parent_task_id)
  const subtasks = (parentId: string) => tasks.filter(t => t.parent_task_id === parentId)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-scrim animate-fade-in" onClick={onClose}>
      <div className="bg-surface border-l border-border w-full max-w-2xl h-full flex flex-col shadow-drawer animate-slide-in-right pt-safe" onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${ws.workstream_type === 'recurring' ? 'bg-success-dim text-success' : 'bg-surface-active text-text-tertiary'}`}>
                {ws.workstream_type === 'recurring' ? 'Continuativa' : 'A termine'}
              </span>
              {canEdit && (
                <select value={ws.status} disabled={pending}
                  onChange={e => act(() => updateWorkstream(ws.id, projectId, { status: e.target.value as WorkstreamStatus }), 'Stato aggiornato')}
                  aria-label="Stato workstream"
                  className="text-2xs font-semibold bg-background border border-border-interactive rounded px-1.5 py-0.5 text-text-primary">
                  {WS_STATUS.map(s => <option key={s} value={s}>{WS_STATUS_LABEL[s]}</option>)}
                </select>
              )}
            </div>
            <h2 className="text-lg font-bold text-text-primary font-heading mt-1.5 truncate">{ws.name}</h2>
            {ws.workstream_type === 'project' && (ws.start_date || ws.end_date) && (
              <p className="text-2xs text-text-tertiary mt-0.5 tabular">{ws.start_date ?? '—'} → {ws.end_date ?? '—'}</p>
            )}
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary press"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {wsMilestones.map(m => (
            <MilestoneBlock key={m.id} m={m} projectId={projectId} clientId={clientId} wsId={ws.id}
              tasks={topTasks(m.id)} subtasksOf={subtasks} profiles={profiles} canEdit={canEdit}
              act={act} pending={pending} onOpenTask={setTaskDetail} focus={m.id === focusMilestoneId} />
          ))}

          {/* Ricorrenti della workstream — CRUD completo */}
          <RecurringPanel
            recurring={recurring.filter(r => r.workstream_id === ws.id)}
            projectId={projectId} clientId={clientId} wsId={ws.id}
            systemMilestoneId={systemMilestoneId} profiles={profiles} canEdit={canEdit}
            act={act} pending={pending} />

          {canEdit && (
            addingMs ? (
              <div className="flex items-center gap-2">
                <input value={newMs} onChange={e => setNewMs(e.target.value)} autoFocus placeholder="Titolo milestone"
                  onKeyDown={e => { if (e.key === 'Enter' && newMs.trim()) { act(() => createMilestone({ project_id: projectId, workstream_id: ws.id, title: newMs }), 'Milestone creata'); setNewMs(''); setAddingMs(false) } }}
                  className="flex-1 bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary" />
                <button onClick={() => { if (newMs.trim()) { act(() => createMilestone({ project_id: projectId, workstream_id: ws.id, title: newMs }), 'Milestone creata'); setNewMs(''); setAddingMs(false) } }}
                  className="text-2xs font-semibold bg-gold text-on-gold px-3 py-2 rounded-lg">Aggiungi</button>
                <button onClick={() => { setAddingMs(false); setNewMs('') }} aria-label="Annulla" className="text-text-tertiary"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <button onClick={() => setAddingMs(true)}
                className="flex items-center gap-1.5 text-2xs font-semibold text-gold-text hover:opacity-80 press">
                <Plus className="w-3.5 h-3.5" />Nuova milestone
              </button>
            )
          )}
        </div>

        {canEdit && (
          <div className="p-3 border-t border-border flex items-center justify-between">
            <button onClick={() => { if (confirm(`Eliminare la workstream "${ws.name}" e tutto il suo contenuto?`)) { act(() => deleteWorkstream(ws.id, projectId), 'Workstream eliminata'); onClose() } }}
              className="flex items-center gap-1 text-2xs font-semibold text-error hover:opacity-80">
              <Trash2 className="w-3.5 h-3.5" />Elimina workstream
            </button>
            {pending && <Loader2 className="w-4 h-4 text-text-tertiary animate-spin" />}
          </div>
        )}
      </div>

      {taskDetail && (
        <TaskDetailDrawer task={taskDetail} profiles={profiles.map(p => ({ id: p.id, full_name: p.full_name }))} canEdit={canEdit}
          contextLabel={ws.name} onClose={() => setTaskDetail(null)} onChanged={() => router.refresh()} />
      )}
    </div>
  )
}

function MilestoneBlock({
  m, projectId, clientId, wsId, tasks, subtasksOf, profiles, canEdit, act, pending, onOpenTask, focus,
}: {
  m: Milestone
  projectId: string
  clientId: string
  wsId: string
  tasks: Task[]
  subtasksOf: (parentId: string) => Task[]
  profiles: Person[]
  canEdit: boolean
  act: (fn: () => Promise<unknown>, ok?: string) => void
  pending: boolean
  onOpenTask: (t: Task) => void
  focus?: boolean
}) {
  const [open, setOpen] = useState(true)
  const [addingTask, setAddingTask] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(m.title)
  const ref = useRef<HTMLDivElement>(null)

  // milestone aperta da un click sul calendario: scrolla in vista + apre l'edit del titolo
  useEffect(() => {
    if (focus && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (canEdit && m.milestone_type !== 'system') { setTitle(m.title); setEditingTitle(true) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  const done = tasks.filter(t => t.status === 'completato').length
  const ownerName = m.owner_id ? (profiles.find(p => p.id === m.owner_id)?.full_name ?? '—') : null

  return (
    <div ref={ref} className={`bg-background border rounded-xl transition-colors ${focus ? 'border-gold shadow-soft' : 'border-border'}`}>
      <div className="flex items-center gap-2 p-3">
        <button onClick={() => setOpen(o => !o)} aria-label="Espandi" className="text-text-tertiary shrink-0">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <Flag className={`w-4 h-4 shrink-0 ${m.milestone_type === 'system' ? 'text-text-tertiary' : 'text-info'}`} />
        {editingTitle && canEdit ? (
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
            onBlur={() => { if (title.trim() && title !== m.title) act(() => updateMilestone(m.id, projectId, { title }), 'Salvato'); setEditingTitle(false) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="flex-1 bg-surface border border-border-interactive rounded px-2 py-1 text-sm text-text-primary" />
        ) : (
          <span className="flex-1 text-sm font-semibold text-text-primary truncate">{m.title}</span>
        )}
        <span className="text-2xs text-text-tertiary shrink-0 tabular">{done}/{tasks.length}</span>
        {canEdit && (
          <select value={m.status} disabled={pending}
            onChange={e => act(() => updateMilestone(m.id, projectId, { status: e.target.value as Milestone['status'] }), 'Stato aggiornato')}
            aria-label="Stato milestone"
            className={`text-2xs font-semibold rounded-full px-2 py-0.5 border-0 shrink-0 ${MS_BADGE[m.status]}`}>
            <option value="da_fare">Da fare</option>
            <option value="in_corso">In corso</option>
            <option value="in_approvazione">In approvazione</option>
            <option value="completata">Completata</option>
          </select>
        )}
        {canEdit && m.milestone_type !== 'system' && (
          <>
            <button onClick={() => setEditingTitle(true)} aria-label="Rinomina" className="text-text-tertiary hover:text-text-primary shrink-0"><Pencil className="w-3 h-3" /></button>
            <button onClick={() => { if (confirm(`Eliminare la milestone "${m.title}"?`)) act(() => deleteMilestone(m.id, projectId), 'Eliminata') }}
              aria-label="Elimina" className="text-error shrink-0"><Trash2 className="w-3 h-3" /></button>
          </>
        )}
      </div>

      {open && (
        <div className="border-t border-border p-2 pl-4 space-y-1">
          {/* meta milestone: scadenza + assegnatario */}
          {m.milestone_type !== 'system' && (
            <div className="flex flex-wrap items-center gap-3 px-1 pb-2 mb-1 border-b border-border/60">
              <label className="flex items-center gap-1.5 text-2xs text-text-tertiary">
                <Calendar className="w-3.5 h-3.5" />
                <input type="date" defaultValue={m.due_date ?? ''} disabled={!canEdit}
                  onBlur={e => { if (e.target.value !== (m.due_date ?? '')) act(() => updateMilestone(m.id, projectId, { due_date: e.target.value || null }), 'Scadenza aggiornata') }}
                  className="bg-surface border border-border-interactive rounded px-2 py-1 text-2xs text-text-primary" />
              </label>
              <label className="flex items-center gap-1.5 text-2xs text-text-tertiary">
                <User className="w-3.5 h-3.5" />
                <select value={m.owner_id ?? ''} disabled={!canEdit}
                  onChange={e => act(() => updateMilestone(m.id, projectId, { owner_id: e.target.value || null }), 'Assegnatario aggiornato')}
                  className="bg-surface border border-border-interactive rounded px-2 py-1 text-2xs text-text-primary">
                  <option value="">Nessun responsabile</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </label>
              {ownerName && <span className="text-2xs text-text-tertiary">· {ownerName}</span>}
            </div>
          )}
          {tasks.length === 0 && <p className="text-2xs text-text-tertiary px-2 py-1">Nessuna task.</p>}
          {tasks.map(t => (
            <TaskRow key={t.id} t={t} subs={subtasksOf(t.id)} projectId={projectId} clientId={clientId} wsId={wsId} milestoneId={m.id}
              canEdit={canEdit} act={act} onOpenTask={onOpenTask} />
          ))}
          {canEdit && (
            addingTask ? (
              <div className="flex items-center gap-2 px-1 pt-1">
                <input value={newTask} onChange={e => setNewTask(e.target.value)} autoFocus placeholder="Titolo task"
                  onKeyDown={e => { if (e.key === 'Enter' && newTask.trim()) { act(() => createProjectTask({ client_id: clientId, project_id: projectId, workstream_id: wsId, milestone_id: m.id, title: newTask }), 'Task creata'); setNewTask(''); setAddingTask(false) } }}
                  className="flex-1 bg-surface border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary" />
                <button onClick={() => { if (newTask.trim()) { act(() => createProjectTask({ client_id: clientId, project_id: projectId, workstream_id: wsId, milestone_id: m.id, title: newTask }), 'Task creata'); setNewTask(''); setAddingTask(false) } }}
                  className="text-2xs font-semibold bg-gold text-on-gold px-2.5 py-1.5 rounded">OK</button>
                <button onClick={() => { setAddingTask(false); setNewTask('') }} aria-label="Annulla" className="text-text-tertiary"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button onClick={() => setAddingTask(true)} className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text px-1 pt-1">
                <Plus className="w-3 h-3" />Task
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({
  t, subs, projectId, clientId, wsId, milestoneId, canEdit, act, onOpenTask,
}: {
  t: Task
  subs: Task[]
  projectId: string
  clientId: string
  wsId: string
  milestoneId: string
  canEdit: boolean
  act: (fn: () => Promise<unknown>, ok?: string) => void
  onOpenTask: (t: Task) => void
}) {
  const [addingSub, setAddingSub] = useState(false)
  const [newSub, setNewSub] = useState('')
  const doneSubs = subs.filter(s => s.status === 'completato').length

  const Toggle = ({ task }: { task: Task }) => (
    <button disabled={!canEdit} aria-label="Completa"
      onClick={() => act(() => updateTaskStatus(task.id, task.status === 'completato' ? 'da_fare' : 'completato'))}
      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${task.status === 'completato' ? 'bg-success border-success' : 'border-border-strong'}`}>
      {task.status === 'completato' && <CheckSquare className="w-3 h-3 text-on-gold" />}
    </button>
  )

  return (
    <div className="rounded-lg">
      <div className="flex items-center gap-2 px-1 py-1 group">
        <Toggle task={t} />
        <button onClick={() => onOpenTask(t)} className={`flex-1 text-left text-sm truncate ${t.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-primary'} hover:text-gold-text`}>
          {t.title}
        </button>
        {subs.length > 0 && <span className="text-2xs text-text-tertiary shrink-0 tabular">{doneSubs}/{subs.length}</span>}
        {canEdit && (
          <>
            <button onClick={() => setAddingSub(v => !v)} aria-label="Aggiungi subtask" className="text-text-tertiary hover:text-gold-text opacity-0 group-hover:opacity-100 shrink-0"><CornerDownRight className="w-3.5 h-3.5" /></button>
            <button onClick={() => { if (confirm('Eliminare la task e le sue subtask?')) act(() => deleteTask(t.id), 'Eliminata') }} aria-label="Elimina" className="text-error opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="w-3 h-3" /></button>
          </>
        )}
      </div>

      {/* subtask */}
      {subs.length > 0 && (
        <div className="pl-7 space-y-0.5">
          {subs.map(s => (
            <div key={s.id} className="flex items-center gap-2 py-0.5 group/sub">
              <Toggle task={s} />
              <button onClick={() => onOpenTask(s)} className={`flex-1 text-left text-2xs truncate ${s.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-secondary'} hover:text-gold-text`}>
                {s.title}
              </button>
              {canEdit && <button onClick={() => act(() => deleteTask(s.id))} aria-label="Elimina subtask" className="text-error opacity-0 group-hover/sub:opacity-100 shrink-0"><Trash2 className="w-3 h-3" /></button>}
            </div>
          ))}
        </div>
      )}

      {addingSub && canEdit && (
        <div className="pl-7 flex items-center gap-2 py-1">
          <input value={newSub} onChange={e => setNewSub(e.target.value)} autoFocus placeholder="Titolo subtask"
            onKeyDown={e => { if (e.key === 'Enter' && newSub.trim()) { act(() => createProjectTask({ client_id: clientId, project_id: projectId, workstream_id: wsId, milestone_id: milestoneId, title: newSub, parent_task_id: t.id }), 'Subtask creata'); setNewSub(''); setAddingSub(false) } }}
            className="flex-1 bg-surface border border-border-interactive rounded px-2 py-1 text-2xs text-text-primary" />
          <button onClick={() => { if (newSub.trim()) { act(() => createProjectTask({ client_id: clientId, project_id: projectId, workstream_id: wsId, milestone_id: milestoneId, title: newSub, parent_task_id: t.id }), 'Subtask creata'); setNewSub(''); setAddingSub(false) } }}
            className="text-2xs font-semibold bg-gold text-on-gold px-2 py-1 rounded">OK</button>
          <button onClick={() => { setAddingSub(false); setNewSub('') }} aria-label="Annulla" className="text-text-tertiary"><X className="w-3 h-3" /></button>
        </div>
      )}
    </div>
  )
}

// ── Pannello ricorrenti ────────────────────────────────────────────────────
const FREQ: { key: RecurrenceFrequency; label: string }[] = [
  { key: 'daily', label: 'Giornaliera' },
  { key: 'weekly', label: 'Settimanale' },
  { key: 'biweekly', label: 'Quindicinale' },
  { key: 'monthly', label: 'Mensile' },
  { key: 'quarterly', label: 'Trimestrale' },
]
const FREQ_LABEL: Record<string, string> = Object.fromEntries(FREQ.map(f => [f.key, f.label]))
const WEEKDAYS = [['Lun', 1], ['Mar', 2], ['Mer', 3], ['Gio', 4], ['Ven', 5], ['Sab', 6], ['Dom', 0]] as const

type RecInput = {
  title: string; frequency: RecurrenceFrequency; interval: number
  weekdays: number[]; day_of_month: number | null; owner_id: string | null; visibility: 'internal' | 'client_visible'
}

function RecurringPanel({
  recurring, projectId, clientId, wsId, systemMilestoneId, profiles, canEdit, act, pending,
}: {
  recurring: RecurringTaskTemplate[]
  projectId: string; clientId: string; wsId: string; systemMilestoneId: string
  profiles: { id: string; full_name: string }[]
  canEdit: boolean
  act: (fn: () => Promise<unknown>, ok?: string) => void
  pending: boolean
}) {
  const [editing, setEditing] = useState<string | null>(null) // id o 'new'

  return (
    <div className="bg-background border border-border rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide flex items-center gap-1.5">
          <Repeat className="w-3.5 h-3.5 text-success" /> Attività ricorrenti
        </div>
        {canEdit && editing !== 'new' && (
          <button onClick={() => setEditing('new')} className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80">
            <Plus className="w-3 h-3" />Nuova
          </button>
        )}
      </div>

      <div className="space-y-1">
        {recurring.length === 0 && editing !== 'new' && <p className="text-2xs text-text-tertiary">Nessuna attività ricorrente.</p>}
        {recurring.map(r => editing === r.id ? (
          <RecurringForm key={r.id} profiles={profiles} pending={pending}
            initial={{ title: r.title, frequency: r.frequency, interval: r.interval, weekdays: r.weekdays ?? [], day_of_month: r.day_of_month, owner_id: r.owner_id, visibility: r.visibility }}
            onCancel={() => setEditing(null)}
            onSave={(v) => { act(() => updateRecurring(r.id, projectId, v), 'Ricorrenza aggiornata'); setEditing(null) }} />
        ) : (
          <div key={r.id} className={`flex items-center gap-2 py-1 group ${r.active ? '' : 'opacity-50'}`}>
            <Repeat className="w-3.5 h-3.5 text-success shrink-0" />
            <span className="flex-1 text-sm text-text-primary truncate">{r.title}</span>
            <span className="text-2xs text-success shrink-0">{FREQ_LABEL[r.frequency] ?? r.frequency}{r.interval > 1 ? ` ×${r.interval}` : ''}</span>
            {r.visibility === 'client_visible' && <span className="text-2xs text-info shrink-0">cliente</span>}
            {canEdit && (
              <>
                <button onClick={() => act(() => updateRecurring(r.id, projectId, { active: !r.active }), r.active ? 'Sospesa' : 'Riattivata')}
                  className="text-2xs text-text-tertiary hover:text-gold-text shrink-0">{r.active ? 'Pausa' : 'Attiva'}</button>
                <button onClick={() => setEditing(r.id)} aria-label="Modifica" className="text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 shrink-0"><Pencil className="w-3 h-3" /></button>
                <button onClick={() => { if (confirm(`Eliminare la ricorrenza "${r.title}"? Le occorrenze già generate restano.`)) act(() => deleteRecurring(r.id, projectId), 'Eliminata') }}
                  aria-label="Elimina" className="text-error opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="w-3 h-3" /></button>
              </>
            )}
          </div>
        ))}
        {editing === 'new' && (
          <RecurringForm profiles={profiles} pending={pending}
            onCancel={() => setEditing(null)}
            onSave={(v) => { act(() => createRecurring({ client_id: clientId, project_id: projectId, workstream_id: wsId, milestone_id: systemMilestoneId, ...v }), 'Ricorrenza creata'); setEditing(null) }} />
        )}
      </div>
    </div>
  )
}

function RecurringForm({
  initial, profiles, pending, onSave, onCancel,
}: {
  initial?: RecInput
  profiles: { id: string; full_name: string }[]
  pending: boolean
  onSave: (v: RecInput) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(initial?.frequency ?? 'weekly')
  const [interval, setInterval] = useState(initial?.interval ?? 1)
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? [1])
  const [dom, setDom] = useState<number | null>(initial?.day_of_month ?? 1)
  const [ownerId, setOwnerId] = useState(initial?.owner_id ?? '')
  const [visibility, setVisibility] = useState<'internal' | 'client_visible'>(initial?.visibility ?? 'internal')

  const needsWeekdays = frequency === 'weekly' || frequency === 'biweekly'
  const needsDom = frequency === 'monthly' || frequency === 'quarterly'

  const submit = () => onSave({
    title, frequency, interval,
    weekdays: needsWeekdays ? weekdays : [],
    day_of_month: needsDom ? dom : null,
    owner_id: ownerId || null, visibility,
  })

  return (
    <div className="bg-surface border border-gold/30 rounded-xl p-3 space-y-2.5 my-1">
      <input value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="Titolo attività (es. Check Ads)"
        className="w-full bg-background border border-border-interactive rounded-lg px-2.5 py-1.5 text-sm text-text-primary" />

      <div className="flex items-center gap-2 flex-wrap">
        <select value={frequency} onChange={e => setFrequency(e.target.value as RecurrenceFrequency)}
          aria-label="Frequenza" className="bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
          {FREQ.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <label className="flex items-center gap-1 text-2xs text-text-tertiary">
          ogni
          <input type="number" min={1} value={interval} onChange={e => setInterval(Math.max(1, Number(e.target.value)))}
            aria-label="Intervallo" className="w-12 bg-background border border-border-interactive rounded px-1.5 py-1 text-2xs text-text-primary text-center" />
          {frequency === 'daily' ? 'giorni' : frequency === 'monthly' ? 'mesi' : frequency === 'quarterly' ? 'trimestri' : 'settimane'}
        </label>
      </div>

      {needsWeekdays && (
        <div className="flex items-center gap-1 flex-wrap">
          {WEEKDAYS.map(([lab, n]) => (
            <button key={n} type="button"
              onClick={() => setWeekdays(w => w.includes(n) ? w.filter(x => x !== n) : [...w, n])}
              className={`text-2xs font-semibold px-2 py-1 rounded-lg border ${weekdays.includes(n) ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:bg-surface-hover'}`}>
              {lab}
            </button>
          ))}
        </div>
      )}
      {needsDom && (
        <label className="flex items-center gap-1.5 text-2xs text-text-tertiary">
          Giorno del mese
          <input type="number" min={1} max={31} value={dom ?? 1} onChange={e => setDom(Number(e.target.value))}
            className="w-14 bg-background border border-border-interactive rounded px-1.5 py-1 text-2xs text-text-primary text-center" />
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        <select value={ownerId} onChange={e => setOwnerId(e.target.value)} aria-label="Responsabile"
          className="bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
          <option value="">Responsabile…</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <select value={visibility} onChange={e => setVisibility(e.target.value as 'internal' | 'client_visible')} aria-label="Visibilità"
          className="bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
          <option value="internal">Interna</option>
          <option value="client_visible">Visibile al cliente</option>
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-2xs font-semibold text-text-secondary px-2.5 py-1.5">Annulla</button>
        <button onClick={submit} disabled={pending || !title.trim()}
          className="text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg disabled:opacity-40">Salva</button>
      </div>
    </div>
  )
}
