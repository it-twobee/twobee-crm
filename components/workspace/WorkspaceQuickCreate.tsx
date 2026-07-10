'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, X, FolderKanban, Flag, ListChecks, ChevronDown } from 'lucide-react'
import { createProjectWs, createSprintWs, createTaskWs } from '@/app/actions/workspace-create'

type Mode = 'menu' | 'project' | 'sprint' | 'task' | null
interface Ref { id: string; name: string }

export function WorkspaceQuickCreate({ clients, projects }: {
  clients: { id: string; company_name: string }[]
  projects: Ref[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(null)
  const [open, setOpen] = useState(false)
  // I progetti si aggiornano localmente dopo una creazione, così sono subito
  // selezionabili in "Sprint" e "Task" senza ricaricare la pagina.
  const [projectList, setProjectList] = useState<Ref[]>(projects)

  const done = (msg: string) => { toast.success(msg); setMode(null); router.refresh() }

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
            <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-border bg-surface p-1 z-20 shadow-xl">
              <MenuItem icon={<FolderKanban className="w-4 h-4" />} label="Nuovo progetto"
                onClick={() => { setOpen(false); setMode('project') }} />
              <MenuItem icon={<Flag className="w-4 h-4" />} label="Nuova sprint / milestone"
                onClick={() => { setOpen(false); setMode('sprint') }} />
              <MenuItem icon={<ListChecks className="w-4 h-4" />} label="Nuova task"
                onClick={() => { setOpen(false); setMode('task') }} />
            </div>
          </>
        )}
      </div>

      {mode === 'project' && (
        <ProjectModal clients={clients} onClose={() => setMode(null)}
          onCreated={p => { setProjectList(prev => [{ id: p.id, name: p.name }, ...prev]); done('Progetto creato') }} />
      )}
      {mode === 'sprint' && (
        <SprintModal projects={projectList} onClose={() => setMode(null)} onCreated={() => done('Sprint creata')} />
      )}
      {mode === 'task' && (
        <TaskModal projects={projectList} onClose={() => setMode(null)} onCreated={() => done('Task creata')} />
      )}
    </>
  )
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors text-left">
      <span className="text-gold-text">{icon}</span>{label}
    </button>
  )
}

const inputCls = 'w-full bg-background border border-border-interactive rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold'

function Shell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
      </div>
    </div>
  )
}

function ProjectModal({ clients, onClose, onCreated }: {
  clients: { id: string; company_name: string }[]
  onClose: () => void
  onCreated: (p: { id: string; name: string }) => void
}) {
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
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
    <Shell title="Nuovo progetto" onClose={onClose}>
      <label className="block">
        <span className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider">Cliente</span>
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
              kind === k ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:text-text-primary'}`}>
            {k}
          </button>
        ))}
      </div>
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrizione (opzionale)"
        rows={2} className={`${inputCls} resize-none`} />
      <button onClick={submit} disabled={loading || !clientId || !name.trim()}
        className="w-full py-2 bg-gold text-on-gold rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-gold/90 transition-colors">
        {loading ? 'Creo…' : 'Crea progetto'}
      </button>
    </Shell>
  )
}

function SprintModal({ projects, onClose, onCreated }: {
  projects: Ref[]; onClose: () => void; onCreated: () => void
}) {
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
    <Shell title="Nuova sprint / milestone" onClose={onClose}>
      <label className="block">
        <span className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider">Progetto</span>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
          <option value="">Seleziona progetto…</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome sprint (es. Sprint 1 — MVP)" className={inputCls} />
      <div className="flex gap-2">
        <label className="flex-1"><span className="text-2xs text-text-tertiary">Inizio</span>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} /></label>
        <label className="flex-1"><span className="text-2xs text-text-tertiary">Fine</span>
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} className={inputCls} /></label>
      </div>
      <button onClick={submit} disabled={loading || !projectId || !name.trim()}
        className="w-full py-2 bg-gold text-on-gold rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-gold/90 transition-colors">
        {loading ? 'Creo…' : 'Crea sprint'}
      </button>
    </Shell>
  )
}

function TaskModal({ projects, onClose, onCreated }: {
  projects: Ref[]; onClose: () => void; onCreated: () => void
}) {
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [isMilestone, setIsMilestone] = useState(false)
  const [priority, setPriority] = useState('media')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    const r = await createTaskWs({ projectId, title, dueDate, isMilestone, priority })
    setLoading(false)
    if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
    onCreated()
  }

  return (
    <Shell title="Nuova task" onClose={onClose}>
      <label className="block">
        <span className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider">Progetto</span>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
          <option value="">Seleziona progetto…</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo task" className={inputCls} />
      <div className="flex gap-2">
        <label className="flex-1"><span className="text-2xs text-text-tertiary">Scadenza</span>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} /></label>
        <label className="flex-1"><span className="text-2xs text-text-tertiary">Priorità</span>
          <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
            <option value="bassa">Bassa</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
          </select></label>
      </div>
      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
        <input type="checkbox" checked={isMilestone} onChange={e => setIsMilestone(e.target.checked)} className="accent-gold w-4 h-4" />
        È una milestone
      </label>
      <button onClick={submit} disabled={loading || !projectId || !title.trim()}
        className="w-full py-2 bg-gold text-on-gold rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-gold/90 transition-colors">
        {loading ? 'Creo…' : 'Crea task'}
      </button>
    </Shell>
  )
}
