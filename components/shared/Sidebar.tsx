'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, CheckSquare, MessageSquare,
  BarChart3, FolderOpen, Settings, ChevronRight, ChevronLeft,
  CheckCircle2, FolderKanban, Briefcase, CalendarDays, Receipt, Headphones, Crown,
  Wrench, ShoppingCart, Ticket, UserCircle2, Target, History, FlaskConical, Clock,
  Layers, Eye, Euro, LayoutGrid,
} from 'lucide-react'
import { useState } from 'react'
import { usePermissions } from '@/lib/hooks/usePermissions'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

// Macro-aree UX: Oggi · Clienti · Lavori · Vendite · Soldi · Team · Direzione.
// Solo regroup: tutte le rotte esistenti restano invariate e raggiungibili.
const sections = [
  {
    label: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    label: 'Oggi',
    items: [
      { href: '/risorsa', icon: LayoutGrid, label: 'Il mio portale' },
      { href: '/le-mie-attivita', icon: CheckCircle2, label: 'Le mie attività' },
      { href: '/task', icon: CheckSquare, label: 'Task' },
      { href: '/operativa', icon: Wrench, label: 'Operativa' },
      { href: '/calendario', icon: CalendarDays, label: 'Calendario' },
      { href: '/chat', icon: MessageSquare, label: 'Chat' },
    ],
  },
  {
    label: 'Clienti',
    items: [
      { href: '/clienti', icon: Users, label: 'Clienti' },
      { href: '/customer-care', icon: Headphones, label: 'Customer Care' },
      { href: '/customer-care/tickets', icon: Ticket, label: 'Ticket' },
      { href: '/report', icon: BarChart3, label: 'Report KPI' },
      { href: '/portale-cliente', icon: Eye, label: 'Portale Cliente', superAdminOnly: true },
    ],
  },
  {
    label: 'Lavori',
    items: [
      { href: '/progetti', icon: FolderKanban, label: 'Progetti' },
      { href: '/portfolio', icon: Briefcase, label: 'Portfolio' },
      { href: '/documenti', icon: FolderOpen, label: 'Documenti' },
    ],
  },
  {
    label: 'Vendite',
    items: [
      { href: '/commerciale', icon: ShoppingCart, label: 'Commerciale' },
    ],
  },
  {
    label: 'Soldi',
    items: [
      { href: '/fatturazione', icon: Receipt, label: 'Fatturazione' },
      { href: '/soldi/costi-risorse', icon: Euro, label: 'Costi risorse' },
    ],
  },
  {
    label: 'Team',
    items: [
      { href: '/hr', icon: UserCircle2, label: 'HR & Team' },
      { href: '/hr/timesheet', icon: Clock, label: 'Timesheet' },
      { href: '/reparti/growth',    icon: Layers, label: '🌱 Growth' },
      { href: '/reparti/marketing', icon: Layers, label: '📣 Marketing' },
      { href: '/reparti/digital',   icon: Layers, label: '💻 Digital' },
      { href: '/reparti/ai',        icon: Layers, label: '🤖 AI' },
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
      { href: '/impostazioni/cronologia', icon: History, label: 'Cronologia' },
      { href: '/impostazioni', icon: Settings, label: 'Impostazioni' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { profile } = usePermissions()
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '')
  const isAdmin = isSuperAdmin || profile?.app_role === 'admin'

  return (
    <aside
      className={cn(
        'flex flex-col bg-surface border-r border-[#2A2A2A] h-screen sticky top-0 transition-all duration-200 shrink-0',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-[#2A2A2A]">
        {!collapsed ? (
          <Link href="/dashboard" className="text-xl font-black">
            <span className="text-white">two bee</span>
            <span className="text-gold">.</span>
          </Link>
        ) : (
          <Link href="/dashboard" className="text-xl font-black mx-auto">
            <span className="text-gold">.</span>
          </Link>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 overflow-y-auto space-y-4">
        {sections.map((section, si) => {
          const hasVisibleItems = section.items.some(item => {
            if ((item as { superAdminOnly?: boolean }).superAdminOnly && !isSuperAdmin) return false
            return true
          })
          if (!hasVisibleItems) return null
          return (
          <div key={si}>
            {section.label && !collapsed && (
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-3 mb-1">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                if ((item.href === '/impostazioni' || item.href === '/impostazioni/cronologia' || item.href === '/soldi/costi-risorse') && !isAdmin) return null
                if ((item as { superAdminOnly?: boolean }).superAdminOnly && !isSuperAdmin) return null
                const isActive = pathname === item.href || (pathname.startsWith(item.href + '/') && !section.items.some(other => other.href !== item.href && pathname.startsWith(other.href)))
                const isGod = item.href === '/impostazioni' && isSuperAdmin
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group',
                      isActive
                        ? 'bg-gold/10 text-gold font-semibold'
                        : 'text-text-secondary hover:text-white hover:bg-white/5'
                    )}
                  >
                    <item.icon className={cn('w-5 h-5 shrink-0', isActive ? 'text-gold' : 'text-text-secondary group-hover:text-white')} />
                    {!collapsed && (
                      <span className="truncate flex-1">{item.label}</span>
                    )}
                    {!collapsed && isGod && <Crown className="w-3 h-3 text-gold shrink-0" />}
                  </Link>
                )
              })}
            </div>
          </div>
          )
        })}
      </nav>

      {/* User mini profile */}
      {profile && !collapsed && (
        <div className="border-t border-[#2A2A2A] px-3 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-xs font-bold text-gold shrink-0">
              {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" /> : (profile.full_name || profile.email)[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="text-xs font-semibold text-white truncate">{profile.full_name}</p>
                {SUPER_ADMIN_EMAILS.includes(profile.email) && <Crown className="w-3 h-3 text-gold shrink-0" />}
              </div>
              <p className="text-[10px] text-text-secondary capitalize">{SUPER_ADMIN_EMAILS.includes(profile.email) ? 'super admin' : (profile.app_role?.replace('_', ' ') ?? profile.role)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Collapse */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-t border-[#2A2A2A] text-text-secondary hover:text-white transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  )
}
