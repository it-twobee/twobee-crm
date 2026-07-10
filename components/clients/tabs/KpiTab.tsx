'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Download, TrendingUp, TrendingDown, Minus, Target,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Pencil,
  Settings2, Trash2, X, Loader2, Send, Bot, Sparkles, FileText, RefreshCw, Zap, Link2 } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Client, ClientKpi, ClientKpiConfig, CustomKpiDef, Project } from '@/lib/types/database'

interface Props {
  client: Client
  kpis: ClientKpi[]
  kpiConfigs: ClientKpiConfig[]
  projects: Project[]
}

// ─── KPI standard per tipo ──────────────────────────────────────────────────

interface StdKpiDef {
  key: string
  label: string
  unit?: string
  prefix?: string
  lower_is_better?: boolean
  decimals?: number
  isInt?: boolean
  placeholder?: string
  targetKey?: keyof Client
}

interface KpiCategory {
  label: string
  emoji: string
  keys: string[]
}

const GROWTH_KPIS: StdKpiDef[] = [
  // Advertising Performance
  { key: 'mer',                label: 'MER (Marketing Efficiency Ratio)', unit: '×', decimals: 2,         placeholder: 'es. 4.2',    targetKey: 'target_roas' },
  { key: 'ctr',                label: 'CTR',                      unit: '%',   decimals: 2,               placeholder: 'es. 2.8',    targetKey: 'target_ctr' },
  { key: 'cpa',                label: 'CPA (costo per acquisto)',  prefix: '€', lower_is_better: true,     placeholder: 'es. 18.00',  targetKey: 'target_cpa' },
  { key: 'ad_spend',           label: 'Ad Spend',                 prefix: '€', isInt: true,               placeholder: 'es. 3500' },
  // Lead Generation
  { key: 'leads_generated',    label: 'Lead generati',                         isInt: true,               placeholder: 'es. 85',     targetKey: 'target_leads_monthly' },
  { key: 'cpl',                label: 'CPL (costo per lead)',      prefix: '€', lower_is_better: true,    placeholder: 'es. 12.00' },
  { key: 'conversion_rate',    label: 'Tasso di conversione',     unit: '%',   decimals: 2,               placeholder: 'es. 3.2',    targetKey: 'target_conv_rate' },
  { key: 'sql_count',          label: 'SQL (lead qualificati)',                 isInt: true,               placeholder: 'es. 12' },
  // Revenue & Ecommerce
  { key: 'revenue_attributed', label: 'Revenue attribuita',       prefix: '€', isInt: true,               placeholder: 'es. 15000',  targetKey: 'target_revenue_monthly' },
  { key: 'ltv',                label: 'LTV (Lifetime Value)',      prefix: '€', decimals: 2,               placeholder: 'es. 350.00' },
  { key: 'orders_count',       label: 'Ordini / Transazioni',                  isInt: true,               placeholder: 'es. 230' },
  { key: 'avg_order_value',    label: 'Valore medio ordine',      prefix: '€', decimals: 2,               placeholder: 'es. 65.00' },
  { key: 'cart_abandonment',   label: 'Abbandono carrello',       unit: '%',   lower_is_better: true,     placeholder: 'es. 68.0' },
  // Social & Community
  { key: 'followers_gained',   label: 'Follower guadagnati',                   isInt: true,               placeholder: 'es. 500',    targetKey: 'target_followers_monthly' },
  { key: 'reach',              label: 'Reach / Impressioni',                   isInt: true,               placeholder: 'es. 25000' },
  { key: 'engagement_rate',    label: 'Engagement rate',          unit: '%',   decimals: 2,               placeholder: 'es. 3.5' },
  { key: 'mentions_count',     label: 'Menzioni / UGC',                        isInt: true,               placeholder: 'es. 45' },
]

const GROWTH_CATEGORIES: KpiCategory[] = [
  { label: 'Advertising Performance', emoji: '📣', keys: ['mer', 'ctr', 'cpa', 'ad_spend'] },
  { label: 'Lead Generation',         emoji: '🎯', keys: ['leads_generated', 'cpl', 'conversion_rate', 'sql_count'] },
  { label: 'Revenue & Ecommerce',     emoji: '🛒', keys: ['revenue_attributed', 'ltv', 'orders_count', 'avg_order_value', 'cart_abandonment'] },
  { label: 'Social & Community',      emoji: '📱', keys: ['followers_gained', 'reach', 'engagement_rate', 'mentions_count'] },
]

const DIGITAL_KPIS: StdKpiDef[] = [
  // Web & SEO
  { key: 'organic_sessions',   label: 'Sessioni organiche',                    isInt: true,               placeholder: 'es. 4500' },
  { key: 'new_users',          label: 'Nuovi utenti',                          isInt: true,               placeholder: 'es. 1200' },
  { key: 'seo_avg_position',   label: 'Posizione SEO media',     decimals: 1,  lower_is_better: true,     placeholder: 'es. 8.2' },
  { key: 'bounce_rate',        label: 'Bounce rate',              unit: '%',   lower_is_better: true,     placeholder: 'es. 42.0' },
  // Prodotto / App / Gestionale
  { key: 'active_users',       label: 'Utenti attivi (DAU/MAU)',               isInt: true,               placeholder: 'es. 180' },
  { key: 'feature_adoption',   label: 'Feature adoption rate',   unit: '%',   decimals: 1,               placeholder: 'es. 62.0' },
  { key: 'support_tickets',    label: 'Ticket aperti',                         isInt: true, lower_is_better: true, placeholder: 'es. 8' },
  { key: 'uptime',             label: 'Uptime / SLA',             unit: '%',   decimals: 2,               placeholder: 'es. 99.9' },
  // AI & CRM / Automazione
  { key: 'ai_interactions',    label: 'Interazioni AI / Bot',                  isInt: true,               placeholder: 'es. 1200' },
  { key: 'crm_contacts',       label: 'Contatti CRM acquisiti',                isInt: true,               placeholder: 'es. 85' },
  { key: 'automation_runs',    label: 'Automazioni eseguite',                  isInt: true,               placeholder: 'es. 340' },
  { key: 'leads_generated',    label: 'Lead inbound (da canale digitale)',      isInt: true,               placeholder: 'es. 40',     targetKey: 'target_leads_monthly' },
  // Email & Comunicazione
  { key: 'email_open_rate',    label: 'Email open rate',          unit: '%',   decimals: 1,               placeholder: 'es. 28.0' },
  { key: 'email_click_rate',   label: 'Email click rate',         unit: '%',   decimals: 2,               placeholder: 'es. 4.5' },
  { key: 'unsubscribe_rate',   label: 'Tasso disiscrizione',      unit: '%',   lower_is_better: true,     placeholder: 'es. 0.3' },
]

const DIGITAL_CATEGORIES: KpiCategory[] = [
  { label: 'Web & SEO',                  emoji: '🌐', keys: ['organic_sessions', 'new_users', 'seo_avg_position', 'bounce_rate'] },
  { label: 'Prodotto / App / Gestionale',emoji: '💻', keys: ['active_users', 'feature_adoption', 'support_tickets', 'uptime'] },
  { label: 'AI & CRM / Automazione',     emoji: '🤖', keys: ['ai_interactions', 'crm_contacts', 'automation_runs', 'leads_generated'] },
  { label: 'Email & Comunicazione',      emoji: '✉️', keys: ['email_open_rate', 'email_click_rate', 'unsubscribe_rate'] },
]

const MONTH_LABELS: Record<string, string> = {
  '01': 'Gen', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'Mag', '06': 'Giu', '07': 'Lug', '08': 'Ago',
  '09': 'Set', '10': 'Ott', '11': 'Nov', '12': 'Dic',
}

function monthLabel(dateStr: string) {
  const [, m] = dateStr.split('-')
  return MONTH_LABELS[m] ?? m
}

function getKpiValue(kpi: ClientKpi, key: string): number | null {
  if (key in kpi) return (kpi as unknown as Record<string, unknown>)[key] as number | null
  return kpi.custom_data?.[key] ?? null
}

function delta(actual: number | null, target: number | null, lowerIsBetter = false) {
  if (!actual || !target) return { pct: 0, status: 'none' as const }
  const pct = lowerIsBetter ? ((target - actual) / target) * 100 : ((actual - target) / target) * 100
  const status = pct >= 0 ? 'good' as const : pct >= -20 ? 'warn' as const : 'bad' as const
  return { pct, status }
}

function calcHealthScore(kpi: ClientKpi | undefined, client: Client, stdDefs: StdKpiDef[], enabledKeys: string[]): number {
  if (!kpi) return 0
  const checks = stdDefs
    .filter(d => enabledKeys.includes(d.key) && d.targetKey)
    .map(d => ({
      actual: getKpiValue(kpi, d.key),
      target: d.targetKey ? (client[d.targetKey] as number | null) : null,
      lower: d.lower_is_better,
    }))
  const valid = checks.filter(c => c.actual && c.target)
  if (!valid.length) return 50
  const scores = valid.map(c => {
    const { pct } = delta(c.actual, c.target, c.lower)
    if (pct >= 10) return 100
    if (pct >= 0) return 80
    if (pct >= -15) return 55
    if (pct >= -30) return 30
    return 10
  })
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

// ─── Components ─────────────────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const cfg = score >= 75 ? { label: 'Ottimo', cls: 'text-success' }
    : score >= 50 ? { label: 'Nella norma', cls: 'text-warning' }
    : score >= 25 ? { label: 'Attenzione', cls: 'text-orange' }
    : { label: 'Critico', cls: 'text-error' }
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-10 h-10">
        <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
          <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth="3" className={cfg.cls} />
          <circle cx="18" cy="18" r="14" fill="none" strokeWidth="3"
            strokeDasharray={`${(score / 100) * 87.96} 87.96`} strokeLinecap="round"
            className={`${cfg.cls} stroke-current`} />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-2xs font-black ${cfg.cls}`}>{score}</span>
      </div>
      <div>
        <p className={`text-sm font-black ${cfg.cls}`}>{cfg.label}</p>
        <p className="text-2xs text-text-secondary">health score</p>
      </div>
    </div>
  )
}

function KpiCard({ def, actual, target }: { def: StdKpiDef | CustomKpiDef; actual: number | null; target: number | null }) {
  const label = 'label' in def ? def.label : def.name
  const lower = 'lower_is_better' in def ? def.lower_is_better : false
  const prefix = 'prefix' in def ? (def.prefix ?? '') : ''
  const unit = 'unit' in def ? (def.unit ?? (def as CustomKpiDef).unit ?? '') : def.unit ?? ''
  const decimals = 'decimals' in def ? ((def as StdKpiDef).decimals ?? 1) : 0

  const { pct, status } = delta(actual, target ?? null, lower ?? false)
  const statusColor = status === 'good' ? 'text-success' : status === 'warn' ? 'text-warning' : status === 'bad' ? 'text-error' : 'text-text-secondary'
  const TrendIcon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus
  const fmt = (v: number) => prefix + v.toFixed(decimals) + unit

  return (
    <div className={`bg-surface border rounded-xl p-4 ${status === 'bad' ? 'border-error/30' : status === 'warn' ? 'border-warning/20' : 'border-border'}`}>
      <p className="text-xs text-text-secondary mb-2">{label}</p>
      <p className={`text-2xl font-black ${actual != null ? statusColor : 'text-text-tertiary'}`}>
        {actual != null ? fmt(actual) : '—'}
      </p>
      {target != null && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-2xs text-text-secondary flex items-center gap-1">
              <Target className="w-2.5 h-2.5" /> target: {fmt(target)}
            </span>
            {actual != null && (
              <span className={`flex items-center gap-0.5 text-2xs font-bold ${statusColor}`}>
                <TrendIcon className="w-2.5 h-2.5" />
                {Math.abs(pct).toFixed(0)}%
              </span>
            )}
          </div>
          {actual != null && (
            <div className="h-1 bg-surface-active rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${status === 'good' ? 'bg-success' : status === 'warn' ? 'bg-warning' : 'bg-error'}`}
                style={{ width: `${Math.min((actual / target) * 100, 120)}%` }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── KPI Setup Chat ──────────────────────────────────────────────────────────

interface KpiSetupChatProps {
  client: Client
  isGrowth: boolean
  messages: { role: 'ai' | 'user'; text: string }[]
  setMessages: React.Dispatch<React.SetStateAction<{ role: 'ai' | 'user'; text: string }[]>>
  input: string
  setInput: (v: string) => void
  loading: boolean
  setLoading: (v: boolean) => void
  started: boolean
  setStarted: (v: boolean) => void
  chatEndRef: React.RefObject<HTMLDivElement>
  onInsertKpi: () => void
}

const GROWTH_SUGGESTIONS = [
  'Budget ads mensile ~€3.000, obiettivo ROAS 3×',
  'Lead generation B2B, target 50 lead/mese',
  'Ecommerce, revenue mensile target €20.000',
  'Awareness + conversioni, CTR target 3%',
]

const DIGITAL_SUGGESTIONS = [
  'Social media management, +500 follower/mese',
  'SEO + contenuti, target top 10 Google',
  'CRM / gestionale, KPI su adozione e sessioni',
  'App / sito web, focus su traffico organico',
]

function KpiSetupChat({
  client, isGrowth, messages, setMessages, input, setInput,
  loading, setLoading, started, setStarted, chatEndRef, onInsertKpi,
}: KpiSetupChatProps) {
  const suggestions = isGrowth ? GROWTH_SUGGESTIONS : DIGITAL_SUGGESTIONS

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatEndRef])

  const startChat = async (firstMessage?: string) => {
    setStarted(true)
    const opening = firstMessage ?? `Ciao! Parliamo degli obiettivi per ${client.company_name}.`
    const userMsg = { role: 'user' as const, text: opening }
    const newMessages = [userMsg]
    setMessages(newMessages)
    await fetchAiReply(newMessages)
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user' as const, text: input.trim() }
    setInput('')
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    await fetchAiReply(newMessages)
  }

  const fetchAiReply = async (msgs: { role: 'ai' | 'user'; text: string }[]) => {
    setLoading(true)
    try {
      const res = await fetch('/api/kpi-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: msgs,
          clientName: client.company_name,
          clientType: client.client_type,
          industry: client.industry ?? null,
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'ai', text: data.text }])
    } finally {
      setLoading(false)
    }
  }

  if (!started) {
    return (
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-surface">
          <div className="w-8 h-8 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-gold-text" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Imposta gli obiettivi con l&apos;AI</p>
            <p className="text-2xs text-text-secondary">
              Nessun KPI configurato — l&apos;AI ti guida a definire target realistici per un cliente {isGrowth ? 'Growth' : 'Digital'}
            </p>
          </div>
          <span className="ml-auto text-2xs font-bold px-2 py-1 rounded-full border"
            style={{ color: isGrowth ? 'var(--color-gold-text)' : 'var(--color-info)', borderColor: isGrowth ? 'var(--color-gold-text)' : 'var(--color-info)', background: isGrowth ? '#F5C80012' : '#60A5FA12' }}>
            {isGrowth ? 'GROWTH' : 'DIGITAL'}
          </span>
        </div>

        <div className="p-5">
          <p className="text-xs text-text-secondary mb-3">Scegli un punto di partenza o descrivi la situazione:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
            {suggestions.map(s => (
              <button key={s} onClick={() => startChat(s)}
                className="text-left text-xs px-3 py-2.5 rounded-lg border border-border bg-surface text-text-secondary hover:border-gold/40 hover:text-text-primary transition-all">
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && input.trim() && startChat(input)}
              placeholder={`Descrivi il progetto o i tuoi obiettivi per ${client.company_name}…`}
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-gold/50"
            />
            <button onClick={() => input.trim() && startChat(input)}
              className="px-3 py-2 bg-gold text-on-gold rounded-lg hover:bg-gold/90 transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
            <p className="text-2xs text-text-tertiary">Oppure inserisci i KPI manualmente</p>
            <button onClick={onInsertKpi} className="text-xs text-text-secondary hover:text-gold-text transition-colors">
              Inserisci primo mese →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-surface">
        <div className="w-7 h-7 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
          <Bot className="w-3.5 h-3.5 text-gold-text" />
        </div>
        <p className="text-sm font-semibold text-text-primary flex-1">AI KPI Advisor</p>
        <span className="text-2xs font-bold px-2 py-0.5 rounded-full border"
          style={{ color: isGrowth ? 'var(--color-gold-text)' : 'var(--color-info)', borderColor: isGrowth ? 'var(--color-gold-text)' : 'var(--color-info)', background: isGrowth ? '#F5C80012' : '#60A5FA12' }}>
          {isGrowth ? 'GROWTH' : 'DIGITAL'}
        </span>
        <button onClick={onInsertKpi}
          className="ml-2 text-xs text-text-secondary hover:text-gold-text transition-colors border border-border rounded-lg px-2.5 py-1">
          + Inserisci KPI
        </button>
      </div>

      <div className="flex flex-col gap-3 p-5 max-h-80 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {m.role === 'ai' && (
              <div className="w-6 h-6 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Sparkles className="w-3 h-3 text-gold-text" />
              </div>
            )}
            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
              m.role === 'ai'
                ? 'bg-surface border border-border text-text-primary'
                : 'bg-gold text-on-gold font-medium'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center flex-shrink-0">
              <Loader2 className="w-3 h-3 text-gold-text animate-spin" />
            </div>
            <div className="bg-surface border border-border rounded-xl px-3 py-2">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="flex gap-2 px-5 pb-5">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Rispondi all'AI…"
          disabled={loading}
          className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-gold/50 disabled:opacity-50"
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()}
          className="px-3 py-2 bg-gold text-on-gold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-40">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── KPI Target Precompile Modal ─────────────────────────────────────────────

const KPI_LEVEL_CFG = [
  { key: 'low',    label: 'Conservativo', desc: '35° percentile', color: 'var(--color-text-tertiary)' },
  { key: 'med',    label: 'Realistico',   desc: '65° percentile', color: 'var(--color-gold-text)' },
  { key: 'strong', label: 'Ambizioso',    desc: '90° percentile', color: 'var(--color-success)' },
]

const KPI_LABELS_MAP: Record<string, string> = {
  mer: 'MER', ctr: 'CTR', cpa: 'CPA', leads_generated: 'Lead/mese',
  revenue_attributed: 'Revenue', followers_gained: 'Follower',
  organic_sessions: 'Sessioni', new_users: 'Nuovi utenti', active_users: 'Utenti attivi',
  uptime: 'Uptime', email_open_rate: 'Email open', automation_runs: 'Automazioni',
}

function fmtTarget(key: string, v: number): string {
  if (key === 'cpa' || key === 'revenue_attributed') return `€${v.toLocaleString('it-IT')}`
  if (key === 'ctr' || key === 'uptime' || key === 'email_open_rate') return `${v}%`
  if (key === 'mer') return `${v}×`
  return v.toLocaleString('it-IT')
}

function KpiTargetPrecompileModal({ client, isGrowth, selectedProject, onClose, onApplied }: {
  client: Client; isGrowth: boolean; selectedProject: Project | null
  onClose: () => void; onApplied: (updates: Partial<Client>) => void
}) {
  const [loading, setLoading]  = useState(true)
  const [saving, setSaving]    = useState<string | null>(null)
  const [levels, setLevels]    = useState<Record<string, Record<string, number>> | null>(null)
  const [kpiKeys, setKpiKeys]  = useState<string[]>([])
  const [targetKeyMap, setTargetKeyMap] = useState<Record<string, string>>({})
  const accentColor = isGrowth ? 'var(--color-gold-text)' : 'var(--color-info)'

  const generate = async () => {
    setLoading(true); setLevels(null)
    try {
      const res = await fetch('/api/ai/kpi-precompile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectKind: selectedProject?.project_kind ?? (isGrowth ? 'growth' : 'digital'),
          projectType: selectedProject?.project_type ?? 'custom',
          projectName: selectedProject?.name ?? client.company_name,
          clientPackage: client.package,
          clientMrr: client.mrr,
          mode: 'targets',
        }),
      })
      const { levels: l, kpiKeys: k, targetKeyMap: m, error } = await res.json()
      if (error) { toast.error(error); return }
      setLevels(l); setKpiKeys(k); setTargetKeyMap(m ?? {})
    } catch { toast.error('Errore nella generazione') }
    finally { setLoading(false) }
  }

  useEffect(() => { generate() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async (levelKey: string) => {
    if (!levels?.[levelKey]) return
    setSaving(levelKey)
    const levelVals = levels[levelKey]
    const payload: Record<string, number> = {}
    for (const [kpiKey, val] of Object.entries(levelVals)) {
      const targetCol = targetKeyMap[kpiKey]
      if (targetCol) payload[targetCol] = val
    }
    const { error } = await createClient().from('clients').update(payload).eq('id', client.id)
    setSaving(null)
    if (error) { toast.error(error.message); return }
    toast.success('Obiettivi salvati!')
    onApplied(payload as Partial<Client>)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Sparkles className="w-4 h-4" style={{ color: accentColor }} />
              <h2 className="text-sm font-bold text-text-primary">Precompila obiettivi KPI</h2>
            </div>
            <p className="text-2xs" style={{ color: 'var(--color-text-secondary)' }}>
              {client.company_name} · benchmark {isGrowth ? 'Growth' : 'Digital'} mercato italiano
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={generate} disabled={loading}
              className="flex items-center gap-1 text-2xs px-2.5 py-1.5 rounded-lg"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: loading ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)' }}>
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {loading ? 'Analisi…' : 'Rigenera'}
            </button>
            <button onClick={onClose}><X className="w-4 h-4 text-text-secondary hover:text-text-primary transition-colors" /></button>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Analisi benchmark di settore…</p>
            </div>
          ) : levels ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {KPI_LEVEL_CFG.map(lvl => (
                <div key={lvl.key} className="rounded-xl overflow-hidden"
                  style={{ border: `1px solid color-mix(in srgb, ${lvl.color} 13%, transparent)`, background: `color-mix(in srgb, ${lvl.color} 3%, transparent)` }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: `color-mix(in srgb, ${lvl.color} 13%, transparent)` }}>
                    <p className="text-2xs font-black uppercase tracking-widest" style={{ color: lvl.color }}>{lvl.label}</p>
                    <p className="text-2xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{lvl.desc}</p>
                  </div>
                  <div className="p-3 space-y-2">
                    {kpiKeys.map(k => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-2xs" style={{ color: 'var(--color-text-secondary)' }}>{KPI_LABELS_MAP[k] ?? k}</span>
                        <span className="text-2xs font-bold" style={{ color: lvl.color }}>
                          {levels[lvl.key]?.[k] != null ? fmtTarget(k, levels[lvl.key][k]) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 pb-3">
                    <button onClick={() => apply(lvl.key)} disabled={!!saving}
                      className="w-full py-2 rounded-lg text-2xs font-bold transition-all flex items-center justify-center gap-1.5"
                      style={{ background: `color-mix(in srgb, ${lvl.color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${lvl.color} 19%, transparent)`, color: saving ? 'var(--color-text-tertiary)' : lvl.color }}>
                      {saving === lvl.key
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Salvo…</>
                        : 'Usa questi obiettivi'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-10 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Errore. Riprova.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function KpiTab({ client: initialClient, kpis: initialKpis, kpiConfigs: initialConfigs, projects }: Props) {
  const [client, setClient] = useState(initialClient)
  const [allKpis, setAllKpis] = useState(initialKpis)
  const [configs, setConfigs] = useState<ClientKpiConfig[]>(initialConfigs)

  // Progetti con project_kind definito
  const kpiProjects = projects.filter(p => p.project_kind)
  const firstProject = kpiProjects[0] ?? null
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(firstProject?.id ?? null)

  const selectedProject = kpiProjects.find(p => p.id === selectedProjectId) ?? null
  const isGrowth = selectedProject?.project_kind === 'growth'

  // KPI e config filtrate per il progetto selezionato
  const kpis = allKpis.filter(k => k.project_id === selectedProjectId)
  const config = configs.find(c => c.project_id === selectedProjectId) ?? null

  const [showModal, setShowModal] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [showTargetPrecompile, setShowTargetPrecompile] = useState(false)
  const [editingKpi, setEditingKpi] = useState<ClientKpi | null>(null)
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<{ role: 'ai' | 'user'; text: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatStarted, setChatStarted] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [showReport, setShowReport] = useState(false)

  const stdDefs = isGrowth ? GROWTH_KPIS : DIGITAL_KPIS
  const categories = isGrowth ? GROWTH_CATEGORIES : DIGITAL_CATEGORIES
  const defaultEnabled = stdDefs.map(d => d.key)
  const enabledKeys: string[] = config?.enabled?.length ? config.enabled : defaultEnabled
  const customKpis: CustomKpiDef[] = config?.custom_kpis ?? []
  const enabledStd = stdDefs.filter(d => enabledKeys.includes(d.key))

  const sorted = [...kpis].sort((a, b) => b.month.localeCompare(a.month))
  const latest = sorted[0]
  const healthScore = calcHealthScore(latest, client, stdDefs, enabledKeys)

  const chartData = [...kpis].sort((a, b) => a.month.localeCompare(b.month)).slice(-6).map(k => ({
    month: monthLabel(k.month),
    // Growth
    ROAS: k.roas ?? 0,
    Lead: k.leads_generated ?? 0,
    Revenue: k.revenue_attributed ?? 0,
    Spesa: k.ad_spend ?? 0,
    'ROAS target': client.target_roas ?? undefined,
    'Lead target': client.target_leads_monthly ?? undefined,
    'Revenue target': client.target_revenue_monthly ?? undefined,
    // Digital
    Follower: k.followers_gained ?? 0,
    'Sessioni organiche': k.organic_sessions ?? 0,
    'Nuovi utenti': k.new_users ?? 0,
    Reach: k.reach ?? 0,
    'Engagement %': k.engagement_rate ?? 0,
    'Posizione SEO': k.seo_avg_position ?? 0,
    'Follower target': client.target_followers_monthly ?? undefined,
  }))

  const exportCsv = () => {
    const headers = isGrowth
      ? ['Mese', 'ROAS', 'CPL', 'CPA', 'CTR%', 'Lead', 'Conv%', 'Revenue', 'AdSpend', 'Note']
      : ['Mese', 'Follower', 'Sessioni org.', 'Nuovi utenti', 'Reach', 'Engagement%', 'SEO pos.', 'Bounce%', 'Lead', 'Note']
    const rows = sorted.map(k => isGrowth
      ? [k.month, k.roas, k.cpl, k.cpa, k.ctr, k.leads_generated, k.conversion_rate, k.revenue_attributed, k.ad_spend, k.notes ?? '']
      : [k.month, k.followers_gained, k.organic_sessions, k.new_users, k.reach, k.engagement_rate, k.seo_avg_position, k.bounce_rate, k.leads_generated, k.notes ?? '']
    )
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `kpi-${client.company_name.replace(/\s+/g, '-')}.csv`
    a.click()
  }

  const handleSaved = (updated: ClientKpi) => {
    setAllKpis(prev => {
      const exists = prev.find(k => k.id === updated.id)
      return exists ? prev.map(k => k.id === updated.id ? updated : k) : [updated, ...prev]
    })
  }

  const handleConfigSaved = (newConfig: ClientKpiConfig) => {
    setConfigs(prev => {
      const exists = prev.find(c => c.project_id === newConfig.project_id)
      return exists ? prev.map(c => c.project_id === newConfig.project_id ? newConfig : c) : [...prev, newConfig]
    })
  }

  const deleteKpi = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Eliminare i dati KPI di questo mese?')) return
    const supabase = createClient()
    const { error } = await supabase.from('client_kpis').delete().eq('id', id)
    if (error) { toast.error('Errore durante l\'eliminazione'); return }
    setAllKpis(prev => prev.filter(k => k.id !== id))
    toast.success('KPI eliminati')
  }

  const chartTheme = { grid: 'var(--color-border)', text: 'var(--color-text-tertiary)', gold: 'var(--color-gold-text)', green: 'var(--color-success)', blue: 'var(--color-info)' }

  // Nessun progetto con project_kind definito
  if (kpiProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-text-secondary text-sm">Nessun progetto Growth o Digital trovato.</p>
        <p className="text-xs text-text-secondary">Crea un progetto dalla tab Progetti e assegnagli la natura Growth o Digital.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {showTargetPrecompile && (
        <KpiTargetPrecompileModal
          client={client}
          isGrowth={isGrowth}
          selectedProject={selectedProject}
          onClose={() => setShowTargetPrecompile(false)}
          onApplied={updates => setClient(prev => ({ ...prev, ...updates }))}
        />
      )}

      {/* Selettore progetto */}
      <div className="flex flex-wrap gap-2">
        {kpiProjects.map(p => {
          const isSelected = p.id === selectedProjectId
          const isG = p.project_kind === 'growth'
          const projectTitle = p.name.includes(' – ') ? p.name.split(' – ').slice(1).join(' – ') : p.name
          return (
            <button key={p.id} onClick={() => { setSelectedProjectId(p.id); setExpandedMonth(null) }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                isSelected
                  ? isG
                    ? 'bg-gold/10 border-gold text-gold-text'
                    : 'bg-info/10 border-info text-info'
                  : 'bg-surface border-border text-text-secondary hover:border-border-strong hover:text-text-primary'
              }`}>
              <span>{isG ? '📈' : '💻'}</span>
              <span className="truncate max-w-[180px]">{projectTitle}</span>
              {isSelected && <span className="text-2xs font-bold opacity-70">{isG ? 'Growth' : 'Digital'}</span>}
            </button>
          )
        })}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-text-primary">KPI & Performance</h2>
          {latest && <HealthRing score={healthScore} />}
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
            isGrowth ? 'bg-gold/10 text-gold-text border-gold/30' : 'bg-info/10 text-info border-info/30'
          }`}>
            {isGrowth ? '📈 Growth' : '💻 Digital'}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowConfig(true)} disabled={!selectedProject}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary border border-border rounded-lg hover:text-text-primary hover:border-overlay/20 transition-colors disabled:opacity-40">
            <Settings2 className="w-4 h-4" /> Configura KPI
          </button>
          <button onClick={exportCsv}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary border border-border rounded-lg hover:text-text-primary hover:border-overlay/20 transition-colors">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={() => setShowReport(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary border border-border rounded-lg hover:text-text-primary hover:border-overlay/20 transition-colors">
            <FileText className="w-4 h-4" /> Report PDF
          </button>
          <button onClick={() => { setEditingKpi(null); setShowModal(true) }} disabled={!selectedProject}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-gold text-on-gold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-40">
            <Plus className="w-4 h-4" /> Inserisci mese
          </button>
        </div>
      </div>

      {/* Sezione obiettivi */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">Obiettivi configurati</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTargetPrecompile(true)} disabled={!selectedProject}
              className="flex items-center gap-1.5 text-2xs font-bold px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
              style={{ background: 'var(--color-gold-dim)', border: '1px solid var(--color-gold)', color: 'var(--color-gold-text)' }}>
              <Sparkles className="w-3 h-3" /> Precompila con AI
            </button>
            <span className="text-2xs text-text-secondary bg-surface border border-border px-2 py-0.5 rounded-full">
              {isGrowth ? 'Growth' : 'Digital'} · {enabledStd.length + customKpis.length} KPI attivi
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {enabledStd.filter(d => d.targetKey).map(d => {
            const target = d.targetKey ? (client[d.targetKey] as number | null) : null
            const prefix = d.prefix ?? ''
            const unit = d.unit ?? ''
            const fmt = (v: number) => prefix + v.toFixed(d.decimals ?? 0) + unit
            return (
              <div key={d.key} className="bg-surface border border-border rounded-lg px-3 py-2.5">
                <p className="text-2xs text-text-secondary mb-0.5">{d.label}</p>
                <p className={`text-sm font-bold ${target ? 'text-text-primary' : 'text-text-tertiary'}`}>
                  {target ? fmt(target) + '/mese' : <span className="text-text-tertiary italic text-xs">non impostato</span>}
                </p>
              </div>
            )
          })}
          {customKpis.map(c => (
            <div key={c.id} className="bg-surface border border-gold/20 rounded-lg px-3 py-2.5">
              <p className="text-2xs text-text-secondary mb-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block" /> {c.name}
              </p>
              <p className={`text-sm font-bold ${c.target ? 'text-text-primary' : 'text-text-tertiary'}`}>
                {c.target ? `${c.target} ${c.unit}/mese` : <span className="text-text-tertiary italic text-xs">nessun target</span>}
              </p>
            </div>
          ))}
          {enabledStd.filter(d => d.targetKey).length === 0 && customKpis.length === 0 && (
            <div className="col-span-full text-center py-4 text-text-secondary text-xs">
              Nessun obiettivo configurato —{' '}
              <button onClick={() => setShowConfig(true)} className="text-gold-text hover:underline">configura i KPI</button>
            </div>
          )}
        </div>
      </div>

      {kpis.length === 0 ? (
        <KpiSetupChat
          client={client}
          isGrowth={isGrowth}
          messages={chatMessages}
          setMessages={setChatMessages}
          input={chatInput}
          setInput={setChatInput}
          loading={chatLoading}
          setLoading={setChatLoading}
          started={chatStarted}
          setStarted={setChatStarted}
          chatEndRef={chatEndRef}
          onInsertKpi={() => setShowModal(true)}
        />
      ) : (
        <>
          {/* KPI ultimo mese */}
          {latest && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-text-secondary uppercase tracking-wider font-semibold">
                  {new Date(latest.month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })} — confronto vs obiettivi
                </p>
                <button onClick={() => { setEditingKpi(latest); setShowModal(true) }}
                  className="flex items-center gap-1 text-xs text-text-secondary hover:text-gold-text transition-colors">
                  <Pencil className="w-3 h-3" /> Modifica
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {enabledStd.map(d => {
                  const target = d.targetKey ? (client[d.targetKey] as number | null) : null
                  return <KpiCard key={d.key} def={d} actual={getKpiValue(latest, d.key)} target={target} />
                })}
                {customKpis.map(c => (
                  <KpiCard key={c.id} def={c} actual={latest.custom_data?.[c.id] ?? null} target={c.target} />
                ))}
              </div>

              {healthScore < 50 && (
                <div className="mt-3 flex items-start gap-2 bg-error/5 border border-error/20 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  <p className="text-xs text-error">{healthScore < 25 ? 'Più KPI critici sotto soglia' : 'Alcuni KPI sotto target'}. Verifica la strategia con il cliente.</p>
                </div>
              )}
              {healthScore >= 75 && (
                <div className="mt-3 flex items-start gap-2 bg-success/5 border border-success/20 rounded-xl px-4 py-3">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  <p className="text-xs text-success">Tutti i KPI principali sono sopra target. Mese ottimo!</p>
                </div>
              )}
              {latest.notes && (
                <div className="mt-2 bg-surface border border-border rounded-xl px-4 py-3">
                  <p className="text-xs text-text-secondary font-semibold mb-0.5">Note del mese</p>
                  <p className="text-xs text-text-primary">{latest.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Grafici — Growth */}
          {isGrowth && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {enabledKeys.includes('roas') && (
                <div className="bg-surface border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">ROAS — ultimi 6 mesi</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                      <XAxis dataKey="month" tick={{ fill: chartTheme.text, fontSize: 11 }} />
                      <YAxis tick={{ fill: chartTheme.text, fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }} labelStyle={{ color: 'var(--color-text-primary)' }} />
                      {client.target_roas && <ReferenceLine y={client.target_roas} stroke={chartTheme.gold} strokeDasharray="4 4" label={{ value: 'target', fill: chartTheme.gold, fontSize: 10 }} />}
                      <Line type="monotone" dataKey="ROAS" stroke={chartTheme.gold} strokeWidth={2} dot={{ fill: chartTheme.gold, r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {enabledKeys.includes('leads_generated') && (
                <div className="bg-surface border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">Lead generati per mese</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                      <XAxis dataKey="month" tick={{ fill: chartTheme.text, fontSize: 11 }} />
                      <YAxis tick={{ fill: chartTheme.text, fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }} labelStyle={{ color: 'var(--color-text-primary)' }} />
                      {client.target_leads_monthly && <ReferenceLine y={client.target_leads_monthly} stroke={chartTheme.green} strokeDasharray="4 4" label={{ value: 'target', fill: chartTheme.green, fontSize: 10 }} />}
                      <Bar dataKey="Lead" fill={chartTheme.green} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {enabledKeys.includes('revenue_attributed') && (
                <div className="bg-surface border border-border rounded-xl p-5 lg:col-span-2">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">Revenue attribuita vs Ad Spend</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                      <XAxis dataKey="month" tick={{ fill: chartTheme.text, fontSize: 11 }} />
                      <YAxis tick={{ fill: chartTheme.text, fontSize: 11 }} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }} labelStyle={{ color: 'var(--color-text-primary)' }} formatter={(v: number) => formatCurrency(v)} />
                      <Legend wrapperStyle={{ color: 'var(--color-text-tertiary)', fontSize: 12 }} />
                      {client.target_revenue_monthly && <ReferenceLine y={client.target_revenue_monthly} stroke={chartTheme.gold} strokeDasharray="4 4" label={{ value: 'target', fill: chartTheme.gold, fontSize: 10 }} />}
                      <Bar dataKey="Revenue" fill={chartTheme.gold} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Spesa" fill={chartTheme.blue} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Grafici — Digital */}
          {!isGrowth && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {enabledKeys.includes('followers_gained') && (
                <div className="bg-surface border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">Follower guadagnati per mese</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                      <XAxis dataKey="month" tick={{ fill: chartTheme.text, fontSize: 11 }} />
                      <YAxis tick={{ fill: chartTheme.text, fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }} labelStyle={{ color: 'var(--color-text-primary)' }} />
                      {client.target_followers_monthly && <ReferenceLine y={client.target_followers_monthly} stroke={chartTheme.gold} strokeDasharray="4 4" label={{ value: 'target', fill: chartTheme.gold, fontSize: 10 }} />}
                      <Bar dataKey="Follower" fill={chartTheme.gold} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {enabledKeys.includes('organic_sessions') && (
                <div className="bg-surface border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">Sessioni organiche per mese</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                      <XAxis dataKey="month" tick={{ fill: chartTheme.text, fontSize: 11 }} />
                      <YAxis tick={{ fill: chartTheme.text, fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }} labelStyle={{ color: 'var(--color-text-primary)' }} />
                      <Bar dataKey="Sessioni organiche" fill={chartTheme.green} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {enabledKeys.includes('engagement_rate') && (
                <div className="bg-surface border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">Engagement rate (%)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                      <XAxis dataKey="month" tick={{ fill: chartTheme.text, fontSize: 11 }} />
                      <YAxis tick={{ fill: chartTheme.text, fontSize: 11 }} unit="%" />
                      <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }} labelStyle={{ color: 'var(--color-text-primary)' }} />
                      <Line type="monotone" dataKey="Engagement %" stroke={chartTheme.blue} strokeWidth={2} dot={{ fill: chartTheme.blue, r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {enabledKeys.includes('reach') && (
                <div className="bg-surface border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-4">Reach mensile</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                      <XAxis dataKey="month" tick={{ fill: chartTheme.text, fontSize: 11 }} />
                      <YAxis tick={{ fill: chartTheme.text, fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                      <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }} labelStyle={{ color: 'var(--color-text-primary)' }} />
                      <Bar dataKey="Reach" fill={chartTheme.blue} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Storico */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">Storico mensile</p>
            </div>
            <div className="divide-y divide-border">
              {sorted.map(k => {
                const score = calcHealthScore(k, client, stdDefs, enabledKeys)
                const isOpen = expandedMonth === k.id
                const scoreColor = score >= 75 ? 'text-success' : score >= 50 ? 'text-warning' : score >= 25 ? 'text-orange' : 'text-error'
                return (
                  <div key={k.id}>
                    <button onClick={() => setExpandedMonth(isOpen ? null : k.id)}
                      className="w-full flex items-center gap-4 px-5 py-3 hover:bg-overlay/5 transition-colors text-left">
                      <span className="text-sm font-semibold text-text-primary w-24">
                        {new Date(k.month).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}
                      </span>
                      <div className="flex items-center gap-4 flex-1 text-xs text-text-secondary overflow-hidden">
                        {enabledStd.slice(0, 4).map(d => {
                          const v = getKpiValue(k, d.key)
                          if (v === null) return null
                          const display = d.prefix
                            ? `${d.prefix}${d.isInt ? Math.round(v).toLocaleString('it-IT') : v.toFixed(d.decimals ?? 1)}`
                            : `${d.isInt ? Math.round(v).toLocaleString('it-IT') : v.toFixed(d.decimals ?? 1)}${d.unit ?? ''}`
                          const shortLabel = d.label.split(' ')[0]
                          return (
                            <span key={d.key} className="whitespace-nowrap">
                              {shortLabel} <strong className="text-text-primary">{display}</strong>
                            </span>
                          )
                        })}
                      </div>
                      <span className={`text-xs font-black ${scoreColor}`}>{score}</span>
                      <button onClick={e => { e.stopPropagation(); setEditingKpi(k); setShowModal(true) }}
                        className="p-1 text-text-secondary hover:text-gold-text transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => deleteKpi(k.id, e)}
                        className="p-1 text-text-secondary hover:text-error transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-text-secondary" /> : <ChevronDown className="w-4 h-4 text-text-secondary" />}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 bg-surface grid grid-cols-2 md:grid-cols-4 gap-3">
                        {enabledStd.map(d => {
                          const v = getKpiValue(k, d.key)
                          if (!v) return null
                          const prefix = d.prefix ?? ''
                          const unit = d.unit ?? ''
                          return (
                            <div key={d.key} className="py-2">
                              <p className="text-2xs text-text-secondary">{d.label}</p>
                              <p className="text-sm font-bold text-text-primary">{prefix}{v.toFixed(d.decimals ?? 0)}{unit}</p>
                            </div>
                          )
                        })}
                        {customKpis.map(c => {
                          const v = k.custom_data?.[c.id]
                          if (!v) return null
                          return (
                            <div key={c.id} className="py-2">
                              <p className="text-2xs text-text-secondary">{c.name}</p>
                              <p className="text-sm font-bold text-text-primary">{v} {c.unit}</p>
                            </div>
                          )
                        })}
                        {k.notes && (
                          <div className="col-span-full py-2 border-t border-border mt-1">
                            <p className="text-2xs text-text-secondary mb-0.5">Note</p>
                            <p className="text-xs text-text-primary">{k.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {showModal && selectedProject && (
        <KpiModal
          clientId={client.id}
          projectId={selectedProject.id}
          isGrowth={isGrowth}
          enabledStd={enabledStd}
          categories={categories}
          customKpis={customKpis}
          initialData={editingKpi}
          projectName={selectedProject.name}
          projectType={selectedProject.project_type}
          onClose={() => { setShowModal(false); setEditingKpi(null) }}
          onSaved={handleSaved}
        />
      )}

      {showConfig && selectedProject && (
        <KpiConfigModal
          client={client}
          projectId={selectedProject.id}
          config={config}
          stdDefs={stdDefs}
          categories={categories}
          isGrowth={isGrowth}
          onClose={() => setShowConfig(false)}
          onSaved={handleConfigSaved}
        />
      )}

      {showReport && (
        <ReportModal
          client={client}
          kpis={kpis}
          isGrowth={isGrowth}
          stdDefs={stdDefs}
          enabledKeys={enabledKeys}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}

// ─── Report Modal ────────────────────────────────────────────────────────────

function ReportModal({ client, kpis, isGrowth, stdDefs, enabledKeys, onClose }: {
  client: Client
  kpis: ClientKpi[]
  isGrowth: boolean
  stdDefs: StdKpiDef[]
  enabledKeys: string[]
  onClose: () => void
}) {
  const allMonths = Array.from(new Set(kpis.map(k => k.month.slice(0, 7)))).sort()
  const now = new Date().toISOString().slice(0, 7)
  const defaultFrom = allMonths[0] ?? now
  const defaultTo = allMonths[allMonths.length - 1] ?? now

  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [loading, setLoading] = useState(false)

  const availableMonths = allMonths.filter(m => m >= from && m <= to)

  const generate = async () => {
    setLoading(true)
    try {
      const filtered = kpis.filter(k => {
        const m = k.month.slice(0, 7)
        return m >= from && m <= to
      })
      const params = new URLSearchParams({
        clientId: client.id,
        from,
        to,
        isGrowth: isGrowth ? '1' : '0',
      })
      const body = JSON.stringify({ client, kpis: filtered, stdDefs, enabledKeys })
      const res = await fetch(`/api/kpi-report?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      const html = await res.text()
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(html)
        win.document.close()
        setTimeout(() => win.print(), 800)
      }
    } finally {
      setLoading(false)
      onClose()
    }
  }

  const fmtLabel = (ym: string) => {
    const [y, m] = ym.split('-')
    const labels: Record<string, string> = { '01':'Gen','02':'Feb','03':'Mar','04':'Apr','05':'Mag','06':'Giu','07':'Lug','08':'Ago','09':'Set','10':'Ott','11':'Nov','12':'Dic' }
    return `${labels[m]} ${y}`
  }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center">
              <FileText className="w-4 h-4 text-gold-text" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Genera Report PDF</h2>
              <p className="text-2xs text-text-secondary">{client.company_name} · {isGrowth ? 'Growth' : 'Digital'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Selettore periodo */}
          <div>
            <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">Seleziona periodo</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">Da</label>
                <input
                  type="month"
                  value={from}
                  max={to}
                  onChange={e => setFrom(e.target.value)}
                  onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-gold/50 cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5">A</label>
                <input
                  type="month"
                  value={to}
                  min={from}
                  onChange={e => setTo(e.target.value)}
                  onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-gold/50 cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </div>
          </div>

          {/* Preview mesi selezionati */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-xs text-text-secondary mb-2">Il report includerà:</p>
            <div className="flex flex-wrap gap-1.5">
              {availableMonths.length > 0 ? availableMonths.map(m => (
                <span key={m} className="text-2xs px-2 py-0.5 rounded-full bg-gold/10 border border-gold/20 text-gold-text">
                  {fmtLabel(m)}
                </span>
              )) : (
                <span className="text-xs text-text-secondary">Nessun dato nel periodo selezionato</span>
              )}
            </div>
            {availableMonths.length > 0 && (
              <p className="text-2xs text-text-secondary mt-2">
                {availableMonths.length} {availableMonths.length === 1 ? 'mese' : 'mesi'} · {enabledKeys.length} KPI monitorati
              </p>
            )}
          </div>

          {/* Cosa include */}
          <div className="space-y-1.5">
            {['Copertina con branding TWO BEE', 'Andamento KPI mese per mese', 'Confronto con obiettivi', 'Grafici trend principali', 'Note mensili'].map(item => (
              <div key={item} className="flex items-center gap-2 text-xs text-text-secondary">
                <CheckCircle2 className="w-3.5 h-3.5 text-gold-text flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm text-text-secondary hover:text-text-primary transition-colors">
            Annulla
          </button>
          <button onClick={generate} disabled={loading || !from || !to}
            className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-xl hover:bg-gold/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-2 text-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {loading ? 'Generazione…' : 'Genera & Scarica'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal inserimento / modifica KPI ───────────────────────────────────────

const AI_LEVEL_CFG = [
  { key: 'low',    label: 'Conservativo', desc: '35° percentile', color: 'var(--color-text-tertiary)' },
  { key: 'med',    label: 'Realistico',   desc: '65° percentile', color: 'var(--color-gold-text)' },
  { key: 'strong', label: 'Ambizioso',    desc: '90° percentile', color: 'var(--color-success)' },
]

const CONNECTORS = [
  { name: 'Google Ads',          emoji: '🟡', color: '#FBBC04', desc: 'MER, CTR, CPA, Ad Spend, Lead generati' },
  { name: 'Google Analytics 4',  emoji: '🟠', color: '#FF6D00', desc: 'Sessioni, Nuovi utenti, Bounce Rate, Conversioni' },
  { name: 'Shopify',             emoji: '🟢', color: '#96BF48', desc: 'Ordini, Revenue, Valore medio ordine, Abbandoni' },
  { name: 'Klaviyo',             emoji: '🟣', color: '#7C3AED', desc: 'Email open rate, Click rate, Disiscrizioni' },
  { name: 'Meta Ads',            emoji: '🔵', color: '#1877F2', desc: 'Reach, Engagement, CTR, CPA, Follower' },
  { name: 'HubSpot',             emoji: '🟠', color: '#FF7A59', desc: 'Lead, SQL, Contatti CRM, Deal pipeline' },
]

function KpiModal({ clientId, projectId, isGrowth, enabledStd, categories, customKpis, initialData,
  projectName, projectType, onClose, onSaved }: {
  clientId: string; projectId: string; isGrowth: boolean
  enabledStd: StdKpiDef[]; categories: KpiCategory[]; customKpis: CustomKpiDef[]
  initialData: ClientKpi | null; projectName?: string; projectType?: string
  onClose: () => void; onSaved: (k: ClientKpi) => void
}) {
  const [loading, setLoading]     = useState(false)
  const [inputMode, setInputMode] = useState<'manuale' | 'ai' | 'connectors'>('manuale')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiLevels, setAiLevels]   = useState<Record<string, Record<string, number>> | null>(null)
  const [aiKpiKeys, setAiKpiKeys] = useState<string[]>([])
  const [aiSource, setAiSource]   = useState<string | null>(null)

  const enabledKeys = new Set(enabledStd.map(d => d.key))
  const [stdValues, setStdValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    enabledStd.forEach(d => {
      const v = initialData ? getKpiValue(initialData, d.key) : null
      init[d.key] = v != null ? String(v) : ''
    })
    return init
  })
  const [customValues, setCustomValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    customKpis.forEach(c => { init[c.id] = String(initialData?.custom_data?.[c.id] ?? '') })
    return init
  })
  const [month, setMonth] = useState(initialData?.month?.slice(0, 7) ?? new Date().toISOString().slice(0, 7))
  const [notes, setNotes]   = useState(initialData?.notes ?? '')

  const accentColor = isGrowth ? 'var(--color-gold-text)' : 'var(--color-info)'
  const inputCls    = 'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/50 placeholder-text-tertiary'

  const fetchAiLevels = async () => {
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/kpi-precompile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectKind: isGrowth ? 'growth' : 'digital',
          projectType: projectType ?? 'custom',
          projectName: projectName ?? '',
          mode: 'monthly',
        }),
      })
      const { levels, kpiKeys } = await res.json()
      setAiLevels(levels); setAiKpiKeys(kpiKeys)
    } catch { toast.error('Errore AI') }
    finally { setAiLoading(false) }
  }

  useEffect(() => {
    if (inputMode === 'ai' && !aiLevels && !aiLoading) fetchAiLevels()
  }, [inputMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyAiLevel = (levelKey: string, levelLabel: string) => {
    const vals = aiLevels?.[levelKey]
    if (!vals) return
    setStdValues(prev => {
      const next = { ...prev }
      for (const [k, v] of Object.entries(vals)) {
        if (k in next) next[k] = String(v)
      }
      return next
    })
    setAiSource(levelLabel)
    setInputMode('manuale')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    const payload: Record<string, unknown> = { client_id: clientId, project_id: projectId, month: month + '-01', notes: notes || null }
    enabledStd.forEach(d => {
      const raw = stdValues[d.key]
      payload[d.key] = raw ? (d.isInt ? parseInt(raw) : parseFloat(raw)) : null
    })
    const custom_data: Record<string, number> = {}
    customKpis.forEach(c => { if (customValues[c.id]) custom_data[c.id] = parseFloat(customValues[c.id]) })
    payload.custom_data = Object.keys(custom_data).length ? custom_data : null

    const supabase = createClient()
    const result = initialData
      ? await supabase.from('client_kpis').update(payload).eq('id', initialData.id).select().single()
      : await supabase.from('client_kpis').upsert(payload, { onConflict: 'client_id,project_id,month' }).select().single()

    setLoading(false)
    if (result.error) { toast.error(result.error.message); return }
    toast.success(initialData ? 'KPI aggiornati!' : 'KPI salvati!')
    onSaved(result.data as ClientKpi); onClose()
  }

  const MODE_TABS = [
    { key: 'manuale' as const,     icon: <Pencil className="w-3.5 h-3.5" />,   label: 'Manuale' },
    { key: 'ai' as const,          icon: <Sparkles className="w-3.5 h-3.5" />, label: 'AI Precompilato' },
    { key: 'connectors' as const,  icon: <Link2 className="w-3.5 h-3.5" />,   label: 'Connettori' },
  ]

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <div>
            <h2 className="text-base font-bold text-text-primary">{initialData ? 'Modifica KPI' : 'Inserisci KPI mensile'}</h2>
            <p className="text-2xs text-text-secondary">
              <span style={{ color: accentColor }}>{isGrowth ? 'Growth' : 'Digital'}</span>
              {' · '}{enabledStd.length} KPI attivi
            </p>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
        </div>

        {/* Mode tabs (solo per inserimento nuovo) */}
        {!initialData && (
          <div className="flex gap-1 px-6 pt-4">
            {MODE_TABS.map(tab => (
              <button key={tab.key} onClick={() => setInputMode(tab.key)}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-all"
                style={{
                  background: inputMode === tab.key ? `color-mix(in srgb, ${accentColor} 8%, transparent)` : 'var(--color-surface)',
                  border: `1px solid ${inputMode === tab.key ? `color-mix(in srgb, ${accentColor} 25%, transparent)` : 'var(--color-border)'}`,
                  color: inputMode === tab.key ? accentColor : '#555',
                }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Connettori ── */}
        {inputMode === 'connectors' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4" style={{ color: accentColor }} />
              <p className="text-sm font-bold text-text-primary">Importa da strumenti esterni</p>
            </div>
            <p className="text-2xs text-text-secondary -mt-2">
              Connetti le tue piattaforme per importare i KPI automaticamente ogni mese.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {CONNECTORS.map(c => (
                <div key={c.name} className="rounded-xl p-4 flex items-start gap-3 relative overflow-hidden"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <span className="text-2xl leading-none mt-0.5">{c.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-bold text-text-primary">{c.name}</p>
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider"
                        style={{ background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>presto</span>
                    </div>
                    <p className="text-2xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-2xs text-center" style={{ color: 'var(--color-text-tertiary)' }}>
              Le integrazioni saranno disponibili nella prossima versione del gestionale.
            </p>
          </div>
        )}

        {/* ── AI Precompilato ── */}
        {inputMode === 'ai' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: accentColor }} />
                <p className="text-sm font-bold text-text-primary">Benchmark di settore</p>
              </div>
              <button onClick={fetchAiLevels} disabled={aiLoading}
                className="flex items-center gap-1 text-2xs px-2.5 py-1.5 rounded-lg"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: aiLoading ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)' }}>
                {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Rigenera
              </button>
            </div>
            {aiLoading ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Analisi benchmark di settore…</p>
              </div>
            ) : aiLevels ? (
              <>
                <p className="text-2xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Seleziona un livello come base — potrai modificare ogni valore nel form.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {AI_LEVEL_CFG.map(lvl => (
                    <div key={lvl.key} className="rounded-xl overflow-hidden"
                      style={{ border: `1px solid color-mix(in srgb, ${lvl.color} 13%, transparent)`, background: `color-mix(in srgb, ${lvl.color} 3%, transparent)` }}>
                      <div className="px-3 py-2.5 border-b" style={{ borderColor: `color-mix(in srgb, ${lvl.color} 13%, transparent)` }}>
                        <p className="text-2xs font-black uppercase tracking-widest" style={{ color: lvl.color }}>{lvl.label}</p>
                        <p className="text-2xs" style={{ color: 'var(--color-text-tertiary)' }}>{lvl.desc}</p>
                      </div>
                      <div className="p-2.5 space-y-1.5">
                        {aiKpiKeys.map(k => (
                          <div key={k} className="flex items-center justify-between">
                            <span className="text-2xs" style={{ color: 'var(--color-text-secondary)' }}>{KPI_LABELS_MAP[k] ?? k}</span>
                            <span className="text-2xs font-bold" style={{ color: lvl.color }}>
                              {aiLevels[lvl.key]?.[k] != null ? fmtTarget(k, aiLevels[lvl.key][k]) : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="px-2.5 pb-2.5">
                        <button onClick={() => applyAiLevel(lvl.key, lvl.label)}
                          className="w-full py-1.5 rounded-lg text-2xs font-bold transition-all"
                          style={{ background: `color-mix(in srgb, ${lvl.color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${lvl.color} 19%, transparent)`, color: lvl.color }}>
                          Usa come base →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center py-8 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Errore. Riprova.</p>
            )}
          </div>
        )}

        {/* ── Manuale (form) ── */}
        {inputMode === 'manuale' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Banner AI source */}
            {aiSource && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: 'var(--color-gold-dim)', border: '1px solid var(--color-gold)' }}>
                <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-gold-text)' }} />
                <p className="text-2xs" style={{ color: 'var(--color-text-secondary)' }}>
                  Precompilato da AI · livello <strong style={{ color: 'var(--color-gold-text)' }}>{aiSource}</strong> — modifica i valori se necessario
                </p>
                <button type="button" onClick={() => setAiSource(null)} className="ml-auto">
                  <X className="w-3 h-3" style={{ color: 'var(--color-text-secondary)' }} />
                </button>
              </div>
            )}

            {/* Mese */}
            <div className="max-w-xs">
              <label className="block text-xs text-text-secondary mb-1">Mese di riferimento *</label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={inputCls} required />
            </div>

            {/* Campi per categoria */}
            {categories.map(cat => {
              const catDefs = cat.keys
                .map(k => enabledStd.find(d => d.key === k))
                .filter((d): d is StdKpiDef => !!d && enabledKeys.has(d.key))
              if (catDefs.length === 0) return null
              return (
                <div key={cat.label} className="border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-surface border-b border-border">
                    <span>{cat.emoji}</span>
                    <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">{cat.label}</span>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-3">
                    {catDefs.map(d => (
                      <div key={d.key}>
                        <label className="block text-xs text-text-secondary mb-1">
                          {d.label}
                          {d.prefix && <span className="text-text-secondary ml-1">({d.prefix})</span>}
                          {d.unit && <span className="text-text-secondary ml-1">({d.unit})</span>}
                          {d.lower_is_better && <span className="text-text-secondary ml-1">↓</span>}
                        </label>
                        <input type="number" step={d.isInt ? '1' : 'any'} min="0"
                          value={stdValues[d.key] ?? ''}
                          onChange={e => setStdValues(p => ({ ...p, [d.key]: e.target.value }))}
                          placeholder={d.placeholder}
                          className={inputCls}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* KPI custom */}
            {customKpis.length > 0 && (
              <div className="border border-gold/20 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gold/5 border-b border-gold/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block" />
                  <span className="text-xs font-bold text-gold-text/70 uppercase tracking-wider">KPI Personalizzati</span>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3">
                  {customKpis.map(c => (
                    <div key={c.id}>
                      <label className="block text-xs text-text-secondary mb-1">{c.name} <span className="text-text-secondary">({c.unit})</span></label>
                      <input type="number" step="any" min="0" value={customValues[c.id] ?? ''}
                        onChange={e => setCustomValues(p => ({ ...p, [c.id]: e.target.value }))}
                        placeholder={c.target ? `target: ${c.target}` : 'es. 0'} className={inputCls} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Note */}
            <div>
              <label className="block text-xs text-text-secondary mb-1">Note del mese</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="es. Campagna Black Friday, lancio prodotto, budget ridotto..."
                className={`${inputCls} resize-none`} />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors">
                Annulla
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 bg-gold text-on-gold font-bold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {initialData ? 'Aggiorna KPI' : 'Salva KPI'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Modal configurazione KPI ────────────────────────────────────────────────

function KpiConfigModal({ client, projectId, config, stdDefs, categories, isGrowth, onClose, onSaved }: {
  client: Client
  projectId: string
  config: ClientKpiConfig | null
  stdDefs: StdKpiDef[]
  categories: KpiCategory[]
  isGrowth: boolean
  onClose: () => void
  onSaved: (c: ClientKpiConfig) => void
}) {
  const defaultEnabled = stdDefs.map(d => d.key)
  const [enabled, setEnabled] = useState<string[]>(config?.enabled?.length ? config.enabled : defaultEnabled)
  const [customKpis, setCustomKpis] = useState<CustomKpiDef[]>(config?.custom_kpis ?? [])
  const [newKpi, setNewKpi] = useState({ name: '', unit: '', target: '', lower_is_better: false })
  const [loading, setLoading] = useState(false)

  const toggleKey = (key: string) =>
    setEnabled(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])

  const toggleCategory = (keys: string[]) => {
    const allOn = keys.every(k => enabled.includes(k))
    setEnabled(p => allOn ? p.filter(k => !keys.includes(k)) : Array.from(new Set([...p, ...keys])))
  }

  const addCustom = () => {
    if (!newKpi.name.trim() || !newKpi.unit.trim()) return
    setCustomKpis(p => [...p, {
      id: crypto.randomUUID(),
      name: newKpi.name.trim(),
      unit: newKpi.unit.trim(),
      target: newKpi.target ? parseFloat(newKpi.target) : null,
      lower_is_better: newKpi.lower_is_better,
    }])
    setNewKpi({ name: '', unit: '', target: '', lower_is_better: false })
  }

  const save = async () => {
    setLoading(true)
    const supabase = createClient()
    const payload = { client_id: client.id, project_id: projectId, enabled, custom_kpis: customKpis }
    const { data, error } = config
      ? await supabase.from('client_kpi_config').update(payload).eq('id', config.id).select().single()
      : await supabase.from('client_kpi_config').insert(payload).select().single()
    setLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success('Configurazione salvata')
    onSaved(data as ClientKpiConfig)
    onClose()
  }

  const inputCls = 'bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold/50 placeholder-text-tertiary'
  const accent = isGrowth ? { color: 'var(--color-gold-text)', bg: '#F5C80018', border: '#F5C80044' } : { color: 'var(--color-info)', bg: '#60A5FA18', border: '#60A5FA44' }

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header fisso */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
              style={{ background: accent.bg, border: `1px solid ${accent.border}` }}>
              {isGrowth ? '📣' : '📱'}
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Configura KPI</h2>
              <p className="text-2xs text-text-secondary">
                <span style={{ color: accent.color }}>{isGrowth ? 'Growth' : 'Digital'}</span>
                {' · '}{enabled.length} di {stdDefs.length} KPI attivi
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body scrollabile */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Attiva / disattiva tutto */}
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-surface border border-border">
            <span className="text-xs text-text-secondary">Seleziona tutto</span>
            <button onClick={() => setEnabled(enabled.length === stdDefs.length ? [] : stdDefs.map(d => d.key))}
              className="text-xs font-semibold transition-colors"
              style={{ color: accent.color }}>
              {enabled.length === stdDefs.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
            </button>
          </div>

          {/* Categorie */}
          {categories.map(cat => {
            const catDefs = cat.keys.map(k => stdDefs.find(d => d.key === k)).filter(Boolean) as StdKpiDef[]
            const onCount = cat.keys.filter(k => enabled.includes(k)).length
            const allOn = onCount === catDefs.length
            return (
              <div key={cat.label} className="rounded-xl border border-border overflow-hidden">
                {/* Header categoria */}
                <div className="flex items-center gap-3 px-4 py-3 bg-surface">
                  <span className="text-lg leading-none">{cat.emoji}</span>
                  <span className="text-sm font-semibold text-text-primary flex-1">{cat.label}</span>
                  <span className="text-2xs text-text-secondary mr-3">
                    {onCount}/{catDefs.length} attivi
                  </span>
                  {/* Toggle gruppo */}
                  <button onClick={() => toggleCategory(cat.keys)}
                    className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0"
                    style={{ background: allOn ? accent.color : 'var(--color-surface-active)' }}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-surface shadow transition-all ${allOn ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>

                {/* KPI grid 2 colonne */}
                <div className="grid grid-cols-2 divide-x divide-border">
                  {catDefs.map((d, i) => {
                    const on = enabled.includes(d.key)
                    return (
                      <label key={d.key}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-t border-border ${on ? 'bg-surface-active' : 'bg-surface hover:bg-surface'} ${i % 2 === 0 ? '' : ''}`}>
                        {/* Mini toggle */}
                        <div onClick={() => toggleKey(d.key)}
                          className="relative w-8 h-4 rounded-full transition-colors flex-shrink-0"
                          style={{ background: on ? accent.color : 'var(--color-surface-active)' }}>
                          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-surface shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium leading-tight ${on ? 'text-text-primary' : 'text-text-secondary'}`}>{d.label}</p>
                          <p className="text-2xs text-text-tertiary mt-0.5">
                            {d.prefix ?? ''}{d.unit ?? (d.isInt ? 'n°' : 'val')}
                            {d.lower_is_better ? ' · ↓ meglio' : ''}
                            {d.targetKey ? ' · target' : ''}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* KPI personalizzati esistenti */}
          {customKpis.length > 0 && (
            <div className="rounded-xl border border-gold/20 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-surface border-b border-gold/10">
                <span className="w-2 h-2 rounded-full bg-gold" />
                <span className="text-sm font-semibold text-text-primary flex-1">KPI Personalizzati</span>
              </div>
              <div className="divide-y divide-border">
                {customKpis.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3 bg-surface">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text-primary">{c.name}</p>
                      <p className="text-2xs text-text-secondary">
                        {c.unit}{c.target ? ` · target: ${c.target}` : ''}{c.lower_is_better ? ' · ↓ meglio' : ''}
                      </p>
                    </div>
                    <button onClick={() => setCustomKpis(p => p.filter(x => x.id !== c.id))}
                      className="p-1.5 text-text-tertiary hover:text-error transition-colors rounded-lg hover:bg-error/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aggiungi KPI custom */}
          <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
            <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">Aggiungi KPI personalizzato</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={newKpi.name} onChange={e => setNewKpi(p => ({ ...p, name: e.target.value }))}
                placeholder="Nome KPI (es. Prenotazioni)" className={`${inputCls} col-span-2`} />
              <input value={newKpi.unit} onChange={e => setNewKpi(p => ({ ...p, unit: e.target.value }))}
                placeholder="Unità (n°, €, %)" className={inputCls} />
              <input type="number" value={newKpi.target} onChange={e => setNewKpi(p => ({ ...p, target: e.target.value }))}
                placeholder="Target/mese (opz.)" className={inputCls} />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => setNewKpi(p => ({ ...p, lower_is_better: !p.lower_is_better }))}
                  className="relative w-8 h-4 rounded-full transition-colors"
                  style={{ background: newKpi.lower_is_better ? 'var(--color-gold)' : 'var(--color-surface-active)' }}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-surface shadow transition-all ${newKpi.lower_is_better ? 'left-[18px]' : 'left-0.5'}`} />
                </div>
                <span className="text-xs text-text-secondary">Valore più basso = meglio</span>
              </label>
              <button type="button" onClick={addCustom} disabled={!newKpi.name.trim() || !newKpi.unit.trim()}
                className="flex items-center gap-1.5 text-xs font-semibold text-on-gold bg-gold px-3 py-1.5 rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <Plus className="w-3.5 h-3.5" /> Aggiungi
              </button>
            </div>
          </div>
        </div>

        {/* Footer fisso */}
        <div className="flex gap-3 px-5 py-4 border-t border-border flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors">
            Annulla
          </button>
          <button onClick={save} disabled={loading}
            className="flex-1 py-2.5 font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            style={{ background: accent.color, color: isGrowth ? '#000' : '#000' }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Salva configurazione
          </button>
        </div>
      </div>
    </div>
  )
}
