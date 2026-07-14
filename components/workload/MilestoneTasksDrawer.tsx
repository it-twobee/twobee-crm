'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { X, Flag, ExternalLink, CheckCircle2, Circle, Clock, User } from 'lucide-react'
import { isoLocal, type WLTask, type WLProject, type WLResource } from '@/lib/workload'
import { usePortalRoutes } from '@/lib/portal-routes'
import { getInitials } from '@/lib/utils'

const STATUS_LABEL: Record<string, string> = {
  da_fare: 'Da fare', in_corso: 'In corso', in_revisione: 'In revisione',
  completato: 'Completato', pianificato: 'Pianificato', richiesta_supporto: 'Richiesta supporto',
}
const STATUS_STYLE: Record<string, string> = {
  da_fare: 'bg-surface-active text-text-secondary',
  in_corso: 'bg-gold-dim text-gold-text',
  in_revisione: 'bg-warning-dim text-warning',
  completato: 'bg-success-dim text-success',
  pianificato: 'bg-info-dim text-info',
  richiesta_supporto: 'bg-error-dim text-error',
}

/**
 * Pannello laterale ("smezzaschermo") aperto dal Workload quando si seleziona una
 * milestone: elenca i suoi sottotask SENZA cambiare pagina — così restando su
 * /workload il tasto "indietro" non riporta più sulla scheda cliente.
 */
export function MilestoneTasksDrawer({ milestone, subtasks, project, resourceById, onClose }: {
  milestone: WLTask
  subtasks: WLTask[]
  project: WLProject
  resourceById: Map<string, WLResource>
  onClose: () => void
}) {
  const { projectHref } = usePortalRoutes()
  const todayStr = isoLocal(new Date())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const done = subtasks.filter(t => t.status === 'completato').length
  const items = [...subtasks].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const msDone = milestone.status === 'completato'
  const msLate = !msDone && milestone.due_date != null && milestone.due_date < todayStr

  const fmt = (iso: string | null) => iso
    ? new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
    : '—'

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Sottotask di ${milestone.title}`}>
      <div className="absolute inset-0 bg-scrim/70 backdrop-blur-sm" onClick={onClose} />

      <aside className="relative w-full max-w-md h-full bg-surface border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-border">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-2xs uppercase tracking-wider text-text-tertiary flex items-center gap-1.5">
                <Flag className="w-3 h-3" aria-hidden="true" /> Milestone · <span className="truncate">{project.name}</span>
              </p>
              <h2 className="text-lg font-bold text-text-primary mt-1 leading-tight">{milestone.title}</h2>
            </div>
            <button onClick={onClose} aria-label="Chiudi" className="p-1 text-text-tertiary hover:text-text-primary shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${msDone ? 'bg-success-dim text-success' : msLate ? 'bg-error-dim text-error' : 'bg-gold-dim text-gold-text'}`}>
              {msDone ? 'Completata' : msLate ? 'In ritardo' : 'Da fare'}
            </span>
            <span className="text-2xs text-text-tertiary flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden="true" /> {fmt(milestone.due_date)}
            </span>
            {subtasks.length > 0 && (
              <span className="text-2xs text-text-tertiary tabular">· {done}/{subtasks.length} completati</span>
            )}
          </div>
        </div>

        {/* Lista sottotask */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {items.length === 0 && (
            <div className="text-center py-12">
              <Circle className="w-6 h-6 text-text-tertiary mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-text-tertiary">Nessun task collegato a questa milestone.</p>
            </div>
          )}
          {items.map(t => {
            const isDone = t.status === 'completato'
            const late = !isDone && t.due_date != null && t.due_date < todayStr
            const assignee = t.assignee_id ? resourceById.get(t.assignee_id) : null
            return (
              <div key={t.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-background">
                {isDone
                  ? <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
                  : <Circle className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${isDone ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>{t.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[t.status] ?? 'bg-surface-active text-text-secondary'}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    <span className={`text-2xs flex items-center gap-1 ${late ? 'text-error font-semibold' : 'text-text-tertiary'}`}>
                      <Clock className="w-3 h-3" aria-hidden="true" /> {fmt(t.due_date)}
                    </span>
                    <span className="text-2xs text-text-tertiary flex items-center gap-1 ml-auto">
                      {assignee
                        ? <><span className="w-4 h-4 rounded-full bg-surface-active text-[8px] font-bold flex items-center justify-center overflow-hidden">
                            {assignee.avatar_url
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={assignee.avatar_url} alt="" className="w-full h-full object-cover" />
                              : getInitials(assignee.full_name)}
                          </span>{assignee.full_name.split(' ')[0]}</>
                        : <><User className="w-3 h-3" aria-hidden="true" /> non assegnato</>}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer: apertura opzionale nel progetto */}
        <div className="p-4 border-t border-border">
          <Link href={projectHref(project.client_id, project.id)}
            className="flex items-center justify-center gap-2 w-full py-2.5 border border-border-strong text-text-primary text-sm font-semibold rounded-xl hover:bg-surface-hover transition-colors">
            <ExternalLink className="w-4 h-4" aria-hidden="true" /> Apri nel progetto
          </Link>
        </div>
      </aside>
    </div>
  )
}
