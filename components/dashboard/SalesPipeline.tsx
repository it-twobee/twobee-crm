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
  { id: 'lead',         label: 'Lead',       color: '#3B82F6' },
  { id: 'contatto',     label: 'Contatto',   color: '#8B5CF6' },
  { id: 'proposta',     label: 'Proposta',   color: '#F59E0B' },
  { id: 'trattativa',   label: 'Trattativa', color: '#F5C800' },
  { id: 'chiuso_vinto', label: 'Vinto',      color: '#22C55E' },
  { id: 'chiuso_perso', label: 'Perso',      color: '#EF4444' },
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
          { label: 'Pipeline', value: formatCurrency(totalPipeline), color: '#F5C800' },
          { label: 'Weighted', value: formatCurrency(weighted),       color: '#22C55E' },
          { label: 'Attivi',   value: String(active.length),          color: '#3B82F6' },
        ].map(k => (
          <div key={k.label} className="rounded-lg p-2" style={{ background: '#111', border: '1px solid #1A1A1A' }}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#333' }}>{k.label}</p>
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
              <p className="w-[68px] text-[9px] font-bold shrink-0" style={{ color: s.color }}>{s.label}</p>
              <div className="flex-1 h-5 relative rounded-sm overflow-hidden" style={{ background: '#0D0D0D' }}>
                <div className="absolute inset-y-0 left-0 rounded-sm transition-all" style={{ width: `${barW}%`, background: s.color + '22' }} />
                <span className="absolute inset-y-0 left-2 flex items-center text-[9px] font-bold" style={{ color: s.color }}>
                  {stageDeals.length}
                </span>
              </div>
              <p className="w-[68px] shrink-0 text-right text-[9px]" style={{ color: '#444' }}>
                {stageValue > 0 ? formatCurrency(stageValue) : '—'}
              </p>
            </div>
          )
        })}
      </div>

      {/* Top active deals */}
      {active.length > 0 && (
        <div className="space-y-1.5 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#222' }}>Top deal attivi</p>
          {active
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
            .slice(0, 4)
            .map(d => {
              const stg = STAGES.find(s => s.id === d.stage)
              return (
                <Link key={d.id} href="/commerciale"
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 block transition-all"
                  style={{ background: '#111', border: '1px solid #1A1A1A' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = (stg?.color ?? '#444') + '44' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1A1A1A' }}>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: stg?.color ?? '#555' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold truncate text-white">{d.title}</p>
                    <p className="text-[9px] truncate" style={{ color: '#333' }}>{d.company_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-bold" style={{ color: '#888' }}>{d.value ? formatCurrency(d.value) : '—'}</p>
                    <p className="text-[9px]" style={{ color: '#333' }}>{d.probability ?? 50}%</p>
                  </div>
                </Link>
              )
            })}
        </div>
      )}

      {active.length === 0 && (
        <p className="text-[10px] text-center py-2" style={{ color: '#2A2A2A' }}>Nessun deal attivo</p>
      )}
    </div>
  )
}
