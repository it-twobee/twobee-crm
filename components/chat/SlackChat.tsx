'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send, Paperclip, Users, UserPlus, X, Loader2,
  Smile, Bold, Italic, Code, FileText, Download,
  Film, Archive, Check, Edit3, Trash2, Pin, MoreHorizontal,
  Lock, Volume2, VolumeX, Shield, AlertTriangle, ChevronDown,
  Info, LogOut, Settings, Plus, Search, Headphones, ChevronRight, Sparkles, Loader2 as Spinner,
} from 'lucide-react'
import { TicketChatPanel } from '@/components/ticket/TicketChatPanel'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { getInitials } from '@/lib/utils'
import { inviteChannelGuest, revokeChannelGuest } from '@/app/actions/invite-guest'
import { SUPER_ADMIN_EMAILS, ROLE_LABELS } from '@/lib/permissions'
import type { Profile, ChatMessageWithSender, ChannelGuest } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Attachment {
  url: string; name: string; type: 'image' | 'video' | 'pdf' | 'file'; size?: number
}
interface MessageExtended extends Omit<ChatMessageWithSender, 'is_pinned'> {
  parsedAttachments?: Attachment[]
  is_pinned: boolean
}

export interface SlackChatProps {
  channelId: string
  channelName: string
  channelType: 'cliente' | 'interno' | 'task' | 'customer_care' | 'cliente_interno'
  channelLabel?: string
  currentProfile: Profile
  allProfiles: Profile[]
  isAdmin?: boolean
  isArchived?: boolean      // override — es. client.client_label === 'perso'
  isReadOnly?: boolean      // override — blocca input anche per admin
  clientId?: string
  headerExtra?: React.ReactNode
  onArchiveToggle?: (archived: boolean) => void
}

// ─── Utils ───────────────────────────────────────────────────────────────────

const QUICK_REACTIONS = ['👍', '✅', '🔥', '👀', '🙏', '❤️', '😂', '⚡']

function getFileType(mimeType: string): Attachment['type'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf') return 'pdf'
  return 'file'
}

function parseAttachments(raw: string[] | null): Attachment[] {
  if (!raw) return []
  return raw.map(entry => {
    try { return JSON.parse(entry) as Attachment } catch {
      const url = entry; const name = url.split('/').pop() ?? 'file'
      const ext = name.split('.').pop()?.toLowerCase() ?? ''
      const type: Attachment['type'] = ['jpg','jpeg','png','gif','webp','svg'].includes(ext) ? 'image'
        : ['mp4','mov','webm'].includes(ext) ? 'video' : ext === 'pdf' ? 'pdf' : 'file'
      return { url, name, type }
    }
  })
}

function fmtBytes(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

// ─── Pending attachment preview ───────────────────────────────────────────────

function PendingAtt({ att, onRemove }: { att: { file: File; preview?: string }; onRemove: () => void }) {
  const isImg = att.file.type.startsWith('image/')
  return (
    <div className="relative group inline-flex items-center gap-2 bg-surface border border-border rounded-lg p-2 pr-3 max-w-[180px]">
      {isImg && att.preview
        ? <img src={att.preview} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
        : <div className="w-10 h-10 rounded bg-surface-hover flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-text-secondary" /></div>}
      <div className="min-w-0">
        <p className="text-xs text-text-primary truncate font-medium">{att.file.name}</p>
        <p className="text-2xs text-text-secondary">{fmtBytes(att.file.size)}</p>
      </div>
      <button onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-error rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <X className="w-2.5 h-2.5 text-text-primary" />
      </button>
    </div>
  )
}

// ─── Attachment in message ────────────────────────────────────────────────────

function AttachmentDisplay({ att }: { att: Attachment }) {
  const [imgErr, setImgErr] = useState(false)
  if (att.type === 'image' && !imgErr) {
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer" className="block mt-2 max-w-sm">
        <img src={att.url} alt={att.name} onError={() => setImgErr(true)}
          className="rounded-xl max-h-72 object-cover border border-border hover:opacity-90 transition-opacity cursor-pointer" />
        <p className="text-2xs text-text-secondary mt-1">{att.name}{att.size ? ` · ${fmtBytes(att.size)}` : ''}</p>
      </a>
    )
  }
  if (att.type === 'video') {
    return (
      <div className="mt-2 max-w-sm">
        <video src={att.url} controls className="rounded-xl max-h-64 border border-border w-full" />
        <p className="text-2xs text-text-secondary mt-1">{att.name}</p>
      </div>
    )
  }
  const attType = att.type as string
  const Icon = attType === 'pdf' ? FileText : attType === 'video' ? Film : Archive
  return (
    <a href={att.url} target="_blank" rel="noopener noreferrer" download={att.name}
      className="flex items-center gap-3 mt-2 bg-surface border border-border rounded-xl p-3 hover:border-gold/30 transition-colors max-w-xs group/att">
      <div className="w-10 h-10 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-gold-text" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{att.name}</p>
        {att.size && <p className="text-xs text-text-secondary">{fmtBytes(att.size)}</p>}
      </div>
      <Download className="w-4 h-4 text-text-secondary group-hover/att:text-gold-text transition-colors shrink-0" />
    </a>
  )
}

// ─── Message Row ──────────────────────────────────────────────────────────────

interface Reaction { emoji: string; count: number; byMe: boolean; profiles: string[] }

function MessageRow({ msg, isOwn, compact, isAdmin, currentUserId, onEdit, onDelete, onPin, onOpenTicket }: {
  msg: MessageExtended; isOwn: boolean; compact: boolean; isAdmin: boolean; currentUserId: string
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
  onPin: (id: string, pinned: boolean) => void
  onOpenTicket?: (ticketId: string) => void
}) {
  const [showActions, setShowActions] = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState(msg.content)
  const [saving, setSaving] = useState(false)
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [loadedReactions, setLoadedReactions] = useState(false)
  const canEdit = isOwn || isAdmin
  const canDelete = isOwn || isAdmin

  // Carica reactions al mount
  useEffect(() => {
    const sb = createClient()
    sb.from('message_reactions')
      .select('emoji, profile_id, profiles!message_reactions_profile_id_fkey(full_name)')
      .eq('message_id', msg.id)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, { count: number; byMe: boolean; profiles: string[] }> = {}
        for (const r of (data as unknown) as Array<{ emoji: string; profile_id: string; profiles: { full_name: string } | null }>) {
          if (!map[r.emoji]) map[r.emoji] = { count: 0, byMe: false, profiles: [] }
          map[r.emoji].count++
          if (r.profile_id === currentUserId) map[r.emoji].byMe = true
          if (r.profiles?.full_name) map[r.emoji].profiles.push(r.profiles.full_name)
        }
        setReactions(Object.entries(map).map(([emoji, v]) => ({ emoji, ...v })))
        setLoadedReactions(true)
      })
  }, [msg.id, currentUserId])

  const toggleReaction = async (emoji: string) => {
    setShowReactions(false)
    const sb = createClient()
    const existing = reactions.find(r => r.emoji === emoji)
    if (existing?.byMe) {
      await sb.from('message_reactions').delete().eq('message_id', msg.id).eq('profile_id', currentUserId).eq('emoji', emoji)
      setReactions(p => p.map(r => r.emoji === emoji
        ? { ...r, count: r.count - 1, byMe: false, profiles: r.profiles.filter(n => n !== currentUserId) }
        : r
      ).filter(r => r.count > 0))
    } else {
      await sb.from('message_reactions').insert({ message_id: msg.id, profile_id: currentUserId, emoji })
      setReactions(p => {
        const found = p.find(r => r.emoji === emoji)
        if (found) return p.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, byMe: true } : r)
        return [...p, { emoji, count: 1, byMe: true, profiles: [] }]
      })
    }
  }

  const saveEdit = async () => {
    if (!editText.trim() || editText === msg.content) { setEditMode(false); return }
    setSaving(true)
    const sb = createClient()
    await sb.from('chat_messages').update({ content: editText.trim(), edited_at: new Date().toISOString() }).eq('id', msg.id)
    setSaving(false)
    onEdit(msg.id, editText.trim())
    setEditMode(false)
  }

  const handleDelete = async () => {
    if (!confirm('Eliminare questo messaggio?')) return
    const sb = createClient()
    await sb.from('chat_messages').update({ is_deleted: true }).eq('id', msg.id)
    onDelete(msg.id)
  }

  const handlePin = async () => {
    const sb = createClient()
    const newPinned = !msg.is_pinned
    await sb.from('chat_messages').update({ is_pinned: newPinned }).eq('id', msg.id)
    onPin(msg.id, newPinned)
    toast.success(newPinned ? 'Messaggio pinnato' : 'Pin rimosso')
  }

  const atts = msg.parsedAttachments ?? []

  return (
    <div
      className={`group/msg relative flex items-start gap-3 px-4 py-0.5 rounded-lg transition-colors
        ${msg.is_pinned ? 'bg-gold/5 border-l-2 border-gold/40 pl-3' : 'hover:bg-overlay/[0.02]'}
        ${compact ? 'mt-0' : 'mt-2'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactions(false) }}
    >
      {compact ? (
        <div className="w-9 shrink-0 flex items-start justify-center pt-1">
          <span className="text-2xs text-text-secondary opacity-0 group-hover/msg:opacity-100 transition-opacity leading-none">
            {new Date(msg.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      ) : (
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 overflow-hidden border ${isOwn ? 'bg-gold/30 border-gold/40 text-gold-text' : 'bg-surface-hover text-text-primary border-border-strong'}`}>
          {msg.sender?.avatar_url
            ? <img src={msg.sender.avatar_url} className="w-full h-full object-cover" alt="" />
            : getInitials(msg.sender?.full_name ?? '?')}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {!compact && (
          <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
            <span className="text-sm font-bold text-text-primary leading-none">{msg.sender?.full_name ?? 'Utente'}</span>
            <span className="text-2xs text-text-secondary">
              {new Date(msg.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {msg.edited_at && <span className="text-2xs text-text-secondary italic">(modificato)</span>}
            {msg.is_pinned && <span className="text-2xs text-gold-text font-semibold flex items-center gap-0.5"><Pin className="w-2.5 h-2.5" />Pinnato</span>}
            {isAdmin && !isOwn && <span className="text-2xs text-text-tertiary">· {msg.sender?.full_name?.split(' ')[0]}</span>}
          </div>
        )}

        {editMode ? (
          <div className="mt-1">
            <textarea value={editText} onChange={e => setEditText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } if (e.key === 'Escape') setEditMode(false) }}
              rows={2} autoFocus
              className="w-full bg-surface border border-gold/40 rounded-lg px-3 py-2 text-sm text-text-primary resize-none focus:outline-none" />
            <div className="flex items-center gap-2 mt-1.5">
              <button onClick={saveEdit} disabled={saving}
                className="flex items-center gap-1 text-xs text-on-gold bg-gold px-2.5 py-1 rounded-lg font-bold hover:bg-gold/90 disabled:opacity-50">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salva
              </button>
              <button onClick={() => setEditMode(false)} className="text-xs text-text-secondary hover:text-text-primary px-2 py-1">Annulla</button>
              <span className="text-2xs text-text-secondary">Invio salva · Esc annulla</span>
            </div>
          </div>
        ) : (
          <>
            {msg.content.startsWith('__TICKET__') ? (() => {
              try {
                const data = JSON.parse(msg.content.slice(10))
                const priorityColors: Record<string, string> = { urgente: 'text-error bg-error/10 border-error/20', alta: 'text-orange bg-orange/10 border-orange/20', normale: 'text-info bg-info/10 border-info/20', bassa: 'text-success bg-success/10 border-success/20' }
                const pc = priorityColors[data.priority] ?? priorityColors.normale
                const canOpen = isAdmin && onOpenTicket && data.ticketId
                return (
                  <div
                    onClick={() => canOpen && onOpenTicket(data.ticketId)}
                    className={`inline-flex items-center gap-3 px-4 py-3 rounded-2xl border mt-1 max-w-sm ${pc} ${canOpen ? 'cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all' : ''}`}
                  >
                    <span className="text-xl">{data.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-2xs font-black uppercase tracking-widest opacity-70 mb-0.5">Ticket · {data.priorityLabel}</p>
                      <p className="text-sm font-bold text-text-primary truncate">{data.title}</p>
                      {data.category && <p className="text-2xs opacity-60 capitalize mt-0.5">{data.category}</p>}
                      {canOpen && <p className="text-2xs opacity-50 mt-1">Clicca per gestire →</p>}
                    </div>
                  </div>
                )
              } catch { return <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p> }
            })() : (
              <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
            )}
            {atts.map((att, i) => <AttachmentDisplay key={i} att={att} />)}
          </>
        )}

        {/* Reactions */}
        {loadedReactions && reactions.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-1.5">
            {reactions.map(r => (
              <div key={r.emoji} className="relative group/reaction">
                <button
                  onClick={() => toggleReaction(r.emoji)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-all hover:scale-105 active:scale-95
                    ${r.byMe
                      ? 'bg-gold/20 border-gold/40 text-gold-text'
                      : 'bg-surface border-border text-text-secondary hover:border-border-strong hover:text-text-primary'}`}
                >
                  <span className="text-sm leading-none">{r.emoji}</span>
                  <span className="font-bold leading-none">{r.count}</span>
                </button>
                {r.profiles.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover/reaction:flex flex-col z-30 pointer-events-none">
                    <div className="bg-surface border border-border rounded-xl px-3 py-2 shadow-2xl whitespace-nowrap">
                      <p className="text-2xs text-text-secondary font-bold uppercase tracking-wider mb-1">{r.emoji} {r.count} {r.count === 1 ? 'reazione' : 'reazioni'}</p>
                      {r.profiles.map(name => (
                        <p key={name} className="text-xs text-text-primary leading-snug">{name}</p>
                      ))}
                      {r.byMe && <p className="text-xs text-gold-text leading-snug">Tu</p>}
                    </div>
                    <div className="w-2 h-2 bg-surface border-r border-b border-border rotate-45 self-start ml-3 -mt-1" />
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={() => setShowReactions(v => !v)}
              className="flex items-center px-1.5 py-0.5 rounded-full border border-dashed border-border text-text-tertiary hover:text-text-primary hover:border-border-strong transition-colors text-xs"
              title="Aggiungi reazione"
            >
              <Smile className="w-3 h-3" />
            </button>
            {showReactions && (
              <div className="absolute bg-surface border border-border rounded-2xl p-2 flex gap-1 shadow-2xl z-20 mt-1">
                {QUICK_REACTIONS.map(e => (
                  <button key={e} onClick={() => toggleReaction(e)}
                    className={`text-base hover:scale-125 transition-transform p-1 rounded hover:bg-surface-hover ${reactions.find(r => r.emoji === e)?.byMe ? 'bg-gold/20' : ''}`}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hover actions toolbar */}
      {showActions && !editMode && (
        <div className="absolute -top-4 right-3 flex items-center gap-0.5 bg-surface border border-border rounded-xl shadow-2xl z-10 px-1.5 py-1">
          {/* Quick reactions */}
          <div className="relative">
            <button onClick={() => setShowReactions(v => !v)}
              className="p-1.5 hover:bg-surface-hover rounded-lg text-text-secondary hover:text-text-primary transition-colors" title="Reazione">
              <Smile className="w-3.5 h-3.5" />
            </button>
            {showReactions && (
              <div className="absolute bottom-full right-0 mb-1 bg-surface border border-border rounded-2xl p-2 flex gap-1 shadow-2xl z-20">
                {QUICK_REACTIONS.map(e => (
                  <button key={e} onClick={() => toggleReaction(e)}
                    className={`text-base hover:scale-125 transition-transform p-1 rounded hover:bg-surface-hover ${reactions.find(r => r.emoji === e)?.byMe ? 'bg-gold/20' : ''}`}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pin (admin only) */}
          {isAdmin && (
            <button onClick={handlePin}
              className={`p-1.5 hover:bg-surface-hover rounded-lg transition-colors ${msg.is_pinned ? 'text-gold-text' : 'text-text-secondary hover:text-text-primary'}`}
              title={msg.is_pinned ? 'Rimuovi pin' : 'Pinna messaggio'}>
              <Pin className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Edit */}
          {canEdit && (
            <button onClick={() => { setEditMode(true); setShowActions(false) }}
              className="p-1.5 hover:bg-surface-hover rounded-lg text-text-secondary hover:text-text-primary transition-colors" title={isAdmin && !isOwn ? 'Modifica (Admin)' : 'Modifica'}>
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Delete */}
          {canDelete && (
            <button onClick={handleDelete}
              className="p-1.5 hover:bg-surface-hover rounded-lg text-text-secondary hover:text-error transition-colors" title={isAdmin && !isOwn ? 'Elimina (Admin)' : 'Elimina'}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Members panel ────────────────────────────────────────────────────────────

function MembersPanel({ members, nonMembers, onAdd, onRemove, onClose, currentProfileId, isAdmin }: {
  members: Profile[]; nonMembers: Profile[]
  onAdd: (id: string) => void; onRemove: (id: string) => void
  onClose: () => void; currentProfileId: string; isAdmin: boolean
}) {
  const [showAdd, setShowAdd] = useState(false)
  return (
    <div className="w-60 border-l border-border bg-surface flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-bold text-text-primary">Membri ({members.length})</h3>
        <div className="flex items-center gap-1.5">
          {isAdmin && (
            <button onClick={() => setShowAdd(v => !v)} className="p-1 text-text-secondary hover:text-gold-text transition-colors" title="Aggiungi membro">
              <UserPlus className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary transition-colors"><X className="w-4 h-4" /></button>
        </div>
      </div>
      {showAdd && nonMembers.length > 0 && (
        <div className="border-b border-border p-2 max-h-48 overflow-y-auto">
          <p className="text-2xs text-text-secondary px-2 mb-1 uppercase tracking-wider">Aggiungi</p>
          {nonMembers.map(p => (
            <button key={p.id} onClick={() => { onAdd(p.id); setShowAdd(false) }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors text-left">
              <div className="w-6 h-6 rounded-full bg-surface-hover flex items-center justify-center text-xs text-text-primary font-bold shrink-0 overflow-hidden">
                {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : getInitials(p.full_name)}
              </div>
              <span className="text-xs text-text-primary truncate">{p.full_name}</span>
              <span className="text-2xs text-text-secondary capitalize ml-auto">{p.app_role?.replace('_',' ')}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        <p className="text-2xs text-text-secondary px-2 mb-2 uppercase tracking-wider">Nel canale</p>
        {members.map(m => (
          <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-hover group transition-colors">
            <div className="relative shrink-0">
              <div className="w-7 h-7 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold-text text-2xs font-bold overflow-hidden">
                {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" alt="" /> : getInitials(m.full_name)}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-surface" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary truncate">{m.full_name}</p>
              <p className="text-2xs text-text-secondary capitalize">{m.app_role?.replace('_',' ')}</p>
            </div>
            {isAdmin && m.id !== currentProfileId && (
              <button onClick={() => onRemove(m.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-text-secondary hover:text-error transition-all">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Guest Panel (Customer Care) ─────────────────────────────────────────────

// ─── Access Panel (Gestisci Accessi) ─────────────────────────────────────────

// ─── Partecipanti (sola lettura) ─────────────────────────────────────────────
// Chi c'è in questa chat: interni (membri del team, col ruolo da ROLE_LABELS) ed
// esterni (channel_guests: contatti cliente e partner, col ruolo dichiarato all'invito).
// È una vista informativa aperta a tutti: la GESTIONE (aggiungi/rimuovi/invita) resta
// in "Gestisci accessi", riservata agli admin.
function ParticipantsPanel({ members, guests, currentProfileId, onClose }: {
  members: Profile[]
  guests: ChannelGuest[]
  currentProfileId: string
  onClose: () => void
}) {
  const clienti = guests.filter(g => g.guest_type === 'cliente')
  const partner = guests.filter(g => g.guest_type === 'partner')
  const total = members.length + guests.length

  const roleOf = (p: Profile) =>
    p.app_role ? (ROLE_LABELS[p.app_role] ?? p.app_role) : 'Team'

  const GuestRow = ({ g }: { g: ChannelGuest }) => (
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-surface transition-colors">
      <div className="w-7 h-7 rounded-full bg-info/15 flex items-center justify-center text-info text-2xs font-bold shrink-0">
        {getInitials(g.full_name ?? g.email)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text-primary truncate">{g.full_name ?? g.email}</p>
        <p className="text-2xs text-text-secondary truncate">{g.role ?? (g.guest_type === 'cliente' ? 'Cliente' : 'Partner')}</p>
      </div>
      {g.status === 'pending' && (
        <span className="text-[9px] font-bold uppercase tracking-wider text-warning bg-warning-dim px-1.5 py-0.5 rounded-full shrink-0">
          Invitato
        </span>
      )}
    </div>
  )

  return (
    <div className="w-80 border-l border-border bg-surface flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gold-text" />
          <h3 className="text-sm font-bold text-text-primary">Partecipanti ({total})</h3>
        </div>
        <button onClick={onClose} aria-label="Chiudi">
          <X className="w-4 h-4 text-text-secondary hover:text-text-primary" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div>
          <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold px-1 mb-1.5">
            Team TwoBee ({members.length})
          </p>
          {members.length === 0 ? (
            <p className="text-2xs text-text-tertiary px-1">Nessun membro interno.</p>
          ) : members.map(m => (
            <div key={m.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-surface transition-colors">
              <div className="w-7 h-7 rounded-full bg-gold/20 flex items-center justify-center text-gold-text text-2xs font-bold overflow-hidden shrink-0">
                {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" alt="" /> : getInitials(m.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-text-primary truncate">
                  {m.full_name}
                  {m.id === currentProfileId && <span className="text-text-tertiary font-normal"> (tu)</span>}
                </p>
                <p className="text-2xs text-text-secondary truncate">{roleOf(m)}</p>
              </div>
            </div>
          ))}
        </div>

        {clienti.length > 0 && (
          <div>
            <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold px-1 mb-1.5">
              Cliente ({clienti.length})
            </p>
            {clienti.map(g => <GuestRow key={g.id} g={g} />)}
          </div>
        )}

        {partner.length > 0 && (
          <div>
            <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold px-1 mb-1.5">
              Esterni ({partner.length})
            </p>
            {partner.map(g => <GuestRow key={g.id} g={g} />)}
          </div>
        )}

        {guests.length === 0 && (
          <p className="text-2xs text-text-tertiary px-1">Nessun partecipante esterno.</p>
        )}
      </div>
    </div>
  )
}

function AccessPanel({ channelId, channelType, members, allProfiles, isAdmin, currentProfileId, onAddMember, onRemoveMember, onClose }: {
  channelId: string
  channelType: string
  members: Profile[]
  allProfiles: Profile[]
  isAdmin: boolean
  currentProfileId: string
  onAddMember: (id: string) => void
  onRemoveMember: (id: string) => void
  onClose: () => void
}) {
  const isCC = channelType === 'customer_care' || channelType === 'cliente'
  const [tab, setTab] = useState<'team' | 'cliente' | 'esterni'>(isCC ? 'team' : 'team')
  const [guests, setGuests] = useState<ChannelGuest[]>([])
  const [loadingGuests, setLoadingGuests] = useState(true)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('')
  const [inviteType, setInviteType] = useState<'cliente' | 'partner'>('cliente')
  const [sending, setSending] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [showAddMember, setShowAddMember] = useState(false)  // §27.1: collassata di base

  useEffect(() => {
    createClient().from('channel_guests').select('*').eq('channel_id', channelId).neq('status', 'revoked').order('invited_at')
      .then(({ data }) => { setGuests((data ?? []) as ChannelGuest[]); setLoadingGuests(false) })
  }, [channelId])

  const clientGuests = guests.filter(g => g.guest_type === 'cliente')
  const partnerGuests = guests.filter(g => g.guest_type === 'partner')
  // `nonMembersAll` regge l'intestazione collassabile (contatore + visibilità): se usassi
  // la lista già filtrata, una ricerca senza risultati farebbe sparire tutta la sezione.
  const nonMembersAll = allProfiles.filter(p => !members.find(m => m.id === p.id))
  const nonMembers = nonMembersAll.filter(p => p.full_name?.toLowerCase().includes(memberSearch.toLowerCase()))

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim() || !inviteName.trim() || !inviteRole.trim()) return
    const currentType = tab === 'cliente' ? 'cliente' : 'partner'
    const limit = currentType === 'cliente' ? 5 : 5
    const current = currentType === 'cliente' ? clientGuests.length : partnerGuests.length
    if (current >= limit) { toast.error(`Limite di ${limit} ${currentType === 'cliente' ? 'clienti' : 'partner'} raggiunto`); return }
    setSending(true)
    const res = await inviteChannelGuest(channelId, inviteEmail.trim(), currentType, inviteName.trim(), inviteRole.trim())
    setSending(false)
    if (!res.success) { toast.error(res.error ?? 'Errore invito'); return }
    toast.success(`Invito inviato a ${inviteEmail}`)
    setInviteEmail(''); setInviteName(''); setInviteRole(''); setShowInviteForm(false)
    const { data } = await createClient().from('channel_guests').select('*').eq('channel_id', channelId).neq('status', 'revoked').order('invited_at')
    setGuests((data ?? []) as ChannelGuest[])
  }

  const revoke = async (guestId: string, email: string) => {
    if (!confirm(`Revocare accesso a ${email}?`)) return
    const res = await revokeChannelGuest(guestId)
    if (!res.success) { toast.error(res.error ?? 'Errore'); return }
    setGuests(prev => prev.filter(g => g.id !== guestId))
    toast.success('Accesso revocato')
  }

  const statusDot: Record<string, string> = { pending: 'bg-warning', active: 'bg-success', revoked: 'bg-error' }
  const statusLabel: Record<string, string> = { pending: 'Invitato', active: 'Attivo' }
  const tabs = [
    { id: 'team' as const, label: 'Team TwoBee', count: members.length },
    ...(isCC ? [{ id: 'cliente' as const, label: 'Cliente', count: clientGuests.length, max: 5 }] : []),
    { id: 'esterni' as const, label: 'Esterni', count: partnerGuests.length, max: 5 },
  ]

  return (
    <div className="w-80 border-l border-border bg-surface flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gold-text" />
          <h3 className="text-sm font-bold text-text-primary">Gestisci Accessi</h3>
        </div>
        <button onClick={onClose}><X className="w-4 h-4 text-text-secondary hover:text-text-primary" /></button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setShowInviteForm(false) }}
            className={`flex-1 py-2 text-2xs font-bold uppercase tracking-wider transition-colors border-b-2 ${tab === t.id ? 'text-gold-text border-gold' : 'text-text-secondary border-transparent hover:text-text-primary'}`}>
            {t.label}
            <span className={`ml-1 ${tab === t.id ? 'text-gold-text' : 'text-text-secondary'}`}>
              {t.count}{'max' in t ? `/${t.max}` : ''}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── TAB: Team TwoBee ── */}
        {tab === 'team' && (
          <div className="p-3 space-y-1">
            <p className="text-2xs text-text-secondary px-1 mb-2">Membri del team TwoBee con accesso a questo canale</p>
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-surface group transition-colors">
                <div className="w-7 h-7 rounded-full bg-gold/20 flex items-center justify-center text-gold-text text-2xs font-bold overflow-hidden shrink-0">
                  {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" alt="" /> : getInitials(m.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">{m.full_name}</p>
                  <p className="text-2xs text-text-secondary truncate">{m.email}</p>
                </div>
                {isAdmin && m.id !== currentProfileId && (
                  <button onClick={() => onRemoveMember(m.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-text-secondary hover:text-error transition-all shrink-0" title="Rimuovi">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {/* §27.1: collassata di base anche qui (Customer Care → Gestisci Accessi). */}
            {isAdmin && nonMembersAll.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <button onClick={() => setShowAddMember(v => !v)}
                  className="w-full flex items-center gap-1.5 px-1 mb-2 text-2xs text-text-secondary uppercase tracking-wider font-bold hover:text-text-primary transition-colors">
                  {showAddMember ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Aggiungi membro team
                  <span className="ml-auto normal-case tracking-normal font-normal text-text-tertiary">{nonMembersAll.length}</span>
                </button>
                {showAddMember && (
                  <>
                    <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-2.5 py-1.5 mb-2 focus-within:border-gold/40">
                      <Search className="w-3 h-3 text-text-secondary shrink-0" />
                      <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Cerca..."
                        className="flex-1 bg-transparent text-xs text-text-primary focus:outline-none placeholder:text-text-secondary" />
                    </div>
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {nonMembers.map(p => (
                        <button key={p.id} onClick={() => onAddMember(p.id)}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-surface transition-colors text-left group/a">
                          <div className="w-6 h-6 rounded-full bg-surface-hover flex items-center justify-center text-2xs font-bold text-text-primary overflow-hidden shrink-0">
                            {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : getInitials(p.full_name)}
                          </div>
                          <span className="text-xs text-text-secondary group-hover/a:text-text-primary flex-1 truncate">{p.full_name}</span>
                          <Plus className="w-3 h-3 text-text-secondary opacity-0 group-hover/a:opacity-100 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Cliente (CC only) ── */}
        {tab === 'cliente' && (
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-2xs text-text-secondary">Max 5 contatti del cliente · accesso solo Customer Care</p>
              {isAdmin && clientGuests.length < 5 && (
                <button onClick={() => setShowInviteForm(v => !v)}
                  className={`p-1.5 rounded-lg transition-colors ${showInviteForm ? 'text-gold-text bg-gold/10' : 'text-text-secondary hover:text-gold-text'}`}>
                  <UserPlus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {showInviteForm && <InviteForm type="cliente" onSubmit={sendInvite} email={inviteEmail} setEmail={setInviteEmail} name={inviteName} setName={setInviteName} role={inviteRole} setRole={setInviteRole} sending={sending} onCancel={() => setShowInviteForm(false)} />}
            <GuestList guests={clientGuests} loading={loadingGuests} statusDot={statusDot} statusLabel={statusLabel} onRevoke={isAdmin ? revoke : undefined} emptyLabel="Nessun membro cliente invitato" onAdd={isAdmin ? () => setShowInviteForm(true) : undefined} />
          </div>
        )}

        {/* ── TAB: Esterni ── */}
        {tab === 'esterni' && (
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-2xs text-text-secondary">Max 5 professionisti/partner · accesso CC e Chat Interna</p>
              {isAdmin && partnerGuests.length < 5 && (
                <button onClick={() => setShowInviteForm(v => !v)}
                  className={`p-1.5 rounded-lg transition-colors ${showInviteForm ? 'text-gold-text bg-gold/10' : 'text-text-secondary hover:text-gold-text'}`}>
                  <UserPlus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {showInviteForm && <InviteForm type="partner" onSubmit={sendInvite} email={inviteEmail} setEmail={setInviteEmail} name={inviteName} setName={setInviteName} role={inviteRole} setRole={setInviteRole} sending={sending} onCancel={() => setShowInviteForm(false)} />}
            <GuestList guests={partnerGuests} loading={loadingGuests} statusDot={statusDot} statusLabel={statusLabel} onRevoke={isAdmin ? revoke : undefined} emptyLabel="Nessun professionista/partner invitato" onAdd={isAdmin ? () => setShowInviteForm(true) : undefined} />
          </div>
        )}
      </div>
    </div>
  )
}

// Sub-componenti per AccessPanel
function InviteForm({ type, onSubmit, email, setEmail, name, setName, role, setRole, sending, onCancel }: {
  type: 'cliente' | 'partner'; onSubmit: (e: React.FormEvent) => void
  email: string; setEmail: (v: string) => void
  name: string; setName: (v: string) => void
  role: string; setRole: (v: string) => void
  sending: boolean; onCancel: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="bg-surface border border-border rounded-xl p-3 space-y-2 mb-3">
      <p className="text-2xs text-text-secondary font-bold uppercase tracking-wider">
        {type === 'cliente' ? '🏢 Invita membro cliente' : '🤝 Invita professionista/partner'}
      </p>
      <input required value={name} onChange={e => setName(e.target.value)} placeholder="Nome e Cognome *" autoFocus
        className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/40" />
      <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email *"
        className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/40" />
      <input required value={role} onChange={e => setRole(e.target.value)} placeholder={type === 'cliente' ? 'Ruolo in azienda *' : 'Azienda / Specializzazione *'}
        className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/40" />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-1.5 border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary">Annulla</button>
        <button type="submit" disabled={sending} className="flex-1 py-1.5 bg-gold text-on-gold font-bold rounded-lg text-xs hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-1">
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Invia invito
        </button>
      </div>
    </form>
  )
}

function GuestList({ guests, loading, statusDot, statusLabel, onRevoke, emptyLabel, onAdd }: {
  guests: ChannelGuest[]; loading: boolean
  statusDot: Record<string, string>; statusLabel: Record<string, string>
  onRevoke?: (id: string, email: string) => void
  emptyLabel: string; onAdd?: () => void
}) {
  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 text-gold-text animate-spin" /></div>
  if (!guests.length) return (
    <div className="text-center py-8">
      <UserPlus className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
      <p className="text-xs text-text-secondary mb-2">{emptyLabel}</p>
      {onAdd && <button onClick={onAdd} className="text-xs text-gold-text hover:underline">+ Invia primo invito</button>}
    </div>
  )
  return (
    <div className="space-y-1">
      {guests.map(g => (
        <div key={g.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-surface group transition-colors">
          <div className="w-7 h-7 rounded-full bg-surface-hover border border-border-strong flex items-center justify-center text-2xs font-bold text-text-primary shrink-0">
            {getInitials(g.full_name ?? g.email)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-text-primary truncate">{g.full_name ?? g.email}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[g.status] ?? 'bg-border-strong'}`} />
              <span className="text-2xs text-text-secondary">{statusLabel[g.status] ?? g.status}</span>
              {g.role && <span className="text-2xs text-text-secondary truncate">· {g.role}</span>}
            </div>
          </div>
          {onRevoke && (
            <button onClick={() => onRevoke(g.id, g.email)}
              className="opacity-0 group-hover:opacity-100 p-1 text-text-secondary hover:text-error transition-all shrink-0" title="Revoca accesso">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// Vecchio GuestPanel (mantenuto per compatibilità, ora usa AccessPanel)
function GuestPanel({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const [guests, setGuests] = useState<ChannelGuest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [guestType, setGuestType] = useState<'cliente' | 'partner'>('cliente')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const sb = createClient()
    sb.from('channel_guests').select('*').eq('channel_id', channelId).neq('status', 'revoked').order('invited_at')
      .then(({ data }) => { setGuests((data ?? []) as ChannelGuest[]); setLoading(false) })
  }, [channelId])

  const clientCount = guests.filter(g => g.guest_type === 'cliente').length
  const partnerCount = guests.filter(g => g.guest_type === 'partner').length

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !name.trim() || !role.trim()) return
    setSending(true)
    const res = await inviteChannelGuest(channelId, email.trim(), guestType, name.trim(), role.trim())
    setSending(false)
    if (!res.success) { toast.error(res.error); return }
    toast.success(`Invito inviato a ${email}`)
    setEmail(''); setName(''); setRole(''); setShowForm(false)
    // Ricarica guests
    const sb = createClient()
    const { data } = await sb.from('channel_guests').select('*').eq('channel_id', channelId).neq('status', 'revoked').order('invited_at')
    setGuests((data ?? []) as ChannelGuest[])
  }

  const revoke = async (guestId: string, guestEmail: string) => {
    if (!confirm(`Revocare accesso a ${guestEmail}?`)) return
    const res = await revokeChannelGuest(guestId)
    if (!res.success) { toast.error(res.error); return }
    setGuests(prev => prev.filter(g => g.id !== guestId))
    toast.success('Accesso revocato')
  }

  const statusDot: Record<string, string> = { pending: 'bg-warning', active: 'bg-success', revoked: 'bg-error' }
  const statusLabel: Record<string, string> = { pending: 'Invitato', active: 'Attivo', revoked: 'Revocato' }

  return (
    <div className="w-72 border-l border-border bg-surface flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Ospiti esterni</h3>
          <p className="text-2xs text-text-secondary">{clientCount}/5 clienti · {partnerCount}/5 partner</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowForm(v => !v)}
            className={`p-1.5 rounded-lg transition-colors ${showForm ? 'text-gold-text bg-gold/10' : 'text-text-secondary hover:text-gold-text'}`}
            title="Invita ospite">
            <UserPlus className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary transition-colors"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={sendInvite} className="border-b border-border p-3 space-y-2.5">
          <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold">Nuovo invito</p>

          {/* Tipo */}
          <div className="grid grid-cols-2 gap-1.5">
            {(['cliente', 'partner'] as const).map(t => (
              <button key={t} type="button" onClick={() => setGuestType(t)}
                className={`py-1.5 rounded-lg text-xs font-bold border transition-colors capitalize ${guestType === t ? 'border-gold/50 bg-gold/10 text-gold-text' : 'border-border text-text-secondary hover:border-border-strong'}`}>
                {t === 'cliente' ? '🏢 Cliente' : '🤝 Partner'}
                <span className="block text-2xs font-normal opacity-60">
                  {t === 'cliente' ? `${clientCount}/5` : `${partnerCount}/5`} usati
                </span>
              </button>
            ))}
          </div>

          <input required value={name} onChange={e => setName(e.target.value)} placeholder="Nome e Cognome *"
            className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/40" />
          <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email *"
            className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/40" />
          <input required value={role} onChange={e => setRole(e.target.value)} placeholder="Ruolo / Azienda *"
            className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/40" />

          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 py-1.5 border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary">Annulla</button>
            <button type="submit" disabled={sending}
              className="flex-1 py-1.5 bg-gold text-on-gold font-bold rounded-lg text-xs hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-1">
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Invita
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex justify-center pt-6"><Loader2 className="w-4 h-4 text-gold-text animate-spin" /></div>
        ) : guests.length === 0 ? (
          <div className="text-center px-4 pt-8">
            <Users className="w-8 h-8 text-text-secondary mx-auto mb-2 opacity-50" />
            <p className="text-xs text-text-secondary">Nessun ospite invitato</p>
            <button onClick={() => setShowForm(true)} className="text-xs text-gold-text hover:underline mt-1">Invita il primo ospite</button>
          </div>
        ) : (
          <>
            {(['cliente', 'partner'] as const).map(type => {
              const group = guests.filter(g => g.guest_type === type)
              if (!group.length) return null
              return (
                <div key={type} className="mb-3">
                  <p className="text-2xs text-text-secondary px-2 mb-1 uppercase tracking-wider">
                    {type === 'cliente' ? '🏢 Clienti' : '🤝 Partner'} ({group.length}/5)
                  </p>
                  {group.map(g => (
                    <div key={g.id} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface group transition-colors">
                      <div className="w-7 h-7 rounded-full bg-surface-hover border border-border-strong flex items-center justify-center text-2xs font-bold text-text-primary shrink-0">
                        {getInitials(g.full_name ?? g.email)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-text-primary truncate">{g.full_name ?? g.email}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[g.status]}`} />
                          <span className="text-2xs text-text-secondary">{statusLabel[g.status]}</span>
                          {g.role && <span className="text-2xs text-text-secondary truncate">· {g.role}</span>}
                        </div>
                      </div>
                      <button onClick={() => revoke(g.id, g.email)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-text-secondary hover:text-error transition-all shrink-0"
                        title="Revoca accesso">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Channel Header Menu (···) ────────────────────────────────────────────────

function ChannelHeaderMenu({ isAdmin, channelType, isArchived, isReadOnly, onAccess, onSettings, onLeave, onClose }: {
  isAdmin: boolean; channelType: string; isArchived: boolean; isReadOnly: boolean
  onAccess: () => void; onSettings: () => void; onLeave: () => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return (
    <div ref={ref} className="absolute top-14 right-4 w-60 bg-surface border border-border rounded-2xl shadow-2xl z-50 py-1.5 overflow-hidden">
      <MenuItem icon={<Users className="w-4 h-4" />} label="Gestisci accessi" onClick={() => { onAccess(); onClose() }} />
      {isAdmin && (
        <MenuItem icon={<Settings className="w-4 h-4" />} label="Modifica impostazioni" onClick={() => { onSettings(); onClose() }} />
      )}
      <div className="h-px bg-surface-hover my-1" />
      <MenuItem icon={<LogOut className="w-4 h-4" />} label="Abbandona il canale" onClick={() => { onLeave(); onClose() }} className="text-error hover:bg-error/10" />
    </div>
  )
}

function MenuItem({ icon, label, onClick, className = '' }: { icon: React.ReactNode; label: string; onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-surface-hover transition-colors text-left ${className || 'text-text-primary'}`}>
      <span className="text-text-secondary shrink-0">{icon}</span>{label}
    </button>
  )
}

// ─── Channel Details Panel ─────────────────────────────────────────────────────

function ChannelDetailsPanel({ channelId, channelName, channelType, members, pinnedCount, isAdmin, onClose, onAddMember, onRemoveMember, allProfiles }: {
  channelId: string; channelName: string; channelType: string
  members: Profile[]; pinnedCount: number; isAdmin: boolean
  onClose: () => void; onAddMember: (id: string) => void; onRemoveMember: (id: string) => void
  allProfiles: Profile[]
}) {
  const [topic, setTopic] = useState('')
  const [editingTopic, setEditingTopic] = useState(false)
  const [topicDraft, setTopicDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAddPeople, setShowAddPeople] = useState(false)  // §27.1: collassata di base
  const nonMembers = allProfiles.filter(p => !members.find(m => m.id === p.id))

  useEffect(() => {
    createClient().from('chat_channels').select('topic').eq('id', channelId).single()
      .then(({ data }) => { if (data?.topic) { setTopic(data.topic); setTopicDraft(data.topic) } })
  }, [channelId])

  const saveTopic = async () => {
    setSaving(true)
    await createClient().from('chat_channels').update({ topic: topicDraft.trim() }).eq('id', channelId)
    setTopic(topicDraft.trim()); setEditingTopic(false); setSaving(false)
    toast.success('Topic aggiornato')
  }

  const icon = channelType === 'customer_care' || channelType === 'cliente' ? '🎧'
    : (channelType === 'cliente_interno' || channelType === 'interno') ? '🔒' : '#'

  return (
    <div className="w-72 border-l border-border bg-surface flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
        <h3 className="font-bold text-text-primary text-sm">Dettagli del canale</h3>
        <button onClick={onClose}><X className="w-4 h-4 text-text-secondary hover:text-text-primary" /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Channel name + type */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-xl">{icon}</span>
            <span className="font-bold text-text-primary text-base">{channelName}</span>
          </div>
          <span className="text-2xs text-text-secondary uppercase tracking-wider font-semibold">
            {channelType === 'customer_care' ? 'Customer Care'
              : channelType === 'cliente_interno' ? 'Interno team'
              : channelType === 'interno' ? 'Team'
              : channelType}
          </span>
        </div>

        {/* Topic */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold">Descrizione / Topic</p>
            {isAdmin && !editingTopic && (
              <button onClick={() => { setEditingTopic(true); setTopicDraft(topic) }}
                className="text-2xs text-gold-text hover:underline">Modifica</button>
            )}
          </div>
          {editingTopic ? (
            <div className="space-y-2">
              <textarea value={topicDraft} onChange={e => setTopicDraft(e.target.value)} rows={3}
                placeholder="Aggiungi una descrizione…"
                className="w-full bg-surface border border-border rounded-xl p-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/40 resize-none" />
              <div className="flex gap-2">
                <button onClick={() => setEditingTopic(false)}
                  className="flex-1 py-1.5 text-xs border border-border rounded-lg text-text-secondary hover:text-text-primary">Annulla</button>
                <button onClick={saveTopic} disabled={saving}
                  className="flex-1 py-1.5 text-xs bg-gold text-on-gold font-bold rounded-lg hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-1">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salva
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">{topic || <span className="italic opacity-50">Nessuna descrizione</span>}</p>
          )}
        </div>

        {/* Pinned */}
        {pinnedCount > 0 && (
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Pin className="w-3.5 h-3.5 text-gold-text shrink-0" />
            <span className="text-sm text-text-secondary">{pinnedCount} messaggio{pinnedCount !== 1 ? 'i' : ''} pinnato{pinnedCount !== 1 ? 'i' : ''}</span>
          </div>
        )}

        {/* Members */}
        <div className="px-4 py-3">
          <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold mb-2">{members.length} Membri</p>
          <div className="space-y-1 mb-3">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-2.5 py-1 group/m">
                <div className="w-7 h-7 rounded-full bg-gold/20 flex items-center justify-center text-gold-text text-2xs font-bold overflow-hidden shrink-0">
                  {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" alt="" /> : getInitials(m.full_name)}
                </div>
                <span className="text-sm text-text-primary flex-1 truncate">{m.full_name}</span>
                {isAdmin && (
                  <button onClick={() => onRemoveMember(m.id)}
                    className="opacity-0 group-hover/m:opacity-100 text-text-secondary hover:text-error transition-all">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {/* §27.1: collassata di base — non deve dominare il pannello. */}
          {isAdmin && nonMembers.length > 0 && (
            <div>
              <button onClick={() => setShowAddPeople(v => !v)}
                className="w-full flex items-center gap-1.5 mb-1.5 text-2xs text-text-secondary uppercase tracking-wider font-bold hover:text-text-primary transition-colors">
                {showAddPeople ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Aggiungi persone
                <span className="ml-auto normal-case tracking-normal font-normal text-text-tertiary">{nonMembers.length}</span>
              </button>
              {showAddPeople && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {nonMembers.map(p => (
                    <button key={p.id} onClick={() => onAddMember(p.id)}
                      className="w-full flex items-center gap-2.5 py-1.5 px-2 rounded-xl hover:bg-surface transition-colors text-left group/a">
                      <div className="w-6 h-6 rounded-full bg-surface-hover flex items-center justify-center text-text-secondary text-2xs font-bold overflow-hidden shrink-0">
                        {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : getInitials(p.full_name)}
                      </div>
                      <span className="text-sm text-text-secondary group-hover/a:text-text-primary flex-1 truncate">{p.full_name}</span>
                      <Plus className="w-3.5 h-3.5 text-text-secondary opacity-0 group-hover/a:opacity-100 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Admin Channel Panel ──────────────────────────────────────────────────────

function AdminPanel({ channelId, channelName, isArchived, isReadOnly, pinnedCount, onArchive, onReadOnly, onClearMessages, onClose }: {
  channelId: string; channelName: string; isArchived: boolean; isReadOnly: boolean
  pinnedCount: number
  onArchive: (v: boolean) => void
  onReadOnly: (v: boolean) => void
  onClearMessages: () => void
  onClose: () => void
}) {
  const [clearing, setClearing] = useState(false)

  const toggleArchive = async () => {
    const sb = createClient()
    const newVal = !isArchived
    await sb.from('chat_channels').update({ is_archived: newVal, is_read_only: newVal }).eq('id', channelId)
    onArchive(newVal)
    toast.success(newVal ? 'Canale archiviato' : 'Canale riattivato')
  }

  const toggleReadOnly = async () => {
    const sb = createClient()
    const newVal = !isReadOnly
    await sb.from('chat_channels').update({ is_read_only: newVal }).eq('id', channelId)
    onReadOnly(newVal)
    toast.success(newVal ? 'Canale in sola lettura' : 'Scrittura riabilitata')
  }

  const clearMessages = async () => {
    if (!confirm(`Eliminare TUTTI i messaggi di #${channelName}? Questa azione è irreversibile.`)) return
    setClearing(true)
    const sb = createClient()
    await sb.from('chat_messages').update({ is_deleted: true }).eq('channel_id', channelId)
    setClearing(false)
    onClearMessages()
    toast.success('Tutti i messaggi eliminati')
  }

  return (
    <div className="absolute top-14 right-0 w-72 bg-surface border border-border rounded-2xl shadow-2xl z-30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-gold-text" />
          <span className="text-sm font-bold text-text-primary">Admin · #{channelName}</span>
        </div>
        <button onClick={onClose}><X className="w-4 h-4 text-text-secondary hover:text-text-primary" /></button>
      </div>

      <div className="p-3 space-y-1">
        {/* Read only toggle */}
        <button onClick={toggleReadOnly}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isReadOnly ? 'bg-warning/10 text-warning' : 'hover:bg-surface-hover text-text-secondary hover:text-text-primary'}`}>
          {isReadOnly ? <VolumeX className="w-4 h-4 shrink-0" /> : <Volume2 className="w-4 h-4 shrink-0" />}
          <div>
            <p className="text-sm font-semibold">{isReadOnly ? 'Sola lettura attiva' : 'Imposta sola lettura'}</p>
            <p className="text-2xs text-text-secondary">{isReadOnly ? 'Clicca per riabilitare scrittura' : 'Blocca messaggi nuovi'}</p>
          </div>
          {isReadOnly && <div className="ml-auto w-2 h-2 rounded-full bg-warning shrink-0" />}
        </button>

        {/* Archive toggle */}
        <button onClick={toggleArchive}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isArchived ? 'bg-info/10 text-info' : 'hover:bg-surface-hover text-text-secondary hover:text-text-primary'}`}>
          <Archive className="w-4 h-4 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{isArchived ? 'Canale archiviato' : 'Archivia canale'}</p>
            <p className="text-2xs text-text-secondary">{isArchived ? 'Clicca per riattivare' : 'Sposta nell\'archivio'}</p>
          </div>
          {isArchived && <div className="ml-auto w-2 h-2 rounded-full bg-info shrink-0" />}
        </button>

        {/* Info row */}
        {pinnedCount > 0 && (
          <div className="flex items-center gap-3 px-3 py-2.5 text-text-secondary">
            <Pin className="w-4 h-4 shrink-0" />
            <p className="text-sm">{pinnedCount} messaggio{pinnedCount !== 1 ? 'i' : ''} pinnato{pinnedCount !== 1 ? 'i' : ''}</p>
          </div>
        )}

        <div className="h-px bg-surface-hover my-1" />

        {/* Danger: clear all */}
        <button onClick={clearMessages} disabled={clearing}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-error/10 text-error/70 hover:text-error">
          {clearing ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <Trash2 className="w-4 h-4 shrink-0" />}
          <div>
            <p className="text-sm font-semibold">Svuota canale</p>
            <p className="text-2xs text-error/50">Elimina tutti i messaggi · irreversibile</p>
          </div>
        </button>
      </div>
    </div>
  )
}

// ─── Pinned Messages Bar ──────────────────────────────────────────────────────

function PinnedBar({ messages, onUnpin }: { messages: MessageExtended[]; onUnpin: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  if (!messages.length) return null
  const latest = messages[messages.length - 1]
  return (
    <div className="border-b border-border bg-surface px-4 py-2">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(v => !v)}>
        <Pin className="w-3.5 h-3.5 text-gold-text shrink-0" />
        <span className="text-xs text-text-secondary flex-1 truncate">
          <span className="text-gold-text font-semibold">Pinnato</span> · {latest.sender?.full_name}: <span className="text-text-primary">{latest.content.slice(0, 60)}{latest.content.length > 60 ? '…' : ''}</span>
        </span>
        <span className="text-2xs text-text-secondary">{messages.length}</span>
        <ChevronDown className={`w-3 h-3 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>
      {expanded && (
        <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
          {messages.map(m => (
            <div key={m.id} className="flex items-start gap-2 py-1">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-text-primary">{m.sender?.full_name} </span>
                <span className="text-xs text-text-secondary">{m.content.slice(0, 80)}{m.content.length > 80 ? '…' : ''}</span>
              </div>
              <button onClick={() => onUnpin(m.id)} className="text-text-secondary hover:text-error shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Archived Banner ──────────────────────────────────────────────────────────

function ArchivedBanner({ isAdmin, isPerso, onUnarchive }: { isAdmin: boolean; isPerso: boolean; onUnarchive?: () => void }) {
  return (
    <div className={`flex items-center gap-3 px-5 py-3 text-sm ${isPerso ? 'bg-error/10 border-b border-error/20' : 'bg-info/10 border-b border-info/20'}`}>
      <Archive className={`w-4 h-4 shrink-0 ${isPerso ? 'text-error' : 'text-info'}`} />
      <div className="flex-1">
        <span className={`font-semibold ${isPerso ? 'text-error' : 'text-info'}`}>
          {isPerso ? 'Cliente perso — canale archiviato' : 'Canale archiviato'}
        </span>
        <span className="text-text-secondary ml-2 text-xs">
          {isPerso
            ? 'Questo cliente è stato marcato come perso. Storico conservato in sola lettura.'
            : 'Questo canale è archiviato e in sola lettura.'}
        </span>
      </div>
      {isAdmin && onUnarchive && (
        <button onClick={onUnarchive}
          className="text-xs text-gold-text border border-gold/30 px-2.5 py-1 rounded-lg hover:bg-gold/10 transition-colors shrink-0">
          Riattiva
        </button>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SlackChat({
  channelId, channelName, channelType, channelLabel,
  currentProfile, allProfiles, isAdmin = false,
  isArchived: isArchivedProp = false,
  isReadOnly: isReadOnlyProp = false,
  clientId, headerExtra, onArchiveToggle,
}: SlackChatProps) {
  const [messages, setMessages] = useState<MessageExtended[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showMembers, setShowMembers] = useState(false)

  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [showChannelMenu, setShowChannelMenu] = useState(false)
  const [showDetailsPanel, setShowDetailsPanel] = useState(false)
  const [showTicketPanel, setShowTicketPanel] = useState(false)
  const [openTicketId, setOpenTicketId] = useState<string | undefined>(undefined)

  const isGuest = currentProfile.app_role === 'guest'
  const isClientChannel = channelType === 'customer_care' || channelType === 'cliente_interno' || channelType === 'cliente'

  // §27.2 — L'assistente AI è uno strumento del TEAM: il cliente (role client/guest)
  // non lo vede nemmeno. La barriera vera è nell'API (403 per i non-staff): questo
  // flag serve solo a non mostrare una CTA che fallirebbe.
  const isStaff = currentProfile.role === 'admin' || currentProfile.role === 'team'

  // Partecipanti (lettura per tutti): interni = membri profilo, esterni = channel_guests
  // non revocati (cliente/partner). Il conteggio in header li somma entrambi.
  const [showParticipants, setShowParticipants] = useState(false)
  const [channelGuests, setChannelGuests] = useState<ChannelGuest[]>([])
  const guestCount = channelGuests.length

  useEffect(() => {
    createClient().from('channel_guests')
      .select('*').eq('channel_id', channelId).neq('status', 'revoked').order('invited_at')
      .then(({ data }) => setChannelGuests((data ?? []) as ChannelGuest[]))
  }, [channelId])

  const [aiOpen, setAiOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<{ type: string; title: string; detail: string }[]>([])

  const askAi = async () => {
    setAiOpen(true); setAiLoading(true); setAiSuggestions([])
    try {
      const res = await fetch('/api/ai/customer-care-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Errore AI'); setAiOpen(false); return }
      setAiSuggestions(data.suggestions ?? [])
    } catch {
      toast.error('Errore nella generazione dei suggerimenti')
      setAiOpen(false)
    } finally { setAiLoading(false) }
  }

  const handleOpenTicket = (ticketId: string) => {
    setOpenTicketId(ticketId)
    setShowTicketPanel(true)
    setShowDetailsPanel(false)
  }
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview?: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [isArchived, setIsArchived] = useState(isArchivedProp)
  const [isReadOnly, setIsReadOnly] = useState(isReadOnlyProp || isArchivedProp)
  const [channelIsArchived, setChannelIsArchived] = useState(false) // from DB
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }, [])

  const parseEnrich = (msgs: ChatMessageWithSender[]): MessageExtended[] =>
    msgs.map(m => ({ ...m, parsedAttachments: parseAttachments(m.attachments), is_pinned: (m as MessageExtended).is_pinned ?? false }))

  useEffect(() => {
    if (!channelId) return
    const sb = createClient()
    setLoading(true)

    const init = async () => {
      // Fetch channel state
      const { data: ch } = await sb.from('chat_channels').select('is_archived,is_read_only').eq('id', channelId).single()
      if (ch) {
        setChannelIsArchived(ch.is_archived)
        setIsArchived(isArchivedProp || ch.is_archived)
        setIsReadOnly(isReadOnlyProp || isArchivedProp || ch.is_archived || ch.is_read_only)
      }

      // Mark read
      await sb.from('channel_members').upsert(
        { channel_id: channelId, profile_id: currentProfile.id, last_read_at: new Date().toISOString() },
        { onConflict: 'channel_id,profile_id' }
      )

      // Load messages
      const { data: msgs } = await sb
        .from('chat_messages')
        .select('*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url)')
        .eq('channel_id', channelId).eq('is_deleted', false)
        .order('created_at', { ascending: true }).limit(200)
      setMessages(parseEnrich((msgs ?? []) as ChatMessageWithSender[]))

      // Load members
      const { data: mems } = await sb.from('channel_members').select('profile_id').eq('channel_id', channelId)
      const ids = (mems ?? []).map((m: { profile_id: string }) => m.profile_id)
      setMembers(allProfiles.filter(p => ids.includes(p.id)))

      setLoading(false)
      scrollToBottom()
    }
    init()

    // Realtime
    const sub = sb.channel(`slack-${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channelId}` },
        async payload => {
          const { data: msg } = await sb
            .from('chat_messages')
            .select('*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url)')
            .eq('id', payload.new.id).single()
          if (msg) {
            setMessages(prev => {
              if (prev.find(m => m.id === msg.id)) return prev   // già presente (ottimistico sostituito)
              return [...prev, ...parseEnrich([msg as ChatMessageWithSender])]
            })
            scrollToBottom()
          }
        })
      .subscribe()

    return () => { sb.removeChannel(sub) }
  }, [channelId, currentProfile.id, isArchivedProp])

  // When prop changes (e.g. client becomes perso)
  useEffect(() => {
    setIsArchived(isArchivedProp || channelIsArchived)
    setIsReadOnly(isReadOnlyProp || isArchivedProp || channelIsArchived)
  }, [isArchivedProp, isReadOnlyProp, channelIsArchived])

  const handleArchive = async (val: boolean) => {
    setChannelIsArchived(val)
    setIsArchived(isArchivedProp || val)
    setIsReadOnly(isReadOnlyProp || isArchivedProp || val)
    onArchiveToggle?.(val)
    // If archiving a client channel, also mark all client-related channels
    if (val && clientId) {
      const sb = createClient()
      await sb.from('chat_channels').update({ is_archived: true, is_read_only: true }).eq('client_id', clientId)
    }
  }

  const handleReadOnly = (val: boolean) => {
    setIsReadOnly(isArchivedProp || isArchived || val)
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach(file => {
      if (file.type.startsWith('image/')) {
        const r = new FileReader()
        r.onload = ev => setPendingFiles(prev => [...prev, { file, preview: ev.target?.result as string }])
        r.readAsDataURL(file)
      } else {
        setPendingFiles(prev => [...prev, { file }])
      }
    })
    e.target.value = ''
  }

  const uploadFiles = async (): Promise<Attachment[]> => {
    if (!pendingFiles.length) return []
    const sb = createClient()
    const results: Attachment[] = []
    for (const { file } of pendingFiles) {
      const ext = file.name.split('.').pop()
      const path = `${channelId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await sb.storage.from('chat-attachments').upload(path, file, { contentType: file.type })
      if (error) { toast.error(`Upload fallito: ${file.name}`); continue }
      const { data } = sb.storage.from('chat-attachments').getPublicUrl(path)
      results.push({ url: data.publicUrl, name: file.name, type: getFileType(file.type), size: file.size })
    }
    return results
  }

  const sendMessage = async () => {
    if ((!text.trim() && !pendingFiles.length) || sending || isReadOnly) return
    setSending(true); setUploading(pendingFiles.length > 0)
    const attachments = await uploadFiles()
    setUploading(false)
    const trimmed = text.trim()
    setText(''); setPendingFiles([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // ── Optimistic update: messaggio appare istantaneamente ─────────────────
    const optimisticId = `opt-${Date.now()}`
    const optimistic: MessageExtended = {
      id: optimisticId,
      channel_id: channelId,
      sender_id: currentProfile.id,
      content: trimmed,
      created_at: new Date().toISOString(),
      edited_at: null,
      is_deleted: false,
      is_pinned: false,
      attachments: attachments.length ? attachments.map(a => JSON.stringify(a)) : null,
      parsedAttachments: attachments,
      sender: { id: currentProfile.id, full_name: currentProfile.full_name, avatar_url: currentProfile.avatar_url ?? null },
    }
    setMessages(prev => [...prev, optimistic])
    scrollToBottom()

    // ── Insert reale + sostituisci ottimistico ───────────────────────────────
    const { data: realMsg, error } = await createClient()
      .from('chat_messages')
      .insert({
        channel_id: channelId, sender_id: currentProfile.id,
        content: trimmed,
        attachments: attachments.length ? attachments.map(a => JSON.stringify(a)) : null,
      })
      .select('*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url)')
      .single()

    if (error) {
      toast.error('Errore invio messaggio')
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      setText(trimmed)
    } else {
      setMessages(prev => prev.map(m => m.id === optimisticId ? { ...parseEnrich([realMsg as ChatMessageWithSender])[0] } : m))
    }
    setSending(false)
  }

  const addMember = async (id: string) => {
    const sb = createClient()
    await sb.from('channel_members').insert({ channel_id: channelId, profile_id: id })
    setMembers(prev => [...prev, allProfiles.find(p => p.id === id)!].filter(Boolean))
    toast.success('Membro aggiunto')
  }
  const removeMember = async (id: string) => {
    if (id === currentProfile.id) return
    const sb = createClient()
    await sb.from('channel_members').delete().eq('channel_id', channelId).eq('profile_id', id)
    setMembers(prev => prev.filter(m => m.id !== id))
    toast.success('Membro rimosso')
  }

  const leaveChannel = async () => {
    if (!confirm(`Abbandonare #${channelName}?`)) return
    await createClient().from('channel_members').delete().eq('channel_id', channelId).eq('profile_id', currentProfile.id)
    toast.success('Hai abbandonato il canale')
    setMembers(prev => prev.filter(m => m.id !== currentProfile.id))
  }

  const handleMsgEdit = (id: string, content: string) => setMessages(prev => prev.map(m => m.id === id ? { ...m, content } : m))
  const handleMsgDelete = (id: string) => setMessages(prev => prev.filter(m => m.id !== id))
  const handleMsgPin = (id: string, pinned: boolean) => setMessages(prev => prev.map(m => m.id === id ? { ...m, is_pinned: pinned } : m))

  const insertFormat = (prefix: string, suffix = prefix) => {
    const ta = textareaRef.current; if (!ta) return
    const s = ta.selectionStart; const e = ta.selectionEnd
    const sel = text.slice(s, e)
    setText(text.slice(0, s) + prefix + sel + suffix + text.slice(e))
    setTimeout(() => { ta.selectionStart = s + prefix.length; ta.selectionEnd = e + prefix.length; ta.focus() }, 0)
  }

  // Group by date
  const grouped: { date: string; messages: MessageExtended[] }[] = []
  messages.forEach(msg => {
    const date = new Date(msg.created_at).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    const last = grouped[grouped.length - 1]
    if (last?.date === date) last.messages.push(msg)
    else grouped.push({ date, messages: [msg] })
  })

  const pinnedMessages = messages.filter(m => m.is_pinned)
  const nonMembers = allProfiles.filter(p => !members.find(m => m.id === p.id))
  const isPerso = isArchivedProp // passed when client_label === 'perso'
  const canWrite = !isReadOnly || (isAdmin && !isPerso)

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-gold-text animate-spin" /></div>

  return (
    <div className="flex h-full bg-surface rounded-xl border border-border overflow-hidden relative">
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface shrink-0 relative z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-text-secondary font-bold text-sm shrink-0">{(channelType === 'interno' || channelType === 'cliente_interno') ? '🔒' : channelType === 'customer_care' ? '🎧' : '#'}</span>
            <span className="font-bold text-text-primary text-sm truncate">{channelName}</span>
            {channelLabel && <span className="text-xs text-text-secondary bg-surface border border-border px-2 py-0.5 rounded-full shrink-0">{channelLabel}</span>}
            {isArchived && <span className="text-xs text-info bg-info/10 border border-info/20 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"><Archive className="w-3 h-3" />Archiviato</span>}
            {isReadOnly && !isArchived && <span className="text-xs text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"><Lock className="w-3 h-3" />Sola lettura</span>}
            {headerExtra}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Pulsante Supporto (visibile solo ai guest in canali cliente) */}
            {isGuest && isClientChannel && (
              <button
                onClick={() => { setShowTicketPanel(v => !v); setShowDetailsPanel(false) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                  showTicketPanel
                    ? 'bg-gold/15 border-gold/40 text-gold-text'
                    : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-border-strong'
                }`}
              >
                <Headphones className="w-3.5 h-3.5" />
                Supporto
              </button>
            )}
            {/* Pulsante ticket rapido (per team in canali CC) */}
            {!isGuest && isClientChannel && clientId && (
              <button
                onClick={() => { setShowTicketPanel(v => !v); setShowDetailsPanel(false) }}
                title="Ticket cliente"
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
                  showTicketPanel
                    ? 'border-gold/40 bg-gold/10 text-gold-text'
                    : 'border-border text-text-secondary hover:text-text-primary hover:border-border-strong'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
              </button>
            )}
            {/* Partecipanti: icona + totale (interni + esterni attivi/invitati) → pannello in sola lettura */}
            <button onClick={() => { setShowParticipants(v => !v); setShowDetailsPanel(false); setShowMembers(false); setShowAdminPanel(false); setShowTicketPanel(false) }}
              title="Partecipanti alla chat"
              aria-label={`Partecipanti: ${members.length + guestCount}`}
              className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg border transition-colors ${
                showParticipants
                  ? 'border-gold/40 bg-gold/10 text-gold-text'
                  : 'border-border text-text-secondary hover:text-text-primary hover:border-border-strong'
              }`}>
              <Users className="w-4 h-4" />
              <span className="text-xs font-bold">{members.length + guestCount}</span>
            </button>

            {/* ··· menu */}
            <button onClick={() => { setShowChannelMenu(v => !v); setShowDetailsPanel(false); setShowAdminPanel(false) }}
              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${showChannelMenu ? 'border-gold/40 bg-gold/10 text-gold-text' : 'border-border text-text-secondary hover:text-text-primary hover:border-border-strong'}`}>
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* ··· dropdown */}
          {showChannelMenu && (
            <ChannelHeaderMenu
              isAdmin={isAdmin} channelType={channelType}
              isArchived={isArchived || channelIsArchived} isReadOnly={isReadOnly}
              onAccess={() => { setShowDetailsPanel(true); setShowAdminPanel(false) }}
              onSettings={() => { setShowAdminPanel(true); setShowDetailsPanel(false) }}
              onLeave={leaveChannel}
              onClose={() => setShowChannelMenu(false)}
            />
          )}

          {/* Admin settings panel */}
          {showAdminPanel && isAdmin && (
            <AdminPanel
              channelId={channelId} channelName={channelName}
              isArchived={isArchived || channelIsArchived} isReadOnly={isReadOnly}
              pinnedCount={pinnedMessages.length}
              onArchive={handleArchive} onReadOnly={handleReadOnly}
              onClearMessages={() => setMessages([])}
              onClose={() => setShowAdminPanel(false)}
            />
          )}
        </div>

        {/* Archived / perso banner */}
        {(isArchived || isPerso) && (
          <ArchivedBanner
            isAdmin={isAdmin} isPerso={isPerso}
            onUnarchive={isAdmin && !isPerso ? () => handleArchive(false) : undefined}
          />
        )}

        {/* Pinned messages bar */}
        <PinnedBar messages={pinnedMessages} onUnpin={id => handleMsgPin(id, false)} />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4">
          {grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center text-2xl">
                {(channelType === 'interno' || channelType === 'cliente_interno') ? '🔒' : channelType === 'customer_care' ? '🎧' : '#'}
              </div>
              <div>
                <p className="text-text-primary font-bold text-base mb-1"># {channelName}</p>
                <p className="text-text-secondary text-sm">Nessun messaggio ancora.</p>
              </div>
            </div>
          ) : grouped.map(group => (
            <div key={group.date}>
              <div className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-text-secondary capitalize px-2 font-medium">{group.date}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {group.messages.map((msg, i) => {
                const prev = group.messages[i - 1]
                const compact = !!prev && prev.sender_id === msg.sender_id
                  && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 300000
                return (
                  <MessageRow key={msg.id} msg={msg}
                    isOwn={msg.sender_id === currentProfile.id}
                    compact={compact} isAdmin={isAdmin}
                    currentUserId={currentProfile.id}
                    onEdit={handleMsgEdit} onDelete={handleMsgDelete} onPin={handleMsgPin}
                    onOpenTicket={!isGuest && clientId ? handleOpenTicket : undefined}
                  />
                )
              })}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {canWrite ? (
          <div className="px-4 pb-4 shrink-0">
            <div className="bg-surface border border-border rounded-xl focus-within:border-border-strong transition-colors">
              {/* Format toolbar */}
              <div className="flex items-center gap-0.5 px-3 pt-2.5 pb-1 border-b border-border">
                {[
                  { icon: <Bold className="w-3.5 h-3.5" />, fn: () => insertFormat('**'), title: 'Grassetto' },
                  { icon: <Italic className="w-3.5 h-3.5" />, fn: () => insertFormat('_'), title: 'Corsivo' },
                  { icon: <Code className="w-3.5 h-3.5" />, fn: () => insertFormat('`'), title: 'Codice' },
                ].map(({ icon, fn, title }) => (
                  <button key={title} onClick={fn} title={title}
                    className="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors">{icon}</button>
                ))}
                <div className="w-px h-4 bg-surface-hover mx-1" />
                <button onClick={() => fileInputRef.current?.click()} title="Allega file"
                  className="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-gold-text transition-colors">
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <button title="Emoji" className="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors">
                  <Smile className="w-3.5 h-3.5" />
                </button>
                {isAdmin && isArchived && (
                  <span className="ml-2 text-2xs text-gold-text flex items-center gap-1"><Shield className="w-3 h-3" />Scrittura admin abilitata</span>
                )}
                {/* §27.2 — assistente AI interno: suggerisce al team, invisibile al cliente.
                    Non invia messaggi e non crea task: propone, il team decide. */}
                {isStaff && (
                  <button onClick={askAi} disabled={aiLoading}
                    title="Suggerimenti AI — visibili solo al team"
                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-bold text-text-secondary hover:text-gold-text hover:bg-gold/10 transition-colors disabled:opacity-50">
                    {aiLoading ? <Spinner className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Suggerisci azioni
                  </button>
                )}
              </div>

              {isStaff && aiOpen && (
                <div className="mx-3 mb-2 rounded-xl border border-gold/25 bg-gold-dim p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-gold-text">
                      <Sparkles className="w-3 h-3" /> Suggerimenti AI — solo team
                    </span>
                    <button onClick={() => setAiOpen(false)} aria-label="Chiudi suggerimenti"
                      className="text-text-tertiary hover:text-text-primary"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  {aiLoading ? (
                    <p className="text-xs text-text-secondary flex items-center gap-1.5">
                      <Spinner className="w-3 h-3 animate-spin" /> Analisi della conversazione…
                    </p>
                  ) : aiSuggestions.length === 0 ? (
                    <p className="text-xs text-text-secondary">Nessun suggerimento: la conversazione non richiede azioni.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {aiSuggestions.map((s, i) => (
                        <div key={i} className="rounded-lg bg-surface border border-border p-2.5">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-hover text-text-secondary">
                              {s.type.replace('_', ' ')}
                            </span>
                            <p className="text-xs font-bold text-text-primary flex-1 min-w-0 truncate">{s.title}</p>
                          </div>
                          <p className="text-2xs text-text-secondary leading-relaxed">{s.detail}</p>
                          {s.type === 'risposta' && (
                            <button onClick={() => { setText(s.detail); setAiOpen(false) }}
                              className="mt-1.5 text-2xs font-bold text-gold-text hover:underline">
                              Usa come bozza →
                            </button>
                          )}
                        </div>
                      ))}
                      <p className="text-[10px] text-text-tertiary pt-0.5">
                        Suggerimenti, non azioni: niente viene inviato al cliente finché non lo fai tu.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {pendingFiles.length > 0 && (
                <div className="flex gap-2 flex-wrap px-3 pt-2">
                  {pendingFiles.map((f, i) => (
                    <PendingAtt key={i} att={f} onRemove={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} />
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 px-3 py-2">
                <textarea ref={textareaRef} value={text} onChange={handleTextChange}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  rows={1} placeholder={`Scrivi in #${channelName}...`}
                  className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none resize-none leading-relaxed min-h-[24px]"
                  style={{ maxHeight: '120px' }} />
                <button onClick={sendMessage}
                  disabled={(!text.trim() && !pendingFiles.length) || sending || uploading}
                  className={`p-1.5 rounded-lg transition-colors shrink-0 mb-0.5 ${(!text.trim() && !pendingFiles.length) || sending || uploading ? 'text-text-tertiary' : 'text-gold-text hover:bg-gold/10'}`}>
                  {sending || uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 pb-4 pt-2 shrink-0">
            <div className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3 text-text-secondary text-sm">
              <Lock className="w-4 h-4 shrink-0" />
              <span>{isPerso ? 'Cliente perso — canale in archivio, solo lettura.' : 'Questo canale è in sola lettura.'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Partecipanti — sola lettura, per tutti (interni + esterni) */}
      {showParticipants && (
        <ParticipantsPanel
          members={members}
          guests={channelGuests}
          currentProfileId={currentProfile.id}
          onClose={() => setShowParticipants(false)}
        />
      )}

      {/* Access Panel unificato (Gestisci Accessi) */}
      {showDetailsPanel && (
        <AccessPanel
          channelId={channelId}
          channelType={channelType}
          members={members}
          allProfiles={allProfiles}
          isAdmin={!!isAdmin}
          currentProfileId={currentProfile.id}
          onAddMember={addMember}
          onRemoveMember={removeMember}
          onClose={() => setShowDetailsPanel(false)}
        />
      )}

      {/* Pannello ticket (guest: Supporto / team: gestione ticket cliente) */}
      {showTicketPanel && clientId && (
        <div className="w-80 shrink-0 flex flex-col overflow-hidden">
          <TicketChatPanel
            channelId={channelId}
            clientId={clientId}
            onClose={() => { setShowTicketPanel(false); setOpenTicketId(undefined) }}
            isAdminView={!isGuest}
            isSuperAdmin={!isGuest && SUPER_ADMIN_EMAILS.includes(currentProfile.email ?? '')}
            allProfiles={allProfiles}
            currentUserId={currentProfile.id}
            initialTicketId={openTicketId}
          />
        </div>
      )}

      {/* File input */}
      <input ref={fileInputRef} type="file" multiple
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.csv,video/*"
        className="hidden" onChange={handleFileSelect} />
    </div>
  )
}
