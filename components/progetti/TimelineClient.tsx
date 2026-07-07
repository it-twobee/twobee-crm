'use client'

import { useState, useMemo } from 'react'
import { Flag, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Profile } from '@/lib/types/database'

interface TimelineTask {
  id: string; title: string; due_date: string | null; status: string; priority: string
  is_milestone: boolean; project_id: string | null
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  project: { id: string; name: string; client_id: string; status: string; clients: { company_name: string } | null } | null
}

interface TimelineProject {
  id: string; name: string; status: string; start_date: string | null; end_date: string | null
  client_id: string; clients: { company_name: string } | null
}

type FilterStatus = 'all' | 'attivo' | 'pianificato'

export function TimelineClient({ tasks, projects }: {
  tasks: TimelineTask[]; projects: TimelineProject[]
}) {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [monthOffset, setMonthOffset] = useState(0)

  const now = new Date()
  const viewStart = new Date(now.getFullYear(), now.getMonth() + monthOffset - 1, 1)
  const viewEnd = new Date(now.getFullYear(), now.getMonth() + monthOffset + 3, 0)
  const rangeMs = viewEnd.getTime() - viewStart.getTime()

  const months = useMemo(() => {
    const m: { label: string; left: number; width: number }[] = []
    for (let i = 0; i < 4; i++) {
      const ms = new Date(viewStart.getFullYear(), viewStart.getMonth() + i, 1)
      const me = new Date(viewStart.getFullYear(), viewStart.getMonth() + i + 1, 0)
      const clampStart = Math.max(ms.getTime(), viewStart.getTime())
      const clampEnd = Math.min(me.getTime(), viewEnd.getTime())
      m.push({
        label: ms.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
        left: ((clampStart - viewStart.getTime()) / rangeMs) * 100,
        width: ((clampEnd - clampStart) / rangeMs) * 100,
      })
    }
    return m
  }, [viewStart.getTime(), viewEnd.getTime()])

  const todayPct = ((now.getTime() - viewStart.getTime()) / rangeMs) * 100

  const filteredProjects = useMemo(() => {
    let p = projects
    if (statusFilter !== 'all') p = p.filter(pr => pr.status === statusFilter)
    if (projectFilter) p = p.filter(pr => pr.id === projectFilter)
    return p
  }, [projects, statusFilter, projectFilter])

  const projectIds = new Set(filteredProjects.map(p => p.id))
  const filteredTasks = useMemo(() =>
    tasks.filter(t => t.project_id && projectIds.has(t.project_id) && t.due_date),
    [tasks, projectIds]
  )

  const tasksByProject = useMemo(() => {
    const m: Record<string, TimelineTask[]> = {}
    for (const t of filteredTasks) {
      const pid = t.project_id!
      ;(m[pid] ??= []).push(t)
    }
    return m
  }, [filteredTasks])

  const pctForDate = (d: string) => {
    const ms = new Date(d).getTime()
    return Math.min(100, Math.max(0, ((ms - viewStart.getTime()) / rangeMs) * 100))
  }

  const statusColor = (s: string) => {
    if (s === 'completato') return { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.3)', text: '#22C55E' }
    const d = new Date()
    return { bg: 'rgba(245,200,0,0.1)', border: 'rgba(245,200,0,0.2)', text: '#F5C800' }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A] shrink-0">
        <div>
          <h1 className="text-xl font-black text-white">Timeline Cross-Progetto</h1>
          <p className="text-xs text-text-secondary mt-0.5">{filteredProjects.length} progetti · {filteredTasks.length} task con scadenza</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={() => setMonthOffset(o => o - 1)} className="p-1.5 rounded-lg hover:bg-[#2A2A2A] text-text-secondary hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setMonthOffset(0)} className="px-3 py-1 text-xs bg-[#2A2A2A] rounded-lg text-text-secondary hover:text-white">Oggi</button>
            <button onClick={() => setMonthOffset(o => o + 1)} className="p-1.5 rounded-lg hover:bg-[#2A2A2A] text-text-secondary hover:text-white"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as FilterStatus)}
            className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white">
            <option value="all">Tutti gli stati</option>
            <option value="attivo">Attivi</option>
            <option value="pianificato">Pianificati</option>
          </select>
          <select value={projectFilter ?? ''} onChange={e => setProjectFilter(e.target.value || null)}
            className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white max-w-[200px]">
            <option value="">Tutti i progetti</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.clients?.company_name ?? p.name} — {p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="relative min-w-[900px]">
          {/* Month headers */}
          <div className="flex h-10 mb-2 relative border-b border-[#2A2A2A]">
            {months.map((m, i) => (
              <div key={i} className="absolute text-[11px] font-bold text-[#555] uppercase border-l border-[#2A2A2A] pl-3 flex items-center h-full"
                style={{ left: `${m.left}%`, width: `${m.width}%` }}>{m.label}</div>
            ))}
          </div>

          {/* Today line */}
          {todayPct >= 0 && todayPct <= 100 && (
            <div className="absolute top-10 bottom-0 w-px bg-gold/40 z-10" style={{ left: `${todayPct}%` }}>
              <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-gold" />
            </div>
          )}

          {/* Projects + tasks */}
          <div className="space-y-4 mt-2">
            {filteredProjects.map(proj => {
              const projTasks = tasksByProject[proj.id] ?? []
              const hasRange = proj.start_date && proj.end_date
              return (
                <div key={proj.id} className="space-y-1">
                  {/* Project bar */}
                  <div className="relative h-8 flex items-center">
                    <div className="absolute left-0 text-xs font-bold text-white truncate" style={{ maxWidth: '180px' }}>
                      <span className="text-[#555]">{proj.clients?.company_name ?? ''}</span>{' '}
                      {proj.name}
                    </div>
                    {hasRange && (
                      <div className="absolute h-5 rounded-md bg-gold/10 border border-gold/20"
                        style={{ left: `${pctForDate(proj.start_date!)}%`, width: `${Math.max(1, pctForDate(proj.end_date!) - pctForDate(proj.start_date!))}%` }} />
                    )}
                  </div>
                  {/* Task bars */}
                  {projTasks.map(task => {
                    const pct = pctForDate(task.due_date!)
                    const isOverdue = new Date(task.due_date!) < now && task.status !== 'completato'
                    const isDone = task.status === 'completato'
                    return (
                      <div key={task.id} className="relative h-6 flex items-center" style={{ marginLeft: '190px' }}>
                        <div className="absolute h-5 rounded-md flex items-center px-2 gap-1 text-[10px] font-medium truncate max-w-[220px] border"
                          style={{
                            left: `${Math.max(0, pct - 12)}%`, width: '12%',
                            background: isDone ? 'rgba(34,197,94,0.12)' : isOverdue ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
                            borderColor: isDone ? 'rgba(34,197,94,0.25)' : isOverdue ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.25)',
                            color: isDone ? '#22C55E' : isOverdue ? '#EF4444' : '#60A5FA',
                          }}>
                          {task.is_milestone && <Flag className="w-2.5 h-2.5 shrink-0" />}
                          <span className="truncate">{task.title}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {filteredProjects.length === 0 && (
            <div className="text-center py-16 text-text-secondary text-sm">Nessun progetto da visualizzare.</div>
          )}
        </div>
      </div>
    </div>
  )
}
