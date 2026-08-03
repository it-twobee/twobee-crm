'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Plus, Trash2, CopyPlus, Lock, LockOpen,
  TrendingUp, TrendingDown, Wallet, Target, ShieldAlert, Users, Building2, Info,
  Briefcase, AlertTriangle, RotateCcw, Landmark, CalendarRange,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  computeMonth, monthLabel, shiftMonth, pct, ownerOf,
  type PlConfig, type RevenueLine, type CostLine, type Partner,
} from '@/lib/pl'
import {
  generateRevenueFromClients, copyCostsFromPreviousMonth, setMonthStatus, resetMonth,
  addRevenueLine, updateRevenueLine, deleteRevenueLine,
  addCostLine, updateCostLine, deleteCostLine, bulkCostAction,
} from '@/app/actions/pl'
import { setLineCenter } from '@/app/actions/costs'
import { currentQuarterVat, nextDue, type MonthVat } from '@/lib/vat'
import { forecastTotals, type ForecastMonth } from '@/lib/forecast'
import { openMonth } from '@/app/actions/pl'
import { EconomicsNav } from '@/components/economics/EconomicsNav'
import { PrepareMonth } from '@/components/pl/PrepareMonth'
import { diagnose } from '@/lib/pl-health'
import { PlHealth } from './PlHealth'

type Props = {
  month: string
  status: 'aperto' | 'chiuso'
  exists: boolean
  /** la 163 non è stata eseguita: senza tabelle nessuna CTA può funzionare */
  setupNeeded: boolean
  previous: { accrued: number; costs: number; exists: boolean }
  missingClients: { id: string; name: string; mrr: number }[]
  knownMonths: { month: string; status: string }[]
  config: PlConfig
  partners: Partner[]
  profiles: { id: string; full_name: string }[]
  revenue: RevenueLine[]
  costs: CostLine[]
  /** aree di spesa: ogni uscita dice da quale budget esce */
  centers: { id: string; name: string }[]
  /** §176: i mesi che verranno, calcolati da contratti, rate e subappalti */
  forecast: ForecastMonth[]
  /** §174: IVA mese per mese dell'anno, per la liquidazione trimestrale */
  vatMonths: MonthVat[]
  /** oggi calcolato sul server: evita che client e server vedano date diverse */
  today: string
  /** nome del progetto per le righe che vengono da un contratto */
  projectNames: Record<string, string>
  /** nome del cliente: la riga di contratto porta il nome del servizio, non il suo */
  clientNames: Record<string, string>
}

const eur = (n: number) => formatCurrency(Math.round(n))
const pc = (n: number) => `${(n * 100).toFixed(n * 100 % 1 === 0 ? 0 : 1)}%`

export function PlClient({
  month, status, exists, setupNeeded, previous, missingClients,
  knownMonths, config, partners, profiles, revenue, costs, centers, forecast, vatMonths, today,
  projectNames, clientNames,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [resetting, setResetting] = useState(false)
  const locked = status === 'chiuso'
  const empty = revenue.length === 0 && costs.length === 0

  const t = useMemo(() => computeMonth(revenue, costs, config, partners), [revenue, costs, config, partners])

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const go = (delta: number) => router.push(`/economics?m=${shiftMonth(month, delta)}`)

  const delta = (now: number, before: number) => {
    if (!previous.exists || before === 0) return undefined
    const d = (now - before) / before
    return { text: `${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)}% sul mese scorso`, up: d >= 0 }
  }
  const missingTotal = missingClients.reduce((s, c) => s + c.mrr, 0)

  // l'IVA del trimestre in cui cade il mese guardato; se quel trimestre è già
  // versato si mostra la prossima scadenza aperta, che è quella che conta
  const vat = useMemo(() => {
    const cur = currentQuarterVat(vatMonths, month.slice(0, 10))
    if (cur && !cur.closed) return cur
    return nextDue(vatMonths, today) ?? cur
  }, [vatMonths, month, today])

  const findings = useMemo(
    () => diagnose(t, revenue, costs, config, previous.exists ? previous : undefined, vat),
    [t, revenue, costs, config, previous, vat])

  // selezione multipla sulle uscite: correggerne trenta a una a una è il motivo
  // per cui i consuntivi non si compilano
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setPicked(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const allPicked = costs.length > 0 && picked.size === costs.length
  const bulk = (action: 'paid' | 'unpaid' | 'align' | 'zero' | 'delete', ok: string) =>
    run(() => bulkCostAction(Array.from(picked), action).then(() => setPicked(new Set())), ok)

  const fc = useMemo(() => forecastTotals(forecast), [forecast])

  // incidenza costi: sotto target è efficienza, sopra è erosione di margine
  const overTarget = t.costs.variance < 0

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <EconomicsNav active="conto" month={month} />

      {/* ── testata: mese e stato ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => go(-1)} aria-label="Mese precedente"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">{monthLabel(month)}</h1>
            <button onClick={() => go(1)} aria-label="Mese successivo"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full border ${
              locked ? 'bg-surface-active border-border-strong text-text-secondary' : 'bg-success-dim border-success/40 text-success'
            }`}>{locked ? 'chiuso' : 'aperto'}</span>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Conto economico · <span className="tabular font-semibold text-text-primary">{revenue.length}</span> voci di ricavo ·{' '}
            <span className="tabular font-semibold text-text-primary">{costs.length}</span> di costo
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* da qui si passa alla lettura aggregata di più mesi */}
          <div className="flex bg-surface border border-border rounded-xl p-0.5">
            {[1, 3, 6, 12].map(n => (
              <button key={n} onClick={() => router.push(`/economics?m=${month}&n=${n}`)} aria-pressed={n === 1}
                className={`px-2.5 py-1.5 rounded-lg text-2xs font-semibold whitespace-nowrap ${
                  n === 1 ? 'bg-gold text-on-gold' : 'text-text-secondary hover:text-text-primary'
                }`}>{n === 1 ? 'Mese' : `${n} mesi`}</button>
            ))}
          </div>
          {!locked && (
            <>
              {/* struttura di costo dal mese scorso: serve solo quando il piano
                  non copre una voce, quindi sta qui e non nel pannello */}
              <button onClick={() => run(() => copyCostsFromPreviousMonth(month), 'Costi copiati dal mese precedente')}
                disabled={pending}
                title="Riprende le voci del mese precedente col preventivato. Il piano dei costi le porta già da sé."
                className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press disabled:opacity-40">
                <CopyPlus className="w-3.5 h-3.5" />Copia dal mese scorso
              </button>
              {/* svuotare un mese cancella righe scritte a mano: si chiede due volte */}
              {(revenue.length > 0 || costs.length > 0) && (
                resetting ? (
                  <span className="flex items-center gap-1.5 border border-error/40 bg-error-dim rounded-xl px-3 py-2">
                    <span className="text-2xs font-semibold text-text-primary">
                      Cancello {revenue.length} entrate e {costs.length} uscite?
                    </span>
                    <button onClick={() => { setResetting(false); run(() => resetMonth(month), 'Mese svuotato') }}
                      disabled={pending} className="text-2xs font-bold text-error hover:opacity-80">Svuota</button>
                    <button onClick={() => setResetting(false)}
                      className="text-2xs font-semibold text-text-secondary hover:text-text-primary">Annulla</button>
                  </span>
                ) : (
                  <button onClick={() => setResetting(true)} disabled={pending}
                    title="Cancella tutte le voci del mese: il mese resta, vuoto, e si rigenera da capo"
                    className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-error hover:border-error/40 press disabled:opacity-40">
                    <RotateCcw className="w-3.5 h-3.5" />Svuota mese
                  </button>
                )
              )}
            </>
          )}
          <button onClick={() => run(() => setMonthStatus(month, locked ? 'aperto' : 'chiuso'), locked ? 'Mese riaperto' : 'Mese chiuso')}
            disabled={pending}
            className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press disabled:opacity-40">
            {locked ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {locked ? 'Riapri' : 'Chiudi mese'}
          </button>
        </div>
      </div>

      {/* ── senza tabelle nessun pulsante può funzionare: dirlo, non fallire ── */}
      {setupNeeded && (
        <div className="rounded-2xl border border-warning/40 bg-warning-dim p-4">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-primary">Migration da eseguire</p>
              <p className="text-2xs text-text-secondary mt-1">
                Le tabelle del conto economico non esistono ancora: finché non esegui{' '}
                <code className="px-1 py-0.5 rounded bg-surface border border-border">supabase/migrations/163_profit_loss.sql</code>{' '}
                nel SQL Editor di Supabase, i pulsanti di questa pagina non hanno dove scrivere.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── da dove nasce il mese: quattro sorgenti, contate prima di scrivere ── */}
      {!setupNeeded && !locked && <PrepareMonth month={month} compact={!empty} />}

      {/* ── scostamento fra anagrafica di oggi e mese ── */}
      {!setupNeeded && !empty && !locked && missingClients.length > 0 && (
        <div className="rounded-2xl border border-info/40 bg-info-dim p-4 flex items-start gap-2.5 flex-wrap">
          <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">
              {missingClients.length} client{missingClients.length > 1 ? 'i' : 'e'} non {missingClients.length > 1 ? 'sono' : 'è'} in questo mese
            </p>
            <p className="text-2xs text-text-secondary mt-0.5 truncate">
              {missingClients.slice(0, 4).map(c => c.name).join(' · ')}
              {missingClients.length > 4 && ` e altri ${missingClients.length - 4}`} — {eur(missingTotal)} di imponibile
            </p>
          </div>
          <button onClick={() => run(() => generateRevenueFromClients(month), 'Clienti aggiunti')} disabled={pending}
            className="text-2xs font-semibold border border-info/50 text-info rounded-xl px-3 py-2 hover:bg-surface press disabled:opacity-40">
            Aggiungili
          </button>
        </div>
      )}

      {/* ── i quattro numeri che contano ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<TrendingUp className="w-4 h-4 text-success" />} label="Entrate maturate" value={eur(t.revenue.accrued)}
          hint={`${eur(t.revenue.collected)} incassati · ${eur(t.revenue.unpaid)} da incassare`}
          trend={delta(t.revenue.accrued, previous.accrued)} />
        <Kpi icon={<TrendingDown className="w-4 h-4 text-error" />} label="Costi effettivi" value={eur(t.costs.actual)}
          hint={`preventivato ${eur(t.costs.budget)}`}
          trend={delta(t.costs.actual, previous.costs)} trendGoodIsDown />
        <Kpi icon={<Wallet className="w-4 h-4 text-gold-text" />} label="Margine lordo" value={eur(t.margin.gross)}
          hint={t.revenue.accrued > 0 ? `${pc(t.margin.gross / t.revenue.accrued)} sulle entrate` : '—'} />
        <Kpi icon={<Target className={`w-4 h-4 ${overTarget ? 'text-error' : 'text-success'}`} />}
          label="Incidenza costi" value={pc(t.costs.ratio)}
          hint={overTarget
            ? `${eur(-t.costs.variance)} sopra il target del ${pc(config.cost_target_pct)}`
            : `${eur(t.costs.variance)} sotto il target del ${pc(config.cost_target_pct)}`}
          tone={overTarget ? 'error' : 'success'} />
      </div>

      {!setupNeeded && !empty && <PlHealth findings={findings} />}

      {/* ── dove vanno i soldi ── */}
      <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-sm font-bold text-text-primary">Ripartizione del maturato</h2>
          <span className="text-2xs text-text-tertiary">
            growth {eur(t.revenue.growth)} · digital {eur(t.revenue.digital)}
          </span>
        </div>

        <Waterfall total={t.revenue.accrued} rows={[
          { label: 'Commerciale', value: t.plan.sales, tone: 'bg-info' },
          { label: 'Erogato ai soci', value: t.plan.delivery, tone: 'bg-accent' },
          { label: 'Costi effettivi', value: t.costs.actual, tone: 'bg-error' },
          { label: 'Fondo rischio', value: t.plan.riskFund, tone: 'bg-orange' },
          { label: 'Residuo ai soci', value: t.plan.residualToPartners, tone: 'bg-gold' },
          // §185: sul digital la quota ai soci è una percentuale dell'imponibile
          { label: `Digital ai soci ${pc(config.digital_partners_pct)}`, value: t.plan.digitalPartners, tone: 'bg-gold' },
        ]} />

        <div className="grid gap-3 sm:grid-cols-3 mt-4">
          <Mini icon={<ShieldAlert className="w-3.5 h-3.5 text-orange" />} label={`Fondo rischio ${pc(config.risk_fund_pct)}`} value={eur(t.plan.riskFund)} />
          <Mini icon={<Target className="w-3.5 h-3.5 text-text-tertiary" />} label={`Target costi ${pc(config.cost_target_pct)}`} value={eur(t.costs.target)}
            extra={<span className={overTarget ? 'text-error' : 'text-success'}>{overTarget ? '−' : '+'}{eur(Math.abs(t.costs.variance))}</span>} />
          <Mini icon={<Building2 className="w-3.5 h-3.5 text-gold-text" />} label="Cassa TwoBee" value={eur(t.margin.company)}
            extra={t.plan.digitalCompany > 0 || t.plan.digitalRetained > 0 ? (
              <span className="text-text-tertiary">
                di cui {eur(t.plan.digitalCompany)} quota digital {pc(config.digital_company_pct)}
                {t.plan.digitalRetained > 0 && ` · ${eur(t.plan.digitalRetained)} margine non distribuito`}
              </span>
            ) : undefined} />
        </div>
      </section>

      {/* ── compensi ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary mb-1">
            <Users className="w-4 h-4 text-accent" />Compensi soci
          </h2>
          <p className="text-2xs text-text-tertiary mb-3">
            Erogato {pc(config.growth_delivery_pct)} sul growth in parti uguali ·{' '}
            {pc(config.digital_partners_pct)} del digital diviso fra i soci
            {t.plan.digitalShare > 0 && <> ({eur(t.plan.digitalShare)} a testa)</>}
            {t.plan.salesPool > 0 && <> · provvigione senza commerciale divisa fra i soci</>}
          </p>
          {t.perPartner.length === 0 ? (
            <Empty>Nessun socio configurato.</Empty>
          ) : (
            <div className="space-y-1.5">
              {t.perPartner.map(p => (
                <div key={p.partner.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border">
                  <span className="text-sm font-semibold text-text-primary flex-1 truncate">{p.partner.label}</span>
                  <span className="text-2xs text-text-tertiary tabular hidden sm:block">
                    erogato {eur(p.delivery)}
                    {p.digital > 0 && <> · digital {eur(p.digital)}</>}
                    {p.residual > 0 && <> · residuo {eur(p.residual)}</>}
                    {p.salesShare > 0 && <> · provvigione divisa {eur(p.salesShare)}</>}
                  </span>
                  <span className="text-sm font-bold text-text-primary tabular">{eur(p.total)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary mb-1">
            <Users className="w-4 h-4 text-info" />Provvigioni commerciali
          </h2>
          <p className="text-2xs text-text-tertiary mb-3">
            {pc(config.growth_sales_pct)} sul growth · {pc(config.digital_sales_pct)} sul digital
          </p>
          {t.plan.salesPool > 0 && (
            <div className="mb-2 px-3 py-2.5 rounded-xl border border-gold bg-gold-dim">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-primary flex-1">Da lead generation</span>
                <span className="text-sm font-bold text-text-primary tabular">{eur(t.plan.salesPool)}</span>
              </div>
              <p className="text-2xs text-text-tertiary mt-0.5">
                Nessun commerciale, né sulla riga né in anagrafica: {eur(t.plan.poolShare)} a testa ai soci
              </p>
            </div>
          )}
          {t.salesByOwner.length === 0 && t.plan.salesPool === 0 ? (
            <Empty>Nessuna provvigione: assegna un commerciale alle voci di ricavo.</Empty>
          ) : (
            <div className="space-y-1.5">
              {t.salesByOwner.map(s => (
                <div key={s.label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border">
                  <span className="text-sm text-text-primary flex-1 truncate">
                    {s.label}
                    {/* chi non ha un account nel tool esiste solo in anagrafica:
                        dirlo evita di cercarlo fra i profili e non trovarlo */}
                    {s.fromRegistry && (
                      <span className="ml-1.5 text-2xs text-text-tertiary">dall&apos;anagrafica</span>
                    )}
                  </span>
                  <span className="text-sm font-bold text-text-primary tabular">{eur(s.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── previsionale: quello che è già deciso ── */}
      {forecast.length > 0 && fc.revenue > 0 && (
        <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <CalendarRange className="w-4 h-4 text-accent" />I prossimi sei mesi
              </h2>
              <p className="text-2xs text-text-tertiary mt-0.5">
                Non è una previsione: è quello che i contratti firmati e i subappalti dicono già oggi. IVA esclusa
              </p>
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold tabular ${fc.margin < 0 ? 'text-error' : 'text-success'}`}>
                {eur(fc.margin)}
              </div>
              <div className="text-2xs text-text-tertiary">
                {eur(fc.revenue)} − {eur(fc.cost)} di costi · {pc(fc.marginPct)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs text-text-tertiary uppercase tracking-wider">
                  <th className="text-left font-semibold px-4 py-2">Mese</th>
                  <th className="text-right font-semibold px-2 py-2">Entrate</th>
                  <th className="text-right font-semibold px-2 py-2">Costi interni</th>
                  <th className="text-right font-semibold px-2 py-2">Subappalti</th>
                  <th className="text-right font-semibold px-2 py-2">Margine</th>
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody>
                {forecast.map(f => (
                  <tr key={f.month} className="border-t border-border/60 hover:bg-surface-hover">
                    <td className="px-4 py-2">
                      <span className="text-2xs font-semibold text-text-primary">{monthLabel(f.month)}</span>
                      <span className="block text-2xs text-text-tertiary">
                        {f.revenueLines} entrat{f.revenueLines === 1 ? 'a' : 'e'} · {f.costLines} uscit{f.costLines === 1 ? 'a' : 'e'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-2xs tabular text-text-primary">{eur(f.revenue)}</td>
                    <td className="px-2 py-2 text-right text-2xs tabular text-text-secondary">{eur(f.internalCost)}</td>
                    <td className="px-2 py-2 text-right text-2xs tabular text-orange">
                      {f.subcontractCost > 0 ? eur(f.subcontractCost) : '—'}
                    </td>
                    <td className={`px-2 py-2 text-right text-2xs font-bold tabular ${f.margin < 0 ? 'text-error' : 'text-text-primary'}`}>
                      {eur(f.margin)}
                      <span className="block text-2xs font-normal text-text-tertiary">{pc(f.marginPct)}</span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {f.open ? (
                        <Link href={`/economics?m=${f.month}`}
                          className="text-2xs font-semibold text-text-tertiary hover:text-gold-text">aperto →</Link>
                      ) : (
                        <button onClick={() => run(() => openMonth(f.month), `${monthLabel(f.month)} aperto`)}
                          disabled={pending}
                          className="text-2xs font-semibold border border-border rounded-lg px-2 py-1 text-gold-text hover:bg-surface-hover press disabled:opacity-40">
                          Apri il mese
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="flex items-start gap-2 text-2xs text-text-tertiary px-5 py-3 border-t border-border">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            «Apri il mese» crea le righe vere: da lì in poi metti le spunte su fattura emessa, incassato e pagato.
            {fc.negative > 0 && (
              <span className="text-warning font-semibold"> {fc.negative} di questi mesi chiude in perdita.</span>
            )}
          </p>
        </section>
      )}

      {/* ── IVA: quella che incassi non è tua ── */}
      {vat && (
        <section className={`bg-surface border rounded-2xl p-5 shadow-soft ${
          vat.daysLeft <= 15 && vat.toPay > 0 ? 'border-warning/50' : 'border-border'
        }`}>
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <Landmark className="w-4 h-4 text-info" />IVA da mettere da parte
              </h2>
              <p className="text-2xs text-text-tertiary mt-0.5">
                {vat.label} · liquidazione trimestrale
                {vat.annual && ' — si chiude con la dichiarazione annuale'}
              </p>
            </div>
            <div className="text-right">
              <div className={`text-xl font-bold tabular ${vat.toPay > 0 ? 'text-text-primary' : 'text-success'}`}>
                {vat.toPay > 0 ? eur(vat.toPay) : vat.deferred ? 'sotto il minimo' : vat.balance < 0 ? 'a credito' : 'niente da versare'}
              </div>
              <div className={`text-2xs font-semibold ${
                vat.daysLeft < 0 ? 'text-error' : vat.daysLeft <= 15 ? 'text-warning' : 'text-text-tertiary'
              }`}>
                {vat.daysLeft < 0
                  ? `scaduta da ${-vat.daysLeft} giorni`
                  : `entro il ${new Date(vat.deadline + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} · fra ${vat.daysLeft} giorni`}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <VatCell label="IVA sulle vendite" value={eur(vat.debit)} hint="incassata dai clienti" />
            <VatCell label="IVA sugli acquisti" value={eur(vat.credit)} hint="pagata ai fornitori, si scomputa" />
            <VatCell
              label={vat.carried !== 0 ? (vat.carried > 0 ? 'Credito riportato' : 'Debito rinviato') : 'Saldo del trimestre'}
              value={eur(vat.carried !== 0 ? Math.abs(vat.carried) : Math.abs(vat.balance))}
              hint={vat.carried > 0 ? 'dal trimestre precedente, si scomputa'
                : vat.carried < 0 ? 'dal trimestre precedente, era sotto il minimo'
                : vat.balance < 0 ? 'a credito, va sul prossimo' : 'debito verso lo Stato'} />
            <VatCell label="Interessi 1%" value={vat.interest > 0 ? eur(vat.interest) : '—'}
              hint={vat.annual ? 'non dovuti sul quarto trimestre' : 'costo dell\'opzione trimestrale'} />
          </div>

          {vat.deferred && (
            <p className="flex items-start gap-2 text-2xs text-text-secondary mt-3 pt-3 border-t border-border">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-info" />
              Il saldo è sotto i 25,82 €: il versamento non si fa e l&apos;importo confluisce nel trimestre
              successivo. Non è una scadenza da segnare.
            </p>
          )}

          {vat.toPay > 0 && (
            <p className="flex items-start gap-2 text-2xs text-text-secondary mt-3 pt-3 border-t border-border">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-warning" />
              Questi {eur(vat.toPay)} sono già incassati e non sono tuoi: tienili da parte.
              Il margine lordo qui sopra li conta come cassa, ed è il modo più comune in cui
              un&apos;azienda in utile resta senza soldi. Date ordinarie: verifica proroghe col commercialista.
            </p>
          )}
        </section>
      )}

      {/* ── entrate ── */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
          <h2 className="text-sm font-bold text-text-primary">Entrate</h2>
          <span className="text-2xs text-text-tertiary tabular">
            imponibile {eur(t.revenue.accrued)} · IVA {eur(t.revenue.vat)} · totale {eur(t.revenue.grossWithVat)}
          </span>
        </div>

        {revenue.length === 0 ? (
          <div className="p-5"><Empty>
            Nessuna entrata. «Prepara il mese» porta qui i canoni e le rate dei contratti che cadono adesso.
          </Empty></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs text-text-tertiary uppercase tracking-wider">
                  <th className="text-left font-semibold px-4 py-2">Cliente e progetto</th>
                  <th className="text-right font-semibold px-2 py-2">Piano</th>
                  <th className="text-right font-semibold px-2 py-2">Imponibile</th>
                  <th className="text-left font-semibold px-2 py-2">Tipo</th>
                  <th className="text-left font-semibold px-2 py-2">Commerciale</th>
                  <th className="text-center font-semibold px-2 py-2">Fatt.</th>
                  <th className="text-center font-semibold px-2 py-2">Pag.</th>
                  <th className="text-right font-semibold px-2 py-2">Comm.</th>
                  <th className="text-right font-semibold px-2 py-2">Erogato</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {t.lines.map(({ line, s }) => (
                  <tr key={line.id} className="border-t border-border/60 hover:bg-surface-hover">
                    <td className="px-4 py-1.5">
                      <Text value={line.label} disabled={locked}
                        onSave={v => run(() => updateRevenueLine(line.id, { label: v }))} />
                      <Origin line={line} projectNames={projectNames} clientNames={clientNames} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Num value={line.plan_amount} disabled={locked}
                        onSave={v => run(() => updateRevenueLine(line.id, { plan_amount: v }))} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Num value={line.amount_net} disabled={locked} strong
                        onSave={v => run(() => updateRevenueLine(line.id, { amount_net: v }))} />
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={line.kind} disabled={locked} aria-label="Tipologia"
                        onChange={e => run(() => updateRevenueLine(line.id, { kind: e.target.value as 'growth' | 'digital' }))}
                        className="bg-background border border-border rounded-lg px-1.5 py-1 text-2xs text-text-secondary">
                        <option value="growth">Growth</option>
                        <option value="digital">Digital</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      {/* §185 — chi ha portato il cliente. La riga vince, ma se è
                          vuota si legge il nome dell'anagrafica invece di un
                          trattino: spesso è un segnalatore che nel tool non c'è.
                          Se non c'è nemmeno lì, il 6% si divide fra i soci. */}
                      <Owner line={line} profiles={profiles} locked={locked}
                        onPick={id => run(() => updateRevenueLine(line.id, {
                          sales_owner_id: id || null,
                          sales_owner: profiles.find(p => p.id === id)?.full_name ?? null,
                        }))} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Check on={line.invoice_sent} disabled={locked} label="Fattura inviata"
                        onToggle={() => run(() => updateRevenueLine(line.id, { invoice_sent: !line.invoice_sent }))} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Check on={line.paid} disabled={locked} label="Pagato"
                        onToggle={() => run(() => updateRevenueLine(line.id, { paid: !line.paid }))} />
                    </td>
                    <td className="px-2 py-1.5 text-right text-2xs text-info tabular">{eur(s.sales)}</td>
                    <td className="px-2 py-1.5 text-right text-2xs text-accent tabular">{s.delivery ? eur(s.delivery) : '—'}</td>
                    <td className="px-2 py-1.5">
                      {!locked && (
                        <button onClick={() => run(() => deleteRevenueLine(line.id), 'Voce eliminata')}
                          aria-label={`Elimina ${line.label}`}
                          className="text-text-tertiary hover:text-error"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!locked && (
          <div className="px-4 py-3 border-t border-border">
            <button onClick={() => run(() => addRevenueLine(month), 'Voce aggiunta')} disabled={pending}
              className="flex items-center gap-1.5 text-2xs font-semibold text-gold-text hover:opacity-80">
              <Plus className="w-3.5 h-3.5" />Voce di ricavo
            </button>
          </div>
        )}
      </section>

      {/* ── uscite ── */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
          <h2 className="text-sm font-bold text-text-primary">Uscite</h2>
          <span className="text-2xs text-text-tertiary tabular">
            fissi {eur(t.costs.fixed)} · variabili {eur(t.costs.variable)} · con IVA {eur(t.costs.gross)}
          </span>
        </div>

        {!locked && picked.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-5 py-2.5 bg-gold-dim border-b border-gold/30">
            <span className="text-2xs font-semibold text-text-primary">
              {picked.size} selezionat{picked.size > 1 ? 'e' : 'a'}
            </span>
            <button onClick={() => bulk('align', 'Consuntivo allineato al preventivato')} disabled={pending}
              className={bulkBtn}>Allinea al preventivato</button>
            <button onClick={() => bulk('paid', 'Segnate come pagate')} disabled={pending} className={bulkBtn}>Segna pagate</button>
            <button onClick={() => bulk('unpaid', 'Segnate come non pagate')} disabled={pending} className={bulkBtn}>Non pagate</button>
            <button onClick={() => bulk('zero', 'Consuntivo azzerato')} disabled={pending} className={bulkBtn}>Azzera spesa</button>
            <button onClick={() => { if (confirm(`Eliminare ${picked.size} voci?`)) bulk('delete', 'Voci eliminate') }}
              disabled={pending} className="text-2xs font-semibold text-error border border-error/40 rounded-lg px-2.5 py-1.5 hover:bg-surface press">
              Elimina
            </button>
            <button onClick={() => setPicked(new Set())} className="ml-auto text-2xs font-semibold text-text-secondary hover:text-text-primary">
              Deseleziona
            </button>
          </div>
        )}

        {costs.length === 0 ? (
          <div className="p-5"><Empty>
            Nessuna uscita. «Prepara il mese» porta qui il piano dei costi, i subappalti e il costo dell&apos;organico.
          </Empty></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs text-text-tertiary uppercase tracking-wider">
                  {!locked && (
                    <th className="w-10 px-2 py-2">
                      <Check on={allPicked} label="Seleziona tutte"
                        onToggle={() => setPicked(allPicked ? new Set() : new Set(costs.map(c => c.id)))} />
                    </th>
                  )}
                  <th className="text-left font-semibold px-4 py-2">Categoria</th>
                  <th className="text-left font-semibold px-2 py-2">Voce</th>
                  <th className="text-left font-semibold px-2 py-2">Area</th>
                  <th className="text-center font-semibold px-2 py-2">Tipo</th>
                  <th className="text-right font-semibold px-2 py-2">Preventivato</th>
                  <th className="text-right font-semibold px-2 py-2">Effettivo</th>
                  <th className="text-center font-semibold px-2 py-2">Pagato</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {costs.map(c => (
                  <tr key={c.id} className={`border-t border-border/60 hover:bg-surface-hover ${picked.has(c.id) ? 'bg-gold-dim' : ''}`}>
                    {!locked && (
                      <td className="px-2 py-1.5">
                        <Check on={picked.has(c.id)} label={`Seleziona ${c.label}`} onToggle={() => toggle(c.id)} />
                      </td>
                    )}
                    <td className="px-4 py-1.5">
                      <Text value={c.category} disabled={locked}
                        onSave={v => run(() => updateCostLine(c.id, { category: v }))} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Text value={c.label} disabled={locked}
                        onSave={v => run(() => updateCostLine(c.id, { label: v }))} />
                    </td>
                    {/* l'area dice da quale budget esce questa spesa: senza, il
                        piano dei costi non può misurare niente */}
                    <td className="px-2 py-1.5">
                      <select value={c.center_id ?? ''} disabled={locked} aria-label={`Area di ${c.label}`}
                        onChange={e => run(() => setLineCenter(c.id, e.target.value || null))}
                        className={`bg-background border rounded-lg px-1.5 py-1 text-2xs max-w-[130px] ${
                          c.center_id ? 'border-border text-text-secondary' : 'border-warning/40 text-warning'
                        }`}>
                        <option value="">senza area</option>
                        {centers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button disabled={locked}
                        onClick={() => run(() => updateCostLine(c.id, { cost_type: c.cost_type === 'F' ? 'V' : 'F' }))}
                        title={c.cost_type === 'F' ? 'Costo fisso' : 'Costo variabile'}
                        className="text-2xs font-bold text-text-secondary hover:text-text-primary">{c.cost_type}</button>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Num value={c.budget} disabled={locked}
                        onSave={v => run(() => updateCostLine(c.id, { budget: v }))} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Num value={c.actual} disabled={locked} strong
                        onSave={v => run(() => updateCostLine(c.id, { actual: v }))} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Check on={c.paid} disabled={locked} label="Pagato"
                        onToggle={() => run(() => updateCostLine(c.id, { paid: !c.paid }))} />
                    </td>
                    <td className="px-2 py-1.5">
                      {!locked && (
                        <button onClick={() => run(() => deleteCostLine(c.id), 'Voce eliminata')}
                          aria-label={`Elimina ${c.label}`}
                          className="text-text-tertiary hover:text-error"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!locked && (
          <div className="px-4 py-3 border-t border-border">
            <button onClick={() => run(() => addCostLine(month), 'Voce aggiunta')} disabled={pending}
              className="flex items-center gap-1.5 text-2xs font-semibold text-gold-text hover:opacity-80">
              <Plus className="w-3.5 h-3.5" />Voce di costo
            </button>
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-2xs text-text-tertiary">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Le percentuali si applicano all&apos;imponibile. Il compenso matura sul fatturato del mese, non
        sull&apos;incassato: un pagamento in ritardo non azzera il compenso di chi ha già lavorato.
        Il {pc(config.cost_target_pct)} è un target: se i costi reali sono più bassi le quote non cambiano,
        la differenza resta in cassa TwoBee.
        {knownMonths.length > 0 && ` · Mesi registrati: ${knownMonths.length}`}
        {!exists && ' · Questo mese non è ancora stato creato: la prima modifica lo crea.'}
      </p>
    </div>
  )
}

// ── pezzi ────────────────────────────────────────────────────────────────────

function Kpi({ icon, label, value, hint, tone, trend, trendGoodIsDown }: {
  icon: React.ReactNode; label: string; value: string; hint?: string
  tone?: 'success' | 'error'
  trend?: { text: string; up: boolean }
  /** sui costi crescere è male: il colore segue il significato, non la direzione */
  trendGoodIsDown?: boolean
}) {
  const good = trend ? (trendGoodIsDown ? !trend.up : trend.up) : false
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-center gap-2 mb-1.5">{icon}
        <span className="text-2xs font-semibold text-text-secondary uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold text-text-primary tabular">{value}</div>
      {hint && <div className={`text-2xs mt-0.5 ${tone === 'error' ? 'text-error' : tone === 'success' ? 'text-success' : 'text-text-tertiary'}`}>{hint}</div>}
      {trend && (
        <div className={`text-2xs mt-0.5 font-semibold ${good ? 'text-success' : 'text-error'}`}>{trend.text}</div>
      )}
    </div>
  )
}

function Mini({ icon, label, value, extra }: { icon: React.ReactNode; label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border">
      {icon}
      <span className="text-2xs text-text-secondary flex-1 truncate">{label}</span>
      <span className="text-sm font-semibold text-text-primary tabular">{value}</span>
      {extra && <span className="text-2xs font-semibold tabular">{extra}</span>}
    </div>
  )
}

/** Una barra sola: le quote si leggono come parti di ciò che è entrato. */
function Waterfall({ total, rows }: { total: number; rows: { label: string; value: number; tone: string }[] }) {
  const shown = rows.filter(r => r.value > 0)
  const used = shown.reduce((s, r) => s + r.value, 0)
  const rest = Math.max(0, total - used)
  const w = (v: number) => (total > 0 ? `${(v / total) * 100}%` : '0%')
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-surface-active gap-px">
        {shown.map(r => <div key={r.label} className={r.tone} style={{ width: w(r.value) }} title={`${r.label}: ${eur(r.value)}`} />)}
        {rest > 0 && <div className="bg-success" style={{ width: w(rest) }} title={`Resta: ${eur(rest)}`} />}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
        {shown.map(r => (
          <span key={r.label} className="flex items-center gap-1.5 text-2xs text-text-secondary">
            <span className={`w-2 h-2 rounded-sm ${r.tone}`} aria-hidden />
            {r.label} <span className="tabular font-semibold text-text-primary">{eur(r.value)}</span>
            {total > 0 && <span className="text-text-tertiary">({pc(r.value / total)})</span>}
          </span>
        ))}
        {rest > 0 && (
          <span className="flex items-center gap-1.5 text-2xs text-text-secondary">
            <span className="w-2 h-2 rounded-sm bg-success" aria-hidden />
            Resta in cassa <span className="tabular font-semibold text-text-primary">{eur(rest)}</span>
          </span>
        )}
      </div>
    </div>
  )
}

function Text({ value, onSave, disabled }: { value: string; onSave: (v: string) => void; disabled?: boolean }) {
  const [v, setV] = useState(value)
  return (
    <input value={v} disabled={disabled} aria-label="Descrizione"
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className="w-full min-w-[120px] bg-transparent text-sm text-text-primary border-b border-transparent focus:border-border-interactive outline-none disabled:text-text-secondary" />
  )
}

function Num({ value, onSave, disabled, strong }: {
  value: number; onSave: (v: number) => void; disabled?: boolean; strong?: boolean
}) {
  const [v, setV] = useState(String(value))
  return (
    <input value={v} disabled={disabled} inputMode="decimal" aria-label="Importo"
      onChange={e => setV(e.target.value)}
      onBlur={() => { const n = Number(v.replace(',', '.')); if (!Number.isNaN(n) && n !== value) onSave(n); else setV(String(value)) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={`w-20 bg-transparent text-right tabular text-sm border-b border-transparent focus:border-border-interactive outline-none ${
        strong ? 'text-text-primary font-semibold' : 'text-text-secondary'
      }`} />
  )
}

/**
 * Da dove viene la riga. Una riga coperta da un contratto porta al progetto;
 * una ferma all'MRR d'anagrafica lo dice, perché è lì che manca il contratto.
 */
function Origin({ line, projectNames, clientNames }: {
  line: RevenueLine
  projectNames: Record<string, string>
  clientNames: Record<string, string>
}) {
  // il nome del cliente non sta più nella label della riga di contratto: senza
  // questo, in tabella si leggerebbe il servizio senza sapere di chi è
  const client = line.client_id ? clientNames[line.client_id] : null

  if (line.origin === 'contratto' && line.project_id) {
    return (
      <Link href={`/progetti/${line.project_id}?tab=economics`}
        className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text w-fit">
        <Briefcase className="w-3 h-3 shrink-0" />
        <span className="truncate max-w-[280px]">
          {client ? `${client} · ` : ''}{projectNames[line.project_id] ?? 'Progetto'}
        </span>
      </Link>
    )
  }
  if (line.origin === 'contratto' && client) {
    return <span className="text-2xs text-text-tertiary truncate max-w-[280px] block">{client}</span>
  }
  if (line.origin === 'anagrafica') {
    return (
      <span className="flex items-center gap-1 text-2xs text-warning w-fit"
        title="Viene dall'MRR in anagrafica: crea il contratto nel progetto per agganciarla">
        <AlertTriangle className="w-3 h-3 shrink-0" />senza contratto
      </span>
    )
  }
  return <span className="text-2xs text-text-tertiary">riga manuale</span>
}

function VatCell({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-2xs font-semibold text-text-secondary uppercase tracking-wider truncate">{label}</div>
      <div className="text-sm font-bold text-text-primary tabular mt-0.5">{value}</div>
      <div className="text-2xs text-text-tertiary mt-0.5">{hint}</div>
    </div>
  )
}

const bulkBtn = 'text-2xs font-semibold border border-border rounded-lg px-2.5 py-1.5 text-text-secondary hover:text-text-primary hover:bg-surface press disabled:opacity-40'

/**
 * Bersaglio da 32px con la spunta da 20: sotto i 24px sul telefono si sbaglia,
 * e queste si premono decine di volte a fine mese.
 */
function Check({ on, onToggle, disabled, label }: { on: boolean; onToggle: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled} role="checkbox" aria-checked={on}
      aria-label={label} title={label}
      className="w-8 h-8 grid place-items-center rounded-lg hover:bg-surface-active transition-colors disabled:opacity-40 no-tap-highlight press mx-auto">
      <span className={`w-5 h-5 rounded-md border-2 grid place-items-center transition-colors ${
        on ? 'bg-success border-success text-on-gold' : 'border-border-strong hover:border-border-interactive'
      }`}>
        {on && (
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" aria-hidden>
            <path d="M3.5 8.5l3 3 6-7" stroke="var(--color-surface)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </button>
  )
}

/**
 * Il commerciale di una riga di ricavo.
 *
 * Tre stati e tutti e tre vanno detti: assegnato sulla riga (la tendina lo
 * mostra), preso dall'anagrafica del cliente (nome in chiaro, perché spesso è un
 * segnalatore che non ha un account e nella tendina non comparirebbe), o nessuno
 * — e allora la provvigione non resta in cassa, si divide fra i soci.
 */
function Owner({ line, profiles, locked, onPick }: {
  line: RevenueLine
  profiles: { id: string; full_name: string }[]
  locked: boolean
  onPick: (id: string) => void
}) {
  const o = ownerOf(line)
  return (
    <div className="min-w-[110px]">
      <select value={line.sales_owner_id ?? ''} disabled={locked} aria-label="Commerciale"
        onChange={e => onPick(e.target.value)}
        className="w-full bg-background border border-border rounded-lg px-1.5 py-1 text-2xs text-text-secondary max-w-[130px]">
        <option value="">{o.source === 'anagrafica' ? `${o.name} · anagrafica` : '—'}</option>
        {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
      {o.source === null && (
        <span className="block text-2xs text-gold-text mt-0.5">quota ai soci</span>
      )}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center py-8 border border-dashed border-border rounded-xl">
      <p className="text-2xs text-text-tertiary">{children}</p>
    </div>
  )
}
