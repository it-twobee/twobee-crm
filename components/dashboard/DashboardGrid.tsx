'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronRight, Crown, Check, TrendingUp, Users, AlertTriangle,
  Headphones, X, LayoutGrid, PauseCircle,
} from 'lucide-react'
import Link from 'next/link'

import { DailyFocus }       from './DailyFocus'
import { AlertCenter }      from './AlertCenter'
import { ClientsRiskPanel } from './ClientsRiskPanel'
import { ClientHealthMap }  from './ClientHealthMap'
import { ClientsStatusTable } from './ClientsStatusTable'
import { CompanyPulse }     from './CompanyPulse'
import { SmartInsights }    from './SmartInsights'
import type { RiskResult }  from '@/lib/risk'
import { AIDashboardChat }  from './AIDashboardChat'
import { RecentMessages }   from './RecentMessages'
import { KpiPerformanceWidget } from './KpiPerformanceWidget'
import { DeliveryRadar }    from './DeliveryRadar'
import { NextDeliveries }   from './NextDeliveries'
import { MyDay }            from './MyDay'
import type { KpiSnapshotRow }  from './KpiPerformanceWidget'
import type { DeliveryStats }   from './DeliveryRadar'
import type { DeliveryRow }     from './NextDeliveries'
import type { MyDayRow }        from './MyDay'
import type { FocusItem }      from './DailyFocus'
import type { DashAlert }      from './AlertCenter'
import type { AIContext }      from './AIDashboardChat'
import type { Client, Profile, ChatMessageWithSender, ChatChannel } from '@/lib/types/database'
import { formatCurrency } from '@/lib/utils'
import { saveDashboardConfig } from '@/app/actions/dashboard-config'

export interface DashboardData {
  aiContext: AIContext
  focusItems: FocusItem[]
  greetingName: string
  alerts: DashAlert[]
  /** già al netto di interni e persi: è la base di ogni widget statistico */
  clients: Client[]
  /** solo per il churn del pannello rischio, fuori da ogni altro conto */
  lostClients: Client[]
  /** §176: fermi — fuori dai conti, ma il loro MRR si recupera */
  pausedClients?: Client[]
  pausedMrr?: number
  mrr: number
  allProfiles: Profile[]
  clientsAtRisk: number
  /** §197: rischio per id cliente, calcolato dal server (`lib/risk.ts`) */
  risks?: Record<string, RiskResult>
  clientsLost: number
  ticketsOpen: number
  ticketsResolved: number
  recentMessages: (ChatMessageWithSender & { channel: Pick<ChatChannel, 'id' | 'name' | 'type'> | null })[]
  kpiSnapshot: KpiSnapshotRow[]
  /** dimensione delivery: prima la dashboard ignorava del tutto i progetti */
  delivery: DeliveryStats
  nextDeliveries: DeliveryRow[]
  myDay: MyDayRow[]
  myOverdue: number
  isAdmin: boolean
  isSuperAdmin: boolean
  userId: string
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
  { id: 'myday',    label: 'La mia giornata',    emoji: '☕', href: '/le-mie-attivita' },
  { id: 'delivery', label: 'Delivery Radar',     emoji: '🎯', href: '/progetti' },
  { id: 'nextdue',  label: 'Prossime consegne',  emoji: '📅', href: '/progetti' },
  { id: 'metrics',  label: 'Metriche',           emoji: '📊', href: '/clienti' },
  { id: 'focus',    label: 'Focus di oggi',      emoji: '☀️', href: '/dashboard' },
  { id: 'alerts',   label: 'Alert',              emoji: '⚠️', href: '/dashboard' },
  { id: 'risk',     label: 'Clienti a Rischio',  emoji: '🔴', href: '/clienti' },
  { id: 'health',   label: 'Mappa Salute',       emoji: '🗺️', href: '/clienti' },
  { id: 'clients',  label: 'Stato Clienti',      emoji: '🏷️', href: '/clienti', span: 'full' },
  { id: 'pulse',    label: 'Company Pulse',      emoji: '🏢', href: '/dashboard' },
  { id: 'kpiperf',  label: 'KPI Performance',    emoji: '📈', href: '/clienti' },
  { id: 'messages', label: 'Ultimi Messaggi',    emoji: '💬', href: '/chat' },
  { id: 'insights', label: 'AI Insights',        emoji: '✨', href: '/dashboard', span: 'full' },
  { id: 'chat',     label: 'AI Chat',            emoji: '🤖', href: '/chat', span: 'full' },
]

// ─── Template definitions ─────────────────────────────────────────────────────
// Ogni template risponde a UNA domanda. Se non sai quale scegliere, "Giornata":
// è quello che serve nove mattine su dieci.
interface Template {
  id: string; name: string; emoji: string; desc: string; question: string; color: string
  widgets: string[]
}

const TEMPLATES: Template[] = [
  {
    id: 'giornata',
    name: 'Giornata',
    emoji: '☕',
    question: 'Cosa devo fare oggi?',
    desc: 'Le tue attività, le consegne vicine e cosa è andato storto.',
    color: 'var(--color-gold-text)',
    widgets: ['myday', 'delivery', 'nextdue', 'alerts'],
  },
  {
    id: 'delivery',
    name: 'Delivery',
    emoji: '🎯',
    question: 'Come stanno andando i progetti?',
    desc: 'Radar consegne, scadenze, focus e alert operativi.',
    color: 'var(--color-info)',
    widgets: ['delivery', 'nextdue', 'myday', 'focus', 'alerts', 'insights'],
  },
  {
    id: 'clienti',
    name: 'Clienti',
    emoji: '🏢',
    question: 'Come sta il portafoglio?',
    desc: 'Salute, stato, KPI e ricavi ricorrenti.',
    color: 'var(--color-accent)',
    widgets: ['metrics', 'risk', 'health', 'clients', 'kpiperf', 'insights'],
  },
  {
    id: 'direzione',
    name: 'Direzione',
    emoji: '👑',
    question: 'Come sta l\'agenzia?',
    desc: 'Numeri commerciali e consegna nella stessa schermata.',
    color: 'var(--color-success)',
    widgets: ['metrics', 'delivery', 'pulse', 'risk', 'nextdue', 'insights'],
  },
  {
    id: 'full',
    name: 'Completa',
    emoji: '🗂️',
    question: 'Voglio vedere tutto.',
    desc: 'Tutti i widget disponibili in un\'unica vista.',
    color: 'var(--color-text-secondary)',
    widgets: WIDGET_DEFS.map(w => w.id),
  },
]

// v5: i template sono cambiati (aggiunta la dimensione delivery), la vecchia
// scelta salvata non esiste più → chiave nuova, così nessuno resta su un id morto
const STORAGE_TPL = 'twobee-dash-template-v5'

// ─── MetricCards ──────────────────────────────────────────────────────────────
function MetricCards({ mrr, clientsCount, clientsAtRisk, ticketsOpen, pausedCount, pausedMrr }: {
  mrr: number; clientsCount: number; clientsAtRisk: number; ticketsOpen: number
  pausedCount: number; pausedMrr: number
}) {
  const cards = [
    { href: '/clienti', icon: <TrendingUp className="w-4 h-4" />, iconColor: 'var(--color-gold-text)', label: 'MRR', value: formatCurrency(mrr), sub: '/mese contratti', accent: 'var(--color-gold-text)' },
    { href: '/clienti', icon: <Users className="w-4 h-4" />, iconColor: 'var(--color-info)', label: 'Clienti', value: String(clientsCount), sub: 'attivi', accent: 'var(--color-info)' },
    // §176: l'MRR sospeso non è perso — è quello che torna con una telefonata
    ...(pausedCount > 0 ? [{
      href: '/clienti', icon: <PauseCircle className="w-4 h-4" />, iconColor: 'var(--color-warning)',
      label: 'In pending', value: String(pausedCount),
      sub: `${formatCurrency(pausedMrr)} sospesi`, accent: 'var(--color-warning)',
    }] : []),
    { href: '/clienti', icon: <AlertTriangle className="w-4 h-4" />, iconColor: clientsAtRisk > 0 ? 'var(--color-warning)' : 'var(--color-text-tertiary)', label: 'A rischio', value: String(clientsAtRisk), sub: clientsAtRisk > 0 ? 'da presidiare' : 'tutti stabili', accent: clientsAtRisk > 0 ? 'var(--color-warning)' : 'var(--color-text-secondary)' },
    { href: '/customer-care/tickets', icon: <Headphones className="w-4 h-4" />, iconColor: ticketsOpen > 0 ? 'var(--color-error)' : 'var(--color-text-tertiary)', label: 'Ticket', value: String(ticketsOpen), sub: 'aperti', accent: ticketsOpen > 0 ? 'var(--color-error)' : 'var(--color-text-secondary)' },
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
          <p className="text-2xs mt-1.5" style={{ color: 'var(--color-text-tertiary)' }}>{c.sub}</p>
        </Link>
      ))}
    </div>
  )
}

// ─── WidgetCard ───────────────────────────────────────────────────────────────
function WidgetCard({ def, children }: { def: WidgetDef; children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-col rounded-2xl overflow-hidden shadow-soft ${def.span === 'full' ? 'md:col-span-2' : ''}`}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        minHeight: def.id === 'chat' || def.id === 'insights' ? '200px' : '220px',
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
          background: 'var(--color-scrim)',
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
        }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <Crown className="w-4 h-4 text-gold-text" />
          <span className="text-sm font-black text-text-primary flex-1">Template Dashboard</span>
          <button onClick={async () => { await onSave(); onClose() }} disabled={saving}
            className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl"
            style={{ background: 'var(--color-gold-dim)', border: '1px solid var(--color-gold-dim)', color: 'var(--color-gold-text)' }}>
            <Check className="w-3 h-3" /> {saving ? 'Salvo…' : 'Salva'}
          </button>
          <button onClick={onClose} aria-label="Chiudi" className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary">
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
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{t.emoji}</span>
                  <span className="text-sm font-black text-text-primary">{t.name}</span>
                  <span className="text-2xs text-text-tertiary tabular">{t.widgets.length} widget</span>
                  {isActive && <Check className="w-4 h-4 ml-auto" style={{ color: t.color }} />}
                </div>
                {/* la domanda a cui risponde: si sceglie per bisogno, non per nome */}
                <p className="text-xs font-semibold mb-1" style={{ color: t.color }}>{t.question}</p>
                <p className="text-xs text-text-secondary mb-3">{t.desc}</p>
                <div className="flex flex-wrap gap-1">
                  {t.widgets.slice(0, 8).map(wid => {
                    const wd = WIDGET_DEFS.find(w => w.id === wid)
                    return wd ? (
                      <span key={wid} className="text-2xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--color-background)', color: 'var(--color-text-tertiary)' }}>
                        {wd.emoji} {wd.label}
                      </span>
                    ) : null
                  })}
                  {t.widgets.length > 8 && (
                    <span className="text-2xs px-2 py-0.5 rounded-full text-text-tertiary">
                      +{t.widgets.length - 8} altri
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0">
          <p className="text-2xs text-text-tertiary text-center">
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
  // 'giornata' è il default: risponde alla domanda che ci si fa ogni mattina
  const [templateId, setTemplateId] = useState('giornata')
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

  const ticketsTotal = data.ticketsOpen + data.ticketsResolved
  const stableClients = data.clients.filter(c => c.client_label === 'stabile').length
  const pulseAreas = [
    {
      label: 'Portafoglio',
      value: data.clients.length > 0 ? Math.round((stableClients / data.clients.length) * 100) : 0,
      detail: `${stableClients}/${data.clients.length} stabili`,
      color: 'var(--color-info)',
      href: '/clienti',
      icon: <Users className="w-3.5 h-3.5" />,
    },
    {
      label: 'Customer Care',
      value: ticketsTotal > 0 ? Math.round((data.ticketsResolved / ticketsTotal) * 100) : 100,
      detail: `${data.ticketsOpen} ticket aperti`,
      color: data.ticketsOpen > 5 ? 'var(--color-error)' : 'var(--color-success)',
      href: '/customer-care/tickets',
      icon: <Headphones className="w-3.5 h-3.5" />,
    },
  ]

  const WIDGET_CONTENT: Record<string, React.ReactNode> = {
    myday:    <MyDay rows={data.myDay} overdue={data.myOverdue} />,
    delivery: <DeliveryRadar s={data.delivery} />,
    nextdue:  <NextDeliveries rows={data.nextDeliveries} />,
    chat:     <div className="p-3 h-full"><AIDashboardChat context={data.aiContext} /></div>,
    focus:    <DailyFocus items={data.focusItems.slice(0, 5)} name={data.greetingName} />,
    alerts:   <AlertCenter alerts={data.alerts.slice(0, 8)} />,
    metrics:  <MetricCards mrr={data.mrr} clientsCount={data.clients.length} clientsAtRisk={data.clientsAtRisk}
                ticketsOpen={data.ticketsOpen} pausedCount={data.pausedClients?.length ?? 0} pausedMrr={data.pausedMrr ?? 0} />,
    risk:     <ClientsRiskPanel clients={data.clients} lost={data.lostClients} totalMrr={data.mrr} />,
    health:   <ClientHealthMap clients={data.clients} />,
    clients:  <ClientsStatusTable clients={data.clients} />,
    pulse:    <CompanyPulse areas={pulseAreas} />,
    insights: <SmartInsights clients={data.clients} totalMrr={data.mrr} risks={data.risks ?? {}} />,
    messages: <RecentMessages messages={data.recentMessages} />,
    kpiperf:  <KpiPerformanceWidget kpiSnapshot={data.kpiSnapshot} />,
  }

  if (!mounted) return null

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-text-tertiary" />
          <span className="text-xs text-text-secondary">{template.emoji} {template.name}</span>
        </div>
        {data.isSuperAdmin && (
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl transition-all"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}>
            <Crown className="w-3 h-3" /> Template <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Grid — fixed 2-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
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
