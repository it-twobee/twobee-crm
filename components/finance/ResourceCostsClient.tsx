'use client'

import { useState } from 'react'
import { Plus, X, Loader2, Euro, Pencil, Power, Calculator } from 'lucide-react'
import { toast } from 'sonner'
import { createResourceCost, updateResourceCost, toggleResourceCost, type ResourceCostInput } from '@/app/actions/resource-costs'
import type { ResourceCost, ResourceType, ResourceCostType, Profile } from '@/lib/types/database'

const TYPE_LABEL: Record<ResourceType, string> = {
  internal_employee: 'Dipendente', external_freelancer: 'Freelance', partner: 'Partner',
  agency_supplier: 'Fornitore', consultant: 'Consulente', contractor: 'Contractor',
}
const COST_TYPE_LABEL: Record<ResourceCostType, string> = {
  monthly_salary: 'Stipendio mensile', hourly: 'Tariffa oraria', daily: 'Tariffa giornaliera',
  project_fee: 'Fee a progetto', retainer: 'Retainer', partner_percentage: '% Partner',
}
const TYPE_COLOR: Record<ResourceType, string> = {
  internal_employee: 'var(--color-success)', external_freelancer: 'var(--color-info)', partner: 'var(--color-gold-text)',
  agency_supplier: 'var(--color-warning)', consultant: 'var(--color-accent)', contractor: 'var(--color-info)',
}

const eur = (v: number | null | undefined) => v == null ? '—' : `€${v.toLocaleString('it-IT')}`

const EMPTY: ResourceCostInput = {
  profile_id: null, name: '', resource_type: 'internal_employee', role_title: null,
  department: null, seniority: null, cost_type: 'monthly_salary',
  monthly_cost: null, hourly_cost: null, daily_cost: null, project_fee: null, partner_percentage: null,
  tools_cost_monthly: 0, overhead_percentage: 0, availability_hours_month: 160,
  billable_target_hours_month: 120, markup_default: 2, is_active: true, notes: null,
}

function CostForm({ initial, profiles, onClose, onSaved }: {
  initial: ResourceCost | null
  profiles: Pick<Profile, 'id' | 'full_name'>[]
  onClose: () => void
  onSaved: (r: ResourceCost) => void
}) {
  const [form, setForm] = useState<ResourceCostInput>(initial ?? EMPTY)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof ResourceCostInput>(k: K, v: ResourceCostInput[K]) => setForm(p => ({ ...p, [k]: v }))
  const num = (s: string) => s === '' ? null : parseFloat(s)
  const ic = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-gold'

  // Anteprima locale del costo orario (stessa formula della server action)
  const preview = (() => {
    const billable = form.billable_target_hours_month > 0 ? form.billable_target_hours_month : 120
    if (['monthly_salary', 'retainer'].includes(form.cost_type) && form.monthly_cost != null)
      return (form.monthly_cost * (1 + (form.overhead_percentage ?? 0) / 100) + (form.tools_cost_monthly ?? 0)) / billable
    if (form.cost_type === 'hourly') return form.hourly_cost
    if (form.cost_type === 'daily' && form.daily_cost != null) return form.daily_cost / 8
    return null
  })()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Nome obbligatorio'); return }
    setSaving(true)
    try {
      const saved = initial
        ? await updateResourceCost(initial.id, form)
        : await createResourceCost(form)
      onSaved(saved)
      toast.success(initial ? 'Risorsa aggiornata' : 'Risorsa creata')
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally { setSaving(false) }
  }

  const isMonthly = ['monthly_salary', 'retainer'].includes(form.cost_type)

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <h2 className="text-base font-bold text-text-primary">{initial ? 'Modifica risorsa' : 'Nuova risorsa'}</h2>
          <button type="button" onClick={onClose}><X className="w-5 h-5 text-text-secondary" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Nome *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="es. Mario Rossi / Studio XYZ" className={ic} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Profilo interno (opzionale)</label>
              <select value={form.profile_id ?? ''} onChange={e => set('profile_id', e.target.value || null)} className={ic}>
                <option value="">— Nessuno —</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Tipo risorsa</label>
              <select value={form.resource_type} onChange={e => set('resource_type', e.target.value as ResourceType)} className={ic}>
                {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Tipo costo</label>
              <select value={form.cost_type} onChange={e => set('cost_type', e.target.value as ResourceCostType)} className={ic}>
                {Object.entries(COST_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Ruolo</label>
              <input value={form.role_title ?? ''} onChange={e => set('role_title', e.target.value || null)} placeholder="es. Developer senior" className={ic} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Reparto</label>
              <select value={form.department ?? ''} onChange={e => set('department', e.target.value || null)} className={ic}>
                <option value="">— Nessuno —</option>
                {['growth', 'marketing', 'digital', 'ai'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="border-t border-border pt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {isMonthly && (
              <div>
                <label className="block text-xs text-text-secondary mb-1">Costo mensile €</label>
                <input type="number" step="0.01" value={form.monthly_cost ?? ''} onChange={e => set('monthly_cost', num(e.target.value))} className={ic} />
              </div>
            )}
            {form.cost_type === 'hourly' && (
              <div>
                <label className="block text-xs text-text-secondary mb-1">Tariffa oraria €</label>
                <input type="number" step="0.01" value={form.hourly_cost ?? ''} onChange={e => set('hourly_cost', num(e.target.value))} className={ic} />
              </div>
            )}
            {form.cost_type === 'daily' && (
              <div>
                <label className="block text-xs text-text-secondary mb-1">Tariffa giornaliera €</label>
                <input type="number" step="0.01" value={form.daily_cost ?? ''} onChange={e => set('daily_cost', num(e.target.value))} className={ic} />
              </div>
            )}
            {form.cost_type === 'project_fee' && (
              <div>
                <label className="block text-xs text-text-secondary mb-1">Fee a progetto €</label>
                <input type="number" step="0.01" value={form.project_fee ?? ''} onChange={e => set('project_fee', num(e.target.value))} className={ic} />
              </div>
            )}
            {form.cost_type === 'partner_percentage' && (
              <div>
                <label className="block text-xs text-text-secondary mb-1">% sul ricavo</label>
                <input type="number" step="0.01" value={form.partner_percentage ?? ''} onChange={e => set('partner_percentage', num(e.target.value))} className={ic} />
              </div>
            )}
            <div>
              <label className="block text-xs text-text-secondary mb-1">Tool mensili €</label>
              <input type="number" step="0.01" value={form.tools_cost_monthly} onChange={e => set('tools_cost_monthly', num(e.target.value) ?? 0)} className={ic} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Overhead %</label>
              <input type="number" step="0.1" value={form.overhead_percentage} onChange={e => set('overhead_percentage', num(e.target.value) ?? 0)} className={ic} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Ore disponibili/mese</label>
              <input type="number" value={form.availability_hours_month} onChange={e => set('availability_hours_month', num(e.target.value) ?? 160)} className={ic} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Ore fatturabili target</label>
              <input type="number" value={form.billable_target_hours_month} onChange={e => set('billable_target_hours_month', num(e.target.value) ?? 120)} className={ic} />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Markup default ×</label>
              <input type="number" step="0.1" value={form.markup_default} onChange={e => set('markup_default', num(e.target.value) ?? 2)} className={ic} />
            </div>
          </div>

          {/* Anteprima calcolo */}
          <div className="flex items-center gap-3 bg-gold/5 border border-gold/20 rounded-xl px-4 py-3">
            <Calculator className="w-4 h-4 text-gold-text shrink-0" />
            <span className="text-xs text-text-secondary">Costo orario calcolato:</span>
            <span className="text-base font-black text-gold-text">{preview != null ? `€${preview.toFixed(2)}/h` : 'n/d per questo tipo costo'}</span>
            {preview != null && (
              <span className="text-2xs text-text-tertiary ml-auto">Prezzo suggerito: €{(preview * form.markup_default).toFixed(0)}/h (markup ×{form.markup_default})</span>
            )}
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Note</label>
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value || null)} rows={2} className={`${ic} resize-none`} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary">Annulla</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salva risorsa
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export function ResourceCostsClient({ initialResources, profiles }: {
  initialResources: ResourceCost[]
  profiles: Pick<Profile, 'id' | 'full_name'>[]
}) {
  const [resources, setResources] = useState(initialResources)
  const [editing, setEditing] = useState<ResourceCost | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const visible = resources.filter(r => showInactive || r.is_active)
  const active = resources.filter(r => r.is_active)
  const totalMonthly = active.reduce((s, r) => {
    if (r.monthly_cost != null) return s + r.monthly_cost * (1 + r.overhead_percentage / 100) + r.tools_cost_monthly
    if (r.calculated_hourly_cost != null) return s + r.calculated_hourly_cost * r.billable_target_hours_month
    return s
  }, 0)

  const toggle = async (r: ResourceCost) => {
    try {
      await toggleResourceCost(r.id, !r.is_active)
      setResources(prev => prev.map(x => x.id === r.id ? { ...x, is_active: !r.is_active } : x))
      toast.success(r.is_active ? 'Risorsa disattivata' : 'Risorsa riattivata')
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="p-5 lg:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-text-primary">Costi risorse</h1>
          <p className="text-text-tertiary text-xs mt-0.5">Costo operativo di dipendenti, freelance, partner e fornitori — alimenta preventivi e marginalità</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold font-bold rounded-lg hover:bg-gold/90 transition-colors text-sm">
          <Plus className="w-4 h-4" /> Nuova risorsa
        </button>
      </div>

      {/* Riepilogo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: 'Risorse attive', v: String(active.length) },
          { l: 'Costo team stimato/mese', v: eur(Math.round(totalMonthly)) },
          { l: 'Ore fatturabili/mese', v: String(active.reduce((s, r) => s + r.billable_target_hours_month, 0)) },
          { l: 'Costo orario medio', v: (() => { const cs = active.map(r => r.calculated_hourly_cost).filter((v): v is number => v != null); return cs.length ? `€${(cs.reduce((s, v) => s + v, 0) / cs.length).toFixed(0)}/h` : '—' })() },
        ].map(k => (
          <div key={k.l} className="bg-surface border border-border rounded-xl p-4">
            <p className="text-2xs text-text-tertiary uppercase tracking-wider font-bold mb-1">{k.l}</p>
            <p className="text-2xl font-black text-gold-text">{k.v}</p>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs text-text-tertiary cursor-pointer w-fit">
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-gold" />
        Mostra disattivate
      </label>

      {/* Tabella */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center py-20 gap-3 text-center border border-dashed border-border rounded-2xl">
          <Euro className="w-8 h-8 text-text-tertiary" />
          <p className="text-text-tertiary text-sm font-semibold">Nessuna risorsa censita</p>
          <p className="text-text-tertiary text-xs max-w-sm">Aggiungi la prima risorsa per calcolare il costo orario reale e alimentare preventivi e marginalità.</p>
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="mt-2 text-xs font-bold px-4 py-2 rounded-lg bg-gold text-on-gold">+ Crea la prima risorsa</button>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-border text-2xs text-text-tertiary uppercase tracking-wider">
                <th className="text-left px-4 py-3">Risorsa</th>
                <th className="text-left px-3 py-3">Tipo</th>
                <th className="text-left px-3 py-3">Costo</th>
                <th className="text-right px-3 py-3">€/h reale</th>
                <th className="text-right px-3 py-3">Ore fatt.</th>
                <th className="text-right px-3 py-3">Markup</th>
                <th className="text-right px-4 py-3">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} className={`border-b border-border hover:bg-surface-hover ${!r.is_active ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-text-primary">{r.name}</p>
                    <p className="text-2xs text-text-tertiary">{r.role_title ?? '—'}{r.department ? ` · ${r.department}` : ''}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-2xs font-black px-2 py-0.5 rounded-full"
                      style={{ background: `color-mix(in srgb, ${TYPE_COLOR[r.resource_type]} 8%, transparent)`, color: TYPE_COLOR[r.resource_type] }}>
                      {TYPE_LABEL[r.resource_type]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-text-secondary">
                    {COST_TYPE_LABEL[r.cost_type]}
                    <span className="text-text-primary font-semibold ml-1.5">
                      {r.cost_type === 'monthly_salary' || r.cost_type === 'retainer' ? eur(r.monthly_cost)
                        : r.cost_type === 'hourly' ? `${eur(r.hourly_cost)}/h`
                        : r.cost_type === 'daily' ? `${eur(r.daily_cost)}/g`
                        : r.cost_type === 'project_fee' ? eur(r.project_fee)
                        : r.partner_percentage != null ? `${r.partner_percentage}%` : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-black text-gold-text">{r.calculated_hourly_cost != null ? `€${r.calculated_hourly_cost.toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-3 text-right text-text-secondary">{r.billable_target_hours_month}h</td>
                  <td className="px-3 py-3 text-right text-text-secondary">×{r.markup_default}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditing(r); setShowForm(true) }}
                        className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface" title="Modifica">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggle(r)}
                        className={`p-1.5 rounded-lg hover:bg-surface ${r.is_active ? 'text-text-tertiary hover:text-error' : 'text-success'}`}
                        title={r.is_active ? 'Disattiva' : 'Riattiva'}>
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <CostForm initial={editing} profiles={profiles}
          onClose={() => setShowForm(false)}
          onSaved={r => setResources(prev => {
            const exists = prev.find(x => x.id === r.id)
            return exists ? prev.map(x => x.id === r.id ? r : x) : [r, ...prev]
          })} />
      )}
    </div>
  )
}
