'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  List, LayoutGrid, CalendarDays, Check, Repeat, ChevronDown, ChevronRight,
  Search, Layers, AlertTriangle,
} from 'lucide-react'
import { TaskDetailDrawer } from '@/components/projects/TaskDetailDrawer'
import { updateTaskStatus } from '@/app/actions/tasks'
import type { Task, TaskStatusV2 } from '@/lib/types/database'

type Person = { id: string; full_name: string; avatar_url: string | null }
type View = 'elenco' | 'bacheca' | 'calendario'
type GroupBy = 'scadenza' | 'progetto'

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
const PRIO_DOT: Record<string, string> = { alta: 'bg-error', media: 'bg-warning', bassa: 'bg-text-tertiary' }
const PROJ_ACCENTS = ['bg-gold', 'bg-info', 'bg-accent', 'bg-success', 'bg-orange', 'bg-warning'] as const

const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const iso = (d: Date) => d.toISOString().slice(0, 10)
const today = () => iso(new Date())

function dueLabel(d: string | null, completed: boolean): { text: string; tone: string } | null {
  if (!d) return null
  const t0 = new Date(today() + 'T00:00:00').getTime()
  const dt = new Date(d + 'T00:00:00')
  const diff = Math.round((dt.getTime() - t0) / 86400000)
  const base = `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}`
  if (completed) return { text: base, tone: 'text-text-tertiary' }
  if (diff < 0) return { text: base, tone: 'text-error' }
  if (diff === 0) return { text: 'Oggi', tone: 'text-warning' }
  if (diff === 1) return { text: 'Domani', tone: 'text-warning' }
  if (diff <= 6) return { text: WEEKDAYS[dt.getDay()], tone: 'text-text-secondary' }
  return { text: base, tone: 'text-text-secondary' }
}

const isOverdue = (t: Task) => !!t.due_date && t.status !== 'completato' && t.due_date < today()

export function MyTasksClient({
  tasks, profiles, projectName, clientName,
}: {
  tasks: Task[]
  profiles: Person[]
  projectName: Record<string, string>
  clientName: Record<string, string>
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [view, setView] = useState<View>('elenco')
  const [groupBy, setGroupBy] = useState<GroupBy>('scadenza')
  const [q, setQ] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [selected, setSelected] = useState<Task | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const person = (id: string | null) => (id ? profiles.find(p => p.id === id) ?? null : null)
  const projLabel = (t: Task) => t.task_type === 'ad_hoc' ? `Ad Hoc · ${clientName[t.client_id] ?? ''}` : (projectName[t.project_id ?? ''] ?? 'Progetto')

  // colore consistente per progetto
  const projAccent = useMemo(() => {
    const ids = Array.from(new Set(tasks.map(t => t.task_type === 'ad_hoc' ? `adhoc:${t.client_id}` : (t.project_id ?? '?'))))
    const m = new Map<string, string>()
    ids.forEach((id, i) => m.set(id, PROJ_ACCENTS[i % PROJ_ACCENTS.length]))
    return m
  }, [tasks])
  const accentKey = (t: Task) => t.task_type === 'ad_hoc' ? `adhoc:${t.client_id}` : (t.project_id ?? '?')

  const shown = useMemo(() => tasks.filter(t =>
    (!hideDone || t.status !== 'completato') &&
    (!q || t.title.toLowerCase().includes(q.toLowerCase()) || projLabel(t).toLowerCase().includes(q.toLowerCase())),
  ), [tasks, hideDone, q]) // eslint-disable-line react-hooks/exhaustive-deps

  // raggruppamento
  const groups = useMemo(() => {
    const t = today()
    const week = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return iso(d) })()
    const mk = (key: string, label: string) => ({ key, label, items: [] as Task[] })
    if (groupBy === 'scadenza') {
      const g = {
        overdue: mk('overdue', 'Scadute'),
        today: mk('today', 'Oggi'),
        week: mk('week', 'Prossimi 7 giorni'),
        later: mk('later', 'Più avanti'),
        none: mk('none', 'Senza scadenza'),
      }
      shown.forEach(x => {
        if (!x.due_date) g.none.items.push(x)
        else if (x.due_date < t && x.status !== 'completato') g.overdue.items.push(x)
        else if (x.due_date === t) g.today.items.push(x)
        else if (x.due_date <= week) g.week.items.push(x)
        else g.later.items.push(x)
      })
      return [g.overdue, g.today, g.week, g.later, g.none].filter(s => s.items.length)
    }
    const m = new Map<string, { key: string; label: string; items: Task[] }>()
    shown.forEach(x => {
      const key = accentKey(x)
      const label = projLabel(x)
      if (!m.has(key)) m.set(key, { key, label, items: [] })
      m.get(key)!.items.push(x)
    })
    return Array.from(m.values())
  }, [shown, groupBy]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => router.refresh()
  const toggle = (t: Task) => start(async () => {
    try { await updateTaskStatus(t.id, t.status === 'completato' ? 'da_fare' : 'completato'); refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })
  const move = (t: Task, status: TaskStatusV2) => start(async () => {
    try { await updateTaskStatus(t.id, status); refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-surface border border-border rounded-lg p-0.5">
          {([['elenco', List], ['bacheca', LayoutGrid], ['calendario', CalendarDays]] as const).map(([v, Icon]) => (
            <button key={v} onClick={() => setView(v)} aria-label={v}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-2xs font-semibold capitalize ${view === v ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'}`}>
              <Icon className="w-3.5 h-3.5" />{v}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[150px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca attività…"
            className="w-full bg-surface border border-border-interactive rounded-lg pl-8 pr-3 py-1.5 text-2xs text-text-primary" />
        </div>
        {view === 'elenco' && (
          <button onClick={() => setGroupBy(g => g === 'scadenza' ? 'progetto' : 'scadenza')}
            className="flex items-center gap-1 text-2xs font-semibold text-text-secondary hover:text-text-primary border border-border rounded-lg px-2.5 py-1.5 press">
            <Layers className="w-3.5 h-3.5" />Raggruppa: {groupBy === 'scadenza' ? 'Scadenza' : 'Progetto'}
          </button>
        )}
        <label className="flex items-center gap-1 text-2xs text-text-secondary">
          <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />Nascondi completate
        </label>
        <span className="text-2xs text-text-tertiary ml-auto">{shown.length}</span>
      </div>

      {shown.length === 0 && <p className="text-sm text-text-tertiary text-center py-12">Nessuna attività assegnata. 🎉</p>}

      {/* ELENCO */}
      {view === 'elenco' && shown.length > 0 && (
        <div className="border border-border rounded-2xl overflow-hidden bg-surface">
          {/* header colonne (desktop) */}
          <div className="hidden sm:grid grid-cols-[1fr_120px_44px_180px] gap-2 px-4 py-2 border-b border-border bg-surface-active/40">
            <span className="text-2xs font-bold uppercase tracking-wide text-text-tertiary">Nome</span>
            <span className="text-2xs font-bold uppercase tracking-wide text-text-tertiary">Scadenza</span>
            <span className="text-2xs font-bold uppercase tracking-wide text-text-tertiary text-center">Chi</span>
            <span className="text-2xs font-bold uppercase tracking-wide text-text-tertiary">Progetto</span>
          </div>
          {groups.map(g => {
            const isCol = collapsed[g.key]
            return (
              <div key={g.key}>
                <button onClick={() => setCollapsed(c => ({ ...c, [g.key]: !c[g.key] }))}
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-surface-hover border-b border-border">
                  {isCol ? <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" /> : <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />}
                  <span className={`text-xs font-bold ${g.key === 'overdue' ? 'text-error' : 'text-text-primary'}`}>{g.label}</span>
                  <span className="text-2xs text-text-tertiary tabular">{g.items.length}</span>
                </button>
                {!isCol && g.items.map(t => {
                  const p = person(t.assignee_id)
                  const due = dueLabel(t.due_date, t.status === 'completato')
                  const acc = projAccent.get(accentKey(t))
                  const doneCls = t.status === 'completato'
                  return (
                    <div key={t.id}
                      className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_44px_180px] gap-x-2 gap-y-1 items-center px-4 py-2.5 border-b border-border/60 hover:bg-surface-hover group cursor-pointer"
                      onClick={() => setSelected(t)}>
                      {/* nome + checkbox + priorità + ricorrente */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button onClick={e => { e.stopPropagation(); toggle(t) }} aria-label="Completa"
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${doneCls ? 'bg-success border-success' : 'border-border-strong hover:border-gold'}`}>
                          {doneCls && <Check className="w-2.5 h-2.5 text-on-gold" />}
                        </button>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIO_DOT[t.priority]}`} title={`Priorità ${t.priority}`} />
                        {t.is_recurring_instance && <Repeat className="w-3 h-3 text-success shrink-0" />}
                        <span className={`text-sm truncate ${doneCls ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>{t.title}</span>
                        {isOverdue(t) && <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0 sm:hidden" />}
                      </div>
                      {/* scadenza */}
                      <div className="hidden sm:block">
                        {due ? <span className={`text-2xs tabular ${due.tone}`}>{due.text}</span> : <span className="text-2xs text-text-tertiary">—</span>}
                      </div>
                      {/* avatar */}
                      <div className="hidden sm:flex justify-center">
                        {p ? (
                          <span className="w-6 h-6 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-2xs font-bold text-gold-text overflow-hidden" title={p.full_name}>
                            {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : p.full_name[0].toUpperCase()}
                          </span>
                        ) : <span className="w-6 h-6 rounded-full border border-dashed border-border" />}
                      </div>
                      {/* progetto chip */}
                      <div className="col-start-1 sm:col-start-4 flex items-center gap-1.5 min-w-0">
                        <span className={`inline-flex items-center gap-1.5 text-2xs px-2 py-0.5 rounded-md bg-surface-active text-text-secondary max-w-full`}>
                          <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${acc}`} />
                          <span className="truncate">{projLabel(t)}</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* BACHECA */}
      {view === 'bacheca' && shown.length > 0 && (
        <BoardView tasks={shown} onOpen={setSelected} onMove={move} accentOf={t => projAccent.get(accentKey(t))} projLabel={projLabel} />
      )}

      {/* CALENDARIO */}
      {view === 'calendario' && shown.length > 0 && (
        <CalendarView tasks={shown} onOpen={setSelected} />
      )}

      {selected && (
        <TaskDetailDrawer task={selected} profiles={profiles.map(p => ({ id: p.id, full_name: p.full_name }))} canEdit
          contextLabel={projLabel(selected)}
          onClose={() => setSelected(null)} onChanged={refresh} />
      )}
    </div>
  )
}

// ── BACHECA ─────────────────────────────────────────────────────────────────
function BoardView({ tasks, onOpen, onMove, accentOf, projLabel }: {
  tasks: Task[]; onOpen: (t: Task) => void; onMove: (t: Task, s: TaskStatusV2) => void
  accentOf: (t: Task) => string | undefined; projLabel: (t: Task) => string
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  return (
    <div className="flex gap-3 scroll-x-touch pb-2">
      {COLUMNS.map(col => {
        const items = tasks.filter(t => t.status === col.key)
        return (
          <div key={col.key}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragId) { const t = tasks.find(x => x.id === dragId); if (t && t.status !== col.key) onMove(t, col.key); setDragId(null) } }}
            className="shrink-0 w-60 bg-background border border-border rounded-2xl p-2">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className={`text-2xs font-bold ${TASK_TONE[col.key]}`}>{col.label}</span>
              <span className="text-2xs text-text-tertiary">{items.length}</span>
            </div>
            <div className="space-y-1.5">
              {items.map(t => (
                <div key={t.id} draggable onDragStart={() => setDragId(t.id)} onClick={() => onOpen(t)}
                  className="bg-surface border border-border rounded-xl p-2.5 cursor-pointer hover:border-border-strong shadow-soft">
                  <div className="flex items-start gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${PRIO_DOT[t.priority]}`} />
                    <span className="text-2xs text-text-primary">{t.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className={`w-2 h-2 rounded-sm shrink-0 ${accentOf(t)}`} />
                    <span className="text-2xs text-text-tertiary truncate flex-1">{projLabel(t)}</span>
                    {t.due_date && <span className="text-2xs text-text-tertiary tabular">{t.due_date.slice(5)}</span>}
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

// ── CALENDARIO ──────────────────────────────────────────────────────────────
function CalendarView({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const first = new Date(cursor.y, cursor.m, 1)
  const startDow = (first.getDay() + 6) % 7
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const monthLabel = first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  const byDay: Record<string, Task[]> = {}
  tasks.forEach(t => { if (t.due_date) (byDay[t.due_date] ??= []).push(t) })
  const pad = (n: number) => String(n).padStart(2, '0')
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const t = today()

  return (
    <div className="bg-surface border border-border rounded-2xl p-3 shadow-soft">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setCursor(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })} aria-label="Mese precedente" className="text-text-secondary press"><ChevronRight className="w-4 h-4 rotate-180" /></button>
        <span className="text-sm font-semibold text-text-primary capitalize">{monthLabel}</span>
        <button onClick={() => setCursor(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })} aria-label="Mese successivo" className="text-text-secondary press"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-2xs text-text-tertiary mb-1">
        {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => <div key={d} className="text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const d = `${cursor.y}-${pad(cursor.m + 1)}-${pad(day)}`
          const items = byDay[d] ?? []
          return (
            <div key={i} className="min-h-[64px] border border-border rounded-lg p-1 bg-background">
              <div className={`text-2xs ${d === t ? 'text-gold-text font-bold' : 'text-text-tertiary'}`}>{day}</div>
              <div className="space-y-0.5 mt-0.5">
                {items.slice(0, 3).map(x => (
                  <button key={x.id} onClick={() => onOpen(x)} title={x.title}
                    className={`block w-full text-left text-2xs truncate px-1 rounded ${isOverdue(x) ? 'text-error' : x.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-primary'} hover:bg-surface-hover`}>
                    {x.title}
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
