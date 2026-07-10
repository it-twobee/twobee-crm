'use client'

import Link from 'next/link'
import type { Profile, TaskWithAssignee } from '@/lib/types/database'

interface Props {
  profiles: Profile[]
  tasks: TaskWithAssignee[]
}

function WorkloadBar({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? Math.min((count / max) * 100, 100) : 0
  const color = count === 0 ? 'bg-surface-active' : count <= 3 ? 'bg-success' : count <= 6 ? 'bg-warning' : 'bg-error'
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 bg-surface-active rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold w-4 text-right ${count === 0 ? 'text-text-tertiary' : count <= 3 ? 'text-success' : count <= 6 ? 'text-warning' : 'text-error'}`}>{count}</span>
    </div>
  )
}

export function WorkloadPanel({ profiles, tasks }: Props) {
  // Conta task per utente
  const taskCount: Record<string, number> = {}
  for (const t of tasks) {
    const uid = (t as unknown as { assigned_to?: string }).assigned_to ?? t.assignee_id
    if (uid) taskCount[uid] = (taskCount[uid] ?? 0) + 1
  }

  const maxCount = Math.max(...Object.values(taskCount), 1)

  // Escludi client role
  const teamProfiles = profiles.filter((p) => !['client', 'viewer'].includes(p.app_role ?? ''))

  return (
    <div className="bg-surface border border-border rounded-xl p-5 h-full overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-text-primary">Carico team</p>
        <div className="flex items-center gap-3 text-2xs text-text-secondary">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success inline-block"/>1-3</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning inline-block"/>4-6</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-error inline-block"/>7+</span>
        </div>
      </div>
      <div className="space-y-3">
        {teamProfiles.length === 0 && (
          <p className="text-sm text-text-secondary text-center py-4">Nessun membro team</p>
        )}
        {teamProfiles.map((p) => {
          const count = taskCount[p.id] ?? 0
          return (
            <div key={p.id} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-2xs font-bold text-gold-text shrink-0">
                {p.avatar_url
                  ? <img src={p.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                  : (p.full_name || p.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-primary truncate">{p.full_name.split(' ')[0]}</p>
              </div>
              <WorkloadBar count={count} max={maxCount} />
            </div>
          )
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-border">
        <p className="text-2xs text-text-secondary">{tasks.length} task attive totali · {teamProfiles.length} membri</p>
      </div>
    </div>
  )
}
