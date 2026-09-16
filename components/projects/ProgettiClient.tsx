'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, FolderKanban, Search, ChevronRight, Users } from 'lucide-react'
import { ProjectWizard } from './ProjectWizard'
import { ProjectGantt, type GanttLane } from './ProjectGantt'
import { countsInDelivery, type InternalKind } from '@/lib/clients'
import type {
  ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode,
  ProjectWorkstream, Milestone, Task, ClientLabel,
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

const INTERNAL_KEY = '__internal__'
const FAR = '9999-12-31'
const DAY = 86400000
/** Sotto questa soglia il cliente è presidiato: niente badge. */
const QUIET_DAYS = 10

const isoToday = () => new Date().toISOString().slice(0, 10)
const dayDiff = (a: string, b: string) =>
  Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / DAY)

/** Prima milestone aperta: serve solo a ordinare le corsie. */
function nextOpen(ms?: Milestone[]) {
  return ms?.find(m => m.status !== 'completata' && m.due_date)?.due_date ?? null
}

/**
 * Quanto è fermo: giorni dall'ultima milestone passata e giorni alla prossima.
 * «Fermo» = nulla da almeno 10 giorni E nulla nei prossimi 10 — il caso in cui
 * un cliente esce dal radar senza che nessuna scadenza lo riporti dentro.
 */
function quietInfo(ms: Milestone[]) {
  const today = isoToday()
  const dated = ms.map(m => m.due_date).filter((d): d is string => !!d).sort()
  const past = dated.filter(d => d < today)
  const future = dated.filter(d => d >= today)
  const sinceLast = past.length ? dayDiff(today, past[past.length - 1]) : null
  const untilNext = future.length ? dayDiff(future[0], today) : null
  const quiet = (sinceLast === null || sinceLast >= QUIET_DAYS) && (untilNext === null || untilNext > QUIET_DAYS)
  return { quiet, sinceLast, untilNext }
}

function quietBadge(info: ReturnType<typeof quietInfo>) {
  if (!info.quiet) return undefined
  const hard = info.sinceLast === null || info.sinceLast >= 30
  const tone = hard ? 'bg-error-dim border-error/40 text-error' : 'bg-warning-dim border-warning/40 text-warning'
  if (info.sinceLast === null) return {
    text: 'mai',
    tone,
    title: 'Mai una milestone datata',
    detail: `Nessuna scadenza né in passato né nei prossimi ${QUIET_DAYS} giorni: niente riporterà questo cliente nel calendario.`,
  }
  return {
    text: `fermo ${info.sinceLast}g`,
    tone,
    title: 'Cliente fermo',
    detail: `Ultima milestone ${info.sinceLast} giorni fa e ${info.untilNext === null ? 'nessuna in programma' : `la prossima tra ${info.untilNext} giorni`}: il chip compare quando non succede nulla da ${QUIET_DAYS} giorni e nulla è previsto nei prossimi ${QUIET_DAYS}.`,
  }
}

export function ProgettiClient({
  clients, profiles, services, templates, nodes, projects, workstreams, milestones, calTasks, initialClientId, openWizard,
  basePath = '/progetti', canCreate = true,
}: {
  clients: { id: string; name: string; client_label?: ClientLabel | null; is_internal?: boolean | null; internal_kind?: InternalKind | null }[]
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
  /* §341 — l'elenco in fondo era una griglia piatta di trenta schede in cui i
     progetti dello stesso cliente stavano sparsi: per sapere cosa c'è aperto su
     iCura bisognava scorrere tutto e tenerlo a mente. Il calendario qui sopra è
     già per cliente, e le due metà della pagina rispondevano alla stessa
     domanda in due ordini diversi. */
  const [projClient, setProjClient] = useState<string>('')
  const [grouped, setGrouped] = useState(true)

  const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? '—'
  /* §234/§345 — dal workspace le rotte admin le rimbalza il middleware: la
     riga cliente del calendario porta alla scheda **dello stesso portale**. */
  const clientBase = basePath.startsWith('/workspace') ? '/workspace/clienti' : '/clienti'
  const serviceLabel = (st: string) => services.find(s => s.service_type === st)?.label ?? st

  // ── Calendario milestone globale: una corsia per cliente, progetti in tendina ──
  const wsById = useMemo(() => new Map((workstreams ?? []).map(w => [w.id, w])), [workstreams])
  const [openClients, setOpenClients] = useState<Record<string, boolean>>({})
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

  // Un gruppo per ogni cliente da presidiare, anche senza progetti: chi è fermo si
  // vede solo se la sua riga c'è. I progetti interni stanno in un gruppo a parte.
  const groups = useMemo(() => {
    const live = projects.filter(p => LIVE_STATUSES.includes(p.status))
    const byClient = new Map<string, ProjectRow[]>()
    live.forEach(p => {
      const key = p.client_id ?? INTERNAL_KEY
      const arr = byClient.get(key)
      if (arr) arr.push(p)
      else byClient.set(key, [p])
    })
    const build = (id: string, name: string) => {
      const ps = (byClient.get(id) ?? []).slice()
      const ms = ps.flatMap(p => msByProject.get(p.id) ?? []).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
      ps.sort((a, b) => (nextOpen(msByProject.get(a.id)) ?? FAR) < (nextOpen(msByProject.get(b.id)) ?? FAR) ? -1 : 1)
      return { id, name, projects: ps, milestones: ms }
    }
    // persi, fermi, lead e società collegate non hanno un presidio da misurare (§328)
    const list = clients.filter(countsInDelivery).map(c => build(c.id, c.name))
    if (byClient.has(INTERNAL_KEY)) list.push(build(INTERNAL_KEY, 'Progetti interni'))
    // ordine da calendario: chi ha la prossima milestone aperta più vicina sta in cima
    return list.sort((a, b) => {
      const da = nextOpen(a.milestones) ?? FAR
      const db = nextOpen(b.milestones) ?? FAR
      return da === db ? a.name.localeCompare(b.name) : (da < db ? -1 : 1)
    })
  }, [projects, clients, msByProject])

  const lanes: GanttLane[] = useMemo(() => {
    const out: GanttLane[] = []
    groups.forEach((g, i) => {
      const open = !!openClients[g.id]
      out.push({
        id: `client:${g.id}`,
        name: g.name,
        subtitle: g.projects.length
          ? `${g.projects.length} progett${g.projects.length === 1 ? 'o' : 'i'} in corso`
          : 'nessun progetto in corso',
        accent: ACCENTS[i % ACCENTS.length],
        depth: 0,
        // i progetti interni sono un raggruppamento, non un'anagrafica: non c'è
        // una scheda da aprire, e un link che non porta da nessuna parte è
        // peggio di un link assente (§211)
        href: g.id === INTERNAL_KEY ? null : `${clientBase}/${g.id}`,
        // da chiusa la riga cliente porta le milestone di tutti i suoi progetti;
        // da aperta le lascia alle righe figlie, per non disegnarle due volte
        milestones: open ? [] : g.milestones,
        toggle: g.projects.length
          ? { expanded: open, onToggle: () => setOpenClients(o => ({ ...o, [g.id]: !o[g.id] })) }
          : undefined,
        badge: g.projects.length
          ? quietBadge(quietInfo(g.milestones))
          : {
            text: '0 progetti', tone: 'bg-error-dim border-error/40 text-error',
            title: 'Nessun progetto in corso',
            detail: 'Il cliente è in anagrafica ma non ha progetti attivi, in bozza o in pausa. I progetti completati e archiviati non contano.',
          },
        emptyLabel: open ? '' : g.projects.length ? 'nessuna milestone datata' : 'nessun progetto in corso',
      })
      if (open) g.projects.forEach(p => {
        const pms = msByProject.get(p.id) ?? []
        out.push({
          id: p.id,
          name: p.name,
          subtitle: p.status === 'active' ? serviceLabel(p.service_type) : (STATUS_LABEL[p.status] ?? p.status),
          depth: 1,
          href: `${basePath}/${p.id}`,
          milestones: pms,
          badge: quietBadge(quietInfo(pms)),
        })
      })
    })
    return out
  }, [groups, openClients, msByProject]) // eslint-disable-line react-hooks/exhaustive-deps

  const quietCount = useMemo(() => groups.filter(g => !g.projects.length || quietInfo(g.milestones).quiet).length, [groups])
  const msCount = useMemo(() => groups.reduce((n, g) => n + g.milestones.length, 0), [groups])

  const wsName = (m: Milestone) => {
    const w = wsById.get(m.workstream_id)
    const p = projects.find(x => x.id === m.project_id)
    return [p?.name, w?.name].filter(Boolean).join(' · ') || null
  }
  const openMilestone = (wsId: string, msId: string) => {
    const w = wsById.get(wsId)
    if (w) router.push(`${basePath}/${w.project_id}/workstream/${wsId}?ms=${msId}`)
  }

  const filtered = useMemo(() => projects.filter(p =>
    (!area || p.area === area) &&
    (!projClient || (p.client_id ?? INTERNAL_KEY) === projClient) &&
    (!q || p.name.toLowerCase().includes(q.toLowerCase()) || clientName(p.client_id).toLowerCase().includes(q.toLowerCase())),
  ), [projects, area, projClient, q]) // eslint-disable-line react-hooks/exhaustive-deps

  /** §341 — i clienti che hanno davvero un progetto: un filtro con voci vuote
      fa premere per scoprire che non c'era niente. */
  const clientiConProgetti = useMemo(() => {
    const ids = Array.from(new Set(projects.map(p => p.client_id ?? INTERNAL_KEY)))
    return ids
      .map(id => ({ id, name: id === INTERNAL_KEY ? 'Progetti interni' : clientName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [projects]) // eslint-disable-line react-hooks/exhaustive-deps

  /** §341 — l'elenco raggruppato: stesso ordine del calendario, per cliente. */
  const perCliente = useMemo(() => {
    const map = new Map<string, { id: string; name: string; items: typeof filtered }>()
    for (const p of filtered) {
      const id = p.client_id ?? INTERNAL_KEY
      const g = map.get(id)
      if (g) g.items.push(p)
      else map.set(id, { id, name: id === INTERNAL_KEY ? 'Progetti interni' : clientName(id), items: [p] })
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered]) // eslint-disable-line react-hooks/exhaustive-deps

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
            className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2.5 rounded-xl press btn-gold">
            <Plus className="w-4 h-4" />Nuovo progetto
          </button>
        )}
      </div>

      {/* Calendario milestone globale: una riga per cliente, progetti nella tendina */}
      <ProjectGantt
        title="Calendario milestone · per cliente"
        lanes={lanes}
        headerNote={<>· {groups.length} clienti · {msCount} milestone{quietCount > 0 && <span className="text-warning font-semibold"> · {quietCount} fermi</span>}</>}
        headerHint={{
          title: 'Clienti nel calendario',
          detail: `Ogni cliente attivo ha una riga, anche senza progetti. «Fermi» sono quelli senza milestone da ${QUIET_DAYS} giorni e senza nulla in programma nei prossimi ${QUIET_DAYS}. Persi, sospesi, lead e società collegate non compaiono.`,
        }}
        tasks={calTasks ?? []}
        profiles={profiles as { id: string; full_name: string; avatar_url: string | null }[]}
        onOpenMilestone={openMilestone}
        milestoneContext={wsName}
        /* §345 — dal riquadro in hover si esce: il titolo apre la milestone,
           la riga «Progetto · Workstream» apre il progetto. */
        milestoneHref={m => {
          const w = wsById.get(m.workstream_id)
          return w ? `${basePath}/${w.project_id}/workstream/${w.id}?ms=${m.id}` : null
        }}
        contextHref={m => (m.project_id ? `${basePath}/${m.project_id}` : null)}
        emptyHint="Nessun cliente attivo: il calendario mostra una riga per cliente e i progetti in corso nella tendina."
        labelWidth={260}
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
        {/* §341 — il cliente come filtro: l'elenco è lungo trenta schede, e la
            domanda che ci si porta è quasi sempre «cosa c'è aperto su questo». */}
        <select value={projClient} onChange={e => setProjClient(e.target.value)}
          aria-label="Filtra i progetti per cliente"
          className="bg-surface border border-border-interactive rounded-xl px-3 py-2 text-2xs text-text-primary shrink-0 max-w-[190px]">
          <option value="">Tutti i clienti</option>
          {clientiConProgetti.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => setGrouped(g => !g)}
          aria-pressed={grouped}
          title={grouped ? 'Mostra come elenco unico' : 'Raggruppa per cliente'}
          className={`flex items-center gap-1.5 text-2xs font-semibold px-3 py-2 rounded-xl border shrink-0 press ${
            grouped ? 'border-gold bg-gold-dim text-gold-text' : 'border-border text-text-secondary hover:text-text-primary'}`}>
          <Users className="w-3.5 h-3.5" aria-hidden="true" />per cliente
        </button>
        {(q || area || projClient) && (
          <button onClick={() => { setQ(''); setArea(''); setProjClient('') }}
            className="text-2xs font-semibold text-text-secondary hover:text-text-primary shrink-0">Azzera</button>
        )}
      </div>

      {/* lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl animate-fade-in">
          <FolderKanban className="w-9 h-9 text-text-tertiary mx-auto mb-3" />
          <p className="text-sm text-text-secondary">{projects.length === 0 ? (canCreate ? 'Nessun progetto. Creane uno con il wizard.' : 'Nessun progetto assegnato.') : 'Nessun risultato per i filtri.'}</p>
        </div>
      ) : grouped ? (
        <div className="space-y-4 animate-fade-in">
          {perCliente.map(g => (
            <section key={g.id}>
              <div className="flex items-baseline gap-2 mb-2 px-1">
                <h2 className="text-sm font-bold text-text-primary">{g.name}</h2>
                <span className="text-2xs text-text-tertiary tabular">
                  {g.items.length} progett{g.items.length === 1 ? 'o' : 'i'}
                </span>
                {g.items.some(p => p.status === 'active') && (
                  <span className="text-2xs text-success tabular">
                    · {g.items.filter(p => p.status === 'active').length} attiv{g.items.filter(p => p.status === 'active').length === 1 ? 'o' : 'i'}
                  </span>
                )}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {g.items.map(p => <ProjectCard key={p.id} p={p} basePath={basePath} clientName={clientName} serviceLabel={serviceLabel} showClient={false} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 animate-fade-in">
          {filtered.map(p => (
            <ProjectCard key={p.id} p={p} basePath={basePath} clientName={clientName} serviceLabel={serviceLabel} showClient />
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

/**
 * §341 — La scheda di un progetto, una sola.
 *
 * L'elenco si legge in due modi — raggruppato per cliente o piatto — e la
 * scheda deve essere la stessa: due copie dello stesso markup divergono al
 * primo campo aggiunto, e la pagina finisce col dire due cose di sé. Sotto il
 * titolo del cliente il nome del cliente sparisce: ripeterlo su ogni riga è
 * rumore che allontana il servizio, che è l'informazione vera.
 */
function ProjectCard({ p, basePath, clientName, serviceLabel, showClient }: {
  p: { id: string; name: string; status: string; area: string; service_type: string; client_id: string | null }
  basePath: string
  clientName: (id: string) => string
  serviceLabel: (st: string) => string
  showClient: boolean
}) {
  return (
    <Link href={`${basePath}/${p.id}`}
      className="group card-interactive bg-surface border border-border rounded-2xl p-4 flex items-start gap-3 no-tap-highlight">
      <div className="w-9 h-9 rounded-xl bg-gold-dim flex items-center justify-center shrink-0">
        <FolderKanban className="w-[18px] h-[18px] text-gold-text" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary truncate flex-1">{p.name}</span>
          <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[p.status] ?? STATUS_BADGE.draft}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
        </div>
        {showClient && (
          <div className="text-2xs text-text-tertiary mt-1 truncate">
            {p.client_id ? clientName(p.client_id) : 'Progetto interno'}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <span className={`text-2xs font-semibold capitalize ${AREA_TONE[p.area] ?? 'text-text-tertiary'}`}>{p.area}</span>
          <span className="text-2xs text-text-tertiary">·</span>
          <span className="text-2xs text-text-secondary truncate">{serviceLabel(p.service_type)}</span>
          <ChevronRight className="w-3.5 h-3.5 text-text-tertiary ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Link>
  )
}
