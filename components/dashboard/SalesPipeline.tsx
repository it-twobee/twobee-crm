'use client'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'

export interface DealFull {
  id: string
  title: string
  value: number | null
  stage: string
  probability: number | null
  expected_close: string | null
  company_name: string
}

const STAGES = [
  { id: 'lead',         label: 'Lead',       color: 'var(--color-info)' },
  { id: 'contatto',     label: 'Contatto',   color: 'var(--color-accent)' },
  { id: 'proposta',     label: 'Proposta',   color: 'var(--color-warning)' },
  { id: 'trattativa',   label: 'Trattativa', color: 'var(--color-gold-text)' },
  { id: 'chiuso_vinto', label: 'Vinto',      color: 'var(--color-success)' },
  { id: 'chiuso_perso', label: 'Perso',      color: 'var(--color-error)' },
]

export function SalesPipeline({ deals }: { deals: DealFull[] }) {
  const active       = deals.filter(d => !['chiuso_vinto', 'chiuso_perso'].includes(d.stage))
  const totalPipeline = active.reduce((s, d) => s + (d.value ?? 0), 0)
  const weighted      = active.reduce((s, d) => s + (d.value ?? 0) * ((d.probability ?? 50) / 100), 0)

  const byStage: Record<string, DealFull[]> = {}
  for (const s of STAGES) byStage[s.id] = deals.filter(d => d.stage === s.id)

  const maxCount = Math.max(...STAGES.map(s => byStage[s.id].length), 1)

  return (
    <div className="p-3 h-full overflow-auto flex flex-col gap-3">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 shrink-0">
        {[
          { label: 'Pipeline', value: formatCurrency(totalPipeline), color: 'var(--color-gold-text)' },
          { label: 'Weighted', value: formatCurrency(weighted),       color: 'var(--color-success)' },
          { label: 'Attivi',   value: String(active.length),          color: 'var(--color-info)' },
        ].map(k => (
          <div key={k.label} className="rounded-lg p-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <p className="text-2xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-tertiary)' }}>{k.label}</p>
            <p className="text-sm font-black leading-none" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Funnel bars */}
      <div className="space-y-1 shrink-0">
        {STAGES.filter(s => s.id !== 'chiuso_perso').map(s => {
          const stageDeals = byStage[s.id] ?? []
          const stageValue = stageDeals.reduce((sum, d) => sum + (d.value ?? 0), 0)
          const barW = maxCount > 0 ? (stageDeals.length / maxCount) * 100 : 0
          return (
            <div key={s.id} className="flex items-center gap-2">
              <p className="w-[68px] text-2xs font-bold shrink-0" style={{ color: s.color }}>{s.label}</p>
              <div className="flex-1 h-5 relative rounded-sm overflow-hidden" style={{ background: 'var(--color-surface)' }}>
                <div className="absolute inset-y-0 left-0 rounded-sm transition-all" style={{ width: `${barW}%`, background: `color-mix(in srgb, ${s.color} 13%, transparent)` }} />
                <span className="absolute inset-y-0 left-2 flex items-center text-2xs font-bold" style={{ color: s.color }}>
                  {stageDeals.length}
                </span>
              </div>
              <p className="w-[68px] shrink-0 text-right text-2xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {stageValue > 0 ? formatCurrency(stageValue) : '—'}
              </p>
            </div>
          )
        })}
      </div>

      {/* Top active deals */}
      {active.length > 0 && (
        <div className="space-y-1.5 flex-1">
          <p className="text-2xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>Top deal attivi</p>
          {active
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
            .slice(0, 4)
            .map(d => {
              const stg = STAGES.find(s => s.id === d.stage)
              return (
                <Link key={d.id} href="/commerciale"
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 block transition-all"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = (stg?.color ?? '#444') + '44' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)' }}>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: stg?.color ?? '#555' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-2xs font-semibold truncate text-text-primary">{d.title}</p>
                    <p className="text-2xs truncate" style={{ color: 'var(--color-text-tertiary)' }}>{d.company_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xs font-bold" style={{ color: 'var(--color-text-secondary)' }}>{d.value ? formatCurrency(d.value) : '—'}</p>
                    <p className="text-2xs" style={{ color: 'var(--color-text-tertiary)' }}>{d.probability ?? 50}%</p>
                  </div>
                </Link>
              )
            })}
        </div>
      )}

      {active.length === 0 && (
        <p className="text-2xs text-center py-2" style={{ color: 'var(--color-text-tertiary)' }}>Nessun deal attivo</p>
      )}
    </div>
  )
}
