'use client'

import { useState, useMemo, useRef } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Filter } from 'lucide-react'
import type { DeptProject } from '@/app/(dashboard)/reparti/[dept]/page'
import type { Profile } from '@/lib/types/database'
import { getTagColor } from '@/lib/reparti-constants'

type Period = 'week' | 'month' | 'quarter'

const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, quarter: 90 }

function addDays(date: Date, n: number) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}
function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}
function fmtShort(d: Date) {
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}
function fmtDay(d: Date) {
  return d.toLocaleDateString('it-IT', { day: '2-digit' })
}
function fmtMonth(d: Date) {
  return d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })
}

const SPRINT_COLORS = ['var(--color-gold-text)', 'var(--color-success)', 'var(--color-info)', 'var(--color-accent)', 'var(--color-info)', 'var(--color-warning)']

export function RepartiTimeline({ projects, profiles }: {
  projects: DeptProject[]
  profiles: Profile[]
}) {
  const [period, setPeriod]               = useState<Period>('month')
  const [startOffset, setStartOffset]     = useState(-7)
  const [filterProject, setFilterProject] = useState<string>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const [filterTag, setFilterTag]         = useState<string>('all')
  const [hovered, setHovered]             = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const totalDays  = PERIOD_DAYS[period]
  const today      = new Date(); today.setHours(0, 0, 0, 0)
  const viewStart  = addDays(today, startOffset)
  const viewEnd    = addDays(viewStart, totalDays)

  const filteredProjects = useMemo(() =>
    projects.filter(p => filterProject === 'all' || p.id === filterProject),
  [projects, filterProject])

  const allUsedTags = useMemo(() => {
    const tags = new Set<string>()
    projects.forEach(p => p.tasks.forEach(t => (t.tags ?? []).forEach(tag => tags.add(tag))))
    return Array.from(tags)
  }, [projects])

  // Header: day ticks
  const ticks = useMemo(() => {
    const out: { date: Date; label: string; isToday: boolean; isMajor: boolean }[] = []
    for (let i = 0; i <= totalDays; i++) {
      const d = addDays(viewStart, i)
      const isToday = diffDays(today, d) === 0
      const isMajor = period === 'week' ? true : period === 'month' ? d.getDay() === 1 : d.getDate() === 1
      if (isMajor || isToday) out.push({ date: d, label: period === 'quarter' ? fmtMonth(d) : fmtDay(d), isToday, isMajor })
    }
    return out
  }, [viewStart, totalDays, period])

  const pct = (d: Date) => Math.max(0, Math.min(100, (diffDays(viewStart, d) / totalDays) * 100))

  const pan = (dir: 1 | -1) => setStartOffset(o => o + dir * Math.round(totalDays * 0.5))

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center border border-border rounded-xl overflow-hidden">
          {(['week', 'month', 'quarter'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-bold transition-all ${period === p ? 'bg-gold text-on-gold' : 'text-text-tertiary hover:text-text-primary'}`}>
              {p === 'week' ? 'Settimana' : p === 'month' ? 'Mese' : 'Trimestre'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => pan(-1)} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-text-tertiary hover:text-text-primary hover:border-border transition-all">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setStartOffset(-7)} className="px-2 py-1 text-2xs font-bold text-text-tertiary hover:text-text-primary border border-border rounded-lg transition-all">Oggi</button>
          <button onClick={() => pan(1)} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-text-tertiary hover:text-text-primary hover:border-border transition-all">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1 text-2xs text-text-tertiary font-semibold">
          <span>{fmtShort(viewStart)}</span>
          <span>→</span>
          <span>{fmtShort(viewEnd)}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
            className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text-secondary focus:outline-none">
            <option value="all">Tutti i progetti</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text-secondary focus:outline-none">
            <option value="all">Tutti i membri</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)}
            className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text-secondary focus:outline-none">
            <option value="all">Tutti i tag</option>
            {allUsedTags.map(t => <option key={t} value={t}>#{t}</option>)}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-2xs text-text-tertiary">
        <span className="flex items-center gap-1.5"><span className="w-4 h-2.5 rounded-sm bg-gold/40 border border-gold/60" />Sprint</span>
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,0 10,5 5,10 0,5" fill="#A855F7" /></svg>
          Milestone
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,0 10,3.5 8,10 2,10 0,3.5" fill="#22C55E" /></svg>
          Task cliente
        </span>
        <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-error" />Oggi</span>
      </div>

      {/* Grid */}
      <div className="bg-background border border-border rounded-2xl overflow-x-auto">
        <div style={{ minWidth: 700 }}>
          {/* Timeline header */}
          <div className="relative h-8 border-b border-border">
            {ticks.map((t, i) => (
              <div key={i} className="absolute flex flex-col items-center" style={{ left: `calc(${pct(t.date)}% + 120px)`, transform: 'translateX(-50%)' }}>
                <span className={`text-2xs font-bold ${t.isToday ? 'text-gold-text' : 'text-text-tertiary'}`}>{t.label}</span>
              </div>
            ))}
            {/* Today line header dot */}
            <div className="absolute top-0 bottom-0 w-px bg-error/60" style={{ left: `calc(${pct(today)}% + 120px)` }} />
          </div>

          {/* Rows */}
          {filteredProjects.map((project, pIdx) => {
            const projectColor = SPRINT_COLORS[pIdx % SPRINT_COLORS.length]

            const sprints = project.sprints.filter(s => {
              const start = parseDate(s.start_date)
              const end   = parseDate(s.end_date)
              return start && end && end >= viewStart && start <= viewEnd
            })

            const milestones = project.tasks.filter(t =>
              t.is_milestone && !t.is_client_task && t.due_date &&
              parseDate(t.due_date)! >= viewStart && parseDate(t.due_date)! <= viewEnd &&
              (filterAssignee === 'all' || t.assignee_id === filterAssignee) &&
              (filterTag === 'all' || (t.tags ?? []).includes(filterTag))
            )

            const clientTasks = project.tasks.filter(t =>
              t.is_client_task && t.due_date && t.status !== 'completato' &&
              parseDate(t.due_date)! >= viewStart && parseDate(t.due_date)! <= viewEnd
            )

            if (sprints.length === 0 && milestones.length === 0 && clientTasks.length === 0) return null

            return (
              <div key={project.id} className="relative border-b border-border hover:bg-background transition-colors group" style={{ height: 44 }}>
                {/* Label */}
                <div className="absolute left-0 top-0 bottom-0 flex items-center px-3" style={{ width: 120 }}>
                  <div className="min-w-0">
                    <p className="text-2xs font-bold text-text-primary truncate">{project.name}</p>
                    <p className="text-[8px] text-text-tertiary truncate">{project.client_name ?? ''}</p>
                  </div>
                </div>

                {/* Chart area */}
                <div className="absolute top-0 bottom-0" style={{ left: 120, right: 0 }}>
                  {/* Today vertical line */}
                  <div className="absolute top-0 bottom-0 w-px bg-error/30" style={{ left: `${pct(today)}%` }} />

                  {/* Sprint bars */}
                  {sprints.map((sprint, si) => {
                    const start = parseDate(sprint.start_date)!
                    const end   = parseDate(sprint.end_date)!
                    const left  = pct(start < viewStart ? viewStart : start)
                    const right = 100 - pct(end > viewEnd ? viewEnd : end)
                    const isDone = sprint.status === 'completato'
                    const isAct  = sprint.status === 'in_corso'
                    const sColor = isDone ? 'var(--color-success)' : isAct ? projectColor : 'var(--color-border)'
                    const key    = `${project.id}-${sprint.id}`
                    return (
                      <div key={sprint.id}
                        className="absolute flex items-center"
                        style={{ left: `${left}%`, right: `${right}%`, top: 10, height: 24 }}
                        onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(null)}>
                        <div className="w-full h-full rounded-md flex items-center px-2 relative overflow-visible"
                          style={{ background: `color-mix(in srgb, ${sColor} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${sColor} 25%, transparent)` }}>
                          <span className="text-[8px] font-bold truncate" style={{ color: sColor }}>{sprint.name}</span>

                          {/* Tooltip */}
                          {hovered === key && (
                            <div className="absolute bottom-full left-0 mb-2 bg-background border border-border rounded-xl px-3 py-2 text-2xs text-text-secondary whitespace-nowrap z-30 shadow-xl">
                              <strong className="text-text-primary block mb-0.5">{sprint.name}</strong>
                              {fmtShort(start)} → {fmtShort(end)}
                              <span className="ml-2 px-1 rounded" style={{ background: `color-mix(in srgb, ${sColor} 13%, transparent)`, color: sColor }}>
                                {sprint.status}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Milestone diamonds */}
                  {milestones.map(m => {
                    const d     = parseDate(m.due_date)!
                    const left  = pct(d)
                    const isDone = m.status === 'completato'
                    const key   = `m-${m.id}`
                    return (
                      <div key={m.id} className="absolute flex items-center justify-center"
                        style={{ left: `${left}%`, top: 0, bottom: 0, transform: 'translateX(-50%)', zIndex: 10 }}
                        onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(null)}>
                        <svg width="14" height="14" viewBox="0 0 14 14" className="cursor-pointer">
                          <polygon points="7,0 14,7 7,14 0,7" fill={isDone ? 'var(--color-success)' : 'var(--color-accent)'} fillOpacity={0.9} />
                        </svg>
                        {hovered === key && (
                          <div className="absolute bottom-full mb-2 bg-background border border-border rounded-xl px-3 py-2 text-2xs text-text-secondary whitespace-nowrap z-30 shadow-xl">
                            <strong className="text-text-primary block">{m.title}</strong>
                            {fmtShort(d)} · {isDone ? 'completata' : 'in attesa'}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Client task stars */}
                  {clientTasks.map(t => {
                    const d    = parseDate(t.due_date)!
                    const left = pct(d)
                    const key  = `ct-${t.id}`
                    const isOver = d < today
                    return (
                      <div key={t.id} className="absolute flex items-center justify-center"
                        style={{ left: `${left}%`, top: 0, bottom: 0, transform: 'translateX(-50%)', zIndex: 10 }}
                        onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(null)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" className="cursor-pointer">
                          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                            fill={isOver ? 'var(--color-error)' : 'var(--color-success)'} fillOpacity={0.9} />
                        </svg>
                        {hovered === key && (
                          <div className="absolute bottom-full mb-2 bg-background border border-border rounded-xl px-3 py-2 text-2xs text-text-secondary whitespace-nowrap z-30 shadow-xl">
                            <strong className="text-text-primary block">{t.title}</strong>
                            Scadenza cliente: {fmtShort(d)}
                            {isOver && <span className="text-error ml-1">scaduta</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {filteredProjects.every(p => {
            const hasSprints = p.sprints.some(s => {
              const start = parseDate(s.start_date)
              const end   = parseDate(s.end_date)
              return start && end && end >= viewStart && start <= viewEnd
            })
            const hasMilestones = p.tasks.some(t => t.is_milestone && t.due_date && parseDate(t.due_date)! >= viewStart && parseDate(t.due_date)! <= viewEnd)
            return !hasSprints && !hasMilestones
          }) && (
            <div className="flex flex-col items-center py-16 gap-3 text-center">
              <p className="text-text-tertiary text-sm">Nessuna attività nel periodo selezionato</p>
              <p className="text-2xs text-text-tertiary">Prova a navigare avanti o cambiare il periodo</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
