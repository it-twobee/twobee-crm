'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, FolderTree, Flag, Repeat, ChevronDown, ChevronRight,
  Calendar, ListChecks, AlertTriangle, CheckSquare, Users, Clock,
} from 'lucide-react'
import { updateProjectStatus } from '@/app/actions/projects'
import { generateRecurringNow } from '@/app/actions/tasks'
import { TaskViews } from './TaskViews'
import type {
  Project, ProjectWorkstream, Milestone, Task, RecurringTaskTemplate, ProjectStatus,
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
  backHref = '/progetti', canManageProject = true, canEditTasks = true,
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
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [tab, setTab] = useState<'panoramica' | 'sottoprogetti' | 'milestone' | 'task'>('panoramica')

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
            <h1 className="text-2xl sm:text-3xl font-black text-text-primary font-heading break-words">{project.name}</h1>
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
        {(['panoramica', 'sottoprogetti', 'milestone', 'task'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3.5 text-sm font-semibold border-b-2 whitespace-nowrap capitalize transition-colors ${
              tab === t ? 'border-gold text-gold-text' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}>{t}</button>
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
                <Stat label="Sottoprogetti" value={workstreams.length} icon={<FolderTree className="w-4 h-4 text-gold-text" />} />
                <Stat label="Milestone aperte" value={openMs.length} icon={<Flag className="w-4 h-4 text-info" />} />
                <Stat label="Task aperte" value={openTasks.length} icon={<ListChecks className="w-4 h-4 text-text-secondary" />} />
                <Stat label="Task scadute" value={overdue.length} tone={overdue.length ? 'error' : undefined} icon={<AlertTriangle className={`w-4 h-4 ${overdue.length ? 'text-error' : 'text-text-tertiary'}`} />} />
              </div>
            </div>

            {project.description && (
              <p className="text-sm text-text-secondary bg-surface border border-border rounded-2xl p-4 shadow-soft">{project.description}</p>
            )}

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
                      <button key={t.id} onClick={() => { setTab('task') }}
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

            {/* sottoprogetti preview */}
            {workstreams.length > 0 && (
              <section className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-gold-text" />
                    <h3 className="text-sm font-bold text-text-primary">Sottoprogetti</h3>
                  </div>
                  <button onClick={() => setTab('sottoprogetti')} className="text-2xs font-semibold text-gold-text hover:opacity-80 flex items-center gap-0.5">
                    Vedi tutti<ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {workstreams.slice(0, 6).map(w => {
                    const pr = wsProgress(w.id)
                    return (
                      <button key={w.id} onClick={() => setTab('sottoprogetti')}
                        className="card-interactive bg-background border border-border rounded-xl p-3 text-left no-tap-highlight">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-text-primary truncate flex-1">{w.name}</span>
                          <span className="text-2xs text-text-tertiary shrink-0">{w.workstream_type === 'recurring' ? 'Continuativa' : 'Una tantum'}</span>
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

        {tab === 'sottoprogetti' && (
          <div className="max-w-6xl animate-fade-in">
            {workstreams.length === 0 ? <Empty text="Nessun sottoprogetto." /> : (
              <div className="grid gap-3 lg:grid-cols-2">
                {workstreams.map(w => (
                  <WorkstreamCard key={w.id} ws={w}
                    milestones={milestones.filter(m => m.workstream_id === w.id)}
                    tasks={tasks} recurring={recurring.filter(r => r.workstream_id === w.id)} name={name} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'milestone' && (
          <div className="max-w-6xl space-y-5 animate-fade-in">
            {milestones.length === 0 && <Empty text="Nessuna milestone." />}
            {workstreams.map(w => {
              const wsMs = milestones.filter(m => m.workstream_id === w.id)
              if (wsMs.length === 0) return null
              return (
                <section key={w.id}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <FolderTree className="w-3.5 h-3.5 text-gold-text" />
                    <h3 className="text-2xs font-bold uppercase tracking-wide text-text-tertiary">{w.name}</h3>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {wsMs.map(m => {
                      const mt = tasks.filter(t => t.milestone_id === m.id)
                      const mdone = mt.filter(t => t.status === 'completato').length
                      return (
                        <div key={m.id} className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
                          <div className="flex items-start gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.milestone_type === 'system' ? 'bg-surface-active' : 'bg-info-dim'}`}>
                              <Flag className={`w-4 h-4 ${m.milestone_type === 'system' ? 'text-text-tertiary' : 'text-info'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-text-primary truncate flex-1">{m.title}</span>
                                <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${MS_BADGE[m.status]}`}>{MS_LABEL[m.status]}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-2xs text-text-tertiary">
                                {m.milestone_type === 'system'
                                  ? <span className="px-1.5 py-0.5 rounded bg-surface-active">Sistema</span>
                                  : <span className="px-1.5 py-0.5 rounded bg-info-dim text-info">Consegna</span>}
                                <span className="tabular">{mdone}/{mt.length} task</span>
                                {m.due_date && <span className="ml-auto tabular">{m.due_date}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {tab === 'task' && (
          <div className="space-y-3 max-w-6xl animate-fade-in">
            {recurring.some(r => r.active) && (
              <div className="flex justify-end">
                <button onClick={genRecurring} disabled={pending}
                  className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80">
                  <Repeat className="w-3.5 h-3.5" />Genera occorrenze ricorrenti ora
                </button>
              </div>
            )}
            <TaskViews tasks={tasks} workstreams={workstreams} milestones={milestones}
              profiles={profiles} canEdit={canEditTasks} projectId={project.id} clientId={project.client_id} />
          </div>
        )}
      </div>
    </div>
  )
}

function WorkstreamCard({
  ws, milestones, tasks, recurring, name,
}: {
  ws: ProjectWorkstream
  milestones: Milestone[]
  tasks: Task[]
  recurring: RecurringTaskTemplate[]
  name: (id: string | null) => string
}) {
  const [open, setOpen] = useState(true)
  const recurringBadge = ws.workstream_type === 'recurring'
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-soft self-start">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 p-3.5 text-left">
        {open ? <ChevronDown className="w-4 h-4 text-text-tertiary" /> : <ChevronRight className="w-4 h-4 text-text-tertiary" />}
        <FolderTree className="w-4 h-4 text-gold-text shrink-0" />
        <span className="flex-1 text-sm font-semibold text-text-primary truncate">{ws.name}</span>
        {ws.owner_id && <span className="text-2xs text-text-tertiary hidden sm:inline truncate max-w-[90px]">{name(ws.owner_id)}</span>}
        <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${recurringBadge ? 'bg-success-dim text-success' : 'bg-surface-active text-text-tertiary'}`}>
          {recurringBadge ? 'Continuativa' : 'Una tantum'}
        </span>
      </button>
      {open && (
        <div className="border-t border-border p-3 space-y-1">
          {milestones.map(m => {
            const mt = tasks.filter(t => t.milestone_id === m.id)
            return (
              <div key={m.id} className="flex items-center gap-2 py-0.5">
                <Flag className={`w-3.5 h-3.5 shrink-0 ${m.milestone_type === 'system' ? 'text-text-tertiary' : 'text-info'}`} />
                <span className="flex-1 text-sm text-text-primary truncate">{m.title}</span>
                <span className="text-2xs text-text-tertiary shrink-0">{mt.length} task</span>
                <span className={`text-2xs font-semibold shrink-0 ${MS_TONE[m.status]}`}>{MS_LABEL[m.status]}</span>
              </div>
            )
          })}
          {recurring.map(r => (
            <div key={r.id} className="flex items-center gap-2 py-0.5 pl-5">
              <Repeat className="w-3.5 h-3.5 text-success" />
              <span className="flex-1 text-sm text-text-primary">{r.title}</span>
              <span className="text-2xs text-success">{r.frequency}</span>
              {r.visibility === 'client_visible' && <span className="text-2xs text-info">cliente</span>}
              {!r.active && <span className="text-2xs text-text-tertiary">pausa</span>}
            </div>
          ))}
          {milestones.length === 0 && recurring.length === 0 && <p className="text-2xs text-text-tertiary">Vuoto.</p>}
        </div>
      )}
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
function Empty({ text }: { text: string }) {
  return <p className="text-sm text-text-tertiary text-center py-8">{text}</p>
}
