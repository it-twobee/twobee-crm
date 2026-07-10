'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, FolderKanban, Flag, ListChecks, ChevronDown, Loader2, Zap, GitBranch, Users2,
} from 'lucide-react'
import {
  createProjectWs, createSprintWs, createMilestoneWs, createTaskWs,
} from '@/app/actions/workspace-create'

type Mode = 'project' | 'sprint' | 'milestone' | 'task' | null
interface ProjectRef { id: string; name: string; client_id: string | null }
interface Client { id: string; company_name: string }
interface PersonRef { id: string; full_name: string | null }

const inputCls = 'w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold'
const labelCls = 'text-2xs font-semibold text-text-tertiary uppercase tracking-wider'

export function WorkspaceQuickCreate({ clients, projects, profiles = [] }: {
  clients: Client[]
  projects: ProjectRef[]
  profiles?: PersonRef[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(null)
  const [open, setOpen] = useState(false)
  const [projectList, setProjectList] = useState<ProjectRef[]>(projects)

  // Dopo router.refresh() i prop aggiornati portano i progetti creati altrove:
  // riallineo la lista mantenendo eventuali aggiunte locali non ancora nei prop.
  useEffect(() => {
    setProjectList(prev => {
      const ids = new Set(projects.map(p => p.id))
      return [...prev.filter(p => !ids.has(p.id)), ...projects]
    })
  }, [projects])

  const done = () => { setMode(null); router.refresh() }
  const addProjectLocal = (p: { id: string; name: string; client_id: string }) =>
    setProjectList(prev => [{ id: p.id, name: p.name, client_id: p.client_id }, ...prev])

  return (
    <>
      <div className="relative">
        <button onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gold text-on-gold rounded-xl text-sm font-bold hover:bg-gold/90 transition-colors">
          <Plus className="w-4 h-4" /> Crea <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
            <div className="absolute right-0 top-full mt-1 w-60 rounded-xl border border-border bg-surface p-1 z-20 shadow-xl">
              <p className="px-3 pt-2 pb-1 text-2xs font-semibold text-text-tertiary uppercase tracking-wider">Catena di delivery</p>
              <MenuItem icon={<FolderKanban className="w-4 h-4" />} label="Progetto" hint="legato a un cliente"
                onClick={() => { setOpen(false); setMode('project') }} />
              <MenuItem icon={<Zap className="w-4 h-4" />} label="Sprint" hint="dentro un progetto"
                onClick={() => { setOpen(false); setMode('sprint') }} />
              <MenuItem icon={<Flag className="w-4 h-4" />} label="Milestone" hint="obiettivo del progetto"
                onClick={() => { setOpen(false); setMode('milestone') }} />
              <MenuItem icon={<ListChecks className="w-4 h-4" />} label="Task / Subtask" hint="attività o sotto-attività"
                onClick={() => { setOpen(false); setMode('task') }} />
            </div>
          </>
        )}
      </div>

      {mode === 'project' && (
        <ProjectModal clients={clients} onClose={() => setMode(null)}
          onCreated={p => { addProjectLocal(p); toast.success('Progetto creato e collegato al cliente'); done() }} />
      )}
      {mode === 'sprint' && (
        <SprintModal clients={clients} projects={projectList} onClose={() => setMode(null)}
          onCreated={() => { toast.success('Sprint creata'); done() }} />
      )}
      {mode === 'milestone' && (
        <MilestoneModal clients={clients} projects={projectList} onClose={() => setMode(null)}
          onCreated={() => { toast.success('Milestone creata'); done() }} />
      )}
      {mode === 'task' && (
        <TaskModal clients={clients} projects={projectList} profiles={profiles} onClose={() => setMode(null)}
          onCreated={() => { toast.success('Task creata'); done() }} />
      )}
    </>
  )
}

function MenuItem({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors text-left group">
      <span className="text-gold-text">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-text-primary group-hover:text-gold-text transition-colors">{label}</span>
        <span className="block text-2xs text-text-tertiary">{hint}</span>
      </span>
    </button>
  )
}

function Shell({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <div>
            <h3 className="text-base font-bold text-text-primary">{title}</h3>
            {subtitle && <p className="text-2xs text-text-tertiary mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
      </div>
    </div>
  )
}

/** Cliente → Progetto filtrato. Restituisce il progetto scelto al parent. */
function ClientProjectPicker({ clients, projects, clientId, setClientId, projectId, setProjectId }: {
  clients: Client[]; projects: ProjectRef[]
  clientId: string; setClientId: (s: string) => void
  projectId: string; setProjectId: (s: string) => void
}) {
  const filtered = clientId ? projects.filter(p => p.client_id === clientId) : projects
  return (
    <>
      <label className="block">
        <span className={labelCls}>Cliente</span>
        <select value={clientId} onChange={e => { setClientId(e.target.value); setProjectId('') }} className={inputCls}>
          <option value="">Tutti i clienti</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelCls}>Progetto</span>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
          <option value="">Seleziona progetto…</option>
          {filtered.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
    </>
  )
}

/** Carica sprint, milestone e task-padre del progetto selezionato. */
function useCascade(projectId: string) {
  const [sprints, setSprints] = useState<{ id: string; name: string }[]>([])
  const [milestones, setMilestones] = useState<{ id: string; title: string }[]>([])
  const [parents, setParents] = useState<{ id: string; title: string }[]>([])
  useEffect(() => {
    if (!projectId) { setSprints([]); setMilestones([]); setParents([]); return }
    const sb = createClient()
    let alive = true
    Promise.all([
      sb.from('sprints').select('id, name').eq('project_id', projectId).order('start_date'),
      sb.from('tasks').select('id, title').eq('project_id', projectId).eq('is_milestone', true).order('position'),
      sb.from('tasks').select('id, title').eq('project_id', projectId).eq('is_milestone', false).is('parent_task_id', null).order('created_at', { ascending: false }).limit(100),
    ]).then(([s, m, t]) => {
      if (!alive) return
      setSprints((s.data ?? []) as { id: string; name: string }[])
      setMilestones((m.data ?? []) as { id: string; title: string }[])
      setParents((t.data ?? []) as { id: string; title: string }[])
    })
    return () => { alive = false }
  }, [projectId])
  return { sprints, milestones, parents }
}

function ProjectModal({ clients, onClose, onCreated }: {
  clients: Client[]; onClose: () => void
  onCreated: (p: { id: string; name: string; client_id: string }) => void
}) {
  const [clientId, setClientId] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'growth' | 'digital'>('growth')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    const r = await createProjectWs({ clientId, name, description, projectKind: kind })
    setLoading(false)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    onCreated(r.project!)
  }
  return (
    <Shell title="Nuovo progetto" subtitle="Cliente → Progetto" onClose={onClose}>
      <label className="block">
        <span className={labelCls}>Cliente</span>
        <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls}>
          <option value="">Seleziona cliente…</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
        </select>
      </label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome progetto" className={inputCls} />
      <div className="flex gap-2">
        {(['growth', 'digital'] as const).map(k => (
          <button key={k} onClick={() => setKind(k)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-colors border ${
              kind === k ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:text-text-primary'}`}>{k}</button>
        ))}
      </div>
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrizione (opzionale)" rows={2} className={`${inputCls} resize-none`} />
      <SubmitBtn loading={loading} disabled={!clientId || !name.trim()} onClick={submit} label="Crea progetto" />
    </Shell>
  )
}

function SprintModal({ clients, projects, onClose, onCreated }: {
  clients: Client[]; projects: ProjectRef[]; onClose: () => void; onCreated: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    setLoading(true)
    const r = await createSprintWs({ projectId, name, startDate, endDate })
    setLoading(false)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    onCreated()
  }
  return (
    <Shell title="Nuova sprint" subtitle="Cliente → Progetto → Sprint" onClose={onClose}>
      <ClientProjectPicker clients={clients} projects={projects} clientId={clientId} setClientId={setClientId} projectId={projectId} setProjectId={setProjectId} />
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome sprint (es. Sprint 1 — MVP)" className={inputCls} />
      <div className="flex gap-2">
        <label className="flex-1"><span className="text-2xs text-text-tertiary">Inizio</span>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} /></label>
        <label className="flex-1"><span className="text-2xs text-text-tertiary">Fine</span>
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} className={inputCls} /></label>
      </div>
      <SubmitBtn loading={loading} disabled={!projectId || !name.trim()} onClick={submit} label="Crea sprint" />
    </Shell>
  )
}

function MilestoneModal({ clients, projects, onClose, onCreated }: {
  clients: Client[]; projects: ProjectRef[]; onClose: () => void; onCreated: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    setLoading(true)
    const r = await createMilestoneWs({ projectId, title, dueDate })
    setLoading(false)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    onCreated()
  }
  return (
    <Shell title="Nuova milestone" subtitle="Cliente → Progetto → Milestone" onClose={onClose}>
      <ClientProjectPicker clients={clients} projects={projects} clientId={clientId} setClientId={setClientId} projectId={projectId} setProjectId={setProjectId} />
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome milestone (es. Lancio beta)" className={inputCls} />
      <label className="block"><span className="text-2xs text-text-tertiary">Data obiettivo</span>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} /></label>
      <SubmitBtn loading={loading} disabled={!projectId || !title.trim()} onClick={submit} label="Crea milestone" />
    </Shell>
  )
}

function TaskModal({ clients, projects, profiles, onClose, onCreated }: {
  clients: Client[]; projects: ProjectRef[]; profiles: PersonRef[]; onClose: () => void; onCreated: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [sprintId, setSprintId] = useState('')
  const [milestoneId, setMilestoneId] = useState('')
  const [parentTaskId, setParentTaskId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('media')
  const [loading, setLoading] = useState(false)
  const { sprints, milestones, parents } = useCascade(projectId)

  // Cambiando progetto azzero i collegamenti dipendenti.
  useEffect(() => { setSprintId(''); setMilestoneId(''); setParentTaskId('') }, [projectId])

  const submit = async () => {
    setLoading(true)
    const r = await createTaskWs({
      projectId, title, sprintId: sprintId || undefined, milestoneId: milestoneId || undefined,
      parentTaskId: parentTaskId || undefined, assigneeId: assigneeId || undefined,
      dueDate: dueDate || undefined, priority,
    })
    setLoading(false)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    onCreated()
  }

  return (
    <Shell title={parentTaskId ? 'Nuova subtask' : 'Nuova task'} subtitle="Cliente → Progetto → Sprint → Milestone → Task" onClose={onClose}>
      <ClientProjectPicker clients={clients} projects={projects} clientId={clientId} setClientId={setClientId} projectId={projectId} setProjectId={setProjectId} />

      {projectId && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="flex items-center gap-1 text-2xs text-text-tertiary"><Zap className="w-3 h-3" /> Sprint</span>
            <select value={sprintId} onChange={e => setSprintId(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
          <label className="block"><span className="flex items-center gap-1 text-2xs text-text-tertiary"><Flag className="w-3 h-3" /> Milestone</span>
            <select value={milestoneId} onChange={e => setMilestoneId(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {milestones.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select></label>
        </div>
      )}

      {projectId && parents.length > 0 && (
        <label className="block"><span className="flex items-center gap-1 text-2xs text-text-tertiary"><GitBranch className="w-3 h-3" /> Sottotask di (opzionale)</span>
          <select value={parentTaskId} onChange={e => setParentTaskId(e.target.value)} className={inputCls}>
            <option value="">Nessun padre — task principale</option>
            {parents.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select></label>
      )}

      <input value={title} onChange={e => setTitle(e.target.value)} placeholder={parentTaskId ? 'Titolo subtask' : 'Titolo task'} className={inputCls} />

      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="text-2xs text-text-tertiary">Scadenza</span>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} /></label>
        <label className="block"><span className="text-2xs text-text-tertiary">Priorità</span>
          <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
            <option value="bassa">Bassa</option><option value="media">Media</option><option value="alta">Alta</option>
          </select></label>
      </div>

      {profiles.length > 0 && (
        <label className="block"><span className="flex items-center gap-1 text-2xs text-text-tertiary"><Users2 className="w-3 h-3" /> Assegnatario</span>
          <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={inputCls}>
            <option value="">Io</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? 'Senza nome'}</option>)}
          </select></label>
      )}

      <SubmitBtn loading={loading} disabled={!projectId || !title.trim()} onClick={submit} label={parentTaskId ? 'Crea subtask' : 'Crea task'} />
    </Shell>
  )
}

function SubmitBtn({ loading, disabled, onClick, label }: { loading: boolean; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      className="w-full py-2.5 bg-gold text-on-gold rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-gold/90 transition-colors flex items-center justify-center gap-2">
      {loading && <Loader2 className="w-4 h-4 animate-spin" />} {label}
    </button>
  )
}
