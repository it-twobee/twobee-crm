'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  FolderKanban, Search, ExternalLink, Clock, CheckCircle2, Zap,
  LayoutGrid, AlignLeft, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { NewProjectButton } from '@/components/projects/NewProjectButton'

interface TaskMeta {
  id: string
  title: string
  status: string
  due_date: string | null
}

interface ProjectWithMeta {
  id: string
  name: string
  status: string
  project_kind: string | null
  client: { id: string; company_name: string } | null
  taskCount: number
  overdueCount: number
  tasks?: TaskMeta[]
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  attivo:    { label: 'Attivo',    color: 'text-success bg-success/10 border-success/20' },
  in_pausa:  { label: 'In pausa', color: 'text-gold-text bg-gold/10 border-warning/20' },
  chiuso:    { label: 'Chiuso',   color: 'text-text-tertiary bg-surface border-border' },
}

const KIND_META: Record<string, { label: string; short: string; color: string }> = {
  growth:   { label: 'Growth',   short: 'G',  color: 'border-gold/25 text-gold-text/70' },
  digital:  { label: 'Digital',  short: 'D',  color: 'border-info/25 text-info/70' },
  marketing:{ label: 'Marketing', short: 'M', color: 'border-warning/25 text-warning/70' },
  ai:       { label: 'AI',       short: 'AI', color: 'border-accent/25 text-accent/70' },
}
const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'tutti', label: 'Tutte le tipologie' },
  { value: 'growth', label: '📈 Growth' },
  { value: 'digital', label: '💻 Digital' },
  { value: 'marketing', label: '📣 Marketing' },
  { value: 'ai', label: '🤖 AI' },
]

const TASK_STATUS_COLOR: Record<string, string> = {
  da_fare:      'var(--color-info)',
  in_corso:     'var(--color-gold-text)',
  in_revisione: 'var(--color-accent)',
  completato:   'var(--color-success)',
}

interface Props {
  projects: ProjectWithMeta[]
}

type ViewMode = 'cards' | 'timeline'
type TimeGrain = 'day' | 'month'

export function WorkspaceProjectsClient({ projects, canCreate = false, clients = [], profiles = [] }: Props & {
  canCreate?: boolean
  clients?: { id: string; company_name: string }[]
  profiles?: { id: string; full_name: string | null }[]
}) {
  const [search, setSearch] = useState('')
  const [kind, setKind]     = useState('tutti')
  const [view, setView]     = useState<ViewMode>('cards')
  const [grain, setGrain]   = useState<TimeGrain>('month')
  const [offset, setOffset] = useState(0)

  const filtered = projects.filter(p =>
    (kind === 'tutti' || p.project_kind === kind) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.client?.company_name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Progetti attivi</h1>
          <p className="text-text-tertiary text-sm mt-0.5">{projects.length} progett{projects.length === 1 ? 'o' : 'i'} attiv{projects.length === 1 ? 'o' : 'i'} in totale</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <NewProjectButton clients={clients} profiles={profiles} isAdmin={false} />
          )}
          <select
            value={kind}
            onChange={e => setKind(e.target.value)}
            className="px-3 py-2 bg-surface border border-border rounded-xl text-sm text-text-primary focus:border-gold/40 outline-none"
          >
            {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca..."
              className="pl-9 pr-4 py-2 bg-surface border border-border rounded-xl text-sm text-text-primary placeholder-text-tertiary focus:border-gold/40 outline-none w-44"
            />
          </div>
          <div className="flex items-center bg-surface border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setView('cards')}
              className={cn('px-3 py-2 transition-colors', view === 'cards' ? 'bg-gold/10 text-gold-text' : 'text-text-tertiary hover:text-text-secondary')}
              title="Vista cards"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('timeline')}
              className={cn('px-3 py-2 transition-colors', view === 'timeline' ? 'bg-gold/10 text-gold-text' : 'text-text-tertiary hover:text-text-secondary')}
              title="Vista timeline"
            >
              <AlignLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-text-tertiary text-sm">
          {search || kind !== 'tutti' ? 'Nessun progetto trovato' : 'Nessun progetto attivo'}
        </div>
      ) : view === 'cards' ? (
        <CardsView projects={filtered} />
      ) : (
        <TimelineView
          projects={filtered}
          grain={grain}
          offset={offset}
          onGrain={g => { setGrain(g); setOffset(0) }}
          onOffset={setOffset}
        />
      )}
    </div>
  )
}

// ─── Cards view ───────────────────────────────────────────────────────────────
function CardsView({ projects }: { projects: ProjectWithMeta[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {projects.map(p => {
        const statusMeta = STATUS_META[p.status] ?? STATUS_META.attivo
        return (
          <Link
            key={p.id}
            href={`/workspace/progetti/${p.id}`}
            className="group block p-5 rounded-2xl bg-surface border border-border hover:border-gold/20 transition-all"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <FolderKanban className="w-4 h-4 text-gold-text/60 shrink-0" />
                <span className="text-text-primary text-sm font-semibold truncate">{p.name}</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-text-tertiary group-hover:text-text-secondary transition-colors shrink-0 mt-0.5" />
            </div>
            {p.client && (
              <p className="text-text-tertiary text-xs mb-3 truncate">{p.client.company_name}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('px-2 py-0.5 rounded-full text-xs border', statusMeta.color)}>
                {statusMeta.label}
              </span>
              {p.project_kind && KIND_META[p.project_kind] && (
                <span className={cn('px-2 py-0.5 rounded-full text-xs border', KIND_META[p.project_kind].color)}>
                  {KIND_META[p.project_kind].short}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {p.taskCount} task
              </div>
              {p.overdueCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-error">
                  <Clock className="w-3.5 h-3.5" />
                  {p.overdueCount} scadut{p.overdueCount === 1 ? 'a' : 'e'}
                </div>
              )}
              {p.status === 'attivo' && p.overdueCount === 0 && (
                <div className="flex items-center gap-1.5 text-xs text-success/60">
                  <Zap className="w-3.5 h-3.5" />
                  In linea
                </div>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ─── Timeline / Gantt view ────────────────────────────────────────────────────
function TimelineView({
  projects, grain, offset, onGrain, onOffset,
}: {
  projects: ProjectWithMeta[]
  grain: TimeGrain
  offset: number
  onGrain: (g: TimeGrain) => void
  onOffset: (fn: (o: number) => number) => void
}) {
  const COLS = grain === 'month' ? 6 : 14
  const step = grain === 'month' ? 3 : 7

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  }, [])

  const labels: Date[] = useMemo(() => {
    const out: Date[] = []
    for (let i = 0; i < COLS; i++) {
      const d = new Date(today)
      if (grain === 'month') {
        d.setMonth(d.getMonth() + offset + i)
        d.setDate(1)
      } else {
        d.setDate(d.getDate() + offset + i)
      }
      out.push(d)
    }
    return out
  }, [grain, offset, today.getTime()])

  const windowStart = new Date(labels[0])
  const windowEnd   = new Date(labels[labels.length - 1])
  if (grain === 'month') {
    windowEnd.setMonth(windowEnd.getMonth() + 1)
    windowEnd.setDate(0)
  } else {
    windowEnd.setHours(23, 59, 59, 999)
  }
  const windowMs = windowEnd.getTime() - windowStart.getTime()

  function pct(date: Date) {
    const t = Math.max(windowStart.getTime(), Math.min(windowEnd.getTime(), date.getTime()))
    return ((t - windowStart.getTime()) / windowMs) * 100
  }

  const todayPct = pct(today)
  const showToday = todayPct >= 0 && todayPct <= 100

  const periodLabel = grain === 'month'
    ? `${labels[0].toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })} – ${labels[COLS - 1].toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`
    : `${labels[0].toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} – ${labels[COLS - 1].toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}`

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center bg-surface border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => onGrain('day')}
            className={cn('px-3 py-1.5 text-xs font-medium transition-colors', grain === 'day' ? 'bg-gold/10 text-gold-text' : 'text-text-tertiary hover:text-text-secondary')}
          >Giorno</button>
          <button
            onClick={() => onGrain('month')}
            className={cn('px-3 py-1.5 text-xs font-medium transition-colors', grain === 'month' ? 'bg-gold/10 text-gold-text' : 'text-text-tertiary hover:text-text-secondary')}
          >Mese</button>
        </div>
        <button onClick={() => onOffset(o => o - step)}
          className="p-1.5 rounded-lg bg-surface border border-border text-text-tertiary hover:text-text-primary transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-text-secondary text-xs flex-1 text-center capitalize min-w-0">{periodLabel}</span>
        <button onClick={() => onOffset(o => o + step)}
          className="p-1.5 rounded-lg bg-surface border border-border text-text-tertiary hover:text-text-primary transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => onOffset(() => 0)}
          className="px-3 py-1.5 text-xs bg-surface border border-border rounded-xl text-text-tertiary hover:text-text-primary transition-colors">
          Oggi
        </button>
      </div>

      <div className="rounded-2xl bg-surface border border-border overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Header */}
          <div className="flex border-b border-border">
            <div className="w-44 shrink-0 px-4 py-2.5 text-2xs text-text-tertiary font-semibold uppercase tracking-wider border-r border-border">
              Progetto / Task
            </div>
            <div className="flex flex-1">
              {labels.map((d, i) => (
                <div key={i}
                  className={cn('flex-1 text-center py-2.5 text-2xs border-r border-border last:border-r-0 truncate px-1',
                    grain === 'day' && d.toDateString() === today.toDateString() ? 'text-error' : 'text-text-tertiary'
                  )}>
                  {grain === 'month'
                    ? d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })
                    : d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          {projects.map((proj, pi) => {
            const tasks = (proj.tasks ?? []).filter(t => t.due_date)
            return (
              <div key={proj.id} className={cn('border-b border-border last:border-b-0', pi % 2 === 1 && 'bg-surface-hover')}>
                {/* Project row */}
                <div className="flex items-center">
                  <div className="w-44 shrink-0 px-4 py-3 border-r border-border">
                    <Link href={`/workspace/progetti/${proj.id}`} className="flex items-center gap-1.5 group">
                      <FolderKanban className="w-3 h-3 text-gold-text/50 shrink-0" />
                      <span className="text-text-primary text-xs font-semibold truncate group-hover:text-gold-text transition-colors">
                        {proj.name}
                      </span>
                    </Link>
                    {proj.client && (
                      <p className="text-text-tertiary text-2xs mt-0.5 truncate pl-4">{proj.client.company_name}</p>
                    )}
                  </div>
                  <div className="flex-1 relative h-12">
                    {showToday && (
                      <div className="absolute inset-y-0 w-px bg-error/40 z-10 pointer-events-none"
                        style={{ left: `${todayPct}%` }} />
                    )}
                    {labels.map((_, i) => (
                      <div key={i} className="absolute inset-y-0 border-r border-border"
                        style={{ left: `${(i + 1) / COLS * 100}%` }} />
                    ))}
                    {/* Dot per ogni task con due_date nel window */}
                    {tasks.map(t => {
                      const due = new Date(t.due_date! + 'T00:00:00')
                      if (due < windowStart || due > windowEnd) return null
                      const color = TASK_STATUS_COLOR[t.status] ?? '#555'
                      return (
                        <div key={t.id}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-border z-10"
                          style={{ left: `${pct(due)}%`, background: color }}
                          title={`${t.title} — ${t.due_date}`}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Task sub-rows */}
                {tasks.map(t => {
                  const due = new Date(t.due_date! + 'T00:00:00')
                  const inWindow = due >= windowStart && due <= windowEnd
                  const color = TASK_STATUS_COLOR[t.status] ?? '#555'
                  return (
                    <div key={t.id} className="flex items-center hover:bg-surface-hover transition-colors">
                      <div className="w-44 shrink-0 px-4 py-1.5 border-r border-border">
                        <div className="flex items-center gap-1.5 pl-4">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-px" style={{ background: color }} />
                          <span className="text-text-secondary text-2xs truncate">{t.title}</span>
                        </div>
                      </div>
                      <div className="flex-1 relative h-6">
                        {showToday && (
                          <div className="absolute inset-y-0 w-px bg-error/20 z-10 pointer-events-none"
                            style={{ left: `${todayPct}%` }} />
                        )}
                        {labels.map((_, i) => (
                          <div key={i} className="absolute inset-y-0 border-r border-border"
                            style={{ left: `${(i + 1) / COLS * 100}%` }} />
                        ))}
                        {inWindow && (
                          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                            style={{ left: `${pct(due)}%` }}>
                            <div className="px-1.5 py-0.5 rounded text-2xs font-semibold text-on-gold whitespace-nowrap"
                              style={{ background: color }}>
                              {due.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
