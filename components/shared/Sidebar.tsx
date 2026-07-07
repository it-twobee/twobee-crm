'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, MessageSquare,
  BarChart3, FolderOpen, Settings, ChevronRight, ChevronLeft, ChevronDown,
  CheckCircle2, FolderKanban, Briefcase, CalendarDays, Receipt, Headphones, Crown,
  ShoppingCart, Ticket, UserCircle2, Target, History, FlaskConical,
  Layers, Eye, Euro,
} from 'lucide-react'
import { useState, useCallback } from 'react'
import { usePermissions } from '@/lib/hooks/usePermissions'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

interface NavItem {
  href: string
  icon: typeof LayoutDashboard
  label: string
  superAdminOnly?: boolean
  adminOnly?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

const sections: NavSection[] = [
  {
    label: 'Dashboard',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    label: 'Lavori',
    items: [
      { href: '/le-mie-attivita', icon: CheckCircle2, label: 'Le mie attività' },
      { href: '/calendario', icon: CalendarDays, label: 'Calendario' },
      { href: '/chat', icon: MessageSquare, label: 'Chat' },
      { href: '/progetti', icon: FolderKanban, label: 'Progetti' },
      { href: '/portfolio', icon: Briefcase, label: 'Portfolio' },
      { href: '/documenti', icon: FolderOpen, label: 'Documenti' },
    ],
  },
  {
    label: 'Clienti',
    items: [
      { href: '/clienti', icon: Users, label: 'Clienti' },
      { href: '/customer-care', icon: Headphones, label: 'Customer Care' },
      { href: '/customer-care/tickets', icon: Ticket, label: 'Ticket' },
      { href: '/portale-cliente', icon: Eye, label: 'Portale Cliente', superAdminOnly: true },
    ],
  },
  {
    label: 'Commerciale',
    items: [
      { href: '/commerciale', icon: ShoppingCart, label: 'Commerciale' },
    ],
  },
  {
    label: 'Finanziario',
    items: [
      { href: '/fatturazione', icon: Receipt, label: 'Fatturazione' },
      { href: '/soldi/costi-risorse', icon: Euro, label: 'Costi risorse', adminOnly: true },
    ],
  },
  {
    label: 'Team',
    items: [
      { href: '/hr', icon: UserCircle2, label: 'HR & Team' },
      { href: '/reparti/growth',    icon: Layers, label: 'Growth' },
      { href: '/reparti/marketing', icon: Layers, label: 'Marketing' },
      { href: '/reparti/digital',   icon: Layers, label: 'Digital' },
      { href: '/reparti/ai',        icon: Layers, label: 'AI' },
    ],
  },
  {
    label: 'Direzione',
    items: [
      { href: '/strategia', icon: Target, label: 'Strategia & OKR' },
      { href: '/twobee-os', icon: FlaskConical, label: 'TwoBee OS', superAdminOnly: true },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/impostazioni/cronologia', icon: History, label: 'Cronologia', adminOnly: true },
      { href: '/impostazioni', icon: Settings, label: 'Impostazioni', adminOnly: true },
    ],
  },
]

const STORAGE_KEY = 'twobee-sidebar-collapsed-sections'

function getInitialCollapsed(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch { return {} }
}

export function Sidebar() {
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(getInitialCollapsed)
  const { profile } = usePermissions()
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '')
  const isAdmin = isSuperAdmin || profile?.app_role === 'admin'

  const toggleSection = useCallback((label: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [label]: !prev[label] }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const isItemVisible = (item: NavItem) => {
    if (item.superAdminOnly && !isSuperAdmin) return false
    if (item.adminOnly && !isAdmin) return false
    return true
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-screen sticky top-0 transition-all duration-200 shrink-0',
        'bg-[rgba(255,255,255,0.02)] backdrop-blur-xl border-r border-white/[0.06]',
        sidebarCollapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-white/[0.06]">
        {!sidebarCollapsed ? (
          <Link href="/dashboard" className="text-lg font-black font-heading tracking-tight">
            <span className="text-white">two bee</span>
            <span className="text-gold">.</span>
          </Link>
        ) : (
          <Link href="/dashboard" className="text-lg font-black mx-auto">
            <span className="text-gold">.</span>
          </Link>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 overflow-y-auto space-y-0.5">
        {sections.map((section) => {
          const visibleItems = section.items.filter(isItemVisible)
          if (visibleItems.length === 0) return null

          const isSectionCollapsed = collapsedSections[section.label] ?? false
          const hasActiveChild = visibleItems.some(item =>
            pathname === item.href || (pathname.startsWith(item.href + '/') && !visibleItems.some(other => other.href !== item.href && pathname.startsWith(other.href)))
          )

          return (
            <div key={section.label}>
              {!sidebarCollapsed ? (
                <button
                  onClick={() => toggleSection(section.label)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors',
                    hasActiveChild && isSectionCollapsed
                      ? 'text-gold'
                      : 'text-white/30 hover:text-white/50'
                  )}
                >
                  <span>{section.label}</span>
                  {isSectionCollapsed
                    ? <ChevronRight className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3 opacity-40" />
                  }
                </button>
              ) : (
                <div className="h-px bg-white/[0.04] mx-2 my-2" />
              )}

              {!isSectionCollapsed && (
                <div className="space-y-px">
                  {visibleItems.map((item) => {
                    const isActive = pathname === item.href || (pathname.startsWith(item.href + '/') && !visibleItems.some(other => other.href !== item.href && pathname.startsWith(other.href)))
                    const isGod = item.href === '/impostazioni' && isSuperAdmin
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] transition-all duration-150 group',
                          isActive
                            ? 'bg-gold/[0.08] text-gold font-medium'
                            : 'text-white/50 hover:text-white/80 hover:bg-white/[0.03]'
                        )}
                      >
                        <item.icon className={cn('w-[18px] h-[18px] shrink-0', isActive ? 'text-gold' : 'text-white/30 group-hover:text-white/50')} />
                        {!sidebarCollapsed && (
                          <span className="truncate flex-1">{item.label}</span>
                        )}
                        {!sidebarCollapsed && isGod && <Crown className="w-3 h-3 text-gold shrink-0" />}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* User mini profile */}
      {profile && !sidebarCollapsed && (
        <div className="border-t border-white/[0.06] px-3 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-xs font-bold text-gold shrink-0">
              {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" /> : (profile.full_name || profile.email)[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="text-xs font-medium text-white/80 truncate">{profile.full_name}</p>
                {SUPER_ADMIN_EMAILS.includes(profile.email) && <Crown className="w-3 h-3 text-gold shrink-0" />}
              </div>
              <p className="text-[10px] text-white/30 capitalize">{SUPER_ADMIN_EMAILS.includes(profile.email) ? 'super admin' : (profile.app_role?.replace('_', ' ') ?? profile.role)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="flex items-center justify-center h-10 border-t border-white/[0.06] text-white/20 hover:text-white/50 transition-colors"
      >
        {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  )
}
