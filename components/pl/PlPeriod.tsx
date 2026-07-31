'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  TrendingUp, TrendingDown, Wallet, Target, Users, Building2,
  ChevronLeft, ChevronRight, Tag, UserCog, ArrowUpRight,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { diagnose } from '@/lib/pl-health'
import { PlHealth } from './PlHealth'
import {
  aggregatePeriod, rank, monthLabel, shiftMonth,
  type PlConfig, type PlTotals, type RevenueLine, type CostLine,
} from '@/lib/pl'

type MonthRow = { month: string; exists: boolean; t: PlTotals }
type RevRow = RevenueLine & { month: string; client: string }
type CostRow = CostLine & { month: string }

const eur = (n: number) => formatCurrency(Math.round(n))
const pc = (n: number) => `${(n * 100).toFixed(n * 100 % 1 === 0 ? 0 : 1)}%`
const SPANS = [1, 3, 6, 12]

/** Le voci HR e Outsourcing sono il costo del lavoro: si leggono a parte. */
const HR_CATEGORIES = ['HR', 'Outsourcing']

export function PlPeriod({
  month, span, config, perMonth, revenue, costs,
}: {
  month: string
  span: number
  config: PlConfig
  perMonth: MonthRow[]
  revenue: RevRow[]
  costs: CostRow[]
}) {
  const router = useRouter()
  const [view, setView] = useState<'andamento' | 'entrate' | 'uscite'>('andamento')

  const a = useMemo(() => aggregatePeriod(perMonth.map(m => ({ month: m.month, t: m.t }))), [perMonth])
  const peak = Math.max(1, ...perMonth.map(m => Math.max(m.t.revenue.accrued, m.t.costs.actual)))

  const topClients = useMemo(() => rank(revenue, r => r.client, r => r.amount_net), [revenue])
  const byKind = useMemo(() => rank(revenue, r => r.kind === 'digital' ? 'Digital' : 'Growth', r => r.amount_net), [revenue])
  const bySales = useMemo(
    () => rank(revenue, r => r.sales_owner ?? (r.sales_owner_id ? 'Assegnato' : 'Non assegnato'), r => r.amount_net),
    [revenue])
  const byCategory = useMemo(() => rank(costs, c => c.category, c => c.actual), [costs])
  const hrRows = useMemo(
    () => rank(costs.filter(c => HR_CATEGORIES.includes(c.category)), c => c.label, c => c.actual),
    [costs])
  const hrTotal = hrRows.reduce((s, r) => s + r.amount, 0)
  const overTarget = a.costs.variance < 0

  // diagnosi sul periodo: stesse soglie del mese, ma su numeri che non ballano
  const findings = useMemo(() => {
    const totals = perMonth.length ? perMonth[perMonth.length - 1].t : null
    if (!totals) return []
    const merged = {
      ...totals,
      revenue: { ...totals.revenue, accrued: a.revenue.accrued, collected: a.revenue.collected, unpaid: a.revenue.unpaid },
      costs: { ...totals.costs, actual: a.costs.actual, target: a.costs.target, variance: a.costs.variance, ratio: a.costs.ratio },
      margin: { ...totals.margin, gross: a.margin.gross },
    }
    return diagnose(merged, revenue, costs, config)
  }, [perMonth, a, revenue, costs, config])

  const go = (n: number) => router.push(`/economics?m=${month}&n=${n}`)
  const shift = (d: number) => router.push(`/economics?m=${shiftMonth(month, d * span)}&n=${span}`)
  const first = perMonth[0]?.month ?? month

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => shift(-1)} aria-label="Periodo precedente"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">
              {monthLabel(first)} → {monthLabel(month)}
            </h1>
            <button onClick={() => shift(1)} aria-label="Periodo successivo"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {a.months} mesi · <span className="tabular font-semibold text-text-primary">{perMonth.filter(m => m.exists).length}</span> registrati
          </p>
        </div>

        <div className="flex bg-surface border border-border rounded-xl p-0.5">
          {SPANS.map(n => (
            <button key={n} onClick={() => go(n)} aria-pressed={n === span}
              className={`px-3 py-1.5 rounded-lg text-2xs font-semibold whitespace-nowrap ${
                n === span ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'
              }`}>{n === 1 ? 'Mese' : `${n} mesi`}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<TrendingUp className="w-4 h-4 text-success" />} label="Entrate del periodo" value={eur(a.revenue.accrued)}
          hint={`media ${eur(a.revenue.avg)}/mese · ${eur(a.revenue.unpaid)} da incassare`} />
        <Kpi icon={<TrendingDown className="w-4 h-4 text-error" />} label="Costi effettivi" value={eur(a.costs.actual)}
          hint={`preventivato ${eur(a.costs.budget)}`} />
        <Kpi icon={<Wallet className="w-4 h-4 text-gold-text" />} label="Margine lordo" value={eur(a.margin.gross)}
          hint={a.revenue.accrued > 0 ? `${pc(a.margin.gross / a.revenue.accrued)} sulle entrate` : '—'} />
        <Kpi icon={<Target className={`w-4 h-4 ${overTarget ? 'text-error' : 'text-success'}`} />}
          label="Incidenza costi" value={pc(a.costs.ratio)}
          hint={overTarget ? `${eur(-a.costs.variance)} sopra il target` : `${eur(a.costs.variance)} sotto il target`}
          tone={overTarget ? 'error' : 'success'} />
      </div>

      <PlHealth findings={findings} />

      <div className="flex bg-surface border border-border rounded-xl p-0.5 w-fit">
        {(['andamento', 'entrate', 'uscite'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
            className={`px-3.5 py-1.5 rounded-lg text-2xs font-semibold capitalize ${
              view === v ? 'bg-surface-active text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}>{v}</button>
        ))}
      </div>

      {view === 'andamento' && (
        <>
          <Card title="Mese per mese" note="Entrate contro costi effettivi">
            <div className="space-y-1.5">
              {perMonth.map(m => (
                <div key={m.month} className="flex items-center gap-3">
                  <Link href={`/economics?m=${m.month}`}
                    className="w-28 shrink-0 text-2xs text-text-secondary hover:text-gold-text truncate">
                    {monthLabel(m.month)}
                  </Link>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <Bar value={m.t.revenue.accrued} peak={peak} tone="bg-success" />
                    <Bar value={m.t.costs.actual} peak={peak} tone="bg-error" />
                  </div>
                  <span className="w-24 shrink-0 text-right text-2xs tabular text-text-primary font-semibold">
                    {m.exists ? eur(m.t.revenue.accrued) : '—'}
                  </span>
                  <span className="w-20 shrink-0 text-right text-2xs tabular text-text-tertiary hidden sm:block">
                    {m.exists ? pc(m.t.costs.ratio) : ''}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Compensi soci nel periodo" icon={<Users className="w-4 h-4 text-accent" />}>
              {a.perPartner.length === 0 ? <Empty>Nessun compenso maturato.</Empty> : (
                <div className="space-y-1.5">
                  {a.perPartner.map(p => (
                    <Row key={p.label} label={p.label}
                      meta={`erogato ${eur(p.delivery)} · residuo ${eur(p.residual)}`} value={eur(p.total)} />
                  ))}
                </div>
              )}
            </Card>
            <Card title="Cassa TwoBee" icon={<Building2 className="w-4 h-4 text-gold-text" />}
              note="Fondo rischio, residuo trattenuto e scostamento dai costi">
              <div className="text-2xl font-bold text-text-primary tabular">{eur(a.margin.company)}</div>
              <div className="text-2xs text-text-tertiary mt-1">
                di cui {eur(a.plan.riskFund)} di fondo rischio
              </div>
            </Card>
          </div>
        </>
      )}

      {view === 'entrate' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Clienti per fatturato" note="Chi regge il periodo, e quanto pesa">
            <Ranking rows={topClients} total={a.revenue.accrued} tone="bg-success" />
          </Card>
          <div className="space-y-4">
            <Card title="Per tipologia">
              <Ranking rows={byKind} total={a.revenue.accrued} tone="bg-info" />
            </Card>
            <Card title="Per commerciale" note="Il commerciale arriva dall'anagrafica cliente">
              <Ranking rows={bySales} total={a.revenue.accrued} tone="bg-accent" />
            </Card>
          </div>
        </div>
      )}

      {view === 'uscite' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Dove va la spesa" icon={<Tag className="w-4 h-4 text-error" />}
            note="Categorie ordinate per peso sul totale">
            <Ranking rows={byCategory} total={a.costs.actual} tone="bg-error" />
          </Card>
          <Card title="Costo del lavoro" icon={<UserCog className="w-4 h-4 text-orange" />}
            note={`HR e outsourcing · ${a.revenue.accrued > 0 ? pc(hrTotal / a.revenue.accrued) : '—'} delle entrate`}>
            {hrRows.length === 0 ? <Empty>Nessun costo HR registrato nel periodo.</Empty> : (
              <Ranking rows={hrRows} total={hrTotal} tone="bg-orange" />
            )}
          </Card>
        </div>
      )}

      <p className="flex items-start gap-2 text-2xs text-text-tertiary">
        <ArrowUpRight className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Il periodo è in sola lettura: per correggere le righe apri il singolo mese dalla colonna di sinistra,
        o scegli «Mese» qui sopra. Le incidenze sono ricalcolate sul totale di periodo, non sono medie
        delle percentuali mensili.
      </p>
    </div>
  )
}

function Card({ title, note, icon, children }: {
  title: string; note?: string; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">{icon}{title}</h2>
        {note && <p className="text-2xs text-text-tertiary mt-0.5">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function Kpi({ icon, label, value, hint, tone }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; tone?: 'success' | 'error'
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-center gap-2 mb-1.5">{icon}
        <span className="text-2xs font-semibold text-text-secondary uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold text-text-primary tabular">{value}</div>
      {hint && <div className={`text-2xs mt-0.5 ${tone === 'error' ? 'text-error' : tone === 'success' ? 'text-success' : 'text-text-tertiary'}`}>{hint}</div>}
    </div>
  )
}

function Bar({ value, peak, tone }: { value: number; peak: number; tone: string }) {
  return (
    <div className="h-2 rounded-full bg-surface-active overflow-hidden">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, (value / peak) * 100)}%` }} />
    </div>
  )
}

function Ranking({ rows, total, tone }: { rows: { label: string; amount: number; share: number }[]; total: number; tone: string }) {
  if (rows.length === 0) return <Empty>Nessun dato nel periodo.</Empty>
  const peak = Math.max(1, ...rows.map(r => r.amount))
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.label}>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="flex-1 min-w-0 text-2xs text-text-primary truncate">{r.label}</span>
            <span className="text-2xs tabular font-semibold text-text-primary">{eur(r.amount)}</span>
            <span className="w-10 text-right text-2xs tabular text-text-tertiary">{pc(r.share)}</span>
          </div>
          <Bar value={r.amount} peak={peak} tone={tone} />
        </div>
      ))}
      {total > 0 && (
        <p className="text-2xs text-text-tertiary pt-1">Totale {eur(total)}</p>
      )}
    </div>
  )
}

function Row({ label, meta, value }: { label: string; meta?: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border">
      <span className="text-sm font-semibold text-text-primary flex-1 truncate">{label}</span>
      {meta && <span className="text-2xs text-text-tertiary tabular hidden sm:block">{meta}</span>}
      <span className="text-sm font-bold text-text-primary tabular">{value}</span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center py-6 border border-dashed border-border rounded-xl">
      <p className="text-2xs text-text-tertiary">{children}</p>
    </div>
  )
}
