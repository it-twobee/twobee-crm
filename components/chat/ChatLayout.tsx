'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Lock, Plus, X, Loader2, ExternalLink,
  ChevronDown, ChevronRight, Headphones, Search,
  MoreHorizontal, Pencil, Trash2, Archive,
  Shield, Check, Users, ChevronUp, AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { SlackChat } from '@/components/chat/SlackChat'
import { isSuperAdmin } from '@/lib/permissions'
import type { ChatChannel, Profile, Client } from '@/lib/types/database'

interface ProjectInfo {
  id: string
  name: string
  client_id: string
  client: { id: string; company_name: string } | null
}

interface Props {
  channels: ChatChannel[]
  currentProfile: Profile
  allProfiles: Profile[]
  clients: Client[]
  projects?: ProjectInfo[]
  initialChannelId?: string
  unreadCounts?: Record<string, number>
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function toSlug(s: string) {
  return s.toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function channelDisplayName(ch: ChatChannel): string {
  // Nome ha priorità: cc-* = Customer Care, team-* = Chat Interna
  if (ch.name.startsWith('cc-')) return 'Customer Care'
  if (ch.name.startsWith('team-')) return 'Chat Interna'
  // Poi tipo
  if (ch.type === 'customer_care') return 'Customer Care'
  if (ch.type === 'cliente_interno') return 'Chat Interna'
  if (ch.type === 'cliente') return 'Customer Care'
  return ch.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Modal: nuovo canale team generale (2 step) ──────────────────────────────

function NewTeamChannelModal({ onClose, onCreate, currentProfileId, allProfiles }: {
  onClose: () => void; onCreate: (ch: ChatChannel) => void
  currentProfileId: string; allProfiles: Profile[]
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const slug = toSlug(name.trim())

  const createChannel = async () => {
    if (!slug) return
    setLoading(true)
    const sb = createClient()
    const { data: ch, error } = await sb.from('chat_channels')
      .insert({ name: slug, type: 'interno', position: 99, created_by: currentProfileId })
      .select().single()
    if (error) { toast.error(error.message); setLoading(false); return }
    const memberIds = Array.from(new Set([currentProfileId, ...selectedIds]))
    await Promise.all(memberIds.map(id =>
      sb.from('channel_members').insert({ channel_id: ch.id, profile_id: id })
    ))
    toast.success('Canale creato')
    onCreate(ch as ChatChannel)
  }

  const toggle = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  const others = allProfiles.filter(p => p.id !== currentProfileId && p.full_name?.toLowerCase().includes(search.toLowerCase()))

  if (step === 1) return (
    <Modal title="Crea un canale" icon={<Lock className="w-4 h-4" />} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-secondary mb-1.5 font-semibold">Nome</label>
          <InputRow prefix={<span className="text-text-secondary text-sm font-bold">#</span>}>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="ad es. piano-budget"
              maxLength={80}
              onKeyDown={e => { if (e.key === 'Enter' && slug) { e.preventDefault(); setStep(2) } }}
              className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-[#555]" />
            <span className="text-xs text-[#555] shrink-0">{80 - name.length}</span>
          </InputRow>
          {name && slug !== name.trim() && <p className="text-[10px] text-text-secondary mt-1">Slug: {slug}</p>}
          {name && !slug && <p className="text-[10px] text-error mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Nome non valido</p>}
        </div>
        <p className="text-[10px] text-text-secondary">I canali sono dove il team collabora. Potrai sempre cambiare questo nome.</p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-[#555]">Passaggio 1 di 2</span>
          <button disabled={!slug} onClick={() => setStep(2)}
            className="px-5 py-2 bg-gold text-black font-bold rounded-xl text-sm hover:bg-yellow-400 disabled:opacity-30 transition-colors">
            Avanti
          </button>
        </div>
      </div>
    </Modal>
  )

  return (
    <Modal title="Aggiungi persone" icon={<Users className="w-4 h-4" />} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-text-secondary">Chi vuoi aggiungere a <span className="text-white font-semibold">#{slug}</span>?</p>
        <InputRow prefix={<Search className="w-3.5 h-3.5 text-text-secondary shrink-0" />}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca persone…"
            className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-text-secondary" />
        </InputRow>
        <div className="max-h-52 overflow-y-auto space-y-1">
          {others.map(p => {
            const sel = selectedIds.includes(p.id)
            return (
              <button key={p.id} onClick={() => toggle(p.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors text-left ${sel ? 'bg-gold/10 border border-gold/30' : 'hover:bg-[#2A2A2A]'}`}>
                <div className="w-7 h-7 rounded-full bg-gold/20 flex items-center justify-center text-gold text-[10px] font-bold overflow-hidden shrink-0">
                  {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : (p.full_name || '?')[0].toUpperCase()}
                </div>
                <span className="text-sm text-white flex-1 truncate">{p.full_name}</span>
                {sel && <Check className="w-4 h-4 text-gold shrink-0" />}
              </button>
            )
          })}
          {others.length === 0 && <p className="text-xs text-[#555] text-center py-4">Nessun risultato</p>}
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(1)} className="text-xs text-text-secondary hover:text-white transition-colors">← Indietro</button>
            <span className="text-[10px] text-[#555]">Passaggio 2 di 2</span>
          </div>
          <button onClick={createChannel} disabled={loading}
            className="px-5 py-2 bg-gold text-black font-bold rounded-xl text-sm hover:bg-yellow-400 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {selectedIds.length > 0 ? `Crea con ${selectedIds.length + 1}` : 'Crea canale'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal: rinomina ──────────────────────────────────────────────────────────

function RenameModal({ channel, onClose, onRename }: {
  channel: ChatChannel; onClose: () => void; onRename: (id: string, name: string) => void
}) {
  const [name, setName] = useState(channel.name)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const slug = toSlug(name.trim())
    if (!slug || slug === channel.name) { onClose(); return }
    setSaving(true)
    const sb = createClient()
    await sb.from('chat_channels').update({ name: slug }).eq('id', channel.id)
    setSaving(false)
    toast.success('Rinominato')
    onRename(channel.id, slug)
    onClose()
  }

  return (
    <Modal title="Rinomina canale" icon={<Pencil className="w-4 h-4" />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <InputRow prefix={<span className="text-text-secondary text-sm">#</span>}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white focus:outline-none" />
        </InputRow>
        <ModalButtons onClose={onClose} loading={saving} label="Salva" />
      </form>
    </Modal>
  )
}

// ─── Shared modal shell ───────────────────────────────────────────────────────

function Modal({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
          <div className="flex items-center gap-2">{icon}<h2 className="text-sm font-bold text-white">{title}</h2></div>
          <button onClick={onClose}><X className="w-4 h-4 text-text-secondary hover:text-white" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function InputRow({ prefix, children }: { prefix: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2.5 focus-within:border-gold/40 transition-colors">
      {prefix}{children}
    </div>
  )
}

function ModalButtons({ onClose, loading, label = 'Crea' }: { onClose: () => void; loading: boolean; label?: string }) {
  return (
    <div className="flex gap-3 mt-2">
      <button type="button" onClick={onClose} className="flex-1 py-2 border border-[#2A2A2A] rounded-xl text-sm text-text-secondary hover:text-white transition-colors">Annulla</button>
      <button type="submit" disabled={loading} className="flex-1 py-2 bg-gold text-black font-bold rounded-xl text-sm hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-1.5">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {label}
      </button>
    </div>
  )
}

// ─── Channel context menu ─────────────────────────────────────────────────────

function ChannelMenu({ channel, onClose, onRename, onArchive, onDelete }: {
  channel: ChatChannel; onClose: () => void
  onRename: () => void
  onArchive: (v: boolean) => void; onDelete: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  const archive = async () => {
    setBusy(true)
    const val = !channel.is_archived
    await createClient().from('chat_channels').update({ is_archived: val, is_read_only: val }).eq('id', channel.id)
    setBusy(false); onArchive(val); toast.success(val ? 'Archiviato' : 'Riattivato'); onClose()
  }

  const del = async () => {
    if (!confirm(`Eliminare definitivamente #${channel.name}?`)) return
    await createClient().from('chat_channels').delete().eq('id', channel.id)
    toast.success('Eliminato'); onDelete(); onClose()
  }

  return (
    <div ref={ref} className="absolute right-0 top-6 w-48 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl shadow-2xl z-50 py-1 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[#2A2A2A] mb-1">
        <p className="text-[9px] text-text-secondary uppercase tracking-wider font-bold flex items-center gap-1">
          <Shield className="w-2.5 h-2.5 text-gold" /> Admin · #{channel.name}
        </p>
      </div>
      <Item icon={<Pencil className="w-3 h-3" />} label="Rinomina" onClick={() => { onRename(); onClose() }} />
      <Item icon={busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
        label={channel.is_archived ? 'Riattiva' : 'Archivia'}
        onClick={archive}
        className={channel.is_archived ? 'text-blue-400' : ''} />
      <div className="h-px bg-[#2A2A2A] my-1" />
      <Item icon={<Trash2 className="w-3 h-3" />} label="Elimina" onClick={del} className="text-error hover:bg-error/10" />
    </div>
  )
}

function Item({ icon, label, onClick, className = '' }: { icon: React.ReactNode; label: string; onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[#2A2A2A] transition-colors text-left ${className || 'text-white'}`}>
      <span className="text-text-secondary">{icon}</span>{label}
    </button>
  )
}

// ─── Channel row (within client group or general) ─────────────────────────────

function ChannelRow({ channel, active, onClick, isAdmin, first, last, onMoveUp, onMoveDown,
  onRename, onArchive, onDelete, indent, unread,
  onDragStart, onDragOver, onDrop }: {
  channel: ChatChannel; active: boolean; onClick: () => void
  isAdmin: boolean; first: boolean; last: boolean
  onMoveUp: () => void; onMoveDown: () => void
  onRename: () => void
  onArchive: (v: boolean) => void; onDelete: () => void
  indent?: boolean; unread?: number
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const isCC = channel.type === 'customer_care' || channel.type === 'cliente'
  const isInternal = channel.type === 'cliente_interno' || channel.type === 'interno'
  const label = channelDisplayName(channel)
  const hasUnread = typeof unread === 'number' && unread > 0 && !active

  return (
    <div
      draggable={isAdmin}
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true); onDragOver?.(e) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => { setIsDragOver(false); onDrop?.(e) }}
      className={`relative flex items-center rounded-lg transition-colors cursor-grab active:cursor-grabbing
        ${active ? 'bg-white/10' : isDragOver ? 'bg-gold/10 border border-gold/30' : 'hover:bg-white/5'} group`}>
      <button onClick={onClick}
        className={`flex-1 flex items-center gap-2 py-1 text-xs text-left truncate transition-colors
          ${indent ? 'pl-6 pr-2' : 'px-3'}
          ${active ? 'text-white font-semibold' : hasUnread ? 'text-white font-bold' : 'text-[#8B8B8B] hover:text-white'}`}>
        {isCC
          ? <Headphones className={`w-3 h-3 shrink-0 ${hasUnread ? 'text-gold' : 'text-[#8B8B8B]'}`} />
          : isInternal
            ? <Lock className={`w-3 h-3 shrink-0 ${hasUnread ? 'text-gold' : 'text-[#8B8B8B]'}`} />
            : <span className="text-[#8B8B8B] text-xs shrink-0">#</span>}
        <span className="truncate">{label}</span>
        {channel.is_archived && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
      </button>

      {/* Badge unread — solo quando > 0, nascosto su hover admin */}
      {hasUnread && !showMenu && (
        <span className={`text-[9px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full mr-1 shrink-0 min-w-[18px] text-center leading-none
          ${isAdmin ? 'group-hover:hidden' : ''}`}>
          {unread! > 99 ? '99+' : unread}
        </span>
      )}

      {/* Admin controls: ··· sempre visibile, frecce solo su hover */}
      {isAdmin && (
        <div className="flex items-center pr-1 shrink-0 gap-0.5">
          <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
            <button disabled={first} onClick={e => { e.stopPropagation(); onMoveUp() }}
              className="p-0.5 text-[#555] hover:text-white disabled:opacity-20 transition-colors">
              <ChevronUp className="w-2.5 h-2.5" />
            </button>
            <button disabled={last} onClick={e => { e.stopPropagation(); onMoveDown() }}
              className="p-0.5 text-[#555] hover:text-white disabled:opacity-20 transition-colors">
              <ChevronDown className="w-2.5 h-2.5" />
            </button>
          </div>
          <button onClick={e => { e.stopPropagation(); setShowMenu(v => !v) }}
            className={`p-1 rounded transition-colors ${showMenu ? 'text-gold bg-gold/10' : 'text-[#444] hover:text-white hover:bg-white/5'}`}>
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showMenu && (
        <ChannelMenu channel={channel}
          onClose={() => setShowMenu(false)}
          onRename={onRename} onArchive={onArchive} onDelete={onDelete} />
      )}
    </div>
  )
}

// ─── Client group ─────────────────────────────────────────────────────────────

function ClientGroup({ clientId, client, groupLabel, groupSublabel, groupClientId, channels, activeId, onSelect, isAdmin,
  onRename, onArchive, onDelete, onReorder, unreadCounts }: {
  clientId: string; client?: Client
  groupLabel?: string; groupSublabel?: string; groupClientId?: string
  channels: ChatChannel[]; activeId?: string
  onSelect: (ch: ChatChannel) => void; isAdmin: boolean
  onRename: (ch: ChatChannel) => void
  onArchive: (ch: ChatChannel, v: boolean) => void; onDelete: (id: string) => void
  onReorder: (channelId: string, direction: 'up' | 'down') => void
  unreadCounts: Record<string, number>
}) {
  const [collapsed, setCollapsed] = useState(false)
  const isPerso = client?.client_label === 'perso'
  const sorted = [...channels].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const totalUnread = channels.reduce((sum, ch) => sum + (unreadCounts[ch.id] ?? 0), 0)
  const displayLabel = groupLabel ?? client?.company_name ?? clientId
  const displaySublabel = groupSublabel
  const navClientId = groupClientId ?? (client ? clientId : undefined)

  return (
    <div className="mb-0.5">
      <div className="flex items-center gap-1 px-2 py-0.5 cursor-pointer group/cg rounded-lg hover:bg-white/[0.02] transition-colors"
        onClick={() => setCollapsed(v => !v)}>
        {collapsed ? <ChevronRight className="w-2.5 h-2.5 text-[#555] shrink-0" /> : <ChevronDown className="w-2.5 h-2.5 text-[#555] shrink-0" />}
        <div className="flex-1 min-w-0">
          <span className={`block text-xs truncate ${totalUnread > 0 ? 'font-bold text-white' : 'font-semibold text-[#9B9B9B]'}`}>
            {displayLabel}
          </span>
          {displaySublabel && (
            <span className="block text-[9px] text-[#555] truncate leading-none mt-0.5">{displaySublabel}</span>
          )}
        </div>
        {totalUnread > 0 && collapsed && (
          <span className="text-[9px] font-bold bg-gold text-black px-1.5 py-0.5 rounded-full shrink-0 min-w-[18px] text-center leading-none">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
        {isPerso && <span className="text-[9px] text-error bg-error/10 px-1 py-0.5 rounded shrink-0">perso</span>}
        {navClientId && (
          <Link href={`/clienti/${navClientId}`} onClick={e => e.stopPropagation()}
            className="opacity-0 group-hover/cg:opacity-100 p-0.5 text-[#555] hover:text-gold transition-all shrink-0">
            <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        )}
      </div>

      {!collapsed && (
        <div className="space-y-0.5">
          {sorted.map((ch, i) => (
            <ChannelRow key={ch.id} channel={ch} active={activeId === ch.id}
              onClick={() => onSelect(ch)} isAdmin={isAdmin}
              first={i === 0} last={i === sorted.length - 1}
              onMoveUp={() => onReorder(ch.id, 'up')}
              onMoveDown={() => onReorder(ch.id, 'down')}
              onRename={() => onRename(ch)}
              onArchive={v => onArchive(ch, v)} onDelete={() => onDelete(ch.id)}
              indent={true} unread={unreadCounts[ch.id]} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sidebar section wrapper ──────────────────────────────────────────────────

function Section({ label, icon, onAdd, defaultCollapsed = false, children }: {
  label: string; icon: React.ReactNode; onAdd?: () => void
  defaultCollapsed?: boolean; children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1 px-2 py-1 cursor-pointer group/sec" onClick={() => setCollapsed(v => !v)}>
        {collapsed ? <ChevronRight className="w-2.5 h-2.5 text-[#555]" /> : <ChevronDown className="w-2.5 h-2.5 text-[#555]" />}
        <span className="flex items-center gap-1 text-[10px] font-bold text-[#555] uppercase tracking-widest flex-1">{icon}{label}</span>
        {onAdd && (
          <button onClick={e => { e.stopPropagation(); onAdd() }}
            className="opacity-0 group-hover/sec:opacity-100 transition-opacity text-[#555] hover:text-white p-0.5">
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
      {!collapsed && <div className="space-y-0.5">{children}</div>}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ChatLayout({ channels: initialChannels, currentProfile, allProfiles, clients, projects = [], initialChannelId, unreadCounts: initialUnread = {} }: Props) {
  const [channels, setChannels] = useState(initialChannels)
  const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(
    initialChannels.find(c => c.id === initialChannelId) ??
    initialChannels.filter(c => !c.is_archived && c.type === 'interno')[0] ?? null
  )
  const [showNewTeam, setShowNewTeam] = useState(false)
  const [renameTarget, setRenameTarget] = useState<ChatChannel | null>(null)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(initialUnread)
  const isAdmin = isSuperAdmin(currentProfile)

  useEffect(() => {
    if (initialChannelId) {
      const found = channels.find(c => c.id === initialChannelId)
      if (found) setActiveChannel(found)
    }
  }, [initialChannelId])

  // Realtime: aggiorna unread quando arriva un messaggio su canali non attivi
  useEffect(() => {
    const sb = createClient()
    const sub = sb.channel('global-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        const chId = payload.new.channel_id as string
        const senderId = payload.new.sender_id as string
        if (senderId === currentProfile.id) return
        if (activeChannel?.id === chId) return
        setUnreadCounts(prev => ({ ...prev, [chId]: (prev[chId] ?? 0) + 1 }))
        // Aggiorna last_message_at localmente
        setChannels(prev => prev.map(c => c.id === chId ? { ...c, last_message_at: payload.new.created_at } : c))
      })
      .subscribe()
    return () => { sb.removeChannel(sub) }
  }, [currentProfile.id, activeChannel?.id])

  // Quando cambio canale attivo → mark as read
  const selectChannel = (ch: ChatChannel) => {
    setActiveChannel(ch)
    setUnreadCounts(prev => { const n = { ...prev }; delete n[ch.id]; return n })
    createClient().from('channel_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', ch.id).eq('profile_id', currentProfile.id)
  }

  // Suddivisione
  const teamChannels = channels
    .filter(c => c.type === 'interno' && !c.client_id && !c.is_archived)
    .sort((a, b) => {
      const aU = unreadCounts[a.id] ?? 0; const bU = unreadCounts[b.id] ?? 0
      if (aU !== bU) return bU - aU // unread prima
      return new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
    })
  const clientChannels = channels.filter(c =>
    ['customer_care', 'cliente', 'cliente_interno'].includes(c.type) && !c.is_archived)
  const archivedChannels = channels.filter(c => c.is_archived)

  // Mappa progetti e clienti
  const clientMap: Record<string, Client> = {}
  clients.forEach(c => { clientMap[c.id] = c })
  const projectMap: Record<string, ProjectInfo> = {}
  projects.forEach(p => { projectMap[p.id] = p })

  // Raggruppa per project_id se disponibile, altrimenti per client_id
  // La chiave è "p:{project_id}" oppure "c:{client_id}"
  const projectGroups: Record<string, ChatChannel[]> = {}
  clientChannels.forEach(ch => {
    const key = ch.project_id ? `p:${ch.project_id}` : ch.client_id ? `c:${ch.client_id}` : null
    if (!key) return
    if (!projectGroups[key]) projectGroups[key] = []
    projectGroups[key].push(ch)
  })

  const archivedGroups: { groupKey: string; channels: ChatChannel[] }[] = []
  const archivedGeneral: ChatChannel[] = []
  const tmpGroups: Record<string, ChatChannel[]> = {}
  archivedChannels.forEach(ch => {
    const key = ch.project_id ? `p:${ch.project_id}` : ch.client_id ? `c:${ch.client_id}` : null
    if (key) {
      if (!tmpGroups[key]) tmpGroups[key] = []
      tmpGroups[key].push(ch)
    } else {
      archivedGeneral.push(ch)
    }
  })
  Object.entries(tmpGroups).forEach(([key, chs]) => archivedGroups.push({ groupKey: key, channels: chs }))

  const existingClientIds = Object.keys(projectGroups).filter(k => k.startsWith('c:')).map(k => k.slice(2))

  // Mutazioni
  const mutate = (id: string, patch: Partial<ChatChannel>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    if (activeChannel?.id === id) setActiveChannel(p => p ? { ...p, ...patch } : null)
  }

  const handleCreateSingle = (ch: ChatChannel) => {
    setChannels(prev => [...prev, ch])
    setActiveChannel(ch)
    setShowNewTeam(false)
  }

  const handleReorder = async (channelId: string, direction: 'up' | 'down') => {
    const ch = channels.find(c => c.id === channelId)
    if (!ch) return
    const siblings = channels
      .filter(c => c.client_id === ch.client_id && !c.is_archived)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    const idx = siblings.findIndex(c => c.id === channelId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= siblings.length) return
    const swapCh = siblings[swapIdx]
    const newPos = swapCh.position ?? swapIdx
    const oldPos = ch.position ?? idx
    const sb = createClient()
    await Promise.all([
      sb.from('chat_channels').update({ position: newPos }).eq('id', channelId),
      sb.from('chat_channels').update({ position: oldPos }).eq('id', swapCh.id),
    ])
    mutate(channelId, { position: newPos })
    mutate(swapCh.id, { position: oldPos })
  }

  const handleRename = (id: string, name: string) => mutate(id, { name })
  const handleArchive = (ch: ChatChannel, val: boolean) => mutate(ch.id, { is_archived: val, is_read_only: val })
  const handleDelete = (id: string) => {
    setChannels(prev => prev.filter(c => c.id !== id))
    if (activeChannel?.id === id) {
      setActiveChannel(channels.filter(c => !c.is_archived && c.id !== id)[0] ?? null)
    }
  }

  const getGroupInfo = (key: string) => {
    if (key.startsWith('p:')) {
      const p = projectMap[key.slice(2)]
      if (p) return { label: p.name, sublabel: p.client?.company_name, clientId: p.client_id, client: clientMap[p.client_id] }
    }
    if (key.startsWith('c:')) {
      const c = clientMap[key.slice(2)]
      if (c) return { label: c.company_name, sublabel: undefined, clientId: c.id, client: c }
    }
    return { label: key, sublabel: undefined, clientId: undefined, client: undefined }
  }

  const activeClient = activeChannel?.client_id ? clientMap[activeChannel.client_id] : null
  const isActivePerso = activeClient?.client_label === 'perso'
  const isActiveArchived = activeChannel?.is_archived ?? false

  const sharedHandlers = {
    isAdmin,
    onRename: setRenameTarget,
    onArchive: handleArchive,
    onDelete: handleDelete,
    onReorder: handleReorder,
    unreadCounts,
  }

  return (
    <div className="flex h-full bg-[#0F0F0F]">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-56 bg-[#111] border-r border-[#1E1E1E] flex flex-col shrink-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#1E1E1E]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-white leading-none">two bee<span className="text-gold">.</span></p>
              <p className="text-[10px] text-[#555] mt-0.5">Chat</p>
            </div>
            {isAdmin && (
              <button onClick={() => setShowNewTeam(true)}
                className="w-6 h-6 flex items-center justify-center text-[#555] hover:text-white hover:bg-[#2A2A2A] rounded-lg transition-colors" title="Nuovo canale team">
                <Lock className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-1.5">

          {/* Team */}
          <Section label="Team" icon={<Users className="w-2.5 h-2.5" />}
            onAdd={isAdmin ? () => setShowNewTeam(true) : undefined}>
            {teamChannels.length === 0
              ? <p className="text-[10px] text-[#555] px-3 py-1 italic">Nessun canale</p>
              : teamChannels.map((ch, i) => (
                <ChannelRow key={ch.id} channel={ch} active={activeChannel?.id === ch.id}
                  onClick={() => selectChannel(ch)} isAdmin={isAdmin}
                  first={i === 0} last={i === teamChannels.length - 1}
                  onMoveUp={() => handleReorder(ch.id, 'up')}
                  onMoveDown={() => handleReorder(ch.id, 'down')}
                  onRename={() => setRenameTarget(ch)}
                  onArchive={v => handleArchive(ch, v)} onDelete={() => handleDelete(ch.id)}
                  indent={false} unread={unreadCounts[ch.id]}
                  onDragStart={e => e.dataTransfer.setData('channelId', ch.id)} />
              ))}
          </Section>

          {/* Progetti / Clienti — ordinati per unread count poi last_message_at */}
          <Section label="Progetti" icon={<Headphones className="w-2.5 h-2.5" />}>
            {Object.keys(projectGroups).length === 0
              ? <p className="text-[10px] text-[#555] px-3 py-1 italic">Nessun progetto</p>
              : Object.entries(projectGroups)
                  .sort(([aKey, aChs], [bKey, bChs]) => {
                    const aU = aChs.reduce((s, c) => s + (unreadCounts[c.id] ?? 0), 0)
                    const bU = bChs.reduce((s, c) => s + (unreadCounts[c.id] ?? 0), 0)
                    if (aU !== bU) return bU - aU
                    const aLast = Math.max(...aChs.map(c => new Date(c.last_message_at ?? 0).getTime()))
                    const bLast = Math.max(...bChs.map(c => new Date(c.last_message_at ?? 0).getTime()))
                    if (aLast !== bLast) return bLast - aLast
                    return getGroupInfo(aKey).label.localeCompare(getGroupInfo(bKey).label)
                  })
                  .map(([key, chs]) => {
                    const info = getGroupInfo(key)
                    return (
                      <ClientGroup key={key} clientId={info.clientId ?? key}
                        client={info.client}
                        groupLabel={info.label} groupSublabel={info.sublabel} groupClientId={info.clientId}
                        channels={chs} activeId={activeChannel?.id}
                        onSelect={selectChannel} {...sharedHandlers} />
                    )
                  })}
          </Section>

          {/* Archiviate */}
          {archivedChannels.length > 0 && (
            <Section label="Archiviate" icon={<Archive className="w-2.5 h-2.5" />} defaultCollapsed>
              {archivedGeneral.map((ch, i) => (
                <ChannelRow key={ch.id} channel={ch} active={activeChannel?.id === ch.id}
                  onClick={() => selectChannel(ch)} isAdmin={isAdmin}
                  first={i === 0} last={i === archivedGeneral.length - 1}
                  onMoveUp={() => {}} onMoveDown={() => {}}
                  onRename={() => setRenameTarget(ch)}
                  onArchive={v => handleArchive(ch, v)} onDelete={() => handleDelete(ch.id)}
                  indent={false} />
              ))}
              {archivedGroups.map(({ groupKey, channels: chs }) => {
                const info = getGroupInfo(groupKey)
                return (
                  <ClientGroup key={groupKey} clientId={info.clientId ?? groupKey}
                    client={info.client}
                    groupLabel={info.label} groupSublabel={info.sublabel} groupClientId={info.clientId}
                    channels={chs} activeId={activeChannel?.id}
                    onSelect={selectChannel} {...sharedHandlers} />
                )
              })}
            </Section>
          )}
        </div>

        {/* User footer */}
        <div className="border-t border-[#1E1E1E] px-3 py-2.5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold text-[10px] font-bold overflow-hidden shrink-0">
            {currentProfile.avatar_url
              ? <img src={currentProfile.avatar_url} className="w-full h-full object-cover" alt="" />
              : (currentProfile.full_name || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{currentProfile.full_name}</p>
            <p className="text-[10px] text-[#555] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" /> Attivo
              {isAdmin && <span className="ml-1 text-gold font-semibold">· Super Admin</span>}
            </p>
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeChannel ? (
          <SlackChat
            key={activeChannel.id}
            channelId={activeChannel.id}
            channelName={activeChannel.name}
            channelType={activeChannel.type as 'interno' | 'cliente' | 'customer_care' | 'task' | 'cliente_interno'}
            channelLabel={(() => {
              const activeProject = activeChannel.project_id ? projectMap[activeChannel.project_id] : null
              const contextLabel = activeProject
                ? `${activeProject.name} (${activeProject.client?.company_name ?? activeClient?.company_name ?? ''})`
                : activeClient?.company_name ?? ''
              if (activeChannel.type === 'customer_care' || activeChannel.type === 'cliente')
                return `${contextLabel} · Customer Care`
              if (activeChannel.type === 'cliente_interno')
                return `${contextLabel} · Interno team`
              return 'Canale team'
            })()}
            currentProfile={currentProfile}
            allProfiles={allProfiles}
            isAdmin={isAdmin}
            isArchived={isActivePerso || isActiveArchived}
            isReadOnly={(isActivePerso || isActiveArchived) && !isAdmin}
            clientId={activeChannel.client_id ?? undefined}
            onArchiveToggle={val => handleArchive(activeChannel, val)}
            headerExtra={
              activeChannel.client_id ? (
                <Link href={`/clienti/${activeChannel.client_id}`}
                  className="text-[10px] text-text-secondary hover:text-gold transition-colors flex items-center gap-1 ml-1">
                  <ExternalLink className="w-3 h-3" /> vai al cliente
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-2xl">💬</div>
            <div>
              <p className="text-white font-bold mb-1">Seleziona un canale</p>
              <p className="text-text-secondary text-sm">Scegli un progetto dalla sidebar.</p>
            </div>
            {isAdmin && (
              <button onClick={() => setShowNewTeam(true)}
                className="flex items-center gap-2 px-4 py-2 border border-[#2A2A2A] text-text-secondary text-sm rounded-xl hover:text-white hover:border-[#3A3A3A] transition-colors">
                <Lock className="w-4 h-4" /> Nuovo canale team
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modali */}
      {showNewTeam && <NewTeamChannelModal onClose={() => setShowNewTeam(false)} onCreate={handleCreateSingle} currentProfileId={currentProfile.id} allProfiles={allProfiles} />}
      {renameTarget && <RenameModal channel={renameTarget} onClose={() => setRenameTarget(null)} onRename={handleRename} />}
    </div>
  )
}
