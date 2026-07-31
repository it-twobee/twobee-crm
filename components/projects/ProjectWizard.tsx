'use client'

import { useState, useMemo, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X, ChevronLeft, ChevronRight, Check, Loader2, Sparkles } from 'lucide-react'
import { createProjectFromWizard, type WizardPayload } from '@/app/actions/create-project'
import { saveWizardTemplate } from '@/app/actions/wizard'
import {
  projectName, workstreamName, bareWorkstream, bareMilestone, bareTask, type NamingCtx,
} from '@/lib/project-naming'
import type {
  ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode, ProjectArea, Priority, Visibility,
} from '@/lib/types/database'

import { StepCliente } from './wizard/StepCliente'
import { StepArea } from './wizard/StepArea'
import { StepWorkstream } from './wizard/StepWorkstream'
import { StepInfo, type InfoState } from './wizard/StepInfo'
import { StepTeam } from './wizard/StepTeam'
import { StepTemplate } from './wizard/StepTemplate'
import { StepStruttura, applyNaming, offConventionCount, spreadDueDates } from './wizard/StepStruttura'
import { StepConferma } from './wizard/StepConferma'
import {
  STEPS, nk, countTree, applyRelativeDates,
  newTask, newMilestone, newRecurring, newWorkstream,
  type Person, type ClientOpt, type ClientChoice, type WsPick,
  type WWorkstream, type WMilestone, type WRecurring, type WTask,
} from './wizard/types'

export function ProjectWizard({
  clients, profiles, services, templates, nodes, fixedClientId, basePath = '/progetti', onClose,
}: {
  clients: ClientOpt[]
  profiles: Person[]
  services: ServiceCatalogEntry[]
  templates: ProjectTemplate[]
  nodes: ProjectTemplateNode[]
  fixedClientId?: string
  basePath?: string
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const fixed = fixedClientId ? clients.find(c => c.id === fixedClientId) : undefined
  const [step, setStep] = useState(fixed ? 1 : 0)
  const [client, setClient] = useState<ClientChoice | null>(
    fixed ? { kind: 'client', id: fixed.id, name: fixed.name } : null,
  )
  const [area, setArea] = useState<ProjectArea | ''>('')
  const [picks, setPicks] = useState<WsPick[]>([])
  const [info, setInfo] = useState<InfoState>({
    name: '', description: '', startDate: '', targetEnd: '',
    managerId: '', priority: 'media' as Priority, visibility: 'internal' as Visibility,
  })
  const [nameTouched, setNameTouched] = useState(false)
  const [team, setTeam] = useState<string[]>([])
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [structure, setStructure] = useState<WWorkstream[]>([])
  const [structureTouched, setStructureTouched] = useState(false)
  const [status, setStatus] = useState<'draft' | 'active'>('draft')
  const [saveTpl, setSaveTpl] = useState({ on: false, name: '' })

  const primary = picks[0]
  const ctx: NamingCtx = useMemo(() => ({
    client: client?.kind === 'client' ? client.name : null,
    area: area || 'marketing',
    service: primary?.label ?? '',
  }), [client, area, primary])
  const suggestedName = useMemo(() => (area && primary ? projectName(ctx) : ''), [ctx, area, primary])

  // il nome segue la convention finché non lo tocchi a mano
  useEffect(() => {
    if (!nameTouched && suggestedName) setInfo(s => (s.name === suggestedName ? s : { ...s, name: suggestedName }))
  }, [suggestedName, nameTouched])

  const areaServices = useMemo(
    () => services.filter(s => s.is_active && s.area === area),
    [services, area])
  const areaCounts = useMemo(() => {
    const m: Record<string, number> = {}
    services.filter(s => s.is_active).forEach(s => { m[s.area] = (m[s.area] ?? 0) + 1 })
    return m
  }, [services])

  const teamPeople = useMemo(() => {
    const ids = new Set([...team, ...(info.managerId ? [info.managerId] : [])])
    return profiles.filter(p => ids.has(p.id))
  }, [profiles, team, info.managerId])

  // ── struttura: seed dai workstream scelti oppure espansione del template ───
  const seedFromPicks = useCallback((): WWorkstream[] => picks.map(p =>
    newWorkstream(workstreamName(ctx, p.label), info.managerId || null),
  ), [picks, ctx, info.managerId])

  const expandTemplate = useCallback((tid: string): WWorkstream[] => {
    const byOrder = (a: ProjectTemplateNode, b: ProjectTemplateNode) => a.sort_order - b.sort_order
    const wsNodes = nodes.filter(n => n.template_id === tid && !n.parent_id && n.node_type === 'workstream').sort(byOrder)

    const asRecurring = (n: ProjectTemplateNode): WRecurring => ({
      ...newRecurring(n.name, n.visibility, null),
      frequency: n.frequency ?? 'weekly', owner_role: n.suggested_owner_role,
      priority: n.priority ?? 'media', estimated_hours: n.estimated_hours, description: n.description,
    })
    const asTask = (n: ProjectTemplateNode): WTask => ({
      ...newTask(n.name, n.visibility),
      description: n.description, estimated_hours: n.estimated_hours,
      priority: n.priority ?? 'media', owner_role: n.suggested_owner_role,
      rel_days: n.relative_due_days,
    })

    return wsNodes.map(w => {
      const children = nodes.filter(n => n.parent_id === w.id).sort(byOrder)
      const recurring: WRecurring[] = []
      const milestones: WMilestone[] = []
      for (const c of children) {
        if (c.node_type === 'recurring_task') {
          recurring.push(asRecurring(c))
        } else if (c.node_type === 'milestone') {
          const tasks = nodes.filter(n => n.parent_id === c.id && n.node_type === 'task').sort(byOrder).map(asTask)
          nodes.filter(n => n.parent_id === c.id && n.node_type === 'recurring_task').sort(byOrder)
            .forEach(r => recurring.push(asRecurring(r)))
          milestones.push({
            ...newMilestone(c.name, c.visibility, null),
            milestone_type: (c.milestone_type ?? 'delivery') as 'delivery' | 'system',
            description: c.description, owner_role: c.suggested_owner_role,
            rel_days: c.relative_due_days, tasks,
          })
        } else if (c.node_type === 'task') {
          const ms = milestones.find(m => m.title === 'Attività')
            ?? (() => { const m = newMilestone('Attività', 'internal', null); milestones.push(m); return m })()
          ms.tasks.push(asTask(c))
        }
      }
      return {
        ...newWorkstream(w.name, null),
        workstream_type: (w.workstream_type ?? 'recurring') as 'project' | 'recurring',
        visibility: w.visibility, description: w.description, milestones, recurring,
      }
    })
  }, [nodes])

  const pickTemplate = (tid: string | null) => {
    setTemplateId(tid)
    const base = tid ? applyRelativeDates(expandTemplate(tid), info.startDate) : seedFromPicks()
    setStructure(applyNaming(base, ctx))
    setStructureTouched(false)
  }

  // spostare l'avvio del progetto ridatta il piano che viene dal template:
  // le date messe a mano restano dove sono (rel_days = null)
  useEffect(() => {
    if (!templateId || structureTouched || !info.startDate) return
    setStructure(s => applyRelativeDates(s, info.startDate))
  }, [templateId, structureTouched, info.startDate])

  // finché non tocchi la struttura, resta agganciata ai workstream scelti
  useEffect(() => {
    if (templateId === null && !structureTouched) setStructure(applyNaming(seedFromPicks(), ctx))
  }, [templateId, structureTouched, seedFromPicks, ctx])

  const editStructure: React.Dispatch<React.SetStateAction<WWorkstream[]>> = useCallback(v => {
    setStructureTouched(true)
    setStructure(v)
  }, [])

  const offConvention = useMemo(() => offConventionCount(structure, ctx), [structure, ctx])
  const counts = useMemo(() => countTree(structure), [structure])

  // ── navigazione ────────────────────────────────────────────────────────────
  const minStep = fixed ? 1 : 0
  const valid = useCallback((s: number): boolean => {
    switch (s) {
      case 0: return client !== null
      case 1: return !!area
      case 2: return picks.length > 0
      case 3: return !!info.name.trim()
      default: return true
    }
  }, [client, area, picks.length, info.name])
  const canNext = valid(step)
  const reachable = useCallback((s: number) => {
    for (let i = minStep; i < s; i++) if (!valid(i)) return false
    return true
  }, [minStep, valid])

  const goTo = useCallback((s: number) => {
    if (s >= minStep && s < STEPS.length && reachable(s)) setStep(s)
  }, [minStep, reachable])

  // ── quick fix richiamati dalla conferma ────────────────────────────────────
  const quickFix = useMemo(() => ({
    realignNaming: () => editStructure(s => applyNaming(s, ctx)),
    spreadDates: () => editStructure(s => spreadDueDates(s, info.startDate, info.targetEnd)),
    assignAllToPm: () => editStructure(s => s.map(w => ({
      ...w,
      milestones: w.milestones.map(m => ({
        ...m,
        owner_id: m.owner_id ?? (info.managerId || null),
        tasks: m.tasks.map(t => ({ ...t, assignee_id: t.assignee_id ?? (info.managerId || null) })),
      })),
    }))),
  }), [editStructure, ctx, info.startDate, info.targetEnd, info.managerId])

  // ── submit ─────────────────────────────────────────────────────────────────
  /** Data assoluta → giorni dall'avvio. Se non c'è avvio resta l'ancora del template. */
  const relDays = (due: string | null, fallback: number | null): number | null => {
    if (!due || !info.startDate) return fallback
    return Math.round(
      (new Date(due + 'T00:00:00').getTime() - new Date(info.startDate + 'T00:00:00').getTime()) / 86400000,
    )
  }

  function buildPayload(): WizardPayload {
    return {
      project: {
        client_id: client?.kind === 'client' ? client.id : null,
        name: info.name.trim(),
        description: info.description || null,
        area: area as string,
        service_type: primary?.service_type ?? 'custom',
        service_subtype: primary?.service_subtype ?? null,
        status,
        manager_id: info.managerId || null,
        priority: info.priority,
        visibility: client?.kind === 'client' ? info.visibility : 'internal',
        start_date: info.startDate || null,
        target_end_date: info.targetEnd || null,
      },
      members: team,
      workstreams: structure.map((w, i) => ({
        name: w.name,
        description: w.description,
        workstream_type: w.workstream_type,
        status: 'active',
        owner_id: w.owner_id,
        visibility: w.visibility,
        start_date: w.workstream_type === 'project' ? info.startDate || null : null,
        end_date: w.workstream_type === 'project' ? info.targetEnd || null : null,
        sort_order: i * 10,
        milestones: w.milestones.map((m, j) => ({
          title: m.title, description: m.description, deliverable: m.deliverable,
          milestone_type: m.milestone_type, owner_id: m.owner_id,
          due_date: m.due_date, visibility: m.visibility, sort_order: j * 10,
          tasks: m.tasks.map((t, k) => ({
            title: t.title, description: t.description, priority: t.priority,
            estimated_hours: t.estimated_hours, assignee_id: t.assignee_id, due_date: t.due_date,
            visibility: t.visibility, sort_order: k * 10,
          })),
        })),
        recurring: w.recurring.map(r => ({
          title: r.title, description: r.description, frequency: r.frequency, owner_id: r.owner_id,
          priority: r.priority, visibility: r.visibility, estimated_hours: r.estimated_hours,
        })),
      })),
    }
  }

  function submit() {
    start(async () => {
      try {
        const id = await createProjectFromWizard(buildPayload())
        if (saveTpl.on && saveTpl.name.trim() && structure.length) {
          // il template va salvato "nudo": niente prefissi di cliente o servizio
          try {
            await saveWizardTemplate({
              name: saveTpl.name, service_type: primary?.service_type ?? 'custom',
              service_subtype: primary?.service_subtype ?? null,
              // le date assolute tornano relative all'avvio: un template con
              // dentro il 12 marzo non è riutilizzabile, «+14 giorni» sì
              workstreams: structure.map(w => ({
                name: bareWorkstream(w.name, ctx) || w.name,
                description: w.description,
                workstream_type: w.workstream_type, visibility: w.visibility,
                recurring: w.recurring.map(r => ({
                  name: r.title, description: r.description, frequency: r.frequency, priority: r.priority,
                  visibility: r.visibility, estimated_hours: r.estimated_hours,
                  suggested_owner_role: r.owner_role,
                })),
                milestones: w.milestones.map(m => ({
                  name: bareMilestone(m.title), description: m.description,
                  milestone_type: m.milestone_type, visibility: m.visibility,
                  suggested_owner_role: m.owner_role,
                  relative_due_days: relDays(m.due_date, m.rel_days),
                  tasks: m.tasks.map(t => ({
                    name: bareTask(t.title), description: t.description, visibility: t.visibility,
                    priority: t.priority, estimated_hours: t.estimated_hours,
                    suggested_owner_role: t.owner_role,
                    relative_due_days: relDays(t.due_date, t.rel_days),
                  })),
                })),
              })),
            })
            toast.success('Template salvato')
          } catch (e) {
            toast.error(`Progetto creato, template no: ${e instanceof Error ? e.message : 'errore'}`)
          }
        }
        toast.success('Progetto creato', { action: { label: 'Apri', onClick: () => router.push(`${basePath}/${id}`) } })
        router.push(`${basePath}/${id}`)
        router.refresh()
        onClose()
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
    })
  }

  const last = step === STEPS.length - 1
  const advance = useCallback(() => { if (canNext && !last) setStep(s => s + 1) }, [canNext, last])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); advance() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, advance])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-scrim sm:p-4 animate-fade-in" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Nuovo progetto"
        className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-4xl h-[94vh] sm:h-[86vh] flex flex-col shadow-pop animate-slide-up pb-safe overflow-hidden">

        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text-primary font-heading">Nuovo progetto</h2>
            <p className="text-2xs text-text-tertiary truncate">
              {info.name || suggestedName || 'Compila i passaggi, il nome si costruisce da solo'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* rail verticale */}
          <nav aria-label="Passaggi" className="hidden md:flex flex-col gap-0.5 w-52 shrink-0 border-r border-border p-2 overflow-y-auto">
            {STEPS.map((s, i) => {
              const done = i < step && valid(i)
              const on = i === step
              const can = reachable(i) && i >= minStep
              return (
                <button key={s.key} type="button" onClick={() => goTo(i)} disabled={!can} aria-current={on ? 'step' : undefined}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                    on ? 'bg-gold-dim' : can ? 'hover:bg-surface-hover' : 'opacity-40 cursor-not-allowed'
                  }`}>
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-bold shrink-0 ${
                    on ? 'bg-gold text-on-gold' : done ? 'bg-success-dim text-success' : 'bg-surface-active text-text-tertiary'
                  }`}>
                    {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-2xs font-semibold truncate ${on ? 'text-text-primary' : 'text-text-secondary'}`}>{s.label}</span>
                    <span className="block text-2xs text-text-tertiary truncate">{s.hint}</span>
                  </span>
                </button>
              )
            })}
          </nav>

          {/* progress compatto su mobile */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="md:hidden px-4 py-2 border-b border-border shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-2xs font-semibold text-text-primary">{step + 1}. {STEPS[step].label}</span>
                <span className="text-2xs text-text-tertiary tabular">{step + 1}/{STEPS.length}</span>
              </div>
              <div className="h-1 rounded-full bg-surface-active overflow-hidden">
                <div className="h-full bg-gold transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 min-h-0">
              {step === 0 && <StepCliente clients={clients} value={client} onChange={setClient} />}
              {step === 1 && <StepArea value={area} onChange={a => { setArea(a); setPicks([]) }} counts={areaCounts} />}
              {step === 2 && area && (
                <StepWorkstream area={area} services={areaServices} templates={templates}
                  picks={picks} setPicks={setPicks} canPersist />
              )}
              {step === 3 && (
                <StepInfo state={info} suggestedName={suggestedName} profiles={profiles}
                  hasClient={client?.kind === 'client'}
                  patch={p => { if (p.name !== undefined) setNameTouched(true); setInfo(s => ({ ...s, ...p })) }} />
              )}
              {step === 4 && (
                <StepTeam profiles={profiles} team={team} setTeam={setTeam}
                  managerId={info.managerId} canInvite />
              )}
              {step === 5 && (
                <StepTemplate templates={templates} nodes={nodes}
                  serviceType={primary?.service_type ?? ''} serviceSubtype={primary?.service_subtype ?? null}
                  templateId={templateId} onPick={pickTemplate} structureTouched={structureTouched} />
              )}
              {step === 6 && (
                <StepStruttura structure={structure} setStructure={editStructure} team={teamPeople}
                  ctx={ctx} startDate={info.startDate} targetEnd={info.targetEnd} />
              )}
              {step === 7 && client && (
                <StepConferma
                  client={client} area={area} serviceLabel={picks.map(p => p.label).join(' · ')}
                  name={info.name} description={info.description}
                  startDate={info.startDate} targetEnd={info.targetEnd}
                  managerId={info.managerId} priority={info.priority} visibility={info.visibility}
                  team={team} profiles={profiles} structure={structure} offConvention={offConvention}
                  status={status} setStatus={setStatus} saveTpl={saveTpl} setSaveTpl={setSaveTpl}
                  goTo={goTo} quickFix={quickFix} />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3 border-t border-border shrink-0">
          <button onClick={() => setStep(s => Math.max(minStep, s - 1))} disabled={step === minStep}
            className="flex items-center gap-1 text-sm text-text-secondary disabled:opacity-30 hover:text-text-primary press">
            <ChevronLeft className="w-4 h-4" />Indietro
          </button>

          <span className="ml-auto hidden sm:flex items-center gap-2 text-2xs text-text-tertiary">
            {step === 6 && counts.ws > 0 && (
              <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" />{counts.ms} milestone · {counts.tk} task</span>
            )}
            <kbd className="px-1.5 py-0.5 rounded bg-surface-active font-sans">⌘⏎</kbd> avanti
          </span>

          {!last ? (
            <button onClick={advance} disabled={!canNext}
              className="flex items-center gap-1 text-sm font-semibold bg-gold text-on-gold px-4 py-2 rounded-xl disabled:opacity-40 press">
              Avanti<ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={submit} disabled={pending || !info.name.trim() || !client}
              className="flex items-center gap-1.5 text-sm font-semibold bg-gold text-on-gold px-4 py-2 rounded-xl disabled:opacity-40 press">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {pending ? 'Creo…' : status === 'active' ? 'Crea e attiva' : 'Crea bozza'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
