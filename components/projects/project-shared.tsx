'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

export interface ProjectComment {
  id: string; project_id: string; author_id: string | null
  content: string; is_client: boolean; parent_id: string | null
  tag: string | null; created_at: string
}

export const UPDATE_TAGS = ['Update settimanale', 'Milestone raggiunta', 'Blocco', 'Altro']

export function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 60) return `${m}m fa`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h fa`
  return `${Math.floor(h / 24)}g fa`
}

export function trendDir(a?: number | null, b?: number | null, hi = true) {
  if (a == null || b == null || b === 0) return null
  const c = (a - b) / Math.abs(b)
  return Math.abs(c) < 0.02 ? null : (c > 0) === hi ? 'up' : 'down'
}

export function Section({ title, icon, count, accent, defaultOpen = true, children, right }: {
  title: string; icon: React.ReactNode; count?: number
  accent: string; defaultOpen?: boolean; children: React.ReactNode; right?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-[#1A1A1A] rounded-2xl overflow-hidden mb-3">
      <div className="flex items-center gap-2.5 px-4 py-3 bg-[#0C0C0C] hover:bg-[#0F0F0F] transition-colors">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
          <span style={{ color: accent }} className="shrink-0">{icon}</span>
          <span className="text-xs font-bold text-[#888] uppercase tracking-wider flex-1 min-w-0 truncate">{title}</span>
          {count !== undefined && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mr-1 shrink-0"
              style={{ background: `${accent}15`, color: accent }}>{count}</span>
          )}
        </button>
        {right && <div className="shrink-0">{right}</div>}
        <button onClick={() => setOpen(o => !o)} className="shrink-0 text-[#333] hover:text-[#555] transition-colors">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {open && <div className="bg-[#080808]">{children}</div>}
    </div>
  )
}
