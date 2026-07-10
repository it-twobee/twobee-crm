'use client'
import Link from 'next/link'
import { TrendingUp, Clock, AlertTriangle, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface FinancialSummary {
  totalPaid: number
  totalPending: number
  totalOverdue: number
  countPending: number
  countOverdue: number
}

export function FinancialControl({ summary }: { summary: FinancialSummary }) {
  const totalBilled    = summary.totalPaid + summary.totalPending + summary.totalOverdue
  const collectionRate = totalBilled > 0 ? Math.round(summary.totalPaid / totalBilled * 100) : 0

  const cards = [
    { label: 'Fatturato tot.', value: formatCurrency(totalBilled),        icon: <DollarSign     className="w-3.5 h-3.5" />, color: '#888' },
    { label: 'Incassato',      value: formatCurrency(summary.totalPaid),   icon: <TrendingUp     className="w-3.5 h-3.5" />, color: 'var(--color-success)' },
    { label: 'In attesa',      value: formatCurrency(summary.totalPending), icon: <Clock          className="w-3.5 h-3.5" />, color: 'var(--color-gold-text)', sub: `${summary.countPending} fatture` },
    { label: 'In ritardo',     value: formatCurrency(summary.totalOverdue), icon: <AlertTriangle  className="w-3.5 h-3.5" />, color: summary.totalOverdue > 0 ? 'var(--color-error)' : '#333', sub: summary.countOverdue > 0 ? `${summary.countOverdue} fatture` : undefined },
  ]

  return (
    <div className="p-3 h-full flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {cards.map(c => (
          <Link key={c.label} href="/fatturazione"
            className="rounded-lg p-2.5 transition-all block"
            style={{ background: '#111', border: '1px solid #1A1A1A' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${c.color} 27%, transparent)` }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-surface)' }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span style={{ color: c.color }}>{c.icon}</span>
              <span className="text-2xs font-bold uppercase tracking-widest" style={{ color: '#333' }}>{c.label}</span>
            </div>
            <p className="text-base font-black leading-none" style={{ color: c.color }}>{c.value}</p>
            {(c as { sub?: string }).sub && (
              <p className="text-2xs mt-1" style={{ color: 'var(--color-border)' }}>{(c as { sub?: string }).sub}</p>
            )}
          </Link>
        ))}
      </div>

      <div className="mt-auto rounded-lg p-2.5" style={{ background: '#111', border: '1px solid #1A1A1A' }}>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-2xs font-bold uppercase tracking-widest" style={{ color: '#333' }}>Tasso incasso</p>
          <p className="text-sm font-black" style={{
            color: collectionRate >= 80 ? 'var(--color-success)' : collectionRate >= 60 ? 'var(--color-gold-text)' : 'var(--color-error)',
          }}>{collectionRate}%</p>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface)' }}>
          <div className="h-full rounded-full transition-all duration-500" style={{
            width: `${collectionRate}%`,
            background: collectionRate >= 80 ? 'var(--color-success)' : collectionRate >= 60 ? 'var(--color-gold-text)' : 'var(--color-error)',
          }} />
        </div>
        {summary.totalOverdue > 0 && (
          <p className="text-2xs mt-1.5" style={{ color: 'var(--color-error)' }}>
            {formatCurrency(summary.totalOverdue)} di crediti in ritardo
          </p>
        )}
      </div>
    </div>
  )
}
