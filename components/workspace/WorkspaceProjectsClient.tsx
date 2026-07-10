'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  FolderKanban, Search, ExternalLink, Clock, CheckCircle2, Zap,
  LayoutGrid, AlignLeft, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
  attivo:    { label: 'Attivo',    color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  in_pausa:  { label: 'In pausa', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  chiuso:    { label: 'Chiuso',   color: 'text-white/30 bg-white/5 border-white/10' },
}

const KIND_META: Record<string, { label: string; short: string; color: string }> = {
  growth:   { label: 'Growth',   short: 'G',  color: 'border-[#F5C800]/25 text-[#F5C800]/70' },
  digital:  { label: 'Digital',  short: 'D',  color: 'border-blue-400/25 text-blue-400/70' },
  marketing:{ label: 'Marketing', short: 'M', color: 'border-amber-400/25 text-amber-400/70' },
  ai:       { label: 'AI',       short: 'AI', color: 'border-purple-400/25 text-purple-400/70' },
}
const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'tutti', label: 'Tutte le tipologie' },
  { value: 'growth', label: '📈 Growth' },
  { value: 'digital', label: '💻 Digital' },
  { value: 'marketing', label: '📣 Marketing' },
  { value: 'ai', label: '🤖 AI' },
]

const TASK_STATUS_COLOR: Record<string, string> = {
  da_fare:      '#3B82F6',
  in_corso:     '#F5C800',
  in_revisione: '#A855F7',
  completato:   '#22C55E',
}

interface Props {
  projects: ProjectWithMeta[]
}

type ViewMode = 'cards' | 'timeline'
type TimeGrain = 'day' | 'month'

export function WorkspaceProjectsClient({ projects }: Props) {
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
          <h1 className="text-xl font-bold text-white">Progetti attivi</h1>
          <p className="text-white/40 text-sm mt-0.5">{projects.length} progett{projects.length === 1 ? 'o' : 'i'} attiv{projects.length === 1 ? 'o' : 'i'} in totale</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={e => setKind(e.target.value)}
            className="px-3 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-sm text-white focus:border-[#F5C800]/40 outline-none"
          >
            {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca..."
              className="pl-9 pr-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-sm text-white placeholder-white/30 focus:border-[#F5C800]/40 outline-none w-44"
            />
          </div>
          <div className="flex items-center bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden">
            <button
              onClick={() => setView('cards')}
              className={cn('px-3 py-2 transition-colors', view === 'cards' ? 'bg-[#F5C800]/10 text-[#F5C800]' : 'text-white/30 hover:text-white/60')}
              title="Vista cards"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('timeline')}
              className={cn('px-3 py-2 transition-colors', view === 'timeline' ? 'bg-[#F5C800]/10 text-[#F5C800]' : 'text-white/30 hover:text-white/60')}
              title="Vista timeline"
            >
              <AlignLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30 text-sm">
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
            className="group block p-5 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#F5C800]/20 transition-all"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <FolderKanban className="w-4 h-4 text-[#F5C800]/60 shrink-0" />
                <span className="text-white text-sm font-semibold truncate">{p.name}</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 transition-colors shrink-0 mt-0.5" />
            </div>
            {p.client && (
              <p className="text-white/40 text-xs mb-3 truncate">{p.client.company_name}</p>
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
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#2A2A2A]">
              <div className="flex items-center gap-1.5 text-xs text-white/40">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {p.taskCount} task
              </div>
              {p.overdueCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <Clock className="w-3.5 h-3.5" />
                  {p.overdueCount} scadut{p.overdueCount === 1 ? 'a' : 'e'}
                </div>
              )}
              {p.status === 'attivo' && p.overdueCount === 0 && (
                <div className="flex items-center gap-1.5 text-xs text-green-400/60">
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
        <div className="flex items-center bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden">
          <button
            onClick={() => onGrain('day')}
            className={cn('px-3 py-1.5 text-xs font-medium transition-colors', grain === 'day' ? 'bg-[#F5C800]/10 text-[#F5C800]' : 'text-white/30 hover:text-white/60')}
          >Giorno</button>
          <button
            onClick={() => onGrain('month')}
            className={cn('px-3 py-1.5 text-xs font-medium transition-colors', grain === 'month' ? 'bg-[#F5C800]/10 text-[#F5C800]' : 'text-white/30 hover:text-white/60')}
          >Mese</button>
        </div>
        <button onClick={() => onOffset(o => o - step)}
          className="p-1.5 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-white/40 hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-white/50 text-xs flex-1 text-center capitalize min-w-0">{periodLabel}</span>
        <button onClick={() => onOffset(o => o + step)}
          className="p-1.5 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-white/40 hover:text-white transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => onOffset(() => 0)}
          className="px-3 py-1.5 text-xs bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-white/40 hover:text-white transition-colors">
          Oggi
        </button>
      </div>

      <div className="rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Header */}
          <div className="flex border-b border-[#2A2A2A]">
            <div className="w-44 shrink-0 px-4 py-2.5 text-[10px] text-white/30 font-semibold uppercase tracking-wider border-r border-[#2A2A2A]">
              Progetto / Task
            </div>
            <div className="flex flex-1">
              {labels.map((d, i) => (
                <div key={i}
                  className={cn('flex-1 text-center py-2.5 text-[10px] border-r border-[#2A2A2A] last:border-r-0 truncate px-1',
                    grain === 'day' && d.toDateString() === today.toDateString() ? 'text-red-400' : 'text-white/30'
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
              <div key={proj.id} className={cn('border-b border-[#2A2A2A] last:border-b-0', pi % 2 === 1 && 'bg-white/[0.012]')}>
                {/* Project row */}
                <div className="flex items-center">
                  <div className="w-44 shrink-0 px-4 py-3 border-r border-[#2A2A2A]">
                    <Link href={`/workspace/progetti/${proj.id}`} className="flex items-center gap-1.5 group">
                      <FolderKanban className="w-3 h-3 text-[#F5C800]/50 shrink-0" />
                      <span className="text-white text-xs font-semibold truncate group-hover:text-[#F5C800] transition-colors">
                        {proj.name}
                      </span>
                    </Link>
                    {proj.client && (
                      <p className="text-white/25 text-[9px] mt-0.5 truncate pl-4">{proj.client.company_name}</p>
                    )}
                  </div>
                  <div className="flex-1 relative h-12">
                    {showToday && (
                      <div className="absolute inset-y-0 w-px bg-red-400/40 z-10 pointer-events-none"
                        style={{ left: `${todayPct}%` }} />
                    )}
                    {labels.map((_, i) => (
                      <div key={i} className="absolute inset-y-0 border-r border-[#2A2A2A]"
                        style={{ left: `${(i + 1) / COLS * 100}%` }} />
                    ))}
                    {/* Dot per ogni task con due_date nel window */}
                    {tasks.map(t => {
                      const due = new Date(t.due_date! + 'T00:00:00')
                      if (due < windowStart || due > windowEnd) return null
                      const color = TASK_STATUS_COLOR[t.status] ?? '#555'
                      return (
                        <div key={t.id}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-[#1A1A1A] z-10"
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
                    <div key={t.id} className="flex items-center hover:bg-white/[0.03] transition-colors">
                      <div className="w-44 shrink-0 px-4 py-1.5 border-r border-[#2A2A2A]">
                        <div className="flex items-center gap-1.5 pl-4">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-px" style={{ background: color }} />
                          <span className="text-white/45 text-[10px] truncate">{t.title}</span>
                        </div>
                      </div>
                      <div className="flex-1 relative h-6">
                        {showToday && (
                          <div className="absolute inset-y-0 w-px bg-red-400/20 z-10 pointer-events-none"
                            style={{ left: `${todayPct}%` }} />
                        )}
                        {labels.map((_, i) => (
                          <div key={i} className="absolute inset-y-0 border-r border-[#1E1E1E]"
                            style={{ left: `${(i + 1) / COLS * 100}%` }} />
                        ))}
                        {inWindow && (
                          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                            style={{ left: `${pct(due)}%` }}>
                            <div className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-black whitespace-nowrap"
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
