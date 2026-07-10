'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck, ShieldAlert, X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { upsertResourceProfile, deleteResourceProfile, type ResourceProfileInput } from '@/app/actions/resource-profiles'
import type { Profile, ResourceProfile, ResourceProfileType } from '@/lib/types/database'

const TYPE_LABEL: Record<ResourceProfileType, string> = {
  internal_employee: 'Dipendente', vat_consultant: 'Consulente P.IVA', external_freelancer: 'Freelance',
  partner_company: 'Azienda partner', partner_user: 'Utente partner', agency_supplier: 'Fornitore',
  contractor: 'Contractor', consultant: 'Consulente',
}

const FLAGS: { key: keyof ResourceProfileInput; label: string }[] = [
  { key: 'can_access_resource_portal', label: 'Accesso al portale risorsa' },
  { key: 'can_view_own_compensation',  label: 'Vede i propri compensi' },
  { key: 'can_view_project_context',   label: 'Vede il contesto progetto' },
  { key: 'can_view_client_context',    label: 'Vede il contesto cliente' },
  { key: 'can_log_time',               label: 'Può loggare le ore' },
  { key: 'can_upload_documents',       label: 'Può caricare documenti' },
]

function EditModal({ profile, existing, onClose, onSaved }: {
  profile: Profile
  existing: ResourceProfile | null
  onClose: () => void
  onSaved: (r: ResourceProfile) => void
}) {
  const [form, setForm] = useState<ResourceProfileInput>({
    profile_id: profile.id,
    resource_type: existing?.resource_type ?? 'internal_employee',
    company_name: existing?.company_name ?? null,
    partner_company_id: existing?.partner_company_id ?? null,
    is_external: existing?.is_external ?? false,
    can_access_resource_portal: existing?.can_access_resource_portal ?? true,
    can_view_own_compensation: existing?.can_view_own_compensation ?? false,
    can_view_project_context: existing?.can_view_project_context ?? true,
    can_view_client_context: existing?.can_view_client_context ?? false,
    can_log_time: existing?.can_log_time ?? true,
    can_upload_documents: existing?.can_upload_documents ?? true,
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const saved = await upsertResourceProfile(form)
      onSaved(saved); toast.success('Profilo risorsa salvato'); onClose()
    } catch (e) { toast.error((e as Error).message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-scrim z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <p className="text-sm font-bold text-text-primary">Risorsa · {profile.full_name}</p>
          <button onClick={onClose}><X className="w-4 h-4 text-text-secondary" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Tipo risorsa</label>
            <select value={form.resource_type} onChange={e => setForm(p => ({ ...p, resource_type: e.target.value as ResourceProfileType }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none">
              {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
            <input type="checkbox" checked={form.is_external} onChange={e => setForm(p => ({ ...p, is_external: e.target.checked }))} className="accent-gold" />
            Risorsa esterna
          </label>
          {form.is_external && (
            <div className="flex items-start gap-2 bg-gold/5 border border-gold/20 rounded-lg px-3 py-2 text-2xs text-text-secondary">
              <ShieldAlert className="w-3.5 h-3.5 text-gold-text shrink-0 mt-0.5" />
              Per una risorsa esterna imposta anche <b>role = guest</b> sul profilo (Supabase), così viene esclusa da deals/OKR/MRR/costi interni.
            </div>
          )}
          <div className="space-y-1.5 border-t border-border pt-3">
            {FLAGS.map(f => (
              <label key={f.key} className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <input type="checkbox" checked={form[f.key] as boolean}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.checked }))} className="accent-gold" />
                {f.label}
              </label>
            ))}
          </div>
          <button onClick={save} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-gold text-on-gold font-bold rounded-lg disabled:opacity-50 text-sm">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salva
          </button>
        </div>
      </div>
    </div>
  )
}

export function ResourceProfilesTab({ profiles, initialResourceProfiles }: {
  profiles: Profile[]
  initialResourceProfiles: ResourceProfile[]
}) {
  const [rps, setRps] = useState(initialResourceProfiles)
  const [editing, setEditing] = useState<Profile | null>(null)

  const rpByProfile = new Map(rps.map(r => [r.profile_id, r]))

  const remove = async (rp: ResourceProfile) => {
    if (!confirm('Rimuovere il profilo risorsa?')) return
    try {
      await deleteResourceProfile(rp.id)
      setRps(prev => prev.filter(x => x.id !== rp.id))
      toast.success('Profilo risorsa rimosso')
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        Designa i membri come risorse (interne o esterne) e configura cosa possono vedere nel Portale Risorsa.
      </p>
      <div className="space-y-2">
        {profiles.map(p => {
          const rp = rpByProfile.get(p.id)
          return (
            <div key={p.id} className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-primary truncate">{p.full_name}</p>
                <p className="text-2xs text-text-tertiary">{p.email}</p>
              </div>
              {rp ? (
                <>
                  <span className="text-2xs font-black px-2 py-0.5 rounded-full bg-surface text-text-secondary">{TYPE_LABEL[rp.resource_type]}</span>
                  {rp.is_external
                    ? <span className="flex items-center gap-1 text-2xs font-bold text-warning"><ShieldAlert className="w-3 h-3" />Esterna</span>
                    : <span className="flex items-center gap-1 text-2xs font-bold text-success"><ShieldCheck className="w-3 h-3" />Interna</span>}
                  {rp.can_access_resource_portal && <span className="text-2xs text-info">portale ✓</span>}
                  <button onClick={() => setEditing(p)} className="text-2xs text-text-tertiary hover:text-text-primary px-2">Modifica</button>
                  <button onClick={() => remove(rp)} className="text-text-tertiary hover:text-error"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <button onClick={() => setEditing(p)} className="flex items-center gap-1 text-2xs font-bold text-gold-text hover:text-gold-text">
                  <Plus className="w-3 h-3" /> Designa risorsa
                </button>
              )}
            </div>
          )
        })}
      </div>

      {editing && (
        <EditModal profile={editing} existing={rpByProfile.get(editing.id) ?? null}
          onClose={() => setEditing(null)}
          onSaved={r => setRps(prev => { const ex = prev.find(x => x.id === r.id); return ex ? prev.map(x => x.id === r.id ? r : x) : [...prev, r] })} />
      )}
    </div>
  )
}
