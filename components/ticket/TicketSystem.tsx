'use client'

import { useState } from 'react'
import {
  Plus, CheckCircle2, X, Loader2, MessageSquare, Lock,
  Users, ExternalLink, Copy, Link2, Filter, Trash2,
  BarChart2, TrendingUp, Clock, Shield,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { getOrCreatePortal } from '@/app/actions/ticket-portal'
import { deleteTicket } from '@/app/actions/ticket-chat'
import type { Ticket, TicketMessage, TicketStatus, TicketPriority, Profile, Client } from '@/lib/types/database'

interface TicketWithClient extends Ticket {
  client?: Pick<Client, 'id' | 'company_name'> | null
  assignee?: Pick<Profile, 'id' | 'full_name'> | null
  submitted_by_guest?: boolean
  guest_name?: string | null
  guest_email?: string | null
}

interface Props {
  tickets: TicketWithClient[]
  profiles: Profile[]
  clients: Pick<Client, 'id' | 'company_name'>[]
  currentUserId: string
  isSuperAdmin?: boolean
}

const ic = 'w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/50'

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bg: string }> = {
  aperto:          { label: 'Aperto',        color: 'text-blue-400',  bg: 'bg-blue-400/10' },
  in_lavorazione:  { label: 'In lavorazione',color: 'text-gold',      bg: 'bg-gold/10' },
  in_attesa:       { label: 'In attesa',     color: 'text-warning',   bg: 'bg-warning/10' },
  risolto:         { label: 'Risolto',       color: 'text-success',   bg: 'bg-success/10' },
  chiuso:          { label: 'Chiuso',        color: 'text-[#444]',    bg: 'bg-[#1A1A1A]' },
}

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string }> = {
  bassa:   { label: 'Bassa',   color: 'text-text-secondary' },
  normale: { label: 'Normale', color: 'text-white' },
  alta:    { label: 'Alta',    color: 'text-warning' },
  urgente: { label: 'Urgente', color: 'text-error' },
}

function slaStatus(ticket: Ticket) {
  if (ticket.status === 'risolto' || ticket.status === 'chiuso') return null
  const elapsed = (Date.now() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60)
  const pct = (elapsed / ticket.sla_hours) * 100
  if (pct >= 100) return { label: `SLA superato di ${Math.round(elapsed - ticket.sla_hours)}h`, color: 'text-error' }
  if (pct >= 75)  return { label: `${Math.round(ticket.sla_hours - elapsed)}h al SLA`, color: 'text-warning' }
  return null
}

// ─── Modal crea/modifica ticket ────────────────────────────────────────────────
function TicketModal({ ticket, onClose, onSaved, profiles, clients, currentUserId }: {
  ticket?: Ticket | null; onClose: () => void; onSaved: (t: Ticket) => void
  profiles: Profile[]; clients: Pick<Client, 'id' | 'company_name'>[]; currentUserId: string
}) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title:       ticket?.title ?? '',
    description: ticket?.description ?? '',
    client_id:   ticket?.client_id ?? '',
    priority:    ticket?.priority ?? 'normale' as TicketPriority,
    category:    ticket?.category ?? 'altro',
    assigned_to: ticket?.assigned_to ?? '',
    sla_hours:   ticket?.sla_hours?.toString() ?? '24',
  })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title) { toast.error('Titolo obbligatorio'); return }
    setLoading(true)
    const supabase = createClient()
    const payload = {
      title: form.title, description: form.description || null,
      client_id: form.client_id || null, priority: form.priority,
      category: form.category || null, assigned_to: form.assigned_to || null,
      sla_hours: parseInt(form.sla_hours) || 24,
      status: ticket?.status ?? 'aperto',
      created_by: currentUserId,
    }
    const result = ticket
      ? await supabase.from('tickets').update(payload).eq('id', ticket.id).select().single()
      : await supabase.from('tickets').insert(payload).select().single()
    setLoading(false)
    if (result.error) { toast.error(result.error.message); return }
    toast.success(ticket ? 'Ticket aggiornato' : 'Ticket creato')
    onSaved(result.data as Ticket)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#161616] border border-[#2A2A2A] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A] sticky top-0 bg-[#161616]">
          <h2 className="text-base font-bold text-white">{ticket ? 'Modifica ticket' : 'Nuovo ticket'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-text-secondary" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Titolo *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={ic} placeholder="es. Campagna non parte — errore pixel" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Descrizione</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3} className={`${ic} resize-none`} placeholder="Descrivi il problema o la richiesta..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Cliente</label>
              <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))} className={ic}>
                <option value="">— Nessuno —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Priorità</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as TicketPriority }))} className={ic}>
                {(Object.entries(PRIORITY_CONFIG) as [TicketPriority, { label: string }][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Categoria</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as typeof form.category }))} className={ic}>
                <option value="tecnico">Tecnico</option>
                <option value="billing">Billing</option>
                <option value="strategia">Strategia</option>
                <option value="altro">Altro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Assegna a</label>
              <select value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))} className={ic}>
                <option value="">— Nessuno —</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">SLA (ore)</label>
              <select value={form.sla_hours} onChange={e => setForm(p => ({ ...p, sla_hours: e.target.value }))} className={ic}>
                <option value="4">4 ore</option>
                <option value="8">8 ore</option>
                <option value="24">24 ore</option>
                <option value="48">48 ore</option>
                <option value="72">72 ore</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-[#2A2A2A] rounded-lg text-sm text-text-secondary">Annulla</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-gold text-black font-bold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}{ticket ? 'Aggiorna' : 'Crea ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Dettaglio ticket (vista interna) ──────────────────────────────────────────
function TicketDetail({ ticket, profiles, currentUserId, isSuperAdmin, onClose, onStatusChange, onDeleted }: {
  ticket: TicketWithClient; profiles: Profile[]
  currentUserId: string; isSuperAdmin: boolean; onClose: () => void
  onStatusChange: (id: string, status: TicketStatus) => void
  onDeleted: (id: string) => void
}) {
  const [messages, setMessages] = useState<(TicketMessage & { guest_name?: string })[]>([])
  const [loaded, setLoaded] = useState(false)
  const [text, setText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const loadMessages = async () => {
    if (loaded) return
    const { data } = await createClient().from('ticket_messages').select('*').eq('ticket_id', ticket.id).order('created_at')
    setMessages(data ?? [])
    setLoaded(true)
  }

  const sendMessage = async () => {
    if (!text.trim()) return
    setSending(true)
    const supabase = createClient()
    const { data } = await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id, content: text, is_internal: isInternal, sender_id: currentUserId,
    }).select().single()
    setSending(false)
    if (data) { setMessages(p => [...p, data as TicketMessage]); setText('') }
    if (messages.length === 0 && !ticket.first_response_at) {
      await supabase.from('tickets').update({ first_response_at: new Date().toISOString(), status: 'in_lavorazione' }).eq('id', ticket.id)
      onStatusChange(ticket.id, 'in_lavorazione')
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    const res = await deleteTicket(ticket.id)
    setDeleting(false)
    if (res.error) { toast.error(res.error); setConfirmDelete(false); return }
    toast.success('Ticket eliminato')
    onDeleted(ticket.id)
    onClose()
  }

  const sc = STATUS_CONFIG[ticket.status]
  const pc = PRIORITY_CONFIG[ticket.priority]
  const sla = slaStatus(ticket)
  const assignee = profiles.find(p => p.id === ticket.assigned_to)

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-end p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#161616] border border-[#2A2A2A] rounded-2xl w-full max-w-lg h-full max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#2A2A2A]">
          <div className="flex-1 min-w-0 mr-3">
            <div className="flex items-center gap-1.5 mb-1">
              {ticket.submitted_by_guest && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">DAL CLIENTE</span>
              )}
            </div>
            <p className="text-sm font-bold text-white">{ticket.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sc.color} ${sc.bg}`}>{sc.label}</span>
              <span className={`text-xs font-bold ${pc.color}`}>{pc.label}</span>
              {ticket.client && <span className="text-xs text-text-secondary">{ticket.client.company_name}</span>}
              {sla && <span className={`text-xs font-bold ${sla.color}`}>{sla.label}</span>}
            </div>
            {ticket.submitted_by_guest && ticket.guest_name && (
              <p className="text-[10px] text-text-secondary mt-1">Da: {ticket.guest_name}{ticket.guest_email ? ` (${ticket.guest_email})` : ''}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                onBlur={() => setConfirmDelete(false)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${confirmDelete ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse' : 'text-[#555] hover:text-red-400 hover:bg-red-500/10 border border-transparent'}`}>
                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {confirmDelete ? 'Conferma?' : 'Elimina'}
              </button>
            )}
            <button onClick={onClose}><X className="w-5 h-5 text-text-secondary" /></button>
          </div>
        </div>

        {/* Sposta status */}
        <div className="px-5 py-3 border-b border-[#2A2A2A] flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-secondary">Sposta:</span>
          {(Object.entries(STATUS_CONFIG) as [TicketStatus, { label: string; color: string; bg: string }][])
            .filter(([k]) => k !== ticket.status)
            .map(([k, v]) => (
              <button key={k} onClick={() => onStatusChange(ticket.id, k)}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${v.color} ${v.bg} border-current/20`}>
                {v.label}
              </button>
            ))}
          {assignee && <span className="ml-auto text-xs text-text-secondary">→ {assignee.full_name.split(' ')[0]}</span>}
        </div>

        {/* Messaggi */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3" onClick={loadMessages}>
          {!loaded && <button onClick={loadMessages} className="text-xs text-gold hover:underline">Carica conversazione</button>}
          {ticket.description && (
            <div className="bg-[#111] rounded-xl p-3 text-xs text-text-secondary border border-[#2A2A2A]">
              <p className="text-[10px] text-[#444] mb-1">Descrizione originale</p>
              {ticket.description}
            </div>
          )}
          {messages.map(m => {
            const sender = profiles.find(p => p.id === m.sender_id)
            const isGuest = !m.sender_id
            return (
              <div key={m.id} className={`flex gap-2 ${m.sender_id === currentUserId ? 'flex-row-reverse' : ''}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isGuest ? 'bg-purple-500/20 text-purple-400' : 'bg-gold/20 text-gold'}`}>
                  {isGuest ? (m.guest_name?.[0] ?? '?') : (sender ? sender.full_name[0] : '?')}
                </div>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 ${m.is_internal ? 'bg-warning/10 border border-warning/20' : isGuest ? 'bg-purple-500/10 border border-purple-500/20' : m.sender_id === currentUserId ? 'bg-gold/10 border border-gold/20' : 'bg-[#1A1A1A] border border-[#2A2A2A]'}`}>
                  {m.is_internal && <p className="text-[9px] text-warning font-bold mb-1 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> NOTA INTERNA</p>}
                  {isGuest && <p className="text-[9px] text-purple-400 font-bold mb-1">CLIENTE: {m.guest_name ?? 'Guest'}</p>}
                  <p className="text-xs text-white">{m.content}</p>
                  <p className="text-[10px] text-[#444] mt-1">{new Date(m.created_at).toLocaleDateString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            )
          })}
          {loaded && messages.length === 0 && <p className="text-xs text-[#444] text-center py-4">Nessun messaggio ancora</p>}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-[#2A2A2A]">
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer mb-2">
            <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="accent-warning" />
            <Lock className="w-3 h-3" /> Nota interna (non visibile al cliente)
          </label>
          <div className="flex gap-2">
            <textarea value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              rows={2} placeholder="Scrivi risposta..." className={`flex-1 ${ic} resize-none text-xs`} />
            <button onClick={sendMessage} disabled={sending || !text.trim()}
              className="px-4 py-2 bg-gold text-black text-xs font-bold rounded-lg disabled:opacity-50 self-end">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Invia'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Vista analytics ───────────────────────────────────────────────────────────
function AnalyticsView({ tickets, clients }: { tickets: TicketWithClient[]; clients: Pick<Client, 'id' | 'company_name'>[] }) {
  const total = tickets.length
  const resolved = tickets.filter(t => t.status === 'risolto' || t.status === 'chiuso').length
  const resolutionTimes = tickets
    .filter(t => t.resolved_at && t.created_at)
    .map(t => (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60))
  const avgResolutionHours = resolutionTimes.length
    ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
    : null
  const slaViolations = tickets.filter(t => slaStatus(t)?.color === 'text-error').length
  const slaCompliance = total > 0 ? Math.round(((total - slaViolations) / total) * 100) : 100

  // Priority distribution
  const byPriority: Record<string, number> = { urgente: 0, alta: 0, normale: 0, bassa: 0 }
  tickets.forEach(t => { byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1 })
  const maxPriority = Math.max(...Object.values(byPriority), 1)

  // Category distribution
  const byCategory: Record<string, number> = { tecnico: 0, billing: 0, strategia: 0, altro: 0 }
  tickets.forEach(t => { const k = t.category ?? 'altro'; byCategory[k] = (byCategory[k] ?? 0) + 1 })
  const maxCat = Math.max(...Object.values(byCategory), 1)

  // Status distribution
  const byStatus: Record<string, number> = { aperto: 0, in_lavorazione: 0, in_attesa: 0, risolto: 0, chiuso: 0 }
  tickets.forEach(t => { byStatus[t.status] = (byStatus[t.status] ?? 0) + 1 })

  // Top clients
  const byClient: Record<string, { name: string; count: number; open: number }> = {}
  tickets.forEach(t => {
    if (!t.client_id) return
    const name = t.client?.company_name ?? 'Sconosciuto'
    if (!byClient[t.client_id]) byClient[t.client_id] = { name, count: 0, open: 0 }
    byClient[t.client_id].count++
    if (!['risolto', 'chiuso'].includes(t.status)) byClient[t.client_id].open++
  })
  const topClients = Object.values(byClient).sort((a, b) => b.count - a.count).slice(0, 5)
  const maxClientCount = Math.max(...topClients.map(c => c.count), 1)

  // Trend ultimi 6 mesi
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    return { label: d.toLocaleDateString('it-IT', { month: 'short' }), year: d.getFullYear(), month: d.getMonth(), count: 0, resolved: 0 }
  })
  tickets.forEach(t => {
    const d = new Date(t.created_at)
    const m = months.find(m => m.year === d.getFullYear() && m.month === d.getMonth())
    if (m) { m.count++; if (t.status === 'risolto' || t.status === 'chiuso') m.resolved++ }
  })
  const maxMonth = Math.max(...months.map(m => m.count), 1)

  // Motivazioni (category) from guest tickets only
  const guestByCategory: Record<string, number> = {}
  tickets.filter(t => t.submitted_by_guest).forEach(t => {
    const k = t.category ?? 'altro'; guestByCategory[k] = (guestByCategory[k] ?? 0) + 1
  })

  const statCard = (label: string, value: string | number, sub: string, color: string) => (
    <div className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-[10px] text-[#444] mt-0.5">{sub}</p>
    </div>
  )

  const bar = (pct: number, color: string) => (
    <div className="flex-1 h-2 bg-[#1A1A1A] rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCard('Totale ticket', total, 'storico completo', 'text-white')}
        {statCard('Risolti', resolved, `${total > 0 ? Math.round((resolved / total) * 100) : 0}% del totale`, 'text-success')}
        {statCard('Tempo medio', avgResolutionHours != null ? `${avgResolutionHours}h` : '—', 'dalla richiesta alla risoluzione', 'text-gold')}
        {statCard('SLA compliance', `${slaCompliance}%`, `${slaViolations} violazioni attive`, slaCompliance >= 90 ? 'text-success' : slaCompliance >= 70 ? 'text-warning' : 'text-error')}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Trend mensile */}
        <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-gold" />
            <p className="text-sm font-bold text-white">Trend ultimi 6 mesi</p>
          </div>
          <div className="flex items-end gap-2 h-24">
            {months.map(m => (
              <div key={`${m.year}-${m.month}`} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: '80px' }}>
                  <div
                    className="w-full bg-gold/30 rounded-t-sm transition-all"
                    style={{ height: `${(m.count / maxMonth) * 80}px`, minHeight: m.count > 0 ? '4px' : '0' }}
                  />
                </div>
                <p className="text-[9px] text-[#555] capitalize">{m.label}</p>
                <p className="text-[10px] text-white font-bold">{m.count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Top clienti */}
        <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-gold" />
            <p className="text-sm font-bold text-white">Top clienti</p>
          </div>
          {topClients.length === 0 ? (
            <p className="text-xs text-[#555]">Nessun dato</p>
          ) : (
            <div className="space-y-3">
              {topClients.map(c => (
                <div key={c.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white font-medium truncate max-w-[60%]">{c.name}</p>
                    <div className="flex items-center gap-2">
                      {c.open > 0 && <span className="text-[10px] text-blue-400 font-bold">{c.open} aperti</span>}
                      <span className="text-[10px] text-[#555]">{c.count} tot</span>
                    </div>
                  </div>
                  {bar(Math.round((c.count / maxClientCount) * 100), 'bg-gold/40')}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Distribuzione priorità */}
        <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-gold" />
            <p className="text-sm font-bold text-white">Per urgenza</p>
          </div>
          <div className="space-y-3">
            {[
              { k: 'urgente', l: '🔴 Urgente',  color: 'bg-red-500/60' },
              { k: 'alta',    l: '🟠 Alta',     color: 'bg-orange-500/60' },
              { k: 'normale', l: '🔵 Normale',  color: 'bg-blue-500/60' },
              { k: 'bassa',   l: '🟢 Bassa',    color: 'bg-green-500/60' },
            ].map(({ k, l, color }) => (
              <div key={k} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-white">{l}</p>
                  <p className="text-xs text-[#555]">{byPriority[k] ?? 0}</p>
                </div>
                {bar(Math.round(((byPriority[k] ?? 0) / maxPriority) * 100), color)}
              </div>
            ))}
          </div>
        </div>

        {/* Distribuzione categoria */}
        <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-gold" />
            <p className="text-sm font-bold text-white">Per categoria</p>
          </div>
          <div className="space-y-3">
            {[
              { k: 'tecnico',   l: '⚙️ Tecnico',   color: 'bg-purple-500/60' },
              { k: 'billing',   l: '💳 Billing',   color: 'bg-gold/60' },
              { k: 'strategia', l: '📈 Strategia', color: 'bg-blue-400/60' },
              { k: 'altro',     l: '💬 Altro',     color: 'bg-[#555]' },
            ].map(({ k, l, color }) => (
              <div key={k} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-white">{l}</p>
                  <p className="text-xs text-[#555]">{byCategory[k] ?? 0}</p>
                </div>
                {bar(Math.round(((byCategory[k] ?? 0) / maxCat) * 100), color)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status snapshot */}
      <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-gold" />
          <p className="text-sm font-bold text-white">Snapshot status attuale</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <div key={k} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${v.bg} border-current/10`}>
              <span className={`text-lg font-black ${v.color}`}>{byStatus[k] ?? 0}</span>
              <span className={`text-xs font-bold ${v.color}`}>{v.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Vista portali cliente ─────────────────────────────────────────────────────
function PortaliView({ clients, tickets }: { clients: Pick<Client, 'id' | 'company_name'>[]; tickets: TicketWithClient[] }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [links, setLinks] = useState<Record<string, string>>({})

  const getLink = async (clientId: string) => {
    if (links[clientId]) {
      await navigator.clipboard.writeText(links[clientId])
      toast.success('Link copiato!')
      return
    }
    setLoading(clientId)
    const res = await getOrCreatePortal(clientId)
    setLoading(null)
    if ('error' in res) { toast.error(res.error); return }
    const url = `${window.location.origin}/ticket-portal/${res.token}`
    setLinks(p => ({ ...p, [clientId]: url }))
    await navigator.clipboard.writeText(url)
    toast.success('Link portale copiato negli appunti!')
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#111] border border-[#2A2A2A] rounded-xl p-4 flex items-start gap-3">
        <Link2 className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-white mb-0.5">Portale Clienti</p>
          <p className="text-xs text-text-secondary">Ogni cliente ha un link univoco. Il cliente accede senza registrarsi, crea ticket con urgenza e dettagli, e segue lo stato in tempo reale.</p>
        </div>
      </div>

      <div className="space-y-2">
        {clients.map(c => {
          const clientTickets = tickets.filter(t => t.client_id === c.id)
          const openCount = clientTickets.filter(t => !['risolto', 'chiuso'].includes(t.status)).length
          return (
            <div key={c.id} className="bg-surface border border-[#2A2A2A] rounded-xl px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{c.company_name}</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {openCount > 0
                    ? <span className="text-gold font-bold">{openCount} aperti</span>
                    : <span>Nessun ticket aperto</span>}
                  {clientTickets.length > 0 && <span className="text-[#444]"> · {clientTickets.length} totali</span>}
                </p>
                {links[c.id] && (
                  <p className="text-[10px] text-[#555] mt-1 truncate font-mono">{links[c.id]}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => getLink(c.id)}
                  disabled={loading === c.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-xs text-white hover:border-gold/30 transition-colors disabled:opacity-50"
                >
                  {loading === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : links[c.id] ? <Copy className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                  {links[c.id] ? 'Copia' : 'Genera link'}
                </button>
                {links[c.id] && (
                  <a href={links[c.id]} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-text-secondary hover:text-white transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main export ───────────────────────────────────────────────────────────────
export function TicketSystem({ tickets: initialTickets, profiles, clients, currentUserId, isSuperAdmin = false }: Props) {
  const [tickets, setTickets] = useState(initialTickets)
  const [view, setView] = useState<'interno' | 'analytics' | 'portali'>('interno')
  const [showModal, setShowModal] = useState(false)
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<TicketWithClient | null>(null)
  const [filterStatus, setFilterStatus] = useState<TicketStatus | 'tutti'>('tutti')
  const [filterPriority, setFilterPriority] = useState<TicketPriority | 'tutti'>('tutti')
  const [filterClient, setFilterClient] = useState('')

  const filtered = tickets.filter(t =>
    (filterStatus === 'tutti' || t.status === filterStatus) &&
    (filterPriority === 'tutti' || t.priority === filterPriority) &&
    (!filterClient || t.client_id === filterClient)
  )

  const handleSaved = (t: Ticket) => {
    setTickets(p => {
      const exists = p.find(x => x.id === t.id)
      return exists ? p.map(x => x.id === t.id ? { ...x, ...t } : x) : [t as TicketWithClient, ...p]
    })
  }

  const handleDeleted = (id: string) => {
    setTickets(p => p.filter(t => t.id !== id))
  }

  const changeStatus = async (id: string, status: TicketStatus) => {
    const updates: Partial<Ticket> = { status }
    if (status === 'risolto') updates.resolved_at = new Date().toISOString()
    await createClient().from('tickets').update(updates).eq('id', id)
    setTickets(p => p.map(t => t.id === id ? { ...t, ...updates } : t))
    if (selectedTicket?.id === id) setSelectedTicket(prev => prev ? { ...prev, ...updates } : prev)
  }

  const open = tickets.filter(t => t.status === 'aperto').length
  const inProgress = tickets.filter(t => t.status === 'in_lavorazione').length
  const withSlaAlert = tickets.filter(t => slaStatus(t)?.color === 'text-error').length
  const fromGuest = tickets.filter(t => t.submitted_by_guest).length

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Aperti', v: open, c: 'text-blue-400' },
          { l: 'In lavorazione', v: inProgress, c: 'text-gold' },
          { l: 'SLA superato', v: withSlaAlert, c: withSlaAlert > 0 ? 'text-error' : 'text-success' },
          { l: 'Dal cliente', v: fromGuest, c: 'text-purple-400' },
        ].map(k => (
          <div key={k.l} className="bg-surface border border-[#2A2A2A] rounded-xl p-4">
            <p className="text-xs text-text-secondary mb-1">{k.l}</p>
            <p className={`text-2xl font-black ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 p-1 bg-[#111] border border-[#2A2A2A] rounded-xl w-fit">
        <button onClick={() => setView('interno')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${view === 'interno' ? 'bg-surface text-white' : 'text-text-secondary hover:text-white'}`}>
          <Filter className="w-3.5 h-3.5" /> Vista Interna
        </button>
        <button onClick={() => setView('analytics')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${view === 'analytics' ? 'bg-surface text-white' : 'text-text-secondary hover:text-white'}`}>
          <BarChart2 className="w-3.5 h-3.5" /> Analitiche
        </button>
        <button onClick={() => setView('portali')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${view === 'portali' ? 'bg-surface text-white' : 'text-text-secondary hover:text-white'}`}>
          <Users className="w-3.5 h-3.5" /> Portali Cliente
        </button>
      </div>

      {view === 'analytics' ? (
        <AnalyticsView tickets={tickets} clients={clients} />
      ) : view === 'portali' ? (
        <PortaliView clients={clients} tickets={tickets} />
      ) : (
        <>
          {/* Filtri + nuovo */}
          <div className="flex items-center gap-2 flex-wrap">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
              className="bg-surface border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none">
              <option value="tutti">Tutti gli status</option>
              {(Object.entries(STATUS_CONFIG) as [TicketStatus, { label: string }][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as typeof filterPriority)}
              className="bg-surface border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none">
              <option value="tutti">Tutte le priorità</option>
              {(Object.entries(PRIORITY_CONFIG) as [TicketPriority, { label: string }][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
              className="bg-surface border border-[#2A2A2A] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none">
              <option value="">Tutti i clienti</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
            <span className="text-xs text-text-secondary ml-1">{filtered.length} ticket</span>
            <button onClick={() => { setEditingTicket(null); setShowModal(true) }}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-gold text-black text-sm font-bold rounded-lg hover:bg-yellow-400">
              <Plus className="w-4 h-4" /> Nuovo ticket
            </button>
          </div>

          {/* Lista ticket */}
          <div className="space-y-2">
            {filtered.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-2" />
                <p className="text-sm text-white font-bold">Nessun ticket</p>
              </div>
            )}
            {filtered.map(t => {
              const sc = STATUS_CONFIG[t.status]
              const pc = PRIORITY_CONFIG[t.priority]
              const sla = slaStatus(t)
              const assignee = profiles.find(p => p.id === t.assigned_to)
              return (
                <div key={t.id} onClick={() => setSelectedTicket(t)}
                  className="bg-surface border border-[#2A2A2A] rounded-xl px-5 py-4 cursor-pointer hover:border-gold/20 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sc.color} ${sc.bg}`}>{sc.label}</span>
                        <span className={`text-xs font-bold ${pc.color}`}>{pc.label}</span>
                        {t.category && <span className="text-[10px] text-text-secondary capitalize">{t.category}</span>}
                        {t.submitted_by_guest && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">CLIENTE</span>}
                        {sla && <span className={`text-[10px] font-bold ${sla.color}`}>{sla.label}</span>}
                      </div>
                      <p className="text-sm font-semibold text-white">{t.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-text-secondary">
                        {t.client && <span>{t.client.company_name}</span>}
                        {assignee && <span>→ {assignee.full_name.split(' ')[0]}</span>}
                        <span>{new Date(t.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <MessageSquare className="w-4 h-4 text-text-secondary flex-shrink-0 mt-1" />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {showModal && (
        <TicketModal
          ticket={editingTicket}
          profiles={profiles} clients={clients} currentUserId={currentUserId}
          onClose={() => setShowModal(false)} onSaved={handleSaved}
        />
      )}

      {selectedTicket && (
        <TicketDetail
          ticket={selectedTicket} profiles={profiles} currentUserId={currentUserId}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setSelectedTicket(null)}
          onStatusChange={changeStatus}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
