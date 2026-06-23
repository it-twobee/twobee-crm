'use client'

import { useMemo } from 'react'
import { Flag } from 'lucide-react'
import type { Task, Profile } from '@/lib/types/database'
import { getInitials } from '@/lib/utils'

interface TaskWithMeta extends Task {
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  project: { id: string; name: string; client_id: string; clients: { company_name: string } | null } | null
}

const STATUS_COLOR: Record<string, string> = {
  da_fare: 'bg-[#3A3A3A]',
  in_corso: 'bg-warning',
  in_revisione: 'bg-gold',
  completato: 'bg-success',
}

const PRIORITY_COLOR: Record<string, string> = {
  alta: 'border-l-error',
  media: 'border-l-warning',
  bassa: 'border-l-success',
}

export function GanttView({ tasks }: { tasks: TaskWithMeta[] }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Calcola range date visibile (3 mesi: mese precedente + 2 mesi avanti)
  const rangeStart = useMemo(() => {
    const d = new Date(today)
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return d
  }, [])

  const rangeEnd = useMemo(() => {
    const d = new Date(today)
    d.setDate(1)
    d.setMonth(d.getMonth() + 3)
    d.setDate(0)
    return d
  }, [])

  const totalDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1
  const DAY_WIDTH = 28 // px per giorno

  // Genera colonne mesi
  const months = useMemo(() => {
    const result: { label: string; startDay: number; days: number }[] = []
    const cursor = new Date(rangeStart)
    while (cursor <= rangeEnd) {
      const monthStart = new Date(cursor)
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      const clampedEnd = monthEnd < rangeEnd ? monthEnd : rangeEnd
      const startDay = Math.floor((monthStart.getTime() - rangeStart.getTime()) / 86400000)
      const days = Math.floor((clampedEnd.getTime() - monthStart.getTime()) / 86400000) + 1
      result.push({
        label: cursor.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }),
        startDay,
        days,
      })
      cursor.setMonth(cursor.getMonth() + 1)
      cursor.setDate(1)
    }
    return result
  }, [rangeStart, rangeEnd])

  // Filtra task con almeno una data
  const ganttTasks = useMemo(() =>
    tasks
      .filter((t) => t.due_date)
      .sort((a, b) => (a.due_date! > b.due_date! ? 1 : -1)),
    [tasks]
  )

  const dayOffset = (dateStr: string) =>
    Math.floor((new Date(dateStr).getTime() - rangeStart.getTime()) / 86400000)

  const todayOffset = Math.floor((today.getTime() - rangeStart.getTime()) / 86400000)

  if (ganttTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-secondary">
        <p className="text-sm">Nessun task con data di scadenza impostata.</p>
        <p className="text-xs mt-1">Imposta una deadline sui task per visualizzarli nella timeline.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-card border border-[#2A2A2A]">
      <div style={{ minWidth: totalDays * DAY_WIDTH + 220 }}>
        {/* Header mesi */}
        <div className="flex border-b border-[#2A2A2A] bg-surface sticky top-0 z-10">
          <div className="w-[220px] shrink-0 px-4 py-2.5 border-r border-[#2A2A2A]">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Task</span>
          </div>
          <div className="relative flex" style={{ width: totalDays * DAY_WIDTH }}>
            {months.map((m) => (
              <div
                key={m.label}
                className="border-r border-[#2A2A2A] py-2.5 px-2 text-xs font-semibold text-text-secondary shrink-0"
                style={{ width: m.days * DAY_WIDTH }}
              >
                {m.label.toUpperCase()}
              </div>
            ))}
            {/* Linea oggi */}
            {todayOffset >= 0 && todayOffset < totalDays && (
              <div
                className="absolute top-0 bottom-0 w-px bg-gold/60 z-10"
                style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
              />
            )}
          </div>
        </div>

        {/* Righe task */}
        {ganttTasks.map((task) => {
          const endOffset = dayOffset(task.due_date!)
          // Se c'è una data start dalla sprint, usala; altrimenti 1 giorno prima
          const startOffset = Math.max(0, endOffset - Math.max(1, Math.round((task.estimated_hours ?? 8) / 8)))
          const barStart = Math.max(0, startOffset)
          const barEnd = Math.min(totalDays - 1, endOffset)
          const barWidth = Math.max(1, barEnd - barStart + 1) * DAY_WIDTH
          const barLeft = barStart * DAY_WIDTH

          const isOverdue = !task.status.includes('completato') && new Date(task.due_date!) < today
          const isMilestone = task.is_milestone

          return (
            <div key={task.id} className="flex border-b border-[#2A2A2A] hover:bg-white/[0.02] group">
              {/* Task info */}
              <div className={`w-[220px] shrink-0 flex items-center gap-2 px-3 py-2 border-r border-[#2A2A2A] border-l-2 ${PRIORITY_COLOR[task.priority]}`}>
                {isMilestone && <Flag className="w-3 h-3 text-gold shrink-0" />}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{task.title}</p>
                  <p className="text-xs text-text-secondary truncate">{task.project?.clients?.company_name ?? task.project?.name ?? ''}</p>
                </div>
                {task.assignee && (
                  <div className="w-5 h-5 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold text-[9px] font-bold shrink-0 ml-auto">
                    {getInitials(task.assignee.full_name)}
                  </div>
                )}
              </div>

              {/* Barra gantt */}
              <div className="relative flex-1" style={{ height: 40 }}>
                {/* Sfondo griglia giorni */}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div
                    className="absolute inset-y-0 w-px bg-gold/20 z-0"
                    style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                  />
                )}

                {isMilestone ? (
                  /* Diamond milestone */
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-gold rotate-45 z-10"
                    style={{ left: barLeft + (endOffset - barStart) * DAY_WIDTH + DAY_WIDTH / 2 }}
                    title={task.title}
                  />
                ) : (
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-full z-10 flex items-center px-2 transition-all
                      ${isOverdue ? 'bg-error/80' : STATUS_COLOR[task.status]}`}
                    style={{ left: barLeft, width: barWidth }}
                    title={`${task.title} — scadenza: ${new Date(task.due_date!).toLocaleDateString('it-IT')}`}
                  >
                    {barWidth > 60 && (
                      <span className="text-[10px] font-semibold text-white truncate">{task.title}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
