'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  Plus, Briefcase, Loader2, FolderTree, Flag, CheckSquare, AlertTriangle,
  Clock, ChevronRight, RotateCcw,
} from 'lucide-react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { SearchInput, Segmented, Empty } from '@/components/shared/formkit'
import type {
  ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode,
} from '@/lib/types/database'

const ProjectWizard = dynamic(
  () => import('@/components/projects/ProjectWizard').then(m => ({ default: m.ProjectWizard })),
  { ssr: false },
)

type Row = { id: string; name: string; status: string; area: string; service_type: string }
type Ws = { id: string; project_id: string }
type Ms = { id: string; project_id: string; title: string; status: string; due_date: string | null; milestone_type: string }
type Tk = { id: string; project_id: string | null; status: string; due_date: string | null; assignee_id: string | null }

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
const HEALTH_DOT: Record<string, string> = { red: 'bg-error', amber: 'bg-warning', green: 'bg-success', grey: 'bg-text-tertiary' }
const HEALTH_RANK: Record<string, number> = { red: 0, amber: 1, green: 2, grey: 3 }
const pretty = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const relDays = (iso: string) => {
  const d = Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)
  if (d < 0) return { text: `scaduta ${-d}g fa`, tone: 'text-error' }
  if (d === 0) return { text: 'oggi', tone: 'text-warning' }
  if (d <= 7) return { text: `tra ${d}g`, tone: 'text-warning' }
  return { text: `tra ${d}g`, tone: 'text-text-tertiary' }
}

const LIVE = ['active', 'draft', 'on_hold']

export function ClientProjectsTab({
  clientId, clientName, canCreate, basePath = '/progetti',
}: { clientId: string; clientName?: string; canCreate: boolean; basePath?: string }) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [ws, setWs] = useState<Ws[]>([])
  const [ms, setMs] = useState<Ms[]>([])
  const [tk, setTk] = useState<Tk[]>([])
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<'live' | 'all'>('live')
  const [sort, setSort] = useState<'salute' | 'scadenza' | 'nome'>('salute')

  // wizard on demand: i dati pesanti si caricano solo all'apertura
  const [wizard, setWizard] = useState(false)
  const [wizData, setWizData] = useState<{
    services: ServiceCatalogEntry[]; templates: ProjectTemplate[]; nodes: ProjectTemplateNode[]
    profiles: { id: string; full_name: string; app_role: string | null; avatar_url: string | null }[]
  } | null>(null)

  const load = useCallback(async () => {
    const sb = createBrowserClient()
    const { data: projects } = await sb
      .from('projects').select('id,name,status,area,service_type')
      .eq('client_id', clientId).is('deleted_at', null).order('created_at', { ascending: false })
    const list = (projects ?? []) as Row[]
    setRows(list)
    const ids = list.map(p => p.id)
    if (!ids.length) { setWs([]); setMs([]); setTk([]); return }
    const [w, m, t] = await Promise.all([
      sb.from('project_workstreams').select('id,project_id').in('project_id', ids),
      sb.from('milestones').select('id,project_id,title,status,due_date,milestone_type').in('project_id', ids),
      sb.from('tasks').select('id,project_id,status,due_date,assignee_id').in('project_id', ids).is('deleted_at', null),
    ])
    setWs((w.data ?? []) as Ws[])
    setMs((m.data ?? []) as Ms[])
    setTk((t.data ?? []) as Tk[])
  }, [clientId])

  useEffect(() => { load() }, [load])

  const openWizard = async () => {
    setWizard(true)
    if (wizData) return
    const sb = createBrowserClient()
    const [s, t, n, pr] = await Promise.all([
      sb.from('service_catalog').select('*').order('area').order('sort_order'),
      sb.from('project_templates').select('*').order('sort_order'),
      sb.from('project_template_nodes').select('*').order('sort_order'),
      sb.from('profiles').select('id, full_name, app_role, avatar_url').eq('is_active', true).order('full_name'),
    ])
    setWizData({
      services: (s.data ?? []) as ServiceCatalogEntry[],
      templates: (t.data ?? []) as ProjectTemplate[],
      nodes: (n.data ?? []) as ProjectTemplateNode[],
      profiles: (pr.data ?? []) as { id: string; full_name: string; app_role: string | null; avatar_url: string | null }[],
    })
  }

  // ── metriche per progetto ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const in7 = plusDays(7)
    const byId = new Map<string, {
      wsCount: number; tasks: number; done: number; overdue: number; soon: number
      unassigned: number; next: Ms | undefined; health: 'red' | 'amber' | 'green' | 'grey'
    }>()
    for (const p of rows ?? []) {
      const pt = tk.filter(t => t.project_id === p.id)
      const open = pt.filter(t => t.status !== 'completato')
      const overdue = open.filter(t => t.due_date && t.due_date < today()).length
      const soon = open.filter(t => t.due_date && t.due_date >= today() && t.due_date <= in7).length
      const next = ms
        .filter(m => m.project_id === p.id && m.milestone_type === 'delivery' && m.status !== 'completata' && m.due_date)
        .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0]
      const msLate = ms.some(m => m.project_id === p.id && m.status !== 'completata' && m.due_date && m.due_date < today())
      const health: 'red' | 'amber' | 'green' | 'grey' =
        overdue > 0 || msLate ? 'red' : soon > 0 ? 'amber' : pt.length ? 'green' : 'grey'
      byId.set(p.id, {
        wsCount: ws.filter(w => w.project_id === p.id).length,
        tasks: pt.length, done: pt.filter(t => t.status === 'completato').length,
        overdue, soon, unassigned: open.filter(t => !t.assignee_id).length, next, health,
      })
    }
    return byId
  }, [rows, ws, ms, tk])

  const totals = useMemo(() => {
    const live = (rows ?? []).filter(p => LIVE.includes(p.status))
    let overdue = 0, soon = 0
    live.forEach(p => { const s = stats.get(p.id); overdue += s?.overdue ?? 0; soon += s?.soon ?? 0 })
    const next = ms
      .filter(m => m.milestone_type === 'delivery' && m.status !== 'completata' && m.due_date)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0]
    return { live: live.length, overdue, soon, next }
  }, [rows, stats, ms])

  const view = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (rows ?? [])
      .filter(p => (scope === 'all' || LIVE.includes(p.status)) && (!t || p.name.toLowerCase().includes(t)))
      .sort((a, b) => {
        if (sort === 'nome') return a.name.localeCompare(b.name)
        if (sort === 'scadenza') {
          const da = stats.get(a.id)?.next?.due_date ?? '9999-12-31'
          const db = stats.get(b.id)?.next?.due_date ?? '9999-12-31'
          return da < db ? -1 : da > db ? 1 : 0
        }
        return HEALTH_RANK[stats.get(a.id)?.health ?? 'grey'] - HEALTH_RANK[stats.get(b.id)?.health ?? 'grey']
      })
  }, [rows, q, scope, sort, stats])

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-text-primary font-heading">Progetti del cliente</h2>
          <p className="text-2xs text-text-tertiary mt-0.5">
            {rows === null ? 'Carico…' : `${rows.length} in totale · ${totals.live} in corso`}
          </p>
        </div>
        {canCreate && (
          <button onClick={openWizard}
            className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2 rounded-xl shadow-soft press">
            <Plus className="w-4 h-4" />Nuovo progetto
          </button>
        )}
      </div>

      {/* segnali aggregati sul cliente */}
      {rows !== null && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Tile n={totals.live} label="In corso" icon={<Briefcase className="w-4 h-4 text-gold-text" />} />
          <Tile n={totals.overdue} label="Task in ritardo" tone={totals.overdue ? 'error' : undefined}
            icon={<AlertTriangle className={`w-4 h-4 ${totals.overdue ? 'text-error' : 'text-text-tertiary'}`} />} />
          <Tile n={totals.soon} label="Scade ≤ 7 giorni" tone={totals.soon ? 'warning' : undefined}
            icon={<Clock className={`w-4 h-4 ${totals.soon ? 'text-warning' : 'text-text-tertiary'}`} />} />
          <div className="bg-surface border border-border rounded-2xl p-3.5 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-text-primary truncate">{totals.next ? totals.next.title : '—'}</span>
              <Flag className="w-4 h-4 text-info shrink-0" />
            </div>
            <div className="text-2xs text-text-tertiary mt-0.5">Prossima consegna</div>
            {totals.next?.due_date && (
              <div className={`text-2xs mt-0.5 ${relDays(totals.next.due_date).tone}`}>{relDays(totals.next.due_date).text}</div>
            )}
          </div>
        </div>
      )}

      {rows !== null && rows.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[180px]"><SearchInput value={q} onChange={setQ} placeholder="Cerca progetto…" /></div>
          <div className="w-40 shrink-0">
            <Segmented ariaLabel="Perimetro" value={scope} onChange={setScope}
              options={[{ value: 'live', label: 'In corso' }, { value: 'all', label: 'Tutti' }]} />
          </div>
          <div className="w-56 shrink-0">
            <Segmented ariaLabel="Ordina per" value={sort} onChange={setSort}
              options={[{ value: 'salute', label: 'Salute' }, { value: 'scadenza', label: 'Scadenza' }, { value: 'nome', label: 'Nome' }]} />
          </div>
          {(q || scope !== 'live') && (
            <button onClick={() => { setQ(''); setScope('live') }}
              className="flex items-center gap-1 text-2xs font-semibold text-text-secondary hover:text-text-primary shrink-0">
              <RotateCcw className="w-3.5 h-3.5" />Azzera
            </button>
          )}
        </div>
      )}

      {rows === null ? (
        <div className="flex items-center gap-2 text-sm text-text-tertiary py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />Carico…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-border rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-gold-dim flex items-center justify-center mx-auto mb-3">
            <Briefcase className="w-6 h-6 text-gold-text" />
          </div>
          <p className="text-sm text-text-secondary">Nessun progetto per questo cliente.</p>
          {canCreate && (
            <button onClick={openWizard} className="text-2xs font-semibold bg-gold text-on-gold px-4 py-2 rounded-lg shadow-soft press mt-3">
              Crea il primo progetto
            </button>
          )}
        </div>
      ) : view.length === 0 ? (
        <Empty>Nessun progetto per il filtro attivo.</Empty>
      ) : (
        <div className="rounded-2xl border border-border shadow-soft overflow-hidden divide-y divide-border animate-fade-in">
          {view.map(p => {
            const s = stats.get(p.id)
            const pr = s && s.tasks ? Math.round((s.done / s.tasks) * 100) : 0
            const rel = s?.next?.due_date ? relDays(s.next.due_date) : null
            return (
              <Link key={p.id} href={`${basePath}/${p.id}`}
                className="flex items-center gap-3 p-3 sm:p-3.5 bg-surface hover:bg-surface-hover transition-colors group no-tap-highlight">
                <span className={`w-1 self-stretch rounded-full shrink-0 ${HEALTH_DOT[s?.health ?? 'grey']}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text-primary truncate">{p.name}</span>
                    <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[p.status] ?? STATUS_BADGE.draft}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-2xs font-semibold capitalize ${AREA_TONE[p.area] ?? 'text-text-tertiary'}`}>{pretty(p.area)}</span>
                    <span className="text-2xs text-text-tertiary">·</span>
                    <span className="text-2xs text-text-secondary truncate">{pretty(p.service_type)}</span>
                    {s && s.wsCount > 0 && (
                      <span className="text-2xs text-text-tertiary flex items-center gap-1">
                        <FolderTree className="w-3 h-3" /><span className="tabular">{s.wsCount}</span>
                      </span>
                    )}
                    {s && s.tasks > 0 && (
                      <span className="text-2xs text-text-tertiary flex items-center gap-1">
                        <CheckSquare className="w-3 h-3" /><span className="tabular">{s.done}/{s.tasks}</span>
                      </span>
                    )}
                    {s?.next && rel && (
                      <span className="text-2xs flex items-center gap-1">
                        <Flag className="w-3 h-3 text-info" />
                        <span className="text-text-secondary truncate max-w-[140px]">{s.next.title}</span>
                        <span className={rel.tone}>· {rel.text}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 w-28 shrink-0">
                  <div className="h-1.5 bg-surface-active rounded-full overflow-hidden flex-1">
                    <div className="h-full bg-gold rounded-full" style={{ width: `${pr}%` }} />
                  </div>
                  <span className="text-2xs text-text-tertiary tabular w-8 text-right">{pr}%</span>
                </div>
                {!!s?.overdue && (
                  <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-error-dim text-error shrink-0 tabular">{s.overdue} in ritardo</span>
                )}
                <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            )
          })}
        </div>
      )}

      {wizard && (
        wizData ? (
          <ProjectWizard
            clients={clientName ? [{ id: clientId, name: clientName }] : []}
            profiles={wizData.profiles} services={wizData.services}
            templates={wizData.templates} nodes={wizData.nodes}
            fixedClientId={clientId} basePath={basePath}
            onClose={() => { setWizard(false); load(); router.refresh() }} />
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim">
            <Loader2 className="w-6 h-6 text-gold-text animate-spin" />
          </div>
        )
      )}
    </div>
  )
}

function Tile({ n, label, icon, tone }: { n: number; label: string; icon: React.ReactNode; tone?: 'error' | 'warning' }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-3.5 shadow-soft">
      <div className="flex items-center justify-between">
        <span className={`text-2xl font-black tabular font-heading ${
          tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning' : 'text-text-primary'
        }`}>{n}</span>
        {icon}
      </div>
      <div className="text-2xs text-text-tertiary mt-0.5 truncate">{label}</div>
    </div>
  )
}
