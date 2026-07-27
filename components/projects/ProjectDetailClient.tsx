'use client'

import { useState, useMemo, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, FolderTree, Flag, Repeat, ChevronRight,
  Calendar, ListChecks, AlertTriangle, CheckSquare, Users, Clock, Plus, Pencil, Check, Trash2,
  MoreHorizontal, TrendingUp, ShieldCheck, Gauge, Wand2, SlidersHorizontal, RotateCcw,
} from 'lucide-react'
import { updateProjectStatus, updateProjectBrief, deleteProject } from '@/app/actions/projects'
import { generateRecurringNow } from '@/app/actions/tasks'
import { createWorkstream } from '@/app/actions/workstreams'
import {
  ModalShell, Field, Segmented, SearchInput, Avatar, inputCls,
} from '@/components/shared/formkit'
import { workstreamPrefixFromProjectName, applyWorkstreamPrefix } from '@/lib/project-naming'
import { ProjectGantt } from './ProjectGantt'
// La gestione workstream → milestone → task è nella pagina dedicata /workstream/[wsId]
import type {
  Project, ProjectWorkstream, Milestone, Task, RecurringTaskTemplate, ProjectStatus, WorkstreamType,
} from '@/lib/types/database'

type Person = { id: string; full_name: string; avatar_url: string | null }

const STATUSES: ProjectStatus[] = ['draft', 'active', 'on_hold', 'completed', 'archived']
const STATUS_LABEL: Record<string, string> = {
  draft: 'Bozza', active: 'Attivo', on_hold: 'In pausa', completed: 'Completato', archived: 'Archiviato',
}
const AREA_BADGE: Record<string, string> = {
  marketing: 'bg-accent-dim text-accent',
  growth: 'bg-gold-dim text-gold-text',
  digital: 'bg-info-dim text-info',
}
const MS_TONE: Record<string, string> = {
  da_fare: 'text-text-tertiary', in_corso: 'text-info', in_approvazione: 'text-warning', completata: 'text-success',
}
const MS_BADGE: Record<string, string> = {
  da_fare: 'bg-surface-active text-text-tertiary', in_corso: 'bg-info-dim text-info',
  in_approvazione: 'bg-warning-dim text-warning', completata: 'bg-success-dim text-success',
}
const MS_LABEL: Record<string, string> = {
  da_fare: 'Da fare', in_corso: 'In corso', in_approvazione: 'In approvazione', completata: 'Completata',
}

const isOverdue = (t: Task) => !!t.due_date && t.status !== 'completato' && t.due_date < new Date().toISOString().slice(0, 10)

export function ProjectDetailClient({
  project, clientName, workstreams, milestones, tasks, recurring, memberIds, profiles,
  backHref = '/progetti', canManageProject = true, canEditTasks = true, initialTab,
}: {
  project: Project
  clientName: string
  workstreams: ProjectWorkstream[]
  milestones: Milestone[]
  tasks: Task[]
  recurring: RecurringTaskTemplate[]
  memberIds: string[]
  profiles: Person[]
  backHref?: string
  canManageProject?: boolean
  canEditTasks?: boolean
  initialTab?: 'panoramica' | 'workstream'
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tab, setTab] = useState<'panoramica' | 'workstream'>(initialTab ?? 'panoramica')
  const [creatingWs, setCreatingWs] = useState(false)
  const [wsQuery, setWsQuery] = useState('')
  const [wsFilter, setWsFilter] = useState<'all' | 'late' | 'soon' | 'unassigned'>('all')
  const [wsSort, setWsSort] = useState<'salute' | 'scadenza' | 'nome' | 'avanzamento'>('salute')

  const wsBase = `${backHref.replace(/\/$/, '')}/${project.id}/workstream`
  // dal workspace le rotte admin sono rimbalzate dal middleware
  const portalBase = backHref.startsWith('/workspace') ? '/workspace' : ''
  const openWorkstream = (wsId: string) => router.push(`${wsBase}/${wsId}`)
  const openMilestone = (wsId: string, msId: string) => router.push(`${wsBase}/${wsId}?ms=${msId}`)

  const name = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? '—') : '—'
  const openMs = milestones.filter(m => m.status !== 'completata' && m.milestone_type === 'delivery')
  const openTasks = tasks.filter(t => t.status !== 'completato')
  const overdue = tasks.filter(isOverdue)
  const nextMs = [...openMs].filter(m => m.due_date).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0]

  const prettyLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => t.status === 'completato').length
  const progress = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0
  const teamMembers = profiles.filter(p => memberIds.includes(p.id) || p.id === project.manager_id)
  const wsProgress = (wsId: string) => {
    const wt = tasks.filter(t => t.workstream_id === wsId)
    if (!wt.length) return null
    return Math.round((wt.filter(t => t.status === 'completato').length / wt.length) * 100)
  }

  const changeStatus = (s: ProjectStatus) =>
    start(async () => {
      try { await updateProjectStatus(project.id, s); router.refresh(); toast.success('Stato aggiornato') }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
    })

  const genRecurring = () =>
    start(async () => {
      try { const n = await generateRecurringNow(); router.refresh(); toast.success(`${n} occorrenze generate`) }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
    })

  const deleteThisProject = () =>
    start(async () => {
      try { await deleteProject(project.id, project.client_id); toast.success('Progetto eliminato'); router.push(backHref); router.refresh() }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
    })

  const recurringWs = workstreams.filter(w => w.workstream_type === 'recurring')
  const projectWs = workstreams.filter(w => w.workstream_type === 'project')
  const wsPrefix = workstreamPrefixFromProjectName(project.name)

  // ── Segnali PM (per la Signal Bar del tab Workstream) ─────────────────────
  const todayStr = new Date().toISOString().slice(0, 10)
  const in7 = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) })()
  const dueSoon = tasks.filter(t => t.due_date && t.status !== 'completato' && t.due_date >= todayStr && t.due_date <= in7)
  const unassigned = openTasks.filter(t => !t.assignee_id)
  const nextDelivery = nextMs

  // health di una workstream: dai suoi task → red (overdue) / amber (≤7gg) / green / grey
  const wsHealth = (wsId: string): 'red' | 'amber' | 'green' | 'grey' => {
    const wt = tasks.filter(t => t.workstream_id === wsId && t.status !== 'completato')
    if (wt.some(isOverdue)) return 'red'
    if (wt.some(t => t.due_date && t.due_date >= todayStr && t.due_date <= in7)) return 'amber'
    if (tasks.some(t => t.workstream_id === wsId)) return 'green'
    return 'grey'
  }
  const wsNextMilestone = (wsId: string) => milestones
    .filter(m => m.workstream_id === wsId && m.milestone_type === 'delivery' && m.status !== 'completata' && m.due_date)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0]
  const wsOverdueCount = (wsId: string) => tasks.filter(t => t.workstream_id === wsId && isOverdue(t)).length
  const wsOwners = (wsId: string) => {
    const ids = new Set<string>()
    const w = workstreams.find(x => x.id === wsId)
    if (w?.owner_id) ids.add(w.owner_id)
    milestones.filter(m => m.workstream_id === wsId && m.owner_id).forEach(m => ids.add(m.owner_id!))
    tasks.filter(t => t.workstream_id === wsId && t.assignee_id).forEach(t => ids.add(t.assignee_id!))
    return Array.from(ids).map(id => profiles.find(p => p.id === id)).filter(Boolean) as Person[]
  }
  const wsDueSoonCount = (wsId: string) =>
    tasks.filter(t => t.workstream_id === wsId && t.status !== 'completato' && t.due_date && t.due_date >= todayStr && t.due_date <= in7).length
  const wsUnassignedCount = (wsId: string) =>
    tasks.filter(t => t.workstream_id === wsId && t.status !== 'completato' && !t.assignee_id).length
  const wsOpenCount = (wsId: string) => tasks.filter(t => t.workstream_id === wsId && t.status !== 'completato').length

  // ── Diagnosi: quanto tempo è passato contro quanto lavoro è fatto ──────────
  const timePct = useMemo(() => {
    if (!project.start_date || !project.target_end_date) return null
    const s = new Date(project.start_date + 'T00:00:00').getTime()
    const e = new Date(project.target_end_date + 'T00:00:00').getTime()
    if (e <= s) return null
    const now = new Date(todayStr + 'T00:00:00').getTime()
    return Math.min(100, Math.max(0, Math.round(((now - s) / (e - s)) * 100)))
  }, [project.start_date, project.target_end_date, todayStr])

  const msOverdue = openMs.filter(m => m.due_date && m.due_date < todayStr).length
  const drift = timePct === null ? null : timePct - progress

  /** verdetto in una riga: la prima cosa che un PM deve leggere */
  const verdict = useMemo(() => {
    if (project.status === 'completed') return { tone: 'success' as const, label: 'Completato', why: 'Nulla da presidiare.' }
    if (project.status === 'on_hold') return { tone: 'neutral' as const, label: 'In pausa', why: 'Riattivalo per rimetterlo in circolo.' }
    if (totalTasks === 0) return { tone: 'neutral' as const, label: 'Da impostare', why: 'Nessuna task: costruisci la struttura nel tab Workstream.' }

    const why: string[] = []
    if (msOverdue) why.push(`${msOverdue} milestone scadut${msOverdue === 1 ? 'a' : 'e'}`)
    if (overdue.length) why.push(`${overdue.length} task in ritardo`)
    if (drift !== null && drift >= 15) why.push(`${timePct}% del tempo consumato contro ${progress}% di lavoro`)
    if (dueSoon.length) why.push(`${dueSoon.length} in scadenza entro 7 giorni`)
    if (unassigned.length) why.push(`${unassigned.length} task senza assegnatario`)

    const critical = msOverdue > 0 || overdue.length > 2 || (drift !== null && drift >= 25)
    if (critical) return { tone: 'error' as const, label: 'In ritardo', why: why.slice(0, 3).join(' · ') }
    if (why.length) return { tone: 'warning' as const, label: 'Da presidiare', why: why.slice(0, 3).join(' · ') }
    return { tone: 'success' as const, label: 'In linea', why: 'Nessuna scadenza critica, tutto assegnato.' }
  }, [project.status, totalTasks, msOverdue, overdue.length, drift, timePct, progress, dueSoon.length, unassigned.length])

  /** agenda unica dei prossimi 14 giorni: milestone e task insieme, in ordine */
  const agenda = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 14)
    const in14 = d.toISOString().slice(0, 10)
    type Item = { id: string; kind: 'ms' | 'task'; title: string; date: string; wsId: string | null; owner: string | null }
    const items: Item[] = []
    milestones.forEach(m => {
      if (m.due_date && m.status !== 'completata' && m.due_date <= in14)
        items.push({ id: m.id, kind: 'ms', title: m.title, date: m.due_date, wsId: m.workstream_id, owner: m.owner_id })
    })
    tasks.forEach(t => {
      if (t.due_date && t.status !== 'completato' && t.due_date <= in14)
        items.push({ id: t.id, kind: 'task', title: t.title, date: t.due_date, wsId: t.workstream_id, owner: t.assignee_id })
    })
    return items.sort((a, b) => (a.date === b.date ? (a.kind === 'ms' ? -1 : 1) : a.date < b.date ? -1 : 1)).slice(0, 12)
  }, [milestones, tasks])

  /** carico aperto per persona, i più carichi in cima */
  const workload = useMemo(() => {
    const m = new Map<string, { open: number; late: number }>()
    openTasks.forEach(t => {
      if (!t.assignee_id) return
      const cur = m.get(t.assignee_id) ?? { open: 0, late: 0 }
      cur.open++; if (isOverdue(t)) cur.late++
      m.set(t.assignee_id, cur)
    })
    return Array.from(m.entries())
      .map(([id, v]) => ({ person: profiles.find(p => p.id === id), ...v }))
      .filter(x => x.person)
      .sort((a, b) => b.open - a.open || b.late - a.late)
  }, [openTasks, profiles])
  const maxLoad = Math.max(1, ...workload.map(w => w.open))

  // ── filtro + ordinamento della lista workstream ───────────────────────────
  const HEALTH_RANK: Record<string, number> = { red: 0, amber: 1, green: 2, grey: 3 }
  const applyWsView = (items: ProjectWorkstream[]) => {
    const q = wsQuery.trim().toLowerCase()
    const out = items.filter(w => {
      if (q && !w.name.toLowerCase().includes(q)) return false
      if (wsFilter === 'late') return wsOverdueCount(w.id) > 0
      if (wsFilter === 'soon') return wsDueSoonCount(w.id) > 0
      if (wsFilter === 'unassigned') return wsUnassignedCount(w.id) > 0
      return true
    })
    return out.sort((a, b) => {
      if (wsSort === 'nome') return a.name.localeCompare(b.name)
      if (wsSort === 'avanzamento') return (wsProgress(a.id) ?? 0) - (wsProgress(b.id) ?? 0)
      if (wsSort === 'scadenza') {
        const da = wsNextMilestone(a.id)?.due_date ?? '9999-12-31'
        const db = wsNextMilestone(b.id)?.due_date ?? '9999-12-31'
        return da < db ? -1 : da > db ? 1 : 0
      }
      return HEALTH_RANK[wsHealth(a.id)] - HEALTH_RANK[wsHealth(b.id)]
    })
  }
  const viewRecurring = applyWsView(recurringWs)
  const viewProject = applyWsView(projectWs)
  const shown = viewRecurring.length + viewProject.length
  const filtering = wsFilter !== 'all' || !!wsQuery.trim()

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 pt-5 pb-3">
        <Link href={backHref} className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary w-fit press">
          <ArrowLeft className="w-4 h-4" />Tutti i progetti
        </Link>
      </div>

      {/* header */}
      <div className="px-4 sm:px-6 pb-5 border-b border-border">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <h1 className="flex-1 text-2xl sm:text-3xl font-black text-text-primary font-heading break-words">{project.name}</h1>
              {canManageProject && <ProjectMenu onDelete={deleteThisProject} />}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
              {project.client_id
                ? <Link href={`${portalBase}/clienti/${project.client_id}`} className="text-gold-text hover:underline font-medium">{clientName}</Link>
                : <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-surface-active text-text-secondary">Progetto interno</span>}
              <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full capitalize ${AREA_BADGE[project.area] ?? 'bg-surface-active text-text-tertiary'}`}>{prettyLabel(project.area)}</span>
              <span className="text-text-secondary text-xs">{prettyLabel(project.service_type)}{project.service_subtype ? ` · ${prettyLabel(project.service_subtype)}` : ''}</span>
              {canManageProject ? (
                <select value={project.status} disabled={pending} onChange={e => changeStatus(e.target.value as ProjectStatus)}
                  aria-label="Stato progetto"
                  className="text-2xs font-semibold bg-background border border-border-interactive rounded px-2 py-1 text-text-primary">
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              ) : (
                <span className="text-2xs font-semibold text-text-secondary border border-border rounded px-2 py-1">{STATUS_LABEL[project.status]}</span>
              )}
              {project.manager_id && <span className="text-xs text-text-secondary">PM: {name(project.manager_id)}</span>}
              {project.start_date && (
                <span className="text-xs text-text-tertiary flex items-center gap-1">
                  <Calendar className="w-3 h-3" />{project.start_date}{project.target_end_date ? ` → ${project.target_end_date}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="flex border-b border-border px-4 sm:px-6 scroll-x-touch">
        {([['panoramica', 'Panoramica'], ['workstream', 'Workstream']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-3.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
              tab === key ? 'border-gold text-gold-text' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}>{label}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === 'panoramica' && (
          <div className="space-y-4 max-w-6xl animate-fade-in">
            {/* verdetto: la prima riga da leggere */}
            <Verdict tone={verdict.tone} label={verdict.label} why={verdict.why}
              action={verdict.tone === 'error' || verdict.tone === 'warning'
                ? { label: 'Vai ai workstream', run: () => { setWsFilter(overdue.length ? 'late' : 'all'); setTab('workstream') } }
                : undefined} />

            {/* tempo vs lavoro + numeri chiave */}
            <div className="grid gap-3 lg:grid-cols-3">
              <section className="bg-surface border border-border rounded-2xl p-4 shadow-soft lg:col-span-1">
                <div className="flex items-center gap-2 mb-3">
                  <Gauge className="w-4 h-4 text-gold-text" />
                  <h3 className="text-sm font-bold text-text-primary">Tempo contro lavoro</h3>
                </div>
                <Meter label="Lavoro fatto" value={progress} tone="gold" sub={`${doneTasks}/${totalTasks} task`} />
                {timePct !== null ? (
                  <>
                    <div className="mt-2.5">
                      <Meter label="Tempo consumato" value={timePct} tone={drift !== null && drift >= 15 ? 'error' : 'neutral'}
                        sub={`${project.start_date} → ${project.target_end_date}`} />
                    </div>
                    {drift !== null && (
                      <p className={`flex items-center gap-1.5 text-2xs mt-2.5 ${
                        drift >= 15 ? 'text-error' : drift <= -10 ? 'text-success' : 'text-text-tertiary'
                      }`}>
                        <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                        {drift >= 15 ? `${drift} punti di ritardo sul piano`
                          : drift <= -10 ? `${-drift} punti di anticipo sul piano`
                          : 'Lavoro e calendario allineati'}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="flex items-center gap-1.5 text-2xs text-text-tertiary mt-2.5">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />Senza date non posso confrontare il tempo con l&apos;avanzamento.
                  </p>
                )}
              </section>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:col-span-2 lg:grid-cols-2 xl:grid-cols-4">
                <Stat label="Workstream" value={workstreams.length} icon={<FolderTree className="w-4 h-4 text-gold-text" />}
                  onClick={() => setTab('workstream')} />
                <Stat label="Milestone aperte" value={openMs.length} icon={<Flag className="w-4 h-4 text-info" />}
                  hint={msOverdue ? `${msOverdue} scadute` : undefined} tone={msOverdue ? 'error' : undefined}
                  onClick={() => setTab('workstream')} />
                <Stat label="Task aperte" value={openTasks.length} icon={<ListChecks className="w-4 h-4 text-text-secondary" />}
                  hint={unassigned.length ? `${unassigned.length} non assegnate` : undefined}
                  onClick={() => { setWsFilter('unassigned'); setTab('workstream') }} />
                <Stat label="Task scadute" value={overdue.length} tone={overdue.length ? 'error' : undefined}
                  icon={<AlertTriangle className={`w-4 h-4 ${overdue.length ? 'text-error' : 'text-text-tertiary'}`} />}
                  onClick={() => { setWsFilter('late'); setTab('workstream') }} />
              </div>
            </div>

            {/* Brief del progetto — editabile/cancellabile */}
            <ProjectBrief projectId={project.id} initial={project.description} canEdit={canManageProject} />

            <div className="grid gap-4 lg:grid-cols-2">
              {/* agenda unica: milestone + task dei prossimi 14 giorni */}
              <section className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-warning" />
                  <h3 className="text-sm font-bold text-text-primary">Prossimi 14 giorni</h3>
                  {agenda.length > 0 && <span className="ml-auto text-2xs text-text-tertiary tabular">{agenda.length}</span>}
                </div>
                {agenda.length === 0 ? (
                  <p className="text-2xs text-text-tertiary">Niente in scadenza nelle prossime due settimane.</p>
                ) : (
                  <div className="space-y-0.5 -mx-2">
                    {agenda.map(it => {
                      const rel = relDays(it.date)
                      const owner = it.owner ? profiles.find(p => p.id === it.owner) : undefined
                      return (
                        <button key={`${it.kind}-${it.id}`} onClick={() => it.wsId && openWorkstream(it.wsId)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-surface-hover transition-colors">
                          {it.kind === 'ms'
                            ? <Flag className="w-3.5 h-3.5 text-info shrink-0" />
                            : <CheckSquare className="w-3.5 h-3.5 text-text-tertiary shrink-0" />}
                          <span className={`flex-1 text-sm truncate ${it.kind === 'ms' ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>{it.title}</span>
                          {owner && <Avatar name={owner.full_name} url={owner.avatar_url} size={20} />}
                          <span className={`text-2xs tabular shrink-0 w-20 text-right ${rel.tone}`}>{rel.text}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* carico per persona */}
              <section className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-text-secondary" />
                  <h3 className="text-sm font-bold text-text-primary">Chi sta portando cosa</h3>
                </div>
                {workload.length === 0 ? (
                  <p className="text-2xs text-text-tertiary">Nessuna task aperta assegnata.</p>
                ) : (
                  <div className="space-y-2">
                    {workload.slice(0, 6).map(w => (
                      <div key={w.person!.id} className="flex items-center gap-2.5">
                        <Avatar name={w.person!.full_name} url={w.person!.avatar_url} size={24} />
                        <span className="text-2xs text-text-secondary truncate w-28 shrink-0">{w.person!.full_name}</span>
                        <div className="flex-1 h-1.5 bg-surface-active rounded-full overflow-hidden">
                          <div className="h-full bg-gold rounded-full" style={{ width: `${(w.open / maxLoad) * 100}%` }} />
                        </div>
                        <span className="text-2xs tabular text-text-primary font-semibold w-6 text-right shrink-0">{w.open}</span>
                        {w.late > 0 && <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-error-dim text-error shrink-0 tabular">{w.late}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {unassigned.length > 0 && (
                  <button onClick={() => { setWsFilter('unassigned'); setTab('workstream') }}
                    className="flex items-center gap-1.5 text-2xs font-semibold text-warning mt-3 pt-2.5 border-t border-border w-full">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {unassigned.length} task senza assegnatario
                    <ChevronRight className="w-3 h-3 ml-auto" />
                  </button>
                )}
                {recurring.filter(r => r.active).length > 0 && (
                  <div className="flex items-center gap-2 text-2xs text-text-tertiary mt-3 pt-2.5 border-t border-border">
                    <Repeat className="w-3.5 h-3.5 text-success shrink-0" />
                    <span className="tabular font-semibold text-text-secondary">{recurring.filter(r => r.active).length}</span> attività ricorrenti attive
                  </div>
                )}
              </section>
            </div>

            {/* workstream preview */}
            {workstreams.length > 0 && (
              <section className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-gold-text" />
                    <h3 className="text-sm font-bold text-text-primary">Workstream</h3>
                  </div>
                  <button onClick={() => setTab('workstream')} className="text-2xs font-semibold text-gold-text hover:opacity-80 flex items-center gap-0.5">
                    Vedi tutte<ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[...workstreams]
                    .sort((a, b) => HEALTH_RANK[wsHealth(a.id)] - HEALTH_RANK[wsHealth(b.id)])
                    .slice(0, 6).map(w => {
                      const pr = wsProgress(w.id)
                      const nm = wsNextMilestone(w.id)
                      const od = wsOverdueCount(w.id)
                      return (
                        <button key={w.id} onClick={() => openWorkstream(w.id)}
                          className="card-interactive bg-background border border-border rounded-xl p-3 text-left no-tap-highlight flex gap-2.5">
                          <span className={`w-1 self-stretch rounded-full shrink-0 ${HEALTH_DOT[wsHealth(w.id)]}`} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="text-sm text-text-primary truncate flex-1">{w.name}</span>
                              {od > 0 && <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-error-dim text-error shrink-0 tabular">{od}</span>}
                            </span>
                            <span className="block text-2xs text-text-tertiary truncate mt-0.5">
                              {nm?.due_date ? `${nm.title} · ${relDays(nm.due_date).text}` : w.workstream_type === 'recurring' ? 'Continuativa' : 'Nessuna consegna in agenda'}
                            </span>
                            {pr !== null && (
                              <span className="block h-1 bg-surface-active rounded-full overflow-hidden mt-2">
                                <span className="block h-full bg-gold rounded-full" style={{ width: `${pr}%` }} />
                              </span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                </div>
              </section>
            )}

            {/* team */}
            {teamMembers.length > 0 && (
              <section className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-text-secondary" />
                  <h3 className="text-sm font-bold text-text-primary">Team</h3>
                  <span className="text-2xs text-text-tertiary tabular">{teamMembers.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {teamMembers.map(p => (
                    <div key={p.id} className="flex items-center gap-2 bg-background border border-border rounded-full pl-1 pr-3 py-1">
                      <Avatar name={p.full_name} url={p.avatar_url} size={24} />
                      <span className="text-2xs text-text-secondary">{p.full_name}</span>
                      {p.id === project.manager_id && <span className="text-2xs font-semibold text-gold-text">PM</span>}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'workstream' && (
          <div className="max-w-6xl space-y-5 animate-fade-in">
            {/* ── Signal Bar: ogni segnale filtra la lista qui sotto ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <Signal label="In ritardo" value={overdue.length} icon={<AlertTriangle className="w-4 h-4" />}
                tone={overdue.length ? 'error' : 'neutral'}
                active={wsFilter === 'late'} onClick={() => setWsFilter(f => f === 'late' ? 'all' : 'late')} />
              <Signal label="Scade ≤ 7 giorni" value={dueSoon.length} icon={<Clock className="w-4 h-4" />}
                tone={dueSoon.length ? 'warning' : 'neutral'}
                active={wsFilter === 'soon'} onClick={() => setWsFilter(f => f === 'soon' ? 'all' : 'soon')} />
              <Signal label="Non assegnate" value={unassigned.length} icon={<Users className="w-4 h-4" />}
                tone={unassigned.length ? 'info' : 'neutral'}
                active={wsFilter === 'unassigned'} onClick={() => setWsFilter(f => f === 'unassigned' ? 'all' : 'unassigned')} />
              <Signal label="Avanzamento" value={`${progress}%`} icon={<ListChecks className="w-4 h-4" />} tone="gold" bar={progress}
                sub={nextDelivery ? `Prossima: ${nextDelivery.title}` : undefined} />
            </div>

            {/* ── Calendario milestone a swimlane ── */}
            <ProjectGantt workstreams={workstreams} milestones={milestones} tasks={tasks} profiles={profiles} onOpenMilestone={openMilestone} />

            {/* ── toolbar ── */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <h3 className="text-xl font-bold text-text-primary font-heading">
                Workstream <span className="text-text-tertiary text-sm font-sans">· {filtering ? `${shown} di ${workstreams.length}` : workstreams.length}</span>
              </h3>
              <div className="flex items-center gap-2">
                {recurring.some(r => r.active) && (
                  <button onClick={genRecurring} disabled={pending}
                    className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80 press">
                    <Repeat className="w-3.5 h-3.5" />Genera ricorrenti
                  </button>
                )}
                {canManageProject && (
                  <button onClick={() => setCreatingWs(true)}
                    className="flex items-center gap-1.5 text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg shadow-soft press">
                    <Plus className="w-3.5 h-3.5" />Nuova workstream
                  </button>
                )}
              </div>
            </div>

            {workstreams.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <SearchInput value={wsQuery} onChange={setWsQuery} placeholder="Cerca workstream…" />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-text-tertiary" />
                  <div className="w-64">
                    <Segmented ariaLabel="Ordina per" value={wsSort} onChange={setWsSort}
                      options={[
                        { value: 'salute', label: 'Salute' },
                        { value: 'scadenza', label: 'Scadenza' },
                        { value: 'avanzamento', label: 'Avanz.' },
                        { value: 'nome', label: 'Nome' },
                      ]} />
                  </div>
                </div>
                {filtering && (
                  <button onClick={() => { setWsFilter('all'); setWsQuery('') }}
                    className="flex items-center gap-1 text-2xs font-semibold text-text-secondary hover:text-text-primary shrink-0">
                    <RotateCcw className="w-3.5 h-3.5" />Azzera
                  </button>
                )}
              </div>
            )}

            {workstreams.length === 0 && (
              <div className="text-center py-14 border border-dashed border-border rounded-2xl">
                <div className="w-12 h-12 rounded-full bg-gold-dim flex items-center justify-center mx-auto mb-3">
                  <FolderTree className="w-6 h-6 text-gold-text" />
                </div>
                <p className="text-sm text-text-secondary mb-3">Nessuna workstream. Organizza il progetto in filoni operativi.</p>
                {canManageProject && (
                  <button onClick={() => setCreatingWs(true)} className="text-2xs font-semibold bg-gold text-on-gold px-4 py-2 rounded-lg shadow-soft press">
                    Crea la prima workstream
                  </button>
                )}
              </div>
            )}

            {workstreams.length > 0 && shown === 0 && (
              <div className="text-center py-10 border border-dashed border-border rounded-2xl">
                <p className="text-sm text-text-secondary">Nessuna workstream corrisponde al filtro.</p>
                <button onClick={() => { setWsFilter('all'); setWsQuery('') }} className="text-2xs font-semibold text-gold-text mt-2">Azzera i filtri</button>
              </div>
            )}

            {/* Continuative */}
            {viewRecurring.length > 0 && (
              <WsGroup title="Continuative" hint="Attività ricorrenti senza fine definita"
                items={viewRecurring} onOpen={openWorkstream} progress={wsProgress}
                health={wsHealth} nextMs={wsNextMilestone} overdueOf={wsOverdueCount}
                openOf={wsOpenCount} ownersOf={wsOwners} />
            )}
            {/* A termine */}
            {viewProject.length > 0 && (
              <WsGroup title="A termine" hint="Con data di inizio e fine"
                items={viewProject} onOpen={openWorkstream} progress={wsProgress}
                health={wsHealth} nextMs={wsNextMilestone} overdueOf={wsOverdueCount}
                openOf={wsOpenCount} ownersOf={wsOwners} />
            )}
          </div>
        )}
      </div>

      {creatingWs && (
        <NewWorkstreamModal projectId={project.id} projectName={project.name} prefix={wsPrefix}
          defaults={{ start: project.start_date, end: project.target_end_date }} pending={pending}
          onClose={() => setCreatingWs(false)}
          onCreate={(input) => start(async () => {
            try { const id = await createWorkstream(input); toast.success('Workstream creata'); setCreatingWs(false); openWorkstream(id) }
            catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
          })} />
      )}
    </div>
  )
}

// Brief editabile del progetto
function ProjectBrief({ projectId, initial, canEdit }: { projectId: string; initial: string | null; canEdit: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(initial ?? '')

  const save = () => start(async () => {
    try { await updateProjectBrief(projectId, val); router.refresh(); toast.success('Brief salvato'); setEditing(false) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })
  const remove = () => start(async () => {
    try { await updateProjectBrief(projectId, null); router.refresh(); toast.success('Brief eliminato'); setVal(''); setEditing(false) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  if (editing) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft space-y-2">
        <textarea value={val} onChange={e => setVal(e.target.value)} autoFocus rows={4}
          placeholder="Scrivi il brief del progetto: obiettivi, contesto, note chiave…"
          className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary" />
        <div className="flex items-center gap-2 justify-end">
          {initial && <button onClick={remove} disabled={pending} className="flex items-center gap-1 text-2xs font-semibold text-error hover:opacity-80 mr-auto"><Trash2 className="w-3.5 h-3.5" />Elimina</button>}
          <button onClick={() => { setVal(initial ?? ''); setEditing(false) }} className="text-2xs font-semibold text-text-secondary px-3 py-1.5">Annulla</button>
          <button onClick={save} disabled={pending} className="flex items-center gap-1 text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg"><Check className="w-3.5 h-3.5" />Salva</button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft group">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide">Brief</h3>
        {canEdit && (
          <button onClick={() => { setVal(initial ?? ''); setEditing(true) }} aria-label="Modifica brief"
            className="text-text-tertiary hover:text-gold-text opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {initial
        ? <p className="text-sm text-text-secondary mt-1.5 whitespace-pre-wrap">{initial}</p>
        : <button onClick={() => canEdit && setEditing(true)} disabled={!canEdit}
            className="text-sm text-text-tertiary mt-1.5 hover:text-gold-text disabled:hover:text-text-tertiary">
            {canEdit ? '+ Aggiungi un brief' : 'Nessun brief.'}
          </button>}
    </div>
  )
}
// Gruppo di workstream (Continuative / A termine)
// Verdetto di salute del progetto
function Verdict({ tone, label, why, action }: {
  tone: 'error' | 'warning' | 'success' | 'neutral'
  label: string; why: string; action?: { label: string; run: () => void }
}) {
  const cls =
    tone === 'error' ? 'bg-error-dim border-error/30' :
    tone === 'warning' ? 'bg-warning-dim border-warning/30' :
    tone === 'success' ? 'bg-success-dim border-success/30' :
    'bg-surface border-border'
  const ink =
    tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning' :
    tone === 'success' ? 'text-success' : 'text-text-secondary'
  const Icon = tone === 'success' ? ShieldCheck : tone === 'neutral' ? Gauge : AlertTriangle
  return (
    <div className={`flex items-center gap-3 border rounded-2xl px-4 py-3 shadow-soft ${cls}`}>
      <Icon className={`w-5 h-5 shrink-0 ${ink}`} />
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-bold ${ink}`}>{label}</div>
        <div className="text-2xs text-text-secondary truncate">{why}</div>
      </div>
      {action && (
        <button onClick={action.run}
          className="flex items-center gap-1 text-2xs font-semibold text-text-primary underline underline-offset-2 shrink-0 hover:opacity-80">
          {action.label}<ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// Barra etichettata (lavoro fatto / tempo consumato)
function Meter({ label, value, tone, sub }: { label: string; value: number; tone: 'gold' | 'error' | 'neutral'; sub?: string }) {
  const fill = tone === 'gold' ? 'bg-gold' : tone === 'error' ? 'bg-error' : 'bg-text-tertiary'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xs font-semibold text-text-secondary">{label}</span>
        <span className="text-sm font-black tabular font-heading text-text-primary">{value}%</span>
      </div>
      <div className="h-2 bg-surface-active rounded-full overflow-hidden mt-1">
        <div className={`h-full rounded-full transition-all ${fill}`} style={{ width: `${value}%` }} />
      </div>
      {sub && <div className="text-2xs text-text-tertiary mt-1 truncate">{sub}</div>}
    </div>
  )
}

// Signal chip della Signal Bar — cliccabile: filtra la lista workstream
function Signal({ label, value, icon, tone, bar, sub, active, onClick }: {
  label: string; value: number | string; icon: React.ReactNode
  tone: 'error' | 'warning' | 'info' | 'gold' | 'neutral'; bar?: number; sub?: string
  active?: boolean; onClick?: () => void
}) {
  const toneCls =
    tone === 'error' ? 'bg-error-dim text-error' :
    tone === 'warning' ? 'bg-warning-dim text-warning' :
    tone === 'info' ? 'bg-info-dim text-info' :
    tone === 'gold' ? 'bg-surface text-gold-text' :
    'bg-surface text-text-tertiary'
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-2xl font-black tabular font-heading text-text-primary">{value}</span>
        <span className={tone === 'neutral' ? 'text-text-tertiary' : tone === 'gold' ? 'text-gold-text' : ''}>{icon}</span>
      </div>
      <div className="text-2xs text-text-tertiary mt-0.5 truncate">{label}</div>
      {bar !== undefined && (
        <div className="h-1 bg-surface-active rounded-full overflow-hidden mt-1.5"><div className="h-full bg-gold rounded-full" style={{ width: `${bar}%` }} /></div>
      )}
      {sub && <div className="text-2xs text-text-tertiary mt-1 truncate">{sub}</div>}
    </>
  )
  const base = `border rounded-2xl px-3.5 py-3 shadow-soft text-left ${tone === 'neutral' || tone === 'gold' ? 'bg-surface' : toneCls} ${
    active ? 'border-gold ring-1 ring-gold' : 'border-border'
  }`
  if (!onClick) return <div className={base}>{body}</div>
  return (
    <button onClick={onClick} aria-pressed={active} className={`${base} transition-colors hover:bg-surface-hover no-tap-highlight`}>
      {body}
      <span className="block text-2xs font-semibold text-text-tertiary mt-1">{active ? 'Filtro attivo — tocca per togliere' : 'Filtra'}</span>
    </button>
  )
}

// Menu ⋯ del progetto (elimina, con conferma a due passi)
function ProjectMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setConfirm(false) } }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => setOpen(o => !o)} aria-label="Opzioni progetto"
        className="p-2 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-surface-hover press">
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-60 bg-surface border border-border-strong rounded-2xl shadow-pop z-50 p-1.5 animate-scale-in">
          {!confirm ? (
            <button onClick={() => setConfirm(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-error hover:bg-error/10 transition-colors press">
              <Trash2 className="w-4 h-4" />Elimina progetto
            </button>
          ) : (
            <div className="p-2">
              <p className="text-2xs text-text-secondary mb-2 leading-snug">Eliminare l&apos;intero progetto con workstream, milestone e task? L&apos;azione sposta tutto nel cestino.</p>
              <div className="flex gap-2">
                <button onClick={() => { setConfirm(false); setOpen(false) }} className="flex-1 text-2xs font-semibold text-text-secondary px-2 py-1.5 rounded-lg border border-border">Annulla</button>
                <button onClick={() => { onDelete(); setOpen(false) }} className="flex-1 text-2xs font-semibold bg-error-dim text-error border border-error/40 px-2 py-1.5 rounded-lg press">Elimina</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const HEALTH_DOT: Record<string, string> = { red: 'bg-error', amber: 'bg-warning', green: 'bg-success', grey: 'bg-text-tertiary' }
const relDays = (iso: string) => {
  const d = Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime()) / 86400000)
  if (d < 0) return { text: `scaduta ${-d}g fa`, tone: 'text-error' }
  if (d === 0) return { text: 'oggi', tone: 'text-warning' }
  if (d <= 7) return { text: `tra ${d}g`, tone: 'text-warning' }
  return { text: iso.slice(5), tone: 'text-text-tertiary' }
}

// Gruppo workstream come RIGHE ricche
function WsGroup({ title, hint, items, onOpen, progress, health, nextMs, overdueOf, openOf, ownersOf }: {
  title: string; hint: string; items: ProjectWorkstream[]
  onOpen: (id: string) => void
  progress: (id: string) => number | null
  health: (id: string) => 'red' | 'amber' | 'green' | 'grey'
  nextMs: (id: string) => Milestone | undefined
  overdueOf: (id: string) => number
  openOf: (id: string) => number
  ownersOf: (id: string) => Person[]
}) {
  return (
    <section>
      <div className="mb-2 px-1">
        <h4 className="text-2xs font-bold uppercase tracking-wide text-text-tertiary">{title} · {items.length}</h4>
        <p className="text-2xs text-text-tertiary/70">{hint}</p>
      </div>
      <div className="rounded-2xl border border-border shadow-soft overflow-hidden divide-y divide-border">
        {items.map(w => {
          const pr = progress(w.id) ?? 0
          const nm = nextMs(w.id)
          const od = overdueOf(w.id)
          const owners = ownersOf(w.id).slice(0, 4)
          const rel = nm?.due_date ? relDays(nm.due_date) : null
          const h = health(w.id)
          return (
            <button key={w.id} onClick={() => onOpen(w.id)}
              className="w-full flex items-center gap-3 p-3 sm:p-3.5 text-left hover:bg-surface-hover transition-colors group no-tap-highlight bg-surface">
              {/* semaforo */}
              <span className={`w-1 self-stretch rounded-full shrink-0 ${HEALTH_DOT[h]}`} aria-hidden />
              {/* nome + tipo + date */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary truncate">{w.name}</span>
                  {w.workstream_type === 'recurring'
                    ? <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-success-dim text-success shrink-0">Continuativa</span>
                    : <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-surface-active text-text-tertiary shrink-0">A termine</span>}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {w.workstream_type === 'project' && (w.start_date || w.end_date) && (
                    <span className="text-2xs text-text-tertiary tabular">{w.start_date ?? '—'} → {w.end_date ?? '—'}</span>
                  )}
                  {nm && rel && (
                    <span className="text-2xs flex items-center gap-1">
                      <Flag className="w-3 h-3 text-info" /><span className="text-text-secondary truncate max-w-[140px]">{nm.title}</span>
                      <span className={rel.tone}>· {rel.text}</span>
                    </span>
                  )}
                  <span className="text-2xs text-text-tertiary flex items-center gap-1">
                    <CheckSquare className="w-3 h-3" /><span className="tabular">{openOf(w.id)}</span> aperte
                  </span>
                </div>
              </div>
              {/* progress */}
              <div className="hidden sm:flex items-center gap-2 w-28 shrink-0">
                <div className="h-1.5 bg-surface-active rounded-full overflow-hidden flex-1"><div className="h-full bg-gold rounded-full" style={{ width: `${pr}%` }} /></div>
                <span className="text-2xs text-text-tertiary tabular w-8 text-right">{pr}%</span>
              </div>
              {/* contatore ritardo */}
              {od > 0 && <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-error-dim text-error shrink-0 tabular">{od} in ritardo</span>}
              {/* avatar owner */}
              <div className="hidden sm:flex items-center shrink-0">
                {owners.map((p, i) => (
                  <span key={p.id} style={{ marginLeft: i ? -6 : 0 }} title={p.full_name}>
                    <Avatar name={p.full_name} url={p.avatar_url} size={24} />
                  </span>
                ))}
              </div>
              <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )
        })}
      </div>
    </section>
  )
}

// Modale creazione workstream — stessa grammatica del wizard progetto
function NewWorkstreamModal({ projectId, projectName, prefix, defaults, pending, onClose, onCreate }: {
  projectId: string; projectName: string; prefix: string | null
  defaults: { start: string | null; end: string | null }
  pending: boolean
  onClose: () => void
  onCreate: (input: { project_id: string; name: string; workstream_type: WorkstreamType; start_date?: string | null; end_date?: string | null }) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<WorkstreamType>('project')
  const [start, setStart] = useState(defaults.start ?? '')
  const [end, setEnd] = useState(defaults.end ?? '')

  const conform = prefix ? applyWorkstreamPrefix(prefix, name) : name
  const offConvention = !!prefix && !!name.trim() && name.trim() !== conform
  const badRange = !!start && !!end && end < start

  return (
    <ModalShell title="Nuova workstream" hint={projectName} icon={<FolderTree className="w-4 h-4 text-gold-text" />}
      onClose={onClose} pending={pending} canSubmit={!!name.trim() && !badRange}
      onSubmit={() => onCreate({
        project_id: projectId, name: name.trim(), workstream_type: type,
        start_date: type === 'project' ? start || null : null,
        end_date: type === 'project' ? end || null : null,
      })}>
      <div>
        <span className="block text-2xs font-semibold text-text-secondary mb-1.5">Tipo</span>
        <Segmented ariaLabel="Tipo workstream" value={type} onChange={setType}
          options={[{ value: 'project', label: 'A termine' }, { value: 'recurring', label: 'Continuativa' }]} />
        <p className="text-2xs text-text-tertiary mt-1.5">
          {type === 'project'
            ? 'Ha un inizio e una fine: compare come barra sul calendario milestone.'
            : 'Operatività continua: raccoglie le attività ricorrenti, senza data di fine.'}
        </p>
      </div>

      <Field label="Nome">
        <div className="flex gap-2">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input value={name} onChange={e => setName(e.target.value)} autoFocus className={inputCls}
            placeholder="Setup, Produzione, Reporting…" />
          {offConvention && (
            <button type="button" onClick={() => setName(conform)} title={`Riallinea a: ${conform}`}
              className="flex items-center gap-1.5 px-3 rounded-xl border border-border-interactive text-2xs font-semibold text-gold-text hover:bg-surface-hover shrink-0">
              <Wand2 className="w-3.5 h-3.5" />Convention
            </button>
          )}
        </div>
        {offConvention && <span className="block text-2xs text-text-tertiary mt-1.5 truncate">Convention: {conform}</span>}
      </Field>

      {type === 'project' && (
        <div>
          <span className="block text-2xs font-semibold text-text-secondary mb-1.5">Periodo</span>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" aria-label="Inizio" value={start} onChange={e => setStart(e.target.value)} className={inputCls} />
            <input type="date" aria-label="Fine" value={end} onChange={e => setEnd(e.target.value)} className={inputCls} />
          </div>
          {badRange
            ? <p className="flex items-center gap-1.5 text-2xs text-error mt-1.5"><AlertTriangle className="w-3.5 h-3.5" />La fine precede l&apos;inizio.</p>
            : <p className="text-2xs text-text-tertiary mt-1.5">Ereditate dal progetto: cambiale se questo filone ha un suo calendario.</p>}
        </div>
      )}
    </ModalShell>
  )
}

function Stat({ label, value, tone, icon, hint, onClick }: {
  label: string; value: number; tone?: 'error'; icon?: React.ReactNode; hint?: string; onClick?: () => void
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <div className={`text-2xl font-black tabular font-heading ${tone === 'error' ? 'text-error' : 'text-text-primary'}`}>{value}</div>
        {icon}
      </div>
      <div className="text-2xs text-text-tertiary mt-0.5 truncate">{label}</div>
      {hint && <div className={`text-2xs mt-0.5 truncate ${tone === 'error' ? 'text-error' : 'text-warning'}`}>{hint}</div>}
    </>
  )
  const cls = 'bg-surface border border-border rounded-2xl p-3.5 shadow-soft text-left'
  if (!onClick) return <div className={cls}>{body}</div>
  return <button onClick={onClick} className={`${cls} card-interactive no-tap-highlight w-full`}>{body}</button>
}
