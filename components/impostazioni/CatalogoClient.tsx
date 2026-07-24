'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, Copy, ChevronRight, ChevronDown, Power, X,
  FolderTree, Repeat, Flag, CheckSquare, Layers,
} from 'lucide-react'
import {
  createService, updateService, deleteService,
} from '@/app/actions/service-catalog'
import {
  createTemplate, updateTemplate, deleteTemplate, duplicateTemplate,
  createNode, updateNode, deleteNode,
} from '@/app/actions/project-templates'
import type {
  ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode,
  ProjectArea, RecurrenceFrequency, Priority, Visibility,
} from '@/lib/types/database'

const AREAS: { key: ProjectArea; label: string }[] = [
  { key: 'marketing', label: 'Marketing' },
  { key: 'growth', label: 'Growth' },
  { key: 'digital', label: 'Digital' },
]
const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'custom']
const PRIORITIES: Priority[] = ['alta', 'media', 'bassa']
const VISIBILITIES: Visibility[] = ['internal', 'client_visible']

type NodeType = ProjectTemplateNode['node_type']
const NODE_ICON: Record<NodeType, React.ReactNode> = {
  workstream: <FolderTree className="w-3.5 h-3.5 text-gold-text" />,
  milestone: <Flag className="w-3.5 h-3.5 text-info" />,
  task: <CheckSquare className="w-3.5 h-3.5 text-text-secondary" />,
  recurring_task: <Repeat className="w-3.5 h-3.5 text-success" />,
}
const CHILD_TYPES: Record<NodeType, NodeType[]> = {
  workstream: ['milestone', 'task', 'recurring_task'],
  milestone: ['task', 'recurring_task'],
  task: [],
  recurring_task: [],
}
const NODE_LABEL: Record<NodeType, string> = {
  workstream: 'Sottoprogetto', milestone: 'Milestone', task: 'Task', recurring_task: 'Task ricorrente',
}

export function CatalogoClient({
  services, templates, nodes,
}: {
  services: ServiceCatalogEntry[]
  templates: ProjectTemplate[]
  nodes: ProjectTemplateNode[]
}) {
  const [tab, setTab] = useState<'servizi' | 'template'>('servizi')

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Catalogo & Template progetto</h1>
        <p className="text-sm text-text-secondary mt-1">
          Tassonomia servizi e strutture predefinite usate dal wizard di creazione progetto.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(['servizi', 'template'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-gold text-gold-text' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t === 'servizi' ? 'Servizi' : 'Template'}
          </button>
        ))}
      </div>

      {tab === 'servizi'
        ? <ServiziPanel services={services} />
        : <TemplatePanel services={services} templates={templates} nodes={nodes} />}
    </div>
  )
}

// ═════════════════════════════════════════ SERVIZI ═════════════════════════
function ServiziPanel({ services }: { services: ServiceCatalogEntry[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState<ProjectArea | null>(null)

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try { await fn(); router.refresh(); toast.success(ok) }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
    })

  return (
    <div className="space-y-6">
      {AREAS.map(area => {
        const rows = services.filter(s => s.area === area.key)
        return (
          <section key={area.key} className="bg-surface border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Layers className="w-4 h-4 text-gold-text" />{area.label}
              </h2>
              <button
                onClick={() => setAdding(area.key)}
                className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80">
                <Plus className="w-3.5 h-3.5" />Nuovo servizio
              </button>
            </div>
            <div className="space-y-1">
              {rows.length === 0 && <p className="text-2xs text-text-tertiary">Nessun servizio.</p>}
              {rows.map(s => (
                <ServiceRow key={s.id} s={s} pending={pending} run={run} />
              ))}
            </div>
            {adding === area.key && (
              <ServiceForm
                area={area.key}
                onCancel={() => setAdding(null)}
                onSave={(input) => { run(() => createService(input), 'Servizio creato'); setAdding(null) }}
              />
            )}
          </section>
        )
      })}
    </div>
  )
}

function ServiceRow({
  s, pending, run,
}: {
  s: ServiceCatalogEntry
  pending: boolean
  run: (fn: () => Promise<unknown>, ok: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(s.label)

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1">
        <input
          value={label} onChange={e => setLabel(e.target.value)} autoFocus
          className="flex-1 bg-background border border-border-interactive rounded px-2 py-1 text-sm text-text-primary"
        />
        <button
          disabled={pending}
          onClick={() => { run(() => updateService(s.id, { label }), 'Salvato'); setEditing(false) }}
          className="text-2xs font-semibold bg-gold text-on-gold px-2 py-1 rounded">Salva</button>
        <button onClick={() => { setEditing(false); setLabel(s.label) }} aria-label="Annulla" className="text-text-tertiary"><X className="w-4 h-4" /></button>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 py-1 group ${s.is_active ? '' : 'opacity-50'}`}>
      <span className="flex-1 text-sm text-text-primary">{s.label}</span>
      <code className="text-2xs text-text-tertiary">{s.service_type}{s.service_subtype ? `/${s.service_subtype}` : ''}</code>
      <button
        onClick={() => run(() => updateService(s.id, { is_active: !s.is_active }), s.is_active ? 'Disattivato' : 'Attivato')}
        aria-label={s.is_active ? 'Disattiva' : 'Attiva'}
        className={`p-1 rounded ${s.is_active ? 'text-success' : 'text-text-tertiary'} hover:bg-surface-hover`}>
        <Power className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => setEditing(true)} aria-label="Modifica" className="p-1 rounded text-text-secondary hover:bg-surface-hover">
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => { if (confirm(`Eliminare "${s.label}"?`)) run(() => deleteService(s.id), 'Eliminato') }}
        aria-label="Elimina" className="p-1 rounded text-error hover:bg-surface-hover">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function ServiceForm({
  area, onSave, onCancel,
}: {
  area: ProjectArea
  onSave: (input: { area: ProjectArea; service_type: string; service_subtype?: string | null; label: string }) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [subtype, setSubtype] = useState('')

  return (
    <div className="mt-3 border-t border-border pt-3 grid grid-cols-3 gap-2 items-end">
      <Field label="Etichetta">
        <input value={label} onChange={e => setLabel(e.target.value)}
          className="w-full bg-background border border-border-interactive rounded px-2 py-1 text-sm text-text-primary" />
      </Field>
      <Field label="Codice (service_type)">
        <input value={serviceType} onChange={e => setServiceType(e.target.value)} placeholder="es. branding"
          className="w-full bg-background border border-border-interactive rounded px-2 py-1 text-sm text-text-primary" />
      </Field>
      <Field label="Sottotipo (opz.)">
        <input value={subtype} onChange={e => setSubtype(e.target.value)} placeholder="es. crm"
          className="w-full bg-background border border-border-interactive rounded px-2 py-1 text-sm text-text-primary" />
      </Field>
      <div className="col-span-3 flex gap-2 justify-end">
        <button onClick={onCancel} className="text-2xs font-semibold text-text-secondary px-3 py-1.5">Annulla</button>
        <button
          disabled={!label.trim() || !serviceType.trim()}
          onClick={() => onSave({ area, label, service_type: serviceType, service_subtype: subtype || null })}
          className="text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded disabled:opacity-40">Crea</button>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════ TEMPLATE ════════════════════════
function TemplatePanel({
  services, templates, nodes,
}: {
  services: ServiceCatalogEntry[]
  templates: ProjectTemplate[]
  nodes: ProjectTemplateNode[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [creating, setCreating] = useState(false)

  const serviceOptions = useMemo(
    () => services.filter(s => s.is_active).map(s => ({
      value: s.service_type + (s.service_subtype ? `::${s.service_subtype}` : ''),
      service_type: s.service_type, service_subtype: s.service_subtype, label: s.label,
    })),
    [services],
  )
  const labelFor = (t: ProjectTemplate) =>
    services.find(s => s.service_type === t.service_type && (s.service_subtype ?? null) === (t.service_subtype ?? null))?.label
    ?? t.service_type

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try { await fn(); router.refresh(); toast.success(ok) }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
    })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded">
          <Plus className="w-3.5 h-3.5" />Nuovo template
        </button>
      </div>

      {creating && (
        <TemplateForm
          serviceOptions={serviceOptions}
          onCancel={() => setCreating(false)}
          onSave={(input) => { run(() => createTemplate(input), 'Template creato'); setCreating(false) }}
        />
      )}

      {templates.length === 0 && !creating && (
        <p className="text-sm text-text-tertiary text-center py-8">Nessun template. Creane uno o esegui il seed (mig 150).</p>
      )}

      {templates.map(t => (
        <TemplateCard
          key={t.id} template={t} serviceLabel={labelFor(t)}
          nodes={nodes.filter(n => n.template_id === t.id)}
          pending={pending} run={run}
        />
      ))}
    </div>
  )
}

function TemplateForm({
  serviceOptions, onSave, onCancel,
}: {
  serviceOptions: { value: string; service_type: string; service_subtype: string | null; label: string }[]
  onSave: (input: { service_type: string; service_subtype?: string | null; name: string; description?: string | null }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sel, setSel] = useState(serviceOptions[0]?.value ?? '')
  const opt = serviceOptions.find(o => o.value === sel)

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Servizio">
          <select value={sel} onChange={e => setSel(e.target.value)}
            className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary">
            {serviceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Nome template">
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary" />
        </Field>
      </div>
      <Field label="Descrizione (opz.)">
        <input value={description} onChange={e => setDescription(e.target.value)}
          className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary" />
      </Field>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-2xs font-semibold text-text-secondary px-3 py-1.5">Annulla</button>
        <button
          disabled={!name.trim() || !opt}
          onClick={() => opt && onSave({ service_type: opt.service_type, service_subtype: opt.service_subtype, name, description: description || null })}
          className="text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded disabled:opacity-40">Crea</button>
      </div>
    </div>
  )
}

function TemplateCard({
  template, serviceLabel, nodes, pending, run,
}: {
  template: ProjectTemplate
  serviceLabel: string
  nodes: ProjectTemplateNode[]
  pending: boolean
  run: (fn: () => Promise<unknown>, ok: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [addRoot, setAddRoot] = useState(false)
  const roots = nodes.filter(n => !n.parent_id)

  return (
    <div className={`bg-surface border border-border rounded-lg ${template.is_active ? '' : 'opacity-60'}`}>
      <div className="flex items-center gap-2 p-3">
        <button onClick={() => setOpen(o => !o)} aria-label="Espandi" className="text-text-secondary">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text-primary truncate">{template.name}</div>
          <div className="text-2xs text-text-tertiary">{serviceLabel} · {nodes.length} nodi</div>
        </div>
        <button
          onClick={() => run(() => updateTemplate(template.id, { is_active: !template.is_active }), template.is_active ? 'Disattivato' : 'Attivato')}
          aria-label="Attiva/Disattiva" className={`p-1 rounded ${template.is_active ? 'text-success' : 'text-text-tertiary'} hover:bg-surface-hover`}>
          <Power className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => run(() => duplicateTemplate(template.id), 'Duplicato')} aria-label="Duplica" className="p-1 rounded text-text-secondary hover:bg-surface-hover">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => { if (confirm(`Eliminare il template "${template.name}" e tutti i suoi nodi?`)) run(() => deleteTemplate(template.id), 'Eliminato') }}
          aria-label="Elimina" className="p-1 rounded text-error hover:bg-surface-hover">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="border-t border-border p-3 space-y-1">
          {roots.length === 0 && <p className="text-2xs text-text-tertiary">Nessun sottoprogetto. Aggiungine uno.</p>}
          {roots.map(n => (
            <NodeBranch key={n.id} node={n} allNodes={nodes} depth={0} pending={pending} run={run} />
          ))}
          {addRoot ? (
            <NodeModal
              templateId={template.id} parentId={null} nodeType="workstream"
              onClose={() => setAddRoot(false)}
              onSave={(input) => { run(() => createNode(input), 'Aggiunto'); setAddRoot(false) }}
            />
          ) : (
            <button onClick={() => setAddRoot(true)}
              className="mt-2 flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80">
              <Plus className="w-3.5 h-3.5" />Sottoprogetto
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function NodeBranch({
  node, allNodes, depth, pending, run,
}: {
  node: ProjectTemplateNode
  allNodes: ProjectTemplateNode[]
  depth: number
  pending: boolean
  run: (fn: () => Promise<unknown>, ok: string) => void
}) {
  const children = allNodes.filter(n => n.parent_id === node.id)
  const [addType, setAddType] = useState<NodeType | null>(null)
  const [editing, setEditing] = useState(false)
  const addable = CHILD_TYPES[node.node_type]

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="flex items-center gap-2 py-1 group">
        {NODE_ICON[node.node_type]}
        <span className="flex-1 text-sm text-text-primary">{node.name}</span>
        {node.frequency && <span className="text-2xs text-success">{node.frequency}</span>}
        {node.visibility === 'client_visible' && <span className="text-2xs text-info">cliente</span>}
        {node.suggested_owner_role && <span className="text-2xs text-text-tertiary">{node.suggested_owner_role}</span>}
        <button onClick={() => setEditing(true)} aria-label="Modifica" className="p-0.5 text-text-secondary hover:text-text-primary opacity-0 group-hover:opacity-100">
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={() => { if (confirm(`Eliminare "${node.name}"${children.length ? ' e i suoi figli' : ''}?`)) run(() => deleteNode(node.id), 'Eliminato') }}
          aria-label="Elimina" className="p-0.5 text-error hover:opacity-80 opacity-0 group-hover:opacity-100">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {children.map(c => (
        <NodeBranch key={c.id} node={c} allNodes={allNodes} depth={depth + 1} pending={pending} run={run} />
      ))}

      {addable.length > 0 && (
        <div style={{ marginLeft: 16 }} className="flex items-center gap-2 py-0.5">
          {addable.map(t => (
            <button key={t} onClick={() => setAddType(t)}
              className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text">
              <Plus className="w-3 h-3" />{NODE_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      {editing && (
        <NodeModal
          templateId={node.template_id} parentId={node.parent_id} nodeType={node.node_type} initial={node}
          onClose={() => setEditing(false)}
          onSave={(input) => { run(() => updateNode(node.id, input), 'Salvato'); setEditing(false) }}
        />
      )}
      {addType && (
        <NodeModal
          templateId={node.template_id} parentId={node.id} nodeType={addType}
          onClose={() => setAddType(null)}
          onSave={(input) => { run(() => createNode(input), 'Aggiunto'); setAddType(null) }}
        />
      )}
    </div>
  )
}

// Modale create/edit nodo. In create passa i campi completi; in edit un sottoinsieme.
function NodeModal({
  templateId, parentId, nodeType, initial, onSave, onClose,
}: {
  templateId: string
  parentId: string | null
  nodeType: NodeType
  initial?: ProjectTemplateNode
  onSave: (input: any) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [ownerRole, setOwnerRole] = useState(initial?.suggested_owner_role ?? '')
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'media')
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'internal')
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(initial?.frequency ?? 'weekly')
  const [hours, setHours] = useState<string>(initial?.estimated_hours != null ? String(initial.estimated_hours) : '')
  const [dueDays, setDueDays] = useState<string>(initial?.relative_due_days != null ? String(initial.relative_due_days) : '')

  const isRecurring = nodeType === 'recurring_task'
  const isTaskish = nodeType === 'task' || nodeType === 'recurring_task'
  const isWorkstream = nodeType === 'workstream'
  const isMilestone = nodeType === 'milestone'

  const submit = () => {
    const base: any = { name }
    if (initial) {
      base.suggested_owner_role = ownerRole || null
      if (isTaskish) { base.priority = priority; base.visibility = visibility; base.estimated_hours = hours ? Number(hours) : null }
      if (isRecurring) base.frequency = frequency
      if (isMilestone || isTaskish) base.relative_due_days = dueDays ? Number(dueDays) : null
      onSave(base)
    } else {
      onSave({
        template_id: templateId,
        parent_id: parentId,
        node_type: nodeType,
        name,
        workstream_type: isWorkstream ? 'recurring' : null,
        milestone_type: isMilestone ? 'delivery' : null,
        frequency: isRecurring ? frequency : null,
        suggested_owner_role: ownerRole || null,
        relative_due_days: dueDays ? Number(dueDays) : null,
        priority: isTaskish ? priority : null,
        visibility,
        estimated_hours: hours ? Number(hours) : null,
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg w-full max-w-md p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary">
            {initial ? 'Modifica' : 'Nuovo'} {NODE_LABEL[nodeType].toLowerCase()}
          </h3>
          <button onClick={onClose} aria-label="Chiudi" className="text-text-tertiary"><X className="w-4 h-4" /></button>
        </div>

        <Field label="Nome">
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary" />
        </Field>

        {isRecurring && (
          <Field label="Frequenza">
            <select value={frequency} onChange={e => setFrequency(e.target.value as RecurrenceFrequency)}
              className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary">
              {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        )}

        {!isWorkstream && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner suggerito">
              <input value={ownerRole} onChange={e => setOwnerRole(e.target.value)} placeholder="es. Media Buyer"
                className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary" />
            </Field>
            {isTaskish && (
              <Field label="Priorità">
                <select value={priority} onChange={e => setPriority(e.target.value as Priority)}
                  className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary">
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            )}
          </div>
        )}

        {isTaskish && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ore stimate">
              <input value={hours} onChange={e => setHours(e.target.value)} type="number" step="0.5"
                className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary" />
            </Field>
            <Field label="Scadenza relativa (gg)">
              <input value={dueDays} onChange={e => setDueDays(e.target.value)} type="number"
                className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary" />
            </Field>
          </div>
        )}

        {!isWorkstream && (
          <Field label="Visibilità">
            <select value={visibility} onChange={e => setVisibility(e.target.value as Visibility)}
              className="w-full bg-background border border-border-interactive rounded px-2 py-1.5 text-sm text-text-primary">
              {VISIBILITIES.map(v => <option key={v} value={v}>{v === 'internal' ? 'Interna' : 'Visibile al cliente'}</option>)}
            </select>
          </Field>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="text-2xs font-semibold text-text-secondary px-3 py-1.5">Annulla</button>
          <button disabled={!name.trim()} onClick={submit}
            className="text-2xs font-semibold bg-gold text-on-gold px-3 py-1.5 rounded disabled:opacity-40">
            {initial ? 'Salva' : 'Aggiungi'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-2xs font-semibold text-text-secondary mb-1">{label}</span>
      {children}
    </label>
  )
}
