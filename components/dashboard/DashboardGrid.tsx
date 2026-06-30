'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Responsive } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import {
  GripVertical, X, ChevronDown, ChevronUp, Settings2, Check, Plus, EyeOff,
  TrendingUp, Users, CheckSquare, Receipt, ShoppingCart, Wrench, Headphones,
  Target, Crown, RotateCcw, Zap, BarChart3, Building2, Eye, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'

import { DailyFocus }       from './DailyFocus'
import { AlertCenter }      from './AlertCenter'
import { TasksDue }         from './TasksDue'
import { ClientsRiskPanel } from './ClientsRiskPanel'
import { RevenueChart }     from './RevenueChart'
import { ProgettiWidget }   from './ProgettiWidget'
import { CompanyPulse }     from './CompanyPulse'
import { WorkloadPanel }    from './WorkloadPanel'
import { SmartInsights }    from './SmartInsights'
import { AIDashboardChat }  from './AIDashboardChat'
import { MarginRadar }      from './MarginRadar'
import { FinancialControl } from './FinancialControl'
import { SalesPipeline }    from './SalesPipeline'
import { AIExecutiveBrief } from './AIExecutiveBrief'
import { DecisionCenter }        from './DecisionCenter'
import { KpiPerformanceWidget } from './KpiPerformanceWidget'
import { AIAutomationCenter }   from './AIAutomationCenter'
import { StrategicObjectives }  from './StrategicObjectives'
import { GrowthPerformance }    from './GrowthPerformance'
import type { KpiSnapshotRow }  from './KpiPerformanceWidget'
import type { GrowthKpiRow }    from './GrowthPerformance'
import type { FocusItem }      from './DailyFocus'
import type { DashAlert }      from './AlertCenter'
import type { MonthRevenue }   from './RevenueSnapshot'
import type { ProjectSummary } from './ProgettiWidget'
import type { AIContext }      from './AIDashboardChat'
import type { FinancialSummary } from './FinancialControl'
import type { DealFull }     from './SalesPipeline'
import type { Decision }     from './DecisionCenter'
import type { Client, TaskWithAssignee, Profile, Objective } from '@/lib/types/database'
import { formatCurrency } from '@/lib/utils'
import { saveDashboardConfig } from '@/app/actions/dashboard-config'

// ─── Types ────────────────────────────────────────────────────────────────────
interface GridItem {
  i: string; x: number; y: number; w: number; h: number
  minH?: number; minW?: number; static?: boolean
}

export interface DashboardData {
  aiContext: AIContext
  focusItems: FocusItem[]
  greetingName: string
  alerts: DashAlert[]
  tasks: TaskWithAssignee[]
  clients: Client[]
  mrr: number
  revenueMonths: MonthRevenue[]
  projectSummaries: ProjectSummary[]
  allProfiles: Profile[]
  allActiveTasks: TaskWithAssignee[]
  clientsAtRisk: number
  clientsLost: number
  invoicesPending: number
  isAdmin: boolean
  isSuperAdmin: boolean
  userId: string
  pulseRaw: {
    dealsTotal: number; dealsActive: number; dealsWon: number
    tasksTotal: number; tasksDone: number
    ticketsOpen: number; ticketsResolved: number
    okrProgress: number
  }
  dealsFull: DealFull[]
  financialSummary: FinancialSummary
  decisions: Decision[]
  kpiSnapshot: KpiSnapshotRow[]
  objectives: Objective[]
  growthKpis: GrowthKpiRow[]
}

// ─── Widget registry ──────────────────────────────────────────────────────────
const WIDGETS = [
  { id: 'chat',     label: 'AI Chat',             emoji: '🤖', desc: 'Assistente AI del gestionale' },
  { id: 'focus',    label: 'Focus di oggi',        emoji: '☀️', desc: 'Priorità e azioni urgenti' },
  { id: 'alerts',   label: 'Alert',                emoji: '⚠️', desc: 'Notifiche critiche e attenzione' },
  { id: 'metrics',  label: 'Metriche',             emoji: '📊', desc: 'MRR, clienti, task, fatture' },
  { id: 'revenue',  label: 'Revenue',              emoji: '💰', desc: 'Grafico ricavi e proiezioni' },
  { id: 'tasks',    label: 'Task Settimana',       emoji: '✅', desc: 'Task in scadenza 7 giorni' },
  { id: 'projects', label: 'Progetti',             emoji: '📁', desc: 'Progetti attivi e stato' },
  { id: 'risk',     label: 'Clienti a Rischio',    emoji: '🔴', desc: 'Clienti in bilico e persi' },
  { id: 'pulse',    label: 'Company Pulse',        emoji: '🏢', desc: 'Stato delle 5 aree aziendali' },
  { id: 'workload', label: 'Carico Team',          emoji: '👥', desc: 'Distribuzione task nel team' },
  { id: 'insights', label: 'AI Insights',          emoji: '✨', desc: 'Analisi AI su clienti e revenue' },
  { id: 'margin',   label: 'Margin Radar',         emoji: '📈', desc: 'MRR e margine stimato per cliente' },
  { id: 'financial',label: 'Financial Control',    emoji: '💳', desc: 'Fatturato, incassato, crediti e ritardi' },
  { id: 'pipeline', label: 'Sales Pipeline',       emoji: '🎯', desc: 'Deal attivi, pipeline e funnel' },
  { id: 'decision', label: 'Decision Center',      emoji: '🧭', desc: 'Decisioni strategiche aperte e chiuse' },
  { id: 'aibrief',  label: 'AI Executive Brief',   emoji: '✍️', desc: 'Briefing narrativo AI sull\'azienda' },
  { id: 'kpiperf',  label: 'KPI Performance',      emoji: '📊', desc: 'KPI mensili per cliente con trend' },
  { id: 'aiautomation',  label: 'AI & Automation',       emoji: '🧠', desc: 'Log chiamate Groq, automazioni attive, ore risparmiate' },
  { id: 'objectives',    label: 'OKR Aziendali',         emoji: '🎯', desc: 'Obiettivi strategici con progress bar e status' },
  { id: 'growthperf',    label: 'Growth Performance',    emoji: '📈', desc: 'Revenue aggregato clienti growth, trend e ranking con sparkline' },
]

// ─── Layout defaults ──────────────────────────────────────────────────────────
// Strict 2-column 6+6 — max 2 widget per riga, nessuna pagina infinita.
// chat full-width in cima, insights full-width in fondo.
// Col sx: focus→alerts→tasks→risk  |  Col dx: metrics→revenue→projects
// Entrambe le colonne terminano a y=22. Bottom: [pulse|workload]→insights.
const DEFAULT_LAYOUT: GridItem[] = [
  { i: 'chat',     x: 0, y: 0,  w: 12, h: 4,  minH: 4, minW: 4 },
  { i: 'focus',    x: 0, y: 4,  w: 6,  h: 5,  minH: 4, minW: 3 },
  { i: 'metrics',  x: 6, y: 4,  w: 6,  h: 4,  minH: 4, minW: 3 },
  { i: 'revenue',  x: 6, y: 8,  w: 6,  h: 10, minH: 7, minW: 3 },
  { i: 'alerts',   x: 0, y: 9,  w: 6,  h: 5,  minH: 4, minW: 3 },
  { i: 'tasks',    x: 0, y: 14, w: 6,  h: 4,  minH: 4, minW: 3 },
  { i: 'risk',     x: 0, y: 18, w: 6,  h: 4,  minH: 4, minW: 3 },
  { i: 'projects', x: 6, y: 18, w: 6,  h: 4,  minH: 4, minW: 3 },
  { i: 'pulse',    x: 0, y: 22, w: 6,  h: 5,  minH: 4, minW: 3 },
  { i: 'workload', x: 6, y: 22, w: 6,  h: 5,  minH: 4, minW: 3 },
  { i: 'aibrief',  x: 0, y: 27, w: 12, h: 5,  minH: 4, minW: 4 },
  { i: 'insights', x: 0, y: 32, w: 12, h: 4,  minH: 4, minW: 4 },
  // Nuovi widget — nascosti di default nel layout base
  { i: 'margin',   x: 0, y: 36, w: 6,  h: 6,  minH: 5, minW: 3 },
  { i: 'financial',x: 6, y: 36, w: 6,  h: 5,  minH: 4, minW: 3 },
  { i: 'pipeline', x: 0, y: 42, w: 6,  h: 7,  minH: 5, minW: 3 },
  { i: 'decision', x: 6, y: 41, w: 6,  h: 6,  minH: 5, minW: 3 },
  { i: 'kpiperf',      x: 0, y: 47, w: 12, h: 6,  minH: 5, minW: 4 },
  { i: 'aiautomation', x: 0, y: 53, w: 12, h: 7,  minH: 6, minW: 4 },
  { i: 'objectives',   x: 0, y: 60, w: 6,  h: 8,  minH: 5, minW: 3 },
  { i: 'growthperf',   x: 6, y: 60, w: 6,  h: 8,  minH: 5, minW: 4 },
]

interface Template {
  id: string; name: string; emoji: string; desc: string; color: string
  layout: GridItem[]; hidden: string[]
}
interface CustomTemplate extends Template { createdAt: string }
export type DashboardConfig = {
  layout?: GridItem[]; hidden?: string[]; collapsed?: string[]
  customTemplates?: CustomTemplate[]; activeTemplateId?: string | null
}

// ──────────────────────────────────────────────────────────────────────────────
// Strict 2-column layout (6+6 equal split) — max 2 widget per riga.
// Altezze calibrate al minimo usabile (rowHeight=44px):
//   chat:4  focus:5  alerts:5  metrics:4  revenue:9  tasks:5
//   risk:5  pulse:5  projects:4  workload:5  insights:4
// Zero gap verticale tra righe — colonne bilanciate per altezza.
// ──────────────────────────────────────────────────────────────────────────────
const TEMPLATES: Template[] = [
  {
    // Ops First — 20 righe totali (~880px)
    // Riga 0: [chat | metrics]  Riga 4: [focus | alerts]
    // Riga 10: [tasks | risk]   Riga 15: [pulse | workload]
    id: 'ops',
    name: 'Operations First',
    emoji: '⚡',
    desc: 'Task urgenti, alert critici e clienti a rischio — tutto visibile senza scorrere.',
    color: '#F5C800',
    hidden: ['revenue', 'projects', 'insights'],
    layout: [
      { i: 'chat',     x: 0, y: 0,  w: 6, h: 4, minH: 4, minW: 3 },
      { i: 'metrics',  x: 6, y: 0,  w: 6, h: 4, minH: 4, minW: 3 },
      { i: 'focus',    x: 0, y: 4,  w: 6, h: 6, minH: 5, minW: 3 },
      { i: 'alerts',   x: 6, y: 4,  w: 6, h: 6, minH: 4, minW: 3 },
      { i: 'tasks',    x: 0, y: 10, w: 6, h: 5, minH: 4, minW: 3 },
      { i: 'risk',     x: 6, y: 10, w: 6, h: 5, minH: 4, minW: 3 },
      { i: 'pulse',    x: 0, y: 15, w: 6, h: 5, minH: 4, minW: 3 },
      { i: 'workload', x: 6, y: 15, w: 6, h: 5, minH: 4, minW: 3 },
    ],
  },
  {
    // Business View — 22 righe totali (~968px)
    // Col sinistra: metrics → revenue(9) → tasks → risk
    // Col destra:   chat → alerts → pulse → projects → insights
    // revenue(9) bilancia con chat(4)+alerts(5) sulla destra — colonne pari
    id: 'biz',
    name: 'Business View',
    emoji: '📊',
    desc: 'Revenue e metriche al centro. Per riunioni di direzione e analisi finanziaria.',
    color: '#3B82F6',
    hidden: ['focus', 'workload'],
    layout: [
      { i: 'metrics',  x: 0, y: 0,  w: 6, h: 4, minH: 4, minW: 3 },
      { i: 'chat',     x: 6, y: 0,  w: 6, h: 4, minH: 4, minW: 3 },
      { i: 'revenue',  x: 0, y: 4,  w: 6, h: 9, minH: 7, minW: 3 },
      { i: 'alerts',   x: 6, y: 4,  w: 6, h: 4, minH: 4, minW: 3 },
      { i: 'pulse',    x: 6, y: 8,  w: 6, h: 5, minH: 4, minW: 3 },
      { i: 'tasks',    x: 0, y: 13, w: 6, h: 4, minH: 4, minW: 3 },
      { i: 'projects', x: 6, y: 13, w: 6, h: 4, minH: 4, minW: 3 },
      { i: 'risk',     x: 0, y: 17, w: 6, h: 5, minH: 4, minW: 3 },
      { i: 'aibrief',  x: 6, y: 17, w: 6, h: 5, minH: 4, minW: 3 },
    ],
  },
  {
    // Agency Full — 31 righe totali (~1364px)
    // chat full-width in cima (comando centrale)
    // Col sx: focus → alerts → tasks → risk   (h: 5+5+4+4 = 18)
    // Col dx: metrics → revenue → projects     (h: 4+10+4 = 18) — bilanciate
    // Bottom: [pulse | workload] → insights full-width
    id: 'full',
    name: 'Agency Full',
    emoji: '🏢',
    desc: 'Tutti gli 11 widget in layout bicolonna bilanciato. Nessuna informazione nascosta.',
    color: '#A855F7',
    hidden: [],
    layout: [
      { i: 'chat',     x: 0, y: 0,  w: 12, h: 4,  minH: 4, minW: 4 },
      { i: 'focus',    x: 0, y: 4,  w: 6,  h: 5,  minH: 4, minW: 3 },
      { i: 'metrics',  x: 6, y: 4,  w: 6,  h: 4,  minH: 4, minW: 3 },
      { i: 'revenue',  x: 6, y: 8,  w: 6,  h: 10, minH: 7, minW: 3 },
      { i: 'alerts',   x: 0, y: 9,  w: 6,  h: 5,  minH: 4, minW: 3 },
      { i: 'tasks',    x: 0, y: 14, w: 6,  h: 4,  minH: 4, minW: 3 },
      { i: 'risk',     x: 0, y: 18, w: 6,  h: 4,  minH: 4, minW: 3 },
      { i: 'projects', x: 6, y: 18, w: 6,  h: 4,  minH: 4, minW: 3 },
      { i: 'pulse',    x: 0, y: 22, w: 6,  h: 5,  minH: 4, minW: 3 },
      { i: 'workload', x: 6, y: 22, w: 6,  h: 5,  minH: 4, minW: 3 },
      { i: 'aibrief',  x: 0, y: 27, w: 12, h: 5,  minH: 4, minW: 4 },
      { i: 'insights', x: 0, y: 32, w: 12, h: 4,  minH: 4, minW: 4 },
    ],
  },
]

const STORAGE_LAYOUT      = 'twobee-dash-layout-v3'
const STORAGE_HIDDEN      = 'twobee-dash-hidden-v3'
const STORAGE_COLLAPSED   = 'twobee-dash-collapsed-v3'
const STORAGE_CUSTOM_TPLS = 'twobee-dash-custom-tpls-v1'
const STORAGE_ACTIVE_TPL  = 'twobee-dash-active-tpl-v1'

// ─── TemplatePreview SVG ──────────────────────────────────────────────────────
// Renders directly from template.layout — scales to fill viewport exactly.
function TemplatePreview({ template, active }: { template: Template; active: boolean }) {
  const cols = 12
  const W = 156; const H = 94

  const visibleItems = template.layout.filter(item => !template.hidden.includes(item.i))
  const maxRow = Math.max(...visibleItems.map(l => l.y + l.h))
  const cw = W / cols
  const rh = H / maxRow
  const gap = 1.2

  const labelMap: Record<string, string> = {
    chat: 'AI', focus: 'Focus', alerts: 'Alert', metrics: 'KPI',
    revenue: 'Rev', tasks: 'Task', projects: 'Proj', risk: 'Risk',
    pulse: 'Pulse', workload: 'Team', insights: 'Insights', aibrief: 'Brief', kpiperf: 'KPI',
    growthperf: 'Growth',
  }
  const tintMap: Record<string, string> = {
    chat: '#A855F7', focus: '#F5C800', alerts: '#EF4444', metrics: '#3B82F6',
    revenue: '#22C55E', tasks: '#F59E0B', projects: '#6366F1',
    risk: '#EF4444', pulse: '#14B8A6', workload: '#8B5CF6', insights: '#F5C800',
    margin: '#22C55E', financial: '#3B82F6', pipeline: '#F5C800', decision: '#A855F7', aibrief: '#F5C800',
    kpiperf: '#F5C800', growthperf: '#22C55E',
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-md overflow-hidden" style={{ display: 'block' }}>
      <rect width={W} height={H} fill="#060606" rx="4" />
      {visibleItems.map(item => {
        const x = item.x * cw + gap
        const y = item.y * rh + gap
        const w = item.w * cw - gap * 2
        const h = item.h * rh - gap * 2
        const tint  = tintMap[item.i] ?? '#888'
        const bg    = active ? tint + '16' : '#111'
        const stroke = active ? tint + '55' : '#1C1C1C'
        const label = labelMap[item.i] ?? item.i

        return (
          <g key={item.i}>
            <rect x={x} y={y} width={w} height={h} rx="2"
              fill={bg} stroke={stroke} strokeWidth="0.5" />
            {active && h > 6 && (
              <rect x={x} y={y} width={w} height="2.5" rx="1.5"
                fill={tint + '99'} />
            )}
            {h > 9 && w > 14 && (
              <text x={x + w / 2} y={y + h / 2 + 2}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="5" fontWeight="700" letterSpacing="0.2"
                fill={active ? tint : '#2A2A2A'}
                fontFamily="system-ui,sans-serif">
                {label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── reorderLayout ────────────────────────────────────────────────────────────
// Prende il layout corrente e lo ri-ordina secondo `order` (array di widget id).
// Raggruppa gli item in "righe" (item con y sovrapposto), riordina le righe
// rispetto alla posizione del loro item più in alto in `order`, poi ricalcola
// i valori y mantenendo x/w/h invariati.
function reorderLayout(layout: GridItem[], order: string[]): GridItem[] {
  const sorted = [...layout].sort((a, b) => a.y - b.y || a.x - b.x)

  // Raggruppa in righe: item che si sovrappongono verticalmente
  const rows: GridItem[][] = []
  for (const item of sorted) {
    const last = rows[rows.length - 1]
    const lastMaxY = last ? Math.max(...last.map(i => i.y + i.h)) : -1
    if (last && item.y < lastMaxY) {
      last.push(item)
    } else {
      rows.push([item])
    }
  }

  // Ordina le righe per la posizione minima dei loro item in `order`
  const idx = (id: string) => { const i = order.indexOf(id); return i < 0 ? 999 : i }
  rows.sort((a, b) => Math.min(...a.map(i => idx(i.i))) - Math.min(...b.map(i => idx(i.i))))

  // Ri-assegna y staccando le righe senza buchi
  let curY = 0
  const result: GridItem[] = []
  for (const row of rows) {
    const maxH = Math.max(...row.map(i => i.h))
    for (const item of row) result.push({ ...item, y: curY })
    curY += maxH
  }
  return result
}

// ─── CustomizePanel (drawer) ──────────────────────────────────────────────────
function CustomizePanel({
  open, onClose,
  layout, hidden,
  customTemplates, activeTemplateId,
  onApplyTemplate, onToggleWidget, onReset, onApplyOrder,
  onSaveCustomTemplate, onDeleteCustomTemplate,
  onSave, saving,
}: {
  open: boolean; onClose: () => void
  layout: GridItem[]; hidden: Set<string>
  customTemplates: CustomTemplate[]; activeTemplateId: string | null
  onApplyTemplate: (t: Template) => void
  onToggleWidget: (id: string) => void
  onReset: () => void
  onApplyOrder: (order: string[]) => void
  onSaveCustomTemplate: (name: string, emoji: string) => void
  onDeleteCustomTemplate: (id: string) => void
  onSave: () => Promise<void>
  saving: boolean
}) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [widgetOrder, setWidgetOrder] = useState<string[]>(WIDGETS.map(w => w.id))
  const [showNewTpl, setShowNewTpl] = useState(false)
  const [newTplName, setNewTplName] = useState('')
  const [newTplEmoji, setNewTplEmoji] = useState('⭐')
  const dragRef = useRef<string | null>(null)

  // Sync order with layout on open
  useEffect(() => {
    if (!open) return
    const sortedByY = [...layout].sort((a, b) => a.y - b.y || a.x - b.x)
    const ordered = sortedByY.map(l => l.i).filter(i => WIDGETS.find(w => w.id === i))
    const rest = WIDGETS.map(w => w.id).filter(id => !ordered.includes(id))
    setWidgetOrder([...ordered, ...rest])
    setShowNewTpl(false); setNewTplName('')
  }, [open, layout])

  const handleDragStart = (id: string) => { dragRef.current = id }
  const handleDragEnter = (id: string) => { setDragOver(id) }
  const handleDragEnd   = () => {
    if (!dragRef.current || !dragOver || dragRef.current === dragOver) {
      dragRef.current = null; setDragOver(null); return
    }
    setWidgetOrder(prev => {
      const next = [...prev]
      const from = next.indexOf(dragRef.current!)
      const to   = next.indexOf(dragOver)
      if (from < 0 || to < 0) return prev
      next.splice(from, 1)
      next.splice(to, 0, dragRef.current!)
      return next
    })
    dragRef.current = null; setDragOver(null)
  }

  const handleSave = async () => {
    onApplyOrder(widgetOrder)
    await onSave()
    onClose()
  }

  const handleTemplate = (t: Template) => { onApplyTemplate(t) }

  const handleCreateTpl = () => {
    if (!newTplName.trim()) return
    onSaveCustomTemplate(newTplName.trim(), newTplEmoji)
    setShowNewTpl(false); setNewTplName(''); setNewTplEmoji('⭐')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
        style={{
          width: '420px',
          background: '#0A0A0A',
          borderLeft: '1px solid #1A1A1A',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          boxShadow: open ? '-24px 0 80px rgba(0,0,0,0.6)' : 'none',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#141414] shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <Crown className="w-4 h-4 text-[#F5C800]" />
            <span className="text-sm font-black text-white">Personalizza Dashboard</span>
          </div>
          <button onClick={onReset}
            className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
            style={{ color: '#444', border: '1px solid #1A1A1A' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#888' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#444' }}>
            <RotateCcw className="w-2.5 h-2.5" /> Reset
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
            style={{ background: 'rgba(245,200,0,0.1)', border: '1px solid rgba(245,200,0,0.25)', color: '#F5C800', opacity: saving ? 0.6 : 1 }}>
            <Check className="w-3 h-3" /> {saving ? 'Salvo…' : 'Salva'}
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#333' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#888' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#333' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Template section ── */}
          <div className="px-5 pt-5 pb-4">
            <p className="text-[9px] font-black text-[#F5C800] uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5">
              <Zap className="w-2.5 h-2.5" /> Template rapidi
            </p>

            {/* Predefined templates */}
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATES.map(t => {
                const isActive = activeTemplateId === t.id
                return (
                  <button key={t.id} onClick={() => handleTemplate(t)}
                    className="flex flex-col gap-1.5 p-2 rounded-xl text-left transition-all"
                    style={{
                      background: isActive ? t.color + '10' : '#111',
                      border: `1px solid ${isActive ? t.color + '40' : '#1A1A1A'}`,
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = '#2A2A2A' }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = '#1A1A1A' }}>
                    <TemplatePreview template={t} active={isActive} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-xs leading-none shrink-0">{t.emoji}</span>
                        <span className="text-[10px] font-black text-white leading-tight truncate">{t.name}</span>
                        {isActive && <Check className="w-2.5 h-2.5 ml-auto shrink-0" style={{ color: t.color }} />}
                      </div>
                      <p className="text-[9px] leading-tight line-clamp-2" style={{ color: '#444' }}>{t.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Custom templates */}
            {customTemplates.length > 0 && (
              <div className="mt-4">
                <p className="text-[9px] font-semibold text-[#333] uppercase tracking-wider mb-2">Personalizzati</p>
                <div className="grid grid-cols-3 gap-2">
                  {customTemplates.map(t => {
                    const isActive = activeTemplateId === t.id
                    return (
                      <div key={t.id} className="relative group">
                        <button onClick={() => handleTemplate(t)}
                          className="w-full flex flex-col gap-1.5 p-2 rounded-xl text-left transition-all"
                          style={{
                            background: isActive ? 'rgba(245,200,0,0.08)' : '#111',
                            border: `1px solid ${isActive ? 'rgba(245,200,0,0.35)' : '#1A1A1A'}`,
                          }}
                          onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = '#2A2A2A' }}
                          onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = '#1A1A1A' }}>
                          <TemplatePreview template={t} active={isActive} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-xs leading-none shrink-0">{t.emoji}</span>
                              <span className="text-[10px] font-black text-white leading-tight truncate">{t.name}</span>
                              {isActive && <Check className="w-2.5 h-2.5 ml-auto shrink-0 text-[#F5C800]" />}
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={() => onDeleteCustomTemplate(t.id)}
                          className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Create custom template */}
            <div className="mt-3">
              {!showNewTpl ? (
                <button onClick={() => setShowNewTpl(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-semibold transition-colors"
                  style={{ border: '1px dashed #1E1E1E', color: '#333' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2A2A2A'; (e.currentTarget as HTMLElement).style.color = '#555' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1E1E1E'; (e.currentTarget as HTMLElement).style.color = '#333' }}>
                  <Plus className="w-3 h-3" /> Salva layout attuale come template
                </button>
              ) : (
                <div className="rounded-xl p-3 space-y-2" style={{ background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
                  <p className="text-[9px] font-bold text-[#555] uppercase tracking-wider">Nuovo template</p>
                  <div className="flex gap-2">
                    <input
                      value={newTplEmoji}
                      onChange={e => setNewTplEmoji(e.target.value)}
                      className="w-10 text-center text-sm rounded-lg px-1 py-1.5 outline-none"
                      style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
                      maxLength={2}
                    />
                    <input
                      value={newTplName}
                      onChange={e => setNewTplName(e.target.value)}
                      placeholder="Nome template..."
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateTpl(); if (e.key === 'Escape') setShowNewTpl(false) }}
                      className="flex-1 text-xs rounded-lg px-2.5 py-1.5 outline-none"
                      style={{ background: '#111', border: '1px solid #2A2A2A', color: '#fff' }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCreateTpl} disabled={!newTplName.trim()}
                      className="flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-colors"
                      style={{ background: 'rgba(245,200,0,0.1)', border: '1px solid rgba(245,200,0,0.25)', color: '#F5C800', opacity: newTplName.trim() ? 1 : 0.4 }}>
                      Crea template
                    </button>
                    <button onClick={() => { setShowNewTpl(false); setNewTplName('') }}
                      className="text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      style={{ color: '#444', border: '1px solid #1A1A1A' }}>
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mx-5 h-px" style={{ background: '#141414' }} />

          {/* ── Widget list ── */}
          <div className="px-5 pt-4 pb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] font-black text-[#555] uppercase tracking-[0.15em] flex items-center gap-1.5">
                <Building2 className="w-2.5 h-2.5" /> Widget
              </p>
              <p className="text-[9px] text-[#2A2A2A]">Trascina per riordinare</p>
            </div>

            {/* Active widgets — draggable */}
            <div className="space-y-1.5 mb-4">
              <p className="text-[9px] font-semibold text-[#333] uppercase tracking-wider mb-2">Visibili</p>
              {widgetOrder.filter(id => !hidden.has(id)).map(id => {
                const w = WIDGETS.find(x => x.id === id)!
                const isDragTarget = dragOver === id
                return (
                  <div key={id}
                    draggable
                    onDragStart={() => handleDragStart(id)}
                    onDragEnter={() => handleDragEnter(id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={e => e.preventDefault()}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing transition-all select-none"
                    style={{
                      background: isDragTarget ? 'rgba(245,200,0,0.06)' : '#111',
                      border: `1px solid ${isDragTarget ? 'rgba(245,200,0,0.2)' : '#1A1A1A'}`,
                      transform: isDragTarget ? 'scale(1.01)' : 'scale(1)',
                    }}>
                    <GripVertical className="w-3 h-3 shrink-0" style={{ color: '#2A2A2A' }} />
                    <span className="text-sm leading-none shrink-0">{w.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{w.label}</p>
                      <p className="text-[9px] truncate" style={{ color: '#333' }}>{w.desc}</p>
                    </div>
                    <button
                      onClick={() => onToggleWidget(id)}
                      title="Nascondi"
                      className="p-1 rounded-lg transition-colors shrink-0"
                      style={{ color: '#2A2A2A' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#EF4444' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#2A2A2A' }}>
                      <EyeOff className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Hidden widgets — add back */}
            {widgetOrder.some(id => hidden.has(id)) && (
              <div>
                <p className="text-[9px] font-semibold text-[#333] uppercase tracking-wider mb-2">Nascosti</p>
                <div className="space-y-1.5">
                  {widgetOrder.filter(id => hidden.has(id)).map(id => {
                    const w = WIDGETS.find(x => x.id === id)!
                    return (
                      <button key={id} onClick={() => onToggleWidget(id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-left group"
                        style={{ background: '#0D0D0D', border: '1px dashed #1A1A1A' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2A2A2A' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1A1A1A' }}>
                        <span className="text-sm leading-none shrink-0 opacity-40">{w.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: '#333' }}>{w.label}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Eye className="w-3 h-3" style={{ color: '#555' }} />
                          <span className="text-[9px]" style={{ color: '#555' }}>Aggiungi</span>
                        </div>
                        <Plus className="w-3 h-3 shrink-0" style={{ color: '#333' }} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-[#141414] shrink-0">
          <p className="text-[9px] text-[#222] text-center">
            Solo i Super Admin possono modificare la dashboard · Salvato sul tuo profilo
          </p>
        </div>
      </div>
    </>
  )
}

// ─── WidgetPanel ──────────────────────────────────────────────────────────────
function WidgetPanel({
  label, emoji, collapsed, onCollapse, onHide, children,
}: {
  label: string; emoji: string
  collapsed: boolean; onCollapse: () => void
  onHide: () => void
  children: React.ReactNode
}) {
  const [confirmHide, setConfirmHide] = useState(false)

  return (
    <div className="widget-panel flex flex-col h-full rounded-xl overflow-hidden"
      style={{ background: '#0D0D0D', border: '1px solid #1E1E1E' }}>
      <div className="drag-handle flex items-center gap-2 px-3 py-2.5 shrink-0 select-none"
        style={{ borderBottom: '1px solid #161616', cursor: 'grab' }}>
        <GripVertical className="w-3.5 h-3.5 shrink-0" style={{ color: '#2A2A2A' }} />
        <span className="text-sm shrink-0">{emoji}</span>
        <span className="text-[10px] font-bold flex-1 truncate uppercase tracking-[0.1em]"
          style={{ color: '#444' }}>{label}</span>

        {confirmHide ? (
          /* Inline confirm — non-draggable, ferma la propagazione */
          <div className="flex items-center gap-1.5 ml-1"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}>
            <span className="text-[10px]" style={{ color: '#555' }}>Nascondi?</span>
            <button
              className="text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onHide(); setConfirmHide(false) }}>
              Sì
            </button>
            <button
              className="text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors"
              style={{ background: '#111', color: '#444', border: '1px solid #1A1A1A' }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setConfirmHide(false) }}>
              No
            </button>
          </div>
        ) : (
          <button
            title="Nascondi tab"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setConfirmHide(true) }}
            style={{ color: '#1E1E1E' }}
            className="p-1 rounded transition-all shrink-0 hover:!text-[#555]">
            <EyeOff className="w-3 h-3" />
          </button>
        )}

        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onCollapse() }}
          style={{ color: '#2A2A2A' }}
          className="p-1 rounded hover:bg-white/5 transition-colors shrink-0">
          {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>
      </div>
      {!collapsed && (
        <div className="flex-1 overflow-auto min-h-0">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── MetricCards ─────────────────────────────────────────────────────────────
function MetricCards({ mrr, clientsCount, clientsAtRisk, tasksDueSoon, invoicesPending }: {
  mrr: number; clientsCount: number; clientsAtRisk: number
  tasksDueSoon: number; invoicesPending: number
}) {
  const cards = [
    { href: '/fatturazione', icon: <TrendingUp className="w-4 h-4" />, iconColor: '#F5C800', label: 'MRR', value: formatCurrency(mrr), sub: '/mese contratti', accent: '#F5C800' },
    { href: '/clienti',      icon: <Users       className="w-4 h-4" />, iconColor: '#3B82F6', label: 'Clienti', value: String(clientsCount), sub: clientsAtRisk > 0 ? `${clientsAtRisk} in bilico` : 'tutti stabili', accent: '#3B82F6', subWarning: clientsAtRisk > 0 },
    { href: '/task',         icon: <CheckSquare className="w-4 h-4" />, iconColor: tasksDueSoon > 0 ? '#F59E0B' : '#333', label: 'Task', value: String(tasksDueSoon), sub: 'in scadenza 7gg', accent: tasksDueSoon > 0 ? '#F59E0B' : '#888' },
    { href: '/fatturazione', icon: <Receipt     className="w-4 h-4" />, iconColor: invoicesPending > 0 ? '#EF4444' : '#333', label: 'Fatture', value: String(invoicesPending), sub: 'in attesa', accent: invoicesPending > 0 ? '#EF4444' : '#888' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 p-3 h-full content-start">
      {cards.map(c => (
        <Link key={c.label} href={c.href}
          className="flex flex-col rounded-lg p-3 transition-all"
          style={{ background: '#111', border: '1px solid #1A1A1A' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = c.accent + '33' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1A1A1A' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <span style={{ color: c.iconColor }}>{c.icon}</span>
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#333' }}>{c.label}</span>
          </div>
          <p className="text-xl font-black leading-none" style={{ color: c.accent }}>{c.value}</p>
          <p className="text-[9px] mt-1.5" style={{ color: (c as { subWarning?: boolean }).subWarning ? '#F59E0B' : '#2A2A2A' }}>{c.sub}</p>
        </Link>
      ))}
    </div>
  )
}

// ─── DashboardGrid ────────────────────────────────────────────────────────────
export function DashboardGrid({ data, initialConfig }: { data: DashboardData; initialConfig?: DashboardConfig | null }) {
  const NEW_WIDGETS = ['margin', 'financial', 'pipeline', 'decision', 'kpiperf', 'growthperf']

  const [mounted, setMounted]               = useState(false)
  const [panelOpen, setPanelOpen]           = useState(false)
  const [layout, setLayout]                 = useState<GridItem[]>(DEFAULT_LAYOUT)
  const [hidden, setHidden]                 = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed]           = useState<Set<string>>(new Set())
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([])
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  const [saving, setSaving]                 = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)
  const containerRef  = useRef<HTMLDivElement>(null)
  const breakpointRef = useRef('lg')

  useEffect(() => {
    try {
      // Prefer DB config, fallback to localStorage
      const cfg = initialConfig ?? null
      const sl = cfg?.layout ? JSON.stringify(cfg.layout) : localStorage.getItem(STORAGE_LAYOUT)
      if (sl) setLayout(JSON.parse(sl))

      const savedHidden: string[] = cfg?.hidden ?? (localStorage.getItem(STORAGE_HIDDEN) ? JSON.parse(localStorage.getItem(STORAGE_HIDDEN)!) : [])
      const merged = new Set(savedHidden)
      for (const w of NEW_WIDGETS) { if (!savedHidden.includes(w)) merged.add(w) }
      setHidden(merged)

      const sc = cfg?.collapsed ?? (localStorage.getItem(STORAGE_COLLAPSED) ? JSON.parse(localStorage.getItem(STORAGE_COLLAPSED)!) : [])
      if (sc.length) setCollapsed(new Set(sc as string[]))

      const ctpls = cfg?.customTemplates ?? (localStorage.getItem(STORAGE_CUSTOM_TPLS) ? JSON.parse(localStorage.getItem(STORAGE_CUSTOM_TPLS)!) : [])
      setCustomTemplates(ctpls)

      const atpl = cfg?.activeTemplateId ?? localStorage.getItem(STORAGE_ACTIVE_TPL) ?? null
      setActiveTemplateId(atpl)
    } catch { /* ignore */ }
    setMounted(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ResizeObserver — solo variazioni di LARGHEZZA, debounced via rAF
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let lastW = 0
    let raf = 0
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0)
      if (w === lastW) return          // altezza cambiata (widget resize) — ignora
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => { lastW = w; setContainerWidth(w) })
    })
    ro.observe(el)
    const initial = Math.round(el.getBoundingClientRect().width)
    lastW = initial
    setContainerWidth(initial)
    return () => { ro.disconnect(); cancelAnimationFrame(raf) }
  }, [mounted])

  // Close panel on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanelOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const persistLayout = useCallback((l: GridItem[]) => {
    setLayout(l)
    localStorage.setItem(STORAGE_LAYOUT, JSON.stringify(l))
  }, [])

  const toggleHide = useCallback((id: string) => {
    // Se stiamo mostrando un widget, assicuriamoci che abbia una posizione nel layout
    setLayout(prev => {
      if (prev.find(l => l.i === id)) return prev
      // Non esiste nel layout corrente (es. template che lo escludeva) — aggiungiamolo in fondo
      const maxY = prev.length > 0 ? Math.max(...prev.map(l => l.y + l.h)) : 0
      const def = DEFAULT_LAYOUT.find(l => l.i === id)
      const item: GridItem = def ? { ...def, y: maxY } : { i: id, x: 0, y: maxY, w: 6, h: 5, minH: 4, minW: 3 }
      const next = [...prev, item]
      localStorage.setItem(STORAGE_LAYOUT, JSON.stringify(next))
      return next
    })
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      localStorage.setItem(STORAGE_HIDDEN, JSON.stringify(Array.from(next)))
      return next
    })
  }, [])

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      localStorage.setItem(STORAGE_COLLAPSED, JSON.stringify(Array.from(next)))
      return next
    })
  }, [])

  const applyTemplate = useCallback((t: Template) => {
    setLayout(t.layout)
    setHidden(new Set(t.hidden))
    setCollapsed(new Set())
    setActiveTemplateId(t.id)
    localStorage.setItem(STORAGE_LAYOUT, JSON.stringify(t.layout))
    localStorage.setItem(STORAGE_HIDDEN, JSON.stringify(t.hidden))
    localStorage.removeItem(STORAGE_COLLAPSED)
    localStorage.setItem(STORAGE_ACTIVE_TPL, t.id)
  }, [])

  const resetLayout = useCallback(() => {
    localStorage.removeItem(STORAGE_LAYOUT)
    localStorage.removeItem(STORAGE_HIDDEN)
    localStorage.removeItem(STORAGE_COLLAPSED)
    localStorage.removeItem(STORAGE_ACTIVE_TPL)
    window.location.reload()
  }, [])

  const saveConfig = useCallback(async () => {
    setSaving(true)
    try {
      const config: DashboardConfig = {
        layout,
        hidden: Array.from(hidden),
        collapsed: Array.from(collapsed),
        customTemplates,
        activeTemplateId,
      }
      localStorage.setItem(STORAGE_LAYOUT, JSON.stringify(layout))
      localStorage.setItem(STORAGE_HIDDEN, JSON.stringify(Array.from(hidden)))
      localStorage.setItem(STORAGE_COLLAPSED, JSON.stringify(Array.from(collapsed)))
      localStorage.setItem(STORAGE_CUSTOM_TPLS, JSON.stringify(customTemplates))
      if (activeTemplateId) localStorage.setItem(STORAGE_ACTIVE_TPL, activeTemplateId)
      await saveDashboardConfig(config as Record<string, unknown>)
    } catch { /* localStorage already saved */ }
    setSaving(false)
  }, [layout, hidden, collapsed, customTemplates, activeTemplateId])

  const createCustomTemplate = useCallback((name: string, emoji: string) => {
    const visibleLayout = layout.filter(l => !hidden.has(l.i))
    const tpl: CustomTemplate = {
      id: `custom-${Date.now()}`,
      name, emoji,
      desc: 'Template personalizzato',
      color: '#F5C800',
      layout: visibleLayout,
      hidden: Array.from(hidden),
      createdAt: new Date().toISOString(),
    }
    setCustomTemplates(prev => {
      const next = [...prev, tpl]
      localStorage.setItem(STORAGE_CUSTOM_TPLS, JSON.stringify(next))
      return next
    })
    setActiveTemplateId(tpl.id)
    localStorage.setItem(STORAGE_ACTIVE_TPL, tpl.id)
  }, [layout, hidden])

  const deleteCustomTemplate = useCallback((id: string) => {
    setCustomTemplates(prev => {
      const next = prev.filter(t => t.id !== id)
      localStorage.setItem(STORAGE_CUSTOM_TPLS, JSON.stringify(next))
      return next
    })
    setActiveTemplateId(prev => prev === id ? null : prev)
  }, [])

  const applyOrder = useCallback((order: string[]) => {
    persistLayout(reorderLayout(layout, order))
  }, [layout, persistLayout])

  // Pulse areas
  const { pulseRaw } = data
  const pulseAreas = [
    { label: 'Commerciale',   value: pulseRaw.dealsTotal > 0 ? Math.round((pulseRaw.dealsWon / pulseRaw.dealsTotal) * 100) : 0, detail: `${pulseRaw.dealsActive} deal attivi`, color: '#F5C800', href: '/commerciale',         icon: <ShoppingCart className="w-3.5 h-3.5" /> },
    { label: 'Fatturazione',  value: data.invoicesPending === 0 ? 100 : Math.max(0, 100 - data.invoicesPending * 10),             detail: `${data.invoicesPending} in attesa`,   color: '#22C55E', href: '/fatturazione',        icon: <Receipt      className="w-3.5 h-3.5" /> },
    { label: 'Operativa',     value: pulseRaw.tasksTotal > 0 ? Math.round((pulseRaw.tasksDone / pulseRaw.tasksTotal) * 100) : 0, detail: `${pulseRaw.tasksTotal - pulseRaw.tasksDone} aperte`, color: '#3B82F6', href: '/operativa', icon: <Wrench className="w-3.5 h-3.5" /> },
    { label: 'Customer Care', value: (pulseRaw.ticketsOpen + pulseRaw.ticketsResolved) > 0 ? Math.round((pulseRaw.ticketsResolved / (pulseRaw.ticketsOpen + pulseRaw.ticketsResolved)) * 100) : 100, detail: `${pulseRaw.ticketsOpen} ticket aperti`, color: pulseRaw.ticketsOpen > 5 ? '#EF4444' : '#10B981', href: '/customer-care/tickets', icon: <Headphones className="w-3.5 h-3.5" /> },
    { label: 'OKR Strategia', value: pulseRaw.okrProgress, detail: 'progresso medio', color: '#A855F7', href: '/strategia', icon: <Target className="w-3.5 h-3.5" /> },
  ]

  const visibleLayout = layout
    .filter(l => !hidden.has(l.i))
    .map(l => collapsed.has(l.i) ? { ...l, h: 2, minH: 2 } : l)

  const visibleIds = new Set(visibleLayout.map(l => l.i))


  if (!mounted) return null

  const WIDGET_CONTENT: Record<string, React.ReactNode> = {
    chat:     <div className="p-3 h-full"><AIDashboardChat context={data.aiContext} /></div>,
    focus:    <DailyFocus items={data.focusItems.slice(0, 5)} name={data.greetingName} />,
    alerts:   <AlertCenter alerts={data.alerts.slice(0, 8)} />,
    metrics:  <MetricCards mrr={data.mrr} clientsCount={data.clients.length} clientsAtRisk={data.clientsAtRisk} tasksDueSoon={data.tasks.length} invoicesPending={data.invoicesPending} />,
    revenue:  <RevenueChart months={data.revenueMonths} currentMrr={data.mrr} />,
    tasks:    <TasksDue tasks={data.tasks} />,
    projects: <ProgettiWidget projects={data.projectSummaries.slice(0, 6)} />,
    risk:     <ClientsRiskPanel clients={data.clients} totalMrr={data.mrr} />,
    pulse:    <CompanyPulse areas={pulseAreas} />,
    workload: <WorkloadPanel profiles={data.allProfiles} tasks={data.allActiveTasks} />,
    insights: <SmartInsights clients={data.clients} totalMrr={data.mrr} />,
    margin:   <MarginRadar clients={data.clients} />,
    financial:<FinancialControl summary={data.financialSummary} />,
    pipeline: <SalesPipeline deals={data.dealsFull} />,
    decision: <DecisionCenter decisions={data.decisions} />,
    aibrief:  <div className="p-3 h-full"><AIExecutiveBrief context={data.aiContext} financialSummary={data.financialSummary} pulseRaw={data.pulseRaw} /></div>,
    kpiperf:      <KpiPerformanceWidget kpiSnapshot={data.kpiSnapshot} />,
    aiautomation: <AIAutomationCenter />,
    objectives:   <StrategicObjectives objectives={data.objectives} />,
    growthperf:   <GrowthPerformance clients={data.clients} kpis={data.growthKpis} />,
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-end gap-2 mb-3">
        <p className="text-[9px] flex-1" style={{ color: '#1E1E1E' }}>
          Trascina header · Ridimensiona dagli angoli
        </p>
        {data.isSuperAdmin && (
          <button
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
            style={{ background: '#111', border: '1px solid #1A1A1A', color: '#555' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(245,200,0,0.06)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,200,0,0.2)'
              ;(e.currentTarget as HTMLElement).style.color = '#F5C800'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = '#111'
              ;(e.currentTarget as HTMLElement).style.borderColor = '#1A1A1A'
              ;(e.currentTarget as HTMLElement).style.color = '#555'
            }}>
            <Crown className="w-3 h-3" />
            Personalizza
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* ── Grid ── */}
      {containerWidth > 0 && (
        <Responsive
          width={containerWidth}
          className="layout"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          layouts={{ lg: visibleLayout } as any}
          breakpoints={{ lg: 1200, md: 900, sm: 600, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 8, sm: 4, xs: 2, xxs: 1 }}
          rowHeight={44}
          margin={[10, 10]}
          containerPadding={[0, 0]}
          isDraggable
          isResizable
          draggableHandle=".drag-handle"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resizeHandles={['s', 'e', 'se', 'sw', 'w', 'ne', 'n', 'nw'] as any}
          onBreakpointChange={(bp: string) => { breakpointRef.current = bp }}
          onLayoutChange={(currentLayout: unknown) => {
            if (breakpointRef.current === 'lg') persistLayout(currentLayout as GridItem[])
          }}
          useCSSTransforms
        >
          {WIDGETS.filter(w => visibleIds.has(w.id)).map(w => (
            <div key={w.id} style={{ height: '100%' }}>
              <WidgetPanel
                label={w.label}
                emoji={w.emoji}
                collapsed={collapsed.has(w.id)}
                onCollapse={() => toggleCollapse(w.id)}
                onHide={() => toggleHide(w.id)}>
                {WIDGET_CONTENT[w.id]}
              </WidgetPanel>
            </div>
          ))}
        </Responsive>
      )}

      {/* ── Customize drawer (super admin only) ── */}
      {data.isSuperAdmin && (
        <CustomizePanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          layout={layout}
          hidden={hidden}
          customTemplates={customTemplates}
          activeTemplateId={activeTemplateId}
          onApplyTemplate={applyTemplate}
          onToggleWidget={toggleHide}
          onReset={resetLayout}
          onApplyOrder={applyOrder}
          onSaveCustomTemplate={createCustomTemplate}
          onDeleteCustomTemplate={deleteCustomTemplate}
          onSave={saveConfig}
          saving={saving}
        />
      )}
    </div>
  )
}
