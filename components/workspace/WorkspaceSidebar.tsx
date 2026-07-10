'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CheckSquare, FolderKanban, Calendar, MessageSquare,
  FileText, Heart, User, UserCircle2, Users, BarChart3, Bot, TrendingUp,
  ListChecks, Headset,
  ChevronLeft, ChevronRight, LogOut,
} from 'lucide-react'
import { useState } from 'react'
import { ROLE_LABELS } from '@/lib/permissions'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { PortalSwitcher } from '@/components/shared/PortalSwitcher'
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
}

interface WorkspaceSection {
  id: string
  key: string
  label: string
  route: string
  icon: string
  sort_order: number
}

interface Props {
  sections: WorkspaceSection[]
  profile: { full_name: string | null; avatar_url: string | null; app_role: AppRole | null }
  isSuperAdmin?: boolean
}

export function WorkspaceSidebar({ sections, profile, isSuperAdmin = false }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const roleLabel = profile.app_role ? (ROLE_LABELS[profile.app_role] ?? profile.app_role) : ''
  const initials = (profile.full_name ?? 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

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
        {collapsed ? (
          <span className="text-gold-text font-black text-lg leading-none">2B</span>
        ) : (
          <img src="/logo.svg" alt="TWO BEE" className="h-8 w-auto" />
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {sections.map((s) => {
          const Icon = ICON_MAP[s.icon] ?? FileText
          const isActive = s.route === '/workspace'
            ? pathname === '/workspace'
            : pathname.startsWith(s.route)
          return (
            <Link
              key={s.id}
              href={s.route}
              title={collapsed ? s.label : undefined}
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
