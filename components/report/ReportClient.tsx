'use client'

import { useState, useMemo } from 'react'
import {
  Download, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Target, Search, Filter, ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import type { Client, ClientKpi } from '@/lib/types/database'

interface Props { clients: Client[]; kpis: ClientKpi[] }

const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const ml = (m: string) => { const [y, mo] = m.split('-'); return `${MONTH_LABELS[parseInt(mo) - 1]} ${y}` }
const mlShort = (m: string) => { const [, mo] = m.split('-'); return MONTH_LABELS[parseInt(mo) - 1] }

function delta(actual: number | null, target: number | null, lower = false) {
  if (!actual || !target) return null
  const pct = lower ? ((target - actual) / target) * 100 : ((actual - target) / target) * 100
  return pct
}

function healthScore(kpi: ClientKpi | undefined, c: Client): number {
  if (!kpi) return 0
  const checks = [
    delta(kpi.roas, c.target_roas),
    delta(kpi.leads_generated, c.target_leads_monthly),
    delta(kpi.conversion_rate, c.target_conv_rate),
    delta(kpi.revenue_attributed, c.target_revenue_monthly),
    delta(kpi.cpa, c.target_cpa, true),
  ].filter((x) => x !== null) as number[]
  if (checks.length === 0) return 50
  const scores = checks.map((p) => p >= 10 ? 100 : p >= 0 ? 80 : p >= -15 ? 55 : p >= -30 ? 30 : 10)
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

function ScorePill({ score }: { score: number }) {
  const [cls, label] =
    score === 0 ? ['text-text-tertiary bg-surface border-border', 'N/D'] :
    score >= 75 ? ['text-success bg-success/10 border-success/20', 'Ottimo'] :
    score >= 50 ? ['text-warning bg-warning/10 border-warning/20', 'Normale'] :
    score >= 25 ? ['text-orange bg-orange/10 border-orange/20', 'Attenzione'] :
    ['text-error bg-error/10 border-error/20', 'Critico']
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      <span className="text-2xs font-black">{score || '—'}</span>
      {label}
    </span>
  )
}

function KpiVsTarget({ actual, target, lower = false, fmt = (v: number) => v.toString() }: {
  actual: number | null; target: number | null; lower?: boolean; fmt?: (v: number) => string
}) {
  if (!actual) return <span className="text-text-secondary">—</span>
  const pct = delta(actual, target, lower)
  const color = pct === null ? 'text-text-primary' : pct >= 0 ? 'text-success' : pct >= -20 ? 'text-warning' : 'text-error'
  return (
    <div>
      <span className={`text-sm font-semibold ${color}`}>{fmt(actual)}</span>
      {target && pct !== null && (
        <span className={`ml-1 text-2xs ${color}`}>
          {pct >= 0 ? <TrendingUp className="w-2.5 h-2.5 inline" /> : <TrendingDown className="w-2.5 h-2.5 inline" />}
          {' '}{Math.abs(pct).toFixed(0)}%
        </span>
      )}
    </div>
  )
}

type SortKey = 'company_name' | 'mrr' | 'score' | 'roas' | 'leads' | 'revenue' | 'cpa'
type SortDir = 'asc' | 'desc'

export function ReportClient({ clients, kpis }: Props) {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [activeTab, setActiveTab] = useState(0)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'growth' | 'digital'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'good' | 'warn' | 'bad'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('mrr')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const months = useMemo(() =>
    Array.from(new Set(kpis.map((k) => k.month.slice(0, 7)))).sort().reverse(), [kpis])

  const monthKpis = useMemo(() =>
    kpis.filter((k) => k.month.startsWith(selectedMonth)), [kpis, selectedMonth])

  // Calcola dati per ogni cliente
  const clientData = useMemo(() => clients.map((c) => {
    const kpi = monthKpis.find((k) => k.client_id === c.id)
    const score = healthScore(kpi, c)
    const statusGroup = score === 0 ? 'none' : score >= 75 ? 'good' : score >= 40 ? 'warn' : 'bad'
    return { c, kpi, score, statusGroup }
  }), [clients, monthKpis])

  // Filtri + sort
  const filtered = useMemo(() => {
    let rows = clientData
    if (search) rows = rows.filter(({ c }) => c.company_name.toLowerCase().includes(search.toLowerCase()))
    if (filterType !== 'all') rows = rows.filter(({ c }) => c.client_type === filterType)
    if (filterStatus !== 'all') rows = rows.filter(({ statusGroup }) => statusGroup === filterStatus)
    return [...rows].sort((a, b) => {
      let va: number, vb: number
      if (sortKey === 'company_name') return sortDir === 'asc'
        ? a.c.company_name.localeCompare(b.c.company_name)
        : b.c.company_name.localeCompare(a.c.company_name)
      if (sortKey === 'mrr') { va = a.c.mrr; vb = b.c.mrr }
      else if (sortKey === 'score') { va = a.score; vb = b.score }
      else if (sortKey === 'roas') { va = a.kpi?.roas ?? -1; vb = b.kpi?.roas ?? -1 }
      else if (sortKey === 'leads') { va = a.kpi?.leads_generated ?? -1; vb = b.kpi?.leads_generated ?? -1 }
      else if (sortKey === 'revenue') { va = a.kpi?.revenue_attributed ?? -1; vb = b.kpi?.revenue_attributed ?? -1 }
      else { va = a.kpi?.cpa ?? 9999; vb = b.kpi?.cpa ?? 9999 }
      return sortDir === 'asc' ? va - vb : vb - va
    })
  }, [clientData, search, filterType, filterStatus, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // KPI aggregati
  const agg = useMemo(() => {
    const withKpi = filtered.filter(({ kpi }) => kpi)
    return {
      totalMrr: filtered.reduce((s, { c }) => s + c.mrr, 0),
      avgRoas: withKpi.filter(({ kpi }) => kpi?.roas).length
        ? withKpi.reduce((s, { kpi }) => s + (kpi?.roas ?? 0), 0) / withKpi.filter(({ kpi }) => kpi?.roas).length
        : null,
      totalLeads: withKpi.reduce((s, { kpi }) => s + (kpi?.leads_generated ?? 0), 0),
      totalRevenue: withKpi.reduce((s, { kpi }) => s + (kpi?.revenue_attributed ?? 0), 0),
      totalSpend: withKpi.reduce((s, { kpi }) => s + (kpi?.ad_spend ?? 0), 0),
      avgScore: filtered.filter(({ score }) => score > 0).length
        ? Math.round(filtered.filter(({ score }) => score > 0).reduce((s, { score }) => s + score, 0) / filtered.filter(({ score }) => score > 0).length)
        : 0,
      atRisk: filtered.filter(({ statusGroup }) => statusGroup === 'bad').length,
      noData: filtered.filter(({ score }) => score === 0).length,
    }
  }, [filtered])

  // Alert intelligenti
  const alerts = useMemo(() => {
    const list: { type: 'bad' | 'warn' | 'ok'; msg: string; sub: string }[] = []
    clientData.forEach(({ c, kpi, score }) => {
      if (score > 0 && score < 30) list.push({ type: 'bad', msg: `KPI critici — ${c.company_name}`, sub: `Health score ${score}/100 · ROAS ${kpi?.roas ?? '—'}× vs target ${c.target_roas ?? '—'}×` })
      if (!kpi) list.push({ type: 'warn', msg: `Nessun dato KPI — ${c.company_name}`, sub: `Inserisci i KPI di ${ml(selectedMonth)} dalla pagina cliente` })
    })
    // Forecast MRR a rischio
    const churnMrr = clientData.filter(({ c }) => c.client_label === 'in_bilico' || c.client_label === 'perso').reduce((s, { c }) => s + c.mrr, 0)
    if (churnMrr > 0) list.push({ type: 'warn', msg: `€${churnMrr.toLocaleString('it-IT')} MRR a rischio churn`, sub: `${clientData.filter(({ c }) => c.client_label === 'in_bilico').length} clienti in bilico · ${clientData.filter(({ c }) => c.client_label === 'perso').length} persi` })
    return list.slice(0, 6)
  }, [clientData, selectedMonth])

  // Dati grafici
  const chartData = useMemo(() => filtered
    .filter(({ kpi }) => kpi?.roas || kpi?.revenue_attributed)
    .map(({ c, kpi }) => ({
      name: c.company_name.split(' ')[0],
      ROAS: kpi?.roas ?? 0,
      'ROAS target': c.target_roas ?? undefined,
      Lead: kpi?.leads_generated ?? 0,
      Revenue: kpi?.revenue_attributed ?? 0,
      Spesa: kpi?.ad_spend ?? 0,
      Score: healthScore(kpi, c),
    })), [filtered])

  // Trend MRR ultimi 6 mesi
  const mrrTrend = useMemo(() => {
    const last6 = months.slice(0, 6).reverse()
    return last6.map((m) => {
      const mk = kpis.filter((k) => k.month.startsWith(m))
      return {
        month: mlShort(m),
        Revenue: mk.reduce((s, k) => s + (k.revenue_attributed ?? 0), 0),
        Spesa: mk.reduce((s, k) => s + (k.ad_spend ?? 0), 0),
        Lead: mk.reduce((s, k) => s + (k.leads_generated ?? 0), 0),
      }
    })
  }, [kpis, months])

  // Forecast MRR
  const forecast = useMemo(() => {
    const stable = clients.filter((c) => c.client_label === 'stabile').reduce((s, c) => s + c.mrr, 0)
    const bilico = clients.filter((c) => c.client_label === 'in_bilico').reduce((s, c) => s + c.mrr, 0)
    const persi = clients.filter((c) => c.client_label === 'perso').reduce((s, c) => s + c.mrr, 0)
    const total = stable + bilico * 0.5
    return {
      current: stable + bilico + persi,
      pessimistic: stable,
      realistic: Math.round(total),
      optimistic: Math.round(stable + bilico * 0.8),
      atRiskMrr: Math.round(bilico + persi),
      stableCount: clients.filter((c) => c.client_label === 'stabile').length,
      bilicoCount: clients.filter((c) => c.client_label === 'in_bilico').length,
    }
  }, [clients])

  const exportCsv = () => {
    const headers = ['Cliente', 'Tipo', 'MRR', 'Health', 'ROAS', 'ROAS target', 'Lead', 'Lead target', 'CPA', 'CPA target', 'Revenue', 'Ad Spend', 'CTR', 'Conv%']
    const rows = filtered.map(({ c, kpi, score }) => [
      c.company_name, c.client_type, c.mrr, score,
      kpi?.roas ?? '', c.target_roas ?? '',
      kpi?.leads_generated ?? '', c.target_leads_monthly ?? '',
      kpi?.cpa ?? '', c.target_cpa ?? '',
      kpi?.revenue_attributed ?? '', kpi?.ad_spend ?? '',
      kpi?.ctr ?? '', kpi?.conversion_rate ?? '',
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `report-kpi-${selectedMonth}.csv`
    a.click()
  }

  const th = (label: string, key?: SortKey) => (
    <th className="text-left px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer select-none whitespace-nowrap"
      onClick={() => key && toggleSort(key)}>
      <span className="flex items-center gap-1">
        {label}
        {key && (sortKey === key
          ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
          : <ChevronsUpDown className="w-3 h-3 opacity-30" />)}
      </span>
    </th>
  )

  const TABS = ['Riepilogo', 'Tabella KPI', 'Grafici', 'Forecast MRR', 'Alert']

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Report KPI</h1>
          <p className="text-text-secondary text-sm mt-0.5">Panoramica performance tutti i clienti</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold">
            {months.length === 0 && <option value={currentMonth}>{ml(currentMonth)}</option>}
            {months.map((m) => <option key={m} value={m}>{ml(m)}</option>)}
          </select>
          <button onClick={exportCsv}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary border border-border rounded-lg hover:text-text-primary hover:border-border-strong transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI aggregati */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { l: 'MRR totale', v: formatCurrency(agg.totalMrr), c: 'text-gold-text' },
          { l: 'ROAS medio', v: agg.avgRoas ? `${agg.avgRoas.toFixed(2)}×` : '—', c: 'text-success' },
          { l: 'Lead totali', v: agg.totalLeads.toString(), c: 'text-info' },
          { l: 'Revenue', v: formatCurrency(agg.totalRevenue), c: 'text-gold-text' },
          { l: 'Ad spend', v: formatCurrency(agg.totalSpend), c: 'text-text-primary' },
          { l: 'Health medio', v: agg.avgScore ? `${agg.avgScore}/100` : '—', c: agg.avgScore >= 75 ? 'text-success' : agg.avgScore >= 50 ? 'text-warning' : 'text-error' },
          { l: 'A rischio', v: agg.atRisk.toString(), c: agg.atRisk > 0 ? 'text-error' : 'text-success' },
        ].map((card) => (
          <div key={card.l} className="bg-surface border border-border rounded-xl p-3">
            <p className="text-2xs text-text-secondary uppercase tracking-wider mb-1">{card.l}</p>
            <p className={`text-lg font-black ${card.c}`}>{card.v}</p>
          </div>
        ))}
      </div>

      {/* Filtri */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca cliente..." className="pl-8 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-gold/50 w-48" />
        </div>
        {(['all', 'growth', 'digital'] as const).map((t) => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors capitalize ${filterType === t ? 'bg-gold/10 border-gold/40 text-gold-text font-bold' : 'border-border text-text-secondary hover:text-text-primary'}`}>
            {t === 'all' ? 'Tutti' : t}
          </button>
        ))}
        <div className="w-px h-4 bg-surface-active" />
        {[
          { k: 'all', l: 'Tutti' },
          { k: 'good', l: '🟢 OK' },
          { k: 'warn', l: '🟡 Attenzione' },
          { k: 'bad', l: '🔴 Critici' },
        ].map(({ k, l }) => (
          <button key={k} onClick={() => setFilterStatus(k as typeof filterStatus)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${filterStatus === k ? 'bg-gold/10 border-gold/40 text-gold-text font-bold' : 'border-border text-text-secondary hover:text-text-primary'}`}>
            {l}
          </button>
        ))}
        <span className="ml-auto text-xs text-text-secondary">{filtered.length} clienti</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${activeTab === i ? 'text-gold-text border-gold' : 'text-text-secondary border-transparent hover:text-text-primary'}`}>
            {t}
            {t === 'Alert' && alerts.length > 0 && (
              <span className="ml-1.5 text-2xs bg-error text-text-primary font-black px-1.5 py-0.5 rounded-full">{alerts.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 0: Riepilogo card per cliente */}
      {activeTab === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(({ c, kpi, score }) => (
            <a key={c.id} href={`/clienti/${c.id}?tab=kpi`}
              className="bg-surface border border-border rounded-xl p-4 hover:border-gold/30 transition-colors block">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center text-xs font-black text-gold-text">
                    {c.company_name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary truncate max-w-[140px]">{c.company_name}</p>
                    <p className="text-2xs text-text-secondary capitalize">{c.client_type} · {formatCurrency(c.mrr)}/mese</p>
                  </div>
                </div>
                <ScorePill score={score} />
              </div>
              {kpi ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { l: 'ROAS', v: kpi.roas ? `${kpi.roas}×` : '—', t: c.target_roas ? `t: ${c.target_roas}×` : null, good: kpi.roas && c.target_roas ? kpi.roas >= c.target_roas : null },
                    { l: 'Lead', v: kpi.leads_generated?.toString() ?? '—', t: c.target_leads_monthly ? `t: ${c.target_leads_monthly}` : null, good: kpi.leads_generated && c.target_leads_monthly ? kpi.leads_generated >= c.target_leads_monthly : null },
                    { l: 'Revenue', v: kpi.revenue_attributed ? `€${Math.round(kpi.revenue_attributed / 1000)}k` : '—', t: null, good: null },
                  ].map((m) => (
                    <div key={m.l} className="bg-background rounded-lg p-2">
                      <p className="text-2xs text-text-secondary">{m.l}</p>
                      <p className={`text-sm font-bold ${m.good === true ? 'text-success' : m.good === false ? 'text-error' : 'text-text-primary'}`}>{m.v}</p>
                      {m.t && <p className="text-2xs text-text-secondary">{m.t}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-secondary text-center py-3 bg-background rounded-lg">
                  Nessun dato per {ml(selectedMonth)}
                </p>
              )}
            </a>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-text-secondary text-sm">Nessun cliente corrisponde ai filtri</div>
          )}
        </div>
      )}

      {/* TAB 1: Tabella KPI */}
      {activeTab === 1 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-background">
                  {th('Cliente', 'company_name')}
                  {th('MRR', 'mrr')}
                  {th('Health', 'score')}
                  {th('ROAS', 'roas')}
                  {th('CTR')}
                  {th('CPA', 'cpa')}
                  {th('Lead', 'leads')}
                  {th('Conv%')}
                  {th('Revenue', 'revenue')}
                  {th('Ad Spend')}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(({ c, kpi, score }) => (
                  <tr key={c.id} className="hover:bg-surface transition-colors">
                    <td className="px-4 py-3">
                      <a href={`/clienti/${c.id}?tab=kpi`} className="flex items-center gap-2 hover:text-gold-text transition-colors">
                        <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center text-2xs font-bold text-gold-text">{c.company_name[0]}</div>
                        <span className="text-sm font-semibold text-text-primary">{c.company_name}</span>
                      </a>
                    </td>
                    <td className="px-4 py-3 text-sm text-gold-text font-semibold">{formatCurrency(c.mrr)}</td>
                    <td className="px-4 py-3"><ScorePill score={score} /></td>
                    <td className="px-4 py-3">
                      <KpiVsTarget actual={kpi?.roas ?? null} target={c.target_roas} fmt={(v) => `${v.toFixed(2)}×`} />
                    </td>
                    <td className="px-4 py-3">
                      <KpiVsTarget actual={kpi?.ctr ?? null} target={c.target_ctr} fmt={(v) => `${v}%`} />
                    </td>
                    <td className="px-4 py-3">
                      <KpiVsTarget actual={kpi?.cpa ?? null} target={c.target_cpa} lower fmt={(v) => `€${v}`} />
                    </td>
                    <td className="px-4 py-3">
                      <KpiVsTarget actual={kpi?.leads_generated ?? null} target={c.target_leads_monthly} fmt={(v) => v.toString()} />
                    </td>
                    <td className="px-4 py-3">
                      <KpiVsTarget actual={kpi?.conversion_rate ?? null} target={c.target_conv_rate} fmt={(v) => `${v}%`} />
                    </td>
                    <td className="px-4 py-3">
                      <KpiVsTarget actual={kpi?.revenue_attributed ?? null} target={c.target_revenue_monthly} fmt={(v) => formatCurrency(v)} />
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary">
                      {kpi?.ad_spend ? formatCurrency(kpi.ad_spend) : <span className="text-text-tertiary">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border bg-background">
                    <td className="px-4 py-3 text-xs font-bold text-text-secondary">TOTALI / MEDI</td>
                    <td className="px-4 py-3 text-sm font-black text-gold-text">{formatCurrency(agg.totalMrr)}</td>
                    <td className="px-4 py-3 text-xs font-bold text-text-secondary">avg {agg.avgScore}</td>
                    <td className="px-4 py-3 text-sm font-bold text-text-primary">{agg.avgRoas ? `${agg.avgRoas.toFixed(2)}×` : '—'}</td>
                    <td className="px-4 py-3 text-text-secondary">—</td>
                    <td className="px-4 py-3 text-text-secondary">—</td>
                    <td className="px-4 py-3 text-sm font-bold text-text-primary">{agg.totalLeads}</td>
                    <td className="px-4 py-3 text-text-secondary">—</td>
                    <td className="px-4 py-3 text-sm font-bold text-gold-text">{formatCurrency(agg.totalRevenue)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-text-primary">{formatCurrency(agg.totalSpend)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Grafici */}
      {activeTab === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">ROAS per cliente — {ml(selectedMonth)}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} width={72} />
                  <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid #2A2A2A', borderRadius: 8 }} formatter={(v: number) => [`${v}×`, 'ROAS']} />
                  <Bar dataKey="ROAS" fill="#F5C800" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Lead per cliente — {ml(selectedMonth)}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} width={72} />
                  <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid #2A2A2A', borderRadius: 8 }} />
                  <Bar dataKey="Lead" fill="#22C55E" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-surface border border-border rounded-xl p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Trend revenue + lead — ultimi 6 mesi (tutti i clienti)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={mrrTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} />
                  <YAxis yAxisId="l" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid #2A2A2A', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ color: 'var(--color-text-tertiary)', fontSize: 12 }} />
                  <Line yAxisId="l" type="monotone" dataKey="Revenue" stroke="#F5C800" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-gold-text)' }} />
                  <Line yAxisId="r" type="monotone" dataKey="Lead" stroke="#22C55E" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-success)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Forecast MRR */}
      {activeTab === 3 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { l: 'Pessimistico', sub: 'Solo clienti stabili', v: forecast.pessimistic, color: 'text-error', border: 'border-error/20' },
              { l: 'Realistico', sub: 'Stabili + 50% in bilico', v: forecast.realistic, color: 'text-warning', border: 'border-warning/20' },
              { l: 'Ottimistico', sub: 'Stabili + 80% in bilico', v: forecast.optimistic, color: 'text-success', border: 'border-success/20' },
            ].map((s) => (
              <div key={s.l} className={`bg-surface border ${s.border} rounded-xl p-5`}>
                <p className="text-xs text-text-secondary mb-0.5">{s.l}</p>
                <p className="text-xs text-text-secondary mb-3">{s.sub}</p>
                <p className={`text-3xl font-black ${s.color}`}>{formatCurrency(s.v)}</p>
                <p className="text-xs text-text-secondary mt-1">MRR a 3 mesi</p>
                {s.v < forecast.current && (
                  <p className={`text-xs mt-2 font-semibold ${s.color}`}>
                    -{formatCurrency(forecast.current - s.v)} vs oggi
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Situazione clienti</h3>
            <div className="space-y-3">
              {clients.map((c) => {
                const labelColor = c.client_label === 'stabile' ? 'text-success bg-success/10 border-success/20'
                  : c.client_label === 'in_bilico' ? 'text-warning bg-warning/10 border-warning/20'
                  : c.client_label === 'perso' ? 'text-error bg-error/10 border-error/20'
                  : 'text-text-secondary bg-surface border-border'
                const weight = c.client_label === 'stabile' ? 1 : c.client_label === 'in_bilico' ? 0.5 : 0
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center text-2xs font-bold text-gold-text">{c.company_name[0]}</div>
                    <span className="text-sm text-text-primary flex-1 truncate">{c.company_name}</span>
                    <span className="text-sm font-semibold text-gold-text">{formatCurrency(c.mrr)}</span>
                    <div className="w-24 h-1.5 bg-surface-active rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${weight * 100}%` }} />
                    </div>
                    <span className={`text-2xs font-bold px-1.5 py-0.5 rounded border capitalize ${labelColor}`}>
                      {c.client_label?.replace('_', ' ')}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center gap-6 text-xs text-text-secondary">
              <span>{forecast.stableCount} stabili</span>
              <span className="text-warning">{forecast.bilicoCount} in bilico</span>
              <span className="text-error ml-auto">{formatCurrency(forecast.atRiskMrr)} a rischio</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Alert */}
      {activeTab === 4 && (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
              <p className="text-text-primary font-bold">Nessun alert attivo</p>
              <p className="text-text-secondary text-sm mt-1">Tutti i clienti hanno dati e KPI nella norma</p>
            </div>
          ) : alerts.map((a, i) => {
            const styles = a.type === 'bad'
              ? 'bg-error/5 border-error/20'
              : a.type === 'warn' ? 'bg-warning/5 border-warning/20' : 'bg-success/5 border-success/20'
            const Icon = a.type === 'bad' ? AlertTriangle : a.type === 'warn' ? AlertTriangle : CheckCircle2
            const iconColor = a.type === 'bad' ? 'text-error' : a.type === 'warn' ? 'text-warning' : 'text-success'
            return (
              <div key={i} className={`flex items-start gap-3 border rounded-xl px-5 py-4 ${styles}`}>
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
                <div>
                  <p className="text-sm font-semibold text-text-primary">{a.msg}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{a.sub}</p>
                </div>
              </div>
            )
          })}
          {agg.noData > 0 && (
            <div className="bg-surface border border-border rounded-xl px-5 py-4 text-sm text-text-secondary">
              <strong className="text-text-primary">{agg.noData} clienti</strong> senza KPI inseriti per {ml(selectedMonth)} — inseriscili dalla pagina di ogni cliente.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
