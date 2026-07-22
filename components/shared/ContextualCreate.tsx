'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ChevronDown, Loader2, X, FolderKanban } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { ProjectWizard } from '@/components/projects/ProjectWizard'
import { createProjectWs, createWorkstreamWs, createMilestoneWs, createMyTask } from '@/app/actions/workspace-create'
import { createClientAdHoc } from '@/app/actions/client-adhoc'

// Destinazione "Ad Hoc": non è una milestone che scegli, è una task di scope
// CLIENTE (128) — fuori dal piano del progetto, risolta al salvataggio.
const AD_HOC = '__adhoc'

// CTA "Crea" contestuale (§13): il contesto in cui ti trovi precompila i campi e
// nasconde le opzioni impossibili. Dal cliente non puoi creare una milestone senza
// prima scegliere progetto e area di lavoro; dal progetto sono già fissati.
//
// GERARCHIA V2: Cliente → Progetto → Area di lavoro → Milestone → Task.
// Gli Sprint non sono più un livello; le Subtask non sono navigazione.
type Kind = 'progetto' | 'workstream' | 'milestone' | 'task'

export interface CreateCtx {
  clientId: string
  clientName?: string
  /** Se presente siamo nel dominio progetto: cliente e progetto sono fissati. */
  projectId?: string | null
  projectName?: string | null
  /** Progetti del cliente: servono a scegliere il target quando si crea dal cliente. */
  projects?: { id: string; name: string }[]
  /** Aree di lavoro del progetto corrente (per collegare milestone e task). */
  workstreams?: { id: string; name: string }[]
}

export function ContextualCreate({ ctx, canCreate = true, wizardData }: {
  ctx: CreateCtx
  canCreate?: boolean
  /** Dati per il wizard unico. Se assenti, "Nuovo progetto" resta nascosto:
   *  meglio non offrirlo che offrirne una versione monca. */
  wizardData?: { clients: { id: string; company_name: string }[]; profiles: { id: string; full_name: string | null }[]; isAdmin: boolean }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind | null>(null)

  if (!canCreate) return null

  const inProject = !!ctx.projectId
  const inProj = inProject ? ctx.projectName ?? undefined : 'scegli il progetto'
  const opts: { k: Kind; label: string; hint?: string }[] = [
    ...(wizardData ? [{ k: 'progetto' as Kind, label: 'Nuovo progetto', hint: ctx.clientName }] : []),
    { k: 'workstream', label: 'Nuova area di lavoro', hint: inProj },
    { k: 'milestone', label: 'Nuova milestone', hint: inProj },
    { k: 'task', label: 'Nuova task', hint: inProj },
  ]
  // Dal cliente senza progetti non ha senso proporre area/milestone/task.
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

      {/* "Nuovo progetto" passa dal wizard unico (§12): stesso flusso ovunque,
          con il cliente già precompilato dal contesto. */}
      {kind === 'progetto' && wizardData && (
        <ProjectWizard
          open
          onClose={() => setKind(null)}
          clients={wizardData.clients}
          profiles={wizardData.profiles}
          isAdmin={wizardData.isAdmin}
          defaultClientId={ctx.clientId}
        />
      )}

      {kind && kind !== 'progetto' && (
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
  const [workstreamId, setWorkstreamId] = useState('')
  const [milestoneId, setMilestoneId] = useState('')
  const [start, setStart] = useState('')
  const [due, setDue] = useState('')
  const [pending, startT] = useTransition()

  // Aree di lavoro e milestone del progetto scelto: cambiando progetto si
  // ricaricano e le selezioni precedenti si azzerano.
  const [workstreams, setWorkstreams] = useState<{ id: string; name: string }[]>(ctx.workstreams ?? [])
  const [milestones, setMilestones] = useState<{ id: string; title: string; workstream_id: string }[]>([])

  useEffect(() => {
    if (!projectId) { setWorkstreams([]); setMilestones([]); return }
    const sb = createClient()
    let alive = true
    Promise.all([
      sb.from('project_workstreams').select('id, name').eq('project_id', projectId).order('position'),
      sb.from('workstream_milestones').select('id, title, workstream_id').eq('project_id', projectId).order('sort_order'),
    ]).then(([w, m]) => {
      if (!alive) return
      setWorkstreams((w.data ?? []) as { id: string; name: string }[])
      setMilestones((m.data ?? []) as { id: string; title: string; workstream_id: string }[])
    })
    return () => { alive = false }
  }, [projectId])

  const inp = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40'
  const title = { progetto: 'Nuovo progetto', workstream: 'Nuova area di lavoro', milestone: 'Nuova milestone', task: 'Nuova task' }[kind]

  const save = () => startT(async () => {
    if (!name.trim()) { toast.error('Il nome è obbligatorio'); return }
    if (!projectId) { toast.error('Scegli il progetto'); return }

    let res: { ok: boolean; error?: string }
    if (kind === 'workstream') {
      res = await createWorkstreamWs({
        projectId, name: name.trim(),
        startDate: start || undefined, endDate: due || undefined,
      })
    } else if (kind === 'milestone') {
      if (!workstreamId) { toast.error("La milestone va legata a un'area di lavoro"); return }
      res = await createMilestoneWs({ projectId, title: name.trim(), workstreamId, expectedDate: due || undefined })
    } else {
      // ⚡ Ad Hoc: task di scope CLIENTE, fuori dal piano del progetto (128).
      if (workstreamId === AD_HOC) {
        if (!ctx.clientId) { toast.error('Serve un cliente per creare un ad hoc'); return }
        const r = await createClientAdHoc({
          client_id: ctx.clientId, title: name.trim(), due_date: due || null,
        })
        if (!r.ok) { toast.error(r.error ?? 'Errore'); return }
        toast.success('Attività ad hoc creata')
        onDone(); onClose()
        return
      }
      if (!workstreamId) { toast.error("La task va legata a un'area di lavoro"); return }
      // La milestone resta FACOLTATIVA (D-2): obbligatoria è solo l'area di lavoro.
      res = await createMyTask({
        title: name.trim(), projectId,
        workstreamId, milestoneId: milestoneId || null,
        dueDate: due || undefined,
      })
    }
    if (!res.ok) { toast.error(res.error ?? 'Errore creazione'); return }
    toast.success(`${title} creata`)
    onDone()
  })

  const placeholder = kind === 'workstream' ? 'Es. Produzione contenuti'
    : kind === 'milestone' ? 'Es. Consegna MVP'
    : "Cosa c'è da fare?"

  return (
    <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-text-primary">{title}</h3>
            <p className="text-2xs text-text-tertiary mt-0.5">
              {ctx.clientName}{ctx.projectName ? ` · ${ctx.projectName}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="p-1 text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>

        <input autoFocus value={name} onChange={e => setName(e.target.value)} aria-label="Nome"
          placeholder={placeholder} className={inp} />

        {/* Progetto → obbligatorio (precompilato se siamo già dentro un progetto) */}
        {!ctx.projectId && (
          <div className="flex items-center gap-1.5">
            <FolderKanban className="w-4 h-4 text-gold-text shrink-0" aria-hidden="true" />
            <select value={projectId} onChange={e => { setProjectId(e.target.value); setWorkstreamId(''); setMilestoneId('') }}
              aria-label="Progetto" className={inp}>
              <option value="">— Scegli il progetto —</option>
              {(ctx.projects ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        {/* Milestone → area di lavoro obbligatoria */}
        {kind === 'milestone' && projectId && (
          <>
            <select value={workstreamId} onChange={e => setWorkstreamId(e.target.value)} aria-label="Area di lavoro" className={inp}>
              <option value="">— Scegli l&apos;area di lavoro —</option>
              {workstreams.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {workstreams.length === 0 && <p className="text-2xs text-warning">Nessuna area di lavoro: creane prima una.</p>}
          </>
        )}

        {/* Task → area di lavoro obbligatoria, milestone facoltativa */}
        {kind === 'task' && projectId && (
          <>
            <select value={workstreamId}
              onChange={e => { setWorkstreamId(e.target.value); setMilestoneId('') }}
              aria-label="Area di lavoro" className={inp}>
              <option value="">— Scegli l&apos;area di lavoro —</option>
              <option value={AD_HOC}>⚡ Ad Hoc — richiesta una tantum</option>
              {workstreams.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>

            {workstreamId && workstreamId !== AD_HOC && (
              <select value={milestoneId} onChange={e => setMilestoneId(e.target.value)}
                aria-label="Milestone" className={inp}>
                <option value="">Milestone — nessuna (facoltativa)</option>
                {milestones.filter(m => m.workstream_id === workstreamId)
                  .map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            )}

            {workstreamId === AD_HOC && (
              <p className="text-2xs text-text-tertiary">Fuori dal piano del progetto: non sposta aree di lavoro né milestone.</p>
            )}
            {workstreams.length === 0 && <p className="text-2xs text-warning">Nessuna area di lavoro: creane prima una.</p>}
          </>
        )}

        {kind === 'workstream' ? (
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={start} onChange={e => setStart(e.target.value)} aria-label="Inizio" className={inp} />
            <input type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="Fine" className={inp} />
          </div>
        ) : (
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
