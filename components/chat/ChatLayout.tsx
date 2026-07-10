'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Lock, Plus, X, Loader2, ExternalLink,
  ChevronDown, ChevronRight, Headphones, Search,
  MoreHorizontal, Pencil, Trash2, Archive,
  Shield, Check, Users, ChevronUp, AlertCircle,
  FolderKanban, UserPlus, Mail,
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
  project_kind: string | null
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

function toSlug(s: string) {
  return s.toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function channelDisplayName(ch: ChatChannel): string {
  if (ch.name.startsWith('cc-')) return 'Customer Care'
  if (ch.name.startsWith('team-')) return 'Chat Team'
  if (ch.type === 'customer_care') return 'Customer Care'
  if (ch.type === 'cliente_interno') return 'Chat Team'
  if (ch.type === 'cliente') return 'Customer Care'
  return ch.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  growth:    { label: 'G', cls: 'bg-gold/15 text-gold-text border-gold/25' },
  digital:   { label: 'D', cls: 'bg-info/15 text-info border-info/25' },
  marketing: { label: 'M', cls: 'bg-warning/15 text-warning border-warning/25' },
  ai:        { label: 'AI', cls: 'bg-accent/15 text-accent border-accent/25' },
}

// ─── Modal: nuovo canale team ────────────────────────────────────────────────

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
              className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none placeholder:text-text-secondary" />
            <span className="text-xs text-text-secondary shrink-0">{80 - name.length}</span>
          </InputRow>
          {name && slug !== name.trim() && <p className="text-2xs text-text-secondary mt-1">Slug: {slug}</p>}
          {name && !slug && <p className="text-2xs text-error mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />Nome non valido</p>}
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-2xs text-text-secondary">Passaggio 1 di 2</span>
          <button disabled={!slug} onClick={() => setStep(2)}
            className="px-5 py-2 bg-gold text-on-gold font-bold rounded-xl text-sm hover:bg-gold/90 disabled:opacity-30 transition-colors">
            Avanti
          </button>
        </div>
      </div>
    </Modal>
  )

  return (
    <Modal title="Aggiungi persone" icon={<Users className="w-4 h-4" />} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-text-secondary">Chi vuoi aggiungere a <span className="text-text-primary font-semibold">#{slug}</span>?</p>
        <InputRow prefix={<Search className="w-3.5 h-3.5 text-text-secondary shrink-0" />}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca persone…"
            className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none placeholder:text-text-secondary" />
        </InputRow>
        <div className="max-h-52 overflow-y-auto space-y-1">
          {others.map(p => {
            const sel = selectedIds.includes(p.id)
            return (
              <button key={p.id} onClick={() => toggle(p.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors text-left ${sel ? 'bg-gold/10 border border-gold/30' : 'hover:bg-surface-hover'}`}>
                <div className="w-7 h-7 rounded-full bg-gold/20 flex items-center justify-center text-gold-text text-2xs font-bold overflow-hidden shrink-0">
                  {p.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" alt="" /> : (p.full_name || '?')[0].toUpperCase()}
                </div>
                <span className="text-sm text-text-primary flex-1 truncate">{p.full_name}</span>
                {sel && <Check className="w-4 h-4 text-gold-text shrink-0" />}
              </button>
            )
          })}
          {others.length === 0 && <p className="text-xs text-text-secondary text-center py-4">Nessun risultato</p>}
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(1)} className="text-xs text-text-secondary hover:text-text-primary transition-colors">← Indietro</button>
            <span className="text-2xs text-text-secondary">Passaggio 2 di 2</span>
          </div>
          <button onClick={createChannel} disabled={loading}
            className="px-5 py-2 bg-gold text-on-gold font-bold rounded-xl text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {selectedIds.length > 0 ? `Crea con ${selectedIds.length + 1}` : 'Crea canale'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal: invita esterno ───────────────────────────────────────────────────

function InviteExternalModal({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    const sb = createClient()
    const { data: profile } = await sb.from('profiles').select('id').eq('email', email.trim()).maybeSingle()
    if (!profile) {
      toast.error('Nessun profilo trovato con questa email. L\'utente deve prima essere registrato.')
      setLoading(false)
      return
    }
    const { data: existing } = await sb.from('channel_members')
      .select('id').eq('channel_id', channelId).eq('profile_id', profile.id).maybeSingle()
    if (existing) {
      toast.info('Già membro di questo canale')
      setLoading(false)
      onClose()
      return
    }
    const { error } = await sb.from('channel_members').insert({ channel_id: channelId, profile_id: profile.id })
    setLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success(`${email} aggiunto al canale`)
    onClose()
  }

  return (
    <Modal title="Invita esterno" icon={<UserPlus className="w-4 h-4" />} onClose={onClose}>
      <form onSubmit={invite} className="space-y-4">
        <p className="text-xs text-text-secondary">Aggiungi un professionista, partner o collaboratore esterno tramite email.</p>
        <InputRow prefix={<Mail className="w-3.5 h-3.5 text-text-secondary shrink-0" />}>
          <input autoFocus type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="nome@azienda.it" required
            className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none placeholder:text-text-secondary" />
        </InputRow>
        <p className="text-2xs text-text-secondary">Max 10 esterni per progetto. L'utente deve avere un profilo registrato.</p>
        <ModalButtons onClose={onClose} loading={loading} label="Invita" />
      </form>
    </Modal>
  )
}

// ─── Modal: rinomina ─────────────────────────────────────────────────────────

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
    await createClient().from('chat_channels').update({ name: slug }).eq('id', channel.id)
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
            className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none" />
        </InputRow>
        <ModalButtons onClose={onClose} loading={saving} label="Salva" />
      </form>
    </Modal>
  )
}

// ─── Shared components ───────────────────────────────────────────────────────

function Modal({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">{icon}<h2 className="text-sm font-bold text-text-primary">{title}</h2></div>
          <button onClick={onClose}><X className="w-4 h-4 text-text-secondary hover:text-text-primary" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function InputRow({ prefix, children }: { prefix: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2.5 focus-within:border-gold/40 transition-colors">
      {prefix}{children}
    </div>
  )
}

function ModalButtons({ onClose, loading, label = 'Crea' }: { onClose: () => void; loading: boolean; label?: string }) {
  return (
    <div className="flex gap-3 mt-2">
      <button type="button" onClick={onClose} className="flex-1 py-2 border border-border rounded-xl text-sm text-text-secondary hover:text-text-primary transition-colors">Annulla</button>
      <button type="submit" disabled={loading} className="flex-1 py-2 bg-gold text-on-gold font-bold rounded-xl text-sm hover:bg-gold/90 disabled:opacity-50 flex items-center justify-center gap-1.5">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {label}
      </button>
    </div>
  )
}

// ─── Channel context menu ────────────────────────────────────────────────────

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
    <div ref={ref} className="absolute right-0 top-6 w-48 bg-surface border border-border rounded-xl shadow-2xl z-50 py-1 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-border mb-1">
        <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold flex items-center gap-1">
          <Shield className="w-2.5 h-2.5 text-gold-text" /> Admin · #{channel.name}
        </p>
      </div>
      <MenuItem icon={<Pencil className="w-3 h-3" />} label="Rinomina" onClick={() => { onRename(); onClose() }} />
      <MenuItem icon={busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
        label={channel.is_archived ? 'Riattiva' : 'Archivia'}
        onClick={archive}
        className={channel.is_archived ? 'text-info' : ''} />
      <div className="h-px bg-border my-1" />
      <MenuItem icon={<Trash2 className="w-3 h-3" />} label="Elimina" onClick={del} className="text-error hover:bg-error/10" />
    </div>
  )
}

function MenuItem({ icon, label, onClick, className = '' }: { icon: React.ReactNode; label: string; onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-hover transition-colors text-left ${className || 'text-text-primary'}`}>
      <span className="text-text-secondary">{icon}</span>{label}
    </button>
  )
}

// ─── Channel row ─────────────────────────────────────────────────────────────

function ChannelRow({ channel, active, onClick, isAdmin, onRename, onArchive, onDelete, indent, unread }: {
  channel: ChatChannel; active: boolean; onClick: () => void
  isAdmin: boolean
  onRename: () => void
  onArchive: (v: boolean) => void; onDelete: () => void
  indent?: boolean; unread?: number
}) {
  const [showMenu, setShowMenu] = useState(false)
  const isCC = channel.type === 'customer_care' || channel.type === 'cliente'
  const isInternal = channel.type === 'cliente_interno' || channel.type === 'interno'
  const label = channelDisplayName(channel)
  const hasUnread = typeof unread === 'number' && unread > 0 && !active

  return (
    <div className={`relative flex items-center rounded-lg transition-colors
      ${active ? 'bg-overlay/10' : 'hover:bg-overlay/5'} group`}>
      <button onClick={onClick}
        className={`flex-1 flex items-center gap-2 py-1.5 text-xs text-left truncate transition-colors
          ${indent ? 'pl-6 pr-2' : 'px-3'}
          ${active ? 'text-text-primary font-semibold' : hasUnread ? 'text-text-primary font-bold' : 'text-text-secondary hover:text-text-primary'}`}>
        {isCC
          ? <Headphones className={`w-3 h-3 shrink-0 ${hasUnread ? 'text-gold-text' : 'text-text-secondary'}`} />
          : isInternal
            ? <Lock className={`w-3 h-3 shrink-0 ${hasUnread ? 'text-gold-text' : 'text-text-secondary'}`} />
            : <span className="text-text-secondary text-xs shrink-0">#</span>}
        <span className="truncate">{label}</span>
        {channel.is_archived && <span className="w-1.5 h-1.5 rounded-full bg-info shrink-0" />}
      </button>

      {hasUnread && !showMenu && (
        <span className={`text-2xs font-bold bg-error text-text-primary px-1.5 py-0.5 rounded-full mr-1 shrink-0 min-w-[18px] text-center leading-none
          ${isAdmin ? 'group-hover:hidden' : ''}`}>
          {unread! > 99 ? '99+' : unread}
        </span>
      )}

      {isAdmin && (
        <div className="flex items-center pr-1 shrink-0">
          <button onClick={e => { e.stopPropagation(); setShowMenu(v => !v) }}
            className={`p-1 rounded transition-colors opacity-0 group-hover:opacity-100 ${showMenu ? 'text-gold-text bg-gold/10' : 'text-text-tertiary hover:text-text-primary hover:bg-overlay/5'}`}>
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

// ─── Project group ───────────────────────────────────────────────────────────

function ProjectGroup({ project, channels, activeId, onSelect, isAdmin, onRename, onArchive, onDelete, unreadCounts, onInviteExternal }: {
  project: ProjectInfo
  channels: ChatChannel[]; activeId?: string
  onSelect: (ch: ChatChannel) => void; isAdmin: boolean
  onRename: (ch: ChatChannel) => void
  onArchive: (ch: ChatChannel, v: boolean) => void; onDelete: (id: string) => void
  unreadCounts: Record<string, number>
  onInviteExternal: (channelId: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const sorted = [...channels].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const totalUnread = channels.reduce((sum, ch) => sum + (unreadCounts[ch.id] ?? 0), 0)
  const kind = project.project_kind
  const badge = kind ? KIND_BADGE[kind] : null
  const title = project.name.includes(' – ') ? project.name.split(' – ').slice(1).join(' – ') : project.name

  return (
    <div className="mb-0.5">
      <div className="flex items-center gap-1.5 px-2 py-1 cursor-pointer group/pg rounded-lg hover:bg-overlay/[0.02] transition-colors"
        onClick={() => setCollapsed(v => !v)}>
        {collapsed ? <ChevronRight className="w-2.5 h-2.5 text-text-secondary shrink-0" /> : <ChevronDown className="w-2.5 h-2.5 text-text-secondary shrink-0" />}
        {badge && (
          <span className={`text-[8px] font-bold px-1 py-0.5 rounded border shrink-0 ${badge.cls}`}>{badge.label}</span>
        )}
        <div className="flex-1 min-w-0">
          <span className={`block text-xs truncate ${totalUnread > 0 ? 'font-bold text-text-primary' : 'font-semibold text-text-secondary'}`}>
            {title}
          </span>
          {project.client && (
            <span className="block text-2xs text-text-secondary truncate leading-none mt-0.5">{project.client.company_name}</span>
          )}
        </div>
        {totalUnread > 0 && collapsed && (
          <span className="text-2xs font-bold bg-gold text-on-gold px-1.5 py-0.5 rounded-full shrink-0 min-w-[18px] text-center leading-none">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
        <Link href={`/clienti/${project.client_id}/progetto/${project.id}`} onClick={e => e.stopPropagation()}
          className="opacity-0 group-hover/pg:opacity-100 p-0.5 text-text-secondary hover:text-gold-text transition-all shrink-0">
          <ExternalLink className="w-2.5 h-2.5" />
        </Link>
      </div>

      {!collapsed && (
        <div className="space-y-0.5">
          {sorted.map(ch => (
            <ChannelRow key={ch.id} channel={ch} active={activeId === ch.id}
              onClick={() => onSelect(ch)} isAdmin={isAdmin}
              onRename={() => onRename(ch)}
              onArchive={v => onArchive(ch, v)} onDelete={() => onDelete(ch.id)}
              indent={true} unread={unreadCounts[ch.id]} />
          ))}
          {isAdmin && (
            <button onClick={() => {
              const ccChannel = sorted.find(c => c.type === 'customer_care')
              if (ccChannel) onInviteExternal(ccChannel.id)
              else toast.info('Nessun canale Customer Care trovato per questo progetto')
            }}
              className="flex items-center gap-1.5 pl-6 pr-2 py-1 text-2xs text-text-secondary hover:text-gold-text transition-colors w-full text-left">
              <UserPlus className="w-2.5 h-2.5" /> Invita esterno
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function SidebarSection({ label, icon, onAdd, defaultCollapsed = false, children }: {
  label: string; icon: React.ReactNode; onAdd?: () => void
  defaultCollapsed?: boolean; children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1 px-2 py-1 cursor-pointer group/sec" onClick={() => setCollapsed(v => !v)}>
        {collapsed ? <ChevronRight className="w-2.5 h-2.5 text-text-secondary" /> : <ChevronDown className="w-2.5 h-2.5 text-text-secondary" />}
        <span className="flex items-center gap-1 text-2xs font-bold text-text-secondary uppercase tracking-widest flex-1">{icon}{label}</span>
        {onAdd && (
          <button onClick={e => { e.stopPropagation(); onAdd() }}
            className="opacity-0 group-hover/sec:opacity-100 transition-opacity text-text-secondary hover:text-text-primary p-0.5">
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
      {!collapsed && <div className="space-y-0.5">{children}</div>}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function ChatLayout({ channels: initialChannels, currentProfile, allProfiles, clients, projects = [], initialChannelId, unreadCounts: initialUnread = {} }: Props) {
  const [channels, setChannels] = useState(initialChannels)
  const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(
    initialChannels.find(c => c.id === initialChannelId) ??
    initialChannels.filter(c => !c.is_archived)[0] ?? null
  )
  const [showNewTeam, setShowNewTeam] = useState(false)
  const [renameTarget, setRenameTarget] = useState<ChatChannel | null>(null)
  const [inviteChannelId, setInviteChannelId] = useState<string | null>(null)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(initialUnread)
  const [searchTerm, setSearchTerm] = useState('')
  const isAdmin = isSuperAdmin(currentProfile)

  useEffect(() => {
    if (initialChannelId) {
      const found = channels.find(c => c.id === initialChannelId)
      if (found) setActiveChannel(found)
    }
  }, [initialChannelId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sb = createClient()
    const sub = sb.channel('global-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        const chId = payload.new.channel_id as string
        const senderId = payload.new.sender_id as string
        if (senderId === currentProfile.id) return
        if (activeChannel?.id === chId) return
        setUnreadCounts(prev => ({ ...prev, [chId]: (prev[chId] ?? 0) + 1 }))
        setChannels(prev => prev.map(c => c.id === chId ? { ...c, last_message_at: payload.new.created_at } : c))
      })
      .subscribe()
    return () => { sb.removeChannel(sub) }
  }, [currentProfile.id, activeChannel?.id])

  const selectChannel = (ch: ChatChannel) => {
    setActiveChannel(ch)
    setUnreadCounts(prev => { const n = { ...prev }; delete n[ch.id]; return n })
    createClient().from('channel_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', ch.id).eq('profile_id', currentProfile.id)
  }

  // Group channels
  const teamChannels = channels
    .filter(c => c.type === 'interno' && !c.client_id && !c.project_id && !c.is_archived)
    .sort((a, b) => {
      const aU = unreadCounts[a.id] ?? 0; const bU = unreadCounts[b.id] ?? 0
      if (aU !== bU) return bU - aU
      return new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
    })

  const projectMap: Record<string, ProjectInfo> = {}
  projects.forEach(p => { projectMap[p.id] = p })
  const clientMap: Record<string, Client> = {}
  clients.forEach(c => { clientMap[c.id] = c })

  const projectChannels: Record<string, ChatChannel[]> = {}
  channels.filter(c => c.project_id && !c.is_archived).forEach(ch => {
    const pid = ch.project_id!
    if (!projectChannels[pid]) projectChannels[pid] = []
    projectChannels[pid].push(ch)
  })

  const archivedChannels = channels.filter(c => c.is_archived)

  // Search filter
  const matchesSearch = (text: string) => !searchTerm || text.toLowerCase().includes(searchTerm.toLowerCase())

  const filteredTeam = teamChannels.filter(c => matchesSearch(c.name))
  const filteredProjectIds = Object.keys(projectChannels).filter(pid => {
    const p = projectMap[pid]
    if (!p) return false
    return matchesSearch(p.name) || matchesSearch(p.client?.company_name ?? '')
  })

  // Mutations
  const mutate = (id: string, patch: Partial<ChatChannel>) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    if (activeChannel?.id === id) setActiveChannel(p => p ? { ...p, ...patch } : null)
  }
  const handleCreateSingle = (ch: ChatChannel) => {
    setChannels(prev => [...prev, ch])
    setActiveChannel(ch)
    setShowNewTeam(false)
  }
  const handleRename = (id: string, name: string) => mutate(id, { name })
  const handleArchive = (ch: ChatChannel, val: boolean) => mutate(ch.id, { is_archived: val, is_read_only: val })
  const handleDelete = (id: string) => {
    setChannels(prev => prev.filter(c => c.id !== id))
    if (activeChannel?.id === id) setActiveChannel(channels.filter(c => !c.is_archived && c.id !== id)[0] ?? null)
  }

  const activeClient = activeChannel?.client_id ? clientMap[activeChannel.client_id] : null
  const activeProject = activeChannel?.project_id ? projectMap[activeChannel.project_id] : null

  return (
    <div className="flex h-full bg-background">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-60 bg-surface border-r border-border flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-black text-text-primary leading-none">two bee<span className="text-gold-text">.</span></p>
              <p className="text-2xs text-text-secondary mt-0.5">Chat</p>
            </div>
            {isAdmin && (
              <button onClick={() => setShowNewTeam(true)}
                className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors" title="Nuovo canale team">
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-2.5 py-1.5">
            <Search className="w-3 h-3 text-text-secondary shrink-0" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Cerca progetto…"
              className="flex-1 bg-transparent text-xs text-text-primary focus:outline-none placeholder:text-text-tertiary" />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="text-text-secondary hover:text-text-primary"><X className="w-3 h-3" /></button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-1.5">
          {/* Team */}
          <SidebarSection label="Team" icon={<Users className="w-2.5 h-2.5" />}
            onAdd={isAdmin ? () => setShowNewTeam(true) : undefined}>
            {filteredTeam.length === 0
              ? <p className="text-2xs text-text-secondary px-3 py-1 italic">Nessun canale</p>
              : filteredTeam.map(ch => (
                <ChannelRow key={ch.id} channel={ch} active={activeChannel?.id === ch.id}
                  onClick={() => selectChannel(ch)} isAdmin={isAdmin}
                  onRename={() => setRenameTarget(ch)}
                  onArchive={v => handleArchive(ch, v)} onDelete={() => handleDelete(ch.id)}
                  indent={false} unread={unreadCounts[ch.id]} />
              ))}
          </SidebarSection>

          {/* Progetti attivi */}
          <SidebarSection label="Progetti attivi" icon={<FolderKanban className="w-2.5 h-2.5" />}>
            {filteredProjectIds.length === 0
              ? <p className="text-2xs text-text-secondary px-3 py-1 italic">Nessun progetto attivo</p>
              : filteredProjectIds
                  .sort((a, b) => {
                    const aU = (projectChannels[a] ?? []).reduce((s, c) => s + (unreadCounts[c.id] ?? 0), 0)
                    const bU = (projectChannels[b] ?? []).reduce((s, c) => s + (unreadCounts[c.id] ?? 0), 0)
                    if (aU !== bU) return bU - aU
                    const pA = projectMap[a], pB = projectMap[b]
                    return (pA?.name ?? '').localeCompare(pB?.name ?? '')
                  })
                  .map(pid => {
                    const proj = projectMap[pid]
                    if (!proj) return null
                    return (
                      <ProjectGroup key={pid} project={proj}
                        channels={projectChannels[pid]}
                        activeId={activeChannel?.id}
                        onSelect={selectChannel}
                        isAdmin={isAdmin}
                        onRename={setRenameTarget}
                        onArchive={handleArchive}
                        onDelete={handleDelete}
                        unreadCounts={unreadCounts}
                        onInviteExternal={setInviteChannelId} />
                    )
                  })}
          </SidebarSection>

          {/* Archiviate */}
          {archivedChannels.length > 0 && (
            <SidebarSection label={`Archiviate (${archivedChannels.length})`} icon={<Archive className="w-2.5 h-2.5" />} defaultCollapsed>
              {archivedChannels.map(ch => (
                <ChannelRow key={ch.id} channel={ch} active={activeChannel?.id === ch.id}
                  onClick={() => selectChannel(ch)} isAdmin={isAdmin}
                  onRename={() => setRenameTarget(ch)}
                  onArchive={v => handleArchive(ch, v)} onDelete={() => handleDelete(ch.id)}
                  indent={false} />
              ))}
            </SidebarSection>
          )}
        </div>

        {/* User footer */}
        <div className="border-t border-border px-3 py-2.5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-gold-text text-2xs font-bold overflow-hidden shrink-0">
            {currentProfile.avatar_url
              ? <img src={currentProfile.avatar_url} className="w-full h-full object-cover" alt="" />
              : (currentProfile.full_name || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-text-primary truncate">{currentProfile.full_name}</p>
            <p className="text-2xs text-text-secondary flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" /> Attivo
              {isAdmin && <span className="ml-1 text-gold-text font-semibold">· Super Admin</span>}
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
            isArchived={activeChannel.is_archived}
            isReadOnly={activeChannel.is_archived && !isAdmin}
            clientId={activeChannel.client_id ?? undefined}
            onArchiveToggle={val => handleArchive(activeChannel, val)}
            headerExtra={
              activeProject ? (
                <Link href={`/clienti/${activeProject.client_id}/progetto/${activeProject.id}`}
                  className="text-2xs text-text-secondary hover:text-gold-text transition-colors flex items-center gap-1 ml-1">
                  <ExternalLink className="w-3 h-3" /> vai al progetto
                </Link>
              ) : activeChannel.client_id ? (
                <Link href={`/clienti/${activeChannel.client_id}`}
                  className="text-2xs text-text-secondary hover:text-gold-text transition-colors flex items-center gap-1 ml-1">
                  <ExternalLink className="w-3 h-3" /> vai al cliente
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center text-2xl">💬</div>
            <div>
              <p className="text-text-primary font-bold mb-1">Seleziona un canale</p>
              <p className="text-text-secondary text-sm">Scegli un progetto dalla sidebar per iniziare a chattare.</p>
            </div>
            {isAdmin && (
              <button onClick={() => setShowNewTeam(true)}
                className="flex items-center gap-2 px-4 py-2 border border-border text-text-secondary text-sm rounded-xl hover:text-text-primary hover:border-border-strong transition-colors">
                <Plus className="w-4 h-4" /> Nuovo canale team
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modali */}
      {showNewTeam && <NewTeamChannelModal onClose={() => setShowNewTeam(false)} onCreate={handleCreateSingle} currentProfileId={currentProfile.id} allProfiles={allProfiles} />}
      {renameTarget && <RenameModal channel={renameTarget} onClose={() => setRenameTarget(null)} onRename={handleRename} />}
      {inviteChannelId && <InviteExternalModal channelId={inviteChannelId} onClose={() => setInviteChannelId(null)} />}
    </div>
  )
}
