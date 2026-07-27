'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  List, LayoutGrid, CalendarDays, Check, Repeat, ChevronDown, ChevronRight,
  AlertTriangle, Clock, Sun, Inbox, CalendarClock, PartyPopper, X,
} from 'lucide-react'
import { TaskDetailDrawer } from '@/components/projects/TaskDetailDrawer'
import { Avatar, SearchInput, Segmented } from '@/components/shared/formkit'
import { updateTaskStatus, updateTask } from '@/app/actions/tasks'
import type { Task, TaskStatusV2, Priority } from '@/lib/types/database'

type Person = { id: string; full_name: string; avatar_url: string | null }
type View = 'elenco' | 'bacheca' | 'calendario'
type GroupBy = 'scadenza' | 'progetto' | 'priorita' | 'stato'
type Bucket = 'tutte' | 'overdue' | 'today' | 'week' | 'none'

const COLUMNS: { key: TaskStatusV2; label: string }[] = [
  { key: 'da_fare', label: 'Da fare' },
  { key: 'in_corso', label: 'In corso' },
  { key: 'in_review', label: 'In review' },
  { key: 'richiesta_supporto', label: 'Supporto' },
  { key: 'completato', label: 'Completato' },
]
const STATUS_LABEL: Record<string, string> = Object.fromEntries(COLUMNS.map(c => [c.key, c.label]))
const TASK_TONE: Record<string, string> = {
  da_fare: 'text-text-tertiary', in_corso: 'text-info', in_review: 'text-warning',
  richiesta_supporto: 'text-orange', completato: 'text-success',
}
const PRIO_DOT: Record<string, string> = { alta: 'bg-error', media: 'bg-warning', bassa: 'bg-text-tertiary' }
const PRIO_LABEL: Record<string, string> = { alta: 'Alta priorità', media: 'Priorità media', bassa: 'Bassa priorità' }
const PRIO_RANK: Record<string, number> = { alta: 0, media: 1, bassa: 2 }
const PROJ_ACCENTS = ['bg-gold', 'bg-info', 'bg-accent', 'bg-success', 'bg-orange', 'bg-warning'] as const

const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const iso = (d: Date) => d.toISOString().slice(0, 10)
const today = () => iso(new Date())
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }
/** prossimo lunedì, per rimandare a inizio settimana */
const nextMonday = () => {
  const d = new Date()
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return iso(d)
}

function dueLabel(d: string | null, completed: boolean): { text: string; tone: string } | null {
  if (!d) return null
  const t0 = new Date(today() + 'T00:00:00').getTime()
  const dt = new Date(d + 'T00:00:00')
  const diff = Math.round((dt.getTime() - t0) / 86400000)
  const base = `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}`
  if (completed) return { text: base, tone: 'text-text-tertiary' }
  if (diff < 0) return { text: `${base} · ${-diff}g fa`, tone: 'text-error' }
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
  const [pending, start] = useTransition()
  const [view, setView] = useState<View>('elenco')
  const [groupBy, setGroupBy] = useState<GroupBy>('scadenza')
  const [q, setQ] = useState('')
  const [bucket, setBucket] = useState<Bucket>('tutte')
  const [prio, setPrio] = useState<'' | Priority>('')
  const [hideDone, setHideDone] = useState(true)
  const [selected, setSelected] = useState<Task | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // la vista scelta è una preferenza personale: sopravvive al reload
  useEffect(() => {
    const v = localStorage.getItem('twobee-mytasks-view') as View | null
    const g = localStorage.getItem('twobee-mytasks-group') as GroupBy | null
    if (v) setView(v)
    if (g) setGroupBy(g)
  }, [])
  useEffect(() => { localStorage.setItem('twobee-mytasks-view', view) }, [view])
  useEffect(() => { localStorage.setItem('twobee-mytasks-group', groupBy) }, [groupBy])

  const person = (id: string | null) => (id ? profiles.find(p => p.id === id) ?? null : null)
  const projLabel = (t: Task) =>
    t.task_type === 'ad_hoc' ? `Ad Hoc · ${clientName[t.client_id ?? ''] ?? 'senza cliente'}`
      : t.task_type === 'cliente' ? `Al cliente · ${clientName[t.client_id ?? ''] ?? '—'}`
      : (projectName[t.project_id ?? ''] ?? 'Progetto')
  const accentKey = (t: Task) => t.task_type === 'ad_hoc' ? `adhoc:${t.client_id}` : (t.project_id ?? '?')

  const projAccent = useMemo(() => {
    const ids = Array.from(new Set(tasks.map(accentKey)))
    const m = new Map<string, string>()
    ids.forEach((id, i) => m.set(id, PROJ_ACCENTS[i % PROJ_ACCENTS.length]))
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks])

  // ── il tuo oggi ───────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const t = today(), w = addDays(7)
    const open = tasks.filter(x => x.status !== 'completato')
    return {
      overdue: open.filter(x => x.due_date && x.due_date < t).length,
      today: open.filter(x => x.due_date === t).length,
      week: open.filter(x => x.due_date && x.due_date > t && x.due_date <= w).length,
      none: open.filter(x => !x.due_date).length,
      open: open.length,
      done: tasks.length - open.length,
    }
  }, [tasks])

  const verdict = useMemo(() => {
    if (tasks.length === 0) return { tone: 'neutral' as const, text: 'Nessuna attività assegnata.' }
    if (counts.overdue > 0) return { tone: 'error' as const, text: `${counts.overdue} in ritardo: recuperale prima di aprire altro.` }
    if (counts.today > 0) return { tone: 'warning' as const, text: `${counts.today} in scadenza oggi.` }
    if (counts.open === 0) return { tone: 'success' as const, text: 'Tutto chiuso. Giornata pulita.' }
    return { tone: 'success' as const, text: `Niente in ritardo. ${counts.open} attività aperte.` }
  }, [tasks.length, counts])

  const shown = useMemo(() => {
    const t = today(), w = addDays(7)
    const term = q.trim().toLowerCase()
    return tasks.filter(x => {
      if (hideDone && x.status === 'completato') return false
      if (prio && x.priority !== prio) return false
      if (term && !x.title.toLowerCase().includes(term) && !projLabel(x).toLowerCase().includes(term)) return false
      if (bucket === 'tutte') return true
      if (x.status === 'completato') return false
      if (bucket === 'overdue') return !!x.due_date && x.due_date < t
      if (bucket === 'today') return x.due_date === t
      if (bucket === 'week') return !!x.due_date && x.due_date > t && x.due_date <= w
      return !x.due_date
    }).sort((a, b) => {
      const da = a.due_date ?? '9999-12-31', db = b.due_date ?? '9999-12-31'
      if (da !== db) return da < db ? -1 : 1
      return PRIO_RANK[a.priority] - PRIO_RANK[b.priority]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, hideDone, prio, q, bucket, projectName, clientName])

  const groups = useMemo(() => {
    const t = today(), w = addDays(7)
    const mk = (key: string, label: string) => ({ key, label, items: [] as Task[] })
    if (groupBy === 'scadenza') {
      const g = {
        overdue: mk('overdue', 'In ritardo'), today: mk('today', 'Oggi'),
        week: mk('week', 'Prossimi 7 giorni'), later: mk('later', 'Più avanti'),
        none: mk('none', 'Senza scadenza'),
      }
      shown.forEach(x => {
        if (!x.due_date) g.none.items.push(x)
        else if (x.due_date < t && x.status !== 'completato') g.overdue.items.push(x)
        else if (x.due_date === t) g.today.items.push(x)
        else if (x.due_date <= w) g.week.items.push(x)
        else g.later.items.push(x)
      })
      return [g.overdue, g.today, g.week, g.later, g.none].filter(s => s.items.length)
    }
    if (groupBy === 'priorita') {
      return (['alta', 'media', 'bassa'] as Priority[])
        .map(p => ({ key: p, label: PRIO_LABEL[p], items: shown.filter(x => x.priority === p) }))
        .filter(s => s.items.length)
    }
    if (groupBy === 'stato') {
      return COLUMNS.map(c => ({ key: c.key, label: c.label, items: shown.filter(x => x.status === c.key) }))
        .filter(s => s.items.length)
    }
    const m = new Map<string, { key: string; label: string; items: Task[] }>()
    shown.forEach(x => {
      const key = accentKey(x)
      if (!m.has(key)) m.set(key, { key, label: projLabel(x), items: [] })
      m.get(key)!.items.push(x)
    })
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, groupBy])

  const refresh = () => router.refresh()
  const act = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })
  const toggle = (t: Task) => act(() => updateTaskStatus(t.id, t.status === 'completato' ? 'da_fare' : 'completato'))
  const move = (t: Task, status: TaskStatusV2) => act(() => updateTaskStatus(t.id, status))
  const snooze = (t: Task, date: string, label: string) => act(() => updateTask(t.id, { due_date: date }), `Rimandata a ${label}`)

  const filtering = bucket !== 'tutte' || !!prio || !!q.trim()

  return (
    <div className="space-y-3">
      {/* verdetto */}
      <div className={`flex items-center gap-2.5 border rounded-2xl px-4 py-3 shadow-soft ${
        verdict.tone === 'error' ? 'bg-error-dim border-error/30'
          : verdict.tone === 'warning' ? 'bg-warning-dim border-warning/30'
          : verdict.tone === 'success' ? 'bg-success-dim border-success/30' : 'bg-surface border-border'
      }`}>
        {verdict.tone === 'success' ? <PartyPopper className="w-4 h-4 text-success shrink-0" />
          : verdict.tone === 'neutral' ? <Inbox className="w-4 h-4 text-text-secondary shrink-0" />
          : <AlertTriangle className={`w-4 h-4 shrink-0 ${verdict.tone === 'error' ? 'text-error' : 'text-warning'}`} />}
        <span className={`text-sm font-semibold ${
          verdict.tone === 'error' ? 'text-error' : verdict.tone === 'warning' ? 'text-warning'
            : verdict.tone === 'success' ? 'text-success' : 'text-text-secondary'
        }`}>{verdict.text}</span>
        {counts.done > 0 && <span className="ml-auto text-2xs text-text-tertiary tabular shrink-0">{counts.done} completate</span>}
      </div>

      {/* fuochi: ognuno filtra */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Tile n={counts.overdue} label="In ritardo" tone="error" icon={<AlertTriangle className="w-4 h-4" />}
          active={bucket === 'overdue'} onClick={() => setBucket(b => b === 'overdue' ? 'tutte' : 'overdue')} />
        <Tile n={counts.today} label="Oggi" tone="warning" icon={<Sun className="w-4 h-4" />}
          active={bucket === 'today'} onClick={() => setBucket(b => b === 'today' ? 'tutte' : 'today')} />
        <Tile n={counts.week} label="Prossimi 7 giorni" tone="info" icon={<CalendarClock className="w-4 h-4" />}
          active={bucket === 'week'} onClick={() => setBucket(b => b === 'week' ? 'tutte' : 'week')} />
        <Tile n={counts.none} label="Senza scadenza" icon={<Inbox className="w-4 h-4" />}
          active={bucket === 'none'} onClick={() => setBucket(b => b === 'none' ? 'tutte' : 'none')} />
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-surface border border-border rounded-xl p-0.5 shrink-0">
          {([['elenco', List], ['bacheca', LayoutGrid], ['calendario', CalendarDays]] as const).map(([v, Icon]) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v} aria-label={v}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-2xs font-semibold capitalize transition-colors ${
                view === v ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'
              }`}>
              <Icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{v}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[150px]"><SearchInput value={q} onChange={setQ} placeholder="Cerca attività o progetto…" /></div>
        {view === 'elenco' && (
          <div className="w-64 shrink-0">
            <Segmented ariaLabel="Raggruppa per" value={groupBy} onChange={setGroupBy}
              options={[
                { value: 'scadenza', label: 'Scadenza' }, { value: 'progetto', label: 'Progetto' },
                { value: 'priorita', label: 'Priorità' }, { value: 'stato', label: 'Stato' },
              ]} />
          </div>
        )}
        <select value={prio} onChange={e => setPrio(e.target.value as '' | Priority)} aria-label="Filtra per priorità"
          className="bg-surface border border-border-interactive rounded-xl px-3 py-2 text-2xs text-text-primary shrink-0">
          <option value="">Ogni priorità</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="bassa">Bassa</option>
        </select>
        <label className="flex items-center gap-1.5 text-2xs text-text-secondary shrink-0 cursor-pointer">
          <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />Nascondi completate
        </label>
        {filtering && (
          <button onClick={() => { setBucket('tutte'); setPrio(''); setQ('') }}
            className="flex items-center gap-1 text-2xs font-semibold text-text-secondary hover:text-text-primary shrink-0">
            <X className="w-3.5 h-3.5" />Azzera
          </button>
        )}
        <span className="text-2xs text-text-tertiary tabular shrink-0">{shown.length}</span>
      </div>

      {shown.length === 0 && (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-success-dim flex items-center justify-center mx-auto mb-3">
            <PartyPopper className="w-6 h-6 text-success" />
          </div>
          <p className="text-sm text-text-secondary">
            {tasks.length === 0 ? 'Nessuna attività assegnata.' : filtering ? 'Nessuna attività per i filtri attivi.' : 'Tutto completato.'}
          </p>
          {filtering && (
            <button onClick={() => { setBucket('tutte'); setPrio(''); setQ('') }} className="text-2xs font-semibold text-gold-text mt-2">
              Azzera i filtri
            </button>
          )}
        </div>
      )}

      {/* ELENCO */}
      {view === 'elenco' && shown.length > 0 && (
        <div className="border border-border rounded-2xl overflow-hidden bg-surface shadow-soft">
          <div className="hidden sm:grid grid-cols-[1fr_128px_112px_170px] gap-2 px-4 py-2 border-b border-border bg-surface-active/40">
            <span className="text-2xs font-bold uppercase tracking-wide text-text-tertiary">Attività</span>
            <span className="text-2xs font-bold uppercase tracking-wide text-text-tertiary">Scadenza</span>
            <span className="text-2xs font-bold uppercase tracking-wide text-text-tertiary">Stato</span>
            <span className="text-2xs font-bold uppercase tracking-wide text-text-tertiary">Dove</span>
          </div>
          {groups.map(g => {
            const isCol = collapsed[g.key]
            const late = g.items.filter(isOverdue).length
            return (
              <div key={g.key}>
                <button onClick={() => setCollapsed(c => ({ ...c, [g.key]: !c[g.key] }))} aria-expanded={!isCol}
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-surface-hover border-b border-border">
                  {isCol ? <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" /> : <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />}
                  <span className={`text-xs font-bold ${g.key === 'overdue' ? 'text-error' : 'text-text-primary'}`}>{g.label}</span>
                  <span className="text-2xs text-text-tertiary tabular">{g.items.length}</span>
                  {g.key !== 'overdue' && late > 0 && (
                    <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-error-dim text-error tabular">{late} in ritardo</span>
                  )}
                </button>
                {!isCol && g.items.map(t => {
                  const p = person(t.assignee_id)
                  const due = dueLabel(t.due_date, t.status === 'completato')
                  const done = t.status === 'completato'
                  return (
                    <div key={t.id}
                      className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_128px_112px_170px] gap-x-2 gap-y-1 items-center px-4 py-2.5 border-b border-border/60 hover:bg-surface-hover group">
                      {/* nome */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button onClick={() => toggle(t)} disabled={pending} aria-label={done ? 'Riapri' : 'Completa'}
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                            done ? 'bg-success border-success' : 'border-border-strong hover:border-gold'
                          }`}>
                          {done && <Check className="w-2.5 h-2.5 text-on-gold" strokeWidth={3} />}
                        </button>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIO_DOT[t.priority]}`} title={PRIO_LABEL[t.priority]} />
                        {t.is_recurring_instance && <Repeat className="w-3 h-3 text-success shrink-0" aria-label="Ricorrente" />}
                        <button onClick={() => setSelected(t)}
                          className={`flex-1 min-w-0 text-left text-sm truncate hover:text-gold-text transition-colors ${
                            done ? 'text-text-tertiary line-through' : 'text-text-primary'
                          }`}>{t.title}</button>
                        {p && <span title={p.full_name} className="shrink-0"><Avatar name={p.full_name} url={p.avatar_url} size={20} /></span>}
                        {/* rimanda: appare solo su hover, solo se ha senso */}
                        {!done && (
                          <span className="hidden sm:flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => snooze(t, addDays(1), 'domani')} title="Rimanda a domani"
                              className="text-2xs font-semibold text-text-tertiary hover:text-gold-text px-1">+1g</button>
                            <button onClick={() => snooze(t, nextMonday(), 'lunedì')} title="Rimanda a lunedì"
                              className="text-2xs font-semibold text-text-tertiary hover:text-gold-text px-1">Lun</button>
                          </span>
                        )}
                      </div>
                      {/* scadenza, editabile in hover */}
                      <div className="hidden sm:flex items-center">
                        <span className={`text-2xs tabular group-hover:hidden ${due?.tone ?? 'text-text-tertiary'}`}>{due?.text ?? '—'}</span>
                        <input type="date" defaultValue={t.due_date ?? ''} aria-label="Scadenza"
                          onChange={e => { if (e.target.value !== (t.due_date ?? '')) act(() => updateTask(t.id, { due_date: e.target.value || null }), 'Scadenza aggiornata') }}
                          className="hidden group-hover:block w-full text-2xs bg-background border border-border rounded-lg px-1.5 py-1 text-text-primary" />
                      </div>
                      {/* stato */}
                      <div className="hidden sm:block">
                        <select value={t.status} onChange={e => move(t, e.target.value as TaskStatusV2)} aria-label="Stato"
                          className={`w-full text-2xs font-semibold bg-transparent border border-transparent group-hover:border-border rounded-lg px-1.5 py-1 ${TASK_TONE[t.status]}`}>
                          {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                      </div>
                      {/* dove */}
                      <div className="col-start-1 sm:col-start-4 flex items-center gap-1.5 min-w-0">
                        <span className="inline-flex items-center gap-1.5 text-2xs px-2 py-0.5 rounded-md bg-surface-active text-text-secondary max-w-full">
                          <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${projAccent.get(accentKey(t))}`} />
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
        <BoardView tasks={shown} onOpen={setSelected} onMove={move}
          accentOf={t => projAccent.get(accentKey(t))} projLabel={projLabel} personOf={t => person(t.assignee_id)} />
      )}

      {/* CALENDARIO */}
      {view === 'calendario' && shown.length > 0 && (
        <CalendarView tasks={shown} onOpen={setSelected} accentOf={t => projAccent.get(accentKey(t))} />
      )}

      {selected && (
        <TaskDetailDrawer task={selected} profiles={profiles.map(p => ({ id: p.id, full_name: p.full_name }))} canEdit
          contextLabel={projLabel(selected)}
          onClose={() => setSelected(null)} onChanged={refresh} />
      )}
    </div>
  )
}

function Tile({ n, label, icon, tone, active, onClick }: {
  n: number; label: string; icon: React.ReactNode
  tone?: 'error' | 'warning' | 'info'; active: boolean; onClick: () => void
}) {
  const ink = n === 0 ? 'text-text-primary'
    : tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning' : tone === 'info' ? 'text-info' : 'text-text-primary'
  return (
    <button onClick={onClick} aria-pressed={active} disabled={n === 0}
      className={`bg-surface border rounded-2xl px-3.5 py-3 shadow-soft text-left transition-colors hover:bg-surface-hover no-tap-highlight disabled:opacity-50 disabled:hover:bg-surface ${
        active ? 'border-gold ring-1 ring-gold' : 'border-border'
      }`}>
      <div className="flex items-center justify-between">
        <span className={`text-2xl font-black tabular font-heading ${ink}`}>{n}</span>
        <span className={n === 0 ? 'text-text-tertiary' : ink}>{icon}</span>
      </div>
      <div className="text-2xs text-text-tertiary mt-0.5 truncate">{label}</div>
    </button>
  )
}

// ── BACHECA ─────────────────────────────────────────────────────────────────
function BoardView({ tasks, onOpen, onMove, accentOf, projLabel, personOf }: {
  tasks: Task[]; onOpen: (t: Task) => void; onMove: (t: Task, s: TaskStatusV2) => void
  accentOf: (t: Task) => string | undefined; projLabel: (t: Task) => string
  personOf: (t: Task) => Person | null
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  return (
    <div className="flex gap-3 scroll-x-touch pb-2 items-start">
      {COLUMNS.map(col => {
        const items = tasks.filter(t => t.status === col.key)
        const late = items.filter(isOverdue).length
        return (
          <div key={col.key}
            onDragOver={e => { e.preventDefault(); setOver(col.key) }}
            onDragLeave={() => setOver(o => (o === col.key ? null : o))}
            onDrop={() => {
              const t = tasks.find(x => x.id === dragId)
              if (t && t.status !== col.key) onMove(t, col.key)
              setDragId(null); setOver(null)
            }}
            className={`shrink-0 w-64 rounded-2xl p-2 border transition-colors ${
              over === col.key ? 'border-gold bg-gold-dim' : 'border-border bg-background'
            }`}>
            <div className="flex items-center gap-2 px-1 pb-2">
              <span className={`text-2xs font-bold ${TASK_TONE[col.key]}`}>{col.label}</span>
              <span className="text-2xs text-text-tertiary tabular">{items.length}</span>
              {late > 0 && <span className="ml-auto text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-error-dim text-error tabular">{late}</span>}
            </div>
            <div className="space-y-1.5 min-h-[56px]">
              {items.length === 0 && (
                <p className="text-2xs text-text-tertiary/70 px-1 py-3 text-center">
                  {over === col.key ? 'Rilascia qui' : 'Vuota'}
                </p>
              )}
              {items.map(t => {
                const p = personOf(t)
                const due = dueLabel(t.due_date, t.status === 'completato')
                return (
                  <div key={t.id} draggable onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOver(null) }}
                    onClick={() => onOpen(t)}
                    className={`bg-surface border rounded-xl p-2.5 cursor-pointer hover:border-border-strong shadow-soft transition-opacity ${
                      dragId === t.id ? 'opacity-40' : ''
                    } ${isOverdue(t) ? 'border-error/40' : 'border-border'}`}>
                    <div className="flex items-start gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${PRIO_DOT[t.priority]}`} title={PRIO_LABEL[t.priority]} />
                      {t.is_recurring_instance && <Repeat className="w-3 h-3 text-success shrink-0 mt-1" />}
                      <span className="text-2xs text-text-primary leading-snug">{t.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`w-2 h-2 rounded-sm shrink-0 ${accentOf(t)}`} />
                      <span className="text-2xs text-text-tertiary truncate flex-1">{projLabel(t)}</span>
                      {due && <span className={`text-2xs tabular shrink-0 ${due.tone}`}>{due.text}</span>}
                      {p && <span title={p.full_name} className="shrink-0"><Avatar name={p.full_name} url={p.avatar_url} size={18} /></span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── CALENDARIO ──────────────────────────────────────────────────────────────
function CalendarView({ tasks, onOpen, accentOf }: {
  tasks: Task[]; onOpen: (t: Task) => void; accentOf: (t: Task) => string | undefined
}) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [day, setDay] = useState<string | null>(null)
  const first = new Date(cursor.y, cursor.m, 1)
  const startDow = (first.getDay() + 6) % 7
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const monthLabel = first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  const byDay: Record<string, Task[]> = {}
  tasks.forEach(t => { if (t.due_date) (byDay[t.due_date] ??= []).push(t) })
  const pad = (n: number) => String(n).padStart(2, '0')
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const t = today()
  const undated = tasks.filter(x => !x.due_date)

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-border rounded-2xl p-3 shadow-soft">
        <div className="flex items-center gap-2 mb-2.5">
          <button onClick={() => setCursor(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })}
            aria-label="Mese precedente" className="text-text-secondary hover:text-text-primary press"><ChevronRight className="w-4 h-4 rotate-180" /></button>
          <span className="text-sm font-bold text-text-primary capitalize flex-1 text-center">{monthLabel}</span>
          <button onClick={() => setCursor(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })}
            aria-label="Mese successivo" className="text-text-secondary hover:text-text-primary press"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }) }}
            className="text-2xs font-semibold text-gold-text hover:opacity-80 press">Oggi</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-2xs text-text-tertiary mb-1">
          {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => <div key={d} className="text-center font-semibold">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const dateStr = `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`
            const items = byDay[dateStr] ?? []
            const isToday = dateStr === t
            const weekend = i % 7 >= 5
            const late = items.filter(isOverdue).length
            return (
              <button key={i} onClick={() => items.length && setDay(dateStr)}
                className={`min-h-[72px] border rounded-lg p-1 text-left transition-colors ${
                  isToday ? 'border-gold bg-gold-dim' : weekend ? 'border-border bg-background/50' : 'border-border bg-background'
                } ${items.length ? 'hover:bg-surface-hover cursor-pointer' : 'cursor-default'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-2xs tabular ${isToday ? 'text-gold-text font-bold' : weekend ? 'text-text-tertiary/70' : 'text-text-tertiary'}`}>{d}</span>
                  {late > 0 && <span className="w-1.5 h-1.5 rounded-full bg-error" aria-label={`${late} in ritardo`} />}
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {items.slice(0, 3).map(x => (
                    <span key={x.id} className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-sm shrink-0 ${accentOf(x)}`} />
                      <span className={`text-2xs truncate ${
                        isOverdue(x) ? 'text-error' : x.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-primary'
                      }`}>{x.title}</span>
                    </span>
                  ))}
                  {items.length > 3 && <span className="block text-2xs text-text-tertiary">+{items.length - 3}</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-3 shadow-soft">
          <div className="flex items-center gap-1.5 mb-2">
            <Inbox className="w-3.5 h-3.5 text-text-tertiary" />
            <span className="text-2xs font-bold uppercase tracking-wide text-text-tertiary">Senza scadenza</span>
            <span className="text-2xs text-text-tertiary tabular">{undated.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {undated.map(x => (
              <button key={x.id} onClick={() => onOpen(x)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-background border border-border text-2xs text-text-secondary hover:text-text-primary hover:bg-surface-hover max-w-full">
                <span className={`w-2 h-2 rounded-sm shrink-0 ${accentOf(x)}`} />
                <span className="truncate">{x.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* dettaglio del giorno scelto */}
      {day && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-scrim sm:p-4 animate-fade-in" onClick={() => setDay(null)}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Attività del giorno"
            className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-pop animate-slide-up pb-safe overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
              <Clock className="w-4 h-4 text-gold-text shrink-0" />
              <span className="flex-1 text-sm font-bold text-text-primary">
                {new Date(day + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <button onClick={() => setDay(null)} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {(byDay[day] ?? []).map(x => (
                <button key={x.id} onClick={() => { setDay(null); onOpen(x) }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left hover:bg-surface-hover">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIO_DOT[x.priority]}`} />
                  <span className={`flex-1 min-w-0 truncate text-sm ${
                    x.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-primary'
                  }`}>{x.title}</span>
                  <span className={`text-2xs font-semibold shrink-0 ${TASK_TONE[x.status]}`}>{STATUS_LABEL[x.status]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
