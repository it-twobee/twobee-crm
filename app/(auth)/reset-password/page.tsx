'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase inietta il token nell'hash URL dopo il click sul link email
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { toast.error('Le password non coincidono'); return }
    if (password.length < 8) { toast.error('Minimo 8 caratteri'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { toast.error(error.message); return }
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 2500)
  }

  const ic = 'w-full bg-background border border-[#2A2A2A] rounded-lg px-4 py-3 text-sm text-white placeholder-text-secondary focus:outline-none focus:border-gold transition-colors'

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black tracking-tight mb-2">
            <span className="text-white">two bee</span><span className="text-gold">.</span>
          </h1>
        </div>
        <div className="bg-surface border border-[#2A2A2A] rounded-2xl p-8">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-gold mx-auto mb-3" />
              <h2 className="text-lg font-bold text-white mb-1">Password aggiornata!</h2>
              <p className="text-text-secondary text-sm">Reindirizzamento in corso...</p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-2 text-center text-white">Nuova Password</h2>
              <p className="text-text-secondary text-sm text-center mb-6">Scegli una password sicura di almeno 8 caratteri.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">Nuova password</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={ic} placeholder="••••••••" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">Conferma password</label>
                  <input type={showPw ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={`${ic} ${confirm && confirm !== password ? 'border-error/50' : ''}`} placeholder="••••••••" />
                  {confirm && confirm !== password && <p className="text-xs text-error mt-1">Le password non coincidono</p>}
                </div>
                <button type="submit" disabled={loading || !ready} className="w-full bg-gold text-black font-bold py-3 rounded-lg hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {!ready ? 'Verifica link in corso...' : 'Aggiorna Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
