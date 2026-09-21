'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { portalLoginDestination } from '@/lib/portal/access'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [ready, setReady] = useState(false)
  const [credential, setCredential] = useState<{ token_hash: string; type: 'invite' | 'recovery' } | null>(null)
  const [linkError, setLinkError] = useState('')
  const linkGeneration = useRef(0)

  useEffect(() => {
    const readLink = () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1))
      const token = fragment.get('token_hash')
      const type = fragment.get('type')
      if (!fragment.has('token_hash') && !fragment.has('error') && !fragment.has('error_code')) return
      linkGeneration.current++
      setDone(false); setPassword(''); setConfirm(''); setLinkError(''); setCredential(null)
      if (token && (type === 'invite' || type === 'recovery')) {
        setCredential({ token_hash: token, type }); setReady(true)
      } else {
        setReady(false)
        setLinkError('Il link è scaduto o non è valido. Richiedi un nuovo invito o un link di recupero password.')
      }
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    readLink()
    window.addEventListener('hashchange', readLink)
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) setReady(true)
    })
    return () => { subscription.unsubscribe(); window.removeEventListener('hashchange', readLink) }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || !ready || linkError) return
    if (password !== confirm) { toast.error('Le password non coincidono'); return }
    if (password.length < 8) { toast.error('Minimo 8 caratteri'); return }
    setLoading(true)
    const generation = linkGeneration.current
    const supabase = createClient()
    try {
      if (credential) {
        const verified = await supabase.auth.verifyOtp(credential)
        if (generation !== linkGeneration.current) return
        if (verified.error || !verified.data.user) {
          setLinkError('Il link è scaduto, è già stato usato o è stato sostituito. Chiedi un nuovo link al tuo referente.')
          setReady(false)
          return
        }
        setCredential(null)
      }
      const { error } = await supabase.auth.updateUser({ password })
      if (generation !== linkGeneration.current) return
      if (error) { toast.error('Password non aggiornata. Usa una password diversa o richiedi un nuovo link.'); return }
      setDone(true)
      setTimeout(() => {
        if (generation !== linkGeneration.current) return
        router.replace(portalLoginDestination(window.location.search)); router.refresh()
      }, 1500)
    } catch { toast.error('Connessione non disponibile. Riprova senza chiudere questa pagina.') }
    finally { setLoading(false) }
  }

  const ic = 'w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-gold transition-colors'

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="mb-2 flex justify-center">
            <Logo className="h-10" priority />
            <span className="sr-only">TwoBee</span>
          </h1>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-8">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-gold-text mx-auto mb-3" />
              <h2 className="text-lg font-bold text-text-primary mb-1">Password aggiornata!</h2>
              <p className="text-text-secondary text-sm">Reindirizzamento in corso...</p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-2 text-center text-text-primary">{credential?.type === 'invite' ? 'Imposta la tua password' : 'Nuova password'}</h2>
              <p className="text-text-secondary text-sm text-center mb-6">Scegli una password sicura di almeno 8 caratteri.</p>
              {linkError && <p role="alert" className="mb-4 text-sm text-error">{linkError}</p>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="new-password" className="block text-sm text-text-secondary mb-1.5">Nuova password</label>
                  <div className="relative">
                    <input id="new-password" autoComplete="new-password" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={ic} placeholder="••••••••" />
                    <button type="button" aria-label={showPw ? 'Nascondi password' : 'Mostra password'} onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-sm text-text-secondary mb-1.5">Conferma password</label>
                  <input id="confirm-password" autoComplete="new-password" type={showPw ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={`${ic} ${confirm && confirm !== password ? 'border-error/50' : ''}`} placeholder="••••••••" />
                  {confirm && confirm !== password && <p className="text-xs text-error mt-1">Le password non coincidono</p>}
                </div>
                <button type="submit" disabled={loading || !ready || !!linkError} className="w-full bg-gold text-on-gold font-bold py-3 rounded-lg hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {linkError ? 'Link non valido' : !ready ? 'Verifica link in corso...' : 'Aggiorna Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
