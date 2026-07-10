'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { Logo } from '@/components/shared/Logo'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' || event === 'TOKEN_REFRESHED')) {
        router.push('/dashboard')
        router.refresh()
      }
    })
    return () => subscription.unsubscribe()
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error('Credenziali non valide. Riprova.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)

    if (error) {
      toast.error('Errore nell\'invio della email. Riprova.')
    } else {
      toast.success('Email inviata! Controlla la tua casella.')
      setResetMode(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="mb-2 flex justify-center">
            <Logo className="h-12" priority />
            <span className="sr-only">TwoBee</span>
          </h1>
          <p className="text-overlay/30 text-sm tracking-[0.2em] uppercase">
            Gestionale Interno
          </p>
        </div>

        {/* Card */}
        <div className="glass-strong rounded-3xl p-8">
          {!resetMode ? (
            <>
              <h2 className="text-xl font-bold mb-6 text-center font-heading">Accedi</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm text-overlay/40 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-overlay/[0.03] border border-overlay/[0.08] rounded-xl px-4 py-3 text-sm text-text-primary placeholder-overlay/20 focus:outline-none focus:border-gold/40 transition-colors"
                    placeholder="marco@twobee.it"
                  />
                </div>

                <div>
                  <label className="block text-sm text-overlay/40 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-overlay/[0.03] border border-overlay/[0.08] rounded-xl px-4 py-3 text-sm text-text-primary placeholder-overlay/20 focus:outline-none focus:border-gold/40 transition-colors"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full gold-gradient text-on-gold font-bold py-3 rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Accedi
                </button>
              </form>

              <button
                onClick={() => setResetMode(true)}
                className="w-full text-center text-sm text-overlay/30 hover:text-gold-text mt-4 transition-colors"
              >
                Password dimenticata?
              </button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-2 text-center font-heading">Reset Password</h2>
              <p className="text-overlay/40 text-sm text-center mb-6">
                Inserisci la tua email per ricevere il link di reset.
              </p>
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-sm text-overlay/40 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-overlay/[0.03] border border-overlay/[0.08] rounded-xl px-4 py-3 text-sm text-text-primary placeholder-overlay/20 focus:outline-none focus:border-gold/40 transition-colors"
                    placeholder="marco@twobee.it"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full gold-gradient text-on-gold font-bold py-3 rounded-xl hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Invia Link Reset
                </button>
              </form>

              <button
                onClick={() => setResetMode(false)}
                className="w-full text-center text-sm text-overlay/30 hover:text-gold-text mt-4 transition-colors"
              >
                ← Torna al login
              </button>
            </>
          )}
        </div>

        <p className="text-center text-overlay/15 text-xs mt-6">
          Accesso riservato ai membri del team TWO BEE
        </p>
      </div>
    </div>
  )
}
