'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { getInitials } from '@/lib/utils'
import type { Profile, Client } from '@/lib/types/database'
import { Loader2, UserPlus, Shield, Users } from 'lucide-react'
import { AsanaSync } from './AsanaSync'

interface Props {
  currentProfile: Profile
  profiles: Profile[]
  clients: Client[]
  assignments: { client_id: string; profile_id: string }[]
}

const TABS = ['Team', 'Profilo', 'Pacchetti', 'Integrazioni']

const roleLabel: Record<string, string> = {
  admin: 'Admin',
  team: 'Team',
  client: 'Cliente',
  guest: 'Guest',
}

const roleBadge: Record<string, string> = {
  admin: 'bg-gold/20 text-gold',
  team: 'bg-blue-500/20 text-blue-400',
  client: 'bg-success/20 text-success',
  guest: 'bg-surface text-text-secondary border border-[#2A2A2A]',
}

const PACKAGES = [
  { name: 'Worker Bee Start', price: '€1.200/mese', desc: 'Gestione base 1 canale' },
  { name: 'Worker Bee Basic', price: '€1.500/mese', desc: 'Gestione 2 canali' },
  { name: 'Hive Basic', price: '€1.800/mese', desc: 'Multi-canale + CRM' },
  { name: 'Hive Custom', price: '€2.000/mese', desc: 'Hive personalizzato' },
  { name: 'Royal Queen', price: '€2.500/mese', desc: 'Full service premium' },
  { name: 'IT Digital Partner', price: '€2.500/mese', desc: 'Partnership IT estesa' },
  { name: 'Partner Quota', price: 'Custom', desc: 'Accordo personalizzato' },
]

export function ImpostazioniClient({ currentProfile, profiles, clients, assignments }: Props) {
  const [activeTab, setActiveTab] = useState(0)
  const isAdmin = currentProfile.role === 'admin'

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-black text-white mb-6">Impostazioni</h1>

      {/* Tab nav */}
      <div className="flex border-b border-[#2A2A2A] mb-6">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === i ? 'border-gold text-gold' : 'border-transparent text-text-secondary hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 0 && <TeamTab profiles={profiles} clients={clients} assignments={assignments} isAdmin={isAdmin} />}
      {activeTab === 1 && <ProfiloTab profile={currentProfile} />}
      {activeTab === 2 && <PacchettiTab />}
      {activeTab === 3 && (
        <div className="max-w-lg">
          <div className="bg-surface border border-[#2A2A2A] rounded-card p-6">
            <AsanaSync />
          </div>
        </div>
      )}
    </div>
  )
}

function TeamTab({ profiles, clients, assignments, isAdmin }: {
  profiles: Profile[]
  clients: Client[]
  assignments: { client_id: string; profile_id: string }[]
  isAdmin: boolean
}) {
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('team')
  const [inviting, setInviting] = useState(false)

  const getAssignedClients = (profileId: string) =>
    assignments
      .filter((a) => a.profile_id === profileId)
      .map((a) => clients.find((c) => c.id === a.client_id)?.company_name)
      .filter(Boolean)

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail) return
    setInviting(true)

    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    })

    setInviting(false)
    if (res.ok) {
      toast.success(`Invito inviato a ${inviteEmail}`)
      setInviteEmail('')
    } else {
      toast.error('Errore nell\'invio dell\'invito')
    }
  }

  return (
    <div className="space-y-6">
      {/* Invita membro */}
      {isAdmin && (
        <div className="bg-surface border border-[#2A2A2A] rounded-card p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-gold" />
            Invita Nuovo Membro
          </h3>
          <form onSubmit={handleInvite} className="flex gap-3 flex-wrap">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@twobee.it"
              required
              className="flex-1 min-w-48 bg-background border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="bg-background border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
            >
              <option value="team">Team</option>
              <option value="admin">Admin</option>
              <option value="client">Cliente</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="flex items-center gap-2 px-4 py-2.5 bg-gold text-black font-bold rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50"
            >
              {inviting && <Loader2 className="w-4 h-4 animate-spin" />}
              Invita
            </button>
          </form>
          <p className="text-xs text-text-secondary mt-2">
            L'utente riceverà un'email con il link per impostare la password.
          </p>
        </div>
      )}

      {/* Lista team */}
      <div className="bg-surface border border-[#2A2A2A] rounded-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2A2A2A] flex items-center gap-2">
          <Users className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-bold text-white">Membri del Team ({profiles.length})</h3>
        </div>
        <div className="divide-y divide-[#2A2A2A]">
          {profiles.map((p) => {
            const assigned = getAssignedClients(p.id)
            return (
              <div key={p.id} className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold text-sm font-bold">
                    {getInitials(p.full_name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{p.full_name}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${roleBadge[p.role]}`}>
                        {roleLabel[p.role]}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary">{p.email}</p>
                    {assigned.length > 0 && (
                      <p className="text-xs text-text-secondary mt-0.5">
                        Clienti: {assigned.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ProfiloTab({ profile }: { profile: Profile }) {
  const [form, setForm] = useState({
    full_name: profile.full_name,
    phone: profile.phone ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [changingPwd, setChangingPwd] = useState(false)

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: form.full_name, phone: form.phone || null })
      .eq('id', profile.id)
    setSaving(false)
    if (error) { toast.error('Errore nel salvataggio'); return }
    toast.success('Profilo aggiornato!')
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 6) { toast.error('Password min. 6 caratteri'); return }
    setChangingPwd(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPwd(false)
    if (error) { toast.error('Errore nel cambio password'); return }
    toast.success('Password aggiornata!')
    setNewPassword('')
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gold/20 border-2 border-gold/30 flex items-center justify-center text-gold text-xl font-black">
          {getInitials(profile.full_name)}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{profile.full_name}</p>
          <p className="text-xs text-text-secondary">{profile.email}</p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded mt-1 inline-block ${
            profile.role === 'admin' ? 'bg-gold/20 text-gold' : 'bg-blue-500/20 text-blue-400'
          }`}>
            {roleLabel[profile.role]}
          </span>
        </div>
      </div>

      {/* Dati profilo */}
      <div className="bg-surface border border-[#2A2A2A] rounded-card p-5">
        <h3 className="text-sm font-bold text-white mb-4">Dati Personali</h3>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Nome completo</label>
            <input
              value={form.full_name}
              onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
              className="w-full bg-background border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Email</label>
            <input
              value={profile.email}
              disabled
              className="w-full bg-background border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-text-secondary cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Telefono</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="+39 333 000 0000"
              className="w-full bg-background border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-gold text-black font-bold rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salva Modifiche
          </button>
        </form>
      </div>

      {/* Cambio password */}
      <div className="bg-surface border border-[#2A2A2A] rounded-card p-5">
        <h3 className="text-sm font-bold text-white mb-4">Cambia Password</h3>
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Nuova password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 6 caratteri"
              className="w-full bg-background border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
            />
          </div>
          <button
            type="submit"
            disabled={changingPwd}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-[#2A2A2A] text-white font-semibold rounded-lg hover:border-gold transition-colors disabled:opacity-50"
          >
            {changingPwd && <Loader2 className="w-4 h-4 animate-spin" />}
            Aggiorna Password
          </button>
        </form>
      </div>
    </div>
  )
}

function PacchettiTab() {
  return (
    <div className="space-y-3">
      <p className="text-text-secondary text-sm mb-4">
        Pacchetti servizio TWO BEE — prezzi di riferimento interni.
      </p>
      {PACKAGES.map((pkg) => (
        <div key={pkg.name} className="bg-surface border border-[#2A2A2A] rounded-card px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">{pkg.name}</p>
            <p className="text-xs text-text-secondary mt-0.5">{pkg.desc}</p>
          </div>
          <span className="text-gold font-bold text-sm">{pkg.price}</span>
        </div>
      ))}
    </div>
  )
}
