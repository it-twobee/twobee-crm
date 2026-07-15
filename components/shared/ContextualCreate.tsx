'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ChevronDown, Loader2, X, FolderKanban } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { createProjectWs, createSprintWs, createMilestoneWs, createMyTask } from '@/app/actions/workspace-create'

// CTA "Crea" contestuale (§12/§15): il contesto in cui ti trovi precompila i campi e
// nasconde le opzioni impossibili. Dal cliente non puoi creare uno sprint senza prima
// scegliere il progetto; dal progetto, cliente e progetto sono già fissati.
type Kind = 'progetto' | 'sprint' | 'milestone' | 'task'

export interface CreateCtx {
  clientId: string
  clientName?: string
  /** Se presente siamo nel dominio progetto: cliente e progetto sono fissati. */
  projectId?: string | null
  projectName?: string | null
  /** Progetti del cliente: servono a scegliere il target quando si crea dal cliente. */
  projects?: { id: string; name: string }[]
  /** Sprint del progetto corrente (per collegare una milestone). */
  sprints?: { id: string; name: string }[]
}

export function ContextualCreate({ ctx, canCreate = true }: { ctx: CreateCtx; canCreate?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind | null>(null)

  if (!canCreate) return null

  const inProject = !!ctx.projectId
  const opts: { k: Kind; label: string; hint?: string }[] = [
    { k: 'progetto', label: 'Nuovo progetto', hint: ctx.clientName },
    { k: 'sprint', label: 'Nuovo sprint', hint: inProject ? ctx.projectName ?? undefined : 'scegli il progetto' },
    { k: 'milestone', label: 'Nuova milestone', hint: inProject ? ctx.projectName ?? undefined : 'scegli il progetto' },
    { k: 'task', label: 'Nuova task', hint: inProject ? ctx.projectName ?? undefined : 'scegli il progetto' },
  ]
  // Dal cliente senza progetti non ha senso proporre sprint/milestone/task.
  const hasTarget = inProject || (ctx.projects?.length ?? 0) > 0
  const visible = opts.filter(o => o.k === 'progetto' || hasTarget)

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 bg-gold text-on-gold text-sm font-bold rounded-lg hover:bg-gold/90 transition-colors">
        <Plus className="w-4 h-4" aria-hidden="true" /> Crea
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border border-border bg-surface shadow-xl overflow-hidden">
            {visible.map(o => (
              <button key={o.k} onClick={() => { setKind(o.k); setOpen(false) }}
                className="w-full text-left px-3 py-2.5 hover:bg-surface-hover transition-colors">
                <p className="text-sm text-text-primary">{o.label}</p>
                {o.hint && <p className="text-2xs text-text-tertiary truncate">in {o.hint}</p>}
              </button>
            ))}
          </div>
        </>
      )}

      {kind && (
        <CreateModal kind={kind} ctx={ctx} onClose={() => setKind(null)} onDone={() => { setKind(null); router.refresh() }} />
      )}
    </div>
  )
}

function CreateModal({ kind, ctx, onClose, onDone }: {
  kind: Kind; ctx: CreateCtx; onClose: () => void; onDone: () => void
}) {
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState(ctx.projectId ?? '')
  const [sprintId, setSprintId] = useState('')
  const [milestoneId, setMilestoneId] = useState('')
  const [start, setStart] = useState('')
  const [due, setDue] = useState('')
  const [pending, startT] = useTransition()

  // Sprint e milestone del progetto scelto — stessa logica di "Le mie attività":
  // cambiando progetto si ricaricano e le selezioni precedenti si azzerano.
  const [sprints, setSprints] = useState<{ id: string; name: string }[]>(ctx.sprints ?? [])
  const [milestones, setMilestones] = useState<{ id: string; title: string; sprint_id: string | null }[]>([])

  useEffect(() => {
    if (!projectId) { setSprints([]); setMilestones([]); return }
    const sb = createClient()
    let alive = true
    Promise.all([
      sb.from('sprints').select('id, name').eq('project_id', projectId).order('start_date'),
      sb.from('tasks').select('id, title, sprint_id').eq('project_id', projectId).eq('is_milestone', true).order('position'),
    ]).then(([s, m]) => {
      if (!alive) return
      setSprints((s.data ?? []) as { id: string; name: string }[])
      setMilestones((m.data ?? []) as { id: string; title: string; sprint_id: string | null }[])
    })
    return () => { alive = false }
  }, [projectId])

  const inp = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40'
  const needsProject = kind !== 'progetto'
  const title = { progetto: 'Nuovo progetto', sprint: 'Nuovo sprint', milestone: 'Nuova milestone', task: 'Nuova task' }[kind]

  const save = () => startT(async () => {
    if (!name.trim()) { toast.error('Il nome è obbligatorio'); return }
    if (needsProject && !projectId) { toast.error('Scegli il progetto'); return }

    let res: { ok: boolean; error?: string }
    if (kind === 'progetto') {
      res = await createProjectWs({ clientId: ctx.clientId, name: name.trim() })
    } else if (kind === 'sprint') {
      res = await createSprintWs({ projectId, name: name.trim(), startDate: start || undefined, endDate: due || undefined })
    } else if (kind === 'milestone') {
      if (!sprintId) { toast.error('La milestone va legata a uno sprint'); return }
      res = await createMilestoneWs({ projectId, title: name.trim(), sprintId, dueDate: due || undefined })
    } else {
      if (!milestoneId) { toast.error('La task va legata a una milestone'); return }
      res = await createMyTask({
        title: name.trim(), projectId,
        sprintId: sprintId || null, milestoneId,
        dueDate: due || undefined,
      })
    }
    if (!res.ok) { toast.error(res.error ?? 'Errore creazione'); return }
    toast.success(`${title} creato`)
    onDone()
  })

  return (
    <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-text-primary">{title}</h3>
            <p className="text-2xs text-text-tertiary mt-0.5">
              {ctx.clientName}{ctx.projectName && kind !== 'progetto' ? ` · ${ctx.projectName}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="p-1 text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>

        <input autoFocus value={name} onChange={e => setName(e.target.value)} aria-label="Nome"
          placeholder={kind === 'progetto' ? 'Nome del progetto' : kind === 'sprint' ? 'Es. Sprint 1 — Analisi' : kind === 'milestone' ? 'Es. Consegna MVP' : "Cosa c'è da fare?"}
          className={inp} />

        {/* Progetto → obbligatorio (precompilato se siamo già dentro un progetto) */}
        {needsProject && !ctx.projectId && (
          <div className="flex items-center gap-1.5">
            <FolderKanban className="w-4 h-4 text-gold-text shrink-0" aria-hidden="true" />
            <select value={projectId} onChange={e => { setProjectId(e.target.value); setSprintId(''); setMilestoneId('') }}
              aria-label="Progetto" className={inp}>
              <option value="">— Scegli il progetto —</option>
              {(ctx.projects ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        {/* Milestone → sprint obbligatorio */}
        {kind === 'milestone' && projectId && (
          <>
            <select value={sprintId} onChange={e => setSprintId(e.target.value)} aria-label="Sprint" className={inp}>
              <option value="">— Scegli lo sprint —</option>
              {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {sprints.length === 0 && <p className="text-2xs text-warning">Nessuno sprint: creane prima uno.</p>}
          </>
        )}

        {/* Task → sprint (filtro) + milestone obbligatoria */}
        {kind === 'task' && projectId && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <select value={sprintId} onChange={e => { setSprintId(e.target.value); setMilestoneId('') }} aria-label="Sprint" className={inp}>
                <option value="">Sprint — tutti</option>
                {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={milestoneId}
                onChange={e => { const mid = e.target.value; setMilestoneId(mid); const sp = milestones.find(m => m.id === mid)?.sprint_id; if (sp) setSprintId(sp) }}
                aria-label="Milestone" className={inp}>
                <option value="">Milestone *</option>
                {milestones.filter(m => !sprintId || m.sprint_id === sprintId).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
            {milestones.length === 0 && <p className="text-2xs text-warning">Nessuna milestone: creane prima una.</p>}
          </>
        )}

        {kind === 'sprint' ? (
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={start} onChange={e => setStart(e.target.value)} aria-label="Inizio" className={inp} />
            <input type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="Fine" className={inp} />
          </div>
        ) : kind !== 'progetto' && (
          <input type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="Scadenza" className={inp} />
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 border border-border rounded-xl text-sm text-text-secondary hover:text-text-primary">Annulla</button>
          <button onClick={save} disabled={pending}
            className="flex-1 py-2 bg-gold text-on-gold rounded-xl text-sm font-bold hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />} Crea
          </button>
        </div>
      </div>
    </div>
  )
}
