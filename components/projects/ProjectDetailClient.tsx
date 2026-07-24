'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, FolderTree, Flag, Repeat, ChevronDown, ChevronRight,
  Calendar,
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
const MS_TONE: Record<string, string> = {
  da_fare: 'text-text-tertiary', in_corso: 'text-info', in_approvazione: 'text-warning', completata: 'text-success',
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
              <Link href={`/clienti/${project.client_id}`} className="text-gold-text hover:underline">{clientName}</Link>
              <span className="text-text-tertiary text-xs uppercase">{project.area} · {project.service_type}{project.service_subtype ? `/${project.service_subtype}` : ''}</span>
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
          <div className="space-y-5 max-w-3xl">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Sottoprogetti" value={workstreams.length} />
              <Stat label="Milestone aperte" value={openMs.length} />
              <Stat label="Task aperte" value={openTasks.length} />
              <Stat label="Task scadute" value={overdue.length} tone={overdue.length ? 'error' : undefined} />
            </div>
            {project.description && <p className="text-sm text-text-secondary">{project.description}</p>}
            <div className="bg-surface border border-border rounded-lg p-4">
              <div className="text-2xs font-semibold text-text-tertiary mb-1">Prossima milestone</div>
              {nextMs ? (
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-info" />
                  <span className="text-sm text-text-primary">{nextMs.title}</span>
                  {nextMs.due_date && <span className="text-2xs text-text-tertiary ml-auto">{nextMs.due_date}</span>}
                </div>
              ) : <p className="text-sm text-text-tertiary">Nessuna milestone di consegna programmata.</p>}
            </div>
            <div className="text-2xs text-text-tertiary flex items-center gap-2">
              <Repeat className="w-3.5 h-3.5 text-success" />{recurring.filter(r => r.active).length} template ricorrenti attivi ·
              <span>{memberIds.length} membri nel team</span>
            </div>
          </div>
        )}

        {tab === 'sottoprogetti' && (
          <div className="space-y-3 max-w-3xl">
            {workstreams.length === 0 && <Empty text="Nessun sottoprogetto." />}
            {workstreams.map(w => (
              <WorkstreamCard key={w.id} ws={w}
                milestones={milestones.filter(m => m.workstream_id === w.id)}
                tasks={tasks} recurring={recurring.filter(r => r.workstream_id === w.id)} name={name} />
            ))}
          </div>
        )}

        {tab === 'milestone' && (
          <div className="max-w-3xl border border-border rounded-lg divide-y divide-border">
            {milestones.length === 0 && <div className="p-4"><Empty text="Nessuna milestone." /></div>}
            {milestones.map(m => {
              const ws = workstreams.find(w => w.id === m.workstream_id)
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Flag className={`w-4 h-4 ${m.milestone_type === 'system' ? 'text-text-tertiary' : 'text-info'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">{m.title}</div>
                    <div className="text-2xs text-text-tertiary">{ws?.name}{m.milestone_type === 'system' ? ' · sistema' : ''}</div>
                  </div>
                  {m.due_date && <span className="text-2xs text-text-tertiary">{m.due_date}</span>}
                  <span className={`text-2xs font-semibold ${MS_TONE[m.status]}`}>{m.status}</span>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'task' && (
          <div className="space-y-3">
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
  return (
    <div className="bg-surface border border-border rounded-lg">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 p-3 text-left">
        {open ? <ChevronDown className="w-4 h-4 text-text-secondary" /> : <ChevronRight className="w-4 h-4 text-text-secondary" />}
        <FolderTree className="w-4 h-4 text-gold-text" />
        <span className="flex-1 text-sm font-semibold text-text-primary">{ws.name}</span>
        <span className="text-2xs text-text-tertiary">{ws.workstream_type === 'recurring' ? 'Continuativa' : 'Una tantum'}</span>
        {ws.owner_id && <span className="text-2xs text-text-tertiary">{name(ws.owner_id)}</span>}
      </button>
      {open && (
        <div className="border-t border-border p-3 space-y-1">
          {milestones.map(m => {
            const mt = tasks.filter(t => t.milestone_id === m.id)
            return (
              <div key={m.id} className="flex items-center gap-2 py-0.5">
                <Flag className={`w-3.5 h-3.5 ${m.milestone_type === 'system' ? 'text-text-tertiary' : 'text-info'}`} />
                <span className="flex-1 text-sm text-text-primary">{m.title}</span>
                <span className="text-2xs text-text-tertiary">{mt.length} task</span>
                <span className={`text-2xs font-semibold ${MS_TONE[m.status]}`}>{m.status}</span>
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

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'error' }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-3.5 shadow-soft">
      <div className={`text-2xl font-black tabular font-heading ${tone === 'error' ? 'text-error' : 'text-text-primary'}`}>{value}</div>
      <div className="text-2xs text-text-tertiary mt-0.5">{label}</div>
    </div>
  )
}
function Empty({ text }: { text: string }) {
  return <p className="text-sm text-text-tertiary text-center py-8">{text}</p>
}
