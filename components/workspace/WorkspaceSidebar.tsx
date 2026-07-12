'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CheckSquare, FolderKanban, Calendar, MessageSquare,
  FileText, Heart, User, UserCircle2, Users, BarChart3, Bot, TrendingUp,
  ListChecks, Headset, Briefcase, Headphones, Ticket, Receipt, History,
  Lightbulb, Gauge, ChevronLeft, ChevronRight, ChevronDown, LogOut,
} from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { ROLE_LABELS } from '@/lib/permissions'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { PortalSwitcher } from '@/components/shared/PortalSwitcher'
import { Logo } from '@/components/shared/Logo'
import type { AppRole } from '@/lib/types/database'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  CheckSquare,
  FolderKanban,
  Calendar,
  MessageSquare,
  FileText,
  Heart,
  User,
  UserCircle2,
  Users,
  BarChart3,
  Bot,
  TrendingUp,
  ListChecks,
  Headset,
  Briefcase,
  Headphones,
  Ticket,
  Receipt,
  History,
  Lightbulb,
  Gauge,
}

// Etichette dei gruppi della sidebar. L'ordine è dato da group_order in tabella;
// questa mappa serve solo per il titolo mostrato.
const GROUP_LABELS: Record<string, string> = {
  dashboard: '',          // gruppo senza intestazione: è una voce sola
  lavori: 'Lavori',
  clienti: 'Clienti',
  team: 'Team',
  profilo: '',
}

// Fallback: finché la migration 087 non è applicata, workspace_sections non ha
// group_key. Deriviamo il gruppo dalla chiave, così la sidebar non collassa in
// una lista piatta né esplode su colonna mancante.
const GROUP_FALLBACK: Record<string, { key: string; order: number }> = {
  dashboard:           { key: 'dashboard', order: 0 },
  mie_attivita:        { key: 'lavori',    order: 1 },
  calendario:          { key: 'lavori',    order: 1 },
  chat:                { key: 'lavori',    order: 1 },
  progetti:            { key: 'lavori',    order: 1 },
  portfolio:           { key: 'lavori',    order: 1 },
  workload:            { key: 'lavori',    order: 1 },
  documenti:           { key: 'lavori',    order: 1 },
  clienti_attivi:      { key: 'clienti',   order: 2 },
  customer_care:       { key: 'clienti',   order: 2 },
  ticket:              { key: 'clienti',   order: 2 },
  hr:                  { key: 'team',      order: 3 },
  buste_paga:          { key: 'team',      order: 3 },
  documenti_personali: { key: 'team',      order: 3 },
  cronologia:          { key: 'team',      order: 3 },
  profilo:             { key: 'profilo',   order: 4 },
}

const STORAGE_KEY = 'twobee-workspace-collapsed-groups'

function readCollapsed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}

interface WorkspaceSection {
  id: string
  key: string
  label: string
  route: string
  icon: string
  sort_order: number
  group_key?: string | null
  group_order?: number | null
}

interface Props {
  sections: WorkspaceSection[]
  profile: { full_name: string | null; avatar_url: string | null; app_role: AppRole | null }
  isSuperAdmin?: boolean
}

export function WorkspaceSidebar({ sections, profile, isSuperAdmin = false }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  // Lo stato dei gruppi vive in localStorage, che sul server non esiste: leggerlo
  // nell'initializer farebbe divergere il primo render client dall'HTML del server
  // (hydration mismatch). Si parte deterministici e si applica dopo il mount.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  useEffect(() => { setCollapsedGroups(readCollapsed()) }, [])

  const roleLabel = profile.app_role ? (ROLE_LABELS[profile.app_role] ?? profile.app_role) : ''
  const initials = (profile.full_name ?? 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const groupOf = (s: WorkspaceSection) =>
    s.group_key
      ? { key: s.group_key, order: s.group_order ?? 99 }
      : (GROUP_FALLBACK[s.key] ?? { key: 'lavori', order: 1 })

  const groups = new Map<string, { order: number; items: WorkspaceSection[] }>()
  for (const s of sections) {
    const g = groupOf(s)
    if (!groups.has(g.key)) groups.set(g.key, { order: g.order, items: [] })
    groups.get(g.key)!.items.push(s)
  }
  const orderedGroups = Array.from(groups.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, g]) => ({ key, order: g.order, items: [...g.items].sort((x, y) => x.sort_order - y.sort_order) }))

  const isRouteActive = (route: string) =>
    route === '/workspace' ? pathname === '/workspace' : pathname.startsWith(route)

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-background border-r border-border transition-all duration-200 shrink-0',
        collapsed ? 'w-[60px]' : 'w-[220px]',
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center h-14 px-4 border-b border-border shrink-0',
        collapsed ? 'justify-center' : 'gap-2',
      )}>
        <Link href="/workspace" aria-label="TwoBee — vai alla dashboard" className="flex items-center">
          {collapsed
            ? <Logo variant="mark" className="w-5 h-5" priority />
            : <Logo className="h-6" priority />}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {orderedGroups.map(group => {
          const label = GROUP_LABELS[group.key] ?? group.key
          const isGroupCollapsed = collapsedGroups[group.key] ?? false
          const hasActiveChild = group.items.some(i => isRouteActive(i.route))

          const links = group.items.map(s => {
            const Icon = ICON_MAP[s.icon] ?? FileText
            const isActive = isRouteActive(s.route)
            return (
              <Link
                key={s.id}
                href={s.route}
                title={collapsed ? s.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-gold-dim text-gold-text font-semibold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover',
                  collapsed && 'justify-center px-2',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{s.label}</span>}
              </Link>
            )
          })

          // Gruppi senza titolo (dashboard, profilo) restano voci nude.
          if (!label) return <div key={group.key} className="space-y-px">{links}</div>

          if (collapsed) {
            return (
              <div key={group.key} className="space-y-px">
                <div className="h-px bg-border mx-2 my-2" />
                {links}
              </div>
            )
          }

          return (
            <div key={group.key}>
              <button
                onClick={() => toggleGroup(group.key)}
                aria-expanded={!isGroupCollapsed}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-1.5 mt-1 rounded-lg',
                  'text-2xs font-semibold uppercase tracking-[0.12em] transition-colors',
                  hasActiveChild && isGroupCollapsed
                    ? 'text-gold-text'
                    : 'text-text-tertiary hover:text-text-secondary',
                )}
              >
                <span>{label}</span>
                {isGroupCollapsed
                  ? <ChevronRight className="w-3 h-3" aria-hidden="true" />
                  : <ChevronDown className="w-3 h-3 opacity-40" aria-hidden="true" />}
              </button>
              {!isGroupCollapsed && <div className="space-y-px">{links}</div>}
            </div>
          )
        })}
      </nav>

      {/* User + collapse */}
      <div className="border-t border-border p-3 flex flex-col gap-2 shrink-0">
        {isSuperAdmin && <PortalSwitcher collapsed={collapsed} />}
        <ThemeToggle collapsed={collapsed} />
        {!collapsed && (
          <div className="flex items-center gap-2 px-1">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gold/20 flex items-center justify-center text-gold-text text-xs font-bold shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-text-primary text-xs font-medium truncate leading-tight">{profile.full_name ?? 'Utente'}</p>
              <p className="text-text-tertiary text-2xs truncate leading-tight">{roleLabel}</p>
            </div>
          </div>
        )}
        <div className={cn('flex', collapsed ? 'justify-center' : 'justify-between items-center px-1')}>
          {!collapsed && (
            <Link href="/impostazioni/profilo" className="text-text-tertiary hover:text-text-secondary transition-colors">
              <LogOut className="w-3.5 h-3.5" />
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </aside>
  )
}
