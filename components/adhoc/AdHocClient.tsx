'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, Check, Trash2, ListTodo, AlertTriangle, Clock, Users, Eye,
  RotateCcw, ChevronDown, CalendarDays, Building2,
} from 'lucide-react'
import { Avatar, SearchInput, Segmented, Empty } from '@/components/shared/formkit'
import { CompletedTasks } from '@/components/tasks/CompletedTasks'
import {
  setAdHocTaskStatus, deleteAdHocTask, updateAdHocTask,
} from '@/app/actions/ad-hoc-tasks'
import { TaskComposer } from '@/components/tasks/TaskComposer'
import { AdHocDetailModal, type AssignablePerson, type AdHocPatch } from './AdHocDetailModal'
import type { Priority, Visibility, TaskStatusV2 } from '@/lib/types/database'

export type AdHocRow = {
  id: string; client_id: string | null; title: string; description?: string | null
  status: TaskStatusV2; priority: Priority; due_date: string | null; visibility: Visibility
  assignee_id: string | null; created_at: string
  /** §283 — quando è stata completata: da lì si contano i sessanta giorni */
  completed_at?: string | null
}
type Person = AssignablePerson
type ClientOpt = { id: string; name: string }

const STATUS_LABEL: Record<string, string> = {
  da_fare: 'Da fare', in_corso: 'In corso', in_review: 'In review',
  richiesta_supporto: 'Supporto', completato: 'Completata',
}
const STATUS_TONE: Record<string, string> = {
  da_fare: 'text-text-tertiary', in_corso: 'text-info', in_review: 'text-warning',
  richiesta_supporto: 'text-orange', completato: 'text-success',
}
const PRIO_DOT: Record<string, string> = { alta: 'bg-error', media: 'bg-warning', bassa: 'bg-text-tertiary' }
const PRIO_RANK: Record<string, number> = { alta: 0, media: 1, bassa: 2 }

const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const relDays = (iso: string) => {
  const d = Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)
  if (d < 0) return { text: `${-d}g fa`, tone: 'text-error' }
  if (d === 0) return { text: 'oggi', tone: 'text-warning' }
  if (d === 1) return { text: 'domani', tone: 'text-warning' }
  if (d <= 7) return { text: `tra ${d}g`, tone: 'text-warning' }
  return { text: iso.slice(5), tone: 'text-text-tertiary' }
}

type Filter = 'aperte' | 'late' | 'soon' | 'unassigned' | 'tutte'
type GroupBy = 'cliente' | 'assegnatario' | 'scadenza' | 'nessuno'

export function AdHocClient({
  rows, clients, profiles, canManage, clientBase = '/clienti',
}: {
  rows: AdHocRow[]
  clients: ClientOpt[]
  profiles: Person[]
  canManage: boolean
  clientBase?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [detail, setDetail] = useState<AdHocRow | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('aperte')
  const [clientId, setClientId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('cliente')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const clientName = (id: string | null) => (id ? clients.find(c => c.id === id)?.name ?? '—' : '—')
  const person = (id: string | null) => (id ? profiles.find(p => p.id === id) ?? null : null)

  const act = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const counts = useMemo(() => {
    const in7 = plusDays(7)
    const open = rows.filter(r => r.status !== 'completato')
    return {
      tutte: rows.length,
      aperte: open.length,
      late: open.filter(r => r.due_date && r.due_date < today()).length,
      soon: open.filter(r => r.due_date && r.due_date >= today() && r.due_date <= in7).length,
      unassigned: open.filter(r => !r.assignee_id).length,
    }
  }, [rows])

  /* §283 — le completate stanno **fuori** dall'elenco filtrato: sono un'altra
     domanda («l'ho chiusa per sbaglio?») e in mezzo alle aperte non si vedono
     né le une né le altre. Rispettano gli stessi filtri di cliente e persona,
     perché altrimenti in una lista filtrata comparirebbero le altrui. */
  const done = useMemo(() => rows
    .filter(r => r.status === 'completato'
      && (!clientId || r.client_id === clientId)
      && (!assigneeId || r.assignee_id === assigneeId))
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .map(r => ({ id: r.id, title: r.title, completedAt: r.completed_at,
      who: clientName(r.client_id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, clientId, assigneeId])

  const view = useMemo(() => {
    const t = q.trim().toLowerCase()
    const in7 = plusDays(7)
    return rows.filter(r => {
      if (t && !r.title.toLowerCase().includes(t) && !clientName(r.client_id).toLowerCase().includes(t)) return false
      if (clientId && r.client_id !== clientId) return false
      if (assigneeId && r.assignee_id !== assigneeId) return false
      if (filter === 'tutte') return true
      if (r.status === 'completato') return false
      if (filter === 'aperte') return true
      if (filter === 'late') return !!r.due_date && r.due_date < today()
      if (filter === 'soon') return !!r.due_date && r.due_date >= today() && r.due_date <= in7
      return !r.assignee_id
    }).sort((a, b) => {
      // scadute e imminenti in cima, poi priorità, poi le senza data
      const da = a.due_date ?? '9999-12-31', db = b.due_date ?? '9999-12-31'
      if (da !== db) return da < db ? -1 : 1
      return PRIO_RANK[a.priority] - PRIO_RANK[b.priority]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, filter, clientId, assigneeId, clients])

  /** raggruppamento: chiave stabile + etichetta leggibile */
  const groups = useMemo(() => {
    if (groupBy === 'nessuno') return [{ key: 'all', label: `${view.length} task`, items: view }]
    const map = new Map<string, { label: string; items: AdHocRow[]; order: string }>()
    for (const r of view) {
      let key: string, label: string, order: string
      if (groupBy === 'cliente') {
        key = r.client_id ?? 'nessuno'; label = clientName(r.client_id); order = label.toLowerCase()
      } else if (groupBy === 'assegnatario') {
        key = r.assignee_id ?? 'nessuno'
        label = person(r.assignee_id)?.full_name ?? 'Non assegnate'
        order = r.assignee_id ? label.toLowerCase() : 'zzz'
      } else {
        if (!r.due_date) { key = 'nodate'; label = 'Senza scadenza'; order = 'zzz' }
        else if (r.due_date < today()) { key = 'late'; label = 'In ritardo'; order = '0' }
        else if (r.due_date === today()) { key = 'today'; label = 'Oggi'; order = '1' }
        else if (r.due_date <= plusDays(7)) { key = 'week'; label = 'Questa settimana'; order = '2' }
        else { key = 'later'; label = 'Più avanti'; order = '3' }
      }
      const g = map.get(key)
      if (g) g.items.push(r); else map.set(key, { label, items: [r], order })
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, label: v.label, items: v.items, order: v.order }))
      .sort((a, b) => a.order.localeCompare(b.order))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, groupBy, clients, profiles])

  const filtering = filter !== 'aperte' || !!q.trim() || !!clientId || !!assigneeId
  const reset = () => { setFilter('aperte'); setQ(''); setClientId(''); setAssigneeId('') }


  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">Task Ad Hoc</h1>
          <p className="text-sm text-text-secondary mt-1">
            Tutto quello che non sta in un progetto: richieste veloci, extra, favori.{' '}
            <span className="tabular font-semibold text-text-primary">{counts.aperte}</span> aperte su{' '}
            <span className="tabular">{counts.tutte}</span>
          </p>
        </div>
        {canManage && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2.5 rounded-xl shadow-soft press">
            <Plus className="w-4 h-4" />Nuova task
          </button>
        )}
      </div>

      {/* segnali: ognuno filtra */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Tile n={counts.aperte} label="Aperte" icon={<ListTodo className="w-4 h-4 text-gold-text" />}
          active={filter === 'aperte'} onClick={() => setFilter('aperte')} />
        <Tile n={counts.late} label="In ritardo" tone="error" icon={<AlertTriangle className={`w-4 h-4 ${counts.late ? 'text-error' : 'text-text-tertiary'}`} />}
          active={filter === 'late'} onClick={() => setFilter(f => f === 'late' ? 'aperte' : 'late')} />
        <Tile n={counts.soon} label="Scade ≤ 7 giorni" tone="warning" icon={<Clock className={`w-4 h-4 ${counts.soon ? 'text-warning' : 'text-text-tertiary'}`} />}
          active={filter === 'soon'} onClick={() => setFilter(f => f === 'soon' ? 'aperte' : 'soon')} />
        <Tile n={counts.unassigned} label="Non assegnate" tone="info" icon={<Users className={`w-4 h-4 ${counts.unassigned ? 'text-info' : 'text-text-tertiary'}`} />}
          active={filter === 'unassigned'} onClick={() => setFilter(f => f === 'unassigned' ? 'aperte' : 'unassigned')} />
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[180px]"><SearchInput value={q} onChange={setQ} placeholder="Cerca task o cliente…" /></div>
        <select value={clientId} onChange={e => setClientId(e.target.value)} aria-label="Filtra per cliente"
          className="bg-surface border border-border-interactive rounded-xl px-3 py-2 text-2xs text-text-primary shrink-0 max-w-[180px]">
          <option value="">Tutti i clienti</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} aria-label="Filtra per assegnatario"
          className="bg-surface border border-border-interactive rounded-xl px-3 py-2 text-2xs text-text-primary shrink-0 max-w-[180px]">
          <option value="">Tutti gli assegnatari</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <div className="w-72 shrink-0">
          <Segmented ariaLabel="Raggruppa per" value={groupBy} onChange={setGroupBy}
            options={[
              { value: 'cliente', label: 'Cliente' },
              { value: 'assegnatario', label: 'Persona' },
              { value: 'scadenza', label: 'Scadenza' },
              { value: 'nessuno', label: 'Piatta' },
            ]} />
        </div>
        {filtering && (
          <button onClick={reset} className="flex items-center gap-1 text-2xs font-semibold text-text-secondary hover:text-text-primary shrink-0">
            <RotateCcw className="w-3.5 h-3.5" />Azzera
          </button>
        )}
        {filter === 'tutte' ? null : (
          <button onClick={() => setFilter('tutte')} className="text-2xs font-semibold text-text-tertiary hover:text-text-primary shrink-0">
            Mostra anche completate
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-gold-dim flex items-center justify-center mx-auto mb-3">
            <ListTodo className="w-6 h-6 text-gold-text" />
          </div>
          <p className="text-sm text-text-secondary">Nessuna task ad hoc.</p>
          <p className="text-2xs text-text-tertiary mt-1">Le attività fuori progetto si raccolgono qui, per tutti i clienti.</p>
          {canManage && (
            <button onClick={() => setAdding(true)} className="text-2xs font-semibold bg-gold text-on-gold px-4 py-2 rounded-lg shadow-soft press mt-3">
              Crea la prima
            </button>
          )}
        </div>
      ) : view.length === 0 && !done.length ? (
        <Empty>Nessuna task per i filtri attivi.</Empty>
      ) : (
        <div className="space-y-3 animate-fade-in">
          {groups.map(g => {
            const isOff = !!collapsed[g.key]
            const late = g.items.filter(r => r.status !== 'completato' && r.due_date && r.due_date < today()).length
            return (
              <section key={g.key}>
                {groupBy !== 'nessuno' && (
                  <button onClick={() => setCollapsed(c => ({ ...c, [g.key]: !c[g.key] }))}
                    aria-expanded={!isOff}
                    className="w-full flex items-center gap-2 px-1 pb-2 text-left">
                    <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${isOff ? '-rotate-90' : ''}`} />
                    {groupBy === 'cliente' && <Building2 className="w-3.5 h-3.5 text-gold-text shrink-0" />}
                    {groupBy === 'scadenza' && <CalendarDays className="w-3.5 h-3.5 text-gold-text shrink-0" />}
                    <span className="text-2xs font-bold uppercase tracking-wide text-text-secondary truncate">{g.label}</span>
                    <span className="text-2xs text-text-tertiary tabular">{g.items.length}</span>
                    {late > 0 && (
                      <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-error-dim text-error tabular">{late} in ritardo</span>
                    )}
                  </button>
                )}
                {!isOff && (
                  <div className="rounded-2xl border border-border shadow-soft overflow-hidden divide-y divide-border">
                    {g.items.map(r => (
                      <Row key={r.id} r={r} profiles={profiles} canManage={canManage} pending={pending}
                        clientLabel={groupBy === 'cliente' ? null : clientName(r.client_id)}
                        clientHref={r.client_id ? `${clientBase}/${r.client_id}` : null}
                        showAssignee={groupBy !== 'assegnatario'}
                        person={person(r.assignee_id)}
                        onOpen={() => setDetail(r)}
                        onToggle={() => act(() => setAdHocTaskStatus(r.id, r.client_id, r.status === 'completato' ? 'da_fare' : 'completato'))}
                        onPatch={u => act(() => updateAdHocTask(r.id, r.client_id, u), 'Aggiornata')}
                        onDelete={() => act(() => deleteAdHocTask(r.id, r.client_id), 'Eliminata')} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* §283 — il raccoglitore sta **in fondo e fuori dai rami**: dentro quello
          della lista piena spariva proprio quando l'elenco si svuota, cioè nel
          momento in cui uno cerca la task che ha appena spuntato. */}
      {rows.length > 0 && (
        <CompletedTasks items={done} pending={pending}
          onReopen={id => act(() => setAdHocTaskStatus(
            id, rows.find(r => r.id === id)?.client_id ?? null, 'da_fare'), 'Riaperta')} />
      )}

      {adding && (
        <TaskComposer
          destination={{ mode: 'pick', allow: ['ad_hoc', 'cliente'], clients, projects: [], defaultClientId: clientId || undefined }}
          profiles={profiles}
          onClose={() => setAdding(false)}
          onCreated={() => router.refresh()} />
      )}

      {detail && (
        <AdHocDetailModal task={detail} clientLabel={clientName(detail.client_id)}
          people={profiles} canManage={canManage} pending={pending}
          onClose={() => setDetail(null)}
          onSave={(patch: AdHocPatch) => { act(() => updateAdHocTask(detail.id, detail.client_id, patch), 'Task aggiornata'); setDetail(null) }}
          onDelete={() => { act(() => deleteAdHocTask(detail.id, detail.client_id), 'Task eliminata'); setDetail(null) }} />
      )}
    </div>
  )
}

function Row({
  r, profiles, person, clientLabel, clientHref, showAssignee, canManage, pending,
  onOpen, onToggle, onPatch, onDelete,
}: {
  r: AdHocRow
  profiles: Person[]
  person: Person | null
  clientLabel: string | null
  clientHref: string | null
  showAssignee: boolean
  canManage: boolean
  pending: boolean
  onOpen: () => void
  onToggle: () => void
  onPatch: (u: { assignee_id?: string | null; due_date?: string | null; priority?: Priority }) => void
  onDelete: () => void
}) {
  const rel = r.due_date && r.status !== 'completato' ? relDays(r.due_date) : null
  const done = r.status === 'completato'
  return (
    <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 bg-surface group hover:bg-surface-hover transition-colors">
      {canManage ? (
        <button onClick={onToggle} disabled={pending} aria-label={done ? 'Riapri' : 'Completa'}
          className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
            done ? 'bg-success border-success' : 'border-border-strong hover:border-gold'
          }`}>
          {done && <Check className="w-3 h-3 text-on-gold" strokeWidth={3} />}
        </button>
      ) : <span className="w-4 h-4 shrink-0" />}

      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIO_DOT[r.priority]}`} title={`Priorità ${r.priority}`} />

      <button onClick={onOpen} title="Apri il dettaglio"
        className={`flex-1 min-w-0 truncate text-sm text-left hover:text-gold-text transition-colors ${
          done ? 'text-text-tertiary line-through' : 'text-text-primary'
        }`}>
        {r.title}
        {r.description && <span className="ml-1.5 text-2xs text-text-tertiary">·  dettagli</span>}
      </button>

      {clientLabel && (
        clientHref
          ? <Link href={clientHref} className="text-2xs text-text-tertiary hover:text-gold-text shrink-0 truncate max-w-[140px]">{clientLabel}</Link>
          : <span className="text-2xs text-text-tertiary shrink-0 truncate max-w-[140px]">{clientLabel}</span>
      )}

      {r.visibility === 'client_visible' && (
        <span className="flex items-center gap-1 text-2xs text-info shrink-0" title="Visibile al cliente"><Eye className="w-3 h-3" /></span>
      )}

      {rel
        ? <span className={`text-2xs tabular shrink-0 w-16 text-right ${rel.tone}`}>{rel.text}</span>
        : <span className="w-16 shrink-0" />}

      {canManage && (
        <input type="date" defaultValue={r.due_date ?? ''} aria-label="Scadenza"
          onBlur={e => { if (e.target.value !== (r.due_date ?? '')) onPatch({ due_date: e.target.value || null }) }}
          className="text-2xs bg-background border border-border rounded-lg px-1.5 py-1 text-text-secondary shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" />
      )}

      {showAssignee && (person
        ? <span title={person.full_name} className="shrink-0"><Avatar name={person.full_name} url={person.avatar_url} size={22} /></span>
        : !done && <span className="text-2xs text-warning shrink-0">non assegnata</span>)}

      {canManage && (
        <select value={r.assignee_id ?? ''} onChange={e => onPatch({ assignee_id: e.target.value || null })}
          aria-label="Assegnatario"
          className="text-2xs bg-background border border-border rounded-lg px-1.5 py-1 text-text-secondary max-w-[104px] shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
          <option value="">—</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      )}

      <span className={`text-2xs font-semibold shrink-0 w-20 text-right ${STATUS_TONE[r.status]}`}>
        {STATUS_LABEL[r.status] ?? r.status}
      </span>

      {canManage && (
        <button onClick={() => { if (confirm(`Eliminare "${r.title}"?`)) onDelete() }} aria-label="Elimina task"
          className="text-text-tertiary hover:text-error opacity-0 group-hover:opacity-100 shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

function Tile({ n, label, icon, tone, active, onClick }: {
  n: number; label: string; icon: React.ReactNode
  tone?: 'error' | 'warning' | 'info'; active: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`bg-surface border rounded-2xl p-3.5 shadow-soft text-left transition-colors hover:bg-surface-hover no-tap-highlight ${
        active ? 'border-gold ring-1 ring-gold' : 'border-border'
      }`}>
      <div className="flex items-center justify-between">
        <span className={`text-2xl font-black tabular font-heading ${
          n === 0 ? 'text-text-primary'
            : tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning' : tone === 'info' ? 'text-info' : 'text-text-primary'
        }`}>{n}</span>
        {icon}
      </div>
      <div className="text-2xs text-text-tertiary mt-0.5 truncate">{label}</div>
    </button>
  )
}
