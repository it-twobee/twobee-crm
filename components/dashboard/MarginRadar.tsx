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
          { label: 'MRR Totale',   value: formatCurrency(totalMrr),    color: 'var(--color-gold-text)' },
          { label: 'Margine est.', value: formatCurrency(totalMargin),  color: 'var(--color-success)' },
          { label: '% media',      value: `${avgMarginPct}%`,           color: 'var(--color-info)' },
        ].map(k => (
          <div key={k.label} className="rounded-lg p-2.5" style={{ background: '#111', border: '1px solid #1A1A1A' }}>
            <p className="text-2xs font-bold uppercase tracking-widest mb-1" style={{ color: '#333' }}>{k.label}</p>
            <p className="text-sm font-black leading-none" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Mix per tipo */}
      <div className="grid grid-cols-3 gap-2 shrink-0">
        {[
          { label: 'Growth', value: formatCurrency(growthMrr), color: 'var(--color-gold-text)' },
          { label: 'Digital', value: formatCurrency(digitalMrr), color: 'var(--color-info)' },
          { label: 'G+D', value: formatCurrency(bothMrr), color: 'var(--color-accent)' },
        ].map(k => (
          <div key={k.label} className="rounded-lg px-2 py-1.5 text-center" style={{ background: 'var(--color-background)', border: '1px solid #141414' }}>
            <p className="text-[8px] font-bold uppercase" style={{ color: '#333' }}>{k.label}</p>
            <p className="text-2xs font-bold" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Client bars */}
      <div className="space-y-1.5 flex-1">
        {sorted.map(c => {
          const pct        = MARGIN_BY_PACKAGE[c.package] ?? 60
          const mrr        = c.mrr ?? 0
          const barW       = maxMrr > 0 ? (mrr / maxMrr) * 100 : 0
          const typeColor  = c.client_type === 'growth' ? 'var(--color-gold-text)'
            : c.client_type === 'digital' ? 'var(--color-info)' : 'var(--color-accent)'
          return (
            <div key={c.id} className="flex items-center gap-2">
              <p className="w-[90px] text-2xs font-semibold truncate shrink-0" style={{ color: '#666' }}>
                {c.company_name}
              </p>
              <div className="flex-1 relative h-5 rounded-sm overflow-hidden" style={{ background: 'var(--color-background)' }}>
                {/* full MRR bar */}
                <div className="absolute inset-y-0 left-0" style={{ width: `${barW}%`, background: `color-mix(in srgb, ${typeColor} 9%, transparent)`, borderRight: `2px solid color-mix(in srgb, ${typeColor} 33%, transparent)` }} />
                {/* margin overlay */}
                <div className="absolute inset-y-0 left-0" style={{ width: `${barW * pct / 100}%`, background: `color-mix(in srgb, ${typeColor} 21%, transparent)` }} />
              </div>
              <div className="w-[72px] shrink-0 text-right">
                <p className="text-2xs font-bold" style={{ color: '#555' }}>{formatCurrency(mrr)}</p>
                <p className="text-2xs" style={{ color: typeColor }}>{pct}%</p>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-2xs text-center shrink-0" style={{ color: '#1E1E1E' }}>
        % margine stimato per package · costi reali non ancora tracciati
      </p>
    </div>
  )
}
