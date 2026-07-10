'use client'

import { useState, useEffect } from 'react'
import {
  X, ChevronLeft, Loader2, Send, CheckCircle2, Clock,
  Circle, Plus, ArrowRight, Zap, AlertTriangle, MessageSquare,
  Lock, UserCheck, ChevronDown, Shield, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  createTicketFromChat, getMyTickets, getTicketMessages, replyToTicket,
  getClientTickets, getAdminTicketMessages, adminUpdateTicketStatus,
  adminAssignTicket, adminReplyTicket, deleteTicket,
  type GuestTicket, type GuestTicketMessage,
  type AdminTicket, type AdminTicketMessage,
  type TicketUrgency, type TicketCategory,
} from '@/app/actions/ticket-chat'
import type { Profile } from '@/lib/types/database'

// ─── Shared config ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; border: string; Icon: typeof Circle }> = {
  aperto:         { label: 'Aperto',         color: 'text-info',   bg: 'bg-info/10',   border: 'border-info/20',   Icon: Circle },
  in_lavorazione: { label: 'In lavorazione', color: 'text-gold-text',  bg: 'bg-gold/10',  border: 'border-gold/20',  Icon: Clock },
  in_attesa:      { label: 'In attesa',      color: 'text-orange', bg: 'bg-orange/10', border: 'border-orange/20', Icon: Clock },
  risolto:        { label: 'Risolto',        color: 'text-success',  bg: 'bg-success/10',  border: 'border-success/20',  Icon: CheckCircle2 },
  chiuso:         { label: 'Chiuso',         color: 'text-text-tertiary',     bg: 'bg-surface',     border: 'border-border',     Icon: CheckCircle2 },
}

const URGENCY: { key: TicketUrgency; emoji: string; label: string; sublabel: string; color: string; ring: string; bg: string }[] = [
  { key: 'bassa',   emoji: '🟢', label: 'Bassa',   sublabel: 'Quando puoi',      color: 'text-success',  ring: 'ring-success/40',  bg: 'bg-success/10' },
  { key: 'normale', emoji: '🔵', label: 'Normale',  sublabel: 'Entro 24 ore',     color: 'text-info',   ring: 'ring-info/40',   bg: 'bg-info/10' },
  { key: 'alta',    emoji: '🟠', label: 'Alta',     sublabel: 'Entro oggi',       color: 'text-orange', ring: 'ring-orange/40', bg: 'bg-orange/10' },
  { key: 'urgente', emoji: '🔴', label: 'Urgente',  sublabel: 'Blocca il lavoro', color: 'text-error',    ring: 'ring-error/40',    bg: 'bg-error/10' },
]

const CATEGORIES: { key: TicketCategory; label: string; icon: string }[] = [
  { key: 'tecnico',   label: 'Tecnico',   icon: '⚙️' },
  { key: 'billing',   label: 'Billing',   icon: '💳' },
  { key: 'strategia', label: 'Strategia', icon: '📈' },
  { key: 'altro',     label: 'Altro',     icon: '💬' },
]

const ic = 'w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-gold/40 transition-colors'

// ─── Guest: Thread di un ticket ───────────────────────────────────────────────

function GuestTicketThread({ ticket, onBack }: { ticket: GuestTicket; onBack: () => void }) {
  const [messages, setMessages] = useState<GuestTicketMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    getTicketMessages(ticket.id).then(m => { setMessages(m); setLoading(false) })
  }, [ticket.id])

  const send = async () => {
    const t = text.trim()
    if (!t) return
    setSending(true)
    const res = await replyToTicket(ticket.id, t)
    setSending(false)
    if (res.error) { toast.error(res.error); return }
    setMessages(p => [...p, { id: `opt-${Date.now()}`, content: t, is_internal: false, sender_id: 'me', created_at: new Date().toISOString() }])
    setText('')
  }

  const sc = STATUS_MAP[ticket.status] ?? STATUS_MAP.aperto
  const Icon = sc.Icon
  const closed = ticket.status === 'risolto' || ticket.status === 'chiuso'

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors mb-2.5">
          <ChevronLeft className="w-3.5 h-3.5" /> I miei ticket
        </button>
        <h3 className="text-sm font-bold text-text-primary leading-snug">{ticket.title}</h3>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${sc.color} ${sc.bg}`}>
            <Icon className="w-3 h-3" />{sc.label}
          </span>
          <span className="text-xs text-text-tertiary">{new Date(ticket.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {ticket.description && (
          <div className="bg-background border border-border rounded-xl p-3">
            <p className="text-2xs text-text-tertiary font-bold uppercase tracking-wide mb-1.5">La tua richiesta</p>
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{ticket.description}</p>
          </div>
        )}
        {loading && <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-text-tertiary" /></div>}
        {!loading && messages.length === 0 && (
          <div className="text-center py-8"><MessageSquare className="w-6 h-6 text-text-tertiary mx-auto mb-2" /><p className="text-xs text-text-tertiary">Il team ti risponderà presto</p></div>
        )}
        {messages.map(m => {
          const isMe = !!m.sender_id
          return (
            <div key={m.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-2xs font-black flex-shrink-0 ${isMe ? 'bg-gold/20 text-gold-text' : 'bg-surface border border-border text-text-primary'}`}>
                {isMe ? 'Tu' : 'TB'}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${isMe ? 'bg-gold/10 border border-gold/20 rounded-tr-sm' : 'bg-surface border border-border rounded-tl-sm'}`}>
                {!isMe && <p className="text-2xs text-gold-text font-black mb-1 tracking-wide">TWO BEE</p>}
                <p className="text-xs text-text-primary whitespace-pre-wrap">{m.content}</p>
                <p className="text-2xs text-text-tertiary mt-1.5">{new Date(m.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          )
        })}
        {closed && (
          <div className="text-center py-4 border-t border-border mt-2">
            <CheckCircle2 className="w-5 h-5 text-success mx-auto mb-1" />
            <p className="text-xs text-text-tertiary">Ticket {ticket.status}.</p>
          </div>
        )}
      </div>

      {!closed && (
        <div className="px-4 py-3 border-t border-border shrink-0">
          <div className="flex gap-2">
            <textarea value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={2} placeholder="Aggiungi un aggiornamento..." className={`flex-1 ${ic} resize-none text-xs`} />
            <button onClick={send} disabled={sending || !text.trim()} className="p-2.5 bg-gold text-on-gold rounded-xl disabled:opacity-40 self-end hover:bg-gold/90 transition-colors">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Guest: Form nuovo ticket ─────────────────────────────────────────────────

function GuestNewTicketForm({ channelId, onCreated, onBack }: {
  channelId: string; onCreated: (t: GuestTicket) => void; onBack: () => void
}) {
  const [step, setStep] = useState<'urgency' | 'detail'>('urgency')
  const [priority, setPriority] = useState<TicketUrgency | null>(null)
  const [form, setForm] = useState({ title: '', description: '', category: 'altro' as TicketCategory })
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!priority || !form.title.trim()) { toast.error('Descrivi il problema'); return }
    setLoading(true)
    const res = await createTicketFromChat(channelId, form.title, form.description, priority, form.category)
    if ('error' in res) { toast.error(res.error); setLoading(false); return }
    toast.success('Ticket aperto! Ti risponderemo presto 🎯')
    onCreated({ id: res.ticketId, title: form.title.trim(), description: form.description.trim() || null, status: 'aperto', priority, category: form.category, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors mb-2.5">
          <ChevronLeft className="w-3.5 h-3.5" /> I miei ticket
        </button>
        <h3 className="text-sm font-bold text-text-primary">Apri un ticket</h3>
        <p className="text-xs text-text-tertiary mt-0.5">Il team risponderà al più presto</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {step === 'urgency' ? (
          <div className="space-y-2.5">
            <p className="text-2xs text-text-tertiary font-black uppercase tracking-widest mb-4">Quanto è urgente?</p>
            {URGENCY.map(u => (
              <button key={u.key} onClick={() => { setPriority(u.key); setStep('detail') }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group hover:scale-[1.01] active:scale-[0.99] ${priority === u.key ? `ring-2 ${u.ring} border-transparent ${u.bg}` : 'border-border bg-background hover:border-border'}`}>
                <span className="text-2xl">{u.emoji}</span>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${priority === u.key ? u.color : 'text-text-primary'}`}>{u.label}</p>
                  <p className="text-xs text-text-tertiary mt-0.5">{u.sublabel}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {priority && (() => {
              const u = URGENCY.find(x => x.key === priority)!
              return (
                <button onClick={() => setStep('urgency')} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${u.color} ${u.bg} border-current/20`}>
                  {u.emoji} {u.label}<span className="text-text-tertiary font-normal ml-1">· modifica</span>
                </button>
              )
            })()}
            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Descrivi il problema *</label>
              <input autoFocus value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={ic} placeholder="es. La campagna Meta non è partita" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Dettagli aggiuntivi</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={4} className={`${ic} resize-none`} placeholder="Fornisci più informazioni: quando è successo, cosa hai già provato..." />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-2 font-medium">Categoria</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(c => (
                  <button key={c.key} onClick={() => setForm(p => ({ ...p, category: c.key }))}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all ${form.category === c.key ? 'border-gold/40 bg-gold/10 text-gold-text' : 'border-border bg-background text-text-secondary hover:border-border hover:text-text-primary'}`}>
                    <span>{c.icon}</span>{c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {step === 'detail' && (
        <div className="px-4 py-4 border-t border-border shrink-0">
          <button onClick={submit} disabled={loading || !form.title.trim() || !priority}
            className="w-full py-3.5 bg-gold text-on-gold font-black rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-gold/90 transition-colors active:scale-[0.98]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Invia ticket
          </button>
          <p className="text-center text-xs text-text-tertiary mt-2">Il team riceverà una notifica immediata</p>
        </div>
      )}
    </div>
  )
}

// ─── Admin: Thread con controlli full ─────────────────────────────────────────

function AdminTicketThread({ ticket, allProfiles, currentUserId, isSuperAdmin, onBack, onStatusChange, onDeleted }: {
  ticket: AdminTicket; allProfiles: Profile[]; currentUserId: string; isSuperAdmin: boolean
  onBack: () => void; onStatusChange: (id: string, status: string) => void; onDeleted: (id: string) => void
}) {
  const [messages, setMessages] = useState<AdminTicketMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sending, setSending] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const [localStatus, setLocalStatus] = useState(ticket.status)
  const [localAssignee, setLocalAssignee] = useState(ticket.assigned_to)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    getAdminTicketMessages(ticket.id).then(m => { setMessages(m); setLoading(false) })
  }, [ticket.id])

  const send = async () => {
    const t = text.trim()
    if (!t) return
    setSending(true)
    const res = await adminReplyTicket(ticket.id, t, isInternal)
    setSending(false)
    if (res.error) { toast.error(res.error); return }
    setMessages(p => [...p, { id: `opt-${Date.now()}`, content: t, is_internal: isInternal, sender_id: currentUserId, sender_name: 'Tu', guest_name: null, created_at: new Date().toISOString() }])
    setText('')
    if (!isInternal && localStatus === 'aperto') {
      setLocalStatus('in_lavorazione')
      onStatusChange(ticket.id, 'in_lavorazione')
    }
  }

  const changeStatus = async (s: string) => {
    setShowStatusMenu(false)
    const res = await adminUpdateTicketStatus(ticket.id, s)
    if (res.error) { toast.error(res.error); return }
    setLocalStatus(s)
    onStatusChange(ticket.id, s)
    toast.success('Status aggiornato')
  }

  const changeAssignee = async (profileId: string | null) => {
    setShowAssignMenu(false)
    const res = await adminAssignTicket(ticket.id, profileId)
    if (res.error) { toast.error(res.error); return }
    setLocalAssignee(profileId)
    toast.success(profileId ? 'Assegnato' : 'Assegnazione rimossa')
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    const res = await deleteTicket(ticket.id)
    setDeleting(false)
    if (res.error) { toast.error(res.error); setConfirmDelete(false); return }
    toast.success('Ticket eliminato')
    onDeleted(ticket.id)
    onBack()
  }

  const sc = STATUS_MAP[localStatus] ?? STATUS_MAP.aperto
  const Icon = sc.Icon
  const assignee = allProfiles.find(p => p.id === localAssignee)
  const closed = localStatus === 'risolto' || localStatus === 'chiuso'

  return (
    <div className="flex flex-col h-full">
      {/* Header thread admin */}
      <div className="px-4 py-3 border-b border-border shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Tutti i ticket
          </button>
          {isSuperAdmin && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${confirmDelete ? 'bg-error/20 text-error border border-error/40 animate-pulse' : 'text-text-tertiary hover:text-error hover:bg-error/10 border border-transparent'}`}
              onBlur={() => setConfirmDelete(false)}
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              {confirmDelete ? 'Conferma?' : 'Elimina'}
            </button>
          )}
        </div>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              {ticket.submitted_by_guest && <span className="text-2xs font-black px-1.5 py-0.5 bg-accent/20 text-accent rounded-full tracking-wide">DAL CLIENTE</span>}
              {ticket.category && <span className="text-2xs text-text-tertiary capitalize">{ticket.category}</span>}
            </div>
            <p className="text-sm font-bold text-text-primary leading-snug">{ticket.title}</p>
            {ticket.guest_name && <p className="text-2xs text-text-tertiary mt-0.5">Da: {ticket.guest_name}{ticket.guest_email ? ` · ${ticket.guest_email}` : ''}</p>}
          </div>
        </div>

        {/* Controlli status + assign */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status dropdown */}
          <div className="relative">
            <button onClick={() => { setShowStatusMenu(v => !v); setShowAssignMenu(false) }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all ${sc.color} ${sc.bg} ${sc.border}`}>
              <Icon className="w-3 h-3" />{sc.label}<ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {showStatusMenu && (
              <div className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-xl shadow-2xl z-30 py-1 min-w-[160px]">
                {Object.entries(STATUS_MAP).filter(([k]) => k !== localStatus).map(([k, v]) => {
                  const VI = v.Icon
                  return (
                    <button key={k} onClick={() => changeStatus(k)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-surface-active transition-colors ${v.color}`}>
                      <VI className="w-3.5 h-3.5" />{v.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Assign dropdown */}
          <div className="relative">
            <button onClick={() => { setShowAssignMenu(v => !v); setShowStatusMenu(false) }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-background text-xs text-text-secondary hover:text-text-primary hover:border-border transition-all">
              <UserCheck className="w-3 h-3" />
              {assignee ? assignee.full_name.split(' ')[0] : 'Assegna'}
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {showAssignMenu && (
              <div className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-xl shadow-2xl z-30 py-1 min-w-[180px] max-h-48 overflow-y-auto">
                <button onClick={() => changeAssignee(null)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-tertiary hover:bg-surface-active hover:text-text-primary transition-colors">
                  — Nessuno
                </button>
                {allProfiles.filter(p => p.app_role !== 'guest' && p.app_role !== 'client').map(p => (
                  <button key={p.id} onClick={() => changeAssignee(p.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-surface-active transition-colors ${localAssignee === p.id ? 'text-gold-text font-bold' : 'text-text-primary'}`}>
                    <div className="w-5 h-5 rounded-full bg-surface-active flex items-center justify-center text-2xs font-bold flex-shrink-0">
                      {p.full_name[0]}
                    </div>
                    {p.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messaggi */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" onClick={() => { setShowStatusMenu(false); setShowAssignMenu(false) }}>
        {ticket.description && (
          <div className="bg-background border border-border rounded-xl p-3">
            <p className="text-2xs text-text-tertiary font-bold uppercase tracking-wide mb-1.5">Descrizione originale</p>
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{ticket.description}</p>
          </div>
        )}
        {loading && <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-text-tertiary" /></div>}
        {!loading && messages.length === 0 && (
          <div className="text-center py-8"><MessageSquare className="w-6 h-6 text-text-tertiary mx-auto mb-2" /><p className="text-xs text-text-tertiary">Nessuna risposta ancora</p></div>
        )}
        {messages.map(m => {
          const isMe = m.sender_id === currentUserId
          const isGuest = !m.sender_id || (!!m.guest_name && !m.sender_name)
          const name = isGuest ? (m.guest_name ?? 'Cliente') : (m.sender_name ?? 'Team')
          return (
            <div key={m.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-2xs font-black flex-shrink-0 shrink-0 ${isGuest ? 'bg-accent/20 text-accent' : isMe ? 'bg-gold/20 text-gold-text' : 'bg-surface border border-border text-text-primary'}`}>
                {name[0]?.toUpperCase()}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${m.is_internal ? 'bg-warning/10 border border-warning/20 rounded-tr-sm' : isGuest ? 'bg-accent/10 border border-accent/20 rounded-tl-sm' : isMe ? 'bg-gold/10 border border-gold/20 rounded-tr-sm' : 'bg-surface border border-border rounded-tl-sm'}`}>
                {m.is_internal && (
                  <p className="text-2xs text-warning font-black mb-1 flex items-center gap-1 tracking-wide"><Lock className="w-2.5 h-2.5" />NOTA INTERNA</p>
                )}
                {isGuest && !m.is_internal && (
                  <p className="text-2xs text-accent font-black mb-1 tracking-wide">CLIENTE: {name}</p>
                )}
                <p className="text-xs text-text-primary whitespace-pre-wrap">{m.content}</p>
                <p className="text-2xs text-text-tertiary mt-1.5">{new Date(m.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Input admin */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <label className="flex items-center gap-1.5 text-xs text-text-tertiary cursor-pointer mb-2 w-fit">
          <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="accent-amber-400 w-3 h-3" />
          <Lock className="w-3 h-3 text-warning" />
          <span className={isInternal ? 'text-warning font-bold' : ''}>Nota interna</span>
        </label>
        <div className="flex gap-2">
          <textarea value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            rows={2} placeholder={isInternal ? 'Nota visibile solo al team...' : 'Rispondi al cliente...'}
            className={`flex-1 ${ic} resize-none text-xs ${isInternal ? 'border-warning/30 focus:border-warning/50' : ''}`} />
          <button onClick={send} disabled={sending || !text.trim() || closed}
            className={`p-2.5 rounded-xl disabled:opacity-40 self-end transition-colors ${isInternal ? 'bg-warning/20 text-warning hover:bg-warning/30' : 'bg-gold text-on-gold hover:bg-gold/90'}`}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {closed && <p className="text-2xs text-text-tertiary mt-1.5 text-center">Ticket {localStatus} — riapri cambiando lo stato</p>}
      </div>
    </div>
  )
}

// ─── Admin: Form crea ticket per cliente ──────────────────────────────────────

function AdminNewTicketForm({ channelId, allProfiles, onCreated, onBack }: {
  channelId: string; allProfiles: Profile[]; onCreated: (t: AdminTicket) => void; onBack: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'normale' as TicketUrgency, category: 'altro' as TicketCategory })

  const submit = async () => {
    if (!form.title.trim()) { toast.error('Titolo obbligatorio'); return }
    setLoading(true)
    const res = await createTicketFromChat(channelId, form.title, form.description, form.priority, form.category)
    if ('error' in res) { toast.error(res.error); setLoading(false); return }
    toast.success('Ticket creato')
    onCreated({ id: res.ticketId, title: form.title.trim(), description: form.description.trim() || null, status: 'aperto', priority: form.priority, category: form.category, submitted_by_guest: false, guest_name: null, guest_email: null, assigned_to: null, assignee_name: null, sla_hours: 24, first_response_at: null, resolved_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors mb-2.5">
          <ChevronLeft className="w-3.5 h-3.5" /> Tutti i ticket
        </button>
        <h3 className="text-sm font-bold text-text-primary">Nuovo ticket</h3>
        <p className="text-xs text-text-tertiary mt-0.5">Crea ticket per questo cliente</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <label className="block text-xs text-text-secondary mb-1.5 font-medium">Titolo *</label>
          <input autoFocus value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={ic} placeholder="es. Campagna non parte — errore pixel" />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1.5 font-medium">Descrizione</label>
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} className={`${ic} resize-none`} placeholder="Dettagli del problema..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">Priorità</label>
            <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as TicketUrgency }))} className={ic}>
              {URGENCY.map(u => <option key={u.key} value={u.key}>{u.emoji} {u.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">Categoria</label>
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as TicketCategory }))} className={ic}>
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="px-4 py-4 border-t border-border shrink-0">
        <button onClick={submit} disabled={loading || !form.title.trim()}
          className="w-full py-3 bg-gold text-on-gold font-black rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2 hover:bg-gold/90 transition-colors">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Crea ticket
        </button>
      </div>
    </div>
  )
}

// ─── Admin: Lista ticket del cliente ─────────────────────────────────────────

function AdminTicketList({ tickets, loading, onSelect, onNew }: {
  tickets: AdminTicket[]; loading: boolean; onSelect: (t: AdminTicket) => void; onNew: () => void
}) {
  const [filter, setFilter] = useState<'aperti' | 'tutti'>('aperti')
  const shown = filter === 'aperti' ? tickets.filter(t => !['risolto', 'chiuso'].includes(t.status)) : tickets

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-text-tertiary" /></div>

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Filtro tab */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 shrink-0">
        {(['aperti', 'tutti'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors capitalize ${filter === f ? 'bg-gold/15 text-gold-text border border-gold/30' : 'text-text-tertiary hover:text-text-primary border border-transparent'}`}>
            {f === 'aperti' ? `Aperti (${tickets.filter(t => !['risolto', 'chiuso'].includes(t.status)).length})` : `Tutti (${tickets.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-2">
        {shown.length === 0 && (
          <div className="text-center py-10">
            <CheckCircle2 className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
            <p className="text-xs text-text-tertiary">{filter === 'aperti' ? 'Nessun ticket aperto' : 'Nessun ticket'}</p>
            <button onClick={onNew} className="mt-3 flex items-center gap-1.5 px-4 py-2 bg-gold/10 border border-gold/20 text-gold-text text-xs font-bold rounded-xl mx-auto hover:bg-gold/20 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Crea ticket
            </button>
          </div>
        )}
        {shown.map(t => {
          const sc = STATUS_MAP[t.status] ?? STATUS_MAP.aperto
          const Icon = sc.Icon
          const urgency = URGENCY.find(u => u.key === t.priority)
          return (
            <button key={t.id} onClick={() => onSelect(t)}
              className="w-full bg-background border border-border rounded-2xl px-4 py-3.5 text-left hover:border-gold/20 transition-all group">
              <div className="flex items-start gap-3">
                <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${sc.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    {t.submitted_by_guest && <span className="text-[8px] font-black px-1 py-0.5 bg-accent/20 text-accent rounded-full">CLIENTE</span>}
                    {urgency && <span className={`text-2xs font-bold ${urgency.color}`}>{urgency.emoji} {urgency.label}</span>}
                  </div>
                  <p className="text-xs font-semibold text-text-primary truncate">{t.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-2xs font-bold ${sc.color}`}>{sc.label}</span>
                    {t.assignee_name && <span className="text-2xs text-text-tertiary">→ {t.assignee_name.split(' ')[0]}</span>}
                    <span className="text-2xs text-text-tertiary">{new Date(t.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Pannello principale ───────────────────────────────────────────────────────

type GuestView = 'list' | 'new' | 'thread'
type AdminView = 'list' | 'new' | 'thread'

export function TicketChatPanel({
  channelId, clientId, onClose, isAdminView = false, isSuperAdmin = false, allProfiles = [], currentUserId = '',
  initialTicketId,
}: {
  channelId: string
  clientId: string
  onClose: () => void
  isAdminView?: boolean
  isSuperAdmin?: boolean
  allProfiles?: Profile[]
  currentUserId?: string
  initialTicketId?: string
}) {
  // Modalità attiva: admin può switchare in client-view
  const [mode, setMode] = useState<'admin' | 'client'>(isAdminView ? 'admin' : 'client')
  const effectiveAdmin = isAdminView && mode === 'admin'

  // Guest state
  const [guestView, setGuestView] = useState<GuestView>('list')
  const [guestTickets, setGuestTickets] = useState<GuestTicket[]>([])
  const [selectedGuestTicket, setSelectedGuestTicket] = useState<GuestTicket | null>(null)

  // Admin state
  const [adminView, setAdminView] = useState<AdminView>(initialTicketId ? 'thread' : 'list')
  const [adminTickets, setAdminTickets] = useState<AdminTicket[]>([])
  const [selectedAdminTicket, setSelectedAdminTicket] = useState<AdminTicket | null>(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    if (effectiveAdmin) {
      getClientTickets(clientId).then(t => {
        setAdminTickets(t)
        // Se aperto da click su card ticket, naviga direttamente al thread
        if (initialTicketId) {
          const target = t.find(tk => tk.id === initialTicketId)
          if (target) { setSelectedAdminTicket(target); setAdminView('thread') }
        }
        setLoading(false)
      })
    } else {
      getMyTickets(clientId).then(t => { setGuestTickets(t); setLoading(false) })
    }
  }, [clientId, effectiveAdmin])

  // Reset views quando si cambia mode
  useEffect(() => {
    setAdminView('list'); setSelectedAdminTicket(null)
    setGuestView('list'); setSelectedGuestTicket(null)
  }, [mode])

  const panelTitle = effectiveAdmin ? 'Ticket Cliente' : 'Supporto'
  const panelSub = effectiveAdmin ? 'Vista interna' : 'TWO BEE'

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-border flex items-center justify-between shrink-0 bg-background">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gold/15 flex items-center justify-center">
            {effectiveAdmin
              ? <Shield className="w-3.5 h-3.5 text-gold-text" />
              : <AlertTriangle className="w-3.5 h-3.5 text-gold-text" />}
          </div>
          <div>
            <p className="text-sm font-black text-text-primary">{panelTitle}</p>
            <p className="text-2xs text-text-tertiary">{panelSub}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Bottone nuovo ticket (lista) */}
          {((effectiveAdmin && adminView === 'list') || (!effectiveAdmin && guestView === 'list')) && (
            <button
              onClick={() => effectiveAdmin ? setAdminView('new') : setGuestView('new')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-on-gold text-xs font-black rounded-lg hover:bg-gold/90 transition-colors">
              <Plus className="w-3 h-3" /> Nuovo
            </button>
          )}
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toggle admin / client-view (solo per super admin) */}
      {isAdminView && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-1 bg-background shrink-0">
          <button
            onClick={() => setMode('admin')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'admin' ? 'bg-gold/15 text-gold-text border border-gold/30' : 'text-text-tertiary hover:text-text-primary border border-transparent'}`}>
            <Shield className="w-3 h-3" /> Admin
          </button>
          <button
            onClick={() => setMode('client')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === 'client' ? 'bg-accent/15 text-accent border border-accent/30' : 'text-text-tertiary hover:text-text-primary border border-transparent'}`}>
            <AlertTriangle className="w-3 h-3" /> Vista Cliente
          </button>
        </div>
      )}

      {/* Contenuto */}
      <div className="flex-1 min-h-0 flex flex-col">
        {effectiveAdmin ? (
          <>
            {adminView === 'list' && (
              <AdminTicketList
                tickets={adminTickets} loading={loading}
                onSelect={t => { setSelectedAdminTicket(t); setAdminView('thread') }}
                onNew={() => setAdminView('new')}
              />
            )}
            {adminView === 'new' && (
              <AdminNewTicketForm
                channelId={channelId} allProfiles={allProfiles}
                onCreated={t => { setAdminTickets(p => [t, ...p]); setSelectedAdminTicket(t); setAdminView('thread') }}
                onBack={() => setAdminView('list')}
              />
            )}
            {adminView === 'thread' && selectedAdminTicket && (
              <AdminTicketThread
                ticket={selectedAdminTicket} allProfiles={allProfiles} currentUserId={currentUserId}
                isSuperAdmin={isSuperAdmin}
                onBack={() => { setAdminView('list'); setSelectedAdminTicket(null) }}
                onStatusChange={(id, status) => setAdminTickets(p => p.map(t => t.id === id ? { ...t, status } : t))}
                onDeleted={id => setAdminTickets(p => p.filter(t => t.id !== id))}
              />
            )}
          </>
        ) : (
          <>
            {guestView === 'list' && (
              <div className="flex-1 flex flex-col min-h-0">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-text-tertiary" /></div>
                ) : guestTickets.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center text-2xl">🎫</div>
                    <div>
                      <p className="text-sm font-bold text-text-primary mb-1">Nessun ticket aperto</p>
                      <p className="text-xs text-text-tertiary">Hai un problema? Aprilo qui e il team ti risponderà.</p>
                    </div>
                    <button onClick={() => setGuestView('new')}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gold text-on-gold text-sm font-black rounded-xl hover:bg-gold/90 transition-colors">
                      <Plus className="w-4 h-4" /> Apri ticket
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                    {guestTickets.filter(t => !['risolto', 'chiuso'].includes(t.status)).length > 0 && (
                      <p className="text-2xs text-text-tertiary font-black uppercase tracking-widest mb-1">Aperti</p>
                    )}
                    {guestTickets.filter(t => !['risolto', 'chiuso'].includes(t.status)).map(t => {
                      const sc = STATUS_MAP[t.status] ?? STATUS_MAP.aperto
                      const Icon = sc.Icon
                      return (
                        <button key={t.id} onClick={() => { setSelectedGuestTicket(t); setGuestView('thread') }}
                          className="w-full bg-background border border-border rounded-2xl px-4 py-3.5 text-left hover:border-gold/20 transition-all group">
                          <div className="flex items-start gap-3">
                            <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${sc.color}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-text-primary truncate">{t.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-2xs font-bold ${sc.color}`}>{sc.label}</span>
                                <span className="text-2xs text-text-tertiary">{new Date(t.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>
                              </div>
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                          </div>
                        </button>
                      )
                    })}
                    {guestTickets.filter(t => ['risolto', 'chiuso'].includes(t.status)).length > 0 && (
                      <>
                        <p className="text-2xs text-text-tertiary font-black uppercase tracking-widest mt-4 mb-1">Risolti</p>
                        {guestTickets.filter(t => ['risolto', 'chiuso'].includes(t.status)).map(t => {
                          const sc = STATUS_MAP[t.status] ?? STATUS_MAP.chiuso
                          const Icon = sc.Icon
                          return (
                            <button key={t.id} onClick={() => { setSelectedGuestTicket(t); setGuestView('thread') }}
                              className="w-full bg-background border border-border rounded-2xl px-4 py-3 text-left opacity-50 hover:opacity-80 transition-all group">
                              <div className="flex items-start gap-3">
                                <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${sc.color}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-text-primary truncate">{t.title}</p>
                                  <span className={`text-2xs font-bold ${sc.color}`}>{sc.label}</span>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {guestView === 'new' && (
              <GuestNewTicketForm channelId={channelId}
                onCreated={t => { setGuestTickets(p => [t, ...p]); setSelectedGuestTicket(t); setGuestView('thread') }}
                onBack={() => setGuestView('list')} />
            )}
            {guestView === 'thread' && selectedGuestTicket && (
              <GuestTicketThread ticket={selectedGuestTicket} onBack={() => { setGuestView('list'); setSelectedGuestTicket(null) }} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
