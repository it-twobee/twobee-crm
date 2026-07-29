'use client'

import { useEffect, useState, useCallback, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Plus, Loader2, Trash2, Check, ListTodo, AlertTriangle, Clock, Users, Eye,
} from 'lucide-react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { setAdHocTaskStatus, deleteAdHocTask, updateAdHocTask } from '@/app/actions/ad-hoc-tasks'
import { Avatar, SearchInput, Empty } from '@/components/shared/formkit'
import { TaskComposer } from '@/components/tasks/TaskComposer'
import { AdHocDetailModal, type AssignablePerson, type AdHocPatch } from '@/components/adhoc/AdHocDetailModal'
import { SUPERVISOR_ROLE } from '@/lib/task-roles'
import type { Profile, Priority, Visibility, TaskStatusV2 } from '@/lib/types/database'

type Row = {
  id: string; title: string; description: string | null; status: TaskStatusV2; priority: Priority
  due_date: string | null; visibility: Visibility; assignee_id: string | null
}
const STATUS_LABEL: Record<string, string> = {
  da_fare: 'Da fare', in_corso: 'In corso', in_review: 'In review',
  richiesta_supporto: 'Supporto', completato: 'Completata',
}
const TONE: Record<string, string> = {
  da_fare: 'text-text-tertiary', in_corso: 'text-info', in_review: 'text-warning',
  richiesta_supporto: 'text-orange', completato: 'text-success',
}
const PRIO_DOT: Record<string, string> = { alta: 'bg-error', media: 'bg-warning', bassa: 'bg-text-tertiary' }
const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const relDays = (iso: string) => {
  const d = Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)
  if (d < 0) return { text: `${-d}g fa`, tone: 'text-error' }
  if (d === 0) return { text: 'oggi', tone: 'text-warning' }
  if (d <= 7) return { text: `tra ${d}g`, tone: 'text-warning' }
  return { text: iso.slice(5), tone: 'text-text-tertiary' }
}

type Filter = 'aperte' | 'late' | 'soon' | 'unassigned' | 'tutte'

/** Copy diverse per i due tipi: sono due cose diverse, non due filtri. */
const KIND_COPY = {
  ad_hoc: {
    title: 'Task Ad Hoc',
    hint: 'Attività nostre, fuori progetto: richieste veloci, extra, favori. Le facciamo noi.',
    empty: 'Nessuna task ad hoc.',
    emptyHint: 'Quello che non sta in un progetto, e che facciamo noi, sta qui.',
    context: 'Ad hoc',
  },
  cliente: {
    title: 'Task al cliente',
    hint: 'Cose che deve fare il cliente: materiali, approvazioni, accessi. Sempre visibili nel suo portale.',
    empty: 'Nessuna task in carico al cliente.',
    emptyHint: 'Quando aspetti qualcosa da lui, mettilo qui invece che in una mail.',
    context: 'Al cliente',
  },
} as const

export function ClientAdHocTab({
  clientId, clientName, profiles, canManage, kind = 'ad_hoc',
}: {
  clientId: string
  clientName?: string
  profiles: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'app_role'>[]
  canManage: boolean
  kind?: 'ad_hoc' | 'cliente'
}) {
  const copy = KIND_COPY[kind]
  const [rows, setRows] = useState<Row[] | null>(null)
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [detail, setDetail] = useState<Row | null>(null)
  const [assignable, setAssignable] = useState<AssignablePerson[]>([])
  const [supervisors, setSupervisors] = useState<Map<string, string>>(new Map())
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('aperte')

  // referenti dell'anagrafica: alimentano il gruppo "lato cliente" del dettaglio
  useEffect(() => {
    createBrowserClient()
      .from('client_assignments').select('profile_id').eq('client_id', clientId)
      .then(({ data }) => {
        const mine = new Set((data ?? []).map(a => a.profile_id))
        setAssignable(profiles.map(p => ({
          id: p.id, full_name: p.full_name, avatar_url: p.avatar_url ?? null,
          app_role: p.app_role ?? null, client_id: mine.has(p.id) ? clientId : null,
        })))
      })
  }, [clientId, profiles])

  const reload = useCallback(async () => {
    const sb = createBrowserClient()
    const { data } = await sb
      .from('tasks').select('id,title,description,status,priority,due_date,visibility,assignee_id')
      .eq('client_id', clientId).eq('task_type', kind).is('deleted_at', null)
      .order('created_at', { ascending: false })
    const list = (data ?? []) as Row[]
    setRows(list)

    // chi presidia: secondo livello, non è in tasks.assignee_id
    if (kind === 'cliente' && list.length) {
      const { data: sup } = await sb.from('task_assignees')
        .select('task_id, profile_id').eq('role_in_task', SUPERVISOR_ROLE)
        .in('task_id', list.map(r => r.id))
      setSupervisors(new Map((sup ?? []).map(s => [s.task_id as string, s.profile_id as string])))
    } else setSupervisors(new Map())
  }, [clientId, kind])

  useEffect(() => { reload() }, [reload])

  const person = (id: string | null) => id ? profiles.find(p => p.id === id) ?? null : null

  // Su una task "al cliente" il titolare è il suo referente registrato; noi restiamo
  // secondo livello, a presidiare. Se il cliente non ha ancora un account, il primo
  // campo resta vuoto e lo dice.
  const clientContacts = assignable.filter(p => p.client_id === clientId)
  const internals = assignable.filter(p => p.client_id !== clientId)
  const defaultContact = clientContacts[0]?.id ?? null

  const toggle = (r: Row) => start(async () => {
    try { await setAdHocTaskStatus(r.id, clientId, r.status === 'completato' ? 'da_fare' : 'completato'); reload() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const remove = (r: Row) => start(async () => {
    try { await deleteAdHocTask(r.id, clientId); reload() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const counts = useMemo(() => {
    const all = rows ?? []
    const in7 = plusDays(7)
    const open = all.filter(r => r.status !== 'completato')
    return {
      tutte: all.length,
      aperte: open.length,
      late: open.filter(r => r.due_date && r.due_date < today()).length,
      soon: open.filter(r => r.due_date && r.due_date >= today() && r.due_date <= in7).length,
      unassigned: open.filter(r => !r.assignee_id).length,
    }
  }, [rows])

  const view = useMemo(() => {
    const t = q.trim().toLowerCase()
    const in7 = plusDays(7)
    return (rows ?? []).filter(r => {
      if (t && !r.title.toLowerCase().includes(t)) return false
      if (filter === 'tutte') return true
      if (r.status === 'completato') return false
      if (filter === 'aperte') return true
      if (filter === 'late') return !!r.due_date && r.due_date < today()
      if (filter === 'soon') return !!r.due_date && r.due_date >= today() && r.due_date <= in7
      return !r.assignee_id
    }).sort((a, b) => {
      // le datate prima, in ordine di scadenza; poi le altre
      const da = a.due_date ?? '9999-12-31', db = b.due_date ?? '9999-12-31'
      return da < db ? -1 : da > db ? 1 : 0
    })
  }, [rows, q, filter])

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-text-primary font-heading">{copy.title}</h2>
          <p className="text-2xs text-text-tertiary mt-0.5">
            {copy.hint}
          </p>
        </div>
        {canManage && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2 rounded-xl shadow-soft press">
            <Plus className="w-4 h-4" />Nuova task
          </button>
        )}
      </div>

      {rows !== null && rows.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Chip label="Aperte" n={counts.aperte} on={filter === 'aperte'} onClick={() => setFilter('aperte')}
            icon={<ListTodo className="w-3.5 h-3.5" />} />
          <Chip label="In ritardo" n={counts.late} tone="error" on={filter === 'late'}
            onClick={() => setFilter(f => f === 'late' ? 'aperte' : 'late')} icon={<AlertTriangle className="w-3.5 h-3.5" />} />
          <Chip label="≤ 7 giorni" n={counts.soon} tone="warning" on={filter === 'soon'}
            onClick={() => setFilter(f => f === 'soon' ? 'aperte' : 'soon')} icon={<Clock className="w-3.5 h-3.5" />} />
          <Chip label="Non assegnate" n={counts.unassigned} tone="info" on={filter === 'unassigned'}
            onClick={() => setFilter(f => f === 'unassigned' ? 'aperte' : 'unassigned')} icon={<Users className="w-3.5 h-3.5" />} />
          <Chip label="Tutte" n={counts.tutte} on={filter === 'tutte'} onClick={() => setFilter('tutte')}
            icon={<Check className="w-3.5 h-3.5" />} />
          <div className="flex-1 min-w-[160px]"><SearchInput value={q} onChange={setQ} placeholder="Cerca…" /></div>
        </div>
      )}

      {rows === null ? (
        <div className="flex items-center gap-2 text-sm text-text-tertiary py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />Carico…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-border rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-gold-dim flex items-center justify-center mx-auto mb-3">
            <ListTodo className="w-6 h-6 text-gold-text" />
          </div>
          <p className="text-sm text-text-secondary">{copy.empty}</p>
          <p className="text-2xs text-text-tertiary mt-1">{copy.emptyHint}</p>
          {canManage && (
            <button onClick={() => setAdding(true)} className="text-2xs font-semibold bg-gold text-on-gold px-4 py-2 rounded-lg shadow-soft press mt-3">
              Crea la prima
            </button>
          )}
        </div>
      ) : view.length === 0 ? (
        <Empty>Nessuna task per il filtro attivo.</Empty>
      ) : (
        <div className="rounded-2xl border border-border shadow-soft overflow-hidden divide-y divide-border animate-fade-in">
          {view.map(r => {
            const p = person(r.assignee_id)
            const rel = r.due_date && r.status !== 'completato' ? relDays(r.due_date) : null
            return (
              <div key={r.id} className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 bg-surface group hover:bg-surface-hover transition-colors">
                {canManage ? (
                  <button onClick={() => toggle(r)} disabled={pending}
                    aria-label={r.status === 'completato' ? 'Riapri' : 'Completa'}
                    className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                      r.status === 'completato' ? 'bg-success border-success' : 'border-border-strong hover:border-gold'
                    }`}>
                    {r.status === 'completato' && <Check className="w-3 h-3 text-on-gold" strokeWidth={3} />}
                  </button>
                ) : <span className="w-4 h-4 shrink-0" />}
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIO_DOT[r.priority]}`} title={`Priorità ${r.priority}`} />
                <button onClick={() => setDetail(r)} title="Apri il dettaglio"
                  className={`flex-1 min-w-0 truncate text-sm text-left hover:text-gold-text transition-colors ${
                    r.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-primary'
                  }`}>
                  {r.title}
                  {r.description && <span className="ml-1.5 text-2xs text-text-tertiary">· dettagli</span>}
                </button>
                {r.visibility === 'client_visible' && (
                  <span className="flex items-center gap-1 text-2xs text-info shrink-0"><Eye className="w-3 h-3" />cliente</span>
                )}
                {rel && <span className={`text-2xs tabular shrink-0 ${rel.tone}`}>{rel.text}</span>}
                {p
                  ? <span title={kind === 'cliente' ? `Lato cliente: ${p.full_name}` : p.full_name} className="shrink-0">
                      <Avatar name={p.full_name} url={p.avatar_url} size={22} />
                    </span>
                  : r.status !== 'completato' && (
                      <span className="text-2xs text-warning shrink-0">
                        {kind === 'cliente' ? 'nessun referente' : 'non assegnata'}
                      </span>
                    )}
                {/* secondo livello: chi da noi presidia la task del cliente */}
                {kind === 'cliente' && (() => {
                  const s = person(supervisors.get(r.id) ?? null)
                  return s
                    ? <span title={`Presidia: ${s.full_name}`} className="shrink-0 -ml-1.5 ring-2 ring-surface rounded-full">
                        <Avatar name={s.full_name} url={s.avatar_url} size={22} />
                      </span>
                    : r.status !== 'completato'
                      ? <span className="text-2xs text-text-tertiary shrink-0">senza presidio</span>
                      : null
                })()}
                <span className={`text-2xs font-semibold shrink-0 w-20 text-right ${TONE[r.status]}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                {canManage && (
                  <button onClick={() => { if (confirm(`Eliminare "${r.title}"?`)) remove(r) }} aria-label="Elimina task"
                    className="text-text-tertiary hover:text-error opacity-0 group-hover:opacity-100 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {adding && (
        <TaskComposer
          destination={{
            mode: 'fixed', kind, clientId,
            context: clientName ? `${copy.context} · ${clientName}` : copy.title,
          }}
          profiles={assignable.map(p => ({ id: p.id, full_name: p.full_name, avatar_url: p.avatar_url, app_role: p.app_role }))}
          onClose={() => setAdding(false)}
          onCreated={() => reload()} />
      )}

      {detail && (
        <AdHocDetailModal task={{ ...detail, client_id: clientId }} clientLabel={clientName ?? 'Cliente'}
          people={assignable} canManage={canManage} pending={pending}
          onClose={() => setDetail(null)}
          onSave={(patch: AdHocPatch) => start(async () => {
            try { await updateAdHocTask(detail.id, clientId, patch); toast.success('Task aggiornata'); setDetail(null); reload() }
            catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
          })}
          onDelete={() => start(async () => {
            try { await deleteAdHocTask(detail.id, clientId); toast.success('Task eliminata'); setDetail(null); reload() }
            catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
          })} />
      )}
    </div>
  )
}

function Chip({ label, n, icon, tone, on, onClick }: {
  label: string; n: number; icon: React.ReactNode
  tone?: 'error' | 'warning' | 'info'; on: boolean; onClick: () => void
}) {
  const ink = n === 0 ? 'text-text-tertiary'
    : tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning' : tone === 'info' ? 'text-info' : 'text-text-secondary'
  return (
    <button onClick={onClick} aria-pressed={on} disabled={n === 0 && !!tone}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-2xs font-semibold transition-colors disabled:opacity-40 ${
        on ? 'border-gold bg-gold-dim text-text-primary' : `border-border hover:bg-surface-hover ${ink}`
      }`}>
      {icon}{label}<span className="tabular">{n}</span>
    </button>
  )
}
