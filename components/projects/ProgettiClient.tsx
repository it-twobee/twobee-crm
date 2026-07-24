'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, FolderKanban } from 'lucide-react'
import { ProjectWizard } from './ProjectWizard'
import type { ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode } from '@/lib/types/database'

type ProjectRow = { id: string; name: string; status: string; area: string; service_type: string; client_id: string; created_at: string }

const STATUS_TONE: Record<string, string> = {
  draft: 'text-text-tertiary', active: 'text-success', on_hold: 'text-warning',
  completed: 'text-info', archived: 'text-text-tertiary',
}

export function ProgettiClient({
  clients, profiles, services, templates, nodes, projects,
}: {
  clients: { id: string; name: string }[]
  profiles: { id: string; full_name: string; app_role: string | null }[]
  services: ServiceCatalogEntry[]
  templates: ProjectTemplate[]
  nodes: ProjectTemplateNode[]
  projects: ProjectRow[]
}) {
  const [wizard, setWizard] = useState(false)
  const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? '—'
  const serviceLabel = (st: string) => services.find(s => s.service_type === st)?.label ?? st

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Progetti</h1>
          <p className="text-sm text-text-secondary mt-1">{projects.length} progetti attivi</p>
        </div>
        <button onClick={() => setWizard(true)}
          className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2 rounded-lg">
          <Plus className="w-4 h-4" />Nuovo progetto
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <FolderKanban className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
          <p className="text-sm text-text-secondary">Nessun progetto. Creane uno con il wizard.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {projects.map(p => (
            <Link key={p.id} href={`/clienti/${p.client_id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors">
              <FolderKanban className="w-4 h-4 text-gold-text shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary truncate">{p.name}</div>
                <div className="text-2xs text-text-tertiary">{clientName(p.client_id)} · {p.area} · {serviceLabel(p.service_type)}</div>
              </div>
              <span className={`text-2xs font-semibold ${STATUS_TONE[p.status] ?? 'text-text-tertiary'}`}>{p.status}</span>
            </Link>
          ))}
        </div>
      )}

      {wizard && (
        <ProjectWizard
          clients={clients} profiles={profiles} services={services}
          templates={templates} nodes={nodes}
          onClose={() => setWizard(false)}
        />
      )}
    </div>
  )
}
