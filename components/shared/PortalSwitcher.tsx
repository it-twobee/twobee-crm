'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Briefcase, ChevronsUpDown, Crown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type Portal = { key: string; label: string; hint: string; route: string; icon: typeof LayoutDashboard }

// Portali reali oggi. Il Portale Cliente si aggiunge qui quando esiste.
const PORTALS: Portal[] = [
  { key: 'admin', label: 'Portale Admin', hint: 'Gestione completa', route: '/dashboard', icon: LayoutDashboard },
  { key: 'workspace', label: 'Workspace', hint: 'Vista risorsa', route: '/workspace', icon: Briefcase },
]

export function PortalSwitcher() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const current = pathname.startsWith('/workspace') ? PORTALS[1] : PORTALS[0]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Cambia portale"
        className="flex items-center gap-1.5 h-8 pl-2 pr-1.5 rounded-xl border border-gold/25 bg-gold-dim text-gold-text hover:border-gold/40 transition-colors press no-tap-highlight">
        <Crown className="w-3.5 h-3.5 shrink-0" />
        <span className="text-2xs font-bold max-w-[92px] truncate hidden sm:inline">{current.label}</span>
        <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-56 rounded-2xl bg-surface border border-border-strong shadow-pop z-50 p-1.5 animate-scale-in">
          <div className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wider text-text-tertiary flex items-center gap-1.5">
            <Crown className="w-3 h-3 text-gold-text" /> Cambia portale
          </div>
          {PORTALS.map(p => {
            const active = p.key === current.key
            return (
              <button key={p.key}
                onClick={() => { setOpen(false); if (!active) router.push(p.route) }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors press',
                  active ? 'bg-gold-dim' : 'hover:bg-surface-hover',
                )}>
                <p.icon className={cn('w-4 h-4 shrink-0', active ? 'text-gold-text' : 'text-text-tertiary')} />
                <div className="flex-1 min-w-0">
                  <div className={cn('text-sm font-semibold truncate', active ? 'text-gold-text' : 'text-text-primary')}>{p.label}</div>
                  <div className="text-2xs text-text-tertiary truncate">{p.hint}</div>
                </div>
                {active && <Check className="w-3.5 h-3.5 text-gold-text shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
