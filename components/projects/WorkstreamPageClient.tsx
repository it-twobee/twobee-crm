'use client'

import { useState, useMemo, useTransition, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Plus, Flag, Trash2, Repeat, Check, CornerDownRight,
  Calendar, Pencil, AlertTriangle, Clock, Users, ListChecks, EyeOff, RotateCcw,
} from 'lucide-react'
import { createMilestone, updateMilestone, deleteMilestone } from '@/app/actions/milestones'
import { updateWorkstream, deleteWorkstream } from '@/app/actions/workstreams'
import { createProjectTask, updateTaskStatus, deleteTask, setTaskAssignees } from '@/app/actions/tasks'
import { createRecurring, updateRecurring, deleteRecurring } from '@/app/actions/recurring'
import { Avatar, Segmented, inputCls } from '@/components/shared/formkit'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { TaskComposer } from '@/components/tasks/TaskComposer'
import { NewMilestoneModal, type NewMilestoneValues } from './NewMilestoneModal'
import type {
  Project, ProjectWorkstream, Milestone, Task, RecurringTaskTemplate,
  WorkstreamStatus, MilestoneStatus, RecurrenceFrequency,
} from '@/lib/types/database'

type Person = { id: string; full_name: string; avatar_url: string | null }

const MONTHS_SHORT = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC']
const shortDate = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  return { day: d.getDate(), mon: MONTHS_SHORT[d.getMonth()] }
}
const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const isOverdue = (t: Task) => !!t.due_date && t.status !== 'completato' && t.due_date < today()
const relDays = (iso: string) => {
  const d = Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)
  if (d < 0) return { text: `${-d}g fa`, tone: 'text-error' }
  if (d === 0) return { text: 'oggi', tone: 'text-warning' }
  if (d <= 7) return { text: `tra ${d}g`, tone: 'text-warning' }
  return { text: iso.slice(5), tone: 'text-text-tertiary' }
}

const WS_STATUS: WorkstreamStatus[] = ['draft', 'active', 'paused', 'completed', 'archived']
const WS_STATUS_LABEL: Record<string, string> = { draft: 'Bozza', active: 'Attiva', paused: 'In pausa', completed: 'Completata', archived: 'Archiviata' }
const MS_STATUS: MilestoneStatus[] = ['da_fare', 'in_corso', 'in_approvazione', 'completata']
const MS_STATUS_LABEL: Record<string, string> = { da_fare: 'Da fare', in_corso: 'In corso', in_approvazione: 'In approvazione', completata: 'Completata' }
const MS_DOT: Record<string, string> = { da_fare: 'bg-surface-active border-border-strong', in_corso: 'bg-info-dim border-info', in_approvazione: 'bg-warning-dim border-warning', completata: 'bg-success border-success' }
const PRIO_DOT: Record<string, string> = { alta: 'bg-error', media: 'bg-warning', bassa: 'bg-text-tertiary' }

type TaskFilter = 'all' | 'late' | 'soon' | 'unassigned'
/** contesto del modale «nuova task»: dove finirà quello che si sta creando */
type TaskTarget = {
  milestoneId: string
  parentId: string | null
  kind: 'task' | 'subtask' | 'continuous'
  context: string
  defaultDue?: string | null
}

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
  const [taskTarget, setTaskTarget] = useState<TaskTarget | null>(null)
  const [addingMs, setAddingMs] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [wsName, setWsName] = useState(ws.name)
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [hideDone, setHideDone] = useState(false)

  const act = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  // delivery = tappe della timeline; system ("Operatività continua") = blocco a parte
  const deliveryMs = milestones.filter(m => m.milestone_type === 'delivery')
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const systemMs = milestones.filter(m => m.milestone_type === 'system')
  const systemMilestoneId = systemMs[0]?.id ?? deliveryMs[0]?.id ?? ''

  const wsDone = ws.status === 'completed'
  const allTasks = tasks.filter(t => !t.parent_task_id)
  const done = tasks.filter(t => t.status === 'completato').length
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0

  // ── segnali della workstream ──────────────────────────────────────────────
  const openTasks = tasks.filter(t => t.status !== 'completato')
  const late = tasks.filter(isOverdue)
  const in7 = plusDays(7)
  const soon = openTasks.filter(t => t.due_date && t.due_date >= today() && t.due_date <= in7)
  const unassigned = openTasks.filter(t => !t.assignee_id)
  const nextMs = deliveryMs.find(m => m.status !== 'completata' && m.due_date)

  /** filtro applicato alle task dentro ogni milestone (la struttura resta visibile) */
  const visibleTasks = useMemo(() => {
    const lateIds = new Set(late.map(t => t.id))
    const soonIds = new Set(soon.map(t => t.id))
    return (list: Task[]) => list.filter(t => {
      if (hideDone && t.status === 'completato') return false
      if (filter === 'late') return lateIds.has(t.id)
      if (filter === 'soon') return soonIds.has(t.id)
      if (filter === 'unassigned') return t.status !== 'completato' && !t.assignee_id
      return true
    })
  }, [filter, hideDone, late, soon])

  const msContext = (m: Milestone) => `${ws.name} · ${m.title}`


  const submitMilestone = (v: NewMilestoneValues) => {
    act(async () => {
      const id = await createMilestone({
        project_id: project.id, workstream_id: ws.id, title: v.title,
        due_date: v.due_date, visibility: v.visibility, approval_required: v.approval_required,
      })
      if (v.owner_id) await updateMilestone(id, project.id, { owner_id: v.owner_id })
    }, 'Milestone creata')
    setAddingMs(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* header */}
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
                  className="text-2xs font-semibold bg-background border border-border-interactive rounded-lg px-2 py-1 text-text-primary">
                  {WS_STATUS.map(s => <option key={s} value={s}>{WS_STATUS_LABEL[s]}</option>)}
                </select>
              ) : <span className="text-2xs text-text-tertiary">{WS_STATUS_LABEL[ws.status]}</span>}
              {ws.visibility === 'internal' && (
                <span className="flex items-center gap-1 text-2xs text-text-tertiary"><EyeOff className="w-3 h-3" />interna</span>
              )}
              {/* i workstream a termine si chiudono; quelli continuativi per definizione no */}
              {canEdit && ws.workstream_type === 'project' && (
                wsDone ? (
                  <button onClick={() => act(() => updateWorkstream(ws.id, project.id, { status: 'active' }), 'Workstream riaperto')}
                    disabled={pending}
                    className="flex items-center gap-1 text-2xs font-semibold text-text-tertiary hover:text-text-primary disabled:opacity-50">
                    <RotateCcw className="w-3.5 h-3.5" />Riapri
                  </button>
                ) : (
                  <button disabled={pending}
                    onClick={() => {
                      const openHere = tasks.filter(t => t.status !== 'completato')
                      const openMs = deliveryMs.filter(m => m.status !== 'completata')
                      const pieces = [
                        openHere.length ? `${openHere.length} task` : null,
                        openMs.length ? `${openMs.length} milestone` : null,
                      ].filter(Boolean).join(' e ')
                      if (pieces && !confirm(
                        `"${ws.name}" ha ancora ${pieces} da chiudere.\n\nOK: completa tutto.\nAnnulla: non fare nulla.`,
                      )) return
                      act(async () => {
                        for (const t of tasks.filter(t => t.status !== 'completato')) await updateTaskStatus(t.id, 'completato')
                        for (const m of deliveryMs.filter(m => m.status !== 'completata')) await updateMilestone(m.id, project.id, { status: 'completata' })
                        await updateWorkstream(ws.id, project.id, { status: 'completed' })
                      }, 'Workstream completato')
                    }}
                    className="flex items-center gap-1 text-2xs font-semibold text-success border border-success/30 bg-success-dim px-2 py-1 rounded-lg press disabled:opacity-50">
                    <Check className="w-3.5 h-3.5" />Completa
                  </button>
                )
              )}
            </div>
            {editingName && canEdit ? (
              // eslint-disable-next-line jsx-a11y/no-autofocus
              <input value={wsName} onChange={e => setWsName(e.target.value)} autoFocus aria-label="Nome workstream"
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
              <div className="flex items-center gap-3 mt-2 text-2xs text-text-tertiary flex-wrap">
                <label className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Inizio
                  <input type="date" defaultValue={ws.start_date ?? ''}
                    onBlur={e => { if (e.target.value !== (ws.start_date ?? '')) act(() => updateWorkstream(ws.id, project.id, { start_date: e.target.value || null }), 'Data aggiornata') }}
                    className="bg-background border border-border-interactive rounded-lg px-2 py-1 text-2xs text-text-primary" /></label>
                <label className="flex items-center gap-1.5">Fine
                  <input type="date" defaultValue={ws.end_date ?? ''}
                    onBlur={e => { if (e.target.value !== (ws.end_date ?? '')) act(() => updateWorkstream(ws.id, project.id, { end_date: e.target.value || null }), 'Data aggiornata') }}
                    className="bg-background border border-border-interactive rounded-lg px-2 py-1 text-2xs text-text-primary" /></label>
              </div>
            )}
          </div>
          {/* avanzamento */}
          <div className="bg-surface border border-border rounded-2xl p-3 shadow-soft w-44 shrink-0">
            <div className="flex items-end justify-between mb-1.5">
              <span className="text-2xs text-text-tertiary uppercase tracking-wide">Avanzamento</span>
              <span className="text-xl font-black tabular font-heading text-text-primary">{progress}%</span>
            </div>
            <div className="h-1.5 bg-surface-active rounded-full overflow-hidden">
              <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-2xs text-text-tertiary mt-1.5 block">{done}/{tasks.length} task</span>
            {nextMs?.due_date && (
              <span className="text-2xs text-text-tertiary mt-1 block truncate">
                Prossima: <span className={relDays(nextMs.due_date).tone}>{relDays(nextMs.due_date).text}</span>
              </span>
            )}
          </div>
        </div>

        {/* segnali + filtro */}
        {tasks.length > 0 && (
          <div className="flex items-center gap-2 mt-4 flex-wrap max-w-5xl">
            <Chip label="Tutte" n={tasks.length} icon={<ListChecks className="w-3.5 h-3.5" />}
              on={filter === 'all'} onClick={() => setFilter('all')} />
            <Chip label="In ritardo" n={late.length} tone="error" icon={<AlertTriangle className="w-3.5 h-3.5" />}
              on={filter === 'late'} onClick={() => setFilter(f => f === 'late' ? 'all' : 'late')} />
            <Chip label="≤ 7 giorni" n={soon.length} tone="warning" icon={<Clock className="w-3.5 h-3.5" />}
              on={filter === 'soon'} onClick={() => setFilter(f => f === 'soon' ? 'all' : 'soon')} />
            <Chip label="Non assegnate" n={unassigned.length} tone="info" icon={<Users className="w-3.5 h-3.5" />}
              on={filter === 'unassigned'} onClick={() => setFilter(f => f === 'unassigned' ? 'all' : 'unassigned')} />
            <label className="flex items-center gap-1.5 ml-auto cursor-pointer">
              <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />
              <span className="text-2xs text-text-secondary">Nascondi completate</span>
            </label>
          </div>
        )}
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
              {canEdit && (
                <button onClick={() => setAddingMs(true)}
                  className="ml-auto flex items-center gap-1.5 text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg shadow-soft press">
                  <Plus className="w-3.5 h-3.5" />Nuova milestone
                </button>
              )}
            </div>
            <div className="relative">
              {deliveryMs.length === 0 && (
                <div className="text-center py-10 border border-dashed border-border rounded-2xl">
                  <div className="w-11 h-11 rounded-full bg-info-dim flex items-center justify-center mx-auto mb-2.5">
                    <Flag className="w-5 h-5 text-info" />
                  </div>
                  <p className="text-sm text-text-secondary">Nessuna tappa di consegna.</p>
                  <p className="text-2xs text-text-tertiary mt-1">Una milestone con una data compare sul calendario del progetto.</p>
                  {canEdit && (
                    <button onClick={() => setAddingMs(true)}
                      className="text-2xs font-semibold bg-gold text-on-gold px-4 py-2 rounded-lg shadow-soft press mt-3">
                      Crea la prima milestone
                    </button>
                  )}
                </div>
              )}
              {deliveryMs.map((m, i) => (
                <MilestoneNode key={m.id} m={m} index={i} last={i === deliveryMs.length - 1}
                  project={project} wsId={ws.id}
                  tasks={visibleTasks(allTasks.filter(t => t.milestone_id === m.id))}
                  totalTasks={allTasks.filter(t => t.milestone_id === m.id)}
                  subtasksOf={(pid) => tasks.filter(t => t.parent_task_id === pid)}
                  profiles={profiles} canEdit={canEdit} act={act} pending={pending}
                  onOpenTask={setTaskDetail} focus={m.id === focusMilestoneId}
                  onAddTask={() => setTaskTarget({ milestoneId: m.id, parentId: null, kind: 'task', context: msContext(m), defaultDue: m.due_date })}
                  onAddSub={(t) => setTaskTarget({ milestoneId: m.id, parentId: t.id, kind: 'subtask', context: `${msContext(m)} · ${t.title}`, defaultDue: t.due_date })} />
              ))}
            </div>
          </section>

          {/* OPERATIVITÀ CONTINUA — blocco a parte (milestone di sistema) */}
          {systemMs.map(m => (
            <ContinuousBlock key={m.id} m={m} project={project} wsId={ws.id}
              tasks={visibleTasks(allTasks.filter(t => t.milestone_id === m.id))}
              totalTasks={allTasks.filter(t => t.milestone_id === m.id)}
              subtasksOf={(pid) => tasks.filter(t => t.parent_task_id === pid)}
              profiles={profiles} canEdit={canEdit} act={act} onOpenTask={setTaskDetail}
              onAddTask={() => setTaskTarget({ milestoneId: m.id, parentId: null, kind: 'continuous', context: msContext(m) })}
              onAddSub={(t) => setTaskTarget({ milestoneId: m.id, parentId: t.id, kind: 'subtask', context: `${msContext(m)} · ${t.title}` })} />
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

      {taskTarget && (
        <TaskComposer
          destination={{
            mode: 'fixed', kind: 'project',
            context: taskTarget.context,
            clientId: project.client_id,
            projectId: project.id, workstreamId: ws.id,
            milestoneId: taskTarget.milestoneId, parentTaskId: taskTarget.parentId,
            variant: taskTarget.kind === 'subtask' ? 'subtask' : taskTarget.kind === 'continuous' ? 'continuous' : 'task',
            defaultDue: taskTarget.defaultDue,
          }}
          profiles={profiles}
          onClose={() => setTaskTarget(null)}
          onCreated={() => router.refresh()} />
      )}

      {addingMs && (
        <NewMilestoneModal context={ws.name} index={deliveryMs.length} profiles={profiles} pending={pending}
          clientVisibleAllowed={!!project.client_id} suggestedDue={ws.end_date}
          onClose={() => setAddingMs(false)} onCreate={submitMilestone} />
      )}

      {taskDetail && (
        <TaskDetailDrawer task={taskDetail} profiles={profiles.map(p => ({ id: p.id, full_name: p.full_name }))} canEdit={canEdit}
          contextLabel={ws.name} onClose={() => setTaskDetail(null)} onChanged={() => router.refresh()} />
      )}
    </div>
  )
}

function Chip({ label, n, icon, tone, on, onClick }: {
  label: string; n: number; icon: React.ReactNode
  tone?: 'error' | 'warning' | 'info'; on: boolean; onClick: () => void
}) {
  const ink = n === 0 ? 'text-text-tertiary'
    : tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning' : tone === 'info' ? 'text-info' : 'text-text-secondary'
  return (
    <button onClick={onClick} aria-pressed={on} disabled={n === 0 && !!tone}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-2xs font-semibold transition-colors disabled:opacity-40 ${
        on ? 'border-gold bg-gold-dim text-text-primary' : 'border-border hover:bg-surface-hover'
      } ${on ? '' : ink}`}>
      {icon}{label}<span className="tabular">{n}</span>
    </button>
  )
}

// Blocco "Operatività continua" — attività continuative senza scadenza di consegna
function ContinuousBlock({
  m, project, wsId, tasks, totalTasks, subtasksOf, profiles, canEdit, act, onOpenTask, onAddTask, onAddSub,
}: {
  m: Milestone
  project: Project
  wsId: string
  tasks: Task[]
  totalTasks: Task[]
  subtasksOf: (parentId: string) => Task[]
  profiles: Person[]
  canEdit: boolean
  act: (fn: () => Promise<unknown>, ok?: string) => void
  onOpenTask: (t: Task) => void
  onAddTask: () => void
  onAddSub: (t: Task) => void
}) {
  const done = totalTasks.filter(t => t.status === 'completato').length

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
        {totalTasks.length > 0 && <span className="text-2xs text-text-tertiary tabular shrink-0">{done}/{totalTasks.length}</span>}
        {canEdit && (
          <button onClick={onAddTask} className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80 shrink-0 press">
            <Plus className="w-3.5 h-3.5" />Attività
          </button>
        )}
      </div>
      <div className="p-2 space-y-0.5">
        {tasks.length === 0 && (
          <p className="text-2xs text-text-tertiary px-2 py-2">
            {totalTasks.length === 0 ? 'Nessuna attività continuativa.' : 'Nessuna attività per il filtro attivo.'}
          </p>
        )}
        {tasks.map(t => (
          <TaskRow key={t.id} t={t} subs={subtasksOf(t.id)} project={project} wsId={wsId}
            profiles={profiles} canEdit={canEdit} act={act} onOpenTask={onOpenTask} onAddSub={onAddSub} />
        ))}
      </div>
    </section>
  )
}

// ── Nodo milestone della timeline ───────────────────────────────────────────
function MilestoneNode({
  m, index, last, project, wsId, tasks, totalTasks, subtasksOf, profiles, canEdit, act, pending,
  onOpenTask, focus, onAddTask, onAddSub,
}: {
  m: Milestone
  index: number
  last: boolean
  project: Project
  wsId: string
  tasks: Task[]
  totalTasks: Task[]
  subtasksOf: (parentId: string) => Task[]
  profiles: Person[]
  canEdit: boolean
  act: (fn: () => Promise<unknown>, ok?: string) => void
  pending: boolean
  onOpenTask: (t: Task) => void
  focus?: boolean
  onAddTask: () => void
  onAddSub: (t: Task) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(m.title)

  useEffect(() => {
    if (focus && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (canEdit && m.milestone_type !== 'system') { setTitle(m.title); setEditingTitle(true) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  const done2 = m.status === 'completata'
  const d = shortDate(m.due_date)
  const rel = m.due_date && m.status !== 'completata' ? relDays(m.due_date) : null
  const overdueMs = !!m.due_date && m.status !== 'completata' && m.due_date < today()
  const done = totalTasks.filter(t => t.status === 'completato').length
  const pr = totalTasks.length ? Math.round((done / totalTasks.length) * 100) : 0
  const owner = m.owner_id ? profiles.find(p => p.id === m.owner_id) : null
  const lateHere = totalTasks.filter(isOverdue).length

  return (
    <div ref={ref} className="relative flex gap-3">
      {/* colonna data + nodo + linea */}
      <div className="flex flex-col items-center shrink-0 w-9">
        {d ? (
          <div className="text-center leading-none mb-1">
            <div className={`text-base font-black tabular ${overdueMs ? 'text-error' : 'text-text-primary'}`}>{d.day}</div>
            <div className="text-2xs text-text-tertiary">{d.mon}</div>
          </div>
        ) : <div className="h-8 flex items-center"><span className="text-2xs text-text-tertiary">—</span></div>}
        <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${MS_DOT[m.status]}`} />
        {!last && <span className="w-0.5 flex-1 bg-border mt-1" style={{ minHeight: 24 }} />}
      </div>

      {/* card milestone */}
      <div className={`flex-1 min-w-0 mb-4 rounded-2xl border shadow-soft transition-colors ${
        focus ? 'border-gold' : overdueMs ? 'border-error/40' : 'border-border'
      } bg-surface`}>
        <div className="flex items-center gap-2 p-3">
          {/* completamento in un click, come le task. Se restano task aperte lo dice
              e offre di chiuderle insieme, invece di lasciare stati incoerenti. */}
          <button disabled={!canEdit || pending}
            aria-label={done2 ? 'Riapri milestone' : 'Completa milestone'}
            onClick={() => {
              if (done2) { act(() => updateMilestone(m.id, project.id, { status: 'da_fare' }), 'Milestone riaperta'); return }
              const openHere = totalTasks.filter(t => t.status !== 'completato')
              if (openHere.length && !confirm(
                `"${m.title}" ha ${openHere.length} task ancora aperte.\n\nOK: completa milestone e task.\nAnnulla: non fare nulla.`,
              )) return
              act(async () => {
                for (const t of totalTasks.filter(t => t.status !== 'completato')) await updateTaskStatus(t.id, 'completato')
                await updateMilestone(m.id, project.id, { status: 'completata' })
              }, 'Milestone completata')
            }}
            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
              done2 ? 'bg-success border-success' : 'border-border-strong hover:border-gold'
            } disabled:opacity-40`}>
            {done2 && <Check className="w-3 h-3 text-on-gold" strokeWidth={3} />}
          </button>
          <span className="w-6 h-6 rounded-lg bg-info-dim flex items-center justify-center text-2xs font-bold text-info shrink-0 tabular">
            {index + 1}
          </span>
          {editingTitle && canEdit ? (
            // eslint-disable-next-line jsx-a11y/no-autofocus
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus aria-label="Titolo milestone"
              onBlur={() => { if (title.trim() && title !== m.title) act(() => updateMilestone(m.id, project.id, { title }), 'Salvato'); setEditingTitle(false) }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="flex-1 bg-background border border-border-interactive rounded-lg px-2 py-1 text-sm font-semibold text-text-primary" />
          ) : (
            <button onClick={() => canEdit && m.milestone_type !== 'system' && setEditingTitle(true)}
              className={`flex-1 min-w-0 text-left text-sm font-semibold truncate hover:text-gold-text ${
                done2 ? 'text-text-tertiary line-through' : 'text-text-primary'
              }`}>
              {m.title}
            </button>
          )}
          {rel && <span className={`text-2xs font-semibold shrink-0 ${rel.tone}`}>{rel.text}</span>}
          {lateHere > 0 && (
            <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-error-dim text-error shrink-0 tabular">{lateHere} in ritardo</span>
          )}
          {canEdit ? (
            <select value={m.status} disabled={pending}
              onChange={e => act(() => updateMilestone(m.id, project.id, { status: e.target.value as MilestoneStatus }), 'Stato aggiornato')}
              aria-label="Stato milestone" className="text-2xs font-semibold bg-background border border-border-interactive rounded-lg px-2 py-1 text-text-primary shrink-0">
              {MS_STATUS.map(s => <option key={s} value={s}>{MS_STATUS_LABEL[s]}</option>)}
            </select>
          ) : <span className="text-2xs text-text-tertiary shrink-0">{MS_STATUS_LABEL[m.status]}</span>}
          {canEdit && m.milestone_type !== 'system' && (
            <button aria-label="Elimina milestone" className="text-text-tertiary hover:text-error shrink-0"
              onClick={() => { if (confirm(`Eliminare "${m.title}"? Le sue task vengono eliminate con lei.`)) act(() => deleteMilestone(m.id, project.id), 'Milestone eliminata') }}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* meta row: data + owner + progress */}
        <div className="flex flex-wrap items-center gap-3 px-3 pb-2.5">
          <label className="flex items-center gap-1.5 text-2xs text-text-tertiary">
            <Calendar className="w-3.5 h-3.5" />
            <input type="date" defaultValue={m.due_date ?? ''} disabled={!canEdit} aria-label="Scadenza milestone"
              onBlur={e => { if (e.target.value !== (m.due_date ?? '')) act(() => updateMilestone(m.id, project.id, { due_date: e.target.value || null }), 'Scadenza aggiornata') }}
              className="bg-background border border-border-interactive rounded-lg px-2 py-1 text-2xs text-text-primary" />
          </label>
          <label className="flex items-center gap-1.5 text-2xs text-text-tertiary">
            {owner ? <Avatar name={owner.full_name} url={owner.avatar_url} size={20} />
                   : <span className="w-5 h-5 rounded-full bg-surface-active shrink-0" aria-hidden />}
            <select value={m.owner_id ?? ''} disabled={!canEdit} aria-label="Responsabile milestone"
              onChange={e => act(() => updateMilestone(m.id, project.id, { owner_id: e.target.value || null }), 'Assegnata')}
              className="bg-background border border-border-interactive rounded-lg px-2 py-1 text-2xs text-text-primary">
              <option value="">Responsabile…</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </label>
          {totalTasks.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <div className="w-20 h-1 bg-surface-active rounded-full overflow-hidden"><div className="h-full bg-gold rounded-full" style={{ width: `${pr}%` }} /></div>
              <span className="text-2xs text-text-tertiary tabular">{done}/{totalTasks.length}</span>
            </div>
          )}
        </div>

        {/* task */}
        <div className="border-t border-border p-2 space-y-0.5">
          {tasks.map(t => (
            <TaskRow key={t.id} t={t} subs={subtasksOf(t.id)} project={project} wsId={wsId}
              profiles={profiles} canEdit={canEdit} act={act} onOpenTask={onOpenTask} onAddSub={onAddSub} />
          ))}
          {tasks.length === 0 && (
            <p className="text-2xs text-text-tertiary px-2 py-1.5">
              {totalTasks.length === 0 ? 'Nessuna task in questa milestone.' : 'Nessuna task per il filtro attivo.'}
            </p>
          )}
          {canEdit && (
            <button onClick={onAddTask}
              className="flex items-center gap-1.5 text-2xs font-semibold text-text-secondary hover:text-gold-text px-2 pt-1.5 pb-0.5">
              <Plus className="w-3.5 h-3.5" />Nuova task
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Riga task (con subtask) ──────────────────────────────────────────────────
function TaskRow({
  t, subs, project, wsId, profiles, canEdit, act, onOpenTask, onAddSub,
}: {
  t: Task
  subs: Task[]
  project: Project
  wsId: string
  profiles: Person[]
  canEdit: boolean
  act: (fn: () => Promise<unknown>, ok?: string) => void
  onOpenTask: (t: Task) => void
  onAddSub: (t: Task) => void
}) {
  const assignee = t.assignee_id ? profiles.find(p => p.id === t.assignee_id) : null
  const doneSubs = subs.filter(s => s.status === 'completato').length
  const rel = t.due_date && t.status !== 'completato' ? relDays(t.due_date) : null

  const Tick = ({ task }: { task: Task }) => (
    <button disabled={!canEdit} aria-label={task.status === 'completato' ? 'Riapri' : 'Completa'}
      onClick={() => act(() => updateTaskStatus(task.id, task.status === 'completato' ? 'da_fare' : 'completato'))}
      className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
        task.status === 'completato' ? 'bg-success border-success' : 'border-border-strong hover:border-gold'
      }`}>
      {task.status === 'completato' && <Check className="w-3 h-3 text-on-gold" strokeWidth={3} />}
    </button>
  )

  return (
    <div className="rounded-lg hover:bg-surface-hover">
      <div className="flex items-center gap-2 px-2 py-1.5 group">
        <Tick task={t} />
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIO_DOT[t.priority]}`} title={`Priorità ${t.priority}`} />
        <button onClick={() => onOpenTask(t)}
          className={`flex-1 min-w-0 text-left text-sm truncate ${t.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-primary'} hover:text-gold-text`}>
          {t.title}
        </button>
        {subs.length > 0 && <span className="text-2xs text-text-tertiary tabular shrink-0">{doneSubs}/{subs.length}</span>}
        {rel && <span className={`text-2xs tabular shrink-0 ${rel.tone}`}>{rel.text}</span>}
        {assignee
          ? <span title={assignee.full_name} className="shrink-0"><Avatar name={assignee.full_name} url={assignee.avatar_url} size={22} /></span>
          : canEdit && <span className="text-2xs text-warning shrink-0">non assegnata</span>}
        {canEdit && (
          <>
            <select value={t.assignee_id ?? ''} onChange={e => act(() => setTaskAssignees(t.id, e.target.value ? [e.target.value] : []))}
              aria-label="Assegnatario"
              className="text-2xs bg-background border border-border rounded-lg px-1.5 py-1 text-text-secondary max-w-[104px] shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
              <option value="">—</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <button onClick={() => onAddSub(t)} aria-label="Aggiungi subtask"
              className="text-text-tertiary hover:text-gold-text opacity-0 group-hover:opacity-100 shrink-0"><CornerDownRight className="w-3.5 h-3.5" /></button>
            <button onClick={() => { if (confirm('Eliminare la task e le sue subtask?')) act(() => deleteTask(t.id), 'Eliminata') }}
              aria-label="Elimina task" className="text-error opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="w-3 h-3" /></button>
          </>
        )}
      </div>

      {subs.length > 0 && (
        <div className="pl-8 space-y-0.5 pb-1">
          {subs.map(s => (
            <div key={s.id} className="flex items-center gap-2 py-0.5 group/sub">
              <Tick task={s} />
              <button onClick={() => onOpenTask(s)}
                className={`flex-1 min-w-0 text-left text-2xs truncate ${s.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-secondary'} hover:text-gold-text`}>{s.title}</button>
              {s.assignee_id && (() => {
                const sp = profiles.find(p => p.id === s.assignee_id)
                return sp ? <span title={sp.full_name} className="shrink-0"><Avatar name={sp.full_name} url={sp.avatar_url} size={18} /></span> : null
              })()}
              {canEdit && <button onClick={() => act(() => deleteTask(s.id))} aria-label="Elimina subtask" className="text-error opacity-0 group-hover/sub:opacity-100 shrink-0"><Trash2 className="w-3 h-3" /></button>}
            </div>
          ))}
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
  projectId: string; clientId: string | null; wsId: string; systemMilestoneId: string
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
        {recurring.length === 0 && editing !== 'new' && (
          <p className="text-2xs text-text-tertiary">Nessuna attività ricorrente: qui definisci cosa si ripete e ogni quanto.</p>
        )}
        {recurring.map(r => editing === r.id ? (
          <RecurringForm key={r.id} profiles={profiles} pending={pending}
            initial={{ title: r.title, frequency: r.frequency, interval: r.interval, weekdays: r.weekdays ?? [], day_of_month: r.day_of_month, owner_id: r.owner_id, visibility: r.visibility }}
            onCancel={() => setEditing(null)} onSave={v => { act(() => updateRecurring(r.id, projectId, v), 'Aggiornata'); setEditing(null) }} />
        ) : (
          <div key={r.id} className={`flex items-center gap-2 py-1 group ${r.active ? '' : 'opacity-50'}`}>
            <Repeat className="w-3.5 h-3.5 text-success shrink-0" />
            <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{r.title}</span>
            <span className="text-2xs text-success shrink-0">{FREQ_LABEL[r.frequency] ?? r.frequency}{r.interval > 1 ? ` ×${r.interval}` : ''}</span>
            {r.visibility === 'client_visible' && <span className="text-2xs text-info shrink-0">cliente</span>}
            {canEdit && (
              <>
                <button onClick={() => act(() => updateRecurring(r.id, projectId, { active: !r.active }), r.active ? 'Sospesa' : 'Riattivata')} className="text-2xs text-text-tertiary hover:text-gold-text shrink-0">{r.active ? 'Pausa' : 'Attiva'}</button>
                <button onClick={() => setEditing(r.id)} aria-label="Modifica ricorrente" className="text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 shrink-0"><Pencil className="w-3 h-3" /></button>
                <button onClick={() => { if (confirm(`Eliminare "${r.title}"? Le occorrenze già generate restano.`)) act(() => deleteRecurring(r.id, projectId), 'Eliminata') }} aria-label="Elimina ricorrente" className="text-error opacity-0 group-hover:opacity-100 shrink-0"><Trash2 className="w-3 h-3" /></button>
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
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <input value={title} onChange={e => setTitle(e.target.value)} autoFocus aria-label="Titolo ricorrente"
        placeholder="Titolo (es. Check Ads)" className={inputCls} />
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
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={ownerId} onChange={e => setOwnerId(e.target.value)} aria-label="Responsabile" className="bg-surface border border-border-interactive rounded-lg px-2 py-1.5 text-2xs text-text-primary">
          <option value="">Responsabile…</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <Segmented ariaLabel="Visibilità" value={visibility} onChange={setVisibility}
          options={[{ value: 'internal', label: 'Interna' }, { value: 'client_visible', label: 'Cliente' }]} />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-2xs font-semibold text-text-secondary px-2.5 py-1.5">Annulla</button>
        <button onClick={submit} disabled={pending || !title.trim()} className="text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg disabled:opacity-40">Salva</button>
      </div>
    </div>
  )
}
