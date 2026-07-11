'use client'

import Link from 'next/link'
import { ShieldCheck, AlertTriangle, ChevronRight } from 'lucide-react'

export interface DataQualityReport {
  projects_no_pm: number
  projects_active: number
  tasks_no_estimate: number
  tasks_no_due: number
  tasks_no_owner: number
  tasks_active: number
  clients_no_assignment: number
  clients_not_internal: number
  clients_no_projects: number
  clients_total: number
  tasks_no_sprint: number
}

type Sev = 'error' | 'warning' | 'info'

const SEV_DOT: Record<Sev, string> = {
  error: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-info',
}

const n = (v: number | string | null | undefined) => Number(v ?? 0)

export function DataQualityWidget({ report }: { report: DataQualityReport | null }) {
  if (!report) {
    return (
      <div className="p-5 h-full flex items-center justify-center text-center">
        <p className="text-xs text-text-tertiary">Esegui la migration 097 per abilitare la salute dati.</p>
      </div>
    )
  }

  const rows: { label: string; count: number; total?: number; sev: Sev; href: string }[] = [
    { label: 'Progetti senza PM',        count: n(report.projects_no_pm),      total: n(report.projects_active), sev: 'error',   href: '/workload' },
    { label: 'Clienti senza accesso portale', count: n(report.clients_no_assignment), total: n(report.clients_total), sev: 'error', href: '/clienti' },
    { label: 'Task senza stima ore',     count: n(report.tasks_no_estimate),   total: n(report.tasks_active),    sev: 'warning', href: '/workload' },
    { label: 'Task senza scadenza',      count: n(report.tasks_no_due),        total: n(report.tasks_active),    sev: 'warning', href: '/workload' },
    { label: 'Task senza owner',         count: n(report.tasks_no_owner),      total: n(report.tasks_active),    sev: 'warning', href: '/workload' },
    { label: 'Task fuori da uno sprint', count: n(report.tasks_no_sprint),     total: n(report.tasks_active),    sev: 'info',    href: '/progetti' },
    { label: 'Clienti senza progetti',   count: n(report.clients_no_projects), total: n(report.clients_total),   sev: 'info',    href: '/clienti' },
  ]

  const issues = rows.filter(r => r.count > 0).sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 }
    return order[a.sev] - order[b.sev]
  })

  if (issues.length === 0) {
    return (
      <div className="p-5 h-full flex flex-col items-center justify-center text-center gap-2">
        <div className="w-12 h-12 rounded-2xl bg-success-dim flex items-center justify-center text-success">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-text-primary">Dati in salute</p>
        <p className="text-xs text-text-secondary">Nessun problema di qualità rilevato.</p>
      </div>
    )
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-warning" />
        <span className="text-xs text-text-secondary">{issues.length} aree da sistemare</span>
      </div>
      <div className="flex-1 overflow-y-auto -mx-1">
        <ul className="space-y-0.5">
          {issues.map(r => (
            <li key={r.label}>
              <Link href={r.href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors group">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEV_DOT[r.sev]}`} aria-hidden="true" />
                <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{r.label}</span>
                <span className="text-sm font-bold text-text-primary tabular shrink-0">
                  {r.count}{r.total != null && <span className="text-2xs font-normal text-text-tertiary">/{r.total}</span>}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-text-tertiary group-hover:text-text-secondary shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
