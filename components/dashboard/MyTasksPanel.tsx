'use client'

import Link from 'next/link'
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import type { TaskWithAssignee } from '@/lib/types/database'

interface Props {
  userId: string
  tasks: TaskWithAssignee[]
}

const PRIORITY_COLORS: Record<string, string> = {
  urgente: 'text-error bg-error/10 border-error/20',
  alta: 'text-warning bg-warning/10 border-warning/20',
  media: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  bassa: 'text-text-secondary bg-[#2A2A2A] border-[#333]',
}

const STATUS_ICONS: Record<string, JSX.Element> = {
  completato: <CheckCircle2 className="w-4 h-4 text-success" />,
  in_corso: <Clock className="w-4 h-4 text-gold" />,
  in_attesa: <AlertCircle className="w-4 h-4 text-text-secondary" />,
  da_fare: <AlertCircle className="w-4 h-4 text-text-secondary" />,
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

export function MyTasksPanel({ tasks }: Props) {
  const sorted = [...tasks].sort((a, b) => {
    const pOrder = { urgente: 0, alta: 1, media: 2, bassa: 3 }
    return (pOrder[a.priority as keyof typeof pOrder] ?? 2) - (pOrder[b.priority as keyof typeof pOrder] ?? 2)
  })

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-text-primary">Le mie task</p>
        <span className="text-xs text-text-secondary">{tasks.length} attive</span>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-8">
          <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
          <p className="text-sm text-text-primary font-semibold">Tutto in ordine!</p>
          <p className="text-xs text-text-secondary mt-1">Nessuna task in scadenza questa settimana</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((task) => {
            const overdue = isOverdue(task.due_date)
            const project = task.project as { id?: string; name?: string; client_id?: string } | null
            return (
              <div key={task.id} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors hover:bg-overlay/5 ${overdue ? 'border-error/20 bg-error/5' : 'border-border'}`}>
                <div className="mt-0.5 shrink-0">
                  {STATUS_ICONS[task.status] ?? STATUS_ICONS['da_fare']}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary font-medium truncate">{task.title}</p>
                  {project?.name && (
                    <p className="text-xs text-text-secondary truncate mt-0.5">{project.name}</p>
                  )}
                  {task.due_date && (
                    <p className={`text-[10px] mt-0.5 font-semibold ${overdue ? 'text-error' : 'text-text-secondary'}`}>
                      {overdue ? '⚠ Scaduto · ' : 'Scade '}{new Date(task.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                    </p>
                  )}
                </div>
                {task.priority && (
                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border capitalize ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.bassa}`}>
                    {task.priority}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tasks.length > 5 && (
        <div className="mt-3 pt-3 border-t border-border text-center">
          <Link href="/clienti" className="text-xs text-gold hover:underline">
            Vedi tutti i clienti →
          </Link>
        </div>
      )}
    </div>
  )
}
