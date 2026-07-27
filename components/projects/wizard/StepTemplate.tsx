'use client'

import { useState, useMemo } from 'react'
import { FileStack, Sparkles, ChevronDown, FolderTree, Flag, CheckSquare, Repeat, Pencil } from 'lucide-react'
import { StepHead, Empty } from '@/components/shared/formkit'
import type { ProjectTemplate, ProjectTemplateNode } from '@/lib/types/database'

function countNodes(nodes: ProjectTemplateNode[], templateId: string) {
  const own = nodes.filter(n => n.template_id === templateId)
  return {
    ws: own.filter(n => n.node_type === 'workstream').length,
    ms: own.filter(n => n.node_type === 'milestone').length,
    tk: own.filter(n => n.node_type === 'task').length,
    rc: own.filter(n => n.node_type === 'recurring_task').length,
  }
}

export function StepTemplate({
  templates, nodes, serviceType, serviceSubtype, templateId, onPick, structureTouched,
}: {
  templates: ProjectTemplate[]
  nodes: ProjectTemplateNode[]
  serviceType: string
  serviceSubtype: string | null
  templateId: string | null
  onPick: (id: string | null) => void
  structureTouched: boolean
}) {
  const [showOthers, setShowOthers] = useState(false)

  const { matching, others } = useMemo(() => {
    const active = templates.filter(t => t.is_active)
    const m = active.filter(t => t.service_type === serviceType && (t.service_subtype ?? null) === serviceSubtype)
    return { matching: m, others: active.filter(t => !m.includes(t)) }
  }, [templates, serviceType, serviceSubtype])

  const selected = templateId ? templates.find(t => t.id === templateId) ?? null : null

  const card = (t: ProjectTemplate, suggested: boolean) => {
    const c = countNodes(nodes, t.id)
    const on = templateId === t.id
    return (
      <button key={t.id} type="button" onClick={() => onPick(t.id)} aria-pressed={on}
        className={`w-full text-left p-3 rounded-xl border transition-colors ${
          on ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'
        }`}>
        <div className="flex items-center gap-2">
          <FileStack className="w-4 h-4 text-gold-text shrink-0" />
          <span className="flex-1 text-sm font-semibold text-text-primary truncate">{t.name}</span>
          {suggested && (
            <span className="flex items-center gap-1 text-2xs font-semibold text-info shrink-0">
              <Sparkles className="w-3 h-3" />consigliato
            </span>
          )}
        </div>
        {t.description && <p className="text-2xs text-text-tertiary mt-1 line-clamp-2">{t.description}</p>}
        <div className="flex items-center gap-3 mt-2 text-2xs text-text-secondary tabular">
          <span className="flex items-center gap-1"><FolderTree className="w-3 h-3" />{c.ws}</span>
          <span className="flex items-center gap-1"><Flag className="w-3 h-3" />{c.ms}</span>
          <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3" />{c.tk}</span>
          {c.rc > 0 && <span className="flex items-center gap-1 text-success"><Repeat className="w-3 h-3" />{c.rc}</span>}
        </div>
      </button>
    )
  }

  return (
    <div>
      <StepHead title="Da dove partiamo?"
        hint="Il template è solo un punto di partenza: al passo successivo lo modifichi riga per riga." />

      {structureTouched && (
        <p className="flex items-center gap-1.5 text-2xs text-warning mb-3">
          <Pencil className="w-3.5 h-3.5 shrink-0" />
          Hai già modificato la struttura: cambiare template la riscrive da zero.
        </p>
      )}

      <div className="space-y-2">
        <button type="button" onClick={() => onPick(null)} aria-pressed={templateId === null}
          className={`w-full text-left p-3 rounded-xl border transition-colors ${
            templateId === null ? 'border-gold bg-gold-dim' : 'border-border hover:bg-surface-hover'
          }`}>
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-gold-text shrink-0" />
            <span className="text-sm font-semibold text-text-primary">Parti dai workstream scelti</span>
          </div>
          <p className="text-2xs text-text-tertiary mt-1">
            Un workstream vuoto per ogni voce selezionata al passo 3. La struttura la costruisci tu.
          </p>
        </button>

        {matching.length > 0 && matching.map(t => card(t, true))}

        {matching.length === 0 && (
          <Empty>Nessun template per questo workstream. Parti dai workstream scelti, oppure guarda gli altri template.</Empty>
        )}

        {others.length > 0 && (
          <div>
            <button type="button" onClick={() => setShowOthers(s => !s)} aria-expanded={showOthers}
              className="flex items-center gap-1.5 text-2xs font-semibold text-text-secondary hover:text-text-primary py-2">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showOthers ? '' : '-rotate-90'}`} />
              Altri template ({others.length})
            </button>
            {showOthers && <div className="space-y-2">{others.map(t => card(t, false))}</div>}
          </div>
        )}
      </div>

      {selected && (
        <div className="mt-4 rounded-xl border border-border bg-background/40 p-3">
          <div className="text-2xs font-semibold text-text-secondary mb-2">Anteprima · {selected.name}</div>
          <TemplateTree nodes={nodes} templateId={selected.id} />
        </div>
      )}
    </div>
  )
}

function TemplateTree({ nodes, templateId }: { nodes: ProjectTemplateNode[]; templateId: string }) {
  const own = nodes.filter(n => n.template_id === templateId)
  const byOrder = (a: ProjectTemplateNode, b: ProjectTemplateNode) => a.sort_order - b.sort_order
  const roots = own.filter(n => !n.parent_id && n.node_type === 'workstream').sort(byOrder)
  return (
    <div className="space-y-1.5 max-h-[26vh] overflow-y-auto pr-1">
      {roots.map(w => (
        <div key={w.id}>
          <div className="flex items-center gap-1.5 text-2xs font-semibold text-text-primary">
            <FolderTree className="w-3 h-3 text-gold-text shrink-0" />{w.name}
          </div>
          {own.filter(n => n.parent_id === w.id).sort(byOrder).map(c => (
            <div key={c.id} className="pl-4">
              <div className="flex items-center gap-1.5 text-2xs text-text-secondary">
                {c.node_type === 'recurring_task'
                  ? <Repeat className="w-3 h-3 text-success shrink-0" />
                  : <Flag className="w-3 h-3 text-info shrink-0" />}
                {c.name}
              </div>
              {own.filter(n => n.parent_id === c.id).sort(byOrder).map(t => (
                <div key={t.id} className="pl-4 flex items-center gap-1.5 text-2xs text-text-tertiary">
                  <CheckSquare className="w-3 h-3 shrink-0" />{t.name}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
