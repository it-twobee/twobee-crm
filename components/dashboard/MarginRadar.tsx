'use client'
import { useMemo } from 'react'
import type { Client } from '@/lib/types/database'
import { formatCurrency } from '@/lib/utils'

const MARGIN_BY_PACKAGE: Record<string, number> = {
  'Worker Bee Start': 75,
  'Worker Bee Basic': 70,
  'Hive Basic': 65,
  'Hive Custom': 60,
  'Royal Queen': 55,
  'IT Digital Partner': 50,
  'Partner Quota': 45,
}

export function MarginRadar({ clients }: { clients: Client[] }) {
  const sorted = useMemo(() =>
    [...clients]
      .filter(c => c.client_label !== 'perso')
      .sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0))
      .slice(0, 12)
  , [clients])

  const totalMrr    = sorted.reduce((s, c) => s + (c.mrr ?? 0), 0)
  const totalMargin = sorted.reduce((s, c) => {
    const pct = MARGIN_BY_PACKAGE[c.package] ?? 60
    return s + (c.mrr ?? 0) * pct / 100
  }, 0)
  const avgMarginPct = totalMrr > 0 ? Math.round(totalMargin / totalMrr * 100) : 0
  const maxMrr       = sorted[0]?.mrr ?? 1

  const growthMrr  = sorted.filter(c => c.client_type === 'growth').reduce((s, c) => s + (c.mrr ?? 0), 0)
  const digitalMrr = sorted.filter(c => c.client_type === 'digital').reduce((s, c) => s + (c.mrr ?? 0), 0)
  const bothMrr    = sorted.filter(c => c.client_type === 'growth_digital').reduce((s, c) => s + (c.mrr ?? 0), 0)

  return (
    <div className="p-3 h-full overflow-auto flex flex-col gap-3">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 shrink-0">
        {[
          { label: 'MRR Totale',   value: formatCurrency(totalMrr),    color: '#F5C800' },
          { label: 'Margine est.', value: formatCurrency(totalMargin),  color: '#22C55E' },
          { label: '% media',      value: `${avgMarginPct}%`,           color: '#3B82F6' },
        ].map(k => (
          <div key={k.label} className="rounded-lg p-2.5" style={{ background: '#111', border: '1px solid #1A1A1A' }}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#333' }}>{k.label}</p>
            <p className="text-sm font-black leading-none" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Mix per tipo */}
      <div className="grid grid-cols-3 gap-2 shrink-0">
        {[
          { label: 'Growth', value: formatCurrency(growthMrr), color: '#F5C800' },
          { label: 'Digital', value: formatCurrency(digitalMrr), color: '#3B82F6' },
          { label: 'G+D', value: formatCurrency(bothMrr), color: '#A855F7' },
        ].map(k => (
          <div key={k.label} className="rounded-lg px-2 py-1.5 text-center" style={{ background: '#0D0D0D', border: '1px solid #141414' }}>
            <p className="text-[8px] font-bold uppercase" style={{ color: '#333' }}>{k.label}</p>
            <p className="text-[10px] font-bold" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Client bars */}
      <div className="space-y-1.5 flex-1">
        {sorted.map(c => {
          const pct        = MARGIN_BY_PACKAGE[c.package] ?? 60
          const mrr        = c.mrr ?? 0
          const barW       = maxMrr > 0 ? (mrr / maxMrr) * 100 : 0
          const typeColor  = c.client_type === 'growth' ? '#F5C800'
            : c.client_type === 'digital' ? '#3B82F6' : '#A855F7'
          return (
            <div key={c.id} className="flex items-center gap-2">
              <p className="w-[90px] text-[10px] font-semibold truncate shrink-0" style={{ color: '#666' }}>
                {c.company_name}
              </p>
              <div className="flex-1 relative h-5 rounded-sm overflow-hidden" style={{ background: '#0D0D0D' }}>
                {/* full MRR bar */}
                <div className="absolute inset-y-0 left-0" style={{ width: `${barW}%`, background: typeColor + '18', borderRight: `2px solid ${typeColor}55` }} />
                {/* margin overlay */}
                <div className="absolute inset-y-0 left-0" style={{ width: `${barW * pct / 100}%`, background: typeColor + '35' }} />
              </div>
              <div className="w-[72px] shrink-0 text-right">
                <p className="text-[10px] font-bold" style={{ color: '#555' }}>{formatCurrency(mrr)}</p>
                <p className="text-[9px]" style={{ color: typeColor }}>{pct}%</p>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[9px] text-center shrink-0" style={{ color: '#1E1E1E' }}>
        % margine stimato per package · costi reali non ancora tracciati
      </p>
    </div>
  )
}
