'use client'

import Link from 'next/link'
import { Briefcase, AlertTriangle, Flag, UserX } from 'lucide-react'

export type DeliveryStats = {
  liveProjects: number
  lateProjects: number
  milestonesSoon: number
  milestonesLate: number
  tasksOverdue: number
  tasksUnassigned: number
  tasksOpen: number
  tasksDone: number
}

/** Lo stato della consegna in quattro numeri: quello che la dashboard non diceva. */
export function DeliveryRadar({ s }: { s: DeliveryStats }) {
  const total = s.tasksOpen + s.tasksDone
  const progress = total ? Math.round((s.tasksDone / total) * 100) : 0

  const cards = [
    {
      href: '/progetti', icon: <Briefcase className="w-4 h-4" />, label: 'Progetti in corso',
      value: s.liveProjects, sub: s.lateProjects ? `${s.lateProjects} in ritardo` : 'nessuno in ritardo',
      tone: s.lateProjects ? 'warning' : 'neutral',
    },
    {
      href: '/progetti', icon: <Flag className="w-4 h-4" />, label: 'Consegne ≤ 7 giorni',
      value: s.milestonesSoon, sub: s.milestonesLate ? `${s.milestonesLate} già scadute` : 'nessuna scaduta',
      tone: s.milestonesLate ? 'error' : s.milestonesSoon ? 'info' : 'neutral',
    },
    {
      href: '/progetti', icon: <AlertTriangle className="w-4 h-4" />, label: 'Task in ritardo',
      value: s.tasksOverdue, sub: s.tasksOverdue ? 'da recuperare' : 'tutto in linea',
      tone: s.tasksOverdue ? 'error' : 'neutral',
    },
    {
      href: '/ad-hoc', icon: <UserX className="w-4 h-4" />, label: 'Senza assegnatario',
      value: s.tasksUnassigned, sub: s.tasksUnassigned ? 'nessuno le sta portando' : 'tutto assegnato',
      tone: s.tasksUnassigned ? 'warning' : 'neutral',
    },
  ] as const

  const ink = (t: string) =>
    t === 'error' ? 'text-error' : t === 'warning' ? 'text-warning' : t === 'info' ? 'text-info' : 'text-text-primary'

  return (
    <div className="p-3 h-full flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        {cards.map(c => (
          <Link key={c.label} href={c.href}
            className="rounded-xl p-3 bg-surface border border-border hover:bg-surface-hover transition-colors no-tap-highlight">
            <div className="flex items-center justify-between">
              <span className={`text-xl font-black tabular font-heading leading-none ${ink(c.tone)}`}>{c.value}</span>
              <span className={c.tone === 'neutral' ? 'text-text-tertiary' : ink(c.tone)}>{c.icon}</span>
            </div>
            <p className="text-2xs font-semibold uppercase tracking-widest text-text-tertiary mt-2 truncate">{c.label}</p>
            <p className="text-2xs text-text-tertiary mt-0.5 truncate">{c.sub}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-xl p-3 bg-surface border border-border mt-auto">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-2xs font-semibold uppercase tracking-widest text-text-tertiary">Avanzamento portfolio</span>
          <span className="text-sm font-black tabular font-heading text-text-primary">{progress}%</span>
        </div>
        <div className="h-1.5 bg-surface-active rounded-full overflow-hidden">
          <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-2xs text-text-tertiary mt-1.5 tabular">{s.tasksDone} di {total} task chiuse</p>
      </div>
    </div>
  )
}
