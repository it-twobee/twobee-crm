'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Logo } from '@/components/shared/Logo'

interface InviteData {
  email: string
  app_role: string
  area: string | null
  job_title: string | null
}

export default function RegistratiPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <RegistratiForm />
    </Suspense>
  )
}

function RegistratiForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [step, setStep] = useState<'loading' | 'form' | 'done' | 'error' | 'expired'>('loading')
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) { setStep('error'); return }
    const load = async () => {
      const res = await fetch(`/api/invite/validate?token=${encodeURIComponent(token)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body.expired) { setStep('expired'); return }
        setStep('error')
        return
      }
      const data = await res.json()
      setInvite(data)
      setStep('form')
    }
    load()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invite || !token) return
    if (password.length < 6) { toast.error('La password deve avere almeno 6 caratteri'); return }
    if (password !== confirmPassword) { toast.error('Le password non corrispondono'); return }
    if (!fullName.trim()) { toast.error('Inserisci il tuo nome'); return }

    setSaving(true)
    setErrorMsg('')

    const res = await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, fullName: fullName.trim(), password }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Errore nella registrazione' }))
      setErrorMsg(body.error)
      toast.error(body.error)
      setSaving(false)
      return
    }

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: invite.email,
      password,
    })

    if (signInError) {
      toast.error('Account creato ma errore di login — prova ad accedere dalla pagina login')
      setSaving(false)
      setTimeout(() => router.push('/login'), 2000)
      return
    }

    setSaving(false)
    setStep('done')
    toast.success('Account creato!')
    setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 1500)
  }

  if (step === 'loading') return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-gold-text animate-spin" />
    </div>
  )

  if (step === 'expired') return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
        <h1 className="text-2xl font-black text-text-primary mb-2">Invito scaduto</h1>
        <p className="text-overlay/40 text-sm">Questo link di invito è scaduto. Chiedi al tuo admin di generarne uno nuovo.</p>
      </div>
    </div>
  )

  if (step === 'error') return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
        <h1 className="text-2xl font-black text-text-primary mb-2">Link non valido</h1>
        <p className="text-overlay/40 text-sm">Il link di registrazione non è valido o è già stato usato.</p>
      </div>
    </div>
  )

  if (step === 'done') return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
        <h1 className="text-2xl font-black text-text-primary mb-2">Benvenuto in TWO BEE!</h1>
        <p className="text-overlay/40 text-sm">Stai per entrare nella piattaforma...</p>
      </div>
    </div>
  )

  const ROLE_DISPLAY: Record<string, string> = {
    admin: 'Admin', manager: 'Manager', senior: 'Senior', junior: 'Junior',
    stage: 'Stage', freelance: 'Freelance', partner: 'Partner', viewer: 'Viewer',
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="mb-2 flex justify-center">
            <Logo className="h-12" priority />
            <span className="sr-only">TwoBee</span>
          </h1>
          <p className="text-overlay/30 text-sm tracking-[0.2em] uppercase">Crea il tuo account</p>
        </div>

        <div className="bg-overlay/[0.02] backdrop-blur border border-overlay/[0.08] rounded-3xl p-8">
          {invite && (
            <div className="mb-6 p-3 rounded-xl bg-gold-dim border border-gold/20">
              <p className="text-xs text-gold-text/70">Sei stato invitato come</p>
              <p className="text-sm font-bold text-gold-text mt-0.5">
                {ROLE_DISPLAY[invite.app_role] ?? invite.app_role}
                {invite.job_title ? ` · ${invite.job_title}` : ''}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-overlay/40 mb-1.5">Email</label>
              <input
                type="email"
                value={invite?.email ?? ''}
                disabled
                className="w-full bg-overlay/[0.03] border border-overlay/[0.08] rounded-xl px-4 py-3 text-sm text-overlay/50 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm text-overlay/40 mb-1.5">Nome e Cognome *</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                placeholder="Mario Rossi"
                className="w-full bg-overlay/[0.03] border border-overlay/[0.08] rounded-xl px-4 py-3 text-sm text-text-primary placeholder-overlay/20 focus:outline-none focus:border-gold/40 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-overlay/40 mb-1.5">Password *</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Minimo 6 caratteri"
                className="w-full bg-overlay/[0.03] border border-overlay/[0.08] rounded-xl px-4 py-3 text-sm text-text-primary placeholder-overlay/20 focus:outline-none focus:border-gold/40 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-overlay/40 mb-1.5">Conferma Password *</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                placeholder="Ripeti la password"
                className="w-full bg-overlay/[0.03] border border-overlay/[0.08] rounded-xl px-4 py-3 text-sm text-text-primary placeholder-overlay/20 focus:outline-none focus:border-gold/40 transition-colors"
              />
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 text-sm text-error bg-error/10 border border-error/20 rounded-xl px-4 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-gold text-on-gold font-bold py-3 rounded-xl hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Crea account
            </button>
          </form>
        </div>

        <p className="text-center text-overlay/15 text-xs mt-6">
          Accesso riservato ai membri del team TWO BEE
        </p>
      </div>
    </div>
  )
}
