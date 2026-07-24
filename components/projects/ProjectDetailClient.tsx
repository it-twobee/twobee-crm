'use client'

import { useState, useMemo, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, FolderTree, Flag, Repeat, ChevronRight,
  Calendar, ListChecks, AlertTriangle, CheckSquare, Users, Clock, Plus, Pencil, Check, X, Trash2,
  MoreHorizontal,
} from 'lucide-react'
import { updateProjectStatus, updateProjectBrief, deleteProject } from '@/app/actions/projects'
import { generateRecurringNow } from '@/app/actions/tasks'
import { createWorkstream } from '@/app/actions/workstreams'
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

  const wsBase = `${backHref.replace(/\/$/, '')}/${project.id}/workstream`
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
  const upcoming = [...tasks]
    .filter(t => t.due_date && t.status !== 'completato')
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    .slice(0, 5)
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
              <Link href={`/clienti/${project.client_id}`} className="text-gold-text hover:underline font-medium">{clientName}</Link>
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
          <div className="space-y-5 max-w-6xl animate-fade-in">
            {/* progress + stat */}
            <div className="grid gap-3 lg:grid-cols-3">
              {/* barra avanzamento */}
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft lg:col-span-1 flex flex-col justify-center">
                <div className="flex items-end justify-between mb-2">
                  <span className="text-2xs font-semibold text-text-tertiary uppercase tracking-wide">Avanzamento</span>
                  <span className="text-2xl font-black tabular font-heading text-text-primary">{progress}%</span>
                </div>
                <div className="h-2 bg-surface-active rounded-full overflow-hidden">
                  <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-2xs text-text-tertiary mt-2">{doneTasks}/{totalTasks} task completate</span>
              </div>
              {/* stat */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:col-span-2">
                <Stat label="Workstream" value={workstreams.length} icon={<FolderTree className="w-4 h-4 text-gold-text" />} />
                <Stat label="Milestone aperte" value={openMs.length} icon={<Flag className="w-4 h-4 text-info" />} />
                <Stat label="Task aperte" value={openTasks.length} icon={<ListChecks className="w-4 h-4 text-text-secondary" />} />
                <Stat label="Task scadute" value={overdue.length} tone={overdue.length ? 'error' : undefined} icon={<AlertTriangle className={`w-4 h-4 ${overdue.length ? 'text-error' : 'text-text-tertiary'}`} />} />
              </div>
            </div>

            {/* Brief del progetto — editabile/cancellabile */}
            <ProjectBrief projectId={project.id} initial={project.description} canEdit={canManageProject} />


            <div className="grid gap-4 lg:grid-cols-2">
              {/* prossime scadenze */}
              <section className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-warning" />
                  <h3 className="text-sm font-bold text-text-primary">Prossime scadenze</h3>
                </div>
                {upcoming.length === 0 ? (
                  <p className="text-2xs text-text-tertiary">Nessuna task in scadenza.</p>
                ) : (
                  <div className="space-y-1.5">
                    {upcoming.map(t => (
                      <button key={t.id} onClick={() => t.workstream_id && openWorkstream(t.workstream_id)}
                        className="w-full flex items-center gap-2 text-left group">
                        <CheckSquare className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                        <span className="flex-1 text-sm text-text-primary truncate">{t.title}</span>
                        {isOverdue(t) && <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0" />}
                        <span className={`text-2xs tabular shrink-0 ${isOverdue(t) ? 'text-error' : 'text-text-tertiary'}`}>{t.due_date}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* prossima milestone + ricorrenti */}
              <section className="bg-surface border border-border rounded-2xl p-4 shadow-soft space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Flag className="w-4 h-4 text-info" />
                    <h3 className="text-sm font-bold text-text-primary">Prossima milestone</h3>
                  </div>
                  {nextMs ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-primary">{nextMs.title}</span>
                      {nextMs.due_date && <span className="text-2xs text-text-tertiary ml-auto tabular">{nextMs.due_date}</span>}
                    </div>
                  ) : <p className="text-2xs text-text-tertiary">Nessuna milestone di consegna programmata.</p>}
                </div>
                <div className="flex items-center gap-2 text-2xs text-text-tertiary pt-2 border-t border-border">
                  <Repeat className="w-3.5 h-3.5 text-success" />
                  <span className="tabular font-semibold text-text-secondary">{recurring.filter(r => r.active).length}</span> ricorrenti attivi
                </div>
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
                  {workstreams.slice(0, 6).map(w => {
                    const pr = wsProgress(w.id)
                    return (
                      <button key={w.id} onClick={() => openWorkstream(w.id)}
                        className="card-interactive bg-background border border-border rounded-xl p-3 text-left no-tap-highlight">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-text-primary truncate flex-1">{w.name}</span>
                          <span className="text-2xs text-text-tertiary shrink-0">{w.workstream_type === 'recurring' ? 'Continuativa' : 'A termine'}</span>
                        </div>
                        {pr !== null && (
                          <div className="h-1 bg-surface-active rounded-full overflow-hidden mt-2">
                            <div className="h-full bg-gold rounded-full" style={{ width: `${pr}%` }} />
                          </div>
                        )}
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
                </div>
                <div className="flex flex-wrap gap-2">
                  {teamMembers.map(p => (
                    <div key={p.id} className="flex items-center gap-2 bg-background border border-border rounded-full pl-1 pr-3 py-1">
                      <div className="w-6 h-6 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-2xs font-bold text-gold-text shrink-0">
                        {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full rounded-full object-cover" alt="" /> : (p.full_name || '?')[0].toUpperCase()}
                      </div>
                      <span className="text-2xs text-text-secondary">{p.full_name}{p.id === project.manager_id ? ' · PM' : ''}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'workstream' && (
          <div className="max-w-6xl space-y-5 animate-fade-in">
            {/* ── Signal Bar ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <Signal label="In ritardo" value={overdue.length} icon={<AlertTriangle className="w-4 h-4" />} tone={overdue.length ? 'error' : 'neutral'} />
              <Signal label="Scade ≤ 7 giorni" value={dueSoon.length} icon={<Clock className="w-4 h-4" />} tone={dueSoon.length ? 'warning' : 'neutral'} />
              <Signal label="Non assegnate" value={unassigned.length} icon={<Users className="w-4 h-4" />} tone={unassigned.length ? 'info' : 'neutral'} />
              <Signal label="Avanzamento" value={`${progress}%`} icon={<ListChecks className="w-4 h-4" />} tone="gold" bar={progress}
                sub={nextDelivery ? `Prossima: ${nextDelivery.title}` : undefined} />
            </div>

            {/* ── Calendario milestone a swimlane ── */}
            <ProjectGantt workstreams={workstreams} milestones={milestones} tasks={tasks} profiles={profiles} onOpenMilestone={openMilestone} />

            {/* ── toolbar ── */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <h3 className="text-xl font-bold text-text-primary font-heading">Workstream <span className="text-text-tertiary text-sm font-sans">· {workstreams.length}</span></h3>
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

            {/* Continuative */}
            {recurringWs.length > 0 && (
              <WsGroup title="Continuative" hint="Attività ricorrenti senza fine definita"
                items={recurringWs} onOpen={openWorkstream} progress={wsProgress}
                health={wsHealth} nextMs={wsNextMilestone} overdueOf={wsOverdueCount} ownersOf={wsOwners} />
            )}
            {/* A termine */}
            {projectWs.length > 0 && (
              <WsGroup title="A termine" hint="Con data di inizio e fine"
                items={projectWs} onOpen={openWorkstream} progress={wsProgress}
                health={wsHealth} nextMs={wsNextMilestone} overdueOf={wsOverdueCount} ownersOf={wsOwners} />
            )}
          </div>
        )}
      </div>

      {creatingWs && (
        <NewWorkstreamModal projectId={project.id} pending={pending}
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
// Signal chip della Signal Bar
function Signal({ label, value, icon, tone, bar, sub }: {
  label: string; value: number | string; icon: React.ReactNode
  tone: 'error' | 'warning' | 'info' | 'gold' | 'neutral'; bar?: number; sub?: string
}) {
  const toneCls =
    tone === 'error' ? 'bg-error-dim text-error' :
    tone === 'warning' ? 'bg-warning-dim text-warning' :
    tone === 'info' ? 'bg-info-dim text-info' :
    tone === 'gold' ? 'bg-surface text-gold-text' :
    'bg-surface text-text-tertiary'
  return (
    <div className={`border border-border rounded-2xl px-3.5 py-3 shadow-soft ${tone === 'neutral' || tone === 'gold' ? 'bg-surface' : toneCls}`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl font-black tabular font-heading text-text-primary">{value}</span>
        <span className={tone === 'neutral' ? 'text-text-tertiary' : tone === 'gold' ? 'text-gold-text' : ''}>{icon}</span>
      </div>
      <div className="text-2xs text-text-tertiary mt-0.5 truncate">{label}</div>
      {bar !== undefined && (
        <div className="h-1 bg-surface-active rounded-full overflow-hidden mt-1.5"><div className="h-full bg-gold rounded-full" style={{ width: `${bar}%` }} /></div>
      )}
      {sub && <div className="text-2xs text-text-tertiary mt-1 truncate">{sub}</div>}
    </div>
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
function WsGroup({ title, hint, items, onOpen, progress, health, nextMs, overdueOf, ownersOf }: {
  title: string; hint: string; items: ProjectWorkstream[]
  onOpen: (id: string) => void
  progress: (id: string) => number | null
  health: (id: string) => 'red' | 'amber' | 'green' | 'grey'
  nextMs: (id: string) => Milestone | undefined
  overdueOf: (id: string) => number
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
                <div className="flex items-center gap-2 mt-1">
                  {w.workstream_type === 'project' && (w.start_date || w.end_date) && (
                    <span className="text-2xs text-text-tertiary tabular">{w.start_date ?? '—'} → {w.end_date ?? '—'}</span>
                  )}
                  {nm && rel && (
                    <span className="text-2xs flex items-center gap-1">
                      <Flag className="w-3 h-3 text-info" /><span className="text-text-secondary truncate max-w-[140px]">{nm.title}</span>
                      <span className={rel.tone}>· {rel.text}</span>
                    </span>
                  )}
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
                  <span key={p.id} style={{ marginLeft: i ? -6 : 0 }}
                    className="w-6 h-6 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-2xs font-bold text-gold-text overflow-hidden" title={p.full_name}>
                    {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : p.full_name[0].toUpperCase()}
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

// Modale creazione workstream
function NewWorkstreamModal({ projectId, pending, onClose, onCreate }: {
  projectId: string; pending: boolean
  onClose: () => void
  onCreate: (input: { project_id: string; name: string; workstream_type: WorkstreamType; start_date?: string | null; end_date?: string | null }) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<WorkstreamType>('project')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-scrim sm:p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md p-4 space-y-3 shadow-pop animate-slide-up pb-safe" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary">Nuova workstream</h3>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setType('project')} className={`p-3 rounded-xl border text-left ${type === 'project' ? 'border-gold bg-surface-active' : 'border-border hover:bg-surface-hover'}`}>
            <div className="text-sm font-semibold text-text-primary">A termine</div>
            <div className="text-2xs text-text-tertiary">Con inizio e fine</div>
          </button>
          <button onClick={() => setType('recurring')} className={`p-3 rounded-xl border text-left ${type === 'recurring' ? 'border-gold bg-surface-active' : 'border-border hover:bg-surface-hover'}`}>
            <div className="text-sm font-semibold text-text-primary">Continuativa</div>
            <div className="text-2xs text-text-tertiary">Ricorrente, senza fine</div>
          </button>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Nome workstream"
          className="w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary" />
        {type === 'project' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="text-2xs font-semibold text-text-secondary">Inizio</span>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-full bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-sm text-text-primary mt-1" /></label>
            <label className="block"><span className="text-2xs font-semibold text-text-secondary">Fine</span>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-full bg-background border border-border-interactive rounded-lg px-2 py-1.5 text-sm text-text-primary mt-1" /></label>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-2xs font-semibold text-text-secondary px-3 py-1.5">Annulla</button>
          <button disabled={pending || !name.trim()}
            onClick={() => onCreate({ project_id: projectId, name, workstream_type: type, start_date: start || null, end_date: end || null })}
            className="text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg disabled:opacity-40">Crea</button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone, icon }: { label: string; value: number; tone?: 'error'; icon?: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-3.5 shadow-soft">
      <div className="flex items-center justify-between">
        <div className={`text-2xl font-black tabular font-heading ${tone === 'error' ? 'text-error' : 'text-text-primary'}`}>{value}</div>
        {icon}
      </div>
      <div className="text-2xs text-text-tertiary mt-0.5">{label}</div>
    </div>
  )
}
