'use client'

import { useState } from 'react'
import { Plus, Trash2, Crown, Star, X, UserPlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getInitials } from '@/lib/utils'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import {
  createOrgUnit, updateOrgUnit, deleteOrgUnit, addOrgMember, removeOrgMember,
} from '@/app/actions/org'
import type { Profile, OrgUnit, OrgMember } from '@/lib/types/database'

const COLORS = ['var(--color-success)', 'var(--color-warning)', 'var(--color-accent)', 'var(--color-info)', 'var(--color-accent)', 'var(--color-info)', 'var(--color-gold-text)', 'var(--color-error)']

function Avatar({ p, size = 'md' }: { p: Profile; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8'
  return (
    <div className={`${dim} rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold-text text-xs font-bold shrink-0 overflow-hidden`}>
      {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : getInitials(p.full_name)}
    </div>
  )
}

export function Organigramma({ profiles, units: initialUnits, members: initialMembers, isAdmin }: {
  profiles: Profile[]
  units: OrgUnit[]
  members: OrgMember[]
  isAdmin: boolean
}) {
  const [units, setUnits]     = useState(initialUnits)
  const [members, setMembers] = useState(initialMembers)
  const [busy, setBusy]       = useState(false)
  const [addingTo, setAddingTo] = useState<string | null>(null)

  const profileById = (id: string | null) => profiles.find(p => p.id === id) ?? null
  const leaders = profiles.filter(p => SUPER_ADMIN_EMAILS.includes(p.email) || p.app_role === 'super_admin' || p.app_role === 'admin')

  const addUnit = async () => {
    setBusy(true)
    try {
      const u = await createOrgUnit('Nuova unità', COLORS[units.length % COLORS.length], units.length)
      if (u) setUnits(prev => [...prev, u as OrgUnit])
    } catch (e) { toast.error((e as Error).message) }
    setBusy(false)
  }

  const patchUnit = async (id: string, updates: Partial<OrgUnit>) => {
    setUnits(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u))
    try { await updateOrgUnit(id, updates) } catch (e) { toast.error((e as Error).message) }
  }

  const removeUnit = async (id: string) => {
    if (!confirm('Eliminare questa unità?')) return
    setUnits(prev => prev.filter(u => u.id !== id))
    setMembers(prev => prev.filter(m => m.unit_id !== id))
    try { await deleteOrgUnit(id) } catch (e) { toast.error((e as Error).message) }
  }

  const addMember = async (unitId: string, profileId: string) => {
    if (members.some(m => m.unit_id === unitId && m.profile_id === profileId)) { setAddingTo(null); return }
    try {
      const m = await addOrgMember(unitId, profileId, null)
      if (m) setMembers(prev => [...prev, m as OrgMember])
    } catch (e) { toast.error((e as Error).message) }
    setAddingTo(null)
  }

  const removeMember = async (m: OrgMember) => {
    setMembers(prev => prev.filter(x => x.id !== m.id))
    try { await removeOrgMember(m.id) } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="space-y-5">
      {/* Leadership */}
      {leaders.length > 0 && (
        <div className="bg-surface border border-gold/20 rounded-xl p-4">
          <p className="text-2xs font-black uppercase tracking-wider text-gold-text mb-3">Leadership</p>
          <div className="flex flex-wrap gap-3">
            {leaders.map(p => (
              <div key={p.id} className="flex items-center gap-2.5 bg-background border border-border rounded-xl px-3 py-2">
                <Avatar p={p} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-bold text-text-primary truncate">{p.full_name}</p>
                    {SUPER_ADMIN_EMAILS.includes(p.email) && <Crown className="w-3 h-3 text-gold-text shrink-0" />}
                  </div>
                  <p className="text-2xs text-text-secondary truncate">{p.job_title ?? p.app_role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unità */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {units.sort((a, b) => a.position - b.position).map(unit => {
          const unitMembers = members.filter(m => m.unit_id === unit.id)
          const lead = profileById(unit.lead_id)
          const assignableProfiles = profiles.filter(p => !unitMembers.some(m => m.profile_id === p.id))

          return (
            <div key={unit.id} className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border" style={{ background: `color-mix(in srgb, ${unit.color} 5%, transparent)` }}>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: unit.color }} />
                  {isAdmin ? (
                    <input defaultValue={unit.name} onBlur={(e) => e.target.value !== unit.name && patchUnit(unit.id, { name: e.target.value })}
                      className="flex-1 bg-transparent text-sm font-black text-text-primary focus:outline-none focus:bg-background rounded px-1" />
                  ) : (
                    <p className="flex-1 text-sm font-black text-text-primary">{unit.name}</p>
                  )}
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      {COLORS.slice(0, 6).map(c => (
                        <button key={c} onClick={() => patchUnit(unit.id, { color: c })}
                          className="w-3.5 h-3.5 rounded-full border border-border" style={{ background: c }} />
                      ))}
                      <button onClick={() => removeUnit(unit.id)} className="ml-1 text-text-secondary hover:text-error">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Responsabilità */}
                {isAdmin ? (
                  <textarea defaultValue={unit.responsibilities ?? ''} placeholder="Responsabilità dell'unità…"
                    onBlur={(e) => e.target.value !== (unit.responsibilities ?? '') && patchUnit(unit.id, { responsibilities: e.target.value })}
                    rows={2}
                    className="mt-2 w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text-secondary placeholder-text-tertiary focus:outline-none focus:border-gold/40 resize-none" />
                ) : unit.responsibilities ? (
                  <p className="mt-2 text-xs text-text-secondary">{unit.responsibilities}</p>
                ) : null}

                {/* Lead */}
                <div className="mt-2 flex items-center gap-2">
                  <Star className="w-3 h-3 text-gold-text shrink-0" />
                  {isAdmin ? (
                    <select value={unit.lead_id ?? ''} onChange={(e) => patchUnit(unit.id, { lead_id: e.target.value || null })}
                      className="bg-background border border-border rounded px-2 py-1 text-2xs text-text-primary focus:outline-none">
                      <option value="">— Referente —</option>
                      {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  ) : (
                    <span className="text-2xs text-text-primary font-semibold">{lead ? `Referente: ${lead.full_name}` : 'Nessun referente'}</span>
                  )}
                </div>
              </div>

              {/* Membri */}
              <div className="p-3 space-y-1.5">
                {unitMembers.length === 0 && <p className="text-2xs text-text-tertiary px-1 py-2">Nessun membro assegnato</p>}
                {unitMembers.map(m => {
                  const p = profileById(m.profile_id)
                  if (!p) return null
                  const isLead = unit.lead_id === p.id
                  return (
                    <div key={m.id} className="flex items-center gap-2.5 px-1 py-1 group">
                      <Avatar p={p} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-semibold text-text-primary truncate">{p.full_name}</p>
                          {isLead && <Star className="w-2.5 h-2.5 text-gold-text shrink-0" />}
                        </div>
                        <p className="text-2xs text-text-secondary truncate">{m.role_in_unit ?? p.job_title ?? p.app_role}</p>
                      </div>
                      {isAdmin && (
                        <button onClick={() => removeMember(m)} className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-error transition-opacity">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}

                {isAdmin && (
                  addingTo === unit.id ? (
                    <select autoFocus onChange={(e) => e.target.value && addMember(unit.id, e.target.value)} onBlur={() => setAddingTo(null)}
                      className="w-full bg-background border border-gold/40 rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none mt-1">
                      <option value="">Seleziona persona…</option>
                      {assignableProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    </select>
                  ) : (
                    <button onClick={() => setAddingTo(unit.id)}
                      className="flex items-center gap-1.5 text-2xs text-text-secondary hover:text-gold-text px-1 py-1 mt-1">
                      <UserPlus className="w-3.5 h-3.5" /> Aggiungi membro
                    </button>
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>

      {isAdmin && (
        <button onClick={addUnit} disabled={busy}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold font-bold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50 text-sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Aggiungi unità
        </button>
      )}
    </div>
  )
}
