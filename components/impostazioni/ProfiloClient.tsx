'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff, User, Mail, Lock, CheckCircle2, ArrowLeft } from 'lucide-react'
import type { Profile } from '@/lib/types/database'
import Link from 'next/link'
import { SUPER_ADMIN_EMAILS, ROLE_LABELS } from '@/lib/permissions'

interface Props { profile: Profile; userEmail: string }

const ic = 'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/50 transition-colors'

export function ProfiloClient({ profile, userEmail }: Props) {
  const [name, setName] = useState(profile.full_name)
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [newEmail, setNewEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [savingPw, setSavingPw] = useState(false)

  const isGod = SUPER_ADMIN_EMAILS.includes(profile.email)

  const saveProfile = async () => {
    setSavingProfile(true)
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({ full_name: name, phone: phone || null }).eq('id', profile.id)
    setSavingProfile(false)
    if (error) { toast.error(error.message); return }
    toast.success('Profilo aggiornato')
  }

  const changeEmail = async () => {
    if (!newEmail.trim()) return
    setSavingEmail(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    setSavingEmail(false)
    if (error) { toast.error(error.message); return }
    setEmailSent(true)
    toast.success('Controlla la nuova email per confermare il cambio')
  }

  const changePassword = async () => {
    if (newPw !== confirmPw) { toast.error('Le password non coincidono'); return }
    if (newPw.length < 8) { toast.error('Minimo 8 caratteri'); return }
    setSavingPw(true)
    const supabase = createClient()
    // Verifica prima la password attuale facendo un sign-in silenzioso
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: userEmail, password: currentPw })
    if (signInErr) { setSavingPw(false); toast.error('Password attuale non corretta'); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSavingPw(false)
    if (error) { toast.error(error.message); return }
    setCurrentPw(''); setNewPw(''); setConfirmPw('')
    toast.success('Password aggiornata!')
  }

  const sendResetEmail = async () => {
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo: `${window.location.origin}/reset-password` })
    toast.success('Email di reset inviata — controlla la casella')
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/impostazioni" className="text-text-secondary hover:text-text-primary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-text-primary">Il mio profilo</h1>
          <p className="text-text-secondary text-sm">{userEmail}</p>
        </div>
      </div>

      {/* Avatar + ruolo */}
      <div className="flex items-center gap-4 mb-8 bg-surface border border-border rounded-xl p-5">
        <div className="w-16 h-16 rounded-full bg-gold/20 border-2 border-gold/40 flex items-center justify-center text-2xl font-black text-gold-text">
          {profile.full_name[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-bold text-text-primary">{profile.full_name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gold/20 text-gold-text">
              {isGod ? '👑 Super Admin' : ROLE_LABELS[profile.app_role] ?? profile.role}
            </span>
            {profile.area && <span className="text-xs text-text-secondary capitalize">{profile.area}</span>}
            {profile.job_title && <span className="text-xs text-text-secondary">· {profile.job_title}</span>}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Info base */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-gold-text" />
            <h2 className="text-sm font-bold text-text-primary">Informazioni personali</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Nome completo</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={ic} placeholder="Nome Cognome" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Telefono</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={ic} placeholder="+39 340 000 0000" />
            </div>
          </div>
          <button onClick={saveProfile} disabled={savingProfile} className="mt-4 flex items-center gap-2 bg-gold text-on-gold text-sm font-bold px-4 py-2 rounded-lg hover:bg-gold/90 disabled:opacity-50">
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Salva
          </button>
        </div>

        {/* Cambio email */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-4 h-4 text-gold-text" />
            <h2 className="text-sm font-bold text-text-primary">Cambia email</h2>
          </div>
          <p className="text-xs text-text-secondary mb-3">Email attuale: <strong className="text-text-primary">{userEmail}</strong></p>
          {emailSent ? (
            <div className="flex items-center gap-2 text-sm text-success bg-success/10 border border-success/20 rounded-lg px-4 py-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> Controlla la nuova email per confermare il cambio.
            </div>
          ) : (
            <div className="flex gap-2">
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={ic} placeholder="nuova@email.com" />
              <button onClick={changeEmail} disabled={savingEmail || !newEmail}
                className="shrink-0 bg-gold text-on-gold text-sm font-bold px-4 py-2 rounded-lg hover:bg-gold/90 disabled:opacity-50 flex items-center gap-1">
                {savingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aggiorna'}
              </button>
            </div>
          )}
        </div>

        {/* Cambio password */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-gold-text" />
              <h2 className="text-sm font-bold text-text-primary">Cambia password</h2>
            </div>
            <button onClick={sendResetEmail} className="text-xs text-text-secondary hover:text-gold-text transition-colors">
              Ricevi link via email →
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Password attuale</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={ic} placeholder="••••••••" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Nuova password</label>
              <input type={showPw ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)} className={ic} placeholder="Min. 8 caratteri" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Conferma nuova password</label>
              <input type={showPw ? 'text' : 'password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                className={`${ic} ${confirmPw && confirmPw !== newPw ? 'border-error/50' : ''}`} placeholder="••••••••" />
              {confirmPw && confirmPw !== newPw && <p className="text-xs text-error mt-1">Le password non coincidono</p>}
            </div>
          </div>
          <button onClick={changePassword} disabled={savingPw || !currentPw || !newPw || !confirmPw}
            className="mt-4 flex items-center gap-2 bg-gold text-on-gold text-sm font-bold px-4 py-2 rounded-lg hover:bg-gold/90 disabled:opacity-50">
            {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Aggiorna password
          </button>
        </div>
      </div>
    </div>
  )
}
