'use client'

import Link from 'next/link'
import { FolderKanban, CheckCircle2, AlertCircle, Clock, ArrowRight } from 'lucide-react'

export interface ProjectSummary {
  id: string
  name: string
  project_type: string
  project_kind: string | null
  client_name: string
  tasks_total: number
  tasks_done: number
  tasks_overdue: number
  open_tickets: number
  last_activity: string | null
}

const TYPE_ICON: Record<string, string> = {
  ecommerce: '🛒',
  lead_gen:  '🎯',
  sito_web:  '🌐',
  app_ai:    '🤖',
  campagna:  '📣',
  custom:    '📁',
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'mai'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 3600)  return `${Math.floor(s / 60)}m fa`
  if (s < 86400) return `${Math.floor(s / 3600)}h fa`
  if (s < 604800) return `${Math.floor(s / 86400)}g fa`
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

export function ProgettiWidget({ projects }: { projects: ProjectSummary[] }) {
  if (projects.length === 0) return null

  return (
    <div className="h-full overflow-auto p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-gold-text" />
          <h2 className="text-sm font-bold text-text-primary">Progetti Attivi</h2>
          <span className="text-2xs text-text-secondary bg-surface border border-border px-1.5 py-0.5 rounded-full">{projects.length}</span>
        </div>
        <Link href="/progetti" className="text-2xs text-gold-text hover:underline flex items-center gap-1">
          Tutti <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {projects.slice(0, 6).map(p => {
          const pct = p.tasks_total > 0 ? Math.round((p.tasks_done / p.tasks_total) * 100) : 0
          const hasIssues = p.tasks_overdue > 0 || p.open_tickets > 0

          return (
            <Link key={p.id} href={`/progetti`}
              className="bg-surface border border-border rounded-xl p-4 hover:border-gold/30 transition-all group block">

              {/* Header */}
              <div className="flex items-start gap-2.5 mb-3">
                <span className="text-xl leading-none mt-0.5 shrink-0">{TYPE_ICON[p.project_type] ?? '📁'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-text-primary truncate group-hover:text-gold-text transition-colors">{p.name}</p>
                    {p.project_kind === 'growth' && (
                      <span className="shrink-0 text-2xs font-black px-1.5 py-0.5 rounded border bg-gold/10 text-gold-text border-gold/25">G</span>
                    )}
                    {p.project_kind === 'digital' && (
                      <span className="shrink-0 text-2xs font-black px-1.5 py-0.5 rounded border bg-info/10 text-info border-info/25">D</span>
                    )}
                  </div>
                  <p className="text-2xs text-text-secondary truncate mt-0.5">{p.client_name}</p>
                </div>
                {hasIssues && (
                  <div className="w-2 h-2 rounded-full bg-error shrink-0 mt-1.5" title="Richiede attenzione" />
                )}
              </div>

              {/* Progress */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-2xs mb-1">
                  <span className="text-text-secondary">{p.tasks_done}/{p.tasks_total} task</span>
                  <span className={`font-bold ${pct === 100 ? 'text-success' : pct >= 50 ? 'text-gold-text' : 'text-text-primary'}`}>{pct}%</span>
                </div>
                <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-success' : pct >= 50 ? 'bg-gold' : 'bg-warning'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* Footer badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {p.tasks_overdue > 0 && (
                  <span className="flex items-center gap-1 text-2xs text-error bg-error/10 px-1.5 py-0.5 rounded-full">
                    <AlertCircle className="w-2.5 h-2.5" />{p.tasks_overdue} scadute
                  </span>
                )}
                {p.open_tickets > 0 && (
                  <span className="flex items-center gap-1 text-2xs text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">
                    🎫 {p.open_tickets} ticket
                  </span>
                )}
                {!hasIssues && pct === 100 && (
                  <span className="flex items-center gap-1 text-2xs text-success bg-success/10 px-1.5 py-0.5 rounded-full">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Completato
                  </span>
                )}
                <span className="flex items-center gap-1 text-2xs text-text-tertiary ml-auto">
                  <Clock className="w-2.5 h-2.5" />
                  <span suppressHydrationWarning>{timeAgo(p.last_activity)}</span>
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
