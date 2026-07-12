'use client'

import type { Client, Project, Sprint, Task, ClientKpi, MeetingNote } from '@/lib/types/database'
import { clientName as displayName } from '@/lib/utils'
import { CalendarAgenda } from '@/components/shared/CalendarAgenda'
import { ProgettiAttivi } from './PanoramicaTab'

// §14 — Tab "Progetti attivi": la vista ricca dei progetti (spostata dalla Panoramica)
// + l'agenda REALE del cliente, presa dal calendario (non più dalle sole meeting_notes).

export function ProgettiAttiviTab({ client, projects, sprints, tasks, kpis, meetings, hideEconomics = false }: {
  client: Client
  projects: Project[]
  sprints: Sprint[]
  tasks: Task[]
  kpis: ClientKpi[]
  meetings: MeetingNote[]
  hideEconomics?: boolean
}) {
  return (
    <div className="space-y-6">
      <CalendarAgenda
        clientName={displayName(client)}
        projectNames={projects.map(p => p.name)}
        notes={meetings.map(m => ({ id: m.id, title: m.title, date: m.date }))}
      />
      <ProgettiAttivi
        projects={projects}
        tasks={tasks}
        sprints={sprints}
        kpis={kpis}
        clientId={client.id}
        hideEconomics={hideEconomics}
      />
    </div>
  )
}
