'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronRight, Crown, Check, RotateCcw,
  TrendingUp, Users, CheckSquare, Receipt, ShoppingCart, Wrench, Headphones,
  Target, X, LayoutGrid,
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
import { DataQualityWidget }    from './DataQualityWidget'
import type { KpiSnapshotRow }  from './KpiPerformanceWidget'
import type { GrowthKpiRow }    from './GrowthPerformance'
import type { DataQualityReport } from './DataQualityWidget'
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
  dataQuality: DataQualityReport | null
}

export type DashboardConfig = {
  layout?: unknown[]; hidden?: string[]; collapsed?: string[]
  customTemplates?: unknown[]; activeTemplateId?: string | null
}

// ─── Widget registry ──────────────────────────────────────────────────────────
interface WidgetDef {
  id: string; label: string; emoji: string; href: string
  span?: 'full' | 'half'; height?: string
}

const WIDGET_DEFS: WidgetDef[] = [
  { id: 'metrics',  label: 'Metriche',             emoji: '📊', href: '/dashboard' },
  { id: 'focus',    label: 'Focus di oggi',         emoji: '☀️', href: '/le-mie-attivita' },
  { id: 'alerts',   label: 'Alert',                 emoji: '⚠️', href: '/dashboard' },
  { id: 'tasks',    label: 'Task Settimana',        emoji: '✅', href: '/le-mie-attivita' },
  { id: 'projects', label: 'Progetti',              emoji: '📁', href: '/progetti' },
  { id: 'aibrief',  label: 'AI Executive Brief',    emoji: '✍️', href: '/dashboard' },
  { id: 'chat',     label: 'AI Chat',               emoji: '🤖', href: '/chat', span: 'full' },
  { id: 'revenue',  label: 'Revenue',               emoji: '💰', href: '/fatturazione' },
  { id: 'risk',     label: 'Clienti a Rischio',     emoji: '🔴', href: '/clienti' },
  { id: 'pulse',    label: 'Company Pulse',          emoji: '🏢', href: '/dashboard' },
  { id: 'workload', label: 'Carico Team',            emoji: '👥', href: '/hr' },
  { id: 'insights', label: 'AI Insights',            emoji: '✨', href: '/dashboard', span: 'full' },
  { id: 'margin',   label: 'Margin Radar',           emoji: '📈', href: '/clienti' },
  { id: 'financial',label: 'Financial Control',      emoji: '💳', href: '/fatturazione' },
  { id: 'pipeline', label: 'Sales Pipeline',         emoji: '🎯', href: '/commerciale' },
  { id: 'decision', label: 'Decision Center',        emoji: '🧭', href: '/dashboard' },
  { id: 'kpiperf',  label: 'KPI Performance',        emoji: '📊', href: '/clienti' },
  { id: 'aiautomation', label: 'AI & Automation',    emoji: '🧠', href: '/dashboard', span: 'full' },
  { id: 'objectives',   label: 'OKR Aziendali',      emoji: '🎯', href: '/strategia' },
  { id: 'growthperf',   label: 'Growth Performance', emoji: '📈', href: '/clienti' },
  { id: 'dataquality',  label: 'Salute Dati',        emoji: '🩺', href: '/dashboard' },
]

// ─── Template definitions ─────────────────────────────────────────────────────
interface Template {
  id: string; name: string; emoji: string; desc: string; color: string
  widgets: string[]
}

const TEMPLATES: Template[] = [
  {
    id: 'essenziale',
    name: 'Essenziale',
    emoji: '⚡',
    desc: 'Le 6 card fondamentali: metriche, focus, alert, task, progetti e brief AI.',
    color: 'var(--color-gold-text)',
    widgets: ['metrics', 'focus', 'alerts', 'tasks', 'projects', 'aibrief'],
  },
  {
    id: 'ops',
    name: 'Operations',
    emoji: '🔧',
    desc: 'Focus operativo: task, alert, carico team e clienti a rischio.',
    color: 'var(--color-info)',
    widgets: ['metrics', 'focus', 'alerts', 'tasks', 'projects', 'workload', 'risk', 'pulse', 'dataquality'],
  },
  {
    id: 'biz',
    name: 'Business',
    emoji: '📊',
    desc: 'Visione finanziaria: revenue, pipeline, margini e fatturazione.',
    color: 'var(--color-success)',
    widgets: ['metrics', 'revenue', 'financial', 'pipeline', 'margin', 'aibrief', 'risk', 'kpiperf'],
  },
  {
    id: 'full',
    name: 'Completa',
    emoji: '🏢',
    desc: 'Tutti i widget disponibili in un\'unica vista.',
    color: 'var(--color-accent)',
    widgets: WIDGET_DEFS.map(w => w.id),
  },
]

const STORAGE_TPL = 'twobee-dash-template-v4'

// ─── MetricCards ──────────────────────────────────────────────────────────────
function MetricCards({ mrr, clientsCount, clientsAtRisk, tasksDueSoon, invoicesPending }: {
  mrr: number; clientsCount: number; clientsAtRisk: number
  tasksDueSoon: number; invoicesPending: number
}) {
  const cards = [
    { href: '/fatturazione', icon: <TrendingUp className="w-4 h-4" />, iconColor: 'var(--color-gold-text)', label: 'MRR', value: formatCurrency(mrr), sub: '/mese contratti', accent: 'var(--color-gold-text)' },
    { href: '/clienti',      icon: <Users       className="w-4 h-4" />, iconColor: 'var(--color-info)', label: 'Clienti', value: String(clientsCount), sub: clientsAtRisk > 0 ? `${clientsAtRisk} in bilico` : 'tutti stabili', accent: 'var(--color-info)', subWarning: clientsAtRisk > 0 },
    { href: '/le-mie-attivita', icon: <CheckSquare className="w-4 h-4" />, iconColor: tasksDueSoon > 0 ? 'var(--color-warning)' : 'var(--color-text-tertiary)', label: 'Task', value: String(tasksDueSoon), sub: 'in scadenza 7gg', accent: tasksDueSoon > 0 ? 'var(--color-warning)' : 'var(--color-text-secondary)' },
    { href: '/fatturazione', icon: <Receipt     className="w-4 h-4" />, iconColor: invoicesPending > 0 ? 'var(--color-error)' : 'var(--color-text-tertiary)', label: 'Fatture', value: String(invoicesPending), sub: 'in attesa', accent: invoicesPending > 0 ? 'var(--color-error)' : 'var(--color-text-secondary)' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5 p-3 h-full content-start">
      {cards.map(c => (
        <Link key={c.label} href={c.href}
          className="flex flex-col rounded-xl p-3.5 transition-all"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${c.accent} 20%, transparent)`; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <span style={{ color: c.iconColor }}>{c.icon}</span>
            <span className="text-2xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>{c.label}</span>
          </div>
          <p className="text-xl font-black leading-none font-heading" style={{ color: c.accent }}>{c.value}</p>
          <p className="text-2xs mt-1.5" style={{ color: (c as { subWarning?: boolean }).subWarning ? 'var(--color-gold-text)' : 'var(--color-text-tertiary)' }}>{c.sub}</p>
        </Link>
      ))}
    </div>
  )
}

// ─── WidgetCard ───────────────────────────────────────────────────────────────
function WidgetCard({ def, children }: { def: WidgetDef; children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-col rounded-2xl overflow-hidden ${def.span === 'full' ? 'col-span-2' : ''}`}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        minHeight: def.id === 'chat' || def.id === 'insights' || def.id === 'aiautomation' ? '200px' : '220px',
      }}>
      <Link
        href={def.href}
        className="flex items-center gap-2 px-4 py-2.5 shrink-0 group transition-colors hover:bg-overlay/[0.02]"
        style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-sm shrink-0">{def.emoji}</span>
        <span className="text-2xs font-semibold flex-1 truncate uppercase tracking-[0.1em]"
          style={{ color: 'var(--color-text-tertiary)' }}>{def.label}</span>
        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--color-text-tertiary)' }} />
      </Link>
      <div className="flex-1 overflow-auto min-h-0">
        {children}
      </div>
    </div>
  )
}

// ─── Template Picker (drawer) ─────────────────────────────────────────────────
function TemplatePicker({
  open, onClose, activeId, onSelect, onSave, saving,
}: {
  open: boolean; onClose: () => void
  activeId: string; onSelect: (id: string) => void
  onSave: () => Promise<void>; saving: boolean
}) {
  return (
    <>
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
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
        style={{
          width: '360px',
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-border)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          boxShadow: open ? '-24px 0 80px rgba(0,0,0,0.6)' : 'none',
        }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-overlay/[0.06] shrink-0">
          <Crown className="w-4 h-4 text-gold-text" />
          <span className="text-sm font-black text-text-primary flex-1">Template Dashboard</span>
          <button onClick={async () => { await onSave(); onClose() }} disabled={saving}
            className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl"
            style={{ background: 'var(--color-gold-dim)', border: '1px solid var(--color-gold-dim)', color: 'var(--color-gold-text)' }}>
            <Check className="w-3 h-3" /> {saving ? 'Salvo…' : 'Salva'}
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-overlay/20 hover:text-overlay/50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">
          {TEMPLATES.map(t => {
            const isActive = activeId === t.id
            return (
              <button key={t.id} onClick={() => onSelect(t.id)}
                className="w-full text-left p-4 rounded-2xl transition-all"
                style={{
                  background: isActive ? `color-mix(in srgb, ${t.color} 6%, transparent)` : 'var(--color-surface)',
                  border: `1px solid ${isActive ? `color-mix(in srgb, ${t.color} 25%, transparent)` : 'var(--color-border)'}`,
                }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{t.emoji}</span>
                  <span className="text-sm font-black text-text-primary">{t.name}</span>
                  {isActive && <Check className="w-4 h-4 ml-auto" style={{ color: t.color }} />}
                </div>
                <p className="text-xs text-overlay/30 mb-3">{t.desc}</p>
                <div className="flex flex-wrap gap-1">
                  {t.widgets.slice(0, 8).map(wid => {
                    const wd = WIDGET_DEFS.find(w => w.id === wid)
                    return wd ? (
                      <span key={wid} className="text-2xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--color-surface)', color: 'var(--color-text-tertiary)' }}>
                        {wd.emoji} {wd.label}
                      </span>
                    ) : null
                  })}
                  {t.widgets.length > 8 && (
                    <span className="text-2xs px-2 py-0.5 rounded-full text-overlay/20">
                      +{t.widgets.length - 8} altri
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-overlay/[0.06] shrink-0">
          <p className="text-2xs text-overlay/10 text-center">
            Solo i Super Admin possono cambiare template
          </p>
        </div>
      </div>
    </>
  )
}

// ─── DashboardGrid ────────────────────────────────────────────────────────────
export function DashboardGrid({ data, initialConfig }: { data: DashboardData; initialConfig?: DashboardConfig | null }) {
  const [mounted, setMounted] = useState(false)
  const [templateId, setTemplateId] = useState('essenziale')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      const saved = initialConfig?.activeTemplateId ?? localStorage.getItem(STORAGE_TPL)
      if (saved && TEMPLATES.find(t => t.id === saved)) setTemplateId(saved)
    } catch { /* ignore */ }
    setMounted(true)
  }, [initialConfig])

  const selectTemplate = useCallback((id: string) => {
    setTemplateId(id)
    localStorage.setItem(STORAGE_TPL, id)
  }, [])

  const saveConfig = useCallback(async () => {
    setSaving(true)
    try {
      localStorage.setItem(STORAGE_TPL, templateId)
      await saveDashboardConfig({ activeTemplateId: templateId })
    } catch { /* localStorage already saved */ }
    setSaving(false)
  }, [templateId])

  const template = TEMPLATES.find(t => t.id === templateId) ?? TEMPLATES[0]
  const visibleWidgets = template.widgets

  const { pulseRaw } = data
  const pulseAreas = [
    { label: 'Commerciale',   value: pulseRaw.dealsTotal > 0 ? Math.round((pulseRaw.dealsWon / pulseRaw.dealsTotal) * 100) : 0, detail: `${pulseRaw.dealsActive} deal attivi`, color: 'var(--color-gold-text)', href: '/commerciale',         icon: <ShoppingCart className="w-3.5 h-3.5" /> },
    { label: 'Fatturazione',  value: data.invoicesPending === 0 ? 100 : Math.max(0, 100 - data.invoicesPending * 10),             detail: `${data.invoicesPending} in attesa`,   color: 'var(--color-success)', href: '/fatturazione',        icon: <Receipt      className="w-3.5 h-3.5" /> },
    { label: 'Operativa',     value: pulseRaw.tasksTotal > 0 ? Math.round((pulseRaw.tasksDone / pulseRaw.tasksTotal) * 100) : 0, detail: `${pulseRaw.tasksTotal - pulseRaw.tasksDone} aperte`, color: 'var(--color-info)', href: '/le-mie-attivita', icon: <Wrench className="w-3.5 h-3.5" /> },
    { label: 'Customer Care', value: (pulseRaw.ticketsOpen + pulseRaw.ticketsResolved) > 0 ? Math.round((pulseRaw.ticketsResolved / (pulseRaw.ticketsOpen + pulseRaw.ticketsResolved)) * 100) : 100, detail: `${pulseRaw.ticketsOpen} ticket aperti`, color: pulseRaw.ticketsOpen > 5 ? 'var(--color-error)' : 'var(--color-success)', href: '/customer-care/tickets', icon: <Headphones className="w-3.5 h-3.5" /> },
    { label: 'OKR Strategia', value: pulseRaw.okrProgress, detail: 'progresso medio', color: 'var(--color-accent)', href: '/strategia', icon: <Target className="w-3.5 h-3.5" /> },
  ]

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
    aibrief:  <div className="p-3 h-full"><AIExecutiveBrief /></div>,
    kpiperf:      <KpiPerformanceWidget kpiSnapshot={data.kpiSnapshot} />,
    aiautomation: <AIAutomationCenter />,
    objectives:   <StrategicObjectives objectives={data.objectives} />,
    growthperf:   <GrowthPerformance clients={data.clients} kpis={data.growthKpis} />,
    dataquality:  <DataQualityWidget report={data.dataQuality} />,
  }

  if (!mounted) return null

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-overlay/15" />
          <span className="text-xs text-overlay/20">{template.emoji} {template.name}</span>
        </div>
        {data.isSuperAdmin && (
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl transition-all"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--color-gold-dim)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-gold-dim)';
              (e.currentTarget as HTMLElement).style.color = 'var(--color-gold-text)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--color-surface)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)';
              (e.currentTarget as HTMLElement).style.color = 'var(--color-text-tertiary)'
            }}>
            <Crown className="w-3 h-3" /> Template <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Grid — fixed 2-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visibleWidgets.map(wid => {
          const def = WIDGET_DEFS.find(w => w.id === wid)
          if (!def || !WIDGET_CONTENT[wid]) return null
          return (
            <WidgetCard key={wid} def={def}>
              {WIDGET_CONTENT[wid]}
            </WidgetCard>
          )
        })}
      </div>

      {/* Template picker drawer */}
      {data.isSuperAdmin && (
        <TemplatePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          activeId={templateId}
          onSelect={selectTemplate}
          onSave={saveConfig}
          saving={saving}
        />
      )}
    </div>
  )
}
