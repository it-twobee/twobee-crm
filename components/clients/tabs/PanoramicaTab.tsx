'use client'

import Link from 'next/link'
import {
  FileText, Users, MessageSquare, BarChart3,
  Phone, Users2, Mail, Presentation, MapPin, HelpCircle, Star,
  Check, AlertCircle, Clock, AlertTriangle, Wallet,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { mrrOrigin, economicsHref, CONTRACT_PERIOD_HINT } from '@/lib/economics-source'
import { CalendarAgenda } from '@/components/shared/CalendarAgenda'
import type { Client, ClientKpi, Profile, ClientInteraction, InteractionType, InteractionOutcome } from '@/lib/types/database'

const TYPE_ICON: Record<InteractionType, React.ReactNode> = {
  call:     <Phone className="w-3 h-3" />,
  meeting:  <Users2 className="w-3 h-3" />,
  email:    <Mail className="w-3 h-3" />,
  demo:     <Presentation className="w-3 h-3" />,
  visit:    <MapPin className="w-3 h-3" />,
  slack:    <MessageSquare className="w-3 h-3" />,
  proposta: <FileText className="w-3 h-3" />,
  altro:    <HelpCircle className="w-3 h-3" />,
}
const TYPE_LABEL: Record<InteractionType, string> = {
  call: 'Call', meeting: 'Meeting', email: 'Email', demo: 'Demo',
  visit: 'Visita', slack: 'Slack', proposta: 'Proposta', altro: 'Altro',
}
const OUTCOME_ICON: Record<InteractionOutcome, React.ReactNode> = {
  positivo:   <Check className="w-2.5 h-2.5" />,
  neutro:     <Clock className="w-2.5 h-2.5" />,
  negativo:   <AlertCircle className="w-2.5 h-2.5" />,
  da_seguire: <Star className="w-2.5 h-2.5" />,
}
const OUTCOME_COLOR: Record<InteractionOutcome, string> = {
  positivo: 'text-success', neutro: 'text-text-secondary',
  negativo: 'text-error',   da_seguire: 'text-warning',
}

interface Props {
  client: Client
  kpis: ClientKpi[]
  allProfiles: Profile[]
  teamMembers: Profile[]
  interactions: ClientInteraction[]
  isAdmin: boolean
  openTickets: number
  onTabChange?: (tab: number) => void
  /** Portale operativo: oscura MRR e dati economici */
  hideEconomics?: boolean
  /** quanti contratti ha il cliente: dice da dove esce il canone */
  contractsCount?: number | null
}

function scoreChecks(checks: { actual: number | null; target: number | null; lowerIsBetter?: boolean }[]): number {
  const valid = checks.filter(c => c.actual != null && c.target != null && c.target! > 0)
  if (!valid.length) return 50
  const scores = valid.map(c => {
    const pct = c.lowerIsBetter
      ? (c.target! / c.actual!) * 100
      : (c.actual! / c.target!) * 100
    if (pct >= 100) return 100
    if (pct >= 85)  return 80
    if (pct >= 70)  return 55
    if (pct >= 50)  return 30
    return 10
  })
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

function calcGrowthHealth(kpi: ClientKpi | undefined, client: Client): number {
  if (!kpi) return 0
  return scoreChecks([
    { actual: kpi.roas,               target: client.target_roas },
    { actual: kpi.revenue_attributed, target: client.target_revenue_monthly },
    { actual: kpi.leads_generated,    target: client.target_leads_monthly },
    { actual: kpi.conversion_rate,    target: client.target_conv_rate },
    { actual: kpi.ctr,                target: client.target_ctr },
  ])
}

function calcDigitalHealth(kpi: ClientKpi | undefined): number {
  if (!kpi) return 0
  const checks: { ok: boolean }[] = []
  if (kpi.uptime != null)         checks.push({ ok: kpi.uptime >= 99 })
  if (kpi.bounce_rate != null)    checks.push({ ok: kpi.bounce_rate <= 55 })
  if (kpi.organic_sessions != null && kpi.organic_sessions > 0) checks.push({ ok: true })
  if (kpi.active_users != null && kpi.active_users > 0)         checks.push({ ok: true })
  if (kpi.email_open_rate != null) checks.push({ ok: kpi.email_open_rate >= 20 })
  if (!checks.length) return 50
  const pct = checks.filter(c => c.ok).length / checks.length
  if (pct >= 0.8) return 85
  if (pct >= 0.6) return 65
  if (pct >= 0.4) return 45
  return 25
}

function KpiSnapshotPanel({ label, accent, month, items }: {
  label: string
  accent: string
  month: string
  items: { label: string; raw: number | null; fmt: (v: number) => string; target?: number | null }[]
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5" style={{ color: accent }} />
          <span className="text-2xs uppercase tracking-wider font-bold" style={{ color: accent }}>{label}</span>
          <span className="text-2xs text-text-secondary">
            — {new Date(month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map(k => {
          const pct = k.raw != null && k.target ? Math.round((k.raw / k.target) * 100) : null
          const color = pct == null ? (k.raw != null ? 'text-text-primary' : 'text-text-tertiary') : pct >= 100 ? 'text-success' : pct >= 70 ? 'text-warning' : 'text-error'
          return (
            <div key={k.label} className="bg-background rounded-lg p-3">
              <p className="text-2xs text-text-secondary mb-1">{k.label}</p>
              <p className={`text-base font-black ${color}`}>{k.raw != null ? k.fmt(k.raw) : '—'}</p>
              {pct !== null && (
                <div className="mt-1.5">
                  <div className="h-1 bg-surface-active rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? 'var(--color-success)' : pct >= 70 ? accent : 'var(--color-error)' }} />
                  </div>
                  <p className="text-2xs text-text-secondary mt-0.5">{pct}% target</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HealthRing({ score }: { score: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 75 ? 'var(--color-success)' : score >= 50 ? 'var(--color-gold-text)' : 'var(--color-error)'
  const label = score >= 75 ? 'Ottimo' : score >= 50 ? 'Normale' : score >= 25 ? 'Attenzione' : 'Critico'
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={88} height={88} viewBox="0 0 88 88">
        <circle cx={44} cy={44} r={r} fill="none" stroke="var(--color-surface-active)" strokeWidth="7" />
        <circle cx={44} cy={44} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 44 44)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        <text x="44" y="40" textAnchor="middle" fill={color} fontSize="18" fontWeight="900">{score}</text>
        <text x="44" y="54" textAnchor="middle" fill="var(--color-text-tertiary)" fontSize="9">/100</text>
      </svg>
      <span className="text-2xs font-bold" style={{ color }}>{label}</span>
      <span className="text-2xs text-text-secondary">Health Score</span>
    </div>
  )
}

export function PanoramicaTab({
  client, kpis, teamMembers, interactions, openTickets, onTabChange,
  hideEconomics = false, contractsCount = null,
}: Props) {
  const now = new Date()
  // §176: senza contratti non c'è un canone, c'è un progetto da quotare
  const quoted = contractsCount != null && contractsCount > 0
  const origin = mrrOrigin(quoted ? 'contratti' : 'anagrafica', contractsCount)

  const lastKpi = kpis[0] ?? null

  const isGrowth        = client.client_type === 'growth'
  const isDigital       = client.client_type === 'digital'
  const isGrowthDigital = client.client_type === 'growth_digital'

  const growthHealth  = calcGrowthHealth(lastKpi ?? undefined, client)
  const digitalHealth = calcDigitalHealth(lastKpi ?? undefined)
  const healthScore   = isGrowthDigital
    ? Math.round((growthHealth + digitalHealth) / 2)
    : isDigital ? digitalHealth : growthHealth

  /* §177: senza contratti non c'è niente che scade. Le date in anagrafica sono
     un residuo storico: un countdown costruito su quelle manda a rincorrere un
     rinnovo che non esiste. Senza scadenza (ma con contratti) è indeterminato. */
  const daysToExpiry = !quoted ? null
    : client.contract_end
      ? Math.round((new Date(client.contract_end).getTime() - now.getTime()) / 86400000)
      : null
  const lastInteraction = interactions[0]
  const daysSinceContact = lastInteraction
    ? Math.round((now.getTime() - new Date(lastInteraction.date).getTime()) / 86400000)
    : null

  const alerts: { level: 'error' | 'warning'; msg: string; action?: () => void; actionLabel?: string }[] = []
  if (daysToExpiry !== null && daysToExpiry > 0 && daysToExpiry <= 30)
    alerts.push({ level: 'warning', msg: `Contratto in scadenza tra ${daysToExpiry} giorni`, action: () => onTabChange?.(1), actionLabel: 'Anagrafica' })
  if (daysToExpiry !== null && daysToExpiry <= 0)
    alerts.push({ level: 'error', msg: 'Contratto scaduto' })
  if (openTickets > 2)
    alerts.push({ level: 'warning', msg: `${openTickets} ticket aperti — verifica customer care` })
  if (daysSinceContact !== null && daysSinceContact > 21)
    alerts.push({ level: 'warning', msg: `Ultimo contatto ${daysSinceContact} giorni fa — pianifica un touchpoint` })

  return (
    <div className="space-y-4">

      {/* 1 ── Alert banner ─────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm ${
              a.level === 'error'
                ? 'bg-error/10 border-error/30 text-error'
                : 'bg-warning/10 border-warning/30 text-warning'
            }`}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{a.msg}</span>
              {a.action && (
                <button onClick={a.action} className="text-xs font-bold underline underline-offset-2 shrink-0 whitespace-nowrap">
                  {a.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 2 ── Hero: Health Score + MRR + contratto ─────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
        <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-5">
          <div className="shrink-0">
            <HealthRing score={healthScore} />
          </div>
          <div className="hidden sm:block w-px bg-surface-active" />
          {/* Il canone sta nell'intestazione della scheda, visibile da ogni tab:
              ripeterlo qui creava due numeri da tenere d'occhio invece di uno. */}
          <div className="flex-1 flex flex-col justify-center gap-1 text-center sm:text-left">
            <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold">Profilo</p>
            <p className="text-lg font-black text-text-primary">
              {isGrowthDigital ? 'Growth + Digital' : isGrowth ? 'Cliente Growth' : 'Cliente Digital'}
            </p>
            {!hideEconomics && (
              <Link href={economicsHref(client.id)} title={origin.hint}
                className="inline-flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80 mt-1 justify-center sm:justify-start">
                <Wallet className="w-3.5 h-3.5" />Economics{' '}
                <span className={`font-normal ${quoted ? 'text-text-tertiary' : 'text-warning'}`}>
                  {quoted ? `· canone ${origin.label}` : '· da quotare'}
                </span>
              </Link>
            )}
          </div>
          {/* §211 — nel workspace il contratto non esiste: `contractsCount` non
              arriva, quindi la scheda diceva «Da quotare» a chiunque e offriva un
              link a Economics che quel ruolo non può aprire. Un vicolo cieco che
              parla di soldi è la peggiore delle due cose insieme. */}
          {!hideEconomics && <>
          <div className="hidden sm:block w-px bg-surface-active" />
          <div className="flex-1 flex flex-col justify-center gap-1 text-center sm:text-left">
            <p className="text-2xs text-text-secondary uppercase tracking-wider font-bold" title={CONTRACT_PERIOD_HINT}>Contratto</p>
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <span className={`text-lg font-black ${
                !quoted ? 'text-warning'
                  : daysToExpiry === null ? 'text-success'
                  : daysToExpiry <= 0 ? 'text-error' : daysToExpiry <= 30 ? 'text-warning' : 'text-success'
              }`}>
                {!quoted ? 'Da quotare'
                  : daysToExpiry === null ? 'Indeterminato'
                  : daysToExpiry <= 0 ? 'Scaduto' : `${daysToExpiry}gg`}
              </span>
              {daysToExpiry !== null && daysToExpiry > 0 && <span className="text-xs text-text-secondary">rimanenti</span>}
            </div>
            <div className="h-1.5 bg-surface-active rounded-full overflow-hidden mt-1">
              {(() => {
                if (!quoted) return <div className="h-full rounded-full w-full bg-warning/30" />
                if (daysToExpiry === null) return <div className="h-full rounded-full w-full bg-success/40" />
                const s = new Date(client.contract_start).getTime()
                const e = new Date(client.contract_end!).getTime()
                const pct = Math.min(100, Math.max(0, Math.round(((now.getTime() - s) / (e - s)) * 100)))
                return <div className="h-full rounded-full" style={{ width: `${pct}%`, background: daysToExpiry <= 0 ? 'var(--color-error)' : daysToExpiry <= 30 ? 'var(--color-gold-text)' : 'var(--color-success)' }} />
              })()}
            </div>
            {quoted ? (
              <p className="text-2xs text-text-secondary">
                {new Date(client.contract_start).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })} →{' '}
                {client.contract_end
                  ? new Date(client.contract_end).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'senza scadenza'}
              </p>
            ) : (
              <Link href={economicsHref(client.id)} className="text-2xs text-gold-text font-semibold hover:opacity-80">
                Nessun contratto: quota i progetti in Economics →
              </Link>
            )}
          </div>
          </>}
        </div>
      </div>

      {/* 3 ── Metriche di relazione ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft text-left">
          <div className="flex items-center gap-2 text-text-secondary mb-2">
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="text-2xs uppercase tracking-wider font-bold">Ticket aperti</span>
          </div>
          <p className={`text-2xl font-black ${openTickets > 2 ? 'text-error' : openTickets > 0 ? 'text-warning' : 'text-success'}`}>
            {openTickets}
          </p>
          <p className="text-2xs text-text-secondary mt-0.5">
            {openTickets === 0 ? 'Tutto risolto ✓' : openTickets > 2 ? 'Richiede attenzione' : 'In gestione'}
          </p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft text-left">
          <div className="flex items-center gap-2 text-text-secondary mb-2">
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="text-2xs uppercase tracking-wider font-bold">Ultimo contatto</span>
          </div>
          <p className={`text-2xl font-black ${daysSinceContact === null ? 'text-text-tertiary' : daysSinceContact > 21 ? 'text-warning' : 'text-success'}`}>
            {daysSinceContact === null ? '—' : `${daysSinceContact}gg`}
          </p>
          <p className="text-2xs text-text-secondary mt-0.5">
            {daysSinceContact === null
              ? 'Nessuna interazione'
              : daysSinceContact > 21
                ? 'Pianifica un touchpoint'
                : lastInteraction ? TYPE_LABEL[lastInteraction.type] : ''}
          </p>
        </div>
      </div>

      {/* 4 ── Relazione commerciale ────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
        <div className="flex items-center gap-2 text-text-secondary mb-3">
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="text-2xs uppercase tracking-wider font-bold">Relazione commerciale</span>
        </div>
        {interactions.length === 0 ? (
          <p className="text-xs text-text-secondary">Nessuna interazione registrata.</p>
        ) : (
          <div className="space-y-3">
            {interactions.slice(0, 4).map(i => (
              <div key={i.id} className="flex items-start gap-2.5">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${i.is_milestone ? 'bg-gold/20 text-gold-text' : 'bg-surface text-text-secondary'}`}>
                  {TYPE_ICON[i.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-text-primary truncate">{i.title}</span>
                    <span className={`text-2xs flex items-center gap-0.5 ${OUTCOME_COLOR[i.outcome]}`}>
                      {OUTCOME_ICON[i.outcome]}
                      {i.outcome.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-2xs text-text-secondary">
                    {TYPE_LABEL[i.type]} · {new Date(i.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5 ── KPI snapshot ─────────────────────────────────────────────── */}
      {lastKpi && (
        <div className={`grid gap-4 ${isGrowthDigital ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {(isGrowth || isGrowthDigital) && (
            <KpiSnapshotPanel
              label="KPI Growth"
              accent="var(--color-gold-text)"
              month={lastKpi.month}
              items={[
                { label: 'Revenue',  raw: lastKpi.revenue_attributed, fmt: (v) => formatCurrency(v), target: client.target_revenue_monthly },
                { label: 'Lead',     raw: lastKpi.leads_generated,    fmt: (v) => String(v),         target: client.target_leads_monthly },
                { label: 'ROAS',     raw: lastKpi.roas,               fmt: (v) => `${v}×`,           target: client.target_roas },
                { label: 'CTR',      raw: lastKpi.ctr,                fmt: (v) => `${v}%`,           target: client.target_ctr },
              ]}
            />
          )}
          {(isDigital || isGrowthDigital) && (
            <KpiSnapshotPanel
              label="KPI Digital"
              accent="var(--color-info)"
              month={lastKpi.month}
              items={[
                { label: 'Sessioni org.',  raw: lastKpi.organic_sessions, fmt: (v) => v.toLocaleString('it-IT') },
                { label: 'Nuovi utenti',   raw: lastKpi.new_users,        fmt: (v) => v.toLocaleString('it-IT') },
                { label: 'Utenti attivi',  raw: lastKpi.active_users,     fmt: (v) => v.toLocaleString('it-IT') },
                { label: 'Uptime',         raw: lastKpi.uptime,           fmt: (v) => `${v}%` },
              ]}
            />
          )}
        </div>
      )}

      {/* 6 ── Agenda ───────────────────────────────────────────────────── */}
      <CalendarAgenda clientName={client.display_name ?? client.company_name} />

      {/* 7 ── Team assegnato ───────────────────────────────────────────── */}
      {teamMembers.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
          <div className="flex items-center gap-2 text-text-secondary mb-3">
            <Users className="w-3.5 h-3.5" />
            <span className="text-2xs uppercase tracking-wider font-bold">Team assegnato</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {teamMembers.map(m => (
              <div key={m.id} className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5">
                <div className="w-5 h-5 rounded-full bg-gold/20 flex items-center justify-center text-2xs font-black text-gold-text overflow-hidden shrink-0">
                  {m.avatar_url ? <img src={m.avatar_url} className="w-full h-full object-cover rounded-full" alt="" /> : m.full_name[0]}
                </div>
                <span className="text-xs text-text-primary">{m.full_name.split(' ')[0]}</span>
                <span className="text-2xs text-text-secondary capitalize">{m.app_role}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
