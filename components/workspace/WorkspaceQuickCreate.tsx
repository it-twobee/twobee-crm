'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, FolderKanban, Flag, ListChecks, ChevronDown, Loader2, Zap, GitBranch, Users2, Sparkles,
  UserCheck, Trash2,
} from 'lucide-react'
import {
  createProjectWs, createWorkstreamWs, createMilestoneWs, createTaskWs,
  createAiPlan, createAiMilestones, createAiTasks,
} from '@/app/actions/workspace-create'
import { createClientAdHoc } from '@/app/actions/client-adhoc'
import { ProjectWizard } from '@/components/projects/ProjectWizard'

// Destinazione "Ad Hoc": dalla migration 128 NON è più una milestone dentro il
// progetto, ma una task di scope CLIENTE (project_id NULL, client_id valorizzato).
// Il progetto selezionato serve solo a capire di quale cliente si tratta.
const AD_HOC = '__adhoc'
import { AiPlanBuilder, type AiPlanSprint } from '@/components/projects/AiPlanBuilder'
import { SearchableSelect } from '@/components/shared/SearchableSelect'
import type { Profile } from '@/lib/types/database'

type Mode = 'project' | 'workstream' | 'milestone' | 'task' | 'ai_plan' | null
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

  const addProjectLocal = (p: { id: string; name: string; client_id: string }) =>
    setProjectList(prev => [{ id: p.id, name: p.name, client_id: p.client_id }, ...prev])

  // La toast di conferma offre "Vai al progetto": apre il progetto ed evidenzia
  // l'elemento nuovo (?focus + kind). Nessun redirect automatico: resti dove sei.
  const goToNew = (projectId: string, id: string, kind: 'workstream' | 'milestone' | 'task') =>
    router.push(`/workspace/progetti/${projectId}?focus=${id}&kind=${kind}`)
  const goToProject = (projectId: string) => router.push(`/workspace/progetti/${projectId}`)

  const created = (msg: string, onClick: () => void) => {
    setMode(null)
    router.refresh()
    toast.success(msg, { action: { label: 'Vai al progetto', onClick } })
  }

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
              {/* "Crea da brief con AI" è temporaneamente nascosto: genera piani
                  a SPRINT (createAiPlan → sprint → milestone-task), un modello che
                  la gerarchia V2 non mostra più. Riattivare quando AiPlanBuilder e
                  /api/ai/generate-plan producono Aree di lavoro e Milestone V2.
                  Il codice resta: è solo l'ingresso a essere chiuso. */}
              <p className="px-3 pt-1 pb-1 text-2xs font-semibold text-text-tertiary uppercase tracking-wider">Catena di delivery</p>
              <MenuItem icon={<FolderKanban className="w-4 h-4" />} label="Progetto" hint="legato a un cliente"
                onClick={() => { setOpen(false); setMode('project') }} />
              <MenuItem icon={<Zap className="w-4 h-4" />} label="Area di lavoro" hint="filone dentro un progetto"
                onClick={() => { setOpen(false); setMode('workstream') }} />
              <MenuItem icon={<Flag className="w-4 h-4" />} label="Milestone" hint="risultato di un'area di lavoro"
                onClick={() => { setOpen(false); setMode('milestone') }} />
              <MenuItem icon={<ListChecks className="w-4 h-4" />} label="Task" hint="attività da eseguire"
                onClick={() => { setOpen(false); setMode('task') }} />
            </div>
          </>
        )}
      </div>

      {/* Wizard unico (§6). Nel workspace `isAdmin` è false: lo step economico
          sparisce e il progetto nasce «da definire» nella coda dell'admin. */}
      {mode === 'project' && (
        <ProjectWizard
          open
          onClose={() => setMode(null)}
          clients={clients}
          profiles={profiles.map(p => ({ id: p.id, full_name: p.full_name }))}
          isAdmin={false}
        />
      )}
      {false && (
        <ProjectModal clients={clients} onClose={() => setMode(null)}
          onCreated={p => { addProjectLocal(p); created('Progetto creato e collegato al cliente', () => goToProject(p.id)) }} />
      )}
      {mode === 'workstream' && (
        <WorkstreamModal clients={clients} projects={projectList} onClose={() => setMode(null)}
          onCreated={n => created('Area di lavoro creata', () => goToNew(n.projectId, n.id, 'workstream'))} />
      )}
      {mode === 'milestone' && (
        <MilestoneModal clients={clients} projects={projectList} onClose={() => setMode(null)}
          onCreated={n => created('Milestone creata', () => goToNew(n.projectId, n.id, 'milestone'))} />
      )}
      {mode === 'task' && (
        <TaskModal clients={clients} projects={projectList} profiles={profiles} onClose={() => setMode(null)}
          onCreated={n => created('Task creata', () => goToNew(n.projectId, n.id, 'task'))} />
      )}
      {mode === 'ai_plan' && (
        <AiCreateModal clients={clients} projects={projectList} onClose={() => setMode(null)}
          onCreated={projectId => created('Struttura creata', () => goToProject(projectId))} />
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

/** Nome cliente da id, per il sottotesto dei progetti. */
function clientNameOf(clients: Client[], clientId: string | null) {
  return clients.find(c => c.id === clientId)?.company_name ?? '—'
}

/** Progetto ricercabile, con il cliente di appartenenza visibile. Il cliente si
 *  deriva dal progetto scelto: niente doppio menu. */
function ProjectPicker({ clients, projects, projectId, setProjectId, onClientResolved }: {
  clients: Client[]; projects: ProjectRef[]
  projectId: string; setProjectId: (s: string) => void
  onClientResolved?: (clientId: string | null) => void
}) {
  const options = projects.map(p => ({ id: p.id, label: p.name, sublabel: clientNameOf(clients, p.client_id) }))
  return (
    <label className="block">
      <span className={labelCls}>Progetto (cerca)</span>
      <SearchableSelect value={projectId} options={options} placeholder="Cerca progetto o cliente…"
        onChange={id => { setProjectId(id); onClientResolved?.(projects.find(p => p.id === id)?.client_id ?? null) }} />
    </label>
  )
}

/** Cliente → Progetto: mantengo la firma per compatibilità, ma ora è un solo
 *  picker ricercabile con cliente visibile. */
function ClientProjectPicker({ clients, projects, setClientId, projectId, setProjectId }: {
  clients: Client[]; projects: ProjectRef[]
  clientId: string; setClientId: (s: string) => void
  projectId: string; setProjectId: (s: string) => void
}) {
  return (
    <ProjectPicker clients={clients} projects={projects} projectId={projectId} setProjectId={setProjectId}
      onClientResolved={cid => setClientId(cid ?? '')} />
  )
}

/** Carica sprint, milestone e task-padre del progetto selezionato. */
function useCascade(projectId: string) {
  const [sprints, setSprints] = useState<{ id: string; name: string }[]>([])
  const [milestones, setMilestones] = useState<{ id: string; title: string; workstream_id: string }[]>([])
  const [parents, setParents] = useState<{ id: string; title: string }[]>([])
  useEffect(() => {
    if (!projectId) { setSprints([]); setMilestones([]); setParents([]); return }
    const sb = createClient()
    let alive = true
    Promise.all([
      sb.from('project_workstreams').select('id, name').eq('project_id', projectId).order('position'),
      sb.from('workstream_milestones').select('id, title, workstream_id').eq('project_id', projectId).order('sort_order'),
      sb.from('tasks').select('id, title').eq('project_id', projectId).eq('is_milestone', false).is('parent_task_id', null).order('created_at', { ascending: false }).limit(100),
    ]).then(([s, m, t]) => {
      if (!alive) return
      setSprints((s.data ?? []) as { id: string; name: string }[])
      setMilestones((m.data ?? []) as { id: string; title: string; workstream_id: string }[])
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
        <span className={labelCls}>Cliente (cerca)</span>
        <SearchableSelect value={clientId} placeholder="Cerca cliente…"
          options={clients.map(c => ({ id: c.id, label: c.company_name }))}
          onChange={setClientId} />
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

function WorkstreamModal({ clients, projects, onClose, onCreated }: {
  clients: Client[]; projects: ProjectRef[]; onClose: () => void
  onCreated: (nav: { projectId: string; id: string }) => void
}) {
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    setLoading(true)
    const r = await createWorkstreamWs({ projectId, name, startDate, endDate })
    setLoading(false)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    onCreated({ projectId, id: r.workstream!.id })
  }
  return (
    <Shell title="Nuova area di lavoro" subtitle="Cliente → Progetto → Area di lavoro" onClose={onClose}>
      <ClientProjectPicker clients={clients} projects={projects} clientId={clientId} setClientId={setClientId} projectId={projectId} setProjectId={setProjectId} />
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome area di lavoro (es. Produzione contenuti)" className={inputCls} />
      <div className="flex gap-2">
        <label className="flex-1"><span className="text-2xs text-text-tertiary">Inizio</span>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} /></label>
        <label className="flex-1"><span className="text-2xs text-text-tertiary">Fine</span>
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} className={inputCls} /></label>
      </div>
      <SubmitBtn loading={loading} disabled={!projectId || !name.trim()} onClick={submit} label="Crea area di lavoro" />
    </Shell>
  )
}

function MilestoneModal({ clients, projects, onClose, onCreated }: {
  clients: Client[]; projects: ProjectRef[]; onClose: () => void
  onCreated: (nav: { projectId: string; id: string }) => void
}) {
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [workstreamId, setWorkstreamId] = useState('')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(false)
  const { sprints: workstreams } = useCascade(projectId)
  useEffect(() => { setWorkstreamId('') }, [projectId])

  const submit = async () => {
    setLoading(true)
    const r = await createMilestoneWs({ projectId, title, workstreamId, expectedDate: dueDate })
    setLoading(false)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    onCreated({ projectId, id: r.milestone!.id })
  }
  return (
    <Shell title="Nuova milestone" subtitle="Cliente → Progetto → Area di lavoro → Milestone" onClose={onClose}>
      <ClientProjectPicker clients={clients} projects={projects} clientId={clientId} setClientId={setClientId} projectId={projectId} setProjectId={setProjectId} />
      {projectId && (
        <label className="block"><span className="flex items-center gap-1 text-2xs text-text-tertiary"><Zap className="w-3 h-3" /> Area di lavoro *</span>
          <select value={workstreamId} onChange={e => setWorkstreamId(e.target.value)} className={inputCls}>
            <option value="">Seleziona area di lavoro…</option>
            {workstreams.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {workstreams.length === 0 && <span className="text-2xs text-warning">Nessuna area di lavoro: creane prima una in questo progetto.</span>}
        </label>
      )}
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome milestone (es. Lancio beta)" className={inputCls} />
      <label className="block"><span className="text-2xs text-text-tertiary">Data obiettivo</span>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} /></label>
      <SubmitBtn loading={loading} disabled={!projectId || !workstreamId || !title.trim()} onClick={submit} label="Crea milestone" />
    </Shell>
  )
}

function TaskModal({ clients, projects, profiles, onClose, onCreated }: {
  clients: Client[]; projects: ProjectRef[]; profiles: PersonRef[]; onClose: () => void
  onCreated: (nav: { projectId: string; id: string }) => void
}) {
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [workstreamId, setWorkstreamId] = useState('')
  const [milestoneId, setMilestoneId] = useState('')
  const [parentTaskId, setParentTaskId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('media')
  const [loading, setLoading] = useState(false)
  const { sprints: workstreams, milestones, parents } = useCascade(projectId)

  // Cambiando progetto azzero i collegamenti dipendenti.
  useEffect(() => { setWorkstreamId(''); setMilestoneId(''); setParentTaskId('') }, [projectId])

  const submit = async () => {
    setLoading(true)
    // ⚡ Ad Hoc non è più una milestone dentro il progetto: è una task di scope
    // CLIENTE (migration 128). Il progetto serve solo a sapere di chi è.
    if (workstreamId === AD_HOC) {
      const clientId = projects.find(p => p.id === projectId)?.client_id
      if (!clientId) { setLoading(false); toast.error('Progetto senza cliente: impossibile creare un ad hoc'); return }
      const r = await createClientAdHoc({
        client_id: clientId, title, due_date: dueDate || null, priority,
        assignee_ids: assigneeId ? [assigneeId] : [],
      })
      setLoading(false)
      if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
      toast.success('Attività ad hoc creata')
      // Nessun projectId: l'ad hoc è di scope cliente e non apre un progetto.
      onCreated({ projectId: '', id: r.id })
      return
    }
    const r = await createTaskWs({
      projectId, title,
      workstreamId: workstreamId || undefined,
      milestoneId: milestoneId || undefined,
      parentTaskId: parentTaskId || undefined, assigneeId: assigneeId || undefined,
      dueDate: dueDate || undefined, priority,
    })
    setLoading(false)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    onCreated({ projectId, id: r.task!.id })
  }

  return (
    <Shell title={parentTaskId ? 'Nuova task collegata' : 'Nuova task'} subtitle="Cliente → Progetto → Area di lavoro → Milestone → Task" onClose={onClose}>
      <ClientProjectPicker clients={clients} projects={projects} clientId={clientId} setClientId={setClientId} projectId={projectId} setProjectId={setProjectId} />

      {projectId && !parentTaskId && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="flex items-center gap-1 text-2xs text-text-tertiary"><Zap className="w-3 h-3" /> Area di lavoro *</span>
            <select value={workstreamId} onChange={e => { setWorkstreamId(e.target.value); setMilestoneId('') }} className={inputCls}>
              <option value="">Seleziona area di lavoro…</option>
              <option value={AD_HOC}>⚡ Ad Hoc — richiesta una tantum</option>
              {workstreams.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select></label>
          <label className="block"><span className="flex items-center gap-1 text-2xs text-text-tertiary"><Flag className="w-3 h-3" /> Milestone (facoltativa)</span>
            <select value={milestoneId} onChange={e => setMilestoneId(e.target.value)}
              disabled={!workstreamId || workstreamId === AD_HOC} className={inputCls}>
              <option value="">Nessuna</option>
              {milestones.filter(m => m.workstream_id === workstreamId).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select></label>
        </div>
      )}

      {projectId && workstreamId === AD_HOC && (
        <p className="text-2xs text-text-tertiary">Fuori dal piano del progetto: non sposta aree di lavoro né milestone.</p>
      )}

      {projectId && parents.length > 0 && (
        <label className="block"><span className="flex items-center gap-1 text-2xs text-text-tertiary"><GitBranch className="w-3 h-3" /> Task collegata a (opzionale)</span>
          <select value={parentTaskId} onChange={e => setParentTaskId(e.target.value)} className={inputCls}>
            <option value="">Nessuna — task principale</option>
            {parents.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select></label>
      )}

      <input value={title} onChange={e => setTitle(e.target.value)} placeholder={parentTaskId ? 'Titolo task collegata' : 'Titolo task'} className={inputCls} />

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

      <SubmitBtn loading={loading} disabled={!projectId || !title.trim() || (!workstreamId && !parentTaskId)} onClick={submit} label={parentTaskId ? 'Crea task collegata' : 'Crea task'} />
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

// Piano da brief: scegli cliente + progetto (nuovo o esistente), scrivi un brief,
// l'AI propone la struttura e la apri nello STESSO builder della pagina progetto.

// ─── AI da brief, scope-aware ────────────────────────────────────────────────
const ASSIGNABLE_ROLES = ['manager', 'senior', 'junior', 'stage']
type Scope = 'plan' | 'sprint' | 'milestones' | 'tasks'
interface EditTask { title: string; priority: string; suggested_role?: string; due_date?: string; assignee_id?: string }
interface EditMilestone { title: string; due_date?: string; assignee_id?: string; tasks: EditTask[] }

function usePeople() {
  const [people, setPeople] = useState<Profile[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? ''))
    sb.from('profiles').select('id, full_name, app_role').eq('is_active', true).order('full_name')
      .then(({ data }) => setPeople((data ?? []) as unknown as Profile[]))
  }, [])
  return { people, currentUserId }
}

function PeopleSelect2({ value, onChange, people, currentUserId }: {
  value: string; onChange: (v: string) => void; people: Profile[]; currentUserId: string
}) {
  const assignable = people.filter(p => ASSIGNABLE_ROLES.includes((p.app_role ?? '') as string))
  return (
    <div className="flex items-center gap-1 shrink-0">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="text-2xs bg-background border border-border-interactive rounded px-1.5 py-1 text-text-primary focus:outline-none focus:border-gold max-w-[120px]">
        <option value="">— Nessuno</option>
        {assignable.map(p => <option key={p.id} value={p.id}>{p.full_name ?? 'Senza nome'}</option>)}
      </select>
      <button type="button" onClick={() => onChange(currentUserId)} title="Assegna a me" aria-label="Assegna a me"
        className="p-1 rounded text-text-tertiary hover:text-gold-text hover:bg-gold/10 transition-colors">
        <UserCheck className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

const PRIO = ['alta', 'media', 'bassa']
const PRIO_LABEL: Record<string, string> = { alta: 'Alta', media: 'Media', bassa: 'Bassa' }
const PRIO_COLOR: Record<string, string> = { alta: 'var(--color-error)', media: 'var(--color-warning)', bassa: 'var(--color-text-tertiary)' }

// Editor compatto per gli scope "milestone" e "task": stessa cifra visiva del
// builder di progetto, ma piatto sul livello richiesto (dentro un genitore già scelto).
function ScopedPlanEditor({ mode, milestones, tasks, people, currentUserId, loading, error, targetLabel, onBack, onConfirm }: {
  mode: 'milestones' | 'tasks'
  milestones: EditMilestone[]; tasks: EditTask[]
  people: Profile[]; currentUserId: string
  loading: boolean; error: string; targetLabel: string
  onBack: () => void; onConfirm: (data: { milestones?: EditMilestone[]; tasks?: EditTask[] }) => void
}) {
  const [mDraft, setMDraft] = useState<EditMilestone[]>([])
  const [tDraft, setTDraft] = useState<EditTask[]>([])
  useEffect(() => { setMDraft(milestones) }, [milestones])
  useEffect(() => { setTDraft(tasks) }, [tasks])

  const dateCls = 'text-2xs bg-background border border-border-interactive rounded px-1.5 py-1 text-text-primary focus:outline-none focus:border-gold shrink-0'
  const nameCls = 'flex-1 min-w-0 bg-transparent border-b border-transparent hover:border-border focus:border-gold px-0.5 py-0.5 focus:outline-none'

  const TaskRowE = ({ t, onPatch, onDrop }: { t: EditTask; onPatch: (p: Partial<EditTask>) => void; onDrop: () => void }) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select value={t.priority} onChange={e => onPatch({ priority: e.target.value })} aria-label="Priorità"
        className="text-2xs bg-background border border-border-interactive rounded px-1 py-1 text-text-primary focus:outline-none focus:border-gold shrink-0"
        style={{ color: PRIO_COLOR[t.priority] ?? 'var(--color-text-secondary)' }}>
        {PRIO.map(p => <option key={p} value={p} className="text-text-primary">{PRIO_LABEL[p]}</option>)}
      </select>
      <input value={t.title} onChange={e => onPatch({ title: e.target.value })} className={`${nameCls} text-2xs text-text-secondary`} />
      <input type="date" value={t.due_date ?? ''} onChange={e => onPatch({ due_date: e.target.value })} className={dateCls} />
      <PeopleSelect2 value={t.assignee_id ?? ''} onChange={v => onPatch({ assignee_id: v })} people={people} currentUserId={currentUserId} />
      <button type="button" onClick={onDrop} aria-label="Elimina task" className="shrink-0 p-0.5 rounded text-text-tertiary hover:text-error">
        <X className="w-3 h-3" />
      </button>
    </div>
  )

  const totalTasks = mode === 'tasks' ? tDraft.length : mDraft.reduce((a, m) => a + m.tasks.length + 1, 0)

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onBack}>
      <div className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border shrink-0">
          <Sparkles className="w-4 h-4 text-gold-text" />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-text-primary">{mode === 'milestones' ? 'Milestone da brief' : 'Task da brief'}</h2>
            <p className="text-2xs text-text-tertiary">Rifinisci e conferma · {targetLabel}</p>
          </div>
          <button type="button" onClick={onBack} aria-label="Indietro"><X className="w-4 h-4 text-text-tertiary hover:text-text-primary" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {loading && <div className="flex flex-col items-center gap-3 py-16"><Loader2 className="w-10 h-10 text-gold-text animate-spin" /><p className="text-sm text-text-tertiary">L&apos;AI sta analizzando il brief…</p></div>}
          {error && !loading && <p className="text-sm text-error p-4 bg-error/10 rounded-xl">{error}</p>}

          {!loading && mode === 'tasks' && tDraft.map((t, ti) => (
            <TaskRowE key={ti} t={t}
              onPatch={p => setTDraft(d => d.map((x, i) => i === ti ? { ...x, ...p } : x))}
              onDrop={() => setTDraft(d => d.filter((_, i) => i !== ti))} />
          ))}
          {!loading && mode === 'tasks' && (
            <button type="button" onClick={() => setTDraft(d => [...d, { title: 'Nuova task', priority: 'media' }])}
              className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text transition-colors mt-1">
              <Plus className="w-3 h-3" /> Aggiungi task
            </button>
          )}

          {!loading && mode === 'milestones' && mDraft.map((m, mi) => (
            <div key={mi} className="border border-gold/20 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Flag className="w-3 h-3 text-gold-text shrink-0" />
                <input value={m.title} onChange={e => setMDraft(d => d.map((x, i) => i === mi ? { ...x, title: e.target.value } : x))} className={`${nameCls} text-xs font-bold text-text-primary`} />
                <input type="date" value={m.due_date ?? ''} onChange={e => setMDraft(d => d.map((x, i) => i === mi ? { ...x, due_date: e.target.value } : x))} className={dateCls} />
                <PeopleSelect2 value={m.assignee_id ?? ''} onChange={v => setMDraft(d => d.map((x, i) => i === mi ? { ...x, assignee_id: v } : x))} people={people} currentUserId={currentUserId} />
                <button type="button" onClick={() => setMDraft(d => d.filter((_, i) => i !== mi))} aria-label="Elimina milestone" className="shrink-0 p-1 rounded text-text-tertiary hover:text-error hover:bg-error-dim transition-colors"><Trash2 className="w-3 h-3" /></button>
              </div>
              <div className="pl-5 space-y-1">
                {m.tasks.map((t, ti) => (
                  <TaskRowE key={ti} t={t}
                    onPatch={p => setMDraft(d => d.map((x, i) => i === mi ? { ...x, tasks: x.tasks.map((y, j) => j === ti ? { ...y, ...p } : y) } : x))}
                    onDrop={() => setMDraft(d => d.map((x, i) => i === mi ? { ...x, tasks: x.tasks.filter((_, j) => j !== ti) } : x))} />
                ))}
                <button type="button" onClick={() => setMDraft(d => d.map((x, i) => i === mi ? { ...x, tasks: [...x.tasks, { title: 'Nuova task', priority: 'media', due_date: x.due_date }] } : x))}
                  className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text transition-colors mt-0.5"><Plus className="w-3 h-3" /> Aggiungi task</button>
              </div>
            </div>
          ))}
          {!loading && mode === 'milestones' && (
            <button type="button" onClick={() => setMDraft(d => [...d, { title: 'Nuova milestone', tasks: [] }])}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-gold-text border border-dashed border-border hover:border-gold/40 rounded-xl py-2.5 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Aggiungi milestone
            </button>
          )}
        </div>

        {!loading && (
          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
            <button type="button" onClick={onBack} className="text-sm text-text-tertiary hover:text-text-primary border border-border px-4 py-2.5 rounded-xl transition-colors">Indietro</button>
            <button type="button" onClick={() => onConfirm(mode === 'tasks' ? { tasks: tDraft } : { milestones: mDraft })} disabled={!totalTasks}
              className="flex-1 py-2.5 font-bold rounded-xl text-sm bg-gold text-on-gold disabled:opacity-40 transition-colors">
              Crea ({totalTasks} elementi)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function AiCreateModal({ clients, projects, onClose, onCreated }: {
  clients: Client[]; projects: ProjectRef[]; onClose: () => void
  onCreated: (projectId: string) => void
}) {
  const [scope, setScope] = useState<Scope>('plan')
  const [clientId, setClientId] = useState('')
  const [projMode, setProjMode] = useState<'new' | 'existing'>('new')
  const [projectId, setProjectId] = useState('')
  const [newName, setNewName] = useState('')
  const [kind, setKind] = useState<'growth' | 'digital'>('growth')
  const [sprintId, setSprintId] = useState('')
  const [milestoneId, setMilestoneId] = useState('')
  const [brief, setBrief] = useState('')
  const [phase, setPhase] = useState<'config' | 'preview'>('config')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<AiPlanSprint[] | null>(null)
  const [ems, setEms] = useState<EditMilestone[]>([])
  const [ets, setEts] = useState<EditTask[]>([])
  const [creating, setCreating] = useState(false)
  const { people, currentUserId } = usePeople()
  const { sprints, milestones } = useCascade(scope === 'plan' ? '' : projectId)

  useEffect(() => { setSprintId(''); setMilestoneId('') }, [projectId, scope])
  useEffect(() => { setMilestoneId('') }, [sprintId])

  const clientName = scope === 'plan'
    ? (clients.find(c => c.id === clientId)?.company_name ?? '')
    : clientNameOf(clients, projects.find(p => p.id === projectId)?.client_id ?? null)
  const projectName = scope === 'plan' && projMode === 'new' ? newName : (projects.find(p => p.id === projectId)?.name ?? '')
  const sprintName = sprints.find(s => s.id === sprintId)?.name ?? ''
  const milestoneTitle = milestones.find(m => m.id === milestoneId)?.title ?? ''

  const resolveAssignee = (role?: string) => people.filter(p => ASSIGNABLE_ROLES.includes((p.app_role ?? '') as string)).find(p => p.app_role === role)?.id ?? ''

  const targetReady =
    scope === 'plan' ? (projMode === 'existing' ? !!projectId : (!!clientId && !!newName.trim()))
    : scope === 'sprint' ? !!projectId
    : scope === 'milestones' ? (!!projectId && !!sprintId)
    : (!!projectId && !!milestoneId)
  const canGenerate = brief.trim().length > 0 && targetReady

  const generate = async () => {
    if (!canGenerate) return
    setPhase('preview'); setLoading(true); setError(''); setPlan(null); setEms([]); setEts([])
    try {
      const r = await fetch('/api/ai/generate-structure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, brief, project_name: projectName, company_name: clientName, kind, sprint_name: sprintName, milestone_title: milestoneTitle }),
      })
      const data = await r.json()
      if (data.error) { setError(data.error); setLoading(false); return }
      if (scope === 'plan' || scope === 'sprint') setPlan(data.sprints ?? [])
      else if (scope === 'milestones') setEms((data.milestones ?? []).map((m: { title: string; tasks?: EditTask[] }) => ({ title: m.title, due_date: '', assignee_id: '', tasks: (m.tasks ?? []).map(t => ({ title: t.title, priority: t.priority || 'media', suggested_role: t.suggested_role, due_date: '', assignee_id: resolveAssignee(t.suggested_role) })) })))
      else setEts((data.tasks ?? []).map((t: EditTask) => ({ title: t.title, priority: t.priority || 'media', suggested_role: t.suggested_role, due_date: '', assignee_id: resolveAssignee(t.suggested_role) })))
    } catch {
      setError('Errore di rete')
    }
    setLoading(false)
  }

  const finish = async (r: { ok: boolean; error?: string; projectId?: string }) => {
    setCreating(false)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    onCreated(r.projectId ?? projectId)
  }

  const acceptPlan = async (finalPlan: AiPlanSprint[]) => {
    if (creating) return
    setCreating(true)
    const r = await createAiPlan({
      clientId: scope === 'plan' && projMode === 'new' ? clientId : undefined,
      projectId: scope === 'sprint' || (scope === 'plan' && projMode === 'existing') ? projectId : undefined,
      newProjectName: scope === 'plan' && projMode === 'new' ? newName : undefined,
      projectKind: kind, plan: finalPlan,
    })
    finish(r)
  }
  const acceptMilestones = async (data: { milestones?: EditMilestone[] }) => {
    if (creating) return
    setCreating(true)
    finish(await createAiMilestones({ projectId, sprintId, milestones: data.milestones ?? [] }))
  }
  const acceptTasks = async (data: { tasks?: EditTask[] }) => {
    if (creating) return
    setCreating(true)
    finish(await createAiTasks({ projectId, milestoneId, sprintId: sprintId || null, tasks: data.tasks ?? [] }))
  }

  if (phase === 'preview') {
    if (scope === 'plan' || scope === 'sprint') {
      return (
        <AiPlanBuilder plan={plan} loading={loading} error={error} profiles={people} currentUserId={currentUserId} kind={kind}
          accent="var(--color-gold-text)" onClose={() => setPhase('config')} onRegenerate={generate} onAccept={acceptPlan} />
      )
    }
    return (
      <ScopedPlanEditor mode={scope === 'milestones' ? 'milestones' : 'tasks'} milestones={ems} tasks={ets}
        people={people} currentUserId={currentUserId} loading={loading} error={error}
        targetLabel={scope === 'milestones' ? `${projectName} · ${sprintName}` : `${projectName} · ${milestoneTitle}`}
        onBack={() => setPhase('config')}
        onConfirm={d => scope === 'milestones' ? acceptMilestones(d) : acceptTasks(d)} />
    )
  }

  const SCOPES: { k: Scope; label: string }[] = [
    { k: 'plan', label: 'Piano' }, { k: 'sprint', label: 'Sprint' }, { k: 'milestones', label: 'Milestone' }, { k: 'tasks', label: 'Task' },
  ]
  const sprintOpts = sprints.map(s => ({ id: s.id, label: s.name }))
  const milestoneOpts = milestones.filter(m => !sprintId || m.workstream_id === sprintId).map(m => ({ id: m.id, label: m.title }))

  return (
    <Shell title="Crea con AI da brief" subtitle="Scegli cosa generare, aggancia il contesto, poi rifinisci" onClose={onClose}>
      <div className="grid grid-cols-4 gap-1.5">
        {SCOPES.map(s => (
          <button key={s.k} onClick={() => setScope(s.k)}
            className={`py-2 rounded-lg text-2xs font-bold transition-colors border ${scope === s.k ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:text-text-primary'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {scope === 'plan' ? (
        <>
          <label className="block"><span className={labelCls}>Cliente (cerca)</span>
            <SearchableSelect value={clientId} placeholder="Cerca cliente…" options={clients.map(c => ({ id: c.id, label: c.company_name }))} onChange={setClientId} />
          </label>
          <div className="flex gap-2">
            {(['new', 'existing'] as const).map(m => (
              <button key={m} onClick={() => setProjMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors border ${projMode === m ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:text-text-primary'}`}>
                {m === 'new' ? 'Nuovo progetto' : 'Progetto esistente'}
              </button>
            ))}
          </div>
          {projMode === 'new' ? (
            <>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome del nuovo progetto" className={inputCls} />
              <div className="flex gap-2">
                {(['growth', 'digital'] as const).map(k => (
                  <button key={k} onClick={() => setKind(k)} className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-colors border ${kind === k ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:text-text-primary'}`}>{k}</button>
                ))}
              </div>
            </>
          ) : (
            <ProjectPicker clients={clients} projects={projects} projectId={projectId} setProjectId={setProjectId} onClientResolved={c => setClientId(c ?? '')} />
          )}
        </>
      ) : (
        <ProjectPicker clients={clients} projects={projects} projectId={projectId} setProjectId={setProjectId} />
      )}

      {(scope === 'milestones' || scope === 'tasks') && projectId && (
        <label className="block"><span className={labelCls}>Sprint {scope === 'milestones' ? '*' : ''}</span>
          <SearchableSelect value={sprintId} placeholder="Cerca sprint…" options={sprintOpts} emptyText="Nessuno sprint: creane prima uno" onChange={setSprintId} />
        </label>
      )}
      {scope === 'tasks' && projectId && (
        <label className="block"><span className={labelCls}>Milestone *</span>
          <SearchableSelect value={milestoneId} placeholder="Cerca milestone…" options={milestoneOpts} emptyText="Nessuna milestone: creane prima una" onChange={id => { setMilestoneId(id); const sp = milestones.find(m => m.id === id)?.workstream_id; if (sp) setSprintId(sp) }} />
        </label>
      )}

      <label className="block"><span className={labelCls}>Brief</span>
        <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={5}
          placeholder="Descrivi obiettivi, target, vincoli… L'AI proporrà la struttura." className={`${inputCls} resize-none`} />
      </label>

      <SubmitBtn loading={false} disabled={!canGenerate} onClick={generate} label="Genera struttura" />
    </Shell>
  )
}
