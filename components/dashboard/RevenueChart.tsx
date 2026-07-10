'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  ComposedChart, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Calendar, ChevronLeft, ChevronRight,
         AreaChart as AreaIcon, BarChart2, LineChart as LineIcon, Layers } from 'lucide-react'
import type { MonthRevenue } from './RevenueSnapshot'

// Il gestionale è partito a Marzo 2026
const BUSINESS_START = '2026-03'

const MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

function fmt(n: number) {
  if (n >= 1000) return '€' + (n / 1000).toFixed(1) + 'k'
  return '€' + n.toLocaleString('it-IT')
}

// ── MONTH PICKER ─────────────────────────────────────────────────
function MonthPicker({ label, value, onChange, min, max }: {
  label: string; value: string; onChange: (v: string) => void; min: string; max: string
}) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => parseInt(value.slice(0, 4)))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const selYear = parseInt(value.slice(0, 4))
  const selM    = parseInt(value.slice(5, 7)) - 1
  const minY = parseInt(min.slice(0, 4)); const minMo = parseInt(min.slice(5, 7)) - 1
  const maxY = parseInt(max.slice(0, 4)); const maxMo = parseInt(max.slice(5, 7)) - 1

  const isDisabled = (y: number, m: number) =>
    y < minY || (y === minY && m < minMo) || y > maxY || (y === maxY && m > maxMo)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(v => !v); setViewYear(selYear) }}
        className="flex items-center gap-2 h-8 px-3 rounded-lg bg-surface border border-border text-2xs hover:border-border-strong transition-colors"
      >
        <Calendar className="w-3 h-3 text-text-secondary shrink-0" />
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-primary font-semibold">{MESI[selM]} {selYear}</span>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-50 w-48 bg-surface border border-border rounded-xl shadow-2xl p-3">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setViewYear(y => Math.max(minY, y - 1))}
              disabled={viewYear <= minY}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary disabled:opacity-20 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-bold text-text-primary">{viewYear}</span>
            <button
              onClick={() => setViewYear(y => Math.min(maxY, y + 1))}
              disabled={viewYear >= maxY}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary disabled:opacity-20 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MESI.map((m, i) => {
              const dis = isDisabled(viewYear, i)
              const sel = viewYear === selYear && i === selM
              return (
                <button key={m} disabled={dis}
                  onClick={() => { onChange(`${viewYear}-${String(i + 1).padStart(2, '0')}`); setOpen(false) }}
                  className={`py-1.5 rounded-lg text-2xs font-medium transition-all ${
                    sel ? 'bg-gold text-on-gold font-bold'
                    : dis ? 'text-text-tertiary cursor-not-allowed'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── TOOLTIP ──────────────────────────────────────────────────────
interface Vis { incassato: boolean; mrr: boolean; proiezione: boolean }

function ChartTooltip({ active, payload, label, vis, currentMrr }: {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string }>
  label?: string
  vis: Vis
  currentMrr: number
}) {
  if (!active || !payload?.length) return null
  const NAMES: Record<string, string> = {
    incassato: 'Incassato', proiezione: 'Proiezione', mrr: 'MRR contratti'
  }
  const items = payload.filter(p =>
    p.value != null && (p.dataKey === 'mrr' ? vis.mrr : vis[p.dataKey as keyof Vis])
  )
  if (!items.length) return null

  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3 shadow-2xl min-w-[180px]">
      <p className="text-2xs font-bold text-text-secondary uppercase tracking-widest mb-2.5">{label}</p>
      {items.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6 mb-1.5 last:mb-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.dataKey === 'incassato' ? 'var(--color-gold-text)' : p.dataKey === 'proiezione' ? '#555' : 'var(--color-gold-text)' }} />
            <span className="text-2xs text-text-secondary">{NAMES[p.dataKey]}</span>
          </div>
          <span className="text-xs font-bold text-text-primary tabular-nums">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── TIPI GRAFICO ─────────────────────────────────────────────────
type ChartType = 'area' | 'line' | 'bar' | 'combo'

const CHART_TYPES: { type: ChartType; icon: React.ReactNode; label: string }[] = [
  { type: 'area',  icon: <AreaIcon className="w-3.5 h-3.5" />,  label: 'Area'   },
  { type: 'line',  icon: <LineIcon className="w-3.5 h-3.5" />,  label: 'Linea'  },
  { type: 'bar',   icon: <BarChart2 className="w-3.5 h-3.5" />, label: 'Barre'  },
  { type: 'combo', icon: <Layers className="w-3.5 h-3.5" />,    label: 'Combo'  },
]

// ── MAIN ─────────────────────────────────────────────────────────
const PRESETS = [
  { label: '3M', n: 3 },
  { label: '6M', n: 6 },
  { label: '12M', n: 12 },
  { label: 'Tutto', n: 999 },
]

interface Props { months: MonthRevenue[]; currentMrr: number }

export function RevenueChart({ months, currentMrr }: Props) {
  const allReal = useMemo(() => months.filter(m => !m.projected), [months])
  const allProj = useMemo(() => months.filter(m => m.projected), [months])

  // Bounds: parte sempre da BUSINESS_START se disponibile
  const minMonth = useMemo(() => {
    const hasStart = allReal.find(m => m.month === BUSINESS_START)
    return hasStart ? BUSINESS_START : (allReal[0]?.month ?? BUSINESS_START)
  }, [allReal])

  const maxMonth = useMemo(() =>
    (allProj.length ? allProj[allProj.length - 1] : allReal[allReal.length - 1])?.month ?? BUSINESS_START
  , [allReal, allProj])

  const [rangeStart, setRangeStart] = useState<string>(BUSINESS_START)
  const [rangeEnd, setRangeEnd]     = useState<string>(maxMonth)
  const [activePreset, setActivePreset] = useState<string>('')
  const [chartType, setChartType]   = useState<ChartType>('area')
  const [vis, setVis] = useState<Vis>({ incassato: true, mrr: true, proiezione: true })

  if (!months.length) return null

  const applyPreset = (label: string, n: number) => {
    setActivePreset(label)
    setRangeStart(allReal[Math.max(0, allReal.length - n)]?.month ?? minMonth)
    setRangeEnd(maxMonth)
  }

  const toggle = (k: keyof Vis) => setVis(v => ({ ...v, [k]: !v[k] }))

  const filtered = months.filter(m => m.month >= rangeStart && m.month <= rangeEnd)
  const realInRange = filtered.filter(m => !m.projected)

  const data = filtered.map((m, i) => ({
    mese: `${MESI[parseInt(m.month.slice(5, 7)) - 1]} '${m.month.slice(2, 4)}`,
    incassato: !m.projected ? m.amount : undefined,
    proiezione: m.projected ? m.amount : undefined,
    mrr: currentMrr,
    isProjected: m.projected,
  }))

  const last2  = realInRange.slice(-2)
  const growth = last2.length === 2 && last2[0].amount > 0
    ? Math.round(((last2[1].amount - last2[0].amount) / last2[0].amount) * 100) : null
  const lastMonth = realInRange[realInRange.length - 1]
  const total     = realInRange.reduce((s, m) => s + m.amount, 0)
  const yMax      = Math.ceil(Math.max(...filtered.map(m => m.amount), currentMrr) * 1.3 / 1000) * 1000

  // ── SHARED AXES ──────────────────────────────────────────────
  const sharedAxes = (
    <>
      <CartesianGrid vertical={false} stroke="#1A1A1A" />
      <XAxis dataKey="mese" tick={{ fill: '#555', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} dy={6} interval="preserveStartEnd" />
      <YAxis domain={[0, yMax]} tick={{ fill: '#333', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={fmt} width={44} />
      <Tooltip content={<ChartTooltip vis={vis} currentMrr={currentMrr} />} cursor={{ stroke: 'var(--color-gold-text)', strokeWidth: 1, strokeOpacity: 0.15 }} />
      {vis.mrr && <ReferenceLine y={currentMrr} stroke="#F5C800" strokeDasharray="5 4" strokeOpacity={0.28} label={{ value: 'MRR', position: 'insideTopRight', fill: 'var(--color-gold-text)', fontSize: 9, opacity: 0.5 }} />}
    </>
  )

  const margin = { top: 8, right: 8, left: 0, bottom: 0 }

  // ── DEFS (gradienti) ─────────────────────────────────────────
  const defs = (
    <defs>
      <linearGradient id="fillI" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stopColor="#F5C800" stopOpacity={0.18} />
        <stop offset="90%" stopColor="#F5C800" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="fillP" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stopColor="#444" stopOpacity={0.12} />
        <stop offset="90%" stopColor="#444" stopOpacity={0} />
      </linearGradient>
    </defs>
  )

  // ── RENDER GRAFICO ───────────────────────────────────────────
  const renderChart = () => {
    if (chartType === 'area') return (
      <AreaChart data={data} margin={margin}>
        {defs}{sharedAxes}
        {vis.proiezione && <Area dataKey="proiezione" stroke="#555" strokeWidth={1.5} strokeDasharray="5 3" fill="url(#fillP)" dot={false} activeDot={{ r: 4, fill: '#666', stroke: '#111', strokeWidth: 2 }} connectNulls={false} />}
        {vis.incassato  && <Area dataKey="incassato"  stroke="#F5C800" strokeWidth={2.5} strokeDasharray="" strokeLinecap="round" fill="url(#fillI)"
          dot={(p: { cx: number; cy: number }) => <circle key={`d-${p.cx}`} cx={p.cx} cy={p.cy} r={4} fill="#F5C800" stroke="#111" strokeWidth={2} />}
          activeDot={{ r: 6, fill: 'var(--color-gold-text)', stroke: '#111', strokeWidth: 2.5 }} connectNulls={false}
          style={{ filter: 'drop-shadow(0 0 7px var(--color-gold-dim))' }} />}
      </AreaChart>
    )

    if (chartType === 'line') return (
      <LineChart data={data} margin={margin}>
        {defs}{sharedAxes}
        {vis.proiezione && <Line dataKey="proiezione" stroke="#555" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 4, fill: '#666', stroke: '#111', strokeWidth: 2 }} connectNulls={false} />}
        {vis.incassato  && <Line dataKey="incassato"  stroke="#F5C800" strokeWidth={3} strokeLinecap="round"
          dot={(p: { cx: number; cy: number }) => <circle key={`d-${p.cx}`} cx={p.cx} cy={p.cy} r={4} fill="#F5C800" stroke="#111" strokeWidth={2} />}
          activeDot={{ r: 6, fill: 'var(--color-gold-text)', stroke: '#111', strokeWidth: 2.5 }} connectNulls={false}
          style={{ filter: 'drop-shadow(0 0 7px var(--color-gold-dim))' }} />}
      </LineChart>
    )

    if (chartType === 'bar') return (
      <BarChart data={data} margin={margin} barCategoryGap="30%">
        {defs}{sharedAxes}
        {vis.incassato && (
          <Bar dataKey="incassato" radius={[3, 3, 0, 0]} maxBarSize={32}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.isProjected ? 'var(--color-border)' : 'var(--color-gold-text)'} fillOpacity={entry.isProjected ? 0.5 : 0.85} />
            ))}
          </Bar>
        )}
        {vis.proiezione && <Bar dataKey="proiezione" fill="#333" radius={[3, 3, 0, 0]} maxBarSize={32} fillOpacity={0.5} />}
      </BarChart>
    )

    // combo: barre + linea MRR
    return (
      <ComposedChart data={data} margin={margin} barCategoryGap="30%">
        {defs}{sharedAxes}
        {vis.incassato && (
          <Bar dataKey="incassato" radius={[3, 3, 0, 0]} maxBarSize={32}>
            {data.map((entry, i) => (
              <Cell key={i} fill="#F5C800" fillOpacity={entry.isProjected ? 0.25 : 0.75} />
            ))}
          </Bar>
        )}
        {vis.proiezione && <Bar dataKey="proiezione" fill="#333" radius={[3, 3, 0, 0]} maxBarSize={32} fillOpacity={0.4} />}
        {vis.incassato && (
          <Line dataKey="incassato" stroke="#F5C800" strokeWidth={2} strokeLinecap="round"
            dot={(p: { cx: number; cy: number }) => <circle key={`d-${p.cx}`} cx={p.cx} cy={p.cy} r={3} fill="#F5C800" stroke="#111" strokeWidth={1.5} />}
            activeDot={{ r: 5, fill: 'var(--color-gold-text)', stroke: '#111', strokeWidth: 2 }} connectNulls={false} />
        )}
      </ComposedChart>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col h-full">

      {/* ── HEADER KPI ── */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
        <div>
          <p className="text-2xs font-bold text-text-secondary uppercase tracking-widest mb-1">Revenue</p>
          <p className="text-2xl font-black text-gold-text leading-none">
            {fmt(currentMrr)}
            <span className="text-sm text-text-secondary font-normal ml-2">/mese MRR</span>
          </p>
        </div>
        <div className="flex items-start gap-6 shrink-0">
          {lastMonth && (
            <div className="text-right">
              <p className="text-2xs text-text-secondary mb-0.5">Incassato {MESI[parseInt(lastMonth.month.slice(5,7))-1]}</p>
              <p className="text-xl font-black text-text-primary">{fmt(lastMonth.amount)}</p>
            </div>
          )}
          {realInRange.length > 1 && (
            <div className="text-right">
              <p className="text-2xs text-text-secondary mb-0.5">Tot. periodo</p>
              <p className="text-xl font-black text-text-primary">{fmt(total)}</p>
            </div>
          )}
          {growth !== null && (
            <div className={`text-right ${growth > 0 ? 'text-success' : growth < 0 ? 'text-error' : 'text-text-secondary'}`}>
              <p className="text-2xs text-text-secondary mb-0.5">MoM</p>
              <p className="text-xl font-black flex items-center gap-1 justify-end">
                {growth > 0 ? <TrendingUp className="w-4 h-4" /> : growth < 0 ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                {growth > 0 ? '+' : ''}{growth}%
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── TOOLBAR ── */}
      <div className="flex items-center justify-between gap-3 px-5 pb-3 flex-wrap">
        {/* Sinistra: preset + calendario */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg border border-border overflow-hidden bg-surface">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p.label, p.n)}
                className={`h-8 px-3.5 text-2xs font-bold transition-all border-r border-border last:border-r-0 ${
                  activePreset === p.label ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-border" />

          <MonthPicker label="Da" value={rangeStart}
            onChange={v => { if (v <= rangeEnd) { setRangeStart(v); setActivePreset('') } }}
            min={BUSINESS_START} max={rangeEnd} />
          <span className="text-text-tertiary text-xs">→</span>
          <MonthPicker label="A" value={rangeEnd}
            onChange={v => { if (v >= rangeStart) { setRangeEnd(v); setActivePreset('') } }}
            min={rangeStart} max={maxMonth} />
        </div>

        {/* Destra: tipo di grafico */}
        <div className="flex items-center rounded-lg border border-border overflow-hidden bg-surface">
          {CHART_TYPES.map(ct => (
            <button key={ct.type} onClick={() => setChartType(ct.type)}
              title={ct.label}
              className={`h-8 px-3 flex items-center justify-center transition-all border-r border-border last:border-r-0 ${
                chartType === ct.type ? 'bg-surface-active text-gold-text' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              {ct.icon}
            </button>
          ))}
        </div>
      </div>

      {/* ── GRAFICO ── */}
      <div className="flex-1 min-h-0 px-2">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>

      {/* ── LEGENDA TOGGLE ── */}
      <div className="flex items-center gap-1 px-5 py-3 border-t border-border flex-wrap">
        <button onClick={() => toggle('incassato')}
          className={`flex items-center gap-2 h-8 px-3 rounded-lg text-2xs font-medium border transition-all ${
            vis.incassato ? 'border-gold/20 bg-gold/10 text-gold-text' : 'border-transparent text-text-tertiary hover:text-text-secondary'
          }`}
        >
          <span className="w-4 h-[2.5px] rounded-full block" style={{ background: vis.incassato ? 'var(--color-gold-text)' : '#333' }} />
          Incassato
        </button>
        <button onClick={() => toggle('mrr')}
          className={`flex items-center gap-2 h-8 px-3 rounded-lg text-2xs font-medium border transition-all ${
            vis.mrr ? 'border-border bg-surface-active text-text-secondary' : 'border-transparent text-text-tertiary hover:text-text-secondary'
          }`}
        >
          <span className="w-4 shrink-0 inline-block" style={{ borderTop: `2px dashed ${vis.mrr ? 'var(--color-gold-text)' : '#333'}` }} />
          MRR contratti
        </button>
        <button onClick={() => toggle('proiezione')}
          className={`flex items-center gap-2 h-8 px-3 rounded-lg text-2xs font-medium border transition-all ${
            vis.proiezione ? 'border-border bg-surface-active text-text-secondary' : 'border-transparent text-text-tertiary hover:text-text-secondary'
          }`}
        >
          <span className="w-4 shrink-0 inline-block" style={{ borderTop: `2px dashed ${vis.proiezione ? '#555' : '#333'}` }} />
          Proiezione
        </button>
      </div>
    </div>
  )
}
