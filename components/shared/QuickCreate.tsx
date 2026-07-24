'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, X, Briefcase, FolderTree, CheckSquare, ChevronDown, Loader2,
} from 'lucide-react'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { createAdHocTask } from '@/app/actions/ad-hoc-tasks'
import { createProjectTask } from '@/app/actions/tasks'
import { createWorkstream } from '@/app/actions/workstreams'
import type { WorkstreamType, Priority } from '@/lib/types/database'

type ClientOpt = { id: string; name: string }
type ProjectOpt = { id: string; name: string; client_id: string }
type PersonOpt = { id: string; full_name: string }
type WsOpt = { id: string; name: string }
type MsOpt = { id: string; title: string; milestone_type: string }

type Mode = null | 'project' | 'workstream' | 'task'

export function QuickCreate() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>(null)
  const [loaded, setLoaded] = useState(false)
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [projects, setProjects] = useState<ProjectOpt[]>([])
  const [profiles, setProfiles] = useState<PersonOpt[]>([])
  const [mounted, setMounted] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { setMounted(true) }, [])

  const ensureData = useCallback(async () => {
    if (loaded) return
    const sb = createBrowserClient()
    const [c, p, pr] = await Promise.all([
      sb.from('clients').select('id, company_name, display_name').order('company_name'),
      sb.from('projects').select('id, name, client_id').is('deleted_at', null).order('created_at', { ascending: false }),
      sb.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ])
    setClients((c.data ?? []).map((x: { id: string; company_name: string; display_name: string | null }) => ({ id: x.id, name: x.display_name || x.company_name })))
    setProjects((p.data ?? []) as ProjectOpt[])
    setProfiles((pr.data ?? []) as PersonOpt[])
    setLoaded(true)
  }, [loaded])

  const start = (m: Mode) => {
    setOpen(false)
    if (m === 'project') { router.push('/progetti?new=1'); return }
    ensureData(); setMode(m)
  }

  const toggleMenu = () => {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(o => !o)
  }

  return (
    <div className="contents">
      <button ref={btnRef} onClick={toggleMenu} aria-label="Crea" aria-expanded={open}
        className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gold text-on-gold text-sm font-semibold shadow-soft press no-tap-highlight">
        <Plus className="w-4 h-4" /><span className="hidden sm:inline">Crea</span>
      </button>

      {/* menu in portale: mai tagliato da overflow del layout */}
      {mounted && open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[59]" onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: rect.bottom + 8, left: Math.max(8, rect.right - 224) }}
            className="w-56 bg-surface border border-border-strong rounded-2xl shadow-pop z-[60] p-1.5 animate-scale-in">
            <MenuRow icon={<Briefcase className="w-4 h-4 text-gold-text" />} title="Nuovo progetto" hint="Con il wizard" onClick={() => start('project')} />
            <MenuRow icon={<FolderTree className="w-4 h-4 text-gold-text" />} title="Nuovo workstream" hint="In un progetto" onClick={() => start('workstream')} />
            <MenuRow icon={<CheckSquare className="w-4 h-4 text-gold-text" />} title="Nuova task" hint="Ad hoc o in progetto" onClick={() => start('task')} />
          </div>
        </>,
        document.body,
      )}

      {mode === 'workstream' && (
        <WorkstreamModal projects={projects} onClose={() => setMode(null)} onDone={() => { setMode(null); router.refresh() }} />
      )}
      {mode === 'task' && (
        <TaskModal clients={clients} projects={projects} profiles={profiles}
          onClose={() => setMode(null)} onDone={() => { setMode(null); router.refresh() }} />
      )}
    </div>
  )
}

function MenuRow({ icon, title, hint, onClick }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-surface-hover transition-colors press">
      <span className="w-8 h-8 rounded-lg bg-gold-dim flex items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-text-primary truncate">{title}</div>
        <div className="text-2xs text-text-tertiary truncate">{hint}</div>
      </div>
    </button>
  )
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-scrim sm:p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md p-4 space-y-3 shadow-pop animate-slide-up pb-safe" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

const fieldCls = 'w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary'

function WorkstreamModal({ projects, onClose, onDone }: { projects: ProjectOpt[]; onClose: () => void; onDone: () => void }) {
  const [pending, start] = useTransition()
  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<WorkstreamType>('project')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const submit = () => start(async () => {
    try {
      await createWorkstream({ project_id: projectId, name, workstream_type: type, start_date: startDate || null, end_date: endDate || null })
      toast.success('Workstream creato'); onDone()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  return (
    <Shell title="Nuovo workstream" onClose={onClose}>
      <Field label="Progetto">
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className={fieldCls}>
          <option value="">— seleziona progetto —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setType('project')} className={`p-2.5 rounded-xl border text-left ${type === 'project' ? 'border-gold bg-surface-active' : 'border-border'}`}>
          <div className="text-sm font-semibold text-text-primary">A termine</div><div className="text-2xs text-text-tertiary">Con date</div>
        </button>
        <button type="button" onClick={() => setType('recurring')} className={`p-2.5 rounded-xl border text-left ${type === 'recurring' ? 'border-gold bg-surface-active' : 'border-border'}`}>
          <div className="text-sm font-semibold text-text-primary">Continuativa</div><div className="text-2xs text-text-tertiary">Ricorrente</div>
        </button>
      </div>
      <Field label="Nome"><input value={name} onChange={e => setName(e.target.value)} autoFocus className={fieldCls} /></Field>
      {type === 'project' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Inizio"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={fieldCls} /></Field>
          <Field label="Fine"><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={fieldCls} /></Field>
        </div>
      )}
      <Actions pending={pending} disabled={!projectId || !name.trim()} onClose={onClose} onSubmit={submit} />
    </Shell>
  )
}

function TaskModal({ clients, projects, profiles, onClose, onDone }: {
  clients: ClientOpt[]; projects: ProjectOpt[]; profiles: PersonOpt[]; onClose: () => void; onDone: () => void
}) {
  const [pending, start] = useTransition()
  const [kind, setKind] = useState<'adhoc' | 'project'>('adhoc')
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<Priority>('media')
  const [dueDate, setDueDate] = useState('')
  // ad hoc
  const [clientId, setClientId] = useState('')
  const [clientVisible, setClientVisible] = useState(false)
  // progetto
  const [projectId, setProjectId] = useState('')
  const [wsId, setWsId] = useState('')
  const [msId, setMsId] = useState('')
  const [ws, setWs] = useState<WsOpt[]>([])
  const [ms, setMs] = useState<MsOpt[]>([])
  const [loadingWs, setLoadingWs] = useState(false)
  const [loadingMs, setLoadingMs] = useState(false)

  // cascata progetto → workstream
  useEffect(() => {
    if (kind !== 'project' || !projectId) { setWs([]); setWsId(''); return }
    setLoadingWs(true)
    createBrowserClient().from('project_workstreams').select('id, name').eq('project_id', projectId).order('sort_order')
      .then(({ data }) => { setWs((data ?? []) as WsOpt[]); setLoadingWs(false) })
  }, [kind, projectId])
  // cascata workstream → milestone
  useEffect(() => {
    if (!wsId) { setMs([]); setMsId(''); return }
    setLoadingMs(true)
    createBrowserClient().from('milestones').select('id, title, milestone_type').eq('workstream_id', wsId).order('sort_order')
      .then(({ data }) => {
        const list = (data ?? []) as MsOpt[]
        setMs(list)
        // default: prima milestone di consegna, altrimenti la prima (sistema)
        setMsId(list.find(m => m.milestone_type === 'delivery')?.id ?? list[0]?.id ?? '')
        setLoadingMs(false)
      })
  }, [wsId])

  const projClientId = projects.find(p => p.id === projectId)?.client_id ?? ''

  const submit = () => start(async () => {
    try {
      if (kind === 'adhoc') {
        await createAdHocTask({ client_id: clientId, title, assignee_id: assignee || null, due_date: dueDate || null, priority, visibility: clientVisible ? 'client_visible' : 'internal' })
      } else {
        await createProjectTask({ client_id: projClientId, project_id: projectId, workstream_id: wsId, milestone_id: msId, title, assignee_id: assignee || null, due_date: dueDate || null, priority })
      }
      toast.success('Task creata'); onDone()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const canSubmit = title.trim() && (kind === 'adhoc' ? !!clientId : (!!projectId && !!wsId && !!msId))

  return (
    <Shell title="Nuova task" onClose={onClose}>
      {/* switch tipo */}
      <div className="flex bg-surface-active rounded-lg p-0.5">
        {([['adhoc', 'Ad hoc (cliente)'], ['project', 'In un progetto']] as const).map(([k, lab]) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`flex-1 py-1.5 rounded-md text-2xs font-semibold ${kind === k ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary'}`}>{lab}</button>
        ))}
      </div>

      {kind === 'adhoc' ? (
        <>
          <Field label="Cliente">
            <select value={clientId} onChange={e => setClientId(e.target.value)} className={fieldCls}>
              <option value="">— seleziona cliente —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-2xs text-text-secondary">
            <input type="checkbox" checked={clientVisible} onChange={e => setClientVisible(e.target.checked)} />
            Assegna/visibile al cliente (compare tra le task cliente)
          </label>
        </>
      ) : (
        <>
          <Field label="Progetto">
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className={fieldCls}>
              <option value="">— seleziona progetto —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          {projectId && (
            <Field label="Workstream">
              <select value={wsId} onChange={e => setWsId(e.target.value)} disabled={loadingWs} className={fieldCls}>
                <option value="">{loadingWs ? 'Carico…' : '— seleziona —'}</option>
                {ws.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
          )}
          {wsId && (
            <Field label="Milestone">
              <select value={msId} onChange={e => setMsId(e.target.value)} disabled={loadingMs} className={fieldCls}>
                {loadingMs && <option value="">Carico…</option>}
                {ms.map(m => <option key={m.id} value={m.id}>{m.title}{m.milestone_type === 'system' ? ' (operatività)' : ''}</option>)}
              </select>
            </Field>
          )}
        </>
      )}

      <Field label="Titolo"><input value={title} onChange={e => setTitle(e.target.value)} autoFocus className={fieldCls} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Assegnatario">
          <select value={assignee} onChange={e => setAssignee(e.target.value)} className={fieldCls}>
            <option value="">—</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </Field>
        <Field label="Scadenza"><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={fieldCls} /></Field>
      </div>
      <Field label="Priorità">
        <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className={fieldCls}>
          {(['alta', 'media', 'bassa'] as Priority[]).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>

      <Actions pending={pending} disabled={!canSubmit} onClose={onClose} onSubmit={submit} />
    </Shell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-2xs font-semibold text-text-secondary mb-1">{label}</span>{children}</label>
}
function Actions({ pending, disabled, onClose, onSubmit }: { pending: boolean; disabled: boolean; onClose: () => void; onSubmit: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button onClick={onClose} className="text-2xs font-semibold text-text-secondary px-3 py-1.5">Annulla</button>
      <button onClick={onSubmit} disabled={pending || disabled} className="flex items-center gap-1 text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded-lg disabled:opacity-40">
        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Crea
      </button>
    </div>
  )
}
