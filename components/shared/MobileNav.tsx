'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/lib/hooks/usePermissions'
import { SUPER_ADMIN_EMAILS, isAdminRole } from '@/lib/permissions'
import { Logo } from '@/components/shared/Logo'
import { navSections, type NavItem } from '@/components/shared/nav-config'

export function MobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { profile } = usePermissions()
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '')
  const isAdmin = isSuperAdmin || isAdminRole(profile?.app_role)

  // chiudi al cambio rotta
  useEffect(() => { setOpen(false) }, [pathname])
  // blocca lo scroll del body quando il drawer è aperto
  useEffect(() => {
    if (open) { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }
  }, [open])

  const visible = (item: NavItem) =>
    (!item.superAdminOnly || isSuperAdmin) && (!item.adminOnly || isAdmin)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Apri menu"
        className="lg:hidden p-2 -ml-1 rounded-xl text-text-secondary hover:bg-surface-hover press no-tap-highlight">
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-scrim animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[82%] max-w-xs bg-surface border-r border-border-strong shadow-drawer flex flex-col animate-slide-in-right pt-safe">
            <div className="flex items-center justify-between h-14 px-4 border-b border-border">
              <Link href="/dashboard" aria-label="TwoBee — dashboard" className="flex items-center">
                <Logo className="h-6" priority />
              </Link>
              <button onClick={() => setOpen(false)} aria-label="Chiudi menu"
                className="p-2 rounded-xl text-text-tertiary hover:bg-surface-hover press">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-4">
              {navSections.map(section => {
                const items = section.items.filter(visible)
                if (items.length === 0) return null
                return (
                  <div key={section.label}>
                    <div className="px-2 pb-1 text-2xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                      {section.label}
                    </div>
                    <div className="space-y-0.5">
                      {items.map(item => {
                        const active = pathname === item.href
                          || (pathname.startsWith(item.href + '/') && !items.some(o => o.href !== item.href && pathname.startsWith(o.href)))
                        const isGod = item.href === '/impostazioni' && isSuperAdmin
                        return (
                          <Link key={item.href} href={item.href}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors press',
                              active ? 'bg-gold-dim text-gold-text font-medium'
                                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover',
                            )}>
                            <item.icon className={cn('w-5 h-5 shrink-0', active ? 'text-gold-text' : 'text-text-tertiary')} />
                            <span className="flex-1 truncate">{item.label}</span>
                            {isGod && <Crown className="w-3.5 h-3.5 text-gold-text shrink-0" />}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </nav>

            {profile && (
              <div className="border-t border-border px-4 py-3 pb-safe flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-xs font-bold text-gold-text shrink-0">
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                    : (profile.full_name || profile.email)[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{profile.full_name}</p>
                  <p className="text-2xs text-text-tertiary capitalize">
                    {isSuperAdmin ? 'super admin' : (profile.app_role?.replace('_', ' ') ?? profile.role)}
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  )
}
