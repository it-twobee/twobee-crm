'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  List, LayoutGrid, GanttChartSquare, CalendarDays, Plus,
  AlertTriangle, Repeat, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { updateTaskStatus, createProjectTask } from '@/app/actions/tasks'
import type { Task, ProjectWorkstream, Milestone, TaskStatusV2 } from '@/lib/types/database'

type Person = { id: string; full_name: string; avatar_url?: string | null }
type View = 'lista' | 'board' | 'timeline' | 'calendario'

const COLUMNS: { key: TaskStatusV2; label: string }[] = [
  { key: 'da_fare', label: 'Da fare' },
  { key: 'in_corso', label: 'In corso' },
  { key: 'in_review', label: 'In review' },
  { key: 'richiesta_supporto', label: 'Supporto' },
  { key: 'completato', label: 'Completato' },
]
const TASK_TONE: Record<string, string> = {
  da_fare: 'text-text-tertiary', in_corso: 'text-info', in_review: 'text-warning',
  richiesta_supporto: 'text-orange', completato: 'text-success',
}
const today = () => new Date().toISOString().slice(0, 10)
const isOverdue = (t: Task) => !!t.due_date && t.status !== 'completato' && t.due_date < today()

export function TaskViews({
  tasks, workstreams, milestones, profiles, canEdit, projectId, clientId,
}: {
  tasks: Task[]
  workstreams: ProjectWorkstream[]
  milestones: Milestone[]
  profiles: Person[]
  canEdit: boolean
  projectId: string
  clientId: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [view, setView] = useState<View>('lista')
  const [selected, setSelected] = useState<Task | null>(null)
  const [fAssignee, setFAssignee] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [adding, setAdding] = useState(false)

  const wsName = (id: string | null) => workstreams.find(w => w.id === id)?.name ?? ''
  const msName = (id: string | null) => milestones.find(m => m.id === id)?.title ?? ''
  const pName = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? '') : ''

  const filtered = useMemo(() => tasks.filter(t =>
    (!fAssignee || t.assignee_id === fAssignee) && (!hideDone || t.status !== 'completato'),
  ), [tasks, fAssignee, hideDone])

  const refresh = () => router.refresh()
  const move = (t: Task, status: TaskStatusV2) => start(async () => {
    try { await updateTaskStatus(t.id, status); refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-surface border border-border rounded-lg p-0.5">
          {([['lista', List], ['board', LayoutGrid], ['timeline', GanttChartSquare], ['calendario', CalendarDays]] as const).map(([v, Icon]) => (
            <button key={v} onClick={() => setView(v)} aria-label={v}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-2xs font-semibold capitalize ${view === v ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'}`}>
              <Icon className="w-3.5 h-3.5" />{v}
            </button>
          ))}
        </div>
        <select value={fAssignee} onChange={e => setFAssignee(e.target.value)} aria-label="Filtra assegnatario"
          className="bg-background border border-border-interactive rounded px-2 py-1 text-2xs text-text-primary">
          <option value="">Tutti</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <label className="flex items-center gap-1 text-2xs text-text-secondary">
          <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />Nascondi completate
        </label>
        <span className="text-2xs text-text-tertiary ml-auto">{filtered.length} task</span>
        {canEdit && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-2xs font-semibold bg-gold text-on-gold px-2.5 py-1.5 rounded">
            <Plus className="w-3.5 h-3.5" />Task
          </button>
        )}
      </div>

      {adding && (
        <QuickAdd workstreams={workstreams} milestones={milestones} clientId={clientId} projectId={projectId}
          onClose={() => setAdding(false)} onCreated={() => { setAdding(false); refresh() }} />
      )}

      {view === 'lista' && (
        <ListView tasks={filtered} wsName={wsName} pName={pName} onOpen={setSelected} />
      )}
      {view === 'board' && (
        <BoardView tasks={filtered} pName={pName} canEdit={canEdit} onOpen={setSelected} onMove={move} pending={pending} />
      )}
      {view === 'timeline' && (
        <TimelineView tasks={filtered} workstreams={workstreams} onOpen={setSelected} />
      )}
      {view === 'calendario' && (
        <CalendarView tasks={filtered} onOpen={setSelected} />
      )}

      {selected && (
        <TaskDetailDrawer
          task={selected} profiles={profiles} canEdit={canEdit}
          contextLabel={[wsName(selected.workstream_id), msName(selected.milestone_id)].filter(Boolean).join(' · ')}
          onClose={() => setSelected(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}

// ── LISTA ─────────────────────────────────────────────────────────────────────
function ListView({ tasks, wsName, pName, onOpen }: {
  tasks: Task[]; wsName: (id: string | null) => string; pName: (id: string | null) => string; onOpen: (t: Task) => void
}) {
  if (tasks.length === 0) return <Empty />
  return (
    <div className="border border-border rounded-lg divide-y divide-border">
      {tasks.map(t => (
        <button key={t.id} onClick={() => onOpen(t)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover text-left">
          {t.is_recurring_instance && <Repeat className="w-3.5 h-3.5 text-success shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="text-sm text-text-primary truncate">{t.title}</div>
            <div className="text-2xs text-text-tertiary">{wsName(t.workstream_id)}</div>
          </div>
          {isOverdue(t) && <AlertTriangle className="w-3.5 h-3.5 text-error" />}
          {t.assignee_id && <span className="text-2xs text-text-tertiary">{pName(t.assignee_id)}</span>}
          {t.due_date && <span className="text-2xs text-text-tertiary">{t.due_date}</span>}
          <span className={`text-2xs font-semibold ${TASK_TONE[t.status]}`}>{t.status}</span>
        </button>
      ))}
    </div>
  )
}

// ── BOARD ─────────────────────────────────────────────────────────────────────
function BoardView({ tasks, pName, canEdit, onOpen, onMove, pending }: {
  tasks: Task[]; pName: (id: string | null) => string; canEdit: boolean
  onOpen: (t: Task) => void; onMove: (t: Task, s: TaskStatusV2) => void; pending: boolean
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {COLUMNS.map(col => {
        const items = tasks.filter(t => t.status === col.key)
        return (
          <div key={col.key}
            onDragOver={e => { if (canEdit) e.preventDefault() }}
            onDrop={() => { if (canEdit && dragId) { const t = tasks.find(x => x.id === dragId); if (t && t.status !== col.key) onMove(t, col.key); setDragId(null) } }}
            className="shrink-0 w-56 bg-background border border-border rounded-lg p-2">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className={`text-2xs font-bold ${TASK_TONE[col.key]}`}>{col.label}</span>
              <span className="text-2xs text-text-tertiary">{items.length}</span>
            </div>
            <div className="space-y-1.5">
              {items.map(t => (
                <div key={t.id} draggable={canEdit} onDragStart={() => setDragId(t.id)}
                  onClick={() => onOpen(t)}
                  className={`bg-surface border border-border rounded p-2 cursor-pointer hover:border-border-strong ${pending && dragId === t.id ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-1">
                    {t.is_recurring_instance && <Repeat className="w-3 h-3 text-success mt-0.5 shrink-0" />}
                    <span className="text-2xs text-text-primary">{t.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {isOverdue(t) && <AlertTriangle className="w-3 h-3 text-error" />}
                    {t.due_date && <span className="text-2xs text-text-tertiary">{t.due_date.slice(5)}</span>}
                    {t.assignee_id && <span className="text-2xs text-text-tertiary ml-auto truncate">{pName(t.assignee_id)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── TIMELINE ────────────────────────────────────────────────────────────────
function TimelineView({ tasks, workstreams, onOpen }: {
  tasks: Task[]; workstreams: ProjectWorkstream[]; onOpen: (t: Task) => void
}) {
  const dated = tasks.filter(t => t.due_date)
  if (dated.length === 0) return <Empty text="Nessuna task con scadenza." />
  const dates = dated.map(t => t.due_date!)
  const min = dates.reduce((a, b) => a < b ? a : b)
  const max = dates.reduce((a, b) => a > b ? a : b)
  const minT = new Date(min).getTime()
  const span = Math.max(1, new Date(max).getTime() - minT)
  const pos = (d: string) => ((new Date(d).getTime() - minT) / span) * 100

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-2xs text-text-tertiary"><span>{min}</span><span>{max}</span></div>
      {workstreams.map(w => {
        const wt = dated.filter(t => t.workstream_id === w.id)
        if (wt.length === 0) return null
        return (
          <div key={w.id}>
            <div className="text-2xs font-semibold text-text-tertiary mb-1">{w.name}</div>
            <div className="relative h-8 bg-background border border-border rounded">
              {wt.map(t => (
                <button key={t.id} onClick={() => onOpen(t)} title={`${t.title} · ${t.due_date}`}
                  style={{ left: `${pos(t.due_date!)}%` }}
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border border-border ${isOverdue(t) ? 'bg-error' : t.status === 'completato' ? 'bg-success' : 'bg-gold'}`} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── CALENDARIO ───────────────────────────────────────────────────────────────
function CalendarView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const first = new Date(cursor.y, cursor.m, 1)
  const startDow = (first.getDay() + 6) % 7 // lun=0
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const monthLabel = first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  const byDay: Record<string, Task[]> = {}
  tasks.forEach(t => { if (t.due_date) (byDay[t.due_date] ??= []).push(t) })
  const pad = (n: number) => String(n).padStart(2, '0')
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setCursor(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })} aria-label="Mese precedente" className="text-text-secondary"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-semibold text-text-primary capitalize">{monthLabel}</span>
        <button onClick={() => setCursor(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })} aria-label="Mese successivo" className="text-text-secondary"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-2xs text-text-tertiary mb-1">
        {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => <div key={d} className="text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const iso = `${cursor.y}-${pad(cursor.m + 1)}-${pad(day)}`
          const items = byDay[iso] ?? []
          return (
            <div key={i} className="min-h-[60px] border border-border rounded p-1 bg-background">
              <div className={`text-2xs ${iso === today() ? 'text-gold-text font-bold' : 'text-text-tertiary'}`}>{day}</div>
              <div className="space-y-0.5 mt-0.5">
                {items.slice(0, 3).map(t => (
                  <button key={t.id} onClick={() => onOpen(t)} title={t.title}
                    className={`block w-full text-left text-2xs truncate px-1 rounded ${isOverdue(t) ? 'text-error' : t.status === 'completato' ? 'text-success' : 'text-text-primary'} hover:bg-surface-hover`}>
                    {t.title}
                  </button>
                ))}
                {items.length > 3 && <div className="text-2xs text-text-tertiary px-1">+{items.length - 3}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── quick add ────────────────────────────────────────────────────────────────
function QuickAdd({ workstreams, milestones, clientId, projectId, onClose, onCreated }: {
  workstreams: ProjectWorkstream[]; milestones: Milestone[]; clientId: string; projectId: string
  onClose: () => void; onCreated: () => void
}) {
  const [pending, start] = useTransition()
  const [wsId, setWsId] = useState(workstreams[0]?.id ?? '')
  const msOptions = milestones.filter(m => m.workstream_id === wsId)
  const [msId, setMsId] = useState(msOptions[0]?.id ?? '')
  const [title, setTitle] = useState('')

  const create = () => start(async () => {
    try {
      const ms = msId || milestones.find(m => m.workstream_id === wsId)?.id
      if (!ms) { toast.error('Nessuna milestone nel sottoprogetto'); return }
      await createProjectTask({ client_id: clientId, project_id: projectId, workstream_id: wsId, milestone_id: ms, title })
      toast.success('Task creata'); onCreated()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <div className="bg-surface border border-border rounded-lg p-3 flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[160px]">
        <div className="text-2xs font-semibold text-text-secondary mb-1">Sottoprogetto</div>
        <select value={wsId} onChange={e => { setWsId(e.target.value); const m = milestones.find(x => x.workstream_id === e.target.value); setMsId(m?.id ?? '') }}
          className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-2xs text-text-primary">
          {workstreams.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
      <div className="flex-1 min-w-[160px]">
        <div className="text-2xs font-semibold text-text-secondary mb-1">Milestone</div>
        <select value={msId} onChange={e => setMsId(e.target.value)}
          className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-2xs text-text-primary">
          {msOptions.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      </div>
      <div className="flex-[2] min-w-[200px]">
        <div className="text-2xs font-semibold text-text-secondary mb-1">Titolo</div>
        <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && title.trim()) create() }}
          className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary" />
      </div>
      <button onClick={onClose} className="text-2xs font-semibold text-text-secondary px-3 py-1.5">Annulla</button>
      <button onClick={create} disabled={pending || !title.trim() || !wsId}
        className="text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded disabled:opacity-40">Crea</button>
    </div>
  )
}

function Empty({ text = 'Nessuna task.' }: { text?: string }) {
  return <p className="text-sm text-text-tertiary text-center py-10">{text}</p>
}
