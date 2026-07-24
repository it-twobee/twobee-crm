'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  X, ChevronLeft, ChevronRight, Check, Plus, Trash2,
  FolderTree, Repeat, Flag, CheckSquare, Layers, AlertTriangle,
} from 'lucide-react'
import { createProjectFromWizard, type WizardPayload } from '@/app/actions/create-project'
import type {
  ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode,
  ProjectArea, Priority, Visibility,
} from '@/lib/types/database'

type Person = { id: string; full_name: string; app_role: string | null }
type ClientOpt = { id: string; name: string }

type WTask = { key: string; title: string; assignee_id: string | null; visibility: Visibility }
type WMilestone = { key: string; title: string; milestone_type: 'delivery' | 'system'; visibility: Visibility; tasks: WTask[] }
type WRecurring = { key: string; title: string; frequency: string; owner_role: string | null; owner_id: string | null; priority: Priority; visibility: Visibility; estimated_hours: number | null }
type WWorkstream = { key: string; name: string; workstream_type: 'project' | 'recurring'; owner_id: string | null; visibility: Visibility; milestones: WMilestone[]; recurring: WRecurring[] }

const AREAS: { key: ProjectArea; label: string; hint: string }[] = [
  { key: 'marketing', label: 'Marketing', hint: 'Branding, Social, Audit, Design, Eventi' },
  { key: 'growth', label: 'Growth', hint: 'Lead Generation, SaaS, E-commerce' },
  { key: 'digital', label: 'Digital', hint: 'AI Project, Digitalizzazione' },
]
const STEPS = ['Cliente', 'Area', 'Servizio', 'Info', 'Team', 'Template', 'Struttura', 'Conferma']

let _k = 0
const nk = () => `k${_k++}`

export function ProjectWizard({
  clients, profiles, services, templates, nodes, fixedClientId, onClose,
}: {
  clients: ClientOpt[]
  profiles: Person[]
  services: ServiceCatalogEntry[]
  templates: ProjectTemplate[]
  nodes: ProjectTemplateNode[]
  fixedClientId?: string
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [step, setStep] = useState(fixedClientId ? 1 : 0)

  // dati progetto
  const [clientId, setClientId] = useState(fixedClientId ?? '')
  const [area, setArea] = useState<ProjectArea | ''>('')
  const [serviceKey, setServiceKey] = useState('') // service_type[::subtype]
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [targetEnd, setTargetEnd] = useState('')
  const [managerId, setManagerId] = useState('')
  const [priority, setPriority] = useState<Priority>('media')
  const [visibility, setVisibility] = useState<Visibility>('internal')
  const [team, setTeam] = useState<string[]>([])
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [structure, setStructure] = useState<WWorkstream[]>([])

  const activeServices = useMemo(() => services.filter(s => s.is_active && s.area === area), [services, area])
  const service = useMemo(
    () => activeServices.find(s => s.service_type + (s.service_subtype ? `::${s.service_subtype}` : '') === serviceKey),
    [activeServices, serviceKey],
  )
  const matchingTemplates = useMemo(
    () => templates.filter(t => t.is_active && t.service_type === service?.service_type
      && (t.service_subtype ?? null) === (service?.service_subtype ?? null)),
    [templates, service],
  )
  const teamPeople = useMemo(() => profiles.filter(p => team.includes(p.id)), [profiles, team])

  function expandTemplate(tid: string | null): WWorkstream[] {
    if (!tid) return []
    const byOrder = (a: ProjectTemplateNode, b: ProjectTemplateNode) => a.sort_order - b.sort_order
    const wsNodes = nodes.filter(n => n.template_id === tid && !n.parent_id && n.node_type === 'workstream').sort(byOrder)
    return wsNodes.map(w => {
      const children = nodes.filter(n => n.parent_id === w.id).sort(byOrder)
      const recurring: WRecurring[] = []
      const milestones: WMilestone[] = []
      for (const c of children) {
        if (c.node_type === 'recurring_task') {
          recurring.push({ key: nk(), title: c.name, frequency: c.frequency ?? 'weekly', owner_role: c.suggested_owner_role, owner_id: null, priority: c.priority ?? 'media', visibility: c.visibility, estimated_hours: c.estimated_hours })
        } else if (c.node_type === 'milestone') {
          const tasks = nodes.filter(n => n.parent_id === c.id && n.node_type === 'task').sort(byOrder)
            .map(t => ({ key: nk(), title: t.name, assignee_id: null, visibility: t.visibility } as WTask))
          nodes.filter(n => n.parent_id === c.id && n.node_type === 'recurring_task').sort(byOrder)
            .forEach(r => recurring.push({ key: nk(), title: r.name, frequency: r.frequency ?? 'weekly', owner_role: r.suggested_owner_role, owner_id: null, priority: r.priority ?? 'media', visibility: r.visibility, estimated_hours: r.estimated_hours }))
          milestones.push({ key: nk(), title: c.name, milestone_type: (c.milestone_type ?? 'delivery') as 'delivery' | 'system', visibility: c.visibility, tasks })
        } else if (c.node_type === 'task') {
          const ms = milestones.find(m => m.title === 'Attività') ?? (() => { const m: WMilestone = { key: nk(), title: 'Attività', milestone_type: 'delivery', visibility: 'internal', tasks: [] }; milestones.push(m); return m })()
          ms.tasks.push({ key: nk(), title: c.name, assignee_id: null, visibility: c.visibility })
        }
      }
      return { key: nk(), name: w.name, workstream_type: (w.workstream_type ?? 'recurring') as 'project' | 'recurring', owner_id: null, visibility: w.visibility, milestones, recurring }
    })
  }

  function pickTemplate(tid: string | null) {
    setTemplateId(tid)
    setStructure(expandTemplate(tid))
  }

  // validazioni bloccanti per step
  const canNext = (): boolean => {
    switch (step) {
      case 0: return !!clientId
      case 1: return !!area
      case 2: return !!service
      case 3: return !!name.trim()
      default: return true
    }
  }

  const counts = useMemo(() => {
    let ms = 0, tk = 0, rc = 0
    structure.forEach(w => { ms += w.milestones.length; w.milestones.forEach(m => tk += m.tasks.length); rc += w.recurring.length })
    return { ws: structure.length, ms, tk, rc }
  }, [structure])

  function buildPayload(): WizardPayload {
    return {
      project: {
        client_id: clientId, name: name.trim(), description: description || null,
        area: area as string, service_type: service!.service_type, service_subtype: service!.service_subtype,
        status: 'draft', manager_id: managerId || null, priority, visibility,
        start_date: startDate || null, target_end_date: targetEnd || null,
      },
      members: team,
      workstreams: structure.map((w, i) => ({
        name: w.name, workstream_type: w.workstream_type, status: 'active',
        owner_id: w.owner_id, visibility: w.visibility, sort_order: i * 10,
        milestones: w.milestones.map((m, j) => ({
          title: m.title, milestone_type: m.milestone_type, visibility: m.visibility, sort_order: j * 10,
          tasks: m.tasks.map((t, k) => ({ title: t.title, assignee_id: t.assignee_id, visibility: t.visibility, sort_order: k * 10 })),
        })),
        recurring: w.recurring.map(r => ({
          title: r.title, frequency: r.frequency, owner_id: r.owner_id,
          priority: r.priority, visibility: r.visibility, estimated_hours: r.estimated_hours,
        })),
      })),
    }
  }

  function submit() {
    start(async () => {
      try {
        const id = await createProjectFromWizard(buildPayload())
        toast.success('Progetto creato')
        router.push(`/clienti/${clientId}`)
        router.refresh()
        onClose()
        void id
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
    })
  }

  const clientName = clients.find(c => c.id === clientId)?.name ?? ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* header + stepper */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Nuovo progetto</h2>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-1 px-4 py-3 border-b border-border overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 shrink-0">
              <span className={`text-2xs font-semibold px-2 py-1 rounded ${
                i === step ? 'bg-gold text-on-gold' : i < step ? 'text-gold-text' : 'text-text-tertiary'
              }`}>{i + 1}. {s}</span>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-text-tertiary" />}
            </div>
          ))}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 0 && (
            <StepBox title="Per quale cliente?">
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full bg-background border border-border-interactive rounded px-3 py-2 text-sm text-text-primary">
                <option value="">— seleziona cliente —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </StepBox>
          )}

          {step === 1 && (
            <StepBox title="Quale area?">
              <div className="grid grid-cols-3 gap-3">
                {AREAS.map(a => (
                  <button key={a.key} onClick={() => { setArea(a.key); setServiceKey(''); }}
                    className={`text-left p-4 rounded-lg border transition-colors ${
                      area === a.key ? 'border-gold bg-surface-active' : 'border-border hover:bg-surface-hover'
                    }`}>
                    <Layers className="w-5 h-5 text-gold-text mb-2" />
                    <div className="text-sm font-bold text-text-primary">{a.label}</div>
                    <div className="text-2xs text-text-tertiary mt-1">{a.hint}</div>
                  </button>
                ))}
              </div>
            </StepBox>
          )}

          {step === 2 && (
            <StepBox title="Quale servizio?">
              <div className="space-y-2">
                {activeServices.length === 0 && <p className="text-2xs text-text-tertiary">Nessun servizio attivo per quest&apos;area.</p>}
                {activeServices.map(s => {
                  const k = s.service_type + (s.service_subtype ? `::${s.service_subtype}` : '')
                  return (
                    <button key={k} onClick={() => { setServiceKey(k); if (!name) setName(`${s.label} — ${clientName}`) }}
                      className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${
                        serviceKey === k ? 'border-gold bg-surface-active text-text-primary' : 'border-border text-text-secondary hover:bg-surface-hover'
                      }`}>{s.label}</button>
                  )
                })}
              </div>
            </StepBox>
          )}

          {step === 3 && (
            <StepBox title="Informazioni principali">
              <div className="space-y-3">
                <FieldRow label="Nome progetto">
                  <input value={name} onChange={e => setName(e.target.value)}
                    className="w-full bg-background border border-border-interactive rounded px-3 py-2 text-sm text-text-primary" />
                </FieldRow>
                <FieldRow label="Descrizione / obiettivo">
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                    className="w-full bg-background border border-border-interactive rounded px-3 py-2 text-sm text-text-primary" />
                </FieldRow>
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="Data inizio"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-background border border-border-interactive rounded px-3 py-2 text-sm text-text-primary" /></FieldRow>
                  <FieldRow label="Fine desiderata"><input type="date" value={targetEnd} onChange={e => setTargetEnd(e.target.value)}
                    className="w-full bg-background border border-border-interactive rounded px-3 py-2 text-sm text-text-primary" /></FieldRow>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <FieldRow label="Project Manager">
                    <select value={managerId} onChange={e => setManagerId(e.target.value)}
                      className="w-full bg-background border border-border-interactive rounded px-3 py-2 text-sm text-text-primary">
                      <option value="">—</option>
                      {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  </FieldRow>
                  <FieldRow label="Priorità">
                    <select value={priority} onChange={e => setPriority(e.target.value as Priority)}
                      className="w-full bg-background border border-border-interactive rounded px-3 py-2 text-sm text-text-primary">
                      {(['alta', 'media', 'bassa'] as Priority[]).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </FieldRow>
                  <FieldRow label="Visibilità">
                    <select value={visibility} onChange={e => setVisibility(e.target.value as Visibility)}
                      className="w-full bg-background border border-border-interactive rounded px-3 py-2 text-sm text-text-primary">
                      <option value="internal">Interna</option>
                      <option value="client_visible">Visibile al cliente</option>
                    </select>
                  </FieldRow>
                </div>
              </div>
            </StepBox>
          )}

          {step === 4 && (
            <StepBox title="Team di progetto">
              <div className="grid grid-cols-2 gap-2">
                {profiles.map(p => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-2 rounded border border-border cursor-pointer hover:bg-surface-hover">
                    <input type="checkbox" checked={team.includes(p.id)}
                      onChange={e => setTeam(t => e.target.checked ? [...t, p.id] : t.filter(x => x !== p.id))} />
                    <span className="text-sm text-text-primary">{p.full_name}</span>
                    <span className="text-2xs text-text-tertiary ml-auto">{p.app_role}</span>
                  </label>
                ))}
              </div>
            </StepBox>
          )}

          {step === 5 && (
            <StepBox title="Parti da un template?">
              <div className="space-y-2">
                <button onClick={() => pickTemplate(null)}
                  className={`w-full text-left px-3 py-2 rounded border text-sm ${templateId === null && structure.length === 0 ? 'border-gold bg-surface-active text-text-primary' : 'border-border text-text-secondary hover:bg-surface-hover'}`}>
                  Progetto vuoto (aggiungo io la struttura)
                </button>
                {matchingTemplates.map(t => (
                  <button key={t.id} onClick={() => pickTemplate(t.id)}
                    className={`w-full text-left px-3 py-2 rounded border text-sm ${templateId === t.id ? 'border-gold bg-surface-active text-text-primary' : 'border-border text-text-secondary hover:bg-surface-hover'}`}>
                    <div className="font-semibold">{t.name}</div>
                    {t.description && <div className="text-2xs text-text-tertiary mt-0.5">{t.description}</div>}
                  </button>
                ))}
                {matchingTemplates.length === 0 && <p className="text-2xs text-text-tertiary">Nessun template per questo servizio: parti da vuoto.</p>}
              </div>
            </StepBox>
          )}

          {step === 6 && (
            <StepBox title="Struttura del progetto">
              <StructureEditor structure={structure} setStructure={setStructure} team={teamPeople} />
            </StepBox>
          )}

          {step === 7 && (
            <StepBox title="Conferma">
              <div className="space-y-3">
                <SummaryRow label="Cliente" value={clientName} />
                <SummaryRow label="Progetto" value={name} />
                <SummaryRow label="Area / Servizio" value={`${area} · ${service?.label ?? ''}`} />
                <SummaryRow label="PM" value={profiles.find(p => p.id === managerId)?.full_name ?? '—'} />
                <SummaryRow label="Team" value={team.length ? `${team.length} persone` : '—'} />
                <SummaryRow label="Struttura" value={`${counts.ws} sottoprogetti · ${counts.ms} milestone · ${counts.tk} task · ${counts.rc} ricorrenti`} />
                {counts.ws === 0 && (
                  <div className="flex items-center gap-2 text-2xs text-warning">
                    <AlertTriangle className="w-3.5 h-3.5" />Progetto senza struttura: potrai aggiungerla dopo.
                  </div>
                )}
              </div>
            </StepBox>
          )}
        </div>

        {/* footer nav */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <button
            onClick={() => setStep(s => Math.max(fixedClientId ? 1 : 0, s - 1))}
            disabled={step === (fixedClientId ? 1 : 0)}
            className="flex items-center gap-1 text-sm text-text-secondary disabled:opacity-30 hover:text-text-primary">
            <ChevronLeft className="w-4 h-4" />Indietro
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => canNext() && setStep(s => s + 1)} disabled={!canNext()}
              className="flex items-center gap-1 text-sm font-semibold bg-gold text-on-gold px-4 py-2 rounded disabled:opacity-40">
              Avanti<ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={submit} disabled={pending || !name.trim() || !clientId}
              className="flex items-center gap-1 text-sm font-semibold bg-gold text-on-gold px-4 py-2 rounded disabled:opacity-40">
              <Check className="w-4 h-4" />{pending ? 'Creo…' : 'Crea progetto'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── editor struttura ──────────────────────────────────────────────────────────
function StructureEditor({
  structure, setStructure, team,
}: {
  structure: WWorkstream[]
  setStructure: React.Dispatch<React.SetStateAction<WWorkstream[]>>
  team: Person[]
}) {
  const addWs = () => setStructure(s => [...s, { key: nk(), name: 'Nuovo sottoprogetto', workstream_type: 'project', owner_id: null, visibility: 'internal', milestones: [], recurring: [] }])
  const upd = (key: string, fn: (w: WWorkstream) => WWorkstream) => setStructure(s => s.map(w => w.key === key ? fn(w) : w))
  const del = (key: string) => setStructure(s => s.filter(w => w.key !== key))

  return (
    <div className="space-y-3">
      {structure.length === 0 && <p className="text-2xs text-text-tertiary">Nessun sottoprogetto. Aggiungine uno o torna indietro per scegliere un template.</p>}
      {structure.map(w => (
        <div key={w.key} className="border border-border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <FolderTree className="w-4 h-4 text-gold-text" />
            <input value={w.name} onChange={e => upd(w.key, x => ({ ...x, name: e.target.value }))}
              className="flex-1 bg-transparent text-sm font-semibold text-text-primary border-b border-transparent focus:border-border-interactive" />
            <span className="text-2xs text-text-tertiary">{w.workstream_type === 'recurring' ? 'Continuativa' : 'Una tantum'}</span>
            <button onClick={() => del(w.key)} aria-label="Elimina sottoprogetto" className="text-error"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>

          {/* ricorrenti */}
          {w.recurring.map(r => (
            <div key={r.key} className="flex items-center gap-2 py-0.5 pl-6 group">
              <Repeat className="w-3.5 h-3.5 text-success" />
              <span className="flex-1 text-sm text-text-primary">{r.title}</span>
              <span className="text-2xs text-success">{r.frequency}</span>
              {r.owner_role && <span className="text-2xs text-text-tertiary">{r.owner_role}</span>}
              {r.visibility === 'client_visible' && <span className="text-2xs text-info">cliente</span>}
              <button onClick={() => upd(w.key, x => ({ ...x, recurring: x.recurring.filter(y => y.key !== r.key) }))}
                aria-label="Elimina ricorrente" className="text-error opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}

          {/* milestone + task */}
          {w.milestones.map(m => (
            <div key={m.key} className="pl-6">
              <div className="flex items-center gap-2 py-0.5 group">
                <Flag className="w-3.5 h-3.5 text-info" />
                <span className="flex-1 text-sm text-text-primary">{m.title}</span>
                {m.milestone_type === 'system' && <span className="text-2xs text-text-tertiary">sistema</span>}
                <button onClick={() => upd(w.key, x => ({ ...x, milestones: x.milestones.filter(y => y.key !== m.key) }))}
                  aria-label="Elimina milestone" className="text-error opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
              </div>
              {m.tasks.map(t => (
                <div key={t.key} className="flex items-center gap-2 py-0.5 pl-6 group">
                  <CheckSquare className="w-3 h-3 text-text-secondary" />
                  <span className="flex-1 text-sm text-text-primary">{t.title}</span>
                  <select value={t.assignee_id ?? ''} aria-label="Assegnatario"
                    onChange={e => upd(w.key, x => ({ ...x, milestones: x.milestones.map(mm => mm.key === m.key ? { ...mm, tasks: mm.tasks.map(tt => tt.key === t.key ? { ...tt, assignee_id: e.target.value || null } : tt) } : mm) }))}
                    className="text-2xs bg-background border border-border rounded px-1 py-0.5 text-text-secondary">
                    <option value="">—</option>
                    {team.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                  <button onClick={() => upd(w.key, x => ({ ...x, milestones: x.milestones.map(mm => mm.key === m.key ? { ...mm, tasks: mm.tasks.filter(tt => tt.key !== t.key) } : mm) }))}
                    aria-label="Elimina task" className="text-error opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
              <button onClick={() => upd(w.key, x => ({ ...x, milestones: x.milestones.map(mm => mm.key === m.key ? { ...mm, tasks: [...mm.tasks, { key: nk(), title: 'Nuova task', assignee_id: null, visibility: 'internal' }] } : mm) }))}
                className="ml-12 flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text"><Plus className="w-3 h-3" />Task</button>
            </div>
          ))}

          <div className="flex items-center gap-3 pl-6 pt-1">
            <button onClick={() => upd(w.key, x => ({ ...x, recurring: [...x.recurring, { key: nk(), title: 'Nuova ricorrente', frequency: 'weekly', owner_role: null, owner_id: null, priority: 'media', visibility: 'internal', estimated_hours: null }] }))}
              className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text"><Plus className="w-3 h-3" />Ricorrente</button>
            <button onClick={() => upd(w.key, x => ({ ...x, milestones: [...x.milestones, { key: nk(), title: 'Nuova milestone', milestone_type: 'delivery', visibility: 'internal', tasks: [] }] }))}
              className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text"><Plus className="w-3 h-3" />Milestone</button>
          </div>
        </div>
      ))}
      <button onClick={addWs} className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80"><Plus className="w-3.5 h-3.5" />Sottoprogetto</button>
    </div>
  )
}

function StepBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-text-primary mb-3">{title}</h3>
      {children}
    </div>
  )
}
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-2xs font-semibold text-text-secondary mb-1">{label}</span>
      {children}
    </label>
  )
}
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2">
      <span className="text-2xs text-text-tertiary">{label}</span>
      <span className="text-sm text-text-primary text-right">{value}</span>
    </div>
  )
}
