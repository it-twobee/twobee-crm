'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, CopyPlus, Lock, LockOpen,
  TrendingUp, TrendingDown, Wallet, Target, ShieldAlert, Users, Building2, Info,
  Briefcase, AlertTriangle, RotateCcw, Landmark, CalendarRange, Receipt, Loader2, Truck,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  computeMonth, monthLabel, shiftMonth, pct, ownerOf,
  type PlConfig, type RevenueLine, type CostLine, type Partner, type QuotaRow,
  type PlTotals,
} from '@/lib/pl'
import {
  generateRevenueFromClients, copyCostsFromPreviousMonth, setMonthStatus, resetMonth,
  addRevenueLine, updateRevenueLine, deleteRevenueLine,
  addCostLine, updateCostLine, deleteCostLine, bulkCostAction,
} from '@/app/actions/pl'
import { setLineCenter, syncBudgetsFromPlan } from '@/app/actions/costs'
import {
  subcontractViews, bySupplierView, byProjectMargin, subcontractFindings, type SubItem,
} from '@/lib/subcontracts'
import { registerPartnerInvoice } from '@/app/actions/bank'
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
  /** §192 — progetto → cliente: il subappalto sta sul progetto, il margine è del cliente */
  clientOfProject?: Record<string, string>
  /** §192 — le sorgenti dei subappalti: la voce di piano che vive sul progetto */
  subItems?: SubItem[]
}

const eur = (n: number) => formatCurrency(Math.round(n))
/** Con i centesimi: su una riga di costo 2.672,22 non è 2.672 */
const eur2 = (n: number) =>
  Number.isInteger(n) ? formatCurrency(n)
    : `${n.toLocaleString('it-IT', {
        minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true,
      })} €`
const pc = (n: number) => `${(n * 100).toFixed(n * 100 % 1 === 0 ? 0 : 1)}%`
/** Due decimali dove servono: il 9,33% di una quota divisa non si arrotonda a 9%. */
const pc1 = (n: number) => `${(n * 100).toFixed(2).replace(/\.00$/, '').replace('.', ',')}%`

export function PlClient({
  month, status, exists, setupNeeded, previous, missingClients,
  knownMonths, config, partners, profiles, revenue, costs, centers, forecast, vatMonths, today,
  projectNames, clientNames, clientOfProject = {}, subItems = [],
}: Props) {
  const router = useRouter()
  /* Quale compenso è aperto: un numero che non si può aprire si prende per fede,
     e un piano compensi preso per fede è un piano che nessuno controlla. */
  const [openQuota, setOpenQuota] = useState<string | null>(null)
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
  /* Gli id si passano espliciti e non si leggono da `picked`: `setPicked` è
     asincrono, e un pulsante che seleziona e agisce nello stesso click agirebbe
     sulla selezione di prima. */
  const bulk = (action: 'paid' | 'unpaid' | 'align' | 'zero' | 'delete', ok: string, ids?: string[]) =>
    run(() => bulkCostAction(ids ?? Array.from(picked), action).then(() => setPicked(new Set())), ok)

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
        {/* §188: «effettivi» è il totale uscito; il target riguarda la struttura,
            e i subappalti si dicono a parte perché sono già nel margine del progetto. */}
        <Kpi icon={<TrendingDown className="w-4 h-4 text-error" />} label="Costi effettivi" value={eur(t.costs.actual)}
          hint={`preventivato ${eur(t.costs.budget)}`}
          trend={delta(t.costs.actual, previous.costs)} trendGoodIsDown />
        <Kpi icon={<Wallet className="w-4 h-4 text-gold-text" />} label="Margine lordo" value={eur(t.margin.gross)}
          hint={t.revenue.accrued > 0 ? `${pc(t.margin.gross / t.revenue.accrued)} sulle entrate` : '—'} />
        <Kpi icon={<Target className={`w-4 h-4 ${overTarget ? 'text-error' : 'text-success'}`} />}
          label="Incidenza costi" value={pc(t.costs.ratio)}
          hint={(overTarget
            ? `${eur(-t.costs.variance)} sopra il target del ${pc(config.cost_target_pct)}`
            : `${eur(t.costs.variance)} sotto il target del ${pc(config.cost_target_pct)}`)
            + (t.costs.external > 0 ? ` · ${eur(t.costs.external)} di subappalti fuori dal target` : '')}
          tone={overTarget ? 'error' : 'success'} />
      </div>

      {!setupNeeded && !empty && <PlHealth findings={findings} />}

      {/* ── dove vanno i soldi ── */}
      <Distribution t={t} config={config} />

      {/* ── compensi ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary mb-1">
            <Users className="w-4 h-4 text-accent" />Compensi soci
          </h2>
          <p className="text-2xs text-text-tertiary mb-3">
            Erogato {pc(config.growth_delivery_pct)} sul growth in parti uguali ·{' '}
            {pc(config.digital_partner_pct)} del margine digital <strong className="text-text-secondary">a ciascuno</strong>
            {t.plan.digitalShare > 0 && <> ({eur(t.plan.digitalShare)} a testa questo mese)</>}
            {t.plan.digitalRiskFund > 0 && (
              <> · su alcune righe {pc(config.digital_risk_cut_pct)} a testa è andato al fondo rischio</>
            )}
            {t.plan.salesPool > 0 && <> · provvigione senza commerciale divisa fra i soci</>}
          </p>
          {t.plan.digitalMargin > 0 && (
            <p className="text-2xs text-text-tertiary mb-3 pb-2 border-b border-border">
              Margine digital {eur(t.plan.digitalMargin)}
              {t.plan.digitalExternal > 0 && <> — {eur(t.plan.digitalExternal)} di subappalti già tolti</>}:
              è la base della spartizione, e si divide per intero.
              {/* Un centesimo di arrotondamento su tre soci al 28% non è un
                  problema di piano: l'avviso scatta da un euro in su. */}
              {Math.abs(t.plan.digitalRetained) >= 1 && (
                <strong className="text-warning">
                  {' '}Restano {eur(t.plan.digitalRetained)} non assegnati: con {t.perPartner.length} soci
                  al {pc(config.digital_partner_pct)} le quote non fanno il 100%.
                </strong>
              )}
            </p>
          )}
          {t.perPartner.length === 0 ? (
            <Empty>Nessun socio configurato.</Empty>
          ) : (
            <div className="space-y-1.5">
              {t.perPartner.map(p => (
                <div key={p.partner.id} className="rounded-xl border border-border overflow-hidden">
                  <button onClick={() => setOpenQuota(openQuota === p.partner.id ? null : p.partner.id)}
                    aria-expanded={openQuota === p.partner.id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors">
                    <span className="text-sm font-semibold text-text-primary flex-1 truncate">{p.partner.label}</span>
                    <span className="text-2xs text-text-tertiary tabular hidden sm:block">
                      erogato {eur(p.delivery)}
                      {p.digital > 0 && <> · digital {eur(p.digital)}</>}
                      {p.residual > 0 && <> · residuo {eur(p.residual)}</>}
                      {p.salesShare > 0 && <> · provvigione divisa {eur(p.salesShare)}</>}
                    </span>
                    {/* §191 — se ha già speso col sottoconto, il numero grosso è
                        quello che gli resta in denaro: versare il totale
                        significherebbe pagare due volte lo stesso compenso. */}
                    {p.spent > 0 ? (
                      <span className="text-right shrink-0">
                        <span className="block text-sm font-bold text-text-primary tabular">{eur(p.cash)}</span>
                        <span className="block text-2xs text-text-tertiary tabular">
                          {eur(p.total)} − {eur(p.spent)} già spesi
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-text-primary tabular">{eur(p.total)}</span>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary shrink-0 transition-transform ${
                      openQuota === p.partner.id ? 'rotate-180' : ''}`} />
                  </button>
                  {openQuota === p.partner.id && (
                    <>
                      <QuotaDetail rows={p.rows} total={p.total} config={config}
                        clientNames={clientNames} projectNames={projectNames} />
                      <PayoutPanel p={p} month={month} />
                    </>
                  )}
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
            <div className="mb-2 rounded-xl border border-gold bg-gold-dim overflow-hidden">
              <button onClick={() => setOpenQuota(openQuota === 'pool' ? null : 'pool')}
                aria-expanded={openQuota === 'pool'}
                className="w-full px-3 py-2.5 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-primary flex-1">Da lead generation</span>
                  <span className="text-sm font-bold text-text-primary tabular">{eur(t.plan.salesPool)}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary shrink-0 transition-transform ${
                    openQuota === 'pool' ? 'rotate-180' : ''}`} />
                </div>
                <p className="text-2xs text-text-tertiary mt-0.5">
                  Nessun commerciale, né sulla riga né in anagrafica: {eur(t.plan.poolShare)} a testa ai soci
                </p>
              </button>
              {openQuota === 'pool' && (
                <QuotaDetail rows={t.plan.poolRows} total={t.plan.salesPool} config={config}
                  clientNames={clientNames} projectNames={projectNames}
                  note="Sono i clienti senza commerciale: assegnarne uno in anagrafica sposta la provvigione da qui a lui." />
              )}
            </div>
          )}
          {t.salesByOwner.length === 0 && t.plan.salesPool === 0 ? (
            <Empty>Nessuna provvigione: assegna un commerciale alle voci di ricavo.</Empty>
          ) : (
            <div className="space-y-1.5">
              {t.salesByOwner.map(s => (
                <div key={s.label} className="rounded-xl border border-border overflow-hidden">
                  <button onClick={() => setOpenQuota(openQuota === `o:${s.label}` ? null : `o:${s.label}`)}
                    aria-expanded={openQuota === `o:${s.label}`}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors">
                    <span className="text-sm text-text-primary flex-1 truncate">
                      {s.label}
                      {/* chi non ha un account nel tool esiste solo in anagrafica:
                          dirlo evita di cercarlo fra i profili e non trovarlo */}
                      {s.fromRegistry && (
                        <span className="ml-1.5 text-2xs text-text-tertiary">dall&apos;anagrafica</span>
                      )}
                    </span>
                    <span className="text-sm font-bold text-text-primary tabular">{eur(s.amount)}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary shrink-0 transition-transform ${
                      openQuota === `o:${s.label}` ? 'rotate-180' : ''}`} />
                  </button>
                  {openQuota === `o:${s.label}` && (
                    <QuotaDetail rows={s.rows} total={s.amount} config={config}
                      clientNames={clientNames} projectNames={projectNames} />
                  )}
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
            {t.plan.passThrough > 0 && (
              <span className="text-info"> · di cui {eur(t.plan.passThrough)} partite di giro</span>
            )}
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
                  <th className="text-right font-semibold px-2 py-2">Ai soci</th>
                  <th className="text-center font-semibold px-2 py-2">Rischio</th>
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
                      <Num value={line.plan_amount} disabled={locked || line.origin === 'contratto'}
                        money={line.origin === 'contratto'}
                        onSave={v => run(() => updateRevenueLine(line.id, { plan_amount: v }))} />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {/* §194 — l'importo di una riga da contratto lo scrive il contratto.
                          Cambiarlo qui creerebbe un secondo numero per la stessa rata, e
                          da quel momento nessuno dei due sarebbe affidabile: si corregge
                          nell'economics del cliente, che è la sezione madre. */}
                      <Num value={line.amount_net} disabled={locked || line.origin === 'contratto'}
                        strong money={line.origin === 'contratto'}
                        onSave={v => run(() => updateRevenueLine(line.id, { amount_net: v }))} />
                      {/* §188 — anticipo che torna al cliente: si vede sulla riga,
                          perché è la ragione per cui su questo importo non c'è
                          nessuna quota. Si accende e si spegne da qui. */}
                      <button onClick={() => run(() => updateRevenueLine(line.id, { pass_through: !line.pass_through }))}
                        disabled={locked} aria-pressed={!!line.pass_through}
                        title={line.pass_through
                          ? 'Partita di giro: fatturata e con IVA, esclusa dalle quote del piano compensi'
                          : 'Segna come partita di giro (budget ads anticipato per il cliente)'}
                        className={`block ml-auto mt-0.5 text-2xs font-semibold px-1.5 py-0.5 rounded border press disabled:opacity-40 ${
                          line.pass_through
                            ? 'border-info/40 bg-info/15 text-info'
                            : 'border-transparent text-text-tertiary hover:border-border'}`}>
                        {line.pass_through ? 'partita di giro' : 'giro?'}
                      </button>
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
                          Se non c'è nemmeno lì, il 6% si divide fra i soci.
                          §196 — in sola lettura: si cambia in anagrafica, che è
                          l'unico posto dove il commerciale di un cliente esiste. */}
                      <Owner line={line} clientNames={clientNames} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Check on={line.invoice_sent} disabled={locked} label="Fattura inviata"
                        onToggle={() => run(() => updateRevenueLine(line.id, { invoice_sent: !line.invoice_sent }))} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Check on={line.paid} disabled={locked} label="Pagato"
                        onToggle={() => run(() => updateRevenueLine(line.id, { paid: !line.paid }))} />
                    </td>
                    <td className="px-2 py-1.5 text-right text-2xs text-info tabular">
                      {eur(s.sales)}
                      {/* §186: sul digital la base è il margine, non l'imponibile.
                          Se un subappalto ha mangiato metà del ricavo va detto
                          qui, dove si guarda la quota. */}
                      {s.external > 0 && (
                        <span className="block text-2xs text-text-tertiary" title={`Subappalto ${eur(s.external)}: la spartizione parte dal margine`}>
                          su {eur(s.margin)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right text-2xs text-accent tabular">
                      {line.kind === 'digital'
                        ? (s.partnerQuota > 0 ? (
                            <>
                              {eur(s.partnerQuota)}
                              <span className="block text-2xs text-text-tertiary">a socio</span>
                            </>
                          ) : '—')
                        : (s.delivery ? eur(s.delivery) : '—')}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {/* La scelta sul fondo rischio è dell'admin, e solo sopra
                          soglia: sotto i 20.000 € non compare nemmeno. */}
                      {s.riskEligible ? (
                        <button onClick={() => run(() => updateRevenueLine(line.id, { risk_fund: !line.risk_fund }))}
                          disabled={locked}
                          aria-pressed={!!line.risk_fund}
                          title={line.risk_fund
                            ? `Fondo rischio attivo: ${pc(config.digital_risk_fund_pct)} del margine, ${pc(config.digital_risk_cut_pct)} in meno a ciascun socio`
                            : `Progetto da ${eur(line.project_value ?? 0)}: puoi destinare ${pc(config.digital_risk_fund_pct)} al fondo rischio`}
                          className={`text-2xs font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap press disabled:opacity-40 ${
                            line.risk_fund
                              ? 'border-orange/40 bg-orange/15 text-orange'
                              : 'border-border text-text-tertiary hover:text-text-secondary'}`}>
                          {line.risk_fund ? `fondo ${pc(config.digital_risk_fund_pct)}` : 'fondo?'}
                        </button>
                      ) : null}
                    </td>
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
      <CostSection
        costs={costs} centers={centers} locked={locked} pending={pending}
        picked={picked} setPicked={setPicked} totals={t.costs}
        onUpdate={(id, patch) => run(() => updateCostLine(id, patch))}
        onCenter={(id, v) => run(() => setLineCenter(id, v))}
        onDelete={(id, label) => run(() => deleteCostLine(id), `«${label}» eliminata`)}
        onAdd={() => run(() => addCostLine(month), 'Voce aggiunta')}
        onBulk={bulk}
        onSyncPlan={() => run(async () => {
          const r = await syncBudgetsFromPlan(month)
          if (!r.righe) { toast.info('I preventivati sono già quelli del piano'); return }
          toast.success(
            `${r.righe} preventivati riallineati · ${r.variazione > 0 ? '+' : '−'}${eur(Math.abs(r.variazione))}`,
            { description: r.cambi.slice(0, 4).map(c => `${c.label}: ${eur(c.da)} → ${eur(c.a)}`).join(' · ') })
        })} />

      {/* ── §192 · i lavori affidati fuori: qui atterra tutto ── */}
      <SubcontractSection
        month={month} costs={costs} revenue={revenue} subItems={subItems}
        projectNames={projectNames} clientNames={clientNames} clientOfProject={clientOfProject} />

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

/**
 * Un numero con la sua etichetta. L'etichetta **non si taglia**: «Target costi 35%
 * growth + …» non dice niente, e un'etichetta illeggibile vale meno di una riga in
 * più di altezza.
 */
function Mini({ icon, label, value, extra }: { icon: React.ReactNode; label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-border">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span className="text-2xs text-text-secondary flex-1 leading-snug">{label}</span>
      <span className="text-right shrink-0">
        <span className="block text-sm font-semibold text-text-primary tabular">{value}</span>
        {extra && <span className="block text-2xs font-semibold tabular">{extra}</span>}
      </span>
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

/**
 * Un importo modificabile.
 *
 * Con `money` si legge formattato — «2.767,31 €» — e si modifica in chiaro:
 * fuori dalla modifica un numero va letto, non decifrato, e i separatori delle
 * migliaia sono metà del lavoro. `null` nello stato significa «non in modifica»,
 * così il valore mostrato resta quello del server anche dopo un salvataggio.
 */
function Num({ value, onSave, disabled, strong, money, full }: {
  value: number; onSave: (v: number) => void
  disabled?: boolean; strong?: boolean; money?: boolean; full?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (money ? eur2(value) : String(value))
  return (
    <input value={shown} disabled={disabled} inputMode="decimal" aria-label="Importo"
      onFocus={() => setDraft(String(value))}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number((draft ?? '').replace(/\./g, '').replace(',', '.'))
        if (draft !== null && !Number.isNaN(n) && n !== value) onSave(n)
        setDraft(null)
      }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={`${full ? 'w-full' : 'w-20'} bg-transparent text-right tabular text-sm rounded
                  border-b border-transparent focus:border-border-interactive outline-none
                  disabled:cursor-default ${
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

  /* §194 — dove si modifica, non solo da dove viene: chi guarda una riga sbagliata
     deve sapere in quale pagina si corregge, senza cercarla. */
  if (line.origin === 'contratto' && line.project_id) {
    return (
      <span className="flex items-center gap-1.5 flex-wrap">
        <Link href={`/progetti/${line.project_id}?tab=economics`}
          className="flex items-center gap-1 text-2xs text-text-tertiary hover:text-gold-text w-fit">
          <Briefcase className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[240px]">
            {client ? `${client} · ` : ''}{projectNames[line.project_id] ?? 'Progetto'}
          </span>
        </Link>
        {/* la sezione madre: importo, rate e scadenze si cambiano lì */}
        {line.client_id && (
          <Link href={`/clienti/${line.client_id}?tab=economics`}
            title="L'importo e la scadenza di questa rata si cambiano nell'economics del cliente"
            className="flex items-center gap-0.5 text-2xs text-info hover:underline shrink-0">
            <Lock className="w-2.5 h-2.5" aria-hidden="true" />modifica l&apos;accordo
          </Link>
        )}
      </span>
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
 * Si **legge**, non si scrive: il commerciale di un cliente sta in anagrafica, ed
 * è lì che si cambia. La tendina su ogni riga era un secondo posto dove scriverlo
 * — quindi due nomi possibili per lo stesso cliente nello stesso mese, e la
 * provvigione seguiva quello che qualcuno aveva toccato per ultimo.
 *
 * Tre stati, e tutti e tre vanno detti:
 *
 *   · **dall'anagrafica** — il caso normale. Spesso è un segnalatore senza account
 *     nel tool, e per questo si mostra il nome in chiaro e non un profilo;
 *   · **sulla riga** — una fotografia scattata quando la riga è nata. Non si
 *     riscrive: un mese chiuso non cambia commerciale perché l'anagrafica è
 *     cambiata dopo, ed è il motivo per cui la riga se lo porta dietro;
 *   · **nessuno** — la provvigione non resta in cassa, si divide fra i soci.
 */
function Owner({ line, clientNames }: {
  line: RevenueLine
  clientNames: Record<string, string>
}) {
  const o = ownerOf(line)
  const href = line.client_id ? `/clienti/${line.client_id}?tab=anagrafica` : null

  if (!o.name) {
    return (
      <div className="min-w-[110px]">
        <span className="text-2xs text-text-tertiary">—</span>
        <span className="block text-2xs text-gold-text">quota ai soci</span>
        {href && (
          <Link href={href} className="block text-2xs text-info hover:underline">
            assegnalo in anagrafica
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="min-w-[110px]">
      {href ? (
        <Link href={href} title="Il commerciale si cambia nell'anagrafica del cliente"
          className="text-2xs font-semibold text-text-primary hover:text-gold-text flex items-center gap-1">
          <Lock className="w-2.5 h-2.5 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="truncate max-w-[120px]">{o.name}</span>
        </Link>
      ) : (
        <span className="text-2xs font-semibold text-text-primary">{o.name}</span>
      )}
      <span className="block text-2xs text-text-tertiary">
        {o.source === 'anagrafica'
          ? 'dall\'anagrafica'
          : `fotografia della riga${line.client_id && clientNames[line.client_id] ? '' : ''}`}
      </span>
    </div>
  )
}

/**
 * Da dove viene un compenso, riga per riga.
 *
 * Quattro colonne e nessuna interpretazione: la voce di ricavo (con cliente e
 * progetto), la base su cui si calcola, la percentuale applicata, l'importo. Il
 * totale in fondo deve tornare col numero chiuso: se non torna, si vede quale
 * riga lo rompe — che è tutto il punto di poter aprire un numero.
 */
function QuotaDetail({ rows, total, config, clientNames, projectNames, note }: {
  rows: QuotaRow[]
  total: number
  config: PlConfig
  clientNames: Record<string, string>
  projectNames: Record<string, string>
  note?: string
}) {
  if (!rows.length) {
    return (
      <p className="px-3 py-2.5 text-2xs text-text-tertiary border-t border-border">
        Nessuna riga di ricavo alimenta questo compenso in questo mese.
      </p>
    )
  }

  const REASON: Record<QuotaRow['reason'], string> = {
    erogato: 'erogato growth',
    digital: 'quota digital',
    residuo: 'residuo growth',
    provvigione: 'provvigione',
    'provvigione-divisa': 'provvigione divisa fra i soci',
  }
  const sum = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="border-t border-border bg-background/60">
      <div className="overflow-x-auto">
        <table className="w-full text-2xs">
          <thead>
            <tr className="text-text-tertiary uppercase tracking-wider">
              <th className="text-left font-semibold px-3 py-1.5">Voce</th>
              <th className="text-right font-semibold px-2 py-1.5">Base</th>
              <th className="text-right font-semibold px-2 py-1.5">%</th>
              <th className="text-right font-semibold px-3 py-1.5">Quota</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.lineId}-${r.reason}-${i}`} className="border-t border-border/60">
                <td className="px-3 py-1.5">
                  {/* il nome porta al lavoro da cui quella quota nasce: è lì che si
                      cambia l'importo o la scadenza, non qui */}
                  {r.projectId ? (
                    <Link href={`/progetti/${r.projectId}?tab=economics`}
                      className="text-text-primary font-semibold hover:text-gold-text">
                      {r.label}
                    </Link>
                  ) : (
                    <span className="text-text-primary font-semibold">{r.label}</span>
                  )}
                  <span className="block text-text-tertiary">
                    {/* cliente e progetto: senza, «Rata 3 di 6» non dice a chi */}
                    {r.clientId && (
                      <Link href={`/clienti/${r.clientId}?tab=economics`} className="hover:text-gold-text">
                        {clientNames[r.clientId] ?? 'cliente'}
                      </Link>
                    )}
                    {r.projectId && <> · {projectNames[r.projectId] ?? 'progetto'}</>}
                    {' · '}{r.kind}{' · '}{REASON[r.reason]}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular text-text-secondary">
                  {eur(r.base)}
                  {/* sul digital la base è il margine: si dice quanto è uscito prima */}
                  {r.external > 0 && (
                    <span className="block text-text-tertiary">− {eur(r.external)} subappalto</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular text-text-secondary">{pc1(r.pct)}</td>
                <td className="px-3 py-1.5 text-right tabular font-bold text-text-primary">{eur(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td className="px-3 py-1.5 text-text-secondary font-semibold" colSpan={3}>Totale</td>
              <td className="px-3 py-1.5 text-right tabular font-bold text-text-primary">{eur(sum)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {Math.abs(sum - total) > 1 && (
        <p className="px-3 py-1.5 text-2xs text-error border-t border-border">
          Il dettaglio fa {eur(sum)} contro {eur(total)} del totale: differenza {eur(total - sum)}.
        </p>
      )}
      {note && <p className="px-3 py-1.5 text-2xs text-text-tertiary border-t border-border">{note}</p>}
      <p className="px-3 py-1.5 text-2xs text-text-tertiary border-t border-border">
        {/* da dove nasce: le righe del mese, che nascono dai contratti dei progetti */}
        Calcolato sulle <strong className="text-text-secondary">{rows.length} righe di ricavo
        di questo mese</strong>, che nascono dagli accordi dei progetti: si cambiano lì, e questa
        tabella si aggiorna.
      </p>
      <p className="px-3 py-1.5 text-2xs text-text-tertiary border-t border-border">
        Growth: {pc(config.growth_delivery_pct)} di erogato diviso fra i soci, {pc(config.growth_sales_pct)} di
        provvigione. Digital: {pc(config.digital_partner_pct)} a ciascun socio e {pc(config.digital_sales_pct)} di
        provvigione, calcolati sul <strong className="text-text-secondary">margine</strong> — ricavo meno i
        subappalti del progetto.
      </p>
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

/**
 * Come far uscire l'erogato di un socio: spesa o fattura.
 *
 * È una decisione da prendere ogni mese, e le due strade non sono equivalenti.
 * La **spesa dal sottoconto** porta a costo quello che comunque si sarebbe speso
 * — la cena col cliente, il carburante per andarci — ma con la deducibilità della
 * sua famiglia: un pranzo vale il 75% e non recupera IVA. La **fattura del socio**
 * è deducibile per intero e l'IVA si detrae tutta, ma sposta l'imposta sulla
 * persona, che su quell'importo paga le sue.
 *
 * Il pannello non sceglie: mostra i due numeri, quanto è già uscito in ciascuna
 * forma e quanto resta. L'unica cosa che impedisce è farlo uscire due volte.
 */
function PayoutPanel({ p, month }: {
  p: PlTotals['perPartner'][number]
  month: string
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [amount, setAmount] = useState<string>('')
  const [ref, setRef] = useState('')

  const residuo = p.cash
  const spese = p.spendRows.filter(r => !r.invoice)
  const fatture = p.spendRows.filter(r => r.invoice)
  const deducibile = p.spendRows.reduce((n, r) => n + r.deductible, 0)

  return (
    <div className="border-t border-border bg-background px-3 py-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <MiniBox label="Spesa dal sottoconto" value={eur(p.viaSpend)}
          hint={spese.length ? `${spese.length} voci · deducibile ${eur(deducibile)}` : 'niente ancora'} />
        <MiniBox label="Fattura del socio" value={eur(p.viaInvoice)}
          hint={fatture.length ? 'deducibile al 100%, IVA detraibile' : 'nessuna fattura registrata'} />
        <MiniBox label={p.overspent > 0 ? 'Uscito in eccesso' : 'Ancora da far uscire'}
          value={eur(p.overspent > 0 ? p.overspent : residuo)}
          tone={p.overspent > 0 ? 'error' : residuo > 0 ? 'warning' : 'success'} />
      </div>

      {p.spendRows.length > 0 && (
        <ul className="space-y-1">
          {p.spendRows.map(r => (
            <li key={r.id} className="flex items-baseline gap-2 text-2xs">
              <span className={`shrink-0 px-1.5 py-0.5 rounded ${
                r.invoice ? 'bg-info-dim text-info' : 'bg-surface-active text-text-tertiary'}`}>
                {r.invoice ? 'fattura' : 'spesa'}
              </span>
              <span className="truncate text-text-secondary">{r.label}</span>
              <span className="text-text-tertiary shrink-0">
                deducibile {Math.round(r.deductiblePct * 100)}%
              </span>
              <span className="ml-auto tabular text-text-primary shrink-0">{eur(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      {p.overspent > 0 ? (
        <p className="text-2xs text-text-secondary">
          È uscito <strong className="text-error">{eur(p.overspent)}</strong> più di quanto gli spetta
          questo mese: è un anticipo, si recupera dall&apos;erogato del mese prossimo.
        </p>
      ) : residuo > 0 ? (
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-2xs text-text-tertiary mb-1" htmlFor={`inv-${p.partner.id}`}>
              Fattura per il compenso
            </label>
            <input id={`inv-${p.partner.id}`} type="number" min={0} step={50}
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder={String(Math.round(residuo))}
              className="w-28 bg-surface border border-border-interactive rounded-lg px-2 py-1.5
                         text-2xs tabular text-text-primary" />
          </div>
          <div>
            <label className="block text-2xs text-text-tertiary mb-1" htmlFor={`ref-${p.partner.id}`}>
              Numero
            </label>
            <input id={`ref-${p.partner.id}`} value={ref} onChange={e => setRef(e.target.value)}
              placeholder="opzionale"
              className="w-28 bg-surface border border-border-interactive rounded-lg px-2 py-1.5
                         text-2xs text-text-primary" />
          </div>
          <button type="button" disabled={busy}
            onClick={() => start(async () => {
              const val = Number(amount || residuo)
              if (!Number.isFinite(val) || val <= 0) { toast.error('Serve un importo'); return }
              if (val > residuo + 0.01) {
                toast.error(`Restano solo ${eur(residuo)} da far uscire: il resto è già uscito come spesa`)
                return
              }
              try {
                await registerPartnerInvoice(month, p.partner.id, val, ref || null)
                toast.success(`Fattura di ${p.partner.label} registrata: ${eur(val)}`)
                setAmount(''); setRef('')
                router.refresh()
              } catch (e) { toast.error((e as Error).message) }
            })}
            className="px-3 py-1.5 rounded-lg bg-gold text-on-gold text-2xs font-bold
                       hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
            Registra
          </button>
          <p className="text-2xs text-text-tertiary basis-full">
            La spesa dal sottoconto porta a costo quello che si sarebbe speso comunque, ma con la
            deducibilità della sua famiglia. La fattura è deducibile per intero e l&apos;IVA si detrae
            tutta, però sposta l&apos;imposta sulla persona. Sopra i due numeri per decidere
          </p>
        </div>
      ) : (
        <p className="text-2xs text-success">
          Erogato del mese tutto uscito: {eur(p.viaSpend)} come spesa, {eur(p.viaInvoice)} come fattura.
        </p>
      )}
    </div>
  )
}

function MiniBox({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: 'error' | 'warning' | 'success'
}) {
  const cls = tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning'
    : tone === 'success' ? 'text-success' : 'text-text-primary'
  return (
    <div className="rounded-lg border border-border bg-surface px-2.5 py-2">
      <p className="text-2xs text-text-tertiary">{label}</p>
      <p className={`text-sm font-bold tabular ${cls}`}>{value}</p>
      {hint && <p className="text-2xs text-text-tertiary mt-0.5">{hint}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Uscite del mese
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dove il preventivato di una voce è già stato deciso altrove.
 *
 * Una riga nata dal piano dei costi, dall'organico o da un movimento bancario ha
 * un preventivato **derivato**: riscriverlo qui creerebbe un secondo numero che
 * dice un'altra cosa, e da quel momento nessuno dei due sarebbe affidabile. Si
 * corregge alla fonte, e il lucchetto dice quale è.
 *
 * L'effettivo invece resta sempre scrivibile: quello è il fatto, e il fatto lo
 * conosce solo chi ha visto la fattura.
 */
function originOf(c: CostLine): { label: string; href: string } | null {
  if (c.partner_id || c.category === 'Spese soci' || c.category === 'Compenso soci') {
    return { label: 'dai sottoconti', href: '/economics/banca' }
  }
  if (c.category === 'Spese fuori piano') return { label: 'dai movimenti', href: '/economics/banca' }
  if (c.category === 'Personale' || c.category === 'Persone') {
    return { label: "dall'organico", href: '/economics/personale' }
  }
  if (c.project_id) return { label: 'dal subappalto', href: '/economics/costi' }
  if (c.cost_item_id) return { label: 'dal piano', href: '/economics/costi' }
  return null
}

/**
 * Le uscite del mese, raggruppate per area.
 *
 * Ventisei righe piatte non si leggono: la domanda che uno si fa davanti a questa
 * tabella non è «quanto costa Slack» ma «quanto pesa la struttura, quanto le
 * persone, quanto i lavori affidati fuori». L'area è il livello a cui esiste un
 * budget, quindi è il livello a cui ha senso sommare — e il confronto
 * preventivato/effettivo si legge per gruppo prima che per riga.
 *
 * «senza area» sta in cima e resta segnalata: una spesa senza area non pesa su
 * nessun budget, e un budget che non misura niente è un budget che mente.
 */
function CostSection({
  costs, centers, locked, pending, picked, setPicked, totals,
  onUpdate, onCenter, onDelete, onAdd, onBulk, onSyncPlan,
}: {
  costs: CostLine[]
  centers: { id: string; name: string }[]
  locked: boolean
  pending: boolean
  picked: Set<string>
  setPicked: (s: Set<string>) => void
  totals: PlTotals['costs']
  onUpdate: (id: string, patch: Partial<{ label: string; category: string; budget: number; actual: number; paid: boolean; cost_type: 'F' | 'V' }>) => void
  onCenter: (id: string, centerId: string | null) => void
  onDelete: (id: string, label: string) => void
  onAdd: () => void
  onBulk: (action: 'align' | 'paid' | 'unpaid' | 'zero' | 'delete', msg: string, ids?: string[]) => void
  onSyncPlan: () => void
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const name = useMemo(() => new Map(centers.map(c => [c.id, c.name])), [centers])

  const groups = useMemo(() => {
    const map = new Map<string, CostLine[]>()
    for (const c of costs) {
      const k = c.center_id ?? ''
      map.set(k, [...(map.get(k) ?? []), c])
    }
    return Array.from(map, ([id, rows]) => ({
      id,
      label: id ? (name.get(id) ?? 'Area rimossa') : 'senza area',
      rows: rows.slice().sort((a, b) => b.actual - a.actual || b.budget - a.budget),
      budget: r2c(rows.reduce((n, c) => n + c.budget, 0)),
      actual: r2c(rows.reduce((n, c) => n + c.actual, 0)),
      paid: rows.every(c => c.paid),
      unpaid: r2c(rows.filter(c => !c.paid).reduce((n, c) => n + c.actual, 0)),
    })).sort((a, b) => (a.id === '' ? -1 : b.id === '' ? 1 : b.actual - a.actual))
  }, [costs, name])

  // le righe rimaste a zero col preventivato pieno: è l'errore che gonfia il margine
  const daAllineare = costs.filter(c => c.actual === 0 && c.budget > 0)
  const allPicked = costs.length > 0 && picked.size === costs.length
  const toggle = (id: string) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id); else next.add(id)
    setPicked(next)
  }

  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="flex items-end justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-text-primary">Uscite</h2>
          {/* I pezzi devono fare il totale. «fissi + variabili» conta solo la
              struttura — i subappalti stanno fuori dal target del 35% (§188) e il
              personale ha la sua sezione — quindi da soli non arrivavano al numero
              grosso, e la differenza sembrava un errore invece di una scelta. */}
          <p className="text-2xs text-text-tertiary mt-0.5">
            {costs.length} voci · struttura {eur(totals.structural)}{' '}
            <span className="text-text-tertiary">
              ({eur(totals.fixed)} fissi + {eur(totals.variable)} variabili)
            </span>
            {totals.external > 0 && <> · subappalti {eur(totals.external)}</>}
            {totals.partners > 0 && <> · spese soci {eur(totals.partners)}</>}
            {' '}· con IVA {eur(totals.gross)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-text-primary tabular">{eur(totals.actual)}</p>
          <p className="text-2xs text-text-tertiary">
            preventivato {eur(totals.budget)}
            {Math.abs(totals.actual - totals.budget) >= 1 && (
              <span className={totals.actual > totals.budget ? 'text-error' : 'text-success'}>
                {' '}· {totals.actual > totals.budget ? '+' : '−'}{eur(Math.abs(totals.actual - totals.budget))}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Un effettivo a zero su un preventivato pieno non è «non speso»: è «non
          ancora guardato», e a fine mese si legge come un costo che non c'è stato. */}
      {!locked && daAllineare.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-2.5 bg-warning-dim border-b border-warning/30 flex-wrap">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" aria-hidden="true" />
          <p className="text-2xs text-text-secondary flex-1 min-w-[200px]">
            <strong className="text-text-primary">{daAllineare.length} voci</strong> hanno il
            preventivato ma non l&apos;effettivo, per {eur(daAllineare.reduce((n, c) => n + c.budget, 0))}:
            finché restano a zero il margine del mese risulta più alto del vero
          </p>
          <button onClick={() => onBulk('align', `${daAllineare.length} voci allineate al preventivato`,
              daAllineare.map(c => c.id))}
            disabled={pending}
            className="text-2xs font-bold px-3 py-1.5 rounded-lg bg-gold text-on-gold hover:opacity-90 press disabled:opacity-50">
            Allineale al preventivato
          </button>
        </div>
      )}

      {!locked && picked.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-5 py-2.5 bg-gold-dim border-b border-gold/30">
          <span className="text-2xs font-semibold text-text-primary">
            {picked.size} selezionat{picked.size > 1 ? 'e' : 'a'}
          </span>
          <button onClick={() => onBulk('align', 'Effettivo allineato al preventivato')} disabled={pending} className={bulkBtn}>
            = preventivato
          </button>
          <button onClick={() => onBulk('paid', 'Segnate come pagate')} disabled={pending} className={bulkBtn}>Segna pagate</button>
          <button onClick={() => onBulk('unpaid', 'Segnate come non pagate')} disabled={pending} className={bulkBtn}>Non pagate</button>
          <button onClick={() => onBulk('zero', 'Effettivo azzerato')} disabled={pending} className={bulkBtn}>Azzera</button>
          <button onClick={() => { if (confirm(`Eliminare ${picked.size} voci?`)) onBulk('delete', 'Voci eliminate') }}
            disabled={pending}
            className="text-2xs font-semibold text-error border border-error/40 rounded-lg px-2.5 py-1.5 hover:bg-surface press">
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
        <div>
          {/* Intestazione, gruppi e righe condividono COST_GRID: colonne diverse
              per tipo di riga sono colonne che non si possono confrontare, ed è
              esattamente il confronto che questa tabella serve a rendere possibile. */}
          <div style={COST_GRID}
            className="grid items-center gap-x-2 px-4 py-2 border-b border-border/60
                       text-2xs text-text-tertiary uppercase tracking-wider">
            <div className="flex justify-center">
              {!locked && (
                <Check on={allPicked} label="Seleziona tutte le voci"
                  onToggle={() => setPicked(allPicked ? new Set() : new Set(costs.map(c => c.id)))} />
              )}
            </div>
            <span className="truncate">Voce</span>
            <span className="text-center" title="Fisso o variabile">F/V</span>
            <span className="text-right">Preventivato</span>
            <span className="text-right">Effettivo</span>
            <span className="text-center">Pagato</span>
            <span />
          </div>

          {groups.map(g => {
            const open = !closed.has(g.id)
            const delta = r2c(g.actual - g.budget)
            return (
              <div key={g.id || 'none'} className="border-b border-border/60 last:border-b-0">
                <button type="button" aria-expanded={open}
                  onClick={() => {
                    const n = new Set(closed)
                    if (n.has(g.id)) n.delete(g.id); else n.add(g.id)
                    setClosed(n)
                  }}
                  style={COST_GRID}
                  className={`w-full grid items-center gap-x-2 px-4 py-2.5 text-left hover:bg-surface-hover ${
                    g.id === '' ? 'bg-warning-dim' : 'bg-background'}`}>
                  <span className="flex justify-center">
                    <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform ${
                      open ? '' : '-rotate-90'}`} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex items-baseline gap-2">
                    <span className={`text-sm font-bold truncate ${
                      g.id === '' ? 'text-warning' : 'text-text-primary'}`}>{g.label}</span>
                    <span className="text-2xs text-text-tertiary shrink-0">
                      {g.rows.length} {g.rows.length === 1 ? 'voce' : 'voci'}
                    </span>
                    {g.unpaid > 0 && (
                      <span className="text-2xs text-warning shrink-0 hidden sm:inline">
                        {eur(g.unpaid)} da pagare
                      </span>
                    )}
                  </span>
                  <span />
                  <span className="text-2xs text-text-tertiary tabular text-right">{eur(g.budget)}</span>
                  <span className="text-right">
                    <span className="block text-sm font-bold text-text-primary tabular">{eur(g.actual)}</span>
                    {Math.abs(delta) >= 1 && (
                      <span className={`block text-2xs tabular ${delta > 0 ? 'text-error' : 'text-success'}`}>
                        {delta > 0 ? '+' : '−'}{eur(Math.abs(delta))}
                      </span>
                    )}
                  </span>
                  <span className="flex justify-center">
                    {g.paid && (
                      <span className="text-success text-2xs font-bold" title="Tutte pagate"
                        aria-label="Tutte pagate">✓</span>
                    )}
                  </span>
                  <span />
                </button>

                {open && (
                  <ul>
                    {g.rows.map(c => {
                      const origin = originOf(c)
                      const scarto = r2c(c.actual - c.budget)
                      return (
                        <li key={c.id} style={COST_GRID}
                          className={`group grid items-center gap-x-2 px-4 py-1.5 border-t border-border/40
                                      hover:bg-surface-hover ${picked.has(c.id) ? 'bg-gold-dim' : ''}`}>
                          <div className="flex justify-center">
                            {!locked && (
                              <Check on={picked.has(c.id)} label={`Seleziona ${c.label}`}
                                onToggle={() => toggle(c.id)} />
                            )}
                          </div>

                          <div className="min-w-0">
                            <Text value={c.label} disabled={locked || !!origin}
                              onSave={v => onUpdate(c.id, { label: v })} />
                            <div className="flex items-center gap-1.5 -mt-0.5">
                              <span className="text-2xs text-text-tertiary truncate">{c.category}</span>
                              {origin && (
                                <Link href={origin.href} title={`Il preventivato viene ${origin.label}: si corregge lì`}
                                  className="text-2xs text-info hover:underline shrink-0 flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" aria-hidden="true" />{origin.label}
                                </Link>
                              )}
                              {!locked && (
                                <select value={c.center_id ?? ''} aria-label={`Area di ${c.label}`}
                                  onChange={e => onCenter(c.id, e.target.value || null)}
                                  className={`bg-transparent border-0 text-2xs max-w-[130px] cursor-pointer
                                              focus:bg-background rounded py-0 ${
                                    c.center_id
                                      ? 'text-text-tertiary opacity-0 group-hover:opacity-100 focus:opacity-100'
                                      : 'text-warning font-semibold'}`}>
                                  <option value="">senza area</option>
                                  {centers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select>
                              )}
                            </div>
                          </div>

                          <button type="button" disabled={locked}
                            onClick={() => onUpdate(c.id, { cost_type: c.cost_type === 'F' ? 'V' : 'F' })}
                            title={c.cost_type === 'F' ? 'Costo fisso: c\'è comunque' : 'Costo variabile: segue il lavoro venduto'}
                            className="text-2xs font-bold text-text-tertiary hover:text-text-primary
                                       disabled:hover:text-text-tertiary">
                            {c.cost_type}
                          </button>

                          {/* Preventivato: bloccato dove lo scrive la sua fonte */}
                          <div className="text-right">
                            {origin ? (
                              <span className="text-2xs text-text-tertiary tabular"
                                title={`Il preventivato viene ${origin.label}: si corregge lì`}>
                                {eur2(c.budget)}
                              </span>
                            ) : (
                              <Num value={c.budget} disabled={locked} money full
                                onSave={v => onUpdate(c.id, { budget: v })} />
                            )}
                          </div>

                          {/* Effettivo: sempre scrivibile, è il fatto */}
                          <div className="text-right">
                            <Num value={c.actual} disabled={locked} strong money full
                              onSave={v => onUpdate(c.id, { actual: v })} />
                            {c.actual === 0 && c.budget > 0 && !locked ? (
                              <button onClick={() => onUpdate(c.id, { actual: c.budget })}
                                className="block ml-auto text-2xs text-gold-text hover:underline">
                                = {eur(c.budget)}
                              </button>
                            ) : Math.abs(scarto) >= 1 ? (
                              <span className={`block text-2xs tabular ${scarto > 0 ? 'text-error' : 'text-success'}`}>
                                {scarto > 0 ? '+' : '−'}{eur(Math.abs(scarto))}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex justify-center">
                            <Check on={c.paid} disabled={locked} label={`${c.label} pagato`}
                              onToggle={() => onUpdate(c.id, { paid: !c.paid })} />
                          </div>

                          <div className="flex justify-center">
                            {!locked && (
                              <button onClick={() => onDelete(c.id, c.label)}
                                aria-label={`Elimina ${c.label}`}
                                className="text-text-tertiary hover:text-error opacity-0
                                           group-hover:opacity-100 focus:opacity-100">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!locked && (
        <div className="px-5 py-3 border-t border-border flex items-center gap-4 flex-wrap">
          <button onClick={onAdd} disabled={pending}
            className="flex items-center gap-1.5 text-2xs font-semibold text-gold-text hover:opacity-80">
            <Plus className="w-3.5 h-3.5" />Voce di costo
          </button>
          <button onClick={onSyncPlan} disabled={pending}
            className="flex items-center gap-1.5 text-2xs font-semibold text-text-secondary hover:text-text-primary">
            <RotateCcw className="w-3.5 h-3.5" />Riallinea i preventivati al piano
          </button>
          <p className="text-2xs text-text-tertiary basis-full">
            Le voci col lucchetto hanno il preventivato scritto dalla loro fonte — piano dei costi,
            organico, movimenti — e si correggono lì, poi si riallinea. L&apos;effettivo si scrive
            sempre qui: quello lo sa solo chi ha visto la fattura
          </p>
        </div>
      )}
    </section>
  )
}

const r2c = (n: number) => Math.round(n * 100) / 100

/**
 * Le colonne delle uscite, una volta sola.
 *
 * Selezione · voce · F/V · preventivato · effettivo · pagato · elimina. La usano
 * l'intestazione, le righe di gruppo e le righe di voce: se ognuna avesse le sue
 * larghezze i numeri non starebbero incolonnati, e due numeri che non si toccano
 * non si confrontano.
 */
const COST_GRID = {
  gridTemplateColumns: '2rem minmax(0,1fr) 1.5rem 6.5rem 7rem 2.25rem 1.5rem',
} as const

// ═══════════════════════════════════════════════════════════════════════════
// §192 — Lavori affidati fuori
// ═══════════════════════════════════════════════════════════════════════════

/**
 * I subappalti del mese: chi, per quale progetto, di quale cliente.
 *
 * È la sezione dove **tutto atterra**, e serve perché prima nel conto economico si
 * leggeva «Subappalto — Rata 2 di 6» senza sapere di quale lavoro né a chi
 * andasse. Un subappalto è un solo fatto visto da quattro posti, e la gerarchia è
 * questa: **il patto si scrive sul progetto, il fatto qui, tutto il resto legge.**
 *
 * Perciò da qui si scrive solo l'effettivo e il pagato — che sono fatti, e li
 * conosce chi ha visto la fattura — mentre importo, fornitore e frequenza si
 * cambiano nella scheda del progetto, che ogni riga linka.
 */
function SubcontractSection({
  month, costs, revenue, subItems, projectNames, clientNames, clientOfProject,
}: {
  month: string
  costs: CostLine[]
  revenue: RevenueLine[]
  subItems: SubItem[]
  projectNames: Record<string, string>
  clientNames: Record<string, string>
  clientOfProject: Record<string, string>
}) {
  const [tab, setTab] = useState<'progetto' | 'fornitore'>('progetto')

  const views = useMemo(() => subcontractViews(
    subItems,
    costs.filter(c => !!c.project_id).map(c => ({
      id: c.id, label: c.label, budget: c.budget, actual: c.actual, paid: c.paid,
      project_id: c.project_id ?? null, cost_item_id: c.cost_item_id ?? null,
      center_id: c.center_id ?? null,
    })),
    month,
    { project: projectNames, client: clientNames, clientOf: clientOfProject },
  ), [subItems, costs, month, projectNames, clientNames, clientOfProject])

  const revByProject = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of revenue) {
      if (!r.project_id || r.pass_through) continue
      map[r.project_id] = r2c((map[r.project_id] ?? 0) + r.amount_net)
    }
    return map
  }, [revenue])

  const margins = useMemo(() => byProjectMargin(views, revByProject), [views, revByProject])
  const suppliers = useMemo(() => bySupplierView(views), [views])
  const findings = useMemo(() => subcontractFindings(views, margins), [views, margins])

  if (!views.length && !Object.keys(revByProject).length) return null

  const external = views.reduce((n, v) => n + (v.booked > 0 ? v.booked : v.planned), 0)
  const pagato = views.reduce((n, v) => n + v.paid, 0)

  return (
    <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="flex items-end justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
            <Truck className="w-4 h-4 text-orange" aria-hidden="true" />Lavori affidati fuori
          </h2>
          <p className="text-2xs text-text-tertiary mt-0.5">
            Il patto si scrive sulla scheda del progetto, il fatto qui: da questa tabella si
            correggono <strong className="text-text-secondary">effettivo</strong> e{' '}
            <strong className="text-text-secondary">pagato</strong>, l&apos;importo pattuito si
            cambia sul progetto
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-text-primary tabular">{eur(external)}</p>
          <p className="text-2xs text-text-tertiary">
            {views.length} voci · pagato {eur(pagato)}
            {external > pagato && <span className="text-warning"> · {eur(external - pagato)} da pagare</span>}
          </p>
        </div>
      </div>

      {findings.length > 0 && (
        <ul className="divide-y divide-border/60 bg-background">
          {findings.map(f => (
            <li key={f.id} className="flex items-start gap-2.5 px-5 py-2.5">
              <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                f.severity === 'critico' ? 'text-error'
                  : f.severity === 'attenzione' ? 'text-warning' : 'text-text-tertiary'}`}
                aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-2xs font-bold text-text-primary">{f.title}</p>
                <p className="text-2xs text-text-secondary mt-0.5">{f.detail}</p>
                {f.action && (
                  <p className="text-2xs text-gold-text font-semibold mt-0.5">
                    {f.href ? <Link href={f.href} className="hover:underline">{f.action}</Link> : f.action}
                  </p>
                )}
              </div>
              {f.value ? (
                <span className="text-2xs tabular font-bold text-text-primary shrink-0">{eur(f.value)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1 px-5 py-2.5 border-b border-border">
        {(['progetto', 'fornitore'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
            className={`text-2xs font-semibold px-3 py-1.5 rounded-lg press ${
              tab === t ? 'bg-gold text-on-gold' : 'text-text-secondary hover:bg-surface-hover'}`}>
            {t === 'progetto' ? 'Per progetto e margine' : 'Per subappaltatore'}
          </button>
        ))}
      </div>

      {tab === 'progetto' ? (
        <ul className="divide-y divide-border/60">
          {/* Solo i lavori che hanno un subappalto: un progetto senza niente affidato
              fuori ha margine uguale al ricavo, non aggiunge informazione e riempie
              la lista di righe che dicono «100%». Il margine di quei lavori si legge
              nella scheda del cliente. */}
          {margins.filter(m => m.rows.length > 0).map(m => (
            <li key={m.projectId ?? 'none'} className="px-5 py-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                {m.projectId ? (
                  <Link href={`/progetti/${m.projectId}?tab=economics`}
                    className="text-sm font-bold text-text-primary hover:text-gold-text truncate">
                    {m.projectName ?? 'Progetto'}
                  </Link>
                ) : (
                  <span className="text-sm font-bold text-text-primary">Senza progetto</span>
                )}
                {m.clientId && (
                  <Link href={`/clienti/${m.clientId}?tab=economics`}
                    className="text-2xs text-info hover:underline shrink-0">
                    {m.clientName ?? 'cliente'}
                  </Link>
                )}
                <span className="ml-auto text-2xs text-text-tertiary tabular shrink-0">
                  ricavo {eur(m.revenue)} − fuori {eur(m.external)} =
                </span>
                <span className={`text-sm font-bold tabular shrink-0 ${
                  m.margin < 0 ? 'text-error' : 'text-success'}`}>
                  {eur(m.margin)}
                </span>
                <span className="text-2xs text-text-tertiary tabular shrink-0 w-12 text-right">
                  {m.revenue > 0 ? `${Math.round(m.pct * 100)}%` : '—'}
                </span>
              </div>
              {m.rows.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {m.rows.map(r => (
                    <li key={r.lineId ?? r.itemId} className="flex items-baseline gap-2 text-2xs">
                      <SubBadge status={r.status} />
                      <span className="truncate text-text-secondary">{r.label}</span>
                      <span className={`shrink-0 ${r.supplier ? 'text-text-tertiary' : 'text-warning font-semibold'}`}>
                        {r.supplier ?? 'fornitore da scrivere'}
                      </span>
                      <span className="ml-auto tabular text-text-tertiary shrink-0">{eur(r.planned)}</span>
                      <span className="tabular font-bold text-text-primary shrink-0 w-20 text-right">
                        {eur(r.booked)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-border/60">
          {suppliers.map(g => (
            <li key={g.supplier ?? 'none'} className="px-5 py-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className={`text-sm font-bold ${g.supplier ? 'text-text-primary' : 'text-warning'}`}>
                  {g.supplier ?? 'Senza subappaltatore'}
                </span>
                <span className="text-2xs text-text-tertiary">
                  {g.projects} {g.projects === 1 ? 'progetto' : 'progetti'} · {g.rows.length} voci
                </span>
                <span className="ml-auto text-2xs text-text-tertiary tabular">pattuito {eur(g.planned)}</span>
                <span className="text-sm font-bold text-text-primary tabular w-24 text-right">{eur(g.booked)}</span>
                <span className={`text-2xs tabular w-24 text-right ${
                  g.paid < g.booked ? 'text-warning' : 'text-success'}`}>
                  {g.paid < g.booked ? `${eur(g.booked - g.paid)} da pagare` : 'tutto pagato'}
                </span>
              </div>
              <ul className="mt-1.5 space-y-1">
                {g.rows.map(r => (
                  <li key={r.lineId ?? r.itemId} className="flex items-baseline gap-2 text-2xs">
                    <SubBadge status={r.status} />
                    <span className="truncate text-text-secondary">{r.label}</span>
                    {r.href && (
                      <Link href={r.href} className="text-info hover:underline shrink-0">
                        {r.projectName ?? 'progetto'}
                      </Link>
                    )}
                    {r.clientName && <span className="text-text-tertiary shrink-0">{r.clientName}</span>}
                    <span className="ml-auto tabular font-bold text-text-primary shrink-0">{eur(r.booked)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <p className="px-5 py-3 border-t border-border text-2xs text-text-tertiary">
        Il margine è ricavo del mese meno i lavori affidati fuori. Il tempo del team interno non c&apos;è
        per scelta: sta nel costo del lavoro aziendale, e mescolarli darebbe un margine che nessuno può
        calcolare. Sul digital è questo margine la base della spartizione fra i soci
      </p>
    </section>
  )
}

function SubBadge({ status }: { status: 'pianificato' | 'nel mese' | 'pagato' | 'orfano' | 'scostato' }) {
  const ui = {
    pagato: { t: 'pagato', c: 'bg-success-dim text-success' },
    'nel mese': { t: 'nel mese', c: 'bg-info-dim text-info' },
    pianificato: { t: 'da portare', c: 'bg-surface-active text-text-tertiary' },
    scostato: { t: 'scostato', c: 'bg-warning-dim text-warning' },
    orfano: { t: 'senza patto', c: 'bg-error/15 text-error' },
  }[status]
  return <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${ui.c}`}>{ui.t}</span>
}

// ═══════════════════════════════════════════════════════════════════════════
// §202 — Ripartizione del maturato
// ═══════════════════════════════════════════════════════════════════════════

type Slice = {
  key: string
  label: string
  value: number
  /** il colore, come classe di sfondo */
  tone: string
  /** una riga sola che dice cos'è. Non due, non un paragrafo */
  hint: string
}

/**
 * Dove vanno i soldi del mese, in tre letture.
 *
 * Prima era una barra con la legenda a capo e sotto due paragrafi rossi: le
 * percentuali c'erano, ma per capire *cosa* fosse una voce bisognava sapere già la
 * risposta. Qui ogni voce ha **una riga di spiegazione**, e le tre viste
 * rispondono a tre domande diverse:
 *
 *   · **tutto** — come si chiude l'imponibile del mese. Sette voci che non si
 *     sovrappongono e fanno il totale: è la vista che dimostra che i conti tornano.
 *   · **growth** — come il piano divide l'imponibile growth: 15/30/35/10/10, e
 *     chiude al 100% da sola.
 *   · **digital** — prima il subappalto, poi il margine diviso fra commerciale,
 *     soci, struttura e cassa. Anche questa chiude da sola.
 *
 * Passare il mouse su una voce la accende nella barra e spegne le altre: è il modo
 * più corto di rispondere a «quale pezzo è questo».
 */
function Distribution({ t, config }: { t: PlTotals; config: PlConfig }) {
  const [view, setView] = useState<'tutto' | 'growth' | 'digital'>('tutto')
  const [hover, setHover] = useState<string | null>(null)

  const k = useMemo(() => {
    const of = (kind: 'growth' | 'digital') => {
      const own = t.lines.filter(x => x.line.kind === kind)
      const s = (f: (x: (typeof own)[number]) => number) =>
        r2c(own.reduce((n, x) => n + f(x), 0))
      return {
        base: s(x => x.s.base), external: s(x => x.s.external), margin: s(x => x.s.margin),
        sales: s(x => x.s.sales), delivery: s(x => x.s.delivery),
        costTarget: s(x => x.s.costTarget), riskFund: s(x => x.s.riskFund),
        residual: s(x => x.s.residual), residualToPartners: s(x => x.s.residualToPartners),
        partnersPool: s(x => x.s.partnersPool), companyQuota: s(x => x.s.companyQuota),
        retained: s(x => x.s.retained),
      }
    }
    return { growth: of('growth'), digital: of('digital') }
  }, [t])

  const { total, slices, note } = useMemo(() => {
    if (view === 'growth') {
      const g = k.growth
      return {
        total: g.base,
        note: 'Le cinque quote fanno il 100% dell’imponibile growth: è il piano, non un consuntivo.',
        slices: [
          { key: 'g-sales', label: 'Commerciale', value: g.sales, tone: 'bg-info',
            hint: `${pc(config.growth_sales_pct)} a chi ha portato il cliente. Senza commerciale si divide fra i soci.` },
          { key: 'g-erog', label: 'Erogato ai soci', value: g.delivery, tone: 'bg-accent',
            hint: `${pc(config.growth_delivery_pct)} in parti uguali: sul growth il lavoro lo fanno i soci.` },
          { key: 'g-target', label: 'Target costi', value: g.costTarget, tone: 'bg-error',
            hint: `${pc(config.cost_target_pct)} stanziato per persone, software e sede. È un obiettivo, non una spesa.` },
          { key: 'g-risk', label: 'Fondo rischio', value: g.riskFund, tone: 'bg-orange',
            hint: `${pc(config.risk_fund_pct)} messo da parte per i mesi che vanno male.` },
          { key: 'g-res', label: 'Residuo', value: g.residual, tone: 'bg-success',
            hint: config.growth_residual_to_company
              ? 'Resta in cassa TwoBee.' : 'Si divide fra i soci.' },
        ].filter(x => x.value > 0) as Slice[],
      }
    }
    if (view === 'digital') {
      const d = k.digital
      return {
        total: d.base,
        note: 'Prima si paga chi ha erogato, poi si divide quello che resta: il ricavo lordo non è distribuibile.',
        slices: [
          { key: 'd-ext', label: 'Subappalti', value: d.external, tone: 'bg-orange',
            hint: 'Il lavoro affidato fuori: esce dal margine prima di ogni quota, perché è già di qualcun altro.' },
          { key: 'd-sales', label: 'Commerciale', value: d.sales, tone: 'bg-info',
            hint: `${pc(config.digital_sales_pct)} del margine.` },
          { key: 'd-partners', label: 'Ai soci', value: d.partnersPool, tone: 'bg-gold',
            hint: `${pc(config.digital_partner_pct)} del margine a ciascuno, non da spartire.` },
          { key: 'd-target', label: 'Struttura', value: d.costTarget, tone: 'bg-error',
            hint: `${pc(config.digital_cost_target_pct)} del margine per coprire persone, software e sede.` },
          { key: 'd-company', label: 'Cassa TwoBee', value: d.companyQuota, tone: 'bg-success',
            hint: `${pc(config.digital_company_pct)} del margine che resta all’azienda.` },
          { key: 'd-risk', label: 'Fondo rischio', value: d.riskFund, tone: 'bg-orange',
            hint: `Attivo su alcune righe: ${pc(config.digital_risk_fund_pct)} del margine, ${pc(config.digital_risk_cut_pct)} in meno a ciascun socio.` },
          { key: 'd-retained', label: 'Non assegnato', value: d.retained, tone: 'bg-border-strong',
            hint: 'Le quote non fanno 100%: succede con un numero di soci diverso da tre.' },
        ].filter(x => x.value > 0) as Slice[],
      }
    }
    return {
      /* La base è l'imponibile **intero**, lo stesso numero della scorecard: prima
         era al netto delle partite di giro e i due non si trovavano. L'anticipo
         non è distribuibile, ma non per questo va sottratto in silenzio: diventa
         una fetta col suo nome, e la barra chiude sul totale vero. */
      total: t.revenue.accrued,
      note: 'Le voci non si sovrappongono e fanno l’imponibile: è la vista che dimostra che i conti tornano.',
      slices: [
        { key: 'sales', label: 'Commerciale', value: t.plan.sales, tone: 'bg-info',
          hint: `${pc(config.growth_sales_pct)} sul growth e ${pc(config.digital_sales_pct)} sul margine digital, a chi ha portato il cliente.` },
        { key: 'erog', label: 'Erogato growth ai soci', value: t.plan.delivery, tone: 'bg-accent',
          hint: `${pc(config.growth_delivery_pct)} dell’imponibile growth, in parti uguali.` },
        { key: 'res', label: 'Residuo ai soci', value: t.plan.residualToPartners, tone: 'bg-accent',
          hint: 'Il residuo growth quando i soci lo dividono invece di lasciarlo in cassa.' },
        { key: 'dig', label: 'Digital ai soci', value: t.plan.digitalPartners, tone: 'bg-gold',
          hint: `${pc(config.digital_partner_pct)} del margine a ciascun socio — margine, non ricavo.` },
        { key: 'ext', label: 'Subappalti', value: t.costs.external, tone: 'bg-orange',
          hint: 'Lavori affidati fuori: già tolti dal margine dei loro progetti.' },
        { key: 'struct', label: 'Costi di struttura', value: t.costs.structural, tone: 'bg-error',
          hint: 'Persone, software, sede: quello che c’è comunque, venduto o non venduto.' },
        { key: 'cassa', label: 'Cassa TwoBee', value: t.margin.company, tone: 'bg-success',
          hint: 'Quello che resta. Ci stanno dentro il fondo rischio e lo scostamento dal target costi.' },
        { key: 'giro', label: 'Partite di giro', value: t.plan.passThrough, tone: 'bg-info-dim',
          hint: 'Anticipo che torna al cliente — il budget pubblicitario: è fatturato e fa IVA, ma su di esso non si prende nessuna quota.' },
      ].filter(x => x.value !== 0) as Slice[],
    }
  }, [view, k, t, config])

  const positives = slices.filter(x => x.value > 0)
  const negatives = slices.filter(x => x.value < 0)
  const used = r2c(positives.reduce((n, x) => n + x.value, 0))
  const scale = Math.max(total, used, 1)
  const rest = Math.max(0, r2c(total - used))
  const over = Math.max(0, r2c(used - total))
  const w = (v: number) => `${(v / scale) * 100}%`
  const dim = (key: string) => (hover && hover !== key ? 'opacity-30' : 'opacity-100')

  return (
    <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-text-primary">Ripartizione del maturato</h2>
          <p className="text-2xs text-text-tertiary mt-0.5">{note}</p>
        </div>
        {/* tre domande diverse, tre viste: ognuna chiude sulla sua base */}
        <div className="flex gap-1 bg-background border border-border rounded-xl p-1 shrink-0">
          {([
            ['tutto', 'Tutto', t.revenue.accrued],
            ['growth', 'Growth', k.growth.base],
            ['digital', 'Digital', k.digital.base],
          ] as const).map(([v, lab, amount]) => (
            <button key={v} onClick={() => { setView(v); setHover(null) }} aria-pressed={view === v}
              disabled={amount <= 0}
              className={`px-2.5 py-1 rounded-lg text-2xs font-semibold press disabled:opacity-30 ${
                view === v ? 'bg-gold text-on-gold' : 'text-text-secondary hover:bg-surface-hover'}`}>
              {lab} <span className={view === v ? 'opacity-80' : 'text-text-tertiary'}>{eur(amount)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* la barra: passando sopra una voce si accende solo quella */}
      <div className="relative flex h-4 rounded-full overflow-hidden bg-surface-active gap-px">
        {positives.map(x => (
          <button key={x.key} type="button"
            onMouseEnter={() => setHover(x.key)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(x.key)} onBlur={() => setHover(null)}
            aria-label={`${x.label}: ${eur(x.value)}`}
            className={`${x.tone} ${dim(x.key)} transition-opacity`}
            style={{ width: w(x.value) }} />
        ))}
        {rest > 0 && (
          <span className={`bg-success ${dim('rest')} transition-opacity`} style={{ width: w(rest) }}
            title={`Resta: ${eur(rest)}`} />
        )}
        {over > 0 && (
          <span aria-hidden="true" className="absolute top-0 bottom-0 w-0.5 bg-text-primary"
            style={{ left: w(total) }}
            title={`Qui finisce il maturato: oltre la tacca ci sono ${eur(over)} scoperti`} />
        )}
      </div>

      {/* le voci: una riga ciascuna, con una riga di spiegazione */}
      <ul className="mt-3 divide-y divide-border/50">
        {[...positives, ...negatives].map(x => (
          <li key={x.key}
            onMouseEnter={() => setHover(x.key)} onMouseLeave={() => setHover(null)}
            className={`flex items-start gap-2.5 py-1.5 rounded-lg px-1 -mx-1 transition-colors ${
              hover === x.key ? 'bg-surface-hover' : ''}`}>
            <span className={`w-2.5 h-2.5 rounded-sm shrink-0 mt-1 ${
              x.value < 0 ? 'border border-error' : x.tone}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="text-2xs font-semibold text-text-primary">{x.label}</span>
              <span className="block text-2xs text-text-tertiary leading-snug">{x.hint}</span>
            </span>
            <span className="text-right shrink-0">
              <span className={`block text-2xs font-bold tabular ${
                x.value < 0 ? 'text-error' : 'text-text-primary'}`}>{eur(x.value)}</span>
              {total > 0 && (
                <span className="block text-2xs text-text-tertiary tabular">{pc(x.value / total)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {over > 0 && (
        <p className="text-2xs text-error mt-2.5 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Destinato {eur(used)} su {eur(total)}: <strong>{eur(over)} scoperti</strong>. La tacca
            segna dove finisce il maturato — il margine digital è distribuito per intero e la
            struttura la deve coprire il growth.
          </span>
        </p>
      )}

      {view === 'tutto' && (
        <div className="grid gap-3 sm:grid-cols-3 mt-4">
          <Mini icon={<ShieldAlert className="w-3.5 h-3.5 text-orange" />}
            label={`Fondo rischio ${pc(config.risk_fund_pct)} del growth`} value={eur(t.plan.riskFund)} />
          <Mini icon={<Target className="w-3.5 h-3.5 text-text-tertiary" />}
            label={`Target costi · ${pc(config.cost_target_pct)} del growth + ${pc(config.digital_cost_target_pct)} del margine digital`}
            value={eur(t.costs.target)}
            extra={<span className={t.costs.variance < 0 ? 'text-error' : 'text-success'}>
              {t.costs.variance < 0 ? '−' : '+'}{eur(Math.abs(t.costs.variance))}
            </span>} />
          <Mini icon={<Building2 className="w-3.5 h-3.5 text-gold-text" />}
            label="Cassa TwoBee del mese" value={eur(t.margin.company)}
            extra={t.plan.digitalCompany > 0
              ? <span className="text-text-tertiary">di cui {eur(t.plan.digitalCompany)} dal digital</span>
              : undefined} />
        </div>
      )}

      <p className="text-2xs text-text-tertiary mt-3">
        Il fondo rischio e lo scostamento dal target stanno dentro «Cassa TwoBee»: sono destinazioni
        di quello che resta, non prelievi in più.{' '}
        <Link href="/economics/banca" className="text-info hover:underline">
          Il cumulato e il ponte col saldo in banca
        </Link>{' '}dicono quanto è rimasto per davvero.
      </p>
    </section>
  )
}
