'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, CheckSquare, FolderKanban, Calendar, MessageSquare,
  FileText, Heart, User, UserCircle2, BarChart3, Bot, TrendingUp,
  ChevronLeft, ChevronRight, LogOut,
} from 'lucide-react'
import { useState } from 'react'
import { ROLE_LABELS } from '@/lib/permissions'
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
  BarChart3,
  Bot,
  TrendingUp,
}

interface WorkspaceSection {
  id: string
  slug: string
  label: string
  path: string
  icon: string
  sort_order: number
}

interface Props {
  sections: WorkspaceSection[]
  profile: { full_name: string | null; avatar_url: string | null; app_role: AppRole | null }
}

export function WorkspaceSidebar({ sections, profile }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const roleLabel = profile.app_role ? (ROLE_LABELS[profile.app_role] ?? profile.app_role) : ''
  const initials = (profile.full_name ?? 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-[#111111] border-r border-[#2A2A2A] transition-all duration-200 shrink-0',
        collapsed ? 'w-[60px]' : 'w-[220px]',
      )}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center h-14 px-4 border-b border-[#2A2A2A] shrink-0',
        collapsed ? 'justify-center' : 'gap-2',
      )}>
        <span className="text-[#F5C800] font-black text-lg leading-none">2B</span>
        {!collapsed && <span className="text-white/70 text-xs font-medium tracking-widest uppercase">Workspace</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {sections.map((s) => {
          const Icon = ICON_MAP[s.icon] ?? FileText
          const isActive = s.path === '/workspace'
            ? pathname === '/workspace'
            : pathname.startsWith(s.path)
          return (
            <Link
              key={s.id}
              href={s.path}
              title={collapsed ? s.label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-[#F5C800]/10 text-[#F5C800] font-semibold'
                  : 'text-white/50 hover:text-white hover:bg-white/5',
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
      <div className="border-t border-[#2A2A2A] p-3 flex flex-col gap-2 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2 px-1">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#F5C800]/20 flex items-center justify-center text-[#F5C800] text-xs font-bold shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate leading-tight">{profile.full_name ?? 'Utente'}</p>
              <p className="text-white/40 text-[10px] truncate leading-tight">{roleLabel}</p>
            </div>
          </div>
        )}
        <div className={cn('flex', collapsed ? 'justify-center' : 'justify-between items-center px-1')}>
          {!collapsed && (
            <Link href="/impostazioni/profilo" className="text-white/30 hover:text-white/60 transition-colors">
              <LogOut className="w-3.5 h-3.5" />
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-white/30 hover:text-white/60 transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </aside>
  )
}
