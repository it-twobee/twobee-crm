'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, FolderKanban, Search, ChevronRight } from 'lucide-react'
import { ProjectWizard } from './ProjectWizard'
import { ProjectGantt, type GanttLane } from './ProjectGantt'
import type {
  ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode,
  ProjectWorkstream, Milestone, Task,
} from '@/lib/types/database'

type ProjectRow = { id: string; name: string; status: string; area: string; service_type: string; client_id: string; created_at: string }

// palette d'accento per progetto (token semantici, mai hex)
const ACCENTS = ['bg-gold', 'bg-info', 'bg-accent', 'bg-success', 'bg-orange', 'bg-warning']

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-surface-active text-text-tertiary',
  active: 'bg-success-dim text-success',
  on_hold: 'bg-warning-dim text-warning',
  completed: 'bg-info-dim text-info',
  archived: 'bg-surface-active text-text-tertiary',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Bozza', active: 'Attivo', on_hold: 'In pausa', completed: 'Completato', archived: 'Archiviato',
}
const AREA_TONE: Record<string, string> = {
  marketing: 'text-accent', growth: 'text-gold-text', digital: 'text-info',
}
const AREAS = ['marketing', 'growth', 'digital'] as const
// stati "in corso": una riga di calendario per ognuno, anche senza milestone datate
const LIVE_STATUSES = ['active', 'draft', 'on_hold']

export function ProgettiClient({
  clients, profiles, services, templates, nodes, projects, workstreams, milestones, calTasks, initialClientId, openWizard,
  basePath = '/progetti', canCreate = true,
}: {
  clients: { id: string; name: string }[]
  profiles: { id: string; full_name: string; app_role: string | null; avatar_url?: string | null }[]
  services: ServiceCatalogEntry[]
  templates: ProjectTemplate[]
  nodes: ProjectTemplateNode[]
  projects: ProjectRow[]
  workstreams?: ProjectWorkstream[]
  milestones?: Milestone[]
  calTasks?: Pick<Task, 'id' | 'milestone_id' | 'status' | 'parent_task_id'>[]
  initialClientId?: string
  openWizard?: boolean
  basePath?: string
  canCreate?: boolean
}) {
  const router = useRouter()
  const [wizard, setWizard] = useState(!!initialClientId || !!openWizard)
  const [q, setQ] = useState('')
  const [area, setArea] = useState<string>('')

  const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? '—'
  const serviceLabel = (st: string) => services.find(s => s.service_type === st)?.label ?? st

  // ── Calendario milestone globale: una corsia per progetto in corso ────────
  const wsById = useMemo(() => new Map((workstreams ?? []).map(w => [w.id, w])), [workstreams])
  const msByProject = useMemo(() => {
    const m = new Map<string, Milestone[]>()
    ;(milestones ?? []).forEach(ms => {
      if (!ms.due_date) return
      const arr = m.get(ms.project_id)
      if (arr) arr.push(ms)
      else m.set(ms.project_id, [ms])
    })
    m.forEach(arr => arr.sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1)))
    return m
  }, [milestones])

  // chiave d'ordinamento: milestone aperta più imminente del progetto. Le scadute
  // hanno data nel passato, quindi salgono in cima da sole.
  const nextDue = useMemo(() => {
    const m = new Map<string, string>()
    msByProject.forEach((list, pid) => {
      const next = list.find(x => x.status !== 'completata')
      if (next?.due_date) m.set(pid, next.due_date)
    })
    return m
  }, [msByProject])

  const projectLanes: GanttLane[] = useMemo(() =>
    projects
      .filter(p => LIVE_STATUSES.includes(p.status))
      .sort((a, b) => {
        // progetti senza milestone aperte (o senza milestone) in coda
        const da = nextDue.get(a.id) ?? '9999-12-31'
        const db = nextDue.get(b.id) ?? '9999-12-31'
        return da === db ? a.name.localeCompare(b.name) : (da < db ? -1 : 1)
      })
      .map((p, i) => ({
        id: p.id,
        name: p.name,
        subtitle: `${clientName(p.client_id)}${p.status === 'active' ? '' : ` · ${STATUS_LABEL[p.status] ?? p.status}`}`,
        accent: ACCENTS[i % ACCENTS.length],
        milestones: msByProject.get(p.id) ?? [],
      })),
    [projects, msByProject, nextDue]) // eslint-disable-line react-hooks/exhaustive-deps

  const wsName = (m: Milestone) => wsById.get(m.workstream_id)?.name ?? null
  const openMilestone = (wsId: string, msId: string) => {
    const w = wsById.get(wsId)
    if (w) router.push(`${basePath}/${w.project_id}/workstream/${wsId}?ms=${msId}`)
  }

  const filtered = useMemo(() => projects.filter(p =>
    (!area || p.area === area) &&
    (!q || p.name.toLowerCase().includes(q.toLowerCase()) || clientName(p.client_id).toLowerCase().includes(q.toLowerCase())),
  ), [projects, area, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = projects.filter(p => p.status === 'active').length

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      {/* header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">Progetti</h1>
          <p className="text-sm text-text-secondary mt-1">
            <span className="tabular font-semibold text-text-primary">{projects.length}</span> totali ·{' '}
            <span className="tabular font-semibold text-success">{activeCount}</span> attivi
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setWizard(true)}
            className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2.5 rounded-xl shadow-soft press">
            <Plus className="w-4 h-4" />Nuovo progetto
          </button>
        )}
      </div>

      {/* Calendario milestone globale: una riga per progetto in corso */}
      <ProjectGantt
        title="Calendario milestone · progetti in corso"
        lanes={projectLanes}
        laneLabel="progetti"
        tasks={calTasks ?? []}
        profiles={profiles as { id: string; full_name: string; avatar_url: string | null }[]}
        onOpenMilestone={openMilestone}
        milestoneContext={wsName}
        emptyHint="Nessun progetto in corso: il calendario mostra una riga per ogni progetto attivo, in bozza o in pausa."
        labelWidth={220}
      />

      {/* toolbar filtri */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca progetto o cliente…"
            className="w-full bg-surface border border-border-interactive rounded-xl pl-9 pr-3 py-2 text-sm text-text-primary" />
        </div>
        <div className="flex bg-surface border border-border rounded-xl p-0.5 scroll-x-touch">
          <button onClick={() => setArea('')}
            className={`px-3 py-1.5 rounded-lg text-2xs font-semibold whitespace-nowrap ${area === '' ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'}`}>Tutte</button>
          {AREAS.map(a => (
            <button key={a} onClick={() => setArea(a)}
              className={`px-3 py-1.5 rounded-lg text-2xs font-semibold capitalize whitespace-nowrap ${area === a ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'}`}>{a}</button>
          ))}
        </div>
      </div>

      {/* lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl animate-fade-in">
          <FolderKanban className="w-9 h-9 text-text-tertiary mx-auto mb-3" />
          <p className="text-sm text-text-secondary">{projects.length === 0 ? (canCreate ? 'Nessun progetto. Creane uno con il wizard.' : 'Nessun progetto assegnato.') : 'Nessun risultato per i filtri.'}</p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 animate-fade-in">
          {filtered.map(p => (
            <Link key={p.id} href={`${basePath}/${p.id}`}
              className="group card-interactive bg-surface border border-border rounded-2xl p-4 flex items-start gap-3 no-tap-highlight">
              <div className="w-9 h-9 rounded-xl bg-gold-dim flex items-center justify-center shrink-0">
                <FolderKanban className="w-[18px] h-[18px] text-gold-text" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary truncate flex-1">{p.name}</span>
                  <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[p.status] ?? STATUS_BADGE.draft}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                </div>
                <div className="text-2xs text-text-tertiary mt-1 truncate">{clientName(p.client_id)}</div>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className={`text-2xs font-semibold capitalize ${AREA_TONE[p.area] ?? 'text-text-tertiary'}`}>{p.area}</span>
                  <span className="text-2xs text-text-tertiary">·</span>
                  <span className="text-2xs text-text-secondary truncate">{serviceLabel(p.service_type)}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-text-tertiary ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {wizard && (
        <ProjectWizard
          clients={clients} profiles={profiles} services={services}
          templates={templates} nodes={nodes}
          fixedClientId={initialClientId}
          basePath={basePath}
          onClose={() => setWizard(false)}
        />
      )}
    </div>
  )
}
