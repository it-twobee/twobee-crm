'use client'

import { useMemo } from 'react'
import { getInitials } from '@/lib/utils'
import type { Task, Profile } from '@/lib/types/database'

interface TaskWithMeta extends Task {
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  project: { id: string; name: string; client_id: string; clients: { company_name: string } | null } | null
}

const STATUS_COLOR: Record<string, string> = {
  da_fare: 'bg-surface-active',
  in_corso: 'bg-warning/70',
  in_revisione: 'bg-gold/70',
  completato: 'bg-success/70',
}
const STATUS_LABEL: Record<string, string> = {
  da_fare: 'Da fare', in_corso: 'In corso', in_revisione: 'In revisione', completato: 'Completato',
}

export function WorkloadView({ tasks, profiles }: { tasks: TaskWithMeta[]; profiles: Profile[] }) {
  const today = new Date()

  // Genera 4 settimane
  const weeks = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const start = new Date(today)
      start.setDate(start.getDate() - start.getDay() + 1 + i * 7) // Lunedì
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return { start, end, label: `${start.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}` }
    })
  }, [])

  // Per ogni profilo, calcola task per settimana
  const activeTasks = tasks.filter((t) => t.status !== 'completato')

  const getTasksForWeek = (profileId: string, weekStart: Date, weekEnd: Date) =>
    activeTasks.filter((t) => {
      if (t.assignee_id !== profileId) return false
      if (!t.due_date) return false
      const due = new Date(t.due_date)
      return due >= weekStart && due <= weekEnd
    })

  const assignedProfiles = profiles.filter((p) =>
    activeTasks.some((t) => t.assignee_id === p.id)
  )

  const unassigned = activeTasks.filter((t) => !t.assignee_id)

  return (
    <div className="space-y-4 overflow-x-auto">
      <div style={{ minWidth: 700 }}>
        {/* Header settimane */}
        <div className="grid border-b border-border pb-2 mb-2" style={{ gridTemplateColumns: '180px repeat(4, 1fr)' }}>
          <div />
          {weeks.map((w) => (
            <div key={w.label} className="text-xs font-semibold text-text-secondary text-center px-2">{w.label}</div>
          ))}
        </div>

        {/* Righe team */}
        {assignedProfiles.map((profile) => (
          <div key={profile.id} className="grid border-b border-border py-2" style={{ gridTemplateColumns: '180px repeat(4, 1fr)' }}>
            {/* Profilo */}
            <div className="flex items-center gap-2 px-2">
              <div className="w-8 h-8 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold-text text-xs font-bold shrink-0">
                {getInitials(profile.full_name)}
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{profile.full_name}</p>
                <p className="text-xs text-text-secondary capitalize">{profile.role}</p>
              </div>
            </div>

            {/* Celle settimana */}
            {weeks.map((w) => {
              const weekTasks = getTasksForWeek(profile.id, w.start, w.end)
              const totalHours = weekTasks.reduce((sum, t) => sum + (t.estimated_hours ?? 8), 0)
              const overloaded = totalHours > 40
              return (
                <div key={w.label} className={`px-2 py-1 rounded-lg mx-1 ${overloaded ? 'bg-error/10 border border-error/30' : weekTasks.length > 0 ? 'bg-surface' : ''}`}>
                  {weekTasks.length > 0 ? (
                    <div className="space-y-1">
                      {weekTasks.slice(0, 3).map((t) => (
                        <div key={t.id} className={`text-2xs px-1.5 py-0.5 rounded truncate font-medium ${STATUS_COLOR[t.status]} text-text-primary`} title={t.title}>
                          {t.title}
                        </div>
                      ))}
                      {weekTasks.length > 3 && (
                        <div className="text-2xs text-text-secondary pl-1">+{weekTasks.length - 3} altri</div>
                      )}
                      <div className={`text-2xs font-semibold mt-0.5 ${overloaded ? 'text-error' : 'text-text-secondary'}`}>
                        ~{totalHours}h {overloaded && '⚠ overload'}
                      </div>
                    </div>
                  ) : (
                    <div className="text-2xs text-text-secondary/40 text-center py-1">–</div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {/* Non assegnati */}
        {unassigned.length > 0 && (
          <div className="grid border-b border-border py-2" style={{ gridTemplateColumns: '180px repeat(4, 1fr)' }}>
            <div className="flex items-center gap-2 px-2">
              <div className="w-8 h-8 rounded-full bg-surface-active flex items-center justify-center text-text-secondary text-xs font-bold shrink-0">?</div>
              <p className="text-sm text-text-secondary">Non assegnati</p>
            </div>
            <div className="col-span-4 flex flex-wrap gap-1 items-center px-2">
              {unassigned.slice(0, 6).map((t) => (
                <span key={t.id} className={`text-2xs px-1.5 py-0.5 rounded ${STATUS_COLOR[t.status]} text-text-primary`}>{t.title}</span>
              ))}
              {unassigned.length > 6 && <span className="text-xs text-text-secondary">+{unassigned.length - 6}</span>}
            </div>
          </div>
        )}

        {/* Legenda */}
        <div className="flex items-center gap-4 pt-3 flex-wrap">
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <div className={`w-3 h-3 rounded-sm ${STATUS_COLOR[k]}`} />
              {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
