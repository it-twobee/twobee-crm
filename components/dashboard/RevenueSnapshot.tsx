'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export interface MonthRevenue {
  month: string   // 'YYYY-MM'
  amount: number
  projected?: boolean
}

interface Props {
  months: MonthRevenue[]
  currentMrr: number
}

const MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

function fmt(n: number) {
  if (n >= 1000) return '€' + (n / 1000).toFixed(1) + 'k'
  return '€' + n.toLocaleString('it-IT')
}

export function RevenueSnapshot({ months, currentMrr }: Props) {
  if (!months.length) return null

  const max = Math.max(...months.map(m => m.amount), 1)
  const real = months.filter(m => !m.projected)
  const lastTwo = real.slice(-2)
  const growth = lastTwo.length === 2 && lastTwo[0].amount > 0
    ? Math.round(((lastTwo[1].amount - lastTwo[0].amount) / lastTwo[0].amount) * 100)
    : null

  const projected = months.filter(m => m.projected)
  const projectionAvg = projected.length
    ? Math.round(projected.reduce((s, m) => s + m.amount, 0) / projected.length)
    : null

  return (
    <div className="bg-surface border border-[#2A2A2A] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">Revenue</p>
        <div className="flex items-center gap-1.5 text-xs">
          {growth !== null && (
            <span className={`flex items-center gap-0.5 font-bold ${growth > 0 ? 'text-success' : growth < 0 ? 'text-error' : 'text-text-secondary'}`}>
              {growth > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : growth < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
              {growth > 0 ? '+' : ''}{growth}% MoM
            </span>
          )}
        </div>
      </div>

      {/* Grafico barre */}
      <div className="flex items-end gap-1.5 h-14 mb-1.5">
        {months.map((m, i) => {
          const h = Math.max(4, Math.round((m.amount / max) * 100))
          const isLast = !m.projected && i === real.length - 1
          return (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-0 group relative">
              <div className="w-full rounded-t-sm transition-all duration-500 cursor-pointer"
                style={{
                  height: `${h}%`,
                  background: m.projected ? 'transparent' : isLast ? '#F5C800' : '#2A2A2A',
                  border: m.projected ? '1.5px dashed #333' : 'none',
                  borderBottom: 'none',
                  minHeight: 4,
                }} />
              {/* Tooltip al hover */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-md px-2 py-1 text-center whitespace-nowrap">
                  <p className="text-[9px] text-text-secondary">{MESI[parseInt(m.month.slice(5,7)) - 1]}</p>
                  <p className="text-[10px] font-bold text-white">{fmt(m.amount)}</p>
                  {m.projected && <p className="text-[8px] text-[#444]">proiezione</p>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Etichette mesi */}
      <div className="flex gap-1.5 mb-4">
        {months.map((m, i) => (
          <div key={m.month} className="flex-1 text-center">
            <span className={`text-[8px] ${!m.projected && i === real.length - 1 ? 'text-gold font-bold' : m.projected ? 'text-[#333]' : 'text-[#444]'}`}>
              {MESI[parseInt(m.month.slice(5,7)) - 1]}
            </span>
          </div>
        ))}
      </div>

      {/* Metriche */}
      <div className="flex items-center gap-0 divide-x divide-[#2A2A2A]">
        <div className="flex-1 pr-4">
          <p className="text-[10px] text-text-secondary mb-0.5">MRR contratti</p>
          <p className="text-base font-black text-gold">{fmt(currentMrr)}</p>
        </div>
        {real.length > 0 && (
          <div className="flex-1 px-4">
            <p className="text-[10px] text-text-secondary mb-0.5">Incassato ({MESI[parseInt(real[real.length-1].month.slice(5,7))-1]})</p>
            <p className="text-base font-black text-white">{fmt(real[real.length-1].amount)}</p>
          </div>
        )}
        {projectionAvg && (
          <div className="flex-1 pl-4">
            <p className="text-[10px] text-text-secondary mb-0.5">Proiezione trimestre</p>
            <p className="text-base font-black text-[#555]">{fmt(projectionAvg)}</p>
          </div>
        )}
      </div>

      {/* Legenda proiezione */}
      {projected.length > 0 && (
        <p className="text-[9px] text-[#333] mt-3 flex items-center gap-1">
          <span className="inline-block w-3 border-t border-dashed border-[#333]" />
          proiezione basata sui contratti attivi
        </p>
      )}
    </div>
  )
}
