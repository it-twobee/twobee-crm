'use client'

import { useState } from 'react'
import { LayoutList, Wrench, Sparkles } from 'lucide-react'
import { DeptOperativity } from './DeptOperativity'
import { DeptToolboxEnhanced } from './DeptToolboxEnhanced'
import { DeptAIAdvisorEnhanced } from './DeptAIAdvisorEnhanced'
import type { ProjectKind, Profile } from '@/lib/types/database'
import type { DeptProject, DeptStats, SavedChat } from '@/app/(dashboard)/reparti/[dept]/page'

interface ClientOpt { id: string; company_name: string }
interface Props {
  dept: ProjectKind; projects: DeptProject[]; profiles: Profile[]
  clients: ClientOpt[]; stats: DeptStats; savedChats: SavedChat[]
}

const DEPT_CONFIG: Record<ProjectKind, { label: string; color: string; bg: string; emoji: string }> = {
  growth:    { label: 'Growth',    color: '#22C55E', bg: '#22C55E18', emoji: '🌱' },
  marketing: { label: 'Marketing', color: '#F59E0B', bg: '#F59E0B18', emoji: '📣' },
  digital:   { label: 'Digital',   color: '#3B82F6', bg: '#3B82F618', emoji: '💻' },
  ai:        { label: 'AI',        color: '#A855F7', bg: '#A855F718', emoji: '🤖' },
}

type Tab = 'operativita' | 'toolbox' | 'ai'

export function DepartmentBoard({ dept, projects, profiles, clients, stats, savedChats }: Props) {
  const cfg = DEPT_CONFIG[dept]
  const [tab, setTab] = useState<Tab>('operativita')

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'operativita', label: 'Operatività', icon: <LayoutList className="w-3.5 h-3.5" /> },
    { id: 'toolbox',     label: 'Toolbox',     icon: <Wrench     className="w-3.5 h-3.5" /> },
    { id: 'ai',          label: 'AI Advisor',  icon: <Sparkles   className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
              {cfg.emoji} {cfg.label}
            </span>
          </div>
          <h1 className="text-2xl font-black text-white">Reparto {cfg.label}</h1>
        </div>
        <div className="flex bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl overflow-hidden p-1 gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? 'text-black' : 'text-[#666] hover:text-white'}`}
              style={tab === t.id ? { background: cfg.color } : {}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'operativita' && (
        <DeptOperativity
          dept={dept} projects={projects} profiles={profiles}
          clients={clients} stats={stats} savedChats={savedChats} color={cfg.color}
        />
      )}
      {tab === 'toolbox' && <DeptToolboxEnhanced dept={dept} />}
      {tab === 'ai'      && <DeptAIAdvisorEnhanced dept={dept} projects={projects} />}
    </div>
  )
}
