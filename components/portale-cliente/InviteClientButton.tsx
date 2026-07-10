'use client'

import { useState } from 'react'
import { UserPlus, Loader2, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { inviteClientToPortal } from '@/app/actions/invite-client'

export function InviteClientButton({ clientId, clientName, hasAccess }: {
  clientId: string
  clientName: string
  hasAccess: boolean
}) {
  const [open, setOpen]       = useState(false)
  const [email, setEmail]     = useState('')
  const [name, setName]       = useState('')
  const [sending, setSending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !name.trim() || sending) return
    setSending(true)
    const res = await inviteClientToPortal(clientId, email.trim(), name.trim())
    setSending(false)
    if (!res.success) { toast.error(res.error); return }
    toast.success(res.alreadyExisted ? 'Link di accesso reinviato' : 'Invito inviato al cliente')
    setOpen(false); setEmail(''); setName('')
  }

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className={`flex items-center gap-1.5 text-2xs font-black px-2 py-1 rounded-full transition-all shrink-0 ${
          hasAccess
            ? 'bg-success/10 text-success hover:bg-success/20'
            : 'bg-gold/10 text-gold-text hover:bg-gold/20'
        }`}>
        {hasAccess ? <Check className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
        {hasAccess ? 'Accesso attivo' : 'Invita'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <form onSubmit={submit}
            className="bg-background border border-border rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-text-primary">Invita {clientName} al portale</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-text-tertiary hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-2xs text-text-tertiary leading-relaxed">
              Il contatto riceverà un'email per impostare la password e accedere al proprio portale, dove vedrà solo i suoi dati.
            </p>
            <div className="space-y-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome e cognome referente"
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-border" />
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@cliente.it"
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-border" />
            </div>
            <button type="submit" disabled={!email.trim() || !name.trim() || sending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gold text-on-gold text-xs font-black rounded-xl disabled:opacity-40 hover:bg-gold/90 transition-colors">
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              {hasAccess ? 'Reinvia accesso' : 'Invia invito'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
