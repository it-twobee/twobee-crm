'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bell, LogOut, User, Settings, ChevronDown, Crown, CheckCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { GlobalSearch } from '@/components/shared/GlobalSearch'
import { getInitials } from '@/lib/utils'
import type { Profile, Notification } from '@/lib/types/database'
import { SUPER_ADMIN_EMAILS, ROLE_LABELS } from '@/lib/permissions'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

interface HeaderProps { profile: Profile | null }

const NOTIF_ICONS: Record<string, string> = {
  task_assigned: '✅', task_due: '⏰', mention: '💬',
  approval_request: '🔔', approval_resolved: '✓', invite: '✉️', new_lead: '🎯',
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'adesso'
  if (m < 60) return `${m}m fa`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h fa`
  return `${Math.floor(h / 24)}g fa`
}

export function Header({ profile }: HeaderProps) {
  const router = useRouter()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const notifRef = useRef<HTMLDivElement>(null)
  const isGod = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '')

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!profile) return
    const supabase = createClient()

    const fetchNotifs = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(30)
      setNotifications((data ?? []) as Notification[])
    }

    fetchNotifs()

    const channel = supabase
      .channel('notif-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const n = payload.new as Notification
          setNotifications((p) => [n, ...p])
          toast(n.title, { description: n.body ?? undefined, icon: NOTIF_ICONS[n.type] ?? '🔔' })
        })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markAllRead = async () => {
    if (!profile) return
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false)
    setNotifications((p) => p.map((n) => ({ ...n, read: true })))
  }

  const markRead = async (id: string) => {
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications((p) => p.filter((n) => n.id !== id))
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-14 bg-surface backdrop-blur-xl border-b border-border flex items-center px-6 gap-4 sticky top-0 z-40">
      <div className="flex-1 max-w-md">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <ThemeToggle collapsed />

        {/* Notifications bell */}
        <div className="relative" ref={notifRef}>
          <button onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 text-text-tertiary hover:text-text-secondary transition-colors rounded-xl hover:bg-surface-hover">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-gold text-black text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl shadow-2xl z-50 overflow-hidden bg-surface backdrop-blur-2xl border border-border-strong">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-bold text-text-primary font-heading">Notifiche</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-text-tertiary hover:text-gold">
                    <CheckCheck className="w-3.5 h-3.5" /> Segna tutte lette
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-text-tertiary text-sm">Nessuna notifica</div>
                ) : (
                  notifications.map((n) => (
                    <button key={n.id} onClick={() => { markRead(n.id); if (n.link) router.push(n.link); setNotifOpen(false) }}
                      className={`w-full flex items-start gap-3 px-4 py-3 border-b border-border text-left hover:bg-surface-hover transition-colors ${!n.read ? 'bg-gold-dim' : ''}`}>
                      <span className="text-base shrink-0 mt-0.5">{NOTIF_ICONS[n.type] ?? '🔔'}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs ${!n.read ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>{n.title}</p>
                        {n.body && <p className="text-[11px] text-text-tertiary mt-0.5 truncate">{n.body}</p>}
                        <p className="text-[10px] text-text-tertiary mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.read && <div className="w-2 h-2 rounded-full bg-gold shrink-0 mt-1.5" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User dropdown */}
        <div className="relative">
          <button onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 p-1 rounded-xl hover:bg-surface-hover transition-colors">
            <div className="w-8 h-8 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-gold text-xs font-bold">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                : profile ? getInitials(profile.full_name) : 'U'}
            </div>
            {profile && (
              <div className="hidden sm:block text-left">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-text-secondary leading-tight">{profile.full_name.split(' ')[0]}</span>
                  {isGod && <Crown className="w-3 h-3 text-gold" />}
                </div>
                <p className="text-[10px] text-text-tertiary leading-tight capitalize">{SUPER_ADMIN_EMAILS.includes(profile.email) ? 'super admin' : (profile.app_role?.replace('_', ' ') ?? profile.role)}</p>
              </div>
            )}
            <ChevronDown className="w-4 h-4 text-text-tertiary hidden sm:block" />
          </button>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl shadow-xl z-50 bg-surface backdrop-blur-2xl border border-border-strong">
                <div className="px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-sm font-semibold text-text-primary truncate">{profile?.full_name}</p>
                    {isGod && <Crown className="w-3.5 h-3.5 text-gold shrink-0" />}
                  </div>
                  <p className="text-xs text-text-tertiary truncate">{profile?.email}</p>
                  {profile && (
                    <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gold-dim text-gold">
                      {SUPER_ADMIN_EMAILS.includes(profile.email) ? '👑 Super Admin' : (ROLE_LABELS[profile.app_role] ?? profile.role)}
                    </span>
                  )}
                </div>
                <div className="p-1">
                  <Link href="/impostazioni/profilo" onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-xl transition-colors">
                    <User className="w-4 h-4" /> Il mio profilo
                  </Link>
                  {(isGod || profile?.app_role === 'admin') && (
                    <Link href="/impostazioni" onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-xl transition-colors">
                      <Settings className="w-4 h-4" /> Impostazioni
                    </Link>
                  )}
                  <button onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors">
                    <LogOut className="w-4 h-4" /> Esci
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
