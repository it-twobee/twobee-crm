'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export function OnboardingClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [step, setStep] = useState<'loading' | 'form' | 'done' | 'error'>('loading')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [channelId, setChannelId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()

      if (!user) { setStep('error'); return }

      if (!token) {
        router.replace('/dashboard')
        return
      }

      const { data: guest } = await sb
        .from('channel_guests')
        .select('*')
        .eq('invite_token', token)
        .single()

      if (!guest) { setStep('error'); return }

      setChannelId(guest.channel_id)
      setFullName(guest.full_name ?? user.email?.split('@')[0] ?? '')
      setRole(guest.role ?? '')

      const { data: profile } = await sb.from('profiles').select('id').eq('id', user.id).single()
      if (profile && guest.status === 'active') {
        router.replace(`/chat?channel=${guest.channel_id}`)
        return
      }

      setStep('form')
    }
    init()
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim() || !role.trim()) return
    setSaving(true)

    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSaving(false); return }

    const { error: profileError } = await sb.from('profiles').upsert({
      id: user.id,
      email: user.email!,
      full_name: fullName.trim(),
      role: 'guest',
      app_role: 'guest',
      job_title: role.trim(),
      is_active: true,
    }, { onConflict: 'id' })

    if (profileError) {
      toast.error('Errore profilo: ' + profileError.message)
      setSaving(false)
      return
    }

    if (token) {
      await sb.from('channel_guests').update({
        status: 'active',
        full_name: fullName.trim(),
        role: role.trim(),
        profile_id: user.id,
        accepted_at: new Date().toISOString(),
      }).eq('invite_token', token)
    }

    if (channelId) {
      await sb.from('channel_members').upsert(
        { channel_id: channelId, profile_id: user.id },
        { onConflict: 'channel_id,profile_id', ignoreDuplicates: true }
      )
    }

    setSaving(false)
    setStep('done')
    setTimeout(() => router.replace(channelId ? `/chat?channel=${channelId}` : '/chat'), 1800)
  }

  if (step === 'loading') return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-gold animate-spin" />
    </div>
  )

  if (step === 'error') return (
    <div className="min-h-screen bg-background flex items-center justify-center text-center px-6">
      <div>
        <p className="text-2xl font-black text-text-primary mb-2">Link non valido</p>
        <p className="text-text-secondary">Il link di invito è scaduto o non esiste. Contatta chi ti ha invitato.</p>
      </div>
    </div>
  )

  if (step === 'done') return (
    <div className="min-h-screen bg-background flex items-center justify-center text-center px-6">
      <div>
        <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
        <p className="text-2xl font-black text-text-primary mb-2">Benvenuto!</p>
        <p className="text-text-secondary">Stai per entrare nella chat…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-3xl font-black text-text-primary">two bee<span className="text-gold">.</span></p>
          <p className="text-text-secondary mt-2 text-sm">Completa il tuo profilo per accedere alla chat</p>
        </div>

        <form onSubmit={submit} className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-semibold uppercase tracking-wider">Nome e Cognome *</label>
            <input
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Es. Mario Rossi"
              className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-semibold uppercase tracking-wider">Ruolo / Azienda *</label>
            <input
              required
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="Es. CEO, Marketing Manager…"
              className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !fullName.trim() || !role.trim()}
            className="w-full bg-gold text-black font-black py-3 rounded-xl text-sm hover:bg-yellow-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Entra nella chat
          </button>
        </form>
      </div>
    </div>
  )
}
