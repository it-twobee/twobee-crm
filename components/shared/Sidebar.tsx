'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  ChevronRight, ChevronLeft, ChevronDown, Crown,
} from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { usePermissions } from '@/lib/hooks/usePermissions'
import { SUPER_ADMIN_EMAILS, isAdminRole } from '@/lib/permissions'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Logo } from '@/components/shared/Logo'
import { navSections as sections, type NavItem } from '@/components/shared/nav-config'

const STORAGE_KEY = 'twobee-sidebar-collapsed-sections'

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch { return {} }
}

export function Sidebar() {
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Come in WorkspaceSidebar: localStorage non esiste sul server, quindi leggerlo
  // nell'initializer divergerebbe dall'HTML renderizzato (hydration mismatch).
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  useEffect(() => { setCollapsedSections(readCollapsed()) }, [])
  const { profile } = usePermissions()
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '')
  /* §234 — «admin» è ADMIN_ROLES, non la stringa 'admin': un founder è
     admin di funzione e restava fuori da mezza sidebar. */
  const isAdmin = isSuperAdmin || isAdminRole(profile?.app_role)

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
        'hidden lg:flex flex-col h-screen sticky top-0 transition-all duration-200 shrink-0',
        'bg-surface backdrop-blur-xl border-r border-border',
        sidebarCollapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-border">
        {!sidebarCollapsed ? (
          <Link href="/dashboard" aria-label="TwoBee — vai alla dashboard" className="flex items-center">
            <Logo className="h-6" priority />
          </Link>
        ) : (
          <Link href="/dashboard" aria-label="TwoBee — vai alla dashboard" className="mx-auto flex items-center">
            <Logo variant="mark" className="w-5 h-5" priority />
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
                    'w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-2xs font-semibold uppercase tracking-[0.12em] transition-colors',
                    hasActiveChild && isSectionCollapsed
                      ? 'text-gold-text'
                      : 'text-text-tertiary hover:text-text-secondary'
                  )}
                >
                  <span>{section.label}</span>
                  {isSectionCollapsed
                    ? <ChevronRight className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3 opacity-40" />
                  }
                </button>
              ) : (
                <div className="h-px bg-border mx-2 my-2" />
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
                          'flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all duration-150 group',
                          isActive
                            ? 'bg-gold-dim text-gold-text font-medium'
                            : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                        )}
                      >
                        <item.icon className={cn('w-[18px] h-[18px] shrink-0', isActive ? 'text-gold-text' : 'text-text-tertiary group-hover:text-text-secondary')} />
                        {!sidebarCollapsed && (
                          <span className="truncate flex-1">{item.label}</span>
                        )}
                        {!sidebarCollapsed && isGod && <Crown className="w-3 h-3 text-gold-text shrink-0" />}
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
        <div className="border-t border-border px-3 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-xs font-bold text-gold-text shrink-0">
              {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" /> : (profile.full_name || profile.email)[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="text-xs font-medium text-text-secondary truncate">{profile.full_name}</p>
                {SUPER_ADMIN_EMAILS.includes(profile.email) && <Crown className="w-3 h-3 text-gold-text shrink-0" />}
              </div>
              <p className="text-2xs text-text-tertiary capitalize">{SUPER_ADMIN_EMAILS.includes(profile.email) ? 'super admin' : (profile.app_role?.replace('_', ' ') ?? profile.role)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Portal switcher — solo super admin */}
      {isSuperAdmin && (
        <div className="border-t border-border px-2 py-2">
        </div>
      )}

      {/* Theme toggle */}
      <div className="border-t border-border px-2 py-1.5">
        <ThemeToggle collapsed={sidebarCollapsed} className="w-full" />
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="flex items-center justify-center h-10 border-t border-border text-text-tertiary hover:text-text-secondary transition-colors"
      >
        {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  )
}
