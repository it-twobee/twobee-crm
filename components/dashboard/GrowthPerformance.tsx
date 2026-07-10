'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import Link from 'next/link'
import type { Client } from '@/lib/types/database'

export interface GrowthKpiRow {
  client_id: string
  month: string
  revenue_attributed: number | null
  mer: number | null
  leads_generated: number | null
}

function fmtEur(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `€${(v / 1_000).toFixed(1)}k`
  return `€${Math.round(v)}`
}

// Mini sparkline SVG da una serie di valori
function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values.map((v) => v ?? 0)
  if (pts.length < 2) return <div className="w-16 h-5" />
  const W = 64, H = 20
  const max = Math.max(...pts, 1), min = Math.min(...pts, 0)
  const range = max - min || 1
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * W)
  const ys = pts.map((v) => H - ((v - min) / range) * (H - 2) - 1)
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2" fill={color} />
    </svg>
  )
}

function changePct(series: number[]): number | null {
  const vals = series.filter((v) => v != null && v > 0)
  if (vals.length < 2) return null
  const first = vals[0], last = vals[vals.length - 1]
  if (first === 0) return null
  return ((last - first) / first) * 100
}

export function GrowthPerformance({ clients, kpis }: { clients: Client[]; kpis: GrowthKpiRow[] }) {
  const growthIds = new Set(
    clients.filter((c) => c.client_type === 'growth' || c.client_type === 'growth_digital').map((c) => c.id)
  )
  const nameById = Object.fromEntries(clients.map((c) => [c.id, c.company_name]))

  const months = Array.from(new Set(kpis.map((k) => k.month.slice(0, 7)))).sort()
  const latestMonth = months[months.length - 1]

  // Serie revenue per cliente growth
  const perClient = Array.from(growthIds).map((cid) => {
    const rows = kpis.filter((k) => k.client_id === cid).sort((a, b) => a.month.localeCompare(b.month))
    const series = months.map((m) => rows.find((r) => r.month.slice(0, 7) === m)?.revenue_attributed ?? null)
    const latestRev = [...series].reverse().find((v) => v != null) ?? null
    const cp = changePct(series.map((v) => v ?? 0))
    return { cid, name: nameById[cid] ?? '—', series, latestRev, cp }
  }).filter((r) => r.series.some((v) => v != null))
    .sort((a, b) => (b.latestRev ?? 0) - (a.latestRev ?? 0))

  // Aggregati
  const growthClients = clients.filter((c) => growthIds.has(c.id))
  const avgMrr = growthClients.length
    ? Math.round(growthClients.reduce((s, c) => s + (c.mrr ?? 0), 0) / growthClients.length)
    : 0
  const monthlyTotals = months.map((m) =>
    kpis.filter((k) => k.month.slice(0, 7) === m && growthIds.has(k.client_id))
      .reduce((s, k) => s + (k.revenue_attributed ?? 0), 0)
  )
  const totalLatest = monthlyTotals[monthlyTotals.length - 1] ?? 0
  const growing = perClient.filter((r) => r.cp != null && r.cp > 2).length
  const declining = perClient.filter((r) => r.cp != null && r.cp < -2).length

  if (perClient.length === 0) {
    return (
      <div className="p-4 h-full flex flex-col items-center justify-center gap-1.5 text-center">
        <p className="text-text-tertiary text-sm font-semibold">Nessun dato Growth</p>
        <p className="text-text-tertiary text-xs">Inserisci i KPI mensili dei clienti growth</p>
      </div>
    )
  }

  const Stat = ({ label, value, color = '#fff' }: { label: string; value: string; color?: string }) => (
    <div className="flex-1 min-w-0">
      <div className="text-2xs text-text-tertiary uppercase tracking-wider truncate">{label}</div>
      <div className="text-base font-black leading-tight" style={{ color }}>{value}</div>
    </div>
  )

  return (
    <div className="p-3 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xs font-black text-text-tertiary uppercase tracking-wider">Growth Performance</span>
        {latestMonth && (
          <span className="text-2xs text-text-tertiary bg-surface border border-border rounded px-1.5 py-0.5">
            {new Date(latestMonth + '-01').toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}
          </span>
        )}
      </div>

      {/* Aggregati */}
      <div className="flex items-stretch gap-2 mb-3">
        <Stat label="MRR medio" value={fmtEur(avgMrr)} color="#F5C800" />
        <Stat label="Revenue tot" value={fmtEur(totalLatest)} />
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-0.5 text-xs font-bold text-success"><TrendingUp className="w-3 h-3" />{growing}</span>
          <span className="flex items-center gap-0.5 text-xs font-bold text-error"><TrendingDown className="w-3 h-3" />{declining}</span>
        </div>
      </div>

      {/* Trend aggregato */}
      <div className="flex items-center gap-2 mb-3 bg-surface border border-border rounded-lg px-2.5 py-2">
        <span className="text-2xs text-text-tertiary uppercase tracking-wider shrink-0">Trend</span>
        <div className="flex-1" />
        <Sparkline values={monthlyTotals} color="#F5C800" />
      </div>

      {/* Ranking clienti */}
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        {perClient.map((r, i) => {
          const flat = r.cp == null || Math.abs(r.cp) < 2
          const good = !flat && (r.cp ?? 0) > 0
          const color = flat ? '#444' : good ? 'var(--color-success)' : 'var(--color-error)'
          const Icon = flat ? Minus : good ? TrendingUp : TrendingDown
          return (
            <Link key={r.cid} href={`/clienti/${r.cid}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface transition-colors">
              <span className="text-2xs font-black text-text-tertiary w-4 shrink-0">{i + 1}</span>
              <span className="text-text-primary text-xs font-semibold truncate flex-1 min-w-0">{r.name}</span>
              <Sparkline values={r.series} color={good ? 'var(--color-success)' : flat ? '#888' : 'var(--color-error)'} />
              <span className="text-xs font-bold text-text-primary text-right w-14 shrink-0">{fmtEur(r.latestRev)}</span>
              <span className="flex items-center gap-0.5 text-2xs font-bold w-10 justify-end shrink-0" style={{ color }}>
                <Icon className="w-2.5 h-2.5" />{flat ? '—' : `${Math.abs(r.cp ?? 0).toFixed(0)}%`}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
