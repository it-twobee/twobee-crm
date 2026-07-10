'use client'

import { useState, useEffect } from 'react'
import { Plus, X, ChevronLeft, Loader2, Send, Clock, CheckCircle2, AlertTriangle, Circle } from 'lucide-react'
import { toast } from 'sonner'
import {
  createPortalTicket, getPortalTicketMessages, addPortalTicketMessage,
  getPortalTickets,
  type PortalInfo, type PortalTicket, type PortalMessage,
} from '@/app/actions/ticket-portal'

const ic = 'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/50'

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: typeof Circle }> = {
  aperto:          { label: 'Aperto',        color: 'text-info',  bg: 'bg-info/10',   icon: Circle },
  in_lavorazione:  { label: 'In lavorazione',color: 'text-gold-text', bg: 'bg-gold/10', icon: Clock },
  in_attesa:       { label: 'In attesa',     color: 'text-orange',bg: 'bg-orange/10', icon: Clock },
  risolto:         { label: 'Risolto',       color: 'text-success', bg: 'bg-success/10',  icon: CheckCircle2 },
  chiuso:          { label: 'Chiuso',        color: 'text-text-tertiary',   bg: 'bg-surface',      icon: CheckCircle2 },
}

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  bassa:   { label: 'Bassa',   color: 'text-text-secondary' },
  normale: { label: 'Normale', color: 'text-text-primary' },
  alta:    { label: 'Alta',    color: 'text-orange' },
  urgente: { label: 'Urgente', color: 'text-error' },
}

function GuestForm({ onSave }: { onSave: (name: string, email: string) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-sm">
        <div className="flex items-center justify-center mb-6">
          <div className="w-10 h-10 bg-gold rounded-xl flex items-center justify-center">
            <span className="text-on-gold font-black text-sm">TB</span>
          </div>
        </div>
        <h1 className="text-xl font-bold text-text-primary text-center mb-1">Portale Supporto</h1>
        <p className="text-sm text-text-secondary text-center mb-6">Inserisci i tuoi dati per continuare</p>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} className={ic} placeholder="Il tuo nome *" />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" className={ic} placeholder="Email (opzionale)" />
          <button
            onClick={() => name.trim() ? onSave(name.trim(), email.trim()) : toast.error('Inserisci il tuo nome')}
            className="w-full py-3 bg-gold text-on-gold font-bold rounded-lg hover:bg-gold/90 transition-colors"
          >
            Accedi al portale
          </button>
        </div>
      </div>
    </div>
  )
}

function NewTicketForm({ token, guestName, guestEmail, onCreated, onCancel }: {
  token: string; guestName: string; guestEmail: string
  onCreated: (t: PortalTicket) => void; onCancel: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'normale', category: 'altro' })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Titolo obbligatorio'); return }
    setLoading(true)
    const res = await createPortalTicket(token, form.title, form.description, form.priority, form.category, guestName, guestEmail)
    if ('error' in res) { toast.error(res.error); setLoading(false); return }
    // Ricarica ticket
    const tickets = await getPortalTickets(token)
    const created = tickets.find(t => t.id === res.id)
    if (created) onCreated(created)
    setLoading(false)
    toast.success('Ticket inviato! Ti risponderemo il prima possibile.')
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto">
        <button onClick={onCancel} className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Torna ai ticket
        </button>
        <h1 className="text-xl font-bold text-text-primary mb-6">Apri un nuovo ticket</h1>
        <form onSubmit={submit} className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Titolo *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className={ic} placeholder="Descrivi brevemente il problema o la richiesta" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Descrizione dettagliata</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={4} className={`${ic} resize-none`}
              placeholder="Fornisci tutti i dettagli utili: quando è successo, cosa hai già provato, link o screenshot..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Urgenza</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className={ic}>
                <option value="bassa">🟢 Bassa — quando puoi</option>
                <option value="normale">🔵 Normale</option>
                <option value="alta">🟠 Alta — entro oggi</option>
                <option value="urgente">🔴 Urgente — blocca tutto</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Categoria</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className={ic}>
                <option value="tecnico">Tecnico</option>
                <option value="billing">Billing / Pagamenti</option>
                <option value="strategia">Strategia</option>
                <option value="altro">Altro</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel}
              className="flex-1 py-3 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-3 bg-gold text-on-gold font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Invia ticket
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TicketDetail({ token, ticket, guestName, guestEmail, onBack }: {
  token: string; ticket: PortalTicket; guestName: string; guestEmail: string; onBack: () => void
}) {
  const [messages, setMessages] = useState<PortalMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    getPortalTicketMessages(token, ticket.id).then(msgs => { setMessages(msgs); setLoaded(true) })
  }, [token, ticket.id])

  const send = async () => {
    if (!text.trim()) return
    setSending(true)
    const res = await addPortalTicketMessage(token, ticket.id, text, guestName, guestEmail)
    setSending(false)
    if ('error' in res) { toast.error(res.error); return }
    setMessages(p => [...p, {
      id: res.id, content: text.trim(), is_internal: false,
      sender_id: null, guest_name: guestName, created_at: new Date().toISOString(),
    }])
    setText('')
    toast.success('Messaggio inviato')
  }

  const sc = STATUS_CFG[ticket.status] ?? STATUS_CFG.aperto
  const pc = PRIORITY_CFG[ticket.priority] ?? PRIORITY_CFG.normale

  const isClosed = ticket.status === 'risolto' || ticket.status === 'chiuso'

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Tutti i ticket
          </button>
          <h1 className="text-base font-bold text-text-primary">{ticket.title}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sc.color} ${sc.bg}`}>{sc.label}</span>
            <span className={`text-xs font-bold ${pc.color}`}>{pc.label}</span>
            {ticket.category && <span className="text-xs text-text-tertiary capitalize">{ticket.category}</span>}
            <span className="text-xs text-text-tertiary">
              {new Date(ticket.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
            </span>
          </div>
        </div>
      </div>

      {/* Messaggi */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
          {/* Descrizione originale */}
          {ticket.description && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-2xs text-text-tertiary mb-1.5 font-bold uppercase tracking-wide">Richiesta originale</p>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{ticket.description}</p>
            </div>
          )}

          {!loaded && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
            </div>
          )}

          {messages.map(m => {
            const isGuest = !m.sender_id
            return (
              <div key={m.id} className={`flex gap-3 ${isGuest ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isGuest ? 'bg-gold/20 text-gold-text' : 'bg-surface text-text-primary border border-border'}`}>
                  {isGuest ? (m.guest_name?.[0] ?? '?') : 'TB'}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isGuest ? 'bg-gold/10 border border-gold/20 rounded-tr-sm' : 'bg-surface border border-border rounded-tl-sm'}`}>
                  <p className={`text-2xs font-bold mb-1 ${isGuest ? 'text-gold-text' : 'text-text-secondary'}`}>
                    {isGuest ? (m.guest_name ?? 'Tu') : 'TWO BEE'}
                  </p>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{m.content}</p>
                  <p className="text-2xs text-text-tertiary mt-1.5">
                    {new Date(m.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })}

          {isClosed && (
            <div className="text-center py-4">
              <CheckCircle2 className="w-6 h-6 text-success mx-auto mb-1" />
              <p className="text-xs text-text-secondary">Questo ticket è {ticket.status}. Apri un nuovo ticket per ulteriore supporto.</p>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      {!isClosed && (
        <div className="border-t border-border bg-background p-4 sticky bottom-0">
          <div className="max-w-2xl mx-auto flex gap-3">
            <textarea
              value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={2} placeholder="Scrivi un aggiornamento..." className={`flex-1 ${ic} resize-none text-sm`}
            />
            <button onClick={send} disabled={sending || !text.trim()}
              className="px-4 py-2 bg-gold text-on-gold rounded-xl font-bold disabled:opacity-40 self-end flex items-center gap-1.5">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function TicketPortalClient({ token, portalInfo, initialTickets }: {
  token: string; portalInfo: PortalInfo; initialTickets: PortalTicket[]
}) {
  const [guestName, setGuestName] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem(`tb_portal_name_${token}`)
    return null
  })
  const [guestEmail, setGuestEmail] = useState<string>('')
  const [tickets, setTickets] = useState(initialTickets)
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list')
  const [selectedTicket, setSelectedTicket] = useState<PortalTicket | null>(null)

  const saveGuest = (name: string, email: string) => {
    localStorage.setItem(`tb_portal_name_${token}`, name)
    if (email) localStorage.setItem(`tb_portal_email_${token}`, email)
    setGuestName(name)
    setGuestEmail(email)
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const email = localStorage.getItem(`tb_portal_email_${token}`) ?? ''
      setGuestEmail(email)
    }
  }, [token])

  if (!guestName) return <GuestForm onSave={saveGuest} />

  if (view === 'new') {
    return (
      <NewTicketForm
        token={token}
        guestName={guestName}
        guestEmail={guestEmail}
        onCreated={t => { setTickets(p => [t, ...p]); setView('list') }}
        onCancel={() => setView('list')}
      />
    )
  }

  if (view === 'detail' && selectedTicket) {
    return (
      <TicketDetail
        token={token}
        ticket={selectedTicket}
        guestName={guestName}
        guestEmail={guestEmail}
        onBack={() => { setView('list'); setSelectedTicket(null) }}
      />
    )
  }

  // Lista ticket
  const open = tickets.filter(t => !['risolto', 'chiuso'].includes(t.status))
  const closed = tickets.filter(t => ['risolto', 'chiuso'].includes(t.status))

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-6 h-6 bg-gold rounded-md flex items-center justify-center">
                <span className="text-on-gold font-black text-2xs">TB</span>
              </div>
              <span className="text-xs text-text-secondary">{portalInfo.company_name}</span>
            </div>
            <h1 className="text-base font-bold text-text-primary">I tuoi ticket</h1>
          </div>
          <button onClick={() => setView('new')}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold text-sm font-bold rounded-lg hover:bg-gold/90 transition-colors">
            <Plus className="w-4 h-4" /> Nuovo ticket
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        {tickets.length === 0 && (
          <div className="text-center py-16">
            <CheckCircle2 className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
            <p className="text-sm text-text-secondary mb-1">Nessun ticket aperto</p>
            <p className="text-xs text-text-tertiary">Hai bisogno di aiuto? Apri un ticket e ti risponderemo presto.</p>
            <button onClick={() => setView('new')}
              className="mt-4 px-6 py-2.5 bg-gold text-on-gold text-sm font-bold rounded-lg">
              Apri il primo ticket
            </button>
          </div>
        )}

        {open.length > 0 && (
          <div>
            <p className="text-xs text-text-secondary font-bold uppercase tracking-wide mb-2">Aperti ({open.length})</p>
            <div className="space-y-2">
              {open.map(t => <TicketRow key={t.id} ticket={t} onClick={() => { setSelectedTicket(t); setView('detail') }} />)}
            </div>
          </div>
        )}

        {closed.length > 0 && (
          <div>
            <p className="text-xs text-text-secondary font-bold uppercase tracking-wide mb-2">Risolti ({closed.length})</p>
            <div className="space-y-2 opacity-60">
              {closed.map(t => <TicketRow key={t.id} ticket={t} onClick={() => { setSelectedTicket(t); setView('detail') }} />)}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-text-tertiary pb-4">
          Ciao {guestName} •{' '}
          <button className="underline" onClick={() => {
            localStorage.removeItem(`tb_portal_name_${token}`)
            localStorage.removeItem(`tb_portal_email_${token}`)
            setGuestName(null)
          }}>Cambia nome</button>
        </p>
      </div>
    </div>
  )
}

function TicketRow({ ticket, onClick }: { ticket: PortalTicket; onClick: () => void }) {
  const sc = STATUS_CFG[ticket.status] ?? STATUS_CFG.aperto
  const pc = PRIORITY_CFG[ticket.priority] ?? PRIORITY_CFG.normale
  const Icon = sc.icon

  return (
    <button onClick={onClick}
      className="w-full bg-surface border border-border rounded-xl px-4 py-4 text-left hover:border-gold/20 transition-colors">
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${sc.color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{ticket.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs ${sc.color}`}>{sc.label}</span>
            <span className={`text-xs ${pc.color}`}>{pc.label}</span>
            <span className="text-xs text-text-tertiary">
              {new Date(ticket.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>
        <ChevronLeft className="w-4 h-4 text-text-tertiary rotate-180 flex-shrink-0 mt-0.5" />
      </div>
    </button>
  )
}
