'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Hash, Send, Users, Loader2, X, UserPlus, Mail,
  Trash2, Check, AlertCircle, MessageSquare, Search, Plus,
  Sparkles, FileText, Clock, StickyNote, Zap, Edit3,
  Flame, ChevronDown, ChevronRight, SlidersHorizontal, Archive, Shield, Smile,
} from 'lucide-react'
import { TicketChatPanel } from '@/components/ticket/TicketChatPanel'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { getInitials } from '@/lib/utils'
import { inviteChannelGuest, revokeChannelGuest } from '@/app/actions/invite-guest'
import { suggestCCReplies, summarizeClientThread } from '@/app/actions/cc-ai'
import { isSuperAdmin, isAdminOrAbove } from '@/lib/permissions'
import type { ChatChannel, ChatMessageWithSender, Profile, ClientAccount, ChannelGuest, ClientNote } from '@/lib/types/database'

interface ProjectWithCC {
  id: string
  name: string
  status: string
  client_id: string
  client: { id: string; company_name: string; client_label: string } | null
  customer_care_channel: ChatChannel | null
  internal_channel: ChatChannel | null
  accounts: ClientAccount[]
  total_messages: number
  recent_messages: number
}

interface Props {
  projects: ProjectWithCC[]
  currentProfile: Profile
  allProfiles: Profile[]
}

type SortKey = 'activity' | 'name' | 'messages'

// Indicatore velocità calibrato su ritmi B2B reali (consulenza, pochi clienti)
function getVelocity(recent: number): { icon: string; label: string; color: string } | null {
  if (recent >= 5) return { icon: '🔥', label: 'Molto attivo', color: 'text-orange-400' } // quasi giornaliero
  if (recent >= 2) return { icon: '⚡', label: 'Attivo',       color: 'text-yellow-400' } // 2-4 msg/settimana
  if (recent >= 1) return { icon: '💬', label: 'Normale',      color: 'text-blue-400' }   // almeno 1 msg/settimana
  return null
}

const MAX_ACCOUNTS = 5
const MAX_GUESTS = 5
type PanelTab = 'team' | 'cliente' | 'esterni' | 'note'

function getClientStatus(lastMsgAt: string | null): 'active' | 'atrisk' | 'inactive' | 'new' {
  if (!lastMsgAt) return 'new'
  const days = (Date.now() - new Date(lastMsgAt).getTime()) / 86400000
  if (days < 7) return 'active'
  if (days < 30) return 'atrisk'
  return 'inactive'
}

const STATUS = {
  active:   { dot: 'bg-success', label: 'Attivo',    chip: 'text-success bg-success/10 border-success/20' },
  atrisk:   { dot: 'bg-warning', label: 'A rischio', chip: 'text-warning bg-warning/10 border-warning/20' },
  inactive: { dot: 'bg-error',   label: 'Inattivo',  chip: 'text-error bg-error/10 border-error/20' },
  new:      { dot: 'bg-[#444]',  label: 'Nuovo',     chip: 'text-[#888] bg-[#1A1A1A] border-[#2A2A2A]' },
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'mai'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'adesso'
  if (s < 3600) return `${Math.floor(s / 60)}m fa`
  if (s < 86400) return `${Math.floor(s / 3600)}h fa`
  if (s < 604800) return `${Math.floor(s / 86400)}g fa`
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
}

const QUICK_REACTIONS = ['👍', '✅', '🔥', '👀', '🙏', '❤️', '😂', '⚡']

interface CcReaction { emoji: string; count: number; byMe: boolean; profiles: string[] }

function CcMessageRow({ msg, isOwn, compact, canEdit, currentUserId, channelType, onEdit, onDelete, onOpenTicket }: {
  msg: ChatMessageWithSender
  isOwn: boolean
  compact: boolean
  canEdit: boolean
  currentUserId: string
  channelType?: string
  onEdit: (id: string, content: string) => void
  onDelete: (id: string) => void
  onOpenTicket?: () => void
}) {
  const [hover, setHover] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState(msg.content)
  const [saving, setSaving] = useState(false)
  const [reactions, setReactions] = useState<CcReaction[]>([])

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
      })
  }, [msg.id, currentUserId])

  const toggleReaction = async (emoji: string) => {
    setShowPicker(false)
    const sb = createClient()
    const existing = reactions.find(r => r.emoji === emoji)
    if (existing?.byMe) {
      await sb.from('message_reactions').delete().eq('message_id', msg.id).eq('profile_id', currentUserId).eq('emoji', emoji)
      setReactions(p => p.map(r => r.emoji === emoji ? { ...r, count: r.count - 1, byMe: false } : r).filter(r => r.count > 0))
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
    await createClient().from('chat_messages').update({ content: editText.trim(), edited_at: new Date().toISOString() }).eq('id', msg.id)
    setSaving(false)
    onEdit(msg.id, editText.trim())
    setEditMode(false)
  }

  const handleDelete = async () => {
    if (!confirm('Eliminare questo messaggio?')) return
    await createClient().from('chat_messages').update({ is_deleted: true }).eq('id', msg.id)
    onDelete(msg.id)
  }

  const isTicket = msg.content.startsWith('__TICKET__')

  return (
    <div
      className={`relative flex items-end gap-2.5 ${isOwn ? 'flex-row-reverse' : ''} ${compact ? 'pt-0.5' : 'pt-3'} group/ccmsg`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setShowPicker(false) }}
    >
      {/* Avatar */}
      {!compact
        ? <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isOwn ? 'bg-gold/20 text-gold' : 'bg-[#2A2A2A] text-white'}`}>
            {msg.sender ? getInitials(msg.sender.full_name) : '?'}
          </div>
        : <div className="w-8 shrink-0" />
      }

      <div className="max-w-[65%] flex flex-col">
        {!compact && (
          <div className={`flex items-baseline gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
            {!isOwn && <span className="text-xs font-semibold text-white">{msg.sender?.full_name}</span>}
            <span className="text-[10px] text-[#555]">{fmtTime(msg.created_at)}</span>
            {(msg as ChatMessageWithSender & { edited_at?: string }).edited_at && <span className="text-[10px] text-[#444] italic">(modificato)</span>}
          </div>
        )}

        {/* Contenuto */}
        {editMode ? (
          <div>
            <textarea
              value={editText} onChange={e => setEditText(e.target.value)} autoFocus rows={2}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } if (e.key === 'Escape') setEditMode(false) }}
              className="w-full bg-[#1A1A1A] border border-gold/40 rounded-xl px-3 py-2 text-sm text-white resize-none focus:outline-none"
            />
            <div className="flex gap-2 mt-1.5">
              <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1 text-xs bg-gold text-black font-bold px-2.5 py-1 rounded-lg disabled:opacity-50">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salva
              </button>
              <button onClick={() => setEditMode(false)} className="text-xs text-[#555] hover:text-white px-2 py-1">Annulla</button>
            </div>
          </div>
        ) : isTicket ? (() => {
          try {
            const data = JSON.parse(msg.content.slice(10))
            const pc: Record<string, string> = { urgente: 'border-red-500/40 bg-red-500/10', alta: 'border-orange-500/40 bg-orange-500/10', normale: 'border-blue-500/40 bg-blue-500/10', bassa: 'border-green-500/40 bg-green-500/10' }
            return (
              <button onClick={onOpenTicket} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border text-left w-full transition-all hover:opacity-80 active:scale-[0.98] ${pc[data.priority] ?? 'border-[#2A2A2A] bg-[#1A1A1A]'}`}>
                <span className="text-2xl shrink-0">{data.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-[#888] uppercase tracking-wider mb-0.5">Ticket · {data.priorityLabel}</p>
                  <p className="text-sm font-bold text-white truncate">{data.title}</p>
                  <p className="text-[10px] text-[#555] mt-0.5">Clicca per gestire →</p>
                </div>
              </button>
            )
          } catch { return <div className="px-3.5 py-2.5 rounded-2xl text-sm text-[#555]">[ticket]</div> }
        })() : (
          <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${isOwn ? 'bg-gold text-black font-medium rounded-br-sm' : 'bg-[#1A1A1A] border border-[#2A2A2A] text-white rounded-bl-sm'}`}>
            {msg.content}
          </div>
        )}

        {/* Reactions display — solo in chat interna, non in CC verso il cliente */}
        {reactions.length > 0 && channelType === 'cliente_interno' && (
          <div className={`flex items-center gap-1 flex-wrap mt-1.5 ${isOwn ? 'justify-end' : ''}`}>
            {reactions.map(r => (
              <div key={r.emoji} className="relative group/reaction">
                <button onClick={() => toggleReaction(r.emoji)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-all hover:scale-105 active:scale-95 ${r.byMe ? 'bg-gold/20 border-gold/40 text-gold' : 'bg-[#1A1A1A] border-[#2A2A2A] text-[#888] hover:border-[#3A3A3A] hover:text-white'}`}>
                  <span className="text-sm leading-none">{r.emoji}</span>
                  <span className="font-bold leading-none">{r.count}</span>
                </button>
                {r.profiles.length > 0 && (
                  <div className={`absolute bottom-full mb-1.5 ${isOwn ? 'right-0' : 'left-0'} hidden group-hover/reaction:flex flex-col items-${isOwn ? 'end' : 'start'} z-30 pointer-events-none`}>
                    <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-xl px-3 py-2 shadow-2xl whitespace-nowrap">
                      <p className="text-[10px] text-[#555] font-bold uppercase tracking-wider mb-1">{r.emoji} {r.count} {r.count === 1 ? 'reazione' : 'reazioni'}</p>
                      {r.profiles.map(name => (
                        <p key={name} className="text-xs text-white leading-snug">{name}</p>
                      ))}
                      {r.byMe && !r.profiles.includes('Tu') && (
                        <p className="text-xs text-gold leading-snug">Tu</p>
                      )}
                    </div>
                    <div className={`w-2 h-2 bg-[#0D0D0D] border-r border-b border-[#2A2A2A] rotate-45 ${isOwn ? 'self-end mr-3' : 'self-start ml-3'} -mt-1`} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hover toolbar */}
      {hover && !editMode && !isTicket && (
        <div className={`absolute -top-3 ${isOwn ? 'left-0' : 'right-0'} flex items-center gap-0.5 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl shadow-2xl z-10 px-1.5 py-1`}>
          {/* Emoji picker — solo in chat interna */}
          {channelType === 'cliente_interno' && (
            <div className="relative">
              <button onClick={() => setShowPicker(v => !v)} className="p-1.5 hover:bg-[#2A2A2A] rounded-lg text-[#666] hover:text-white transition-colors" title="Reazione">
                <Smile className="w-3.5 h-3.5" />
              </button>
              {showPicker && (
                <div className={`absolute bottom-full ${isOwn ? 'right-0' : 'left-0'} mb-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-2 flex gap-1 shadow-2xl z-20`}>
                  {QUICK_REACTIONS.map(e => (
                    <button key={e} onClick={() => toggleReaction(e)}
                      className={`text-base hover:scale-125 transition-transform p-1 rounded hover:bg-[#2A2A2A] ${reactions.find(r => r.emoji === e)?.byMe ? 'bg-gold/20' : ''}`}>
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Edit */}
          {canEdit && (
            <button onClick={() => setEditMode(true)} className="p-1.5 hover:bg-[#2A2A2A] rounded-lg text-[#666] hover:text-white transition-colors" title="Modifica">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Delete */}
          {canEdit && (
            <button onClick={handleDelete} className="p-1.5 hover:bg-[#2A2A2A] rounded-lg text-[#666] hover:text-red-400 transition-colors" title="Elimina">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const QUICK_TEMPLATES = [
  { label: '✅ Ricevuto',       text: 'Grazie per il messaggio! Ho preso in carico la tua richiesta e ti risponderò al più presto.' },
  { label: '📋 In lavorazione', text: 'Stiamo lavorando sulla tua richiesta. Ti aggiorniamo non appena avremo novità.' },
  { label: '📞 Ti chiamiamo',   text: 'Ti contatteremo telefonicamente entro oggi per discutere nel dettaglio.' },
  { label: '✔️ Risolto',        text: 'La questione è stata risolta! Facci sapere se hai bisogno di ulteriore assistenza.' },
  { label: '📅 Appuntamento',   text: 'Ti proponiamo un appuntamento per la prossima settimana. Quando sei disponibile?' },
]

export function CustomerCareClient({ projects, currentProfile, allProfiles }: Props) {
  const isAdmin = isSuperAdmin(currentProfile) || isAdminOrAbove(currentProfile)

  // ─── State ─────────────────────────────────────────────────────────────────
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id ?? '')
  const [channels, setChannels] = useState<Record<string, ChatChannel | null>>(
    Object.fromEntries(projects.map(p => [p.id, p.customer_care_channel]))
  )
  const [accounts, setAccounts] = useState<Record<string, ClientAccount[]>>(
    Object.fromEntries(projects.map(p => [p.id, p.accounts]))
  )
  const [lastMsgAt, setLastMsgAt] = useState<Record<string, string | null>>(
    Object.fromEntries(projects.map(p => [p.id, p.customer_care_channel?.last_message_at ?? null]))
  )
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [messages, setMessages] = useState<ChatMessageWithSender[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('activity')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  // Cache velocità aggiornata real-time
  const [recentMsgs, setRecentMsgs] = useState<Record<string, number>>(
    Object.fromEntries(projects.map(p => [p.id, p.recent_messages ?? 0]))
  )
  const [totalMsgs, setTotalMsgs] = useState<Record<string, number>>(
    Object.fromEntries(projects.map(p => [p.id, p.total_messages ?? 0]))
  )

  // Panel
  const [showPanel, setShowPanel] = useState(true)
  const [showTicketPanel, setShowTicketPanel] = useState(false)
  const [panelTab, setPanelTab] = useState<PanelTab>('cliente')
  const [channelMembers, setChannelMembers] = useState<Profile[]>([])
  const [memberSearch, setMemberSearch] = useState('')

  // Cliente tab
  const [newAccount, setNewAccount] = useState({ full_name: '', email: '', role: '' })
  const [addingAccount, setAddingAccount] = useState(false)

  // Esterni tab
  const [guests, setGuests] = useState<ChannelGuest[]>([])
  const [showExtForm, setShowExtForm] = useState(false)
  const [extForm, setExtForm] = useState({ name: '', email: '', role: '' })
  const [sendingInvite, setSendingInvite] = useState(false)

  // Note tab (Supabase)
  const [notes, setNotes] = useState<ClientNote[]>([])
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')

  // AI
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [loadingAI, setLoadingAI] = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  // Refs
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const subRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const bgSubsRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']>[]>([])
  // Ref per accedere a channels senza dipendenza nell'effetto
  const channelsRef = useRef(channels)
  useEffect(() => { channelsRef.current = channels }, [channels])
  const selectedProjectIdRef = useRef(selectedProjectId)
  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId
    setShowTicketPanel(false)
  }, [selectedProjectId])

  const selectedProject = projects.find(p => p.id === selectedProjectId) ?? null
  const channel = selectedProjectId ? channelsRef.current[selectedProjectId] ?? null : null

  // ─── Notifiche browser: richiedi permesso al mount ──────────────────────────
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // ─── Aggiorna titolo tab con totale non letti ───────────────────────────────
  useEffect(() => {
    const total = Object.values(unread).reduce((s, n) => s + n, 0)
    document.title = total > 0 ? `(${total}) Customer Care — TWO BEE` : 'Customer Care — TWO BEE'
    return () => { document.title = 'TWO BEE' }
  }, [unread])

  // ─── Background subscriptions su TUTTI i canali CC ─────────────────────────
  // Si attiva quando cambiano i canali disponibili (nuovi creati)
  useEffect(() => {
    const supabase = createClient()
    // Pulisci subs precedenti
    bgSubsRef.current.forEach(s => supabase.removeChannel(s))
    bgSubsRef.current = []

    const channelEntries = Object.entries(channelsRef.current).filter(([, ch]) => ch !== null) as [string, ChatChannel][]
    if (channelEntries.length === 0) return

    const subs = channelEntries.map(([projectId, ch]) => {
      return supabase
        .channel(`bg-cc-${ch.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${ch.id}`,
        }, async payload => {
          const msg = payload.new as { sender_id: string; content: string; created_at: string }
          if (msg.sender_id === currentProfile.id) return

          const project = projects.find(p => p.id === projectId)
          const projectLabel = project ? `${project.name} — ${project.client?.company_name ?? ''}` : 'Progetto'
          const preview = msg.content.startsWith('__TICKET__') ? '🎫 Nuovo ticket' : msg.content.length > 60 ? msg.content.slice(0, 60) + '…' : msg.content

          setLastMsgAt(p => ({ ...p, [projectId]: msg.created_at }))
          setRecentMsgs(p => ({ ...p, [projectId]: (p[projectId] ?? 0) + 1 }))
          setTotalMsgs(p => ({ ...p, [projectId]: (p[projectId] ?? 0) + 1 }))

          if (selectedProjectIdRef.current !== projectId) {
            setUnread(p => ({ ...p, [projectId]: (p[projectId] ?? 0) + 1 }))

            toast(`💬 ${projectLabel}`, {
              description: preview,
              action: {
                label: 'Apri',
                onClick: () => setSelectedProjectId(projectId),
              },
              duration: 6000,
            })

            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const n = new Notification(`Customer Care — ${projectLabel}`, {
                body: preview,
                icon: '/favicon.ico',
                tag: `cc-${projectId}`,
              })
              n.onclick = () => { window.focus(); setSelectedProjectId(projectId) }
            }
          }
        })
        .subscribe()
    })

    bgSubsRef.current = subs

    return () => {
      subs.forEach(s => supabase.removeChannel(s))
      bgSubsRef.current = []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.entries(channels).filter(([, ch]) => ch).map(([id, ch]) => `${id}:${ch?.id}`).join(',')])
  const clientAccounts = selectedProjectId ? (accounts[selectedProjectId] ?? []) : []
  const partnerGuests = guests.filter(g => g.guest_type === 'partner')
  const nonMembers = allProfiles.filter(p =>
    !channelMembers.find(m => m.id === p.id) &&
    (p.full_name ?? '').toLowerCase().includes(memberSearch.toLowerCase())
  )
  const clientStatus = getClientStatus(lastMsgAt[selectedProjectId] ?? null)

  // ─── Carica canale + messaggi al cambio cliente ─────────────────────────────
  useEffect(() => {
    if (!selectedProjectId) return
    loadChannel(selectedProjectId)
    // Reset UI
    setAiSuggestions([])
    setAiSummary('')
    setShowTemplates(false)
  }, [selectedProjectId])

  // Carica guests + membri quando channel cambia
  useEffect(() => {
    if (!channel?.id) { setGuests([]); setChannelMembers([]); return }
    const supabase = createClient()
    supabase.from('channel_guests').select('*').eq('channel_id', channel.id).neq('status', 'revoked').order('invited_at')
      .then(({ data }) => setGuests((data ?? []) as ChannelGuest[]))
    supabase.from('channel_members').select('profiles!inner(*)').eq('channel_id', channel.id)
      .then(({ data }) => {
        const profiles = (data ?? []).map((r: Record<string, unknown>) => {
          const p = r['profiles']
          return (Array.isArray(p) ? p[0] : p) as Profile
        }).filter(Boolean)
        setChannelMembers(profiles)
      })
  }, [channel?.id])

  // Carica note quando cambia progetto (usa client_id del progetto, non project_id)
  useEffect(() => {
    const clientId = selectedProject?.client_id
    if (!clientId) return
    setLoadingNotes(true)
    createClient()
      .from('client_notes')
      .select('*, author:profiles!client_notes_author_id_fkey(id, full_name, avatar_url)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setNotes((data ?? []) as ClientNote[])
        setLoadingNotes(false)
      })
  }, [selectedProject?.client_id])

  const loadChannel = async (projectId: string) => {
    setLoadingMsgs(true)
    setMessages([])
    const supabase = createClient()

    if (subRef.current) { supabase.removeChannel(subRef.current); subRef.current = null }

    const ch = channelsRef.current[projectId]
    if (!ch) {
      // Il canale viene creato automaticamente dal trigger al momento della creazione del progetto
      toast.error('Canale non trovato — crea prima il progetto')
      setLoadingMsgs(false)
      return
    }

    await supabase.from('channel_members').upsert(
      { channel_id: ch.id, profile_id: currentProfile.id, last_read_at: new Date().toISOString() },
      { onConflict: 'channel_id,profile_id', ignoreDuplicates: false }
    )
    setUnread(prev => ({ ...prev, [projectId]: 0 }))

    // Carica messaggi
    const { data: msgs, error: msgErr } = await supabase
      .from('chat_messages')
      .select('*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url)')
      .eq('channel_id', ch.id).eq('is_deleted', false)
      .order('created_at', { ascending: true }).limit(300)
    if (msgErr) toast.error('Errore caricamento messaggi: ' + msgErr.message)
    setMessages((msgs ?? []) as ChatMessageWithSender[])
    setLoadingMsgs(false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 80)

    // ── REALTIME subscription ──────────────────────────────────────────────────
    const sub = supabase
      .channel(`cc-chat-${ch.id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel_id=eq.${ch.id}`,
      }, async payload => {
        const { data: msg } = await supabase
          .from('chat_messages')
          .select('*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url)')
          .eq('id', payload.new.id)
          .single()
        if (!msg) return
        setMessages(prev => {
          // Evita duplicati
          if (prev.find(m => m.id === msg.id)) return prev
          return [...prev, msg as ChatMessageWithSender]
        })
        setLastMsgAt(prev => ({ ...prev, [projectId]: (msg as ChatMessageWithSender).created_at }))
        setRecentMsgs(p => ({ ...p, [projectId]: (p[projectId] ?? 0) + 1 }))
        setTotalMsgs(p => ({ ...p, [projectId]: (p[projectId] ?? 0) + 1 }))
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
        if ((msg as ChatMessageWithSender).sender_id !== currentProfile.id) {
          setUnread(prev => ({
            ...prev,
            [projectId]: selectedProjectId === projectId ? 0 : (prev[projectId] ?? 0) + 1,
          }))
        }
      })
      .subscribe()
    subRef.current = sub
  }

  // ─── Edit / Delete messaggi ─────────────────────────────────────────────────
  const handleMsgEdit = (id: string, content: string) => {
    setMessages(p => p.map(m => m.id === id ? { ...m, content } : m))
  }
  const handleMsgDelete = (id: string) => {
    setMessages(p => p.filter(m => m.id !== id))
  }

  // ─── Invia messaggio ────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const trimmed = text.trim()
    if (!trimmed || !channel || sending) return
    setSending(true)
    setText('')
    setAiSuggestions([])

    // ── Optimistic update: messaggio appare subito ──────────────────────────
    const optimisticId = `opt-${Date.now()}`
    const optimistic: ChatMessageWithSender = {
      id: optimisticId,
      channel_id: channel.id,
      sender_id: currentProfile.id,
      content: trimmed,
      created_at: new Date().toISOString(),
      edited_at: null,
      is_deleted: false,
      is_pinned: false,
      attachments: null,
      sender: { id: currentProfile.id, full_name: currentProfile.full_name, avatar_url: currentProfile.avatar_url ?? null },
    }
    setMessages(prev => [...prev, optimistic])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)

    // ── Insert DB + recupera messaggio reale ────────────────────────────────
    const { data: realMsg, error } = await createClient()
      .from('chat_messages')
      .insert({ channel_id: channel.id, sender_id: currentProfile.id, content: trimmed })
      .select('*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url)')
      .single()

    if (error) {
      toast.error('Errore invio')
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      setText(trimmed)
    } else {
      // Sostituisce il messaggio ottimistico con quello reale
      setMessages(prev => prev.map(m => m.id === optimisticId ? realMsg as ChatMessageWithSender : m))
      setRecentMsgs(p => ({ ...p, [selectedProjectId]: (p[selectedProjectId] ?? 0) + 1 }))
      setTotalMsgs(p => ({ ...p, [selectedProjectId]: (p[selectedProjectId] ?? 0) + 1 }))
    }
    setSending(false)
    textareaRef.current?.focus()
  }

  // ─── AI ────────────────────────────────────────────────────────────────────
  const getAISuggestions = async () => {
    if (!selectedProject || messages.length === 0) return
    setLoadingAI(true); setAiSuggestions([])
    const msgs = messages.slice(-10).map(m => ({
      sender: m.sender?.full_name ?? '', content: m.content, isOwn: m.sender_id === currentProfile.id,
    }))
    const suggestions = await suggestCCReplies(selectedProject.name, msgs)
    setAiSuggestions(suggestions); setLoadingAI(false)
  }

  const getSummary = async () => {
    if (!selectedProject || messages.length < 3) { toast.info('Servono almeno 3 messaggi'); return }
    setLoadingSummary(true)
    const msgs = messages.map(m => ({ sender: m.sender?.full_name ?? '', content: m.content, isOwn: m.sender_id === currentProfile.id }))
    const s = await summarizeClientThread(selectedProject.name, msgs)
    setAiSummary(s); setLoadingSummary(false)
  }

  // ─── Team ───────────────────────────────────────────────────────────────────
  const addMember = async (profileId: string) => {
    if (!channel) return
    await createClient().from('channel_members').upsert({ channel_id: channel.id, profile_id: profileId }, { onConflict: 'channel_id,profile_id', ignoreDuplicates: true })
    const p = allProfiles.find(p => p.id === profileId)
    if (p) { setChannelMembers(prev => [...prev, p]); toast.success(`${p.full_name} aggiunto`) }
  }

  const removeMember = async (profileId: string) => {
    if (!channel || profileId === currentProfile.id) return
    await createClient().from('channel_members').delete().eq('channel_id', channel.id).eq('profile_id', profileId)
    setChannelMembers(prev => prev.filter(m => m.id !== profileId)); toast.success('Membro rimosso')
  }

  // ─── Accounts cliente ───────────────────────────────────────────────────────
  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProjectId || clientAccounts.length >= MAX_ACCOUNTS) return
    setAddingAccount(true)
    const { data, error } = await createClient().from('client_accounts').insert({
      client_id: selectedProjectId, full_name: newAccount.full_name, email: newAccount.email, role: newAccount.role || null,
    }).select().single()
    setAddingAccount(false)
    if (error) { toast.error(error.message.includes('unique') ? 'Email già presente' : error.message); return }
    if (channel) await inviteChannelGuest(channel.id, newAccount.email, 'cliente', newAccount.full_name, newAccount.role || 'Cliente')
    setAccounts(p => ({ ...p, [selectedProjectId]: [...(p[selectedProjectId] ?? []), data as ClientAccount] }))
    setNewAccount({ full_name: '', email: '', role: '' })
    toast.success('Account aggiunto — invito magic link inviato')
  }

  const deleteAccount = async (id: string) => {
    if (!confirm('Rimuovere questo account?')) return
    await createClient().from('client_accounts').delete().eq('id', id)
    setAccounts(p => ({ ...p, [selectedProjectId]: p[selectedProjectId].filter(a => a.id !== id) }))
    toast.success('Account rimosso')
  }

  const resendInvite = async (acc: ClientAccount) => {
    if (!channel) return
    const res = await inviteChannelGuest(channel.id, acc.email, 'cliente', acc.full_name, acc.role ?? 'Cliente')
    res.success ? toast.success(`Invito reinviato a ${acc.email}`) : toast.error(res.error ?? 'Errore')
  }

  // ─── Guest esterni ──────────────────────────────────────────────────────────
  const sendExtInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!channel) return
    setSendingInvite(true)
    const res = await inviteChannelGuest(channel.id, extForm.email, 'partner', extForm.name, extForm.role)
    setSendingInvite(false)
    if (!res.success) { toast.error(res.error ?? 'Errore'); return }
    toast.success(`Invito inviato a ${extForm.email}`)
    setExtForm({ name: '', email: '', role: '' }); setShowExtForm(false)
    const { data } = await createClient().from('channel_guests').select('*').eq('channel_id', channel.id).neq('status', 'revoked').order('invited_at')
    setGuests((data ?? []) as ChannelGuest[])
  }

  const revokeGuest = async (guestId: string, email: string) => {
    if (!confirm(`Revocare accesso a ${email}?`)) return
    const res = await revokeChannelGuest(guestId)
    res.success ? setGuests(p => p.filter(g => g.id !== guestId)) : toast.error(res.error ?? 'Errore')
    if (res.success) toast.success('Accesso revocato')
  }

  // ─── Note ───────────────────────────────────────────────────────────────────
  const saveNote = async () => {
    const clientId = selectedProject?.client_id
    if (!noteText.trim() || !clientId) return
    setSavingNote(true)
    const { data, error } = await createClient().from('client_notes').insert({
      client_id: clientId,
      author_id: currentProfile.id,
      content: noteText.trim(),
    }).select('*, author:profiles!client_notes_author_id_fkey(id, full_name, avatar_url)').single()
    setSavingNote(false)
    if (error) { toast.error('Errore salvataggio nota'); return }
    setNotes(prev => [data as ClientNote, ...prev])
    setNoteText('')
    toast.success('Nota salvata')
  }

  const updateNote = async (noteId: string) => {
    if (!editNoteText.trim()) return
    const { error } = await createClient().from('client_notes').update({ content: editNoteText.trim() }).eq('id', noteId)
    if (error) { toast.error('Errore aggiornamento'); return }
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, content: editNoteText.trim(), updated_at: new Date().toISOString() } : n))
    setEditingNoteId(null); setEditNoteText('')
    toast.success('Nota aggiornata')
  }

  const deleteNote = async (noteId: string) => {
    if (!confirm('Eliminare questa nota?')) return
    await createClient().from('client_notes').delete().eq('id', noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
    toast.success('Nota eliminata')
  }

  // ─── Grouped messages ────────────────────────────────────────────────────────
  const grouped: { date: string; messages: ChatMessageWithSender[] }[] = []
  for (const msg of messages) {
    const date = fmtDate(msg.created_at)
    const last = grouped[grouped.length - 1]
    if (last?.date === date) last.messages.push(msg)
    else grouped.push({ date, messages: [msg] })
  }

  // Separa progetti archiviati (client_label === 'perso') da attivi
  const activeProjects = projects.filter(p => p.client?.client_label !== 'perso')
  const archivedProjects = projects.filter(p => p.client?.client_label === 'perso')

  // Filtra per ricerca (nome progetto o cliente)
  const statusFiltered = activeProjects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.client?.company_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  // Ordina
  const sortedProjects = [...statusFiltered].sort((a, b) => {
    if (sortKey === 'name') return a.name.localeCompare(b.name, 'it')
    if (sortKey === 'messages') return (totalMsgs[b.id] ?? 0) - (totalMsgs[a.id] ?? 0)
    // 'activity' default: last message desc
    const ta = lastMsgAt[a.id] ? new Date(lastMsgAt[a.id]!).getTime() : 0
    const tb = lastMsgAt[b.id] ? new Date(lastMsgAt[b.id]!).getTime() : 0
    return tb - ta
  })

  const filteredArchived = archivedProjects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.client?.company_name ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const panelTabs: { id: PanelTab; label: string; count: number; max?: number }[] = [
    { id: 'team',     label: 'Team',    count: channelMembers.length },
    { id: 'cliente',  label: 'Cliente', count: clientAccounts.length, max: MAX_ACCOUNTS },
    { id: 'esterni',  label: 'Esterni', count: partnerGuests.length,  max: MAX_GUESTS },
    { id: 'note',     label: 'Note',    count: notes.length },
  ]

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <div className="w-72 bg-surface border-r border-[#2A2A2A] flex flex-col shrink-0">

        {/* Header + search */}
        <div className="px-4 pt-4 pb-3 border-b border-[#2A2A2A]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Customer Care</h2>
            <span className="text-[10px] text-[#555]">{activeProjects.length} progetti</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#555]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca progetto..."
              className="w-full bg-background border border-[#2A2A2A] rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder:text-[#444] focus:outline-none focus:border-gold/40" />
          </div>
        </div>

        {/* Ordinamento */}
        <div className="px-3 pt-2 pb-2 border-b border-[#2A2A2A]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#555]">Ordina per</span>
            <div className="relative">
              <button onClick={() => setShowSortMenu(v => !v)}
                className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg border transition-colors ${showSortMenu ? 'border-gold/30 text-gold bg-gold/5' : 'border-[#2A2A2A] text-[#888] hover:text-white'}`}>
                <SlidersHorizontal className="w-2.5 h-2.5" />
                {sortKey === 'activity' ? 'Ultima attività' : sortKey === 'name' ? 'Nome A→Z' : 'Più messaggi'}
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-7 w-40 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl shadow-xl z-20 py-1 overflow-hidden">
                  {([
                    { key: 'activity', label: 'Ultima attività' },
                    { key: 'name',     label: 'Nome A→Z' },
                    { key: 'messages', label: 'Più messaggi' },
                  ] as { key: SortKey; label: string }[]).map(s => (
                    <button key={s.key} onClick={() => { setSortKey(s.key); setShowSortMenu(false) }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${sortKey === s.key ? 'text-gold bg-gold/5' : 'text-text-secondary hover:text-white hover:bg-[#2A2A2A]'}`}>
                      {sortKey === s.key && '✓ '}{s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Lista progetti attivi */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2 space-y-0.5">
            {sortedProjects.length === 0 && (
              <p className="text-xs text-[#555] text-center py-6">Nessun progetto trovato</p>
            )}
            {sortedProjects.map(project => {
              const st = getClientStatus(lastMsgAt[project.id] ?? null)
              const sc = STATUS[st]
              const u = unread[project.id] ?? 0
              const isSel = project.id === selectedProjectId
              const vel = getVelocity(recentMsgs[project.id] ?? 0)
              const msgCount = totalMsgs[project.id] ?? 0

              return (
                <button key={project.id} onClick={() => setSelectedProjectId(project.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${isSel ? 'bg-gold/10 ring-1 ring-gold/20' : 'hover:bg-white/5'}`}>

                  {/* Avatar + status dot */}
                  <div className="relative shrink-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${isSel ? 'bg-gold/20 text-gold' : 'bg-[#2A2A2A] text-white'}`}>
                      {getInitials(project.name)}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface flex items-center justify-center ${sc.dot}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`text-xs truncate font-semibold ${isSel ? 'text-gold' : u > 0 ? 'text-white' : 'text-text-secondary'}`}>
                        {project.name}
                      </span>
                      {/* Badge non letti o icona canale */}
                      {u > 0
                        ? <span className="shrink-0 bg-error text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{u > 9 ? '9+' : u}</span>
                        : channels[project.id] && <MessageSquare className="w-3 h-3 text-gold/40 shrink-0" />
                      }
                    </div>

                    {/* Riga info secondaria: cliente + velocità */}
                    <div className="flex items-center gap-2">
                      {project.client && (
                        <span className="text-[10px] text-[#555] truncate max-w-[80px]">{project.client.company_name}</span>
                      )}
                      <span className="text-[10px] text-[#444]" suppressHydrationWarning>{timeAgo(lastMsgAt[project.id] ?? null)}</span>

                      {/* Velocità */}
                      {vel && (
                        <span className={`text-[11px] leading-none ${vel.color}`} title={`${vel.label} · ${recentMsgs[project.id] ?? 0} msg/7gg · ${msgCount} tot`}>
                          {vel.icon}
                        </span>
                      )}

                      {/* Contatore messaggi totali */}
                      {msgCount > 0 && (
                        <span className="text-[10px] text-[#444]">{msgCount > 99 ? '99+' : msgCount}</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* ── Sezione Archiviati ────────────────────────────────────────── */}
          {(filteredArchived.length > 0 || archivedProjects.length > 0) && (
            <div className="border-t border-[#2A2A2A] mt-2">
              <button onClick={() => setArchivedOpen(v => !v)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/5 transition-colors">
                <Archive className="w-3 h-3 text-[#555]" />
                <span className="text-[10px] text-[#555] font-bold uppercase tracking-wider flex-1">
                  Archiviati ({archivedProjects.length})
                </span>
                {archivedOpen
                  ? <ChevronDown className="w-3 h-3 text-[#555]" />
                  : <ChevronRight className="w-3 h-3 text-[#555]" />
                }
              </button>

              {archivedOpen && (
                <div className="px-2 pb-2 space-y-0.5">
                  {filteredArchived.map(project => {
                    const isSel = project.id === selectedProjectId
                    return (
                      <button key={project.id} onClick={() => setSelectedProjectId(project.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors opacity-60 hover:opacity-100 ${isSel ? 'bg-[#2A2A2A]' : 'hover:bg-white/5'}`}>
                        <div className="w-7 h-7 rounded-full bg-[#2A2A2A] flex items-center justify-center text-[10px] font-bold text-[#555] shrink-0">
                          {getInitials(project.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#555] truncate line-through">{project.name}</p>
                          <p className="text-[10px] text-[#444]" suppressHydrationWarning>{project.client?.company_name} · {timeAgo(lastMsgAt[project.id] ?? null)}</p>
                        </div>
                        <Archive className="w-3 h-3 text-[#444] shrink-0" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      {selectedProject ? (
        <div className="flex-1 flex min-w-0 overflow-hidden">

          {/* Chat column */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#2A2A2A] bg-[#1A1A1A] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <Hash className="w-4 h-4 text-text-secondary shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">{selectedProject.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${STATUS[clientStatus].chip}`}>
                      {STATUS[clientStatus].label}
                    </span>
                    {lastMsgAt[selectedProjectId] && (
                      <span className="text-[10px] text-[#555] flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /><span suppressHydrationWarning>{timeAgo(lastMsgAt[selectedProjectId])}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#555] mt-0.5">
                    {clientAccounts.length} account · {channelMembers.length} team · {partnerGuests.length} partner · {notes.length} note
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={getSummary} disabled={loadingSummary || messages.length < 3}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-[#2A2A2A] rounded-lg text-text-secondary hover:text-gold hover:border-gold/30 transition-colors disabled:opacity-40">
                  {loadingSummary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Riepilogo AI
                </button>
                {isAdmin ? (
                  <button onClick={() => { setShowTicketPanel(v => !v); setShowPanel(false) }}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 border rounded-lg transition-colors ${showTicketPanel ? 'border-[#F5C800]/40 text-[#F5C800] bg-[#F5C800]/5' : 'border-[#2A2A2A] text-text-secondary hover:text-white'}`}>
                    <Shield className="w-3.5 h-3.5" />
                    Ticket
                  </button>
                ) : (
                  <button onClick={() => { setShowTicketPanel(v => !v); setShowPanel(false) }}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 border rounded-lg transition-colors ${showTicketPanel ? 'border-[#F5C800]/40 text-[#F5C800] bg-[#F5C800]/5' : 'border-[#2A2A2A] text-text-secondary hover:text-white'}`}>
                    <Shield className="w-3.5 h-3.5" />
                    Supporto
                  </button>
                )}
                <button onClick={() => { setShowPanel(v => !v); setShowTicketPanel(false) }}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 border rounded-lg transition-colors ${showPanel ? 'border-gold/40 text-gold bg-gold/5' : 'border-[#2A2A2A] text-text-secondary hover:text-white'}`}>
                  <Users className="w-3.5 h-3.5" />
                  Accessi
                </button>
              </div>
            </div>

            {/* AI Summary */}
            {aiSummary && (
              <div className="mx-4 mt-3 shrink-0 bg-gold/5 border border-gold/20 rounded-xl px-4 py-3 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-[10px] text-gold font-bold uppercase tracking-wider mb-1">Riepilogo AI</p>
                  <p className="text-xs text-white leading-relaxed">{aiSummary}</p>
                </div>
                <button onClick={() => setAiSummary('')}><X className="w-3.5 h-3.5 text-[#555] hover:text-white" /></button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5">
              {loadingMsgs ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 text-gold animate-spin" />
                </div>
              ) : grouped.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center">
                    <MessageSquare className="w-7 h-7 text-gold" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm mb-1">Canale Customer Care</p>
                    <p className="text-text-secondary text-xs max-w-xs">Scrivi il primo messaggio a {selectedProject.name} o aggiungi i loro account dal pannello Accessi.</p>
                  </div>
                </div>
              ) : (
                <>
                  {grouped.map(group => (
                    <div key={group.date} className="mb-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex-1 h-px bg-[#2A2A2A]" />
                        <span className="text-xs text-[#555]">{group.date}</span>
                        <div className="flex-1 h-px bg-[#2A2A2A]" />
                      </div>
                      <div className="space-y-0.5">
                        {group.messages.map((msg, i) => (
                          <CcMessageRow
                            key={msg.id}
                            msg={msg}
                            isOwn={msg.sender_id === currentProfile.id}
                            compact={group.messages[i - 1]?.sender_id === msg.sender_id}
                            canEdit={isAdmin || msg.sender_id === currentProfile.id}
                            currentUserId={currentProfile.id}
                            channelType={channel?.type ?? undefined}
                            onEdit={handleMsgEdit}
                            onDelete={handleMsgDelete}
                            onOpenTicket={() => { setShowTicketPanel(true); setShowPanel(false) }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            {/* AI Suggestions */}
            {aiSuggestions.length > 0 && (
              <div className="px-4 pb-2 shrink-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3 h-3 text-gold" />
                  <span className="text-[10px] text-gold font-bold uppercase tracking-wider">Risposte suggerite da AI</span>
                  <button onClick={() => setAiSuggestions([])} className="ml-auto p-0.5">
                    <X className="w-3 h-3 text-[#555] hover:text-white" />
                  </button>
                </div>
                <div className="space-y-1">
                  {aiSuggestions.map((s, i) => (
                    <button key={i} onClick={() => { setText(s); setAiSuggestions([]); textareaRef.current?.focus() }}
                      className="w-full text-left text-xs px-3 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-text-secondary hover:text-white hover:border-gold/30 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Templates */}
            {showTemplates && (
              <div className="px-4 pb-2 shrink-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <FileText className="w-3 h-3 text-[#888]" />
                  <span className="text-[10px] text-[#888] font-bold uppercase tracking-wider">Template rapidi</span>
                  <button onClick={() => setShowTemplates(false)} className="ml-auto p-0.5">
                    <X className="w-3 h-3 text-[#555] hover:text-white" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TEMPLATES.map((t, i) => (
                    <button key={i} onClick={() => { setText(t.text); setShowTemplates(false); textareaRef.current?.focus() }}
                      className="text-xs px-2.5 py-1.5 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-text-secondary hover:text-white hover:border-gold/30 transition-colors whitespace-nowrap">
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input area */}
            <div className="p-4 border-t border-[#2A2A2A] shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={getAISuggestions} disabled={loadingAI || messages.length === 0}
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border border-[#2A2A2A] text-[#555] hover:text-gold hover:border-gold/30 transition-colors disabled:opacity-40">
                  {loadingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  AI
                </button>
                <button onClick={() => { setShowTemplates(v => !v); setAiSuggestions([]) }}
                  className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${showTemplates ? 'text-gold border-gold/30 bg-gold/5' : 'border-[#2A2A2A] text-[#555] hover:text-gold hover:border-gold/30'}`}>
                  <FileText className="w-3 h-3" />
                  Template
                </button>
                <button onClick={() => { setPanelTab('note'); setShowPanel(true) }}
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border border-[#2A2A2A] text-[#555] hover:text-warning hover:border-warning/30 transition-colors">
                  <StickyNote className="w-3 h-3" />
                  Note{notes.length > 0 ? ` (${notes.length})` : ''}
                </button>
              </div>
              <div className="flex items-end gap-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl px-4 py-3 focus-within:border-gold/40 transition-colors">
                <div className="w-6 h-6 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold text-[10px] font-bold shrink-0 mb-0.5">
                  {getInitials(currentProfile.full_name)}
                </div>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={e => {
                    setText(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder={`Scrivi a ${selectedProject.name}… (Invio per inviare, Shift+Invio per andare a capo)`}
                  rows={1}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-[#444] focus:outline-none resize-none leading-6 overflow-hidden"
                  style={{ minHeight: '24px', maxHeight: '120px' }}
                />
                <button onClick={sendMessage} disabled={!text.trim() || sending}
                  className="text-gold disabled:text-[#333] transition-colors mb-0.5 shrink-0 hover:text-yellow-400">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* ── Panel Ticket ──────────────────────────────────────────────── */}
          {showTicketPanel && selectedProject?.customer_care_channel && (
            <div className="w-80 shrink-0 flex flex-col overflow-hidden">
              <TicketChatPanel
                channelId={selectedProject.customer_care_channel.id}
                clientId={selectedProject.id}
                onClose={() => setShowTicketPanel(false)}
                isAdminView={isAdmin}
                isSuperAdmin={isSuperAdmin(currentProfile)}
                allProfiles={allProfiles}
                currentUserId={currentProfile.id}
              />
            </div>
          )}

          {/* ── Panel Accessi ─────────────────────────────────────────────── */}
          {showPanel && (
            <div className="w-80 border-l border-[#1E1E1E] bg-[#111] flex flex-col shrink-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E1E1E] shrink-0">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gold" />
                  <h3 className="text-sm font-bold text-white">Gestisci Accessi</h3>
                </div>
                <button onClick={() => setShowPanel(false)}><X className="w-4 h-4 text-[#555] hover:text-white" /></button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-[#1E1E1E] shrink-0 overflow-x-auto">
                {panelTabs.map(t => (
                  <button key={t.id} onClick={() => setPanelTab(t.id)}
                    className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap px-1 ${panelTab === t.id ? 'text-gold border-gold' : 'text-[#555] border-transparent hover:text-white'}`}>
                    {t.label}
                    {' '}<span className={panelTab === t.id ? 'text-gold' : 'text-[#444]'}>
                      {t.max != null ? `${t.count}/${t.max}` : t.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto">

                {/* TAB: Team */}
                {panelTab === 'team' && (
                  <div className="p-3">
                    <p className="text-[10px] text-[#555] px-1 mb-3">Membri TwoBee con accesso a questo canale</p>
                    {channelMembers.length === 0 && <p className="text-xs text-[#555] text-center py-4">Nessun membro</p>}
                    {channelMembers.map(m => (
                      <div key={m.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-[#1A1A1A] group transition-colors">
                        <div className="w-7 h-7 rounded-full bg-gold/20 flex items-center justify-center text-gold text-[10px] font-bold shrink-0 overflow-hidden">
                          {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover" alt="" /> : getInitials(m.full_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{m.full_name}</p>
                          <p className="text-[10px] text-[#555] capitalize">{m.role}</p>
                        </div>
                        {m.id === currentProfile.id
                          ? <span className="text-[10px] text-gold shrink-0">Tu</span>
                          : isAdmin && <button onClick={() => removeMember(m.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-[#555] hover:text-error transition-all shrink-0"><X className="w-3 h-3" /></button>
                        }
                      </div>
                    ))}
                    {isAdmin && nonMembers.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[#1E1E1E]">
                        <p className="text-[10px] text-[#555] uppercase tracking-wider font-bold px-1 mb-2">Aggiungi</p>
                        <div className="flex items-center gap-2 bg-[#0F0F0F] border border-[#2A2A2A] rounded-xl px-2.5 py-1.5 mb-2">
                          <Search className="w-3 h-3 text-[#555] shrink-0" />
                          <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Cerca..."
                            className="flex-1 bg-transparent text-xs text-white focus:outline-none placeholder:text-[#555]" />
                        </div>
                        {nonMembers.map(p => (
                          <button key={p.id} onClick={() => addMember(p.id)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-[#1A1A1A] transition-colors group/a">
                            <div className="w-6 h-6 rounded-full bg-[#2A2A2A] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                              {getInitials(p.full_name)}
                            </div>
                            <span className="text-xs text-[#555] group-hover/a:text-white flex-1 truncate">{p.full_name}</span>
                            <Plus className="w-3 h-3 text-[#555] opacity-0 group-hover/a:opacity-100 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Cliente */}
                {panelTab === 'cliente' && (
                  <div className="flex flex-col h-full">
                    <div className="p-3 border-b border-[#1E1E1E] shrink-0">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] text-[#555]">Contatti cliente · max {MAX_ACCOUNTS}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${clientAccounts.length >= MAX_ACCOUNTS ? 'bg-error/20 text-error' : 'bg-[#2A2A2A] text-[#888]'}`}>
                          {clientAccounts.length}/{MAX_ACCOUNTS}
                        </span>
                      </div>
                      {clientAccounts.length < MAX_ACCOUNTS ? (
                        <form onSubmit={addAccount} className="space-y-2">
                          <input value={newAccount.full_name} onChange={e => setNewAccount(p => ({ ...p, full_name: e.target.value }))}
                            placeholder="Nome e cognome *" required
                            className="w-full bg-[#0F0F0F] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-gold/40" />
                          <input type="email" value={newAccount.email} onChange={e => setNewAccount(p => ({ ...p, email: e.target.value }))}
                            placeholder="Email *" required
                            className="w-full bg-[#0F0F0F] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-gold/40" />
                          <input value={newAccount.role} onChange={e => setNewAccount(p => ({ ...p, role: e.target.value }))}
                            placeholder="Ruolo (es: CEO)"
                            className="w-full bg-[#0F0F0F] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-gold/40" />
                          <button type="submit" disabled={addingAccount}
                            className="w-full py-1.5 bg-gold text-black text-xs font-bold rounded-lg hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                            {addingAccount ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                            Aggiungi + Invia invito
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2 bg-error/10 border border-error/20 rounded-lg px-3 py-2">
                          <AlertCircle className="w-3.5 h-3.5 text-error shrink-0" />
                          <p className="text-xs text-error">Limite {MAX_ACCOUNTS} account raggiunto</p>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                      {clientAccounts.length === 0
                        ? <p className="text-xs text-[#555] text-center py-4">Nessun account</p>
                        : clientAccounts.map(acc => (
                          <div key={acc.id} className="bg-[#0F0F0F] border border-[#2A2A2A] rounded-xl p-3 group">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 text-[10px] font-bold shrink-0">
                                  {getInitials(acc.full_name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-white truncate">{acc.full_name}</p>
                                  <p className="text-[10px] text-[#555] truncate">{acc.email}</p>
                                  {acc.role && <p className="text-[10px] text-[#444]">{acc.role}</p>}
                                  {acc.accepted_at
                                    ? <span className="text-[10px] text-success flex items-center gap-0.5 mt-0.5"><Check className="w-2.5 h-2.5" />Attivo</span>
                                    : <span className="text-[10px] text-warning mt-0.5 block">In attesa</span>}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1 shrink-0">
                                <button onClick={() => resendInvite(acc)} title="Reinvia" className="text-[#555] hover:text-gold transition-colors"><Mail className="w-3.5 h-3.5" /></button>
                                {isAdmin && <button onClick={() => deleteAccount(acc.id)} className="text-[#555] hover:text-error transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>}
                              </div>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}

                {/* TAB: Esterni */}
                {panelTab === 'esterni' && (
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] text-[#555]">Partner/professionisti · max {MAX_GUESTS}</p>
                      {isAdmin && partnerGuests.length < MAX_GUESTS && (
                        <button onClick={() => setShowExtForm(v => !v)}
                          className={`p-1.5 rounded-lg transition-colors ${showExtForm ? 'text-gold bg-gold/10' : 'text-[#555] hover:text-gold'}`}>
                          <UserPlus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {showExtForm && (
                      <form onSubmit={sendExtInvite} className="bg-[#0F0F0F] border border-[#2A2A2A] rounded-xl p-3 space-y-2 mb-3">
                        <p className="text-[10px] text-[#888] font-bold uppercase tracking-wider">🤝 Invita partner</p>
                        <input required value={extForm.name} onChange={e => setExtForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome Cognome *" autoFocus
                          className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-gold/40" />
                        <input required type="email" value={extForm.email} onChange={e => setExtForm(p => ({ ...p, email: e.target.value }))} placeholder="Email *"
                          className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-gold/40" />
                        <input required value={extForm.role} onChange={e => setExtForm(p => ({ ...p, role: e.target.value }))} placeholder="Azienda / Ruolo *"
                          className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-gold/40" />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setShowExtForm(false)} className="flex-1 py-1.5 border border-[#2A2A2A] rounded-lg text-xs text-[#888] hover:text-white">Annulla</button>
                          <button type="submit" disabled={sendingInvite} className="flex-1 py-1.5 bg-gold text-black font-bold rounded-lg text-xs hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-1">
                            {sendingInvite ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Invia
                          </button>
                        </div>
                      </form>
                    )}
                    {partnerGuests.length === 0
                      ? <div className="text-center py-8">
                          <UserPlus className="w-8 h-8 text-[#2A2A2A] mx-auto mb-2" />
                          <p className="text-xs text-[#555] mb-2">Nessun partner invitato</p>
                          {isAdmin && <button onClick={() => setShowExtForm(true)} className="text-xs text-gold hover:underline">+ Invia primo invito</button>}
                        </div>
                      : partnerGuests.map(g => (
                          <div key={g.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-[#1A1A1A] group transition-colors">
                            <div className="w-7 h-7 rounded-full bg-[#2A2A2A] border border-[#3A3A3A] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                              {getInitials(g.full_name ?? g.email)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{g.full_name ?? g.email}</p>
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${g.status === 'active' ? 'bg-success' : 'bg-warning'}`} />
                                <span className="text-[10px] text-[#555]">{g.status === 'active' ? 'Attivo' : 'In attesa'}</span>
                                {g.role && <span className="text-[10px] text-[#444] truncate">· {g.role}</span>}
                              </div>
                            </div>
                            {isAdmin && <button onClick={() => revokeGuest(g.id, g.email)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-[#555] hover:text-error transition-all shrink-0"><X className="w-3 h-3" /></button>}
                          </div>
                        ))
                    }
                  </div>
                )}

                {/* TAB: Note */}
                {panelTab === 'note' && (
                  <div className="flex flex-col h-full">
                    {/* Nuova nota */}
                    <div className="p-3 border-b border-[#1E1E1E] shrink-0">
                      <p className="text-[10px] text-[#555] mb-2">Note interne del team — non visibili al cliente</p>
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Scrivi una nota interna su questo cliente…"
                        rows={3}
                        className="w-full bg-[#0F0F0F] border border-[#2A2A2A] rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-gold/40 resize-none"
                      />
                      <button
                        onClick={saveNote}
                        disabled={!noteText.trim() || savingNote}
                        className="mt-2 w-full py-1.5 bg-gold text-black text-xs font-bold rounded-lg hover:bg-gold/90 disabled:opacity-40 flex items-center justify-center gap-1.5">
                        {savingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <StickyNote className="w-3 h-3" />}
                        Salva nota
                      </button>
                    </div>

                    {/* Lista note */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                      {loadingNotes
                        ? <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 text-gold animate-spin" /></div>
                        : notes.length === 0
                          ? <div className="text-center py-8">
                              <StickyNote className="w-8 h-8 text-[#2A2A2A] mx-auto mb-2" />
                              <p className="text-xs text-[#555]">Nessuna nota per questo cliente</p>
                            </div>
                          : notes.map(note => (
                              <div key={note.id} className="bg-[#0F0F0F] border border-[#2A2A2A] rounded-xl p-3 group">
                                {editingNoteId === note.id ? (
                                  <>
                                    <textarea value={editNoteText} onChange={e => setEditNoteText(e.target.value)} rows={3} autoFocus
                                      className="w-full bg-[#1A1A1A] border border-gold/30 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none resize-none mb-2" />
                                    <div className="flex gap-2">
                                      <button onClick={() => { setEditingNoteId(null); setEditNoteText('') }}
                                        className="flex-1 py-1 border border-[#2A2A2A] rounded-lg text-[10px] text-[#888] hover:text-white">Annulla</button>
                                      <button onClick={() => updateNote(note.id)}
                                        className="flex-1 py-1 bg-gold text-black font-bold rounded-lg text-[10px] hover:bg-yellow-400">Salva</button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    {/* Header nota */}
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="w-5 h-5 rounded-full bg-gold/20 flex items-center justify-center text-gold text-[9px] font-bold shrink-0 overflow-hidden">
                                        {note.author?.avatar_url
                                          ? <img src={note.author.avatar_url} className="w-full h-full object-cover" alt="" />
                                          : getInitials(note.author?.full_name ?? '?')}
                                      </div>
                                      <span className="text-[10px] font-semibold text-white truncate flex-1">{note.author?.full_name ?? 'Sconosciuto'}</span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {note.author_id === currentProfile.id && (
                                          <>
                                            <button onClick={() => { setEditingNoteId(note.id); setEditNoteText(note.content) }}
                                              className="p-0.5 text-[#555] hover:text-gold transition-colors opacity-0 group-hover:opacity-100">
                                              <Edit3 className="w-3 h-3" />
                                            </button>
                                            <button onClick={() => deleteNote(note.id)}
                                              className="p-0.5 text-[#555] hover:text-error transition-colors opacity-0 group-hover:opacity-100">
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    {/* Testo nota */}
                                    <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">{note.content}</p>
                                    {/* Footer con timestamp */}
                                    <div className="flex items-center gap-1 mt-2">
                                      <Clock className="w-2.5 h-2.5 text-[#444]" />
                                      <span className="text-[10px] text-[#444]">
                                        {fmtDate(note.created_at)} · {fmtTime(note.created_at)}
                                        {note.updated_at !== note.created_at && ' · modificata'}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))
                      }
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[#555] text-sm">
          Seleziona un cliente per iniziare
        </div>
      )}
    </div>
  )
}
