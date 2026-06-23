'use client'

import { useState } from 'react'
import { LayoutGrid, List, GanttChartSquare, Users2 } from 'lucide-react'
import { KanbanBoard } from './KanbanBoard'
import { ListView } from './ListView'
import { GanttView } from './GanttView'
import { WorkloadView } from './WorkloadView'
import type { Task, Profile, Client } from '@/lib/types/database'

interface TaskWithMeta extends Task {
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  project: { id: string; name: string; client_id: string; clients: { company_name: string } | null } | null
}

type View = 'kanban' | 'list' | 'gantt' | 'workload'

const VIEWS: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: 'kanban', label: 'Kanban', icon: <LayoutGrid className="w-4 h-4" /> },
  { key: 'list', label: 'Lista', icon: <List className="w-4 h-4" /> },
  { key: 'gantt', label: 'Gantt', icon: <GanttChartSquare className="w-4 h-4" /> },
  { key: 'workload', label: 'Workload', icon: <Users2 className="w-4 h-4" /> },
]

export function TaskHub({ tasks, profiles, clients }: {
  tasks: TaskWithMeta[]
  profiles: Profile[]
  clients: Client[]
}) {
  const [view, setView] = useState<View>('kanban')
  const [selectedTask, setSelectedTask] = useState<TaskWithMeta | null>(null)

  return (
    <div className="flex flex-col h-full">
      {/* Header con view switcher */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A] shrink-0">
        <div>
          <h1 className="text-xl font-black text-white">Task</h1>
          <p className="text-xs text-text-secondary mt-0.5">{tasks.length} task totali</p>
        </div>
        <div className="flex bg-surface border border-[#2A2A2A] rounded-lg p-0.5">
          {VIEWS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                view === key ? 'bg-gold text-black' : 'text-text-secondary hover:text-white'
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* View content */}
      <div className="flex-1 overflow-hidden">
        {view === 'kanban' && (
          <KanbanBoard tasks={tasks} profiles={profiles} clients={clients} />
        )}
        {view === 'list' && (
          <div className="p-6 h-full overflow-y-auto">
            <ListView tasks={tasks} profiles={profiles} onSelect={(t) => setSelectedTask(t)} />
          </div>
        )}
        {view === 'gantt' && (
          <div className="p-6 h-full overflow-auto">
            <GanttView tasks={tasks} />
          </div>
        )}
        {view === 'workload' && (
          <div className="p-6 h-full overflow-y-auto">
            <WorkloadView tasks={tasks} profiles={profiles} />
          </div>
        )}
      </div>
    </div>
  )
}
