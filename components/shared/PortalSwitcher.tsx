'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { LayoutDashboard, MonitorSmartphone, Eye, ChevronsUpDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type PortalKey = 'admin' | 'workspace' | 'cliente'

const PORTALS: { key: PortalKey; label: string; hint: string; route: string; icon: typeof LayoutDashboard }[] = [
  { key: 'admin',     label: 'Admin',            hint: 'Tool completo',      route: '/dashboard', icon: LayoutDashboard },
  { key: 'workspace', label: 'Portale Operativo', hint: 'Vista risorsa',      route: '/workspace', icon: MonitorSmartphone },
  { key: 'cliente',   label: 'Portale Cliente',   hint: 'Vista cliente',      route: '/portale',   icon: Eye },
]

function activePortal(pathname: string): PortalKey {
  if (pathname.startsWith('/workspace')) return 'workspace'
  if (pathname.startsWith('/portale')) return 'cliente'
  return 'admin'
}

/**
 * Switch fra i tre portali. Il chiamante DEVE renderizzarlo solo per il super
 * admin: qui non c'è un secondo controllo perché il gate vero sta nel middleware,
 * e un componente client non è mai una barriera di sicurezza.
 */
export function PortalSwitcher({ collapsed = false, direction = 'up' }: {
  collapsed?: boolean
  /** 'up' nelle sidebar (il bottone sta in fondo), 'down' in una barra superiore */
  direction?: 'up' | 'down'
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = activePortal(pathname)
  const currentPortal = PORTALS.find(p => p.key === current)!

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (route: string) => {
    setOpen(false)
    router.push(route)
  }

  const Icon = currentPortal.icon

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Portale attivo: ${currentPortal.label}. Cambia portale`}
        title={collapsed ? `Portale: ${currentPortal.label}` : undefined}
        className={cn(
          'w-full flex items-center gap-2 rounded-xl border border-border bg-surface-hover',
          'hover:bg-surface-active transition-colors text-left',
          collapsed ? 'justify-center p-2' : 'px-2.5 py-2',
        )}
      >
        <Icon className="w-4 h-4 shrink-0 text-gold-text" aria-hidden="true" />
        {!collapsed && (
          <>
            <span className="flex-1 min-w-0">
              <span className="block text-2xs uppercase tracking-wider text-text-tertiary leading-none">Portale</span>
              <span className="block text-xs font-semibold text-text-primary truncate leading-tight mt-0.5">
                {currentPortal.label}
              </span>
            </span>
            <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 rounded-xl border border-border bg-surface shadow-lg overflow-hidden',
            direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2',
            collapsed ? 'left-0 w-56' : 'left-0 right-0 min-w-[13rem]',
          )}
        >
          {PORTALS.map(p => {
            const PIcon = p.icon
            const isCurrent = p.key === current
            return (
              <button
                key={p.key}
                role="menuitem"
                onClick={() => go(p.route)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                  isCurrent ? 'bg-gold-dim' : 'hover:bg-surface-hover',
                )}
              >
                <PIcon className={cn('w-4 h-4 shrink-0', isCurrent ? 'text-gold-text' : 'text-text-tertiary')} aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className={cn('block text-xs font-semibold truncate', isCurrent ? 'text-gold-text' : 'text-text-primary')}>
                    {p.label}
                  </span>
                  <span className="block text-2xs text-text-tertiary truncate">{p.hint}</span>
                </span>
                {isCurrent && <Check className="w-3.5 h-3.5 shrink-0 text-gold-text" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
