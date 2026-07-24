'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/shared/Logo'
import { ICON_MAP, type WorkspaceSection } from '@/components/workspace/WorkspaceSidebar'
import type { AppRole } from '@/lib/types/database'

export function WorkspaceMobileNav({
  sections, profile,
}: {
  sections: WorkspaceSection[]
  profile: { full_name: string | null; avatar_url: string | null; app_role: AppRole | null }
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (open) { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }
  }, [open])

  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Apri menu"
        className="lg:hidden p-2 -ml-1 rounded-xl text-text-secondary hover:bg-surface-hover press no-tap-highlight">
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-scrim animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[82%] max-w-xs bg-surface border-r border-border-strong shadow-drawer flex flex-col animate-slide-in-right pt-safe">
            <div className="flex items-center justify-between h-14 px-4 border-b border-border">
              <Link href="/workspace" aria-label="TwoBee — workspace" className="flex items-center">
                <Logo className="h-6" priority />
              </Link>
              <button onClick={() => setOpen(false)} aria-label="Chiudi menu"
                className="p-2 rounded-xl text-text-tertiary hover:bg-surface-hover press">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {ordered.map(s => {
                const Icon = ICON_MAP[s.icon] ?? FileText
                const active = pathname === s.route
                  || (pathname.startsWith(s.route + '/') && !ordered.some(o => o.route !== s.route && pathname.startsWith(o.route)))
                return (
                  <Link key={s.id} href={s.route}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors press',
                      active ? 'bg-gold-dim text-gold-text font-medium'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover',
                    )}>
                    <Icon className={cn('w-5 h-5 shrink-0', active ? 'text-gold-text' : 'text-text-tertiary')} />
                    <span className="flex-1 truncate">{s.label}</span>
                  </Link>
                )
              })}
            </nav>

            {profile && (
              <div className="border-t border-border px-4 py-3 pb-safe flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-xs font-bold text-gold-text shrink-0">
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                    : (profile.full_name || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{profile.full_name}</p>
                  <p className="text-2xs text-text-tertiary capitalize">{profile.app_role?.replace('_', ' ') ?? ''}</p>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  )
}
