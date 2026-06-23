'use client'

import Link from 'next/link'
import { ShoppingCart, Receipt, Wrench, Headphones, Target } from 'lucide-react'

interface PulseArea {
  label: string
  value: number   // 0–100
  detail: string
  color: string
  href: string
  icon: React.ReactNode
}

interface Props {
  areas: PulseArea[]
}

export function CompanyPulse({ areas }: Props) {
  return (
    <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5 h-full overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">Company Pulse</p>
        <span className="text-[10px] text-[#444]">Stato aree in tempo reale</span>
      </div>
      <div className="space-y-3">
        {areas.map(area => (
          <Link key={area.label} href={area.href} className="flex items-center gap-3 group">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: area.color + '15' }}>
              <span style={{ color: area.color }}>{area.icon}</span>
            </div>
            <span className="text-xs text-text-secondary w-28 shrink-0 group-hover:text-white transition-colors">{area.label}</span>
            <div className="flex-1 h-1.5 bg-[#2A2A2A] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${area.value}%`, background: area.value >= 70 ? '#22C55E' : area.value >= 40 ? '#F5C800' : '#EF4444' }} />
            </div>
            <span className="text-xs font-bold text-white w-8 text-right shrink-0"
              style={{ color: area.value >= 70 ? '#22C55E' : area.value >= 40 ? '#F5C800' : '#EF4444' }}>
              {area.value}%
            </span>
            <span className="text-[10px] text-[#444] w-32 text-right shrink-0 hidden xl:block">{area.detail}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
