'use client'

import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { getPriorityBadge } from '@/lib/utils'
import type { TaskWithAssignee } from '@/lib/types/database'
import { getInitials } from '@/lib/utils'

interface TasksDueProps {
  tasks: TaskWithAssignee[]
}

export function TasksDue({ tasks }: TasksDueProps) {
  return (
    <div className="bg-surface border border-border rounded-card h-full flex flex-col overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="font-bold text-text-primary">Task della Settimana</h2>
        <Link href="/le-mie-attivita" className="text-xs text-gold-text hover:underline">
          Vedi tutti →
        </Link>
      </div>
      <div className="divide-y divide-border flex-1 overflow-auto">
        {tasks.length === 0 && (
          <div className="px-5 py-8 text-center text-text-secondary text-sm">
            Nessun task in scadenza questa settimana 🎉
          </div>
        )}
        {tasks.slice(0, 8).map((task) => (
          <div key={task.id} className="px-5 py-3.5 hover:bg-overlay/3 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{task.title}</p>
                {task.project && (
                  <p className="text-xs text-text-secondary mt-0.5 truncate">
                    {task.project.name}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${getPriorityBadge(task.priority)}`}>
                  {task.priority}
                </span>
                {task.due_date && (
                  <span className="text-xs text-text-secondary">
                    {formatDate(task.due_date)}
                  </span>
                )}
                {task.assignee && (
                  <div
                    className="w-6 h-6 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold-text text-2xs font-bold"
                    title={task.assignee.full_name}
                  >
                    {getInitials(task.assignee.full_name)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
