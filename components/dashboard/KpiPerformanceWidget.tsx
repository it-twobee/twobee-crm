'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import Link from 'next/link'

export type KpiSnapshotRow = {
  client_id: string
  company_name: string
  client_type: string
  month: string
  mer?: number | null
  revenue_attributed?: number | null
  organic_sessions?: number | null
  uptime?: number | null
  leads_generated?: number | null
}

function fmt(v: number | null | undefined, prefix = '', unit = '', decimals = 1): string {
  if (v == null) return '—'
  if (v >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(1)}M${unit}`
  if (v >= 1_000) return `${prefix}${(v / 1_000).toFixed(1)}k${unit}`
  return `${prefix}${v.toFixed(decimals)}${unit}`
}

function Delta({ curr, prev, lowerBetter = false }: {
  curr?: number | null; prev?: number | null; lowerBetter?: boolean
}) {
  if (curr == null || prev == null || prev === 0) {
    return <span className="text-text-tertiary text-[9px]">—</span>
  }
  const pct = ((curr - prev) / Math.abs(prev)) * 100
  const flat = Math.abs(pct) < 0.5
  const isGood = flat ? true : lowerBetter ? pct < 0 : pct > 0
  const color = flat ? 'var(--color-text-tertiary)' : isGood ? 'var(--color-success)' : 'var(--color-error)'
  const Icon = flat ? Minus : isGood ? TrendingUp : TrendingDown
  return (
    <span className="flex items-center gap-0.5 text-[9px] font-bold" style={{ color }}>
      <Icon className="w-2.5 h-2.5" />
      {flat ? '—' : `${Math.abs(pct).toFixed(0)}%`}
    </span>
  )
}

function KpiCell({ label, value, delta }: { label: string; value: string; delta: React.ReactNode }) {
  return (
    <div className="text-right min-w-[52px]">
      <div className="text-[9px] text-text-secondary leading-none mb-0.5">{label}</div>
      <div className="text-xs font-bold text-text-primary leading-none">{value}</div>
      <div className="mt-0.5">{delta}</div>
    </div>
  )
}

export function KpiPerformanceWidget({ kpiSnapshot, clientsById }: {
  kpiSnapshot: KpiSnapshotRow[]
  clientsById?: Record<string, string>
}) {
  const byClient: Record<string, KpiSnapshotRow[]> = {}
  for (const row of kpiSnapshot) {
    if (!byClient[row.client_id]) byClient[row.client_id] = []
    byClient[row.client_id].push(row)
  }

  const rows = Object.values(byClient)
    .map(entries => {
      const sorted = [...entries].sort((a, b) => b.month.localeCompare(a.month))
      return { latest: sorted[0], prev: sorted[1] ?? null }
    })
    .filter(r => r.latest != null)
    .sort((a, b) => a.latest.company_name.localeCompare(b.latest.company_name))
    .slice(0, 8)

  if (rows.length === 0) {
    return (
      <div className="p-4 h-full flex flex-col items-center justify-center gap-1.5 text-center">
        <p className="text-text-tertiary text-sm font-semibold">Nessun dato KPI</p>
        <p className="text-text-tertiary text-xs">Inserisci KPI mensili dai progetti</p>
      </div>
    )
  }

  const latestMonth = rows[0]?.latest.month?.slice(0, 7) ?? ''

  return (
    <div className="p-3 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black text-text-secondary uppercase tracking-wider">KPI Performance</span>
        {latestMonth && (
          <span className="text-[9px] text-text-tertiary bg-surface border border-border rounded px-1.5 py-0.5">
            {new Date(latestMonth + '-01').toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        {rows.map(({ latest, prev }) => {
          const isGrowth = latest.client_type !== 'digital'
          const clientId = latest.client_id

          return (
            <Link
              key={clientId}
              href={`/clienti/${clientId}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <span className={`shrink-0 text-[8px] font-black px-1 py-0.5 rounded leading-none ${
                isGrowth ? 'bg-[#F5C800]/10 text-[#F5C800]' : 'bg-[#3B82F6]/10 text-[#60A5FA]'
              }`}>
                {isGrowth ? 'G' : 'D'}
              </span>

              <span className="text-text-primary text-xs font-semibold truncate flex-1 min-w-0">
                {latest.company_name}
              </span>

              {isGrowth ? (
                <div className="flex items-start gap-3 shrink-0">
                  <KpiCell
                    label="MER"
                    value={fmt(latest.mer, '', '×', 1)}
                    delta={<Delta curr={latest.mer} prev={prev?.mer} />}
                  />
                  <KpiCell
                    label="Revenue"
                    value={fmt(latest.revenue_attributed, '€')}
                    delta={<Delta curr={latest.revenue_attributed} prev={prev?.revenue_attributed} />}
                  />
                  <KpiCell
                    label="Lead"
                    value={fmt(latest.leads_generated, '', '', 0)}
                    delta={<Delta curr={latest.leads_generated} prev={prev?.leads_generated} />}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-3 shrink-0">
                  <KpiCell
                    label="Sessioni"
                    value={fmt(latest.organic_sessions, '', '', 0)}
                    delta={<Delta curr={latest.organic_sessions} prev={prev?.organic_sessions} />}
                  />
                  <KpiCell
                    label="Uptime"
                    value={fmt(latest.uptime, '', '%', 1)}
                    delta={<Delta curr={latest.uptime} prev={prev?.uptime} />}
                  />
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
