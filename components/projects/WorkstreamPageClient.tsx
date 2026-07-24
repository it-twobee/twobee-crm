'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Plus, Flag, Trash2, Repeat, ChevronRight, Check, CornerDownRight,
  Calendar, MoreHorizontal, Loader2, Pencil,
} from 'lucide-react'
import { createMilestone, updateMilestone, deleteMilestone } from '@/app/actions/milestones'
import { updateWorkstream, deleteWorkstream } from '@/app/actions/workstreams'
import { createProjectTask, updateTaskStatus, deleteTask, setTaskAssignees } from '@/app/actions/tasks'
import { createRecurring, updateRecurring, deleteRecurring } from '@/app/actions/recurring'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import type {
  Project, ProjectWorkstream, Milestone, Task, RecurringTaskTemplate,
  WorkstreamStatus, MilestoneStatus, RecurrenceFrequency, Priority,
} from '@/lib/types/database'

type Person = { id: string; full_name: string; avatar_url: string | null }

const MONTHS_SHORT = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC']
const shortDate = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  return { day: d.getDate(), mon: MONTHS_SHORT[d.getMonth()] }
}
const today = () => new Date().toISOString().slice(0, 10)
const isOverdue = (t: Task) => !!t.due_date && t.status !== 'completato' && t.due_date < today()

const WS_STATUS: WorkstreamStatus[] = ['draft', 'active', 'paused', 'completed', 'archived']
const WS_STATUS_LABEL: Record<string, string> = { draft: 'Bozza', active: 'Attiva', paused: 'In pausa', completed: 'Completata', archived: 'Archiviata' }
const MS_STATUS: MilestoneStatus[] = ['da_fare', 'in_corso', 'in_approvazione', 'completata']
const MS_STATUS_LABEL: Record<string, string> = { da_fare: 'Da fare', in_corso: 'In corso', in_approvazione: 'In approvazione', completata: 'Completata' }
const MS_DOT: Record<string, string> = { da_fare: 'bg-surface-active border-border-strong', in_corso: 'bg-info-dim border-info', in_approvazione: 'bg-warning-dim border-warning', completata: 'bg-success border-success' }
const PRIO_DOT: Record<string, string> = { alta: 'bg-error', media: 'bg-warning', bassa: 'bg-text-tertiary' }

export function WorkstreamPageClient({
  project, ws, milestones, tasks, recurring, profiles, canEdit, backHref, focusMilestoneId,
}: {
  project: Project
  ws: ProjectWorkstream
  milestones: Milestone[]
  tasks: Task[]
  recurring: RecurringTaskTemplate[]
  profiles: Person[]
  canEdit: boolean
  backHref: string
  focusMilestoneId?: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [taskDetail, setTaskDetail] = useState<Task | null>(null)
  const [addingMs, setAddingMs] = useState(false)
  const [newMs, setNewMs] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [wsName, setWsName] = useState(ws.name)

  const act = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  // delivery = tappe della timeline; system ("Operatività continua") = blocco a parte
  const deliveryMs = milestones.filter(m => m.milestone_type === 'delivery')
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const systemMs = milestones.filter(m => m.milestone_type === 'system')
  const systemMilestoneId = systemMs[0]?.id ?? deliveryMs[0]?.id ?? ''

  const allTasks = tasks.filter(t => !t.parent_task_id)
  const done = tasks.filter(t => t.status === 'completato').length
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0

  return (
    <div className="flex flex-col h-full">
      {/* header sticky */}
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-border">
        <Link href={`${backHref}?tab=workstream`} className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary w-fit press mb-3">
          <ArrowLeft className="w-4 h-4" />{project.name}
        </Link>
        <div className="flex items-start gap-4 flex-wrap max-w-5xl">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${ws.workstream_type === 'recurring' ? 'bg-success-dim text-success' : 'bg-surface-active text-text-tertiary'}`}>
                {ws.workstream_type === 'recurring' ? 'Continuativa' : 'A termine'}
              </span>
              {canEdit ? (
                <select value={ws.status} disabled={pending}
                  onChange={e => act(() => updateWorkstream(ws.id, project.id, { status: e.target.value as WorkstreamStatus }), 'Stato aggiornato')}
                  aria-label="Stato workstream"
                  className="text-2xs font-semibold bg-background border border-border-interactive rounded px-1.5 py-0.5 text-text-primary">
                  {WS_STATUS.map(s => <option key={s} value={s}>{WS_STATUS_LABEL[s]}</option>)}
                </select>
              ) : <span className="text-2xs text-text-tertiary">{WS_STATUS_LABEL[ws.status]}</span>}
            </div>
            {editingName && canEdit ? (
              <input value={wsName} onChange={e => setWsName(e.target.value)} autoFocus
                onBlur={() => { if (wsName.trim() && wsName !== ws.name) act(() => updateWorkstream(ws.id, project.id, { name: wsName.trim() }), 'Nome aggiornato'); else setWsName(ws.name); setEditingName(false) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setWsName(ws.name); setEditingName(false) } }}
                className="w-full text-2xl sm:text-3xl font-black text-text-primary font-heading bg-background border border-border-interactive rounded-lg px-2 py-1" />
            ) : (
              <button onClick={() => canEdit && setEditingName(true)} disabled={!canEdit}
                className="group/name flex items-center gap-2 text-left">
                <h1 className="text-2xl sm:text-3xl font-black text-text-primary font-heading break-words">{ws.name}</h1>
                {canEdit && <Pencil className="w-4 h-4 text-text-tertiary opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />}
              </button>
            )}
            {ws.workstream_type === 'project' && canEdit && (
              <div className="flex items-center gap-3 mt-2 text-2xs text-text-tertiary">
                <label className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Inizio
                  <input type="date" defaultValue={ws.start_date ?? ''}
                    onBlur={e => { if (e.target.value !== (ws.start_date ?? '')) act(() => updateWorkstream(ws.id, project.id, { start_date: e.target.value || null }), 'Data aggiornata') }}
                    className="bg-background border border-border-interactive rounded px-2 py-1 text-2xs text-text-primary" /></label>
                <label className="flex items-center gap-1.5">Fine
                  <input type="date" defaultValue={ws.end_date ?? ''}
                    onBlur={e => { if (e.target.value !== (ws.end_date ?? '')) act(() => updateWorkstream(ws.id, project.id, { end_date: e.target.value || null }), 'Data aggiornata') }}
                    className="bg-background border border-border-interactive rounded px-2 py-1 text-2xs text-text-primary" /></label>
              </div>
            )}
          </div>
          {/* progress ring/bar */}
          <div className="bg-surface border border-border rounded-2xl p-3 shadow-soft w-40 shrink-0">
            <div className="flex items-end justify-between mb-1.5">
              <span className="text-2xs text-text-tertiary uppercase tracking-wide">Avanzamento</span>
              <span className="text-xl font-black tabular font-heading text-text-primary">{progress}%</span>
            </div>
            <div className="h-1.5 bg-surface-active rounded-full overflow-hidden">
              <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-2xs text-text-tertiary mt-1.5 block">{done}/{tasks.length} task</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-5xl space-y-6 animate-fade-in">
          {/* ricorrenti */}
          {ws.workstream_type === 'recurring' && (
            <RecurringPanel recurring={recurring} projectId={project.id} clientId={project.client_id}
              wsId={ws.id} systemMilestoneId={systemMilestoneId} profiles={profiles} canEdit={canEdit} act={act} pending={pending} />
          )}

          {/* MILESTONE DI CONSEGNA — timeline */}
          <section>
            <div className="flex items-center gap-2 mb-3 px-1">
              <Flag className="w-4 h-4 text-info" />
              <h2 className="text-sm font-bold text-text-primary">Milestone di consegna</h2>
              <span className="text-2xs text-text-tertiary">· {deliveryMs.length}</span>
            </div>
            <div className="relative">
              {deliveryMs.length === 0 && <p className="text-2xs text-text-tertiary px-1 pb-2">Nessuna milestone di consegna. Aggiungine una con una data per pianificare le tappe.</p>}
              {deliveryMs.map((m, i) => (
                <MilestoneNode key={m.id} m={m} last={i === deliveryMs.length - 1}
                  project={project} wsId={ws.id}
                  tasks={allTasks.filter(t => t.milestone_id === m.id)}
                  subtasksOf={(pid) => tasks.filter(t => t.parent_task_id === pid)}
                  profiles={profiles} canEdit={canEdit} act={act} pending={pending}
                  onOpenTask={setTaskDetail} focus={m.id === focusMilestoneId} />
              ))}
              {canEdit && (
                <div className="pl-11 pt-1">
                  {addingMs ? (
                    <div className="flex items-center gap-2">
                      <input value={newMs} onChange={e => setNewMs(e.target.value)} autoFocus placeholder="Titolo milestone"
                        onKeyDown={e => { if (e.key === 'Enter' && newMs.trim()) { act(() => createMilestone({ project_id: project.id, workstream_id: ws.id, title: newMs }), 'Milestone creata'); setNewMs(''); setAddingMs(false) } }}
                        className="flex-1 max-w-md bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary" />
                      <button onClick={() => { if (newMs.trim()) { act(() => createMilestone({ project_id: project.id, workstream_id: ws.id, title: newMs }), 'Milestone creata'); setNewMs(''); setAddingMs(false) } }}
                        className="text-2xs font-semibold bg-gold text-on-gold px-3 py-2 rounded-lg">Aggiungi</button>
                      <button onClick={() => { setAddingMs(false); setNewMs('') }} aria-label="Annulla" className="text-text-tertiary"><X /></button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingMs(true)} className="flex items-center gap-1.5 text-2xs font-semibold text-gold-text hover:opacity-80 press">
                      <Plus className="w-3.5 h-3.5" />Nuova milestone
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* OPERATIVITÀ CONTINUA — blocco a parte (milestone di sistema) */}
          {systemMs.map(m => (
            <ContinuousBlock key={m.id} m={m} project={project} wsId={ws.id}
              tasks={allTasks.filter(t => t.milestone_id === m.id)}
              subtasksOf={(pid) => tasks.filter(t => t.parent_task_id === pid)}
              profiles={profiles} canEdit={canEdit} act={act} onOpenTask={setTaskDetail} />
          ))}

          {/* elimina workstream */}
          {canEdit && (
            <div className="pt-4 border-t border-border">
              <button onClick={() => { if (confirm(`Eliminare la workstream "${ws.name}" e tutto il suo contenuto?`)) { act(() => deleteWorkstream(ws.id, project.id)); router.push(`${backHref}?tab=workstream`) } }}
                className="flex items-center gap-1 text-2xs font-semibold text-error hover:opacity-80">
                <Trash2 className="w-3.5 h-3.5" />Elimina workstream
              </button>
            </div>
          )}
        </div>
      </div>

      {taskDetail && (
        <TaskDetailDrawer task={taskDetail} profiles={profiles.map(p => ({ id: p.id, full_name: p.full_name }))} canEdit={canEdit}
          contextLabel={ws.name} onClose={() => setTaskDetail(null)} onChanged={() => router.refresh()} />
      )}
    </div>
  )
}

// Blocco "Operatività continua" — attività continuative senza scadenza di consegna
function ContinuousBlock({
  m, project, wsId, tasks, subtasksOf, profiles, canEdit, act, onOpenTask,
}: {
  m: Milestone
  project: Project
  wsId: string
  tasks: Task[]
  subtasksOf: (parentId: string) => Task[]
  profiles: Person[]
  canEdit: boolean
  act: (fn: () => Promise<unknown>, ok?: string) => void
  onOpenTask: (t: Task) => void
}) {
  const [addingTask, setAddingTask] = useState(false)
  const [newTask, setNewTask] = useState('')
  const done = tasks.filter(t => t.status === 'completato').length

  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 bg-success-dim/40 border-b border-border">
        <span className="w-8 h-8 rounded-lg bg-success-dim flex items-center justify-center shrink-0">
          <Repeat className="w-4 h-4 text-success" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-text-primary truncate">{m.title}</h2>
            <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-success-dim text-success shrink-0">Continuativa</span>
          </div>
          <p className="text-2xs text-text-tertiary mt-0.5">Attività senza scadenza di consegna · include le occorrenze ricorrenti</p>
        </div>
        {tasks.length > 0 && <span className="text-2xs text-text-tertiary tabular shrink-0">{done}/{tasks.length}</span>}
      </div>
      <div className="p-2 space-y-0.5">
        {tasks.length === 0 && <p className="text-2xs text-text-tertiary px-2 py-1.5">Nessuna attività continuativa.</p>}
        {tasks.map(t => (
          <TaskRow key={t.id} t={t} subs={subtasksOf(t.id)} project={project} wsId={wsId} milestoneId={m.id}
            profiles={profiles} canEdit={canEdit} act={act} onOpenTask={onOpenTask} />
        ))}
        {canEdit && (
          addingTask ? (
            <div className="flex items-center gap-2 px-1 pt-1">
              <input value={newTask} onChange={e => setNewTask(e.target.value)} autoFocus placeholder="Nuova attività"
                onKeyDown={e => { if (e.key === 'Enter' && newTask.trim()) { act(() => createProjectTask({ client_id: project.client_id, project_id: project.id, workstream_id: wsId, milestone_id: m.id, title: newTask }), 'Attività creata'); setNewTask(''); setAddingTask(false) } }}
                className="flex-1 bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary" />
              <button onClick={() => { if (newTask.trim()) { act(() => createProjectTask({ client_id: project.client_id, project_id: project.id, workstream_id: wsId, milestone_id: m.id, title: newTask }), 'Attività creata'); setNewTask(''); setAddingTask(false) } }}
                className="text-2xs font-semibold bg-gold text-on-gold px-2.5 py-1.5 rounded">OK</button>
              <button onClick={() => { setAddingTask(false); setNewTask('') }} aria-label="Annulla" className="text-text-tertiary"><X /></button>
            </div>
          ) : (
            <button onClick={() => setAddingTask(true)} className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text px-1 pt-1 pb-0.5">
              <Plus className="w-3 h-3" />Attività
            </button>
          )
        )}
      </div>
    </section>
  )
}

function X() { return <span className="text-lg leading-none">×</span> }

// ── Nodo milestone della timeline ───────────────────────────────────────────
function MilestoneNode({
  m, last, project, wsId, tasks, subtasksOf, profiles, canEdit, act, pending, onOpenTask, focus,
}: {
  m: Milestone
  last: boolean
  project: Project
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
  const ref = useRef<HTMLDivElement>(null)
  const [addingTask, setAddingTask] = useState(false)
  const [newTask, setNewTask] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(m.title)

  useEffect(() => {
    if (focus && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (canEdit && m.milestone_type !== 'system') { setTitle(m.title); setEditingTitle(true) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  const d = shortDate(m.due_date)
  const done = tasks.filter(t => t.status === 'completato').length
  const pr = tasks.length ? Math.round((done / tasks.length) * 100) : 0
  const owner = m.owner_id ? profiles.find(p => p.id === m.owner_id) : null

  return (
    <div ref={ref} className="relative flex gap-3">
      {/* colonna data + nodo + linea */}
      <div className="flex flex-col items-center shrink-0 w-8">
        {d ? (
          <div className="text-center leading-none mb-1">
            <div className="text-base font-black tabular text-text-primary">{d.day}</div>
            <div className="text-2xs text-text-tertiary">{d.mon}</div>
          </div>
        ) : <div className="h-8" />}
        <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${MS_DOT[m.status]}`} />
        {!last && <span className="w-0.5 flex-1 bg-border mt-1" style={{ minHeight: 24 }} />}
      </div>

      {/* card milestone */}
      <div className={`flex-1 min-w-0 mb-4 rounded-2xl border shadow-soft transition-colors ${focus ? 'border-gold' : 'border-border'} bg-surface`}>
        <div className="flex items-center gap-2 p-3">
          <Flag className={`w-4 h-4 shrink-0 ${m.milestone_type === 'system' ? 'text-text-tertiary' : 'text-info'}`} />
          {editingTitle && canEdit ? (
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
              onBlur={() => { if (title.trim() && title !== m.title) act(() => updateMilestone(m.id, project.id, { title }), 'Salvato'); setEditingTitle(false) }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="flex-1 bg-background border border-border-interactive rounded px-2 py-1 text-sm font-semibold text-text-primary" />
          ) : (
            <button onClick={() => canEdit && m.milestone_type !== 'system' && setEditingTitle(true)} className="flex-1 text-left text-sm font-semibold text-text-primary truncate">
              {m.title}
            </button>
          )}
          {m.milestone_type === 'system' && <span className="text-2xs text-text-tertiary px-1.5 py-0.5 rounded bg-surface-active shrink-0">Sistema</span>}
          {canEdit ? (
            <select value={m.status} disabled={pending}
              onChange={e => act(() => updateMilestone(m.id, project.id, { status: e.target.value as MilestoneStatus }), 'Stato aggiornato')}
              aria-label="Stato milestone" className="text-2xs font-semibold bg-background border border-border-interactive rounded px-1.5 py-0.5 text-text-primary shrink-0">
              {MS_STATUS.map(s => <option key={s} value={s}>{MS_STATUS_LABEL[s]}</option>)}
            </select>
          ) : <span className="text-2xs text-text-tertiary shrink-0">{MS_STATUS_LABEL[m.status]}</span>}
        </div>

        {/* meta row: data + owner + progress */}
        {m.milestone_type !== 'system' && (
          <div className="flex flex-wrap items-center gap-3 px-3 pb-2">
            <label className="flex items-center gap-1.5 text-2xs text-text-tertiary">
              <Calendar className="w-3.5 h-3.5" />
              <input type="date" defaultValue={m.due_date ?? ''} disabled={!canEdit}
                onBlur={e => { if (e.target.value !== (m.due_date ?? '')) act(() => updateMilestone(m.id, project.id, { due_date: e.target.value || null }), 'Scadenza aggiornata') }}
                className="bg-background border border-border-interactive rounded px-2 py-0.5 text-2xs text-text-primary" />
            </label>
            <label className="flex items-center gap-1.5 text-2xs text-text-tertiary">
              <span className="w-5 h-5 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-2xs font-bold text-gold-text overflow-hidden shrink-0">
                {owner ? (owner.avatar_url ? <img src={owner.avatar_url} className="w-full h-full object-cover" alt="" /> : owner.full_name[0].toUpperCase()) : '?'}
              </span>
              <select value={m.owner_id ?? ''} disabled={!canEdit}
                onChange={e => act(() => updateMilestone(m.id, project.id, { owner_id: e.target.value || null }), 'Assegnata')}
                className="bg-background border border-border-interactive rounded px-2 py-0.5 text-2xs text-text-primary">
                <option value="">Responsabile…</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </label>
            {tasks.length > 0 && (
              <div className="flex items-center gap-1.5 ml-auto">
                <div className="w-20 h-1 bg-surface-active rounded-full overflow-hidden"><div className="h-full bg-gold rounded-full" style={{ width: `${pr}%` }} /></div>
                <span className="text-2xs text-text-tertiary tabular">{done}/{tasks.length}</span>
              </div>
            )}
          </div>
        )}

        {/* task */}
        <div className="border-t border-border p-2 space-y-0.5">
          {tasks.map(t => (
            <TaskRow key={t.id} t={t} subs={subtasksOf(t.id)} project={project} wsId={wsId} milestoneId={m.id}
              profiles={profiles} canEdit={canEdit} act={act} onOpenTask={onOpenTask} />
          ))}
          {tasks.length === 0 && <p className="text-2xs text-text-tertiary px-2 py-1">Nessuna task.</p>}
          {canEdit && (
            addingTask ? (
              <div className="flex items-center gap-2 px-1 pt-1">
                <input value={newTask} onChange={e => setNewTask(e.target.value)} autoFocus placeholder="Nuova task"
                  onKeyDown={e => { if (e.key === 'Enter' && newTask.trim()) { act(() => createProjectTask({ client_id: project.client_id, project_id: project.id, workstream_id: wsId, milestone_id: m.id, title: newTask }), 'Task creata'); setNewTask(''); setAddingTask(false) } }}
                  className="flex-1 bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary" />
                <button onClick={() => { if (newTask.trim()) { act(() => createProjectTask({ client_id: project.client_id, project_id: project.id, workstream_id: wsId, milestone_id: m.id, title: newTask }), 'Task creata'); setNewTask(''); setAddingTask(false) } }}
                  className="text-2xs font-semibold bg-gold text-on-gold px-2.5 py-1.5 rounded">OK</button>
                <button onClick={() => { setAddingTask(false); setNewTask('') }} aria-label="Annulla" className="text-text-tertiary"><X /></button>
              </div>
            ) : (
              <button onClick={() => setAddingTask(true)} className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text px-1 pt-1">
                <Plus className="w-3 h-3" />Task
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ── Riga task (con subtask) ──────────────────────────────────────────────────
function TaskRow({
  t, subs, project, wsId, milestoneId, profiles, canEdit, act, onOpenTask,
}: {
  t: Task
  subs: Task[]
  project: Project
  wsId: string
  milestoneId: string
  profiles: Person[]
  canEdit: boolean
  act: (fn: () => Promise<unknown>, ok?: string) => void
  onOpenTask: (t: Task) => void
}) {
  const [addingSub, setAddingSub] = useState(false)
  const [newSub, setNewSub] = useState('')
  const assignee = t.assignee_id ? profiles.find(p => p.id === t.assignee_id) : null
  const doneSubs = subs.filter(s => s.status === 'completato').length

  const Check1 = ({ task }: { task: Task }) => (
    <button disabled={!canEdit} aria-label="Completa"
      onClick={() => act(() => updateTaskStatus(task.id, task.status === 'completato' ? 'da_fare' : 'completato'))}
      className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${task.status === 'completato' ? 'bg-success border-success' : 'border-border-strong hover:border-gold'}`}>
      {task.status === 'completato' && <Check className="w-3 h-3 text-on-gold" />}
    </button>
  )
  const Avatar = ({ p }: { p?: Person | null }) => p ? (
    <span className="w-5 h-5 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-2xs font-bold text-gold-text overflow-hidden shrink-0" title={p.full_name}>
      {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : p.full_name[0].toUpperCase()}
    </span>
  ) : null

  return (
    <div className="rounded-lg hover:bg-surface-hover">
      <div className="flex items-center gap-2 px-2 py-1.5 group">
        <Check1 task={t} />
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIO_DOT[t.priority]}`} title={`Priorità ${t.priority}`} />
        <button onClick={() => onOpenTask(t)} className={`flex-1 text-left text-sm truncate ${t.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-primary'} hover:text-gold-text`}>
          {t.title}
        </button>
        {subs.length > 0 && <span className="text-2xs text-text-tertiary tabular shrink-0">{doneSubs}/{subs.length}</span>}
        {t.due_date && <span className={`text-2xs tabular shrink-0 ${isOverdue(t) ? 'text-error' : 'text-text-tertiary'}`}>{t.due_date.slice(5)}</span>}
        {canEdit ? (
          <select value={t.assignee_id ?? ''} onChange={e => act(() => setTaskAssignees(t.id, e.target.value ? [e.target.value] : []))}
            aria-label="Assegnatario" className="text-2xs bg-transparent text-text-tertiary max-w-[80px] shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100">
            <option value="">—</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        ) : <Avatar p={assignee} />}
        {assignee && canEdit && <Avatar p={assignee} />}
        {canEdit && (
          <>
            <button onClick={() => setAddingSub(v => !v)} aria-label="Subtask" className="text-text-tertiary hover:text-gold-text opacity-0 group-hover:opacity-100 shrink-0"><CornerDownRight className="w-3.5 h-3.5" /></button>
            <button onClick={() => { if (confirm('Eliminare la task e le sue subtask?')) act(() => deleteTask(t.id), 'Eliminata') }} aria-label="Elimina" className="text-error opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="w-3 h-3" /></button>
          </>
        )}
      </div>

      {subs.length > 0 && (
        <div className="pl-8 space-y-0.5 pb-1">
          {subs.map(s => (
            <div key={s.id} className="flex items-center gap-2 py-0.5 group/sub">
              <Check1 task={s} />
              <button onClick={() => onOpenTask(s)} className={`flex-1 text-left text-2xs truncate ${s.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-secondary'} hover:text-gold-text`}>{s.title}</button>
              {canEdit && <button onClick={() => act(() => deleteTask(s.id))} aria-label="Elimina subtask" className="text-error opacity-0 group-hover/sub:opacity-100 shrink-0"><Trash2 className="w-3 h-3" /></button>}
            </div>
          ))}
        </div>
      )}

      {addingSub && canEdit && (
        <div className="pl-8 flex items-center gap-2 py-1">
          <input value={newSub} onChange={e => setNewSub(e.target.value)} autoFocus placeholder="Subtask"
            onKeyDown={e => { if (e.key === 'Enter' && newSub.trim()) { act(() => createProjectTask({ client_id: project.client_id, project_id: project.id, workstream_id: wsId, milestone_id: milestoneId, title: newSub, parent_task_id: t.id }), 'Subtask creata'); setNewSub(''); setAddingSub(false) } }}
            className="flex-1 bg-background border border-border-interactive rounded px-2 py-1 text-2xs text-text-primary" />
          <button onClick={() => { if (newSub.trim()) { act(() => createProjectTask({ client_id: project.client_id, project_id: project.id, workstream_id: wsId, milestone_id: milestoneId, title: newSub, parent_task_id: t.id }), 'Subtask creata'); setNewSub(''); setAddingSub(false) } }}
            className="text-2xs font-semibold bg-gold text-on-gold px-2 py-1 rounded">OK</button>
          <button onClick={() => { setAddingSub(false); setNewSub('') }} aria-label="Annulla" className="text-text-tertiary"><X /></button>
        </div>
      )}
    </div>
  )
}

// ── Ricorrenti (riuso semantica dell'editor) ────────────────────────────────
const FREQ: { key: RecurrenceFrequency; label: string }[] = [
  { key: 'daily', label: 'Giornaliera' }, { key: 'weekly', label: 'Settimanale' },
  { key: 'biweekly', label: 'Quindicinale' }, { key: 'monthly', label: 'Mensile' }, { key: 'quarterly', label: 'Trimestrale' },
]
const FREQ_LABEL: Record<string, string> = Object.fromEntries(FREQ.map(f => [f.key, f.label]))
const WEEKDAYS = [['Lun', 1], ['Mar', 2], ['Mer', 3], ['Gio', 4], ['Ven', 5], ['Sab', 6], ['Dom', 0]] as const
type RecInput = { title: string; frequency: RecurrenceFrequency; interval: number; weekdays: number[]; day_of_month: number | null; owner_id: string | null; visibility: 'internal' | 'client_visible' }

function RecurringPanel({
  recurring, projectId, clientId, wsId, systemMilestoneId, profiles, canEdit, act, pending,
}: {
  recurring: RecurringTaskTemplate[]
  projectId: string; clientId: string; wsId: string; systemMilestoneId: string
  profiles: Person[]; canEdit: boolean
  act: (fn: () => Promise<unknown>, ok?: string) => void; pending: boolean
}) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-soft p-4">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-sm font-bold text-text-primary flex items-center gap-2"><Repeat className="w-4 h-4 text-success" />Attività ricorrenti</div>
        {canEdit && editing !== 'new' && (
          <button onClick={() => setEditing('new')} className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80"><Plus className="w-3 h-3" />Nuova</button>
        )}
      </div>
      <div className="space-y-1">
        {recurring.length === 0 && editing !== 'new' && <p className="text-2xs text-text-tertiary">Nessuna attività ricorrente.</p>}
        {recurring.map(r => editing === r.id ? (
          <RecurringForm key={r.id} profiles={profiles} pending={pending}
            initial={{ title: r.title, frequency: r.frequency, interval: r.interval, weekdays: r.weekdays ?? [], day_of_month: r.day_of_month, owner_id: r.owner_id, visibility: r.visibility }}
            onCancel={() => setEditing(null)} onSave={v => { act(() => updateRecurring(r.id, projectId, v), 'Aggiornata'); setEditing(null) }} />
        ) : (
          <div key={r.id} className={`flex items-center gap-2 py-1 group ${r.active ? '' : 'opacity-50'}`}>
            <Repeat className="w-3.5 h-3.5 text-success shrink-0" />
            <span className="flex-1 text-sm text-text-primary truncate">{r.title}</span>
            <span className="text-2xs text-success shrink-0">{FREQ_LABEL[r.frequency] ?? r.frequency}{r.interval > 1 ? ` ×${r.interval}` : ''}</span>
            {r.visibility === 'client_visible' && <span className="text-2xs text-info shrink-0">cliente</span>}
            {canEdit && (
              <>
                <button onClick={() => act(() => updateRecurring(r.id, projectId, { active: !r.active }), r.active ? 'Sospesa' : 'Riattivata')} className="text-2xs text-text-tertiary hover:text-gold-text shrink-0">{r.active ? 'Pausa' : 'Attiva'}</button>
                <button onClick={() => setEditing(r.id)} aria-label="Modifica" className="text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 shrink-0"><Pencil className="w-3 h-3" /></button>
                <button onClick={() => { if (confirm(`Eliminare "${r.title}"? Le occorrenze già generate restano.`)) act(() => deleteRecurring(r.id, projectId), 'Eliminata') }} aria-label="Elimina" className="text-error opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="w-3 h-3" /></button>
              </>
            )}
          </div>
        ))}
        {editing === 'new' && (
          <RecurringForm profiles={profiles} pending={pending} onCancel={() => setEditing(null)}
            onSave={v => { act(() => createRecurring({ client_id: clientId, project_id: projectId, workstream_id: wsId, milestone_id: systemMilestoneId, ...v }), 'Creata'); setEditing(null) }} />
        )}
      </div>
    </div>
  )
}

function RecurringForm({ initial, profiles, pending, onSave, onCancel }: {
  initial?: RecInput; profiles: Person[]; pending: boolean; onSave: (v: RecInput) => void; onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(initial?.frequency ?? 'weekly')
  const [interval, setIntv] = useState(initial?.interval ?? 1)
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? [1])
  const [dom, setDom] = useState<number | null>(initial?.day_of_month ?? 1)
  const [ownerId, setOwnerId] = useState(initial?.owner_id ?? '')
  const [visibility, setVisibility] = useState<'internal' | 'client_visible'>(initial?.visibility ?? 'internal')
  const needsWeekdays = frequency === 'weekly' || frequency === 'biweekly'
  const needsDom = frequency === 'monthly' || frequency === 'quarterly'
  const submit = () => onSave({ title, frequency, interval, weekdays: needsWeekdays ? weekdays : [], day_of_month: needsDom ? dom : null, owner_id: ownerId || null, visibility })
  return (
    <div className="bg-background border border-gold/30 rounded-xl p-3 space-y-2.5 my-1">
      <input value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="Titolo (es. Check Ads)" className="w-full bg-surface border border-border-interactive rounded-lg px-2.5 py-1.5 text-sm text-text-primary" />
      <div className="flex items-center gap-2 flex-wrap">
        <select value={frequency} onChange={e => setFrequency(e.target.value as RecurrenceFrequency)} aria-label="Frequenza" className="bg-surface border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
          {FREQ.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <label className="flex items-center gap-1 text-2xs text-text-tertiary">ogni
          <input type="number" min={1} value={interval} onChange={e => setIntv(Math.max(1, Number(e.target.value)))} aria-label="Intervallo" className="w-12 bg-surface border border-border-interactive rounded px-1.5 py-1 text-2xs text-text-primary text-center" />
          {frequency === 'daily' ? 'giorni' : frequency === 'monthly' ? 'mesi' : frequency === 'quarterly' ? 'trimestri' : 'settimane'}
        </label>
      </div>
      {needsWeekdays && (
        <div className="flex items-center gap-1 flex-wrap">
          {WEEKDAYS.map(([lab, n]) => (
            <button key={n} type="button" onClick={() => setWeekdays(w => w.includes(n) ? w.filter(x => x !== n) : [...w, n])}
              className={`text-2xs font-semibold px-2 py-1 rounded-lg border ${weekdays.includes(n) ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:bg-surface-hover'}`}>{lab}</button>
          ))}
        </div>
      )}
      {needsDom && (
        <label className="flex items-center gap-1.5 text-2xs text-text-tertiary">Giorno del mese
          <input type="number" min={1} max={31} value={dom ?? 1} onChange={e => setDom(Number(e.target.value))} className="w-14 bg-surface border border-border-interactive rounded px-1.5 py-1 text-2xs text-text-primary text-center" /></label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <select value={ownerId} onChange={e => setOwnerId(e.target.value)} aria-label="Responsabile" className="bg-surface border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
          <option value="">Responsabile…</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <select value={visibility} onChange={e => setVisibility(e.target.value as 'internal' | 'client_visible')} aria-label="Visibilità" className="bg-surface border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
          <option value="internal">Interna</option>
          <option value="client_visible">Visibile al cliente</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-2xs font-semibold text-text-secondary px-2.5 py-1.5">Annulla</button>
        <button onClick={submit} disabled={pending || !title.trim()} className="text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg disabled:opacity-40">Salva</button>
      </div>
    </div>
  )
}
