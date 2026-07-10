'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { User, Save, Loader2, Calendar, CheckCircle2, Lock } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/permissions'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import type { Profile } from '@/lib/types/database'

export function ProfiloClient({ profile, googleConnected }: {
  profile: Profile
  googleConnected: boolean
}) {
  const router = useRouter()
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [jobTitle, setJobTitle] = useState(profile.job_title ?? '')
  const [competencies, setCompetencies] = useState((profile.competencies ?? []).join(', '))
  const [saving, setSaving] = useState(false)

  const initials = (profile.full_name ?? 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const roleLabel = profile.app_role ? (ROLE_LABELS[profile.app_role] ?? profile.app_role) : '—'

  const save = async () => {
    setSaving(true)
    const { error } = await createClient().from('profiles').update({
      full_name: fullName.trim() || null,
      phone: phone.trim() || null,
      job_title: jobTitle.trim() || null,
      competencies: competencies.split(',').map(c => c.trim()).filter(Boolean),
    } as never).eq('id', profile.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Profilo aggiornato')
    router.refresh()
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <User className="w-5 h-5 text-gold-text" aria-hidden="true" />
          Profilo
        </h1>
        <p className="text-text-tertiary text-sm mt-0.5">Dati personali, competenze e integrazioni.</p>
      </header>

      {/* Identità */}
      <section className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div className="flex items-center gap-3">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
            : <div className="w-14 h-14 rounded-full bg-gold-dim flex items-center justify-center text-gold-text text-base font-bold shrink-0">{initials}</div>}
          <div className="min-w-0">
            <p className="text-base font-semibold text-text-primary truncate">{profile.full_name ?? 'Utente'}</p>
            <p className="text-sm text-text-tertiary truncate">{profile.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="full_name" className="text-text-tertiary text-xs mb-1.5 block">Nome completo</label>
            <input id="full_name" value={fullName} onChange={e => setFullName(e.target.value)}
              className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
          </div>
          <div>
            <label htmlFor="phone" className="text-text-tertiary text-xs mb-1.5 block">Telefono</label>
            <input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="job_title" className="text-text-tertiary text-xs mb-1.5 block">Ruolo operativo</label>
            <input id="job_title" value={jobTitle} onChange={e => setJobTitle(e.target.value)}
              placeholder="Es. Growth Specialist"
              className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="competencies" className="text-text-tertiary text-xs mb-1.5 block">
              Competenze <span className="text-text-tertiary">(separate da virgola)</span>
            </label>
            <input id="competencies" value={competencies} onChange={e => setCompetencies(e.target.value)}
              placeholder="SEO, Google Ads, Copywriting"
              className="w-full bg-background border border-border-interactive rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/40" />
          </div>
        </div>

        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-sm font-semibold rounded-xl hover:bg-gold/90 disabled:opacity-40 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
          Salva
        </button>
      </section>

      {/* Ruolo — sola lettura */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
          <Lock className="w-4 h-4 text-text-tertiary" aria-hidden="true" />
          Ruolo e inquadramento
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-text-tertiary text-xs">Ruolo</dt>
            <dd className="text-text-primary font-medium">{roleLabel}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary text-xs">Seniority</dt>
            <dd className="text-text-primary font-medium">{profile.seniority ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary text-xs">Area</dt>
            <dd className="text-text-primary font-medium">{profile.area ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary text-xs">In azienda da</dt>
            <dd className="text-text-primary font-medium">
              {profile.hire_date ? new Date(profile.hire_date).toLocaleDateString('it-IT') : '—'}
            </dd>
          </div>
        </dl>
        <p className="text-2xs text-text-tertiary mt-3">
          Il ruolo lo assegna un amministratore: non è modificabile da qui.
        </p>
      </section>

      {/* Integrazioni */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-bold text-text-primary mb-3">Integrazioni</h2>
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-text-tertiary shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-primary">Google Calendar</p>
            <p className="text-2xs text-text-tertiary">
              {googleConnected
                ? 'Collegato: i tuoi appuntamenti compaiono nel calendario.'
                : 'Non collegato: il calendario mostra solo gli eventi interni.'}
            </p>
          </div>
          {googleConnected
            ? <span className="flex items-center gap-1.5 text-2xs font-semibold text-success bg-success-dim px-2.5 py-1 rounded-full shrink-0">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Collegato
              </span>
            : <a href="/api/google/auth"
                className="px-3 py-1.5 bg-gold text-on-gold text-xs font-semibold rounded-lg hover:bg-gold/90 transition-colors shrink-0">
                Collega
              </a>}
        </div>
      </section>

      {/* Preferenze */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-bold text-text-primary mb-3">Preferenze</h2>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-text-primary">Tema</p>
            <p className="text-2xs text-text-tertiary">Chiaro o scuro, la scelta resta su questo browser.</p>
          </div>
          <ThemeToggle />
        </div>
      </section>
    </div>
  )
}
