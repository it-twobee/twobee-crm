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
import { MilestoneBand } from '@/components/tasks/MilestoneBand'
import { tappeRows, filtraTappe, progettoBreve, workstreamBreve, type MilestoneInput } from '@/lib/task-board'
import type { Priority, Visibility, TaskStatusV2 } from '@/lib/types/database'

export type AdHocRow = {
  id: string; client_id: string | null; title: string; description?: string | null
  status: TaskStatusV2; priority: Priority; due_date: string | null; visibility: Visibility
  assignee_id: string | null; created_at: string
  /** §283 — quando è stata completata: da lì si contano i sessanta giorni */
  completed_at?: string | null
  /**
   * §340 — da dove viene. La sezione era solo delle ad hoc, e per vedere il
   * lavoro di qualcuno bisognava guardare in due posti sapendo già in quale
   * stava: qui le richieste fuori progetto, nella scheda del progetto tutto il
   * resto. Ora ci sono tutte, e questo campo è quello che permette di separarle
   * di nuovo quando serve — senza doverle cercare altrove.
   */
  task_type?: 'project' | 'ad_hoc'
  project_id?: string | null
  /** §346 — sotto quale tappa sta: serve alla fascia per dire «3 aperte su 5» */
  milestone_id?: string | null
  /** §346 — in quale corsia: su un progetto con quattro workstream è l'unica
      cosa che dice dove finisce questo lavoro */
  workstream_id?: string | null
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
/* §346 — **una definizione sola** per l'intestazione e per le righe: due
   elenchi di colonne scritti a mano divergono al primo ritocco, e
   un'intestazione disallineata è peggio di nessuna intestazione. Da telefono
   restano due colonne (attività e stato) e «dove» scende sotto il titolo. */
const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,190px)_100px_140px_84px_20px] gap-x-2.5 gap-y-0.5 items-center'
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
/** §340 — l'origine: di progetto, fuori progetto, o tutte insieme */
type Origin = 'tutte' | 'progetto' | 'ad_hoc'
/** §321 — filtrare le ad hoc che non sono di nessun cliente */
const NESSUNO = '__none__'
type GroupBy = 'cliente' | 'assegnatario' | 'scadenza' | 'progetto' | 'nessuno'
/** §346 — `client_id` serve alle tappe: la milestone non ce l'ha, il progetto sì */
type ProjectOpt = { id: string; name: string; client_id?: string | null }

export function AdHocClient({
  rows, clients, projects = [], workstreams = [], milestones = [], profiles, canManage,
  canCreateClient = false, clientBase = '/clienti', projectBase = '/progetti',
}: {
  rows: AdHocRow[]
  clients: ClientOpt[]
  /** §340 — i nomi dei progetti: una task di progetto senza il suo non si colloca */
  projects?: ProjectOpt[]
  /** §346 — i nomi delle corsie: la riga dice progetto **e** workstream */
  workstreams?: { id: string; name: string; project_id: string }[]
  /** §346 — le tappe: stanno in una fascia loro, sopra le task */
  milestones?: MilestoneInput[]
  profiles: Person[]
  canManage: boolean
  /** §317 — admin e manager possono aprire un'anagrafica dal composer */
  canCreateClient?: boolean
  clientBase?: string
  /** §211 — dal workspace si resta nel workspace: la rotta si costruisce da qui */
  projectBase?: string
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
  /* §340 — si apre sull'insieme: la domanda che porta qui è «cosa c'è da fare»,
     e la risposta non è mai metà del lavoro. Le due viste separate restano a un
     clic, per quando la domanda diventa «cosa c'è fuori dai progetti». */
  const [origin, setOrigin] = useState<Origin>('tutte')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  /* §321 — «nessun cliente» è una scelta, non un dato mancante: un trattino la
     fa leggere come un'anagrafica che manca, e chi la vede va a cercarla. */
  const clientName = (id: string | null) =>
    id ? (clients.find(c => c.id === id)?.name ?? '—') : 'Nessun cliente'
  const person = (id: string | null) => (id ? profiles.find(p => p.id === id) ?? null : null)
  const projectName = (id: string | null | undefined) =>
    (id ? projects.find(p => p.id === id)?.name ?? 'Progetto' : null)
  const isAdHoc = (r: AdHocRow) => (r.task_type ?? 'ad_hoc') === 'ad_hoc'

  /* §346 — **dove sta questa task.** Il chip mostrava il solo progetto tagliato
     a 150px: su un nome scritto dalla convention si leggeva «Affinity · Growth ·
     Le…», cioè il cliente — che il titolo del gruppo diceva già — e niente
     altro. Qui il cliente esce dal nome del progetto quando è già scritto
     accanto, e la corsia compare: senza, due task dello stesso progetto ma di
     due workstream diversi sono due righe identiche. Il nome intero resta nel
     titolo del puntatore, perché accorciare non è nascondere. */
  const contestoDi = (r: AdHocRow, by: GroupBy): ContestoTask => {
    const pj = r.project_id ? projects.find(p => p.id === r.project_id) ?? null : null
    const cl = r.client_id ? (clients.find(c => c.id === r.client_id)?.name ?? null) : null
    const ws = r.workstream_id ? (workstreams.find(w => w.id === r.workstream_id)?.name ?? null) : null
    return {
      progetto: by === 'progetto' ? null : (progettoBreve(pj?.name, cl) || null),
      progettoEsteso: pj?.name ?? null,
      workstream: workstreamBreve(ws, pj?.name) || null,
      cliente: by === 'cliente' ? null : (cl ?? 'Nessun cliente'),
      esteso: [cl ?? 'Nessun cliente', pj?.name, ws].filter(Boolean).join('  ›  '),
    }
  }

  const act = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  /* §340 — i numeri in cima seguono l'origine scelta: un riquadro «12 in
     ritardo» che conta anche quello che non stai guardando manda a cercare due
     task che non ci sono. */
  const scope = useMemo(
    () => rows.filter(r => origin === 'tutte' || (origin === 'ad_hoc' ? isAdHoc(r) : !isAdHoc(r))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, origin])

  const counts = useMemo(() => {
    const in7 = plusDays(7)
    const open = scope.filter(r => r.status !== 'completato')
    return {
      tutte: scope.length,
      aperte: open.length,
      late: open.filter(r => r.due_date && r.due_date < today()).length,
      soon: open.filter(r => r.due_date && r.due_date >= today() && r.due_date <= in7).length,
      unassigned: open.filter(r => !r.assignee_id).length,
      /* Quante ce ne sono nelle due metà: serve alle etichette del selettore,
         così si sa cosa si sta lasciando fuori **prima** di premere. */
      diProgetto: rows.filter(r => !isAdHoc(r)).length,
      adHoc: rows.filter(r => isAdHoc(r)).length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, rows])

  /* §283 — le completate stanno **fuori** dall'elenco filtrato: sono un'altra
     domanda («l'ho chiusa per sbaglio?») e in mezzo alle aperte non si vedono
     né le une né le altre. Rispettano gli stessi filtri di cliente e persona,
     perché altrimenti in una lista filtrata comparirebbero le altrui. */
  const done = useMemo(() => scope
    .filter(r => r.status === 'completato'
      && (!clientId || r.client_id === clientId)
      && (!assigneeId || r.assignee_id === assigneeId))
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .map(r => ({ id: r.id, title: r.title, completedAt: r.completed_at,
      who: clientName(r.client_id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, clientId, assigneeId])

  const view = useMemo(() => {
    const t = q.trim().toLowerCase()
    const in7 = plusDays(7)
    return scope.filter(r => {
      if (t && !r.title.toLowerCase().includes(t)
        && !clientName(r.client_id).toLowerCase().includes(t)
        && !(projectName(r.project_id) ?? '').toLowerCase().includes(t)) return false
      if (clientId === NESSUNO ? r.client_id !== null : (clientId && r.client_id !== clientId)) return false
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
  }, [scope, q, filter, clientId, assigneeId, clients, projects])

  /** raggruppamento: chiave stabile + etichetta leggibile */
  const groups = useMemo(() => {
    if (groupBy === 'nessuno') return [{ key: 'all', label: `${view.length} task`, items: view }]
    const map = new Map<string, { label: string; items: AdHocRow[]; order: string }>()
    for (const r of view) {
      let key: string, label: string, order: string
      if (groupBy === 'cliente') {
        key = r.client_id ?? 'nessuno'; label = clientName(r.client_id); order = label.toLowerCase()
      } else if (groupBy === 'progetto') {
        key = r.project_id ?? 'fuori'
        label = projectName(r.project_id) ?? 'Fuori progetto'
        order = r.project_id ? label.toLowerCase() : 'zzz'
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
  }, [view, groupBy, clients, profiles, projects])

  /* §346 — **le tappe, in una fascia loro.** Una milestone non compariva in
     nessun elenco di lavoro: chi ne aveva una in carico la vedeva solo sul
     calendario del progetto, cioè solo se era già andato a cercarla. Non si
     mescola alle task — le sue task sono già qui sotto, e contarle due volte
     farebbe dire ai riquadri in cima un numero che non esiste (il perché per
     esteso sta in `lib/task-board.ts`). Segue gli stessi filtri dell'elenco: una
     fascia che li ignora mostra le tappe di altri mentre stai guardando le tue.
     Sparisce su «Ad hoc», che è per definizione quello che sta fuori dai
     progetti. */
  const tappe = useMemo(
    () => tappeRows({
      milestones,
      tasks: rows.map(r => ({ milestone_id: r.milestone_id ?? null, status: r.status })),
      projects,
      clientName: Object.fromEntries(clients.map(c => [c.id, c.name])),
    }),
    [milestones, rows, projects, clients])

  const tappeView = useMemo(
    () => (origin === 'ad_hoc' ? [] : filtraTappe(tappe, {
      q, clientId, ownerId: assigneeId, mode: filter,
    })),
    [tappe, origin, q, clientId, assigneeId, filter])

  const filtering = filter !== 'aperte' || !!q.trim() || !!clientId || !!assigneeId || origin !== 'tutte'
  const reset = () => { setFilter('aperte'); setQ(''); setClientId(''); setAssigneeId(''); setOrigin('tutte') }


  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">Task</h1>
          <p className="text-sm text-text-secondary mt-1">
            {origin === 'ad_hoc'
              ? 'Fuori progetto: richieste veloci, extra, favori.'
              : origin === 'progetto'
                ? 'Quelle che stanno dentro un progetto, per cliente.'
                : 'Tutte le task, dentro e fuori dai progetti.'}{' '}
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

      {/* §340 — **l'origine, prima di tutto il resto.** La sezione mostrava solo
          le ad hoc e per vedere il lavoro di una persona bisognava guardare in
          due posti sapendo già in quale stava. Adesso ci sono tutte, e questo
          selettore le separa di nuovo quando la domanda è «cosa c'è fuori dai
          progetti». Ogni voce porta il suo numero: si sa cosa si lascia fuori
          prima di premere, non dopo. */}
      <div className="w-full sm:max-w-md">
        <Segmented ariaLabel="Quali task" value={origin} onChange={setOrigin}
          options={[
            { value: 'tutte', label: `Tutte · ${counts.diProgetto + counts.adHoc}` },
            { value: 'progetto', label: `Di progetto · ${counts.diProgetto}` },
            { value: 'ad_hoc', label: `Ad hoc · ${counts.adHoc}` },
          ]} />
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
          <option value={NESSUNO}>Nessun cliente</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} aria-label="Filtra per assegnatario"
          className="bg-surface border border-border-interactive rounded-xl px-3 py-2 text-2xs text-text-primary shrink-0 max-w-[180px]">
          <option value="">Tutti gli assegnatari</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <div className="w-[22rem] shrink-0">
          <Segmented ariaLabel="Raggruppa per" value={groupBy} onChange={setGroupBy}
            options={[
              { value: 'cliente', label: 'Cliente' },
              { value: 'progetto', label: 'Progetto' },
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

      <MilestoneBand rows={tappeView} people={profiles}
        hint="Le consegne del progetto: si aprono sulla workstream, dove si spostano e si chiudono."
        hrefOf={r => `${projectBase}/${r.projectId}/workstream/${r.workstreamId}`} />

      {rows.length === 0 && tappeView.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-gold-dim flex items-center justify-center mx-auto mb-3">
            <ListTodo className="w-6 h-6 text-gold-text" />
          </div>
          <p className="text-sm text-text-secondary">Nessuna task.</p>
          <p className="text-2xs text-text-tertiary mt-1">Qui stanno tutte: quelle dei progetti e quelle fuori, per tutti i clienti.</p>
          {canManage && (
            <button onClick={() => setAdding(true)} className="text-2xs font-semibold bg-gold text-on-gold px-4 py-2 rounded-lg shadow-soft press mt-3">
              Crea la prima
            </button>
          )}
        </div>
      ) : view.length === 0 && !done.length ? (
        <Empty>{rows.length ? 'Nessuna task per i filtri attivi.' : 'Nessuna task: qui sopra restano le milestone.'}</Empty>
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
                    {/* §346 — **le colonne hanno un nome.** Erano sei incolonnate
                        senza intestazione: una data relativa («tra 7g»), un
                        cerchietto con due lettere e una parola di stato si
                        leggono solo se qualcuno dice cosa sono. */}
                    <div className={`${GRID} px-3 sm:px-4 py-1.5 bg-surface-active/40`}>
                      <span className="text-2xs font-bold uppercase tracking-wide text-text-tertiary pl-[42px]">Attività</span>
                      <span className="hidden sm:block text-2xs font-bold uppercase tracking-wide text-text-tertiary">Progetto</span>
                      <span className="hidden sm:block text-2xs font-bold uppercase tracking-wide text-text-tertiary">Scadenza</span>
                      <span className="hidden sm:block text-2xs font-bold uppercase tracking-wide text-text-tertiary">Chi</span>
                      <span className="hidden sm:block text-2xs font-bold uppercase tracking-wide text-text-tertiary text-right">Stato</span>
                      {canManage && <span className="hidden sm:block" />}
                    </div>
                    {g.items.map(r => (
                      <Row key={r.id} r={r} profiles={profiles} canManage={canManage} pending={pending}
                        /* §340/§346 — **dove sta questa task**: progetto e
                           workstream, non un chip tagliato a metà. Si tace quello
                           che il titolo del gruppo dice già — ripeterlo mangia la
                           larghezza che serve al resto. */
                        contesto={contestoDi(r, groupBy)}
                        clientHref={r.client_id ? `${clientBase}/${r.client_id}` : null}
                        /* §346 — il nome del progetto **è** la porta del
                           progetto: si legge lì e per aprirlo si tornava
                           indietro a cercarlo in un elenco. Dal workspace resta
                           nel workspace, perché la rotta si costruisce da
                           `projectBase` e non a mano (§211). */
                        projectHref={r.project_id ? `${projectBase}/${r.project_id}` : null}
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
          destination={{
            mode: 'pick', allow: ['ad_hoc', 'cliente'], clients, projects: [],
            defaultClientId: clientId || undefined, canCreateClient,
          }}
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

/**
 * §346 — dove sta la task: cliente, progetto, **workstream**.
 *
 * Il chip diceva il solo progetto, tagliato a 150px: su un nome scritto dalla
 * convention — `Cliente · Area · Servizio` — si leggeva «Affinity · Growth ·
 * Le…», cioè il cliente (che il titolo del gruppo diceva già) e niente altro.
 * Del workstream non c'era traccia, e su un progetto con quattro corsie è
 * l'unica cosa che dice *dove* finisce quel lavoro.
 */
export type ContestoTask = {
  progetto: string | null
  /** il nome intero del progetto, per il titolo del link */
  progettoEsteso: string | null
  workstream: string | null
  cliente: string | null
  /** il nome intero, per il titolo del puntatore: accorciare non è nascondere */
  esteso: string
}

function Row({
  r, profiles, person, contesto, clientHref, projectHref, showAssignee, canManage, pending,
  onOpen, onToggle, onPatch, onDelete,
}: {
  r: AdHocRow
  profiles: Person[]
  person: Person | null
  contesto: ContestoTask
  clientHref: string | null
  /** §346 — dove porta il nome del progetto: la sua scheda */
  projectHref: string | null
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
    <div className={`${GRID} px-3 sm:px-4 py-2 bg-surface group hover:bg-surface-hover transition-colors`}>
      {/* 1 · attività */}
      <div className="flex items-center gap-2.5 min-w-0">
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

        {r.visibility === 'client_visible' && (
          <span className="flex items-center gap-1 text-2xs text-info shrink-0" title="Visibile al cliente"><Eye className="w-3 h-3" /></span>
        )}
      </div>

      {/* 2 · dove. Da telefono scende sotto il titolo invece di sparire: è
             l'informazione che distingue due righe con lo stesso nome. */}
      <div className="col-start-1 sm:col-auto row-start-2 sm:row-auto min-w-0 pl-[42px] sm:pl-0 flex flex-col leading-tight"
        title={contesto.esteso || undefined}>
        {contesto.progetto && (
          projectHref
            ? <Link href={projectHref} title={`Apri ${contesto.progettoEsteso ?? contesto.progetto}`}
                className="text-2xs font-semibold text-info hover:text-gold-text transition-colors truncate">
                {contesto.progetto}
              </Link>
            : <span className="text-2xs font-semibold text-info truncate">{contesto.progetto}</span>
        )}
        {contesto.workstream && (
          <span className="text-2xs text-text-tertiary truncate">{contesto.workstream}</span>
        )}
        {contesto.cliente && (
          clientHref
            ? <Link href={clientHref} className="text-2xs text-text-tertiary hover:text-gold-text truncate">{contesto.cliente}</Link>
            : <span className="text-2xs text-text-tertiary truncate">{contesto.cliente}</span>
        )}
      </div>

      {/* 3 · scadenza: la data relativa, e in hover il campo che la sposta.
             Stavano una accanto all'altra e occupavano due colonne per la stessa
             cosa — che è il motivo per cui il progetto era ridotto a 150px. */}
      <div className="hidden sm:block min-w-0">
        <span className={`text-2xs tabular ${canManage ? 'group-hover:hidden' : ''} ${rel?.tone ?? 'text-text-tertiary'}`}>
          {rel?.text ?? (r.due_date ? r.due_date.slice(5) : '—')}
        </span>
        {canManage && (
          <input type="date" defaultValue={r.due_date ?? ''} aria-label="Scadenza"
            onBlur={e => { if (e.target.value !== (r.due_date ?? '')) onPatch({ due_date: e.target.value || null }) }}
            className="hidden group-hover:block w-full text-2xs bg-background border border-border rounded-lg px-1 py-0.5 text-text-secondary" />
        )}
      </div>

      {/* 4 · chi */}
      <div className="hidden sm:flex items-center min-w-0">
        {showAssignee && (
          <span className={`${canManage ? 'group-hover:hidden' : ''} flex items-center gap-1.5 min-w-0`}>
            {person
              ? <><Avatar name={person.full_name} url={person.avatar_url} size={22} />
                  <span className="text-2xs text-text-secondary truncate">{person.full_name}</span></>
              : !done && <span className="text-2xs text-warning">non assegnata</span>}
          </span>
        )}
        {canManage && (
          <select value={r.assignee_id ?? ''} onChange={e => onPatch({ assignee_id: e.target.value || null })}
            aria-label="Assegnatario"
            className="hidden group-hover:block w-full text-2xs bg-background border border-border rounded-lg px-1 py-0.5 text-text-secondary">
            <option value="">nessuno</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}
      </div>

      {/* 5 · stato */}
      <span className={`text-2xs font-semibold text-right shrink-0 ${STATUS_TONE[r.status]}`}>
        {STATUS_LABEL[r.status] ?? r.status}
      </span>

      {canManage && (
        <button onClick={() => { if (confirm(`Eliminare "${r.title}"?`)) onDelete() }} aria-label="Elimina task"
          className="hidden sm:block text-text-tertiary hover:text-error opacity-0 group-hover:opacity-100">
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
