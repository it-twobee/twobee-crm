'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ChevronLeft, ChevronRight, Landmark, PiggyBank, Scale, CalendarClock,
  ShieldAlert, Info, Plus, Trash2, AlertTriangle, Lightbulb, Settings2, TrendingUp, Gift,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { monthLabel, shiftMonth } from '@/lib/pl'
import { vatByQuarter, nextDue, type MonthVat } from '@/lib/vat'
import {
  fiscalCalendar, estimateTaxes, setAsideStatus, taxInsights, monthsLeftInYear, upcoming,
  maxiDeduction, taxMeasures,
  type Provision, type TaxConfig,
} from '@/lib/tax'
import { updateTaxConfig, addProvision, deleteProvision } from '@/app/actions/tax'
import { EconomicsNav } from '@/components/economics/EconomicsNav'
import { Money } from '@/components/economics/fields'

const eur = (n: number) => formatCurrency(Math.round(n))
const pc = (n: number) => `${Math.round(n * 100)}%`

const TONE: Record<string, string> = {
  critico: 'text-error',
  attenzione: 'text-warning',
  'opportunità': 'text-info',
}
const KIND_TONE: Record<string, string> = {
  iva: 'bg-info-dim border-info/40 text-info',
  imposte: 'bg-error-dim border-error/40 text-error',
  dichiarazione: 'bg-surface-active border-border-strong text-text-secondary',
}

export function TaxClient({
  month, today, setupNeeded, config, provisions, vatMonths,
  revenueYtd, costsYtd, nonDeductibleYtd, entertainmentYtd, monthsBooked, costsWithVat, costsWithoutVat,
  vatOnUnpaid, q4Share, hasWelfare, hasTraining, rndSpend,
  newHires = 0, newHiresCost = 0, protectedCost = 0,
  contribRelief = 0, reliefAvailable = 0, impatriates = 0, investments = 0,
}: {
  month: string
  today: string
  setupNeeded: boolean
  config: TaxConfig
  provisions: Provision[]
  vatMonths: MonthVat[]
  revenueYtd: number
  costsYtd: number
  /** §191 — la parte dei costi che non abbassa l'imponibile */
  nonDeductibleYtd?: number
  /** §191 — spese di rappresentanza dell'anno, per il confronto col tetto */
  entertainmentYtd?: number
  monthsBooked: number
  costsWithVat: number
  costsWithoutVat: number
  vatOnUnpaid: number
  q4Share: number
  hasWelfare: boolean
  hasTraining: boolean
  rndSpend: number
  // §184 — quello che l'organico dice alle imposte
  newHires?: number
  newHiresCost?: number
  protectedCost?: number
  contribRelief?: number
  reliefAvailable?: number
  impatriates?: number
  investments?: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [showConfig, setShowConfig] = useState(false)
  const [newProv, setNewProv] = useState<{ kind: 'iva' | 'imposte'; amount: string }>({ kind: 'imposte', amount: '' })

  const run = (fn: () => Promise<unknown>, ok?: string) => start(async () => {
    try { await fn(); if (ok) toast.success(ok); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Errore') }
  })

  const year = Number(month.slice(0, 4))
  const go = (d: number) => router.push(`/economics/fiscale?m=${shiftMonth(month, d * 12)}`)

  const vat = useMemo(() => vatByQuarter(vatMonths, today), [vatMonths, today])
  const next = useMemo(() => nextDue(vatMonths, today), [vatMonths, today])
  /* §184 — la maxi-deduzione abbassa la base IRES e nient'altro: è
     extracontabile (non tocca il margine) e non vale ai fini IRAP. Entra nella
     stima perché una previsione che la ignora sovrastima l'imposta di migliaia. */
  const maxi = useMemo(() => maxiDeduction({
    newHiresCost, payrollIncrease: newHiresCost, protectedCost,
    headcountIncrease: newHires > 0,
    pct: config.maxi_deduction_pct, protectedPct: config.maxi_deduction_protected_pct,
    iresPct: config.ires_pct,
  }), [newHiresCost, protectedCost, newHires, config])

  const estimate = useMemo(
    () => estimateTaxes(revenueYtd, costsYtd, monthsBooked, config, monthsLeftInYear(today),
      maxi.extraDeduction, nonDeductibleYtd ?? 0),
    [revenueYtd, costsYtd, nonDeductibleYtd, monthsBooked, config, today, maxi])
  const calendar = useMemo(() => fiscalCalendar(year, today, vat, estimate), [year, today, vat, estimate])
  const aside = useMemo(
    () => setAsideStatus(provisions, next?.toPay ?? 0, estimate.total, monthsBooked),
    [provisions, next, estimate, monthsBooked])

  const findings = useMemo(() => taxInsights({
    today, vat, nextVat: next, estimate, aside,
    costsWithoutVat, costsWithVat, vatOnUnpaid, q4Share,
    hasWelfare, hasTraining, rndSpend, deadlines: calendar,
    entertainmentYtd: entertainmentYtd ?? 0,
    iresPct: config.ires_pct,
    newHires, newHiresCost, protectedCost, contribRelief, reliefAvailable, impatriates, investments,
  }), [today, vat, next, estimate, aside, costsWithoutVat, costsWithVat, vatOnUnpaid, q4Share,
    hasWelfare, hasTraining, rndSpend, calendar, config, entertainmentYtd, newHires, newHiresCost, protectedCost,
    contribRelief, reliefAvailable, impatriates, investments])

  const measures = useMemo(() => taxMeasures({
    today, newHires, impatriates, hasWelfare, rndSpend, investments, zes: false,
  }), [today, newHires, impatriates, hasWelfare, rndSpend, investments])

  if (setupNeeded) {
    return (
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        <EconomicsNav active="fiscale" month={month} />
        <div className="rounded-2xl border border-warning/40 bg-warning-dim p-4 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-text-primary">Migration da eseguire</p>
            <p className="text-2xs text-text-secondary mt-1">
              Esegui <code className="px-1 py-0.5 rounded bg-surface border border-border">supabase/migrations/175_tax_control.sql</code>{' '}
              nel SQL Editor di Supabase.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // con i costi non registrati il margine è finto e le imposte pure: si dice
  const unreliable = estimate.revenueYtd > 0 && estimate.costsYtd / estimate.revenueYtd < 0.2
  const nextThree = upcoming(calendar, 3)

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <EconomicsNav active="fiscale" month={month} />

      {/* ── testata ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => go(-1)} aria-label="Anno precedente"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">Fiscale {year}</h1>
            <button onClick={() => go(1)} aria-label="Anno successivo"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {monthsBooked} mes{monthsBooked === 1 ? 'e' : 'i'} di conto economico registrat{monthsBooked === 1 ? 'o' : 'i'} ·
            stime su base annua
          </p>
        </div>
        <button onClick={() => setShowConfig(!showConfig)} aria-expanded={showConfig}
          className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
          <Settings2 className="w-3.5 h-3.5" />Aliquote
        </button>
      </div>

      {showConfig && (
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <h2 className="text-sm font-bold text-text-primary mb-1">Aliquote e accantonamento</h2>
          <p className="text-2xs text-text-tertiary mb-3">
            Stanno qui e non nel codice perché cambiano con le leggi. Se il commercialista ti dà numeri diversi, vincono i suoi
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Cfg label="IRES" hint="sull'imponibile">
              <Pct value={config.ires_pct} onSave={v => run(() => updateTaxConfig({ ires_pct: v }), 'Aliquota aggiornata')} />
            </Cfg>
            <Cfg label="IRAP" hint="sul valore della produzione">
              <Pct value={config.irap_pct} onSave={v => run(() => updateTaxConfig({ irap_pct: v }), 'Aliquota aggiornata')} />
            </Cfg>
            <Cfg label="Ripresa IRAP" hint="quota di costi indeducibili">
              <Pct value={config.irap_addback_pct} onSave={v => run(() => updateTaxConfig({ irap_addback_pct: v }), 'Aggiornato')} />
            </Cfg>
            <Cfg label="Accantonamento" hint="quota del margine da mettere via">
              <Pct value={config.set_aside_pct} onSave={v => run(() => updateTaxConfig({ set_aside_pct: v }), 'Aggiornato')} />
            </Cfg>
          </div>
        </section>
      )}

      {/* ── i quattro numeri ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Landmark className="w-4 h-4 text-info" />} label="Prossima IVA"
          value={next && next.toPay > 0 ? eur(next.toPay) : '—'}
          sub={next ? `${next.label} · ${fmtDate(next.deadline)}` : 'nessuna liquidazione aperta'} />
        <Kpi icon={<Scale className="w-4 h-4 text-error" />} label="Imposte stimate"
          value={estimate.total > 0 ? eur(estimate.total) : '—'}
          sub={monthsBooked === 0 ? 'servono mesi registrati'
            : unreliable ? 'da rileggere: i costi effettivi non ci sono'
            : `su ${eur(estimate.marginProjected)} di margine proiettato`}
          tone={unreliable ? 'warning' : undefined} />
        <Kpi icon={<PiggyBank className="w-4 h-4 text-success" />} label="Accantonato"
          value={eur(aside.total)}
          sub={aside.needed > 0 ? `${pc(aside.coveredPct)} di quanto serve oggi` : 'niente da coprire'} />
        <Kpi icon={<TrendingUp className="w-4 h-4 text-gold-text" />} label="Da mettere via"
          value={aside.gap > 0 ? eur(estimate.monthlySetAside) : '—'}
          sub={aside.gap > 0 ? `al mese, per arrivare a dicembre coperto` : 'sei in linea'}
          tone={aside.gap > 0 ? 'warning' : 'success'} />
      </div>

      {/* ── cosa succede adesso ── */}
      {nextThree.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary mb-3">
            <CalendarClock className="w-4 h-4 text-gold-text" />Le prossime tre
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {nextThree.map(d => (
              <div key={d.id} className={`rounded-xl border p-3 ${
                d.daysLeft <= 15 ? 'border-warning/50 bg-warning-dim/30' : 'border-border'
              }`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded border ${KIND_TONE[d.kind]}`}>
                    {d.kind === 'iva' ? 'IVA' : d.kind === 'imposte' ? 'imposte' : 'adempimento'}
                  </span>
                  <span className="text-2xs text-text-tertiary">fra {d.daysLeft} gg</span>
                </div>
                <p className="text-2xs font-bold text-text-primary">{d.label}</p>
                <p className="text-sm font-bold text-text-primary tabular mt-0.5">
                  {d.amount != null ? eur(d.amount) : fmtDate(d.date)}
                </p>
                {d.amount != null && <p className="text-2xs text-text-tertiary">{fmtDate(d.date)}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── diagnosi e ottimizzazioni ── */}
      {findings.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-text-primary">Cosa guardare, cosa migliorare</h2>
            <p className="text-2xs text-text-tertiary mt-0.5">
              {findings.filter(f => f.severity !== 'opportunità').length} da sistemare ·{' '}
              {findings.filter(f => f.severity === 'opportunità').length} opportunità.
              Le opportunità fiscali sono cose da portare al commercialista, non istruzioni
            </p>
          </div>
          <div className="divide-y divide-border/60">
            {findings.map(f => (
              <div key={f.id} className="px-5 py-3 flex items-start gap-2.5">
                <span className={`mt-0.5 shrink-0 ${TONE[f.severity]}`}>
                  {f.severity === 'opportunità'
                    ? <Lightbulb className="w-3.5 h-3.5" />
                    : <AlertTriangle className="w-3.5 h-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-2xs font-bold text-text-primary">{f.title}</p>
                  <p className="text-2xs text-text-secondary mt-0.5">{f.detail}</p>
                  {f.action && <p className="text-2xs text-gold-text font-semibold mt-1">{f.action}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── IVA trimestre per trimestre ── */}
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <h2 className="text-sm font-bold text-text-primary mb-1">IVA, trimestre per trimestre</h2>
          <p className="text-2xs text-text-tertiary mb-3">
            Il credito di un trimestre si riporta sul successivo. Sotto i 25,82 € il versamento non si fa
          </p>
          {vat.length === 0 ? (
            <Empty>Nessun mese registrato: l&apos;IVA si calcola dal conto economico.</Empty>
          ) : (
            <div className="space-y-2">
              {vat.map(q => (
                <div key={q.label} className="flex items-center gap-2 flex-wrap border-b border-border/60 pb-2 last:border-0">
                  <span className="text-2xs font-semibold text-text-primary flex-1 min-w-[120px]">{q.label}</span>
                  <span className="text-2xs text-text-tertiary tabular">
                    {eur(q.debit)} − {eur(q.credit)}
                    {q.carried !== 0 && (q.carried > 0 ? ` − ${eur(q.carried)}` : ` + ${eur(-q.carried)}`)}
                  </span>
                  <span className={`text-2xs font-bold tabular ${
                    q.toPay > 0 ? 'text-text-primary' : q.balance < 0 ? 'text-success' : 'text-text-tertiary'
                  }`}>
                    {q.toPay > 0 ? eur(q.toPay) : q.deferred ? 'sotto il minimo' : q.balance < 0 ? 'a credito' : '—'}
                  </span>
                  <span className={`text-2xs ${q.closed ? 'text-text-tertiary' : 'text-text-secondary'}`}>
                    {fmtDate(q.deadline)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── come si arriva alla stima ── */}
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <h2 className="text-sm font-bold text-text-primary mb-1">Come si arriva alle imposte</h2>
          <p className="text-2xs text-text-tertiary mb-3">
            Ogni passaggio è visibile: una stima che non si può controllare non serve a niente
          </p>
          <div className="space-y-1.5">
            <Step label={`Ricavi di ${monthsBooked} mes${monthsBooked === 1 ? 'e' : 'i'}`} value={eur(estimate.revenueYtd)} />
            <Step label="Costi effettivi" value={`− ${eur(estimate.costsYtd)}`} />
            {estimate.nonDeductibleCosts > 0 && (
              <Step label="di cui non deducibile, riaggiunto"
                value={`+ ${eur(estimate.nonDeductibleCosts)}`}
                hint="Pasti al 25%, carburante a uso promiscuo all'80%, spese non inerenti: già uscite dalla cassa, non abbassano l'imponibile" />
            )}
            <Step label="Margine a oggi" value={eur(estimate.marginYtd)} strong />
            <Step label="Proiettato su 12 mesi" value={eur(estimate.marginProjected)}
              hint={monthsBooked > 0 ? `media di ${eur(estimate.marginYtd / Math.max(1, monthsBooked))} al mese` : undefined} />
            {estimate.extraDeductions > 0 && (
              <>
                <Step label="Maxi-deduzione nuove assunzioni" value={`− ${eur(estimate.extraDeductions)}`}
                  hint={maxi.why} />
                <Step label="Base IRES" value={eur(estimate.iresBase)}
                  hint="la maggiorazione vale solo ai fini IRES: la base IRAP resta il margine pieno" />
              </>
            )}
            <Step label={`IRES ${pc(config.ires_pct)}`} value={eur(estimate.ires)} />
            {config.irap_applies && <Step label={`IRAP ${pc(config.irap_pct)}`} value={eur(estimate.irap)} />}
            <Step label="Totale stimato" value={eur(estimate.total)} strong />
          </div>
          {unreliable && (
            <p className="flex items-start gap-2 text-2xs text-warning mt-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              I costi effettivi registrati sono {eur(estimate.costsYtd)} contro {eur(estimate.revenueYtd)} di ricavi:
              il margine qui sopra è quasi tutto ricavo, quindi questa stima è più alta del vero.
              Si sistema registrando le uscite del mese.
            </p>
          )}
          <p className="flex items-start gap-2 text-2xs text-text-tertiary mt-3 pt-3 border-t border-border">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            L&apos;imponibile fiscale non è il margine civilistico: deducibilità parziali, ammortamenti e riprese
            lo spostano. Questa stima serve a sapere l&apos;ordine di grandezza con mesi d&apos;anticipo, non a
            compilare un F24.
          </p>
        </section>
      </div>

      {/* ── §184: le agevolazioni della società ── */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
            <Gift className="w-4 h-4 text-gold-text" aria-hidden="true" />Agevolazioni e regimi
          </h2>
          <p className="text-2xs text-text-tertiary mt-0.5">
            Ordinate per quanto servono a <em>questa</em> azienda, con quello che il tool sa già.
            Gli esoneri sul costo del lavoro stanno in{' '}
            <Link href="/economics/personale" className="font-semibold text-gold-text hover:opacity-80">Personale</Link>:
            qui c&apos;è quello che tocca le imposte
          </p>
        </div>

        {(newHires > 0 || contribRelief > 0 || reliefAvailable > 0 || impatriates > 0) && (
          <div className="px-5 py-3 border-b border-border grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {newHires > 0 && (
              <div>
                <p className="text-2xs text-text-tertiary">Maxi-deduzione</p>
                <p className="text-sm tabular font-bold text-success">{eur(maxi.iresSaving)}</p>
                <p className="text-2xs text-text-tertiary">{newHires} assunzioni, {eur(newHiresCost)} di costo</p>
              </div>
            )}
            {contribRelief > 0 && (
              <div>
                <p className="text-2xs text-text-tertiary">Esoneri attivi</p>
                <p className="text-sm tabular font-bold text-success">{eur(contribRelief)}</p>
                <p className="text-2xs text-text-tertiary">contributi non versati quest&apos;anno</p>
              </div>
            )}
            {reliefAvailable > 0 && (
              <div>
                <p className="text-2xs text-text-tertiary">Esoneri non attivati</p>
                <p className="text-sm tabular font-bold text-error">{eur(reliefAvailable)}</p>
                <p className="text-2xs text-text-tertiary">non si recuperano a posteriori</p>
              </div>
            )}
            {impatriates > 0 && (
              <div>
                <p className="text-2xs text-text-tertiary">Regime impatriati</p>
                <p className="text-sm tabular font-bold text-info">{impatriates}</p>
                <p className="text-2xs text-text-tertiary">beneficio della persona, non della società</p>
              </div>
            )}
          </div>
        )}

        <div className="divide-y divide-border/60">
          {measures.live.map(m => (
            <div key={m.code} className="px-5 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-2xs font-bold text-text-primary">{m.label}</p>
                <span className="text-2xs font-semibold px-1.5 py-0.5 rounded border border-border text-text-tertiary">
                  {m.lever === 'ires' ? 'IRES' : m.lever === 'contributi' ? 'contributi'
                    : m.lever === 'credito' ? 'credito d\'imposta' : m.lever === 'persona' ? 'netto della persona' : m.lever}
                </span>
                {m.needsCheck && <span className="text-2xs text-warning">da verificare</span>}
                {m.to && <span className="text-2xs text-text-tertiary">scade {m.to.slice(0, 7)}</span>}
              </div>
              <p className="text-2xs text-text-secondary mt-0.5">{m.howMuch}</p>
              {m.risk && <p className="text-2xs text-warning mt-0.5">Rischio: {m.risk}</p>}
              <p className="text-2xs text-text-tertiary mt-0.5">{m.legalRef}</p>
            </div>
          ))}
        </div>

        {measures.expired.length > 0 && (
          <div className="px-5 py-3 border-t border-border">
            <p className="text-2xs font-semibold text-text-secondary">Non più in vigore</p>
            {measures.expired.map(m => (
              <p key={m.code} className="text-2xs text-text-tertiary mt-1">
                <strong className="text-text-secondary">{m.label}</strong> — {m.conditions[0] ?? m.howMuch}
              </p>
            ))}
          </div>
        )}

        <p className="px-5 py-3 text-2xs text-text-tertiary bg-background border-t border-border">
          Segnalazioni da portare al commercialista con i numeri già fatti, non istruzioni: il tool sa cosa hai
          speso e chi hai assunto, non la tua situazione fiscale completa.
        </p>
      </section>

      {/* ── accantonamenti ── */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <PiggyBank className="w-4 h-4 text-success" />Quanto hai messo da parte
            </h2>
            <p className="text-2xs text-text-tertiary mt-0.5">
              Serve {eur(aside.needed)} a oggi: {eur(aside.neededIva)} di IVA e {eur(aside.neededTaxes)} di imposte maturate
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={newProv.kind} aria-label="Tipo di accantonamento"
              onChange={e => setNewProv(p => ({ ...p, kind: e.target.value as 'iva' | 'imposte' }))}
              className="bg-background border border-border-interactive rounded-xl px-2 py-2 text-2xs text-text-secondary">
              <option value="imposte">Imposte</option>
              <option value="iva">IVA</option>
            </select>
            <input value={newProv.amount} onChange={e => setNewProv(p => ({ ...p, amount: e.target.value }))}
              inputMode="decimal" placeholder="importo" aria-label="Importo accantonato"
              className="w-28 bg-background border border-border-interactive rounded-xl px-2 py-2 text-2xs text-right tabular text-text-primary" />
            <button
              onClick={() => {
                const n = Number(newProv.amount.replace(',', '.'))
                if (!n) { toast.error('Metti un importo'); return }
                run(() => addProvision(month, newProv.kind, n), 'Accantonamento registrato')
                setNewProv(p => ({ ...p, amount: '' }))
              }}
              disabled={pending}
              className="flex items-center gap-1.5 text-2xs font-semibold border border-border rounded-xl px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover press disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" />Registra
            </button>
          </div>
        </div>

        <div className="px-5 py-3">
          <div className="h-3 rounded-full bg-surface-active overflow-hidden">
            <div className="h-full rounded-full" style={{
              width: `${Math.min(100, aside.coveredPct * 100)}%`,
              background: aside.coveredPct >= 1 ? 'var(--color-success)'
                : aside.coveredPct >= 0.6 ? 'var(--color-warning)' : 'var(--color-error)',
            }} />
          </div>
          <p className="text-2xs text-text-tertiary mt-1.5">
            {aside.gap > 0
              ? `Mancano ${eur(aside.gap)}. Non è un debito: è denaro che hai già incassato e che non è tuo.`
              : 'Coperto. Il giorno della scadenza sarà una formalità.'}
          </p>
        </div>

        {provisions.length > 0 && (
          <div className="divide-y divide-border/60 border-t border-border">
            {provisions.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-5 py-2 flex-wrap">
                <span className="text-2xs text-text-tertiary w-24 shrink-0">{monthLabel(p.month)}</span>
                <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded border ${KIND_TONE[p.kind]}`}>
                  {p.kind === 'iva' ? 'IVA' : 'imposte'}
                </span>
                <span className="text-2xs text-text-secondary flex-1 min-w-[80px] truncate">{p.note ?? ''}</span>
                <span className="text-2xs font-bold tabular text-text-primary">{eur(p.amount)}</span>
                <button onClick={() => run(() => deleteProvision(p.id), 'Eliminato')}
                  aria-label="Elimina accantonamento" className="text-text-tertiary hover:text-error">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── scadenzario completo ── */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">Scadenzario {year}</h2>
          <p className="text-2xs text-text-tertiary mt-0.5">
            Scadenze ordinarie per una SRL con anno solare e IVA trimestrale. Proroghe e casi particolari si verificano col commercialista
          </p>
        </div>
        <div className="divide-y divide-border/60">
          {calendar.map(d => (
            <div key={d.id} className={`flex items-start gap-2.5 px-5 py-2.5 ${d.past ? 'opacity-50' : ''}`}>
              <span className="text-2xs text-text-tertiary w-20 shrink-0 tabular">{fmtDate(d.date)}</span>
              <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded border shrink-0 ${KIND_TONE[d.kind]}`}>
                {d.kind === 'iva' ? 'IVA' : d.kind === 'imposte' ? 'imposte' : 'adempimento'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-2xs font-semibold text-text-primary">{d.label}</p>
                <p className="text-2xs text-text-tertiary">{d.detail}</p>
              </div>
              {d.amount != null && (
                <span className="text-2xs font-bold tabular text-text-primary shrink-0">{eur(d.amount)}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <p className="flex items-start gap-2 text-2xs text-text-tertiary">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Questa sezione non sostituisce il commercialista e non vuole farlo: mette in fila quello che il conto
        economico sa già, così le domande giuste gliele fai tu, in anticipo.{' '}
        <Link href="/economics" className="font-semibold text-gold-text hover:opacity-80">Torna al conto economico</Link>
      </p>
    </div>
  )
}

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

function Kpi({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: string; sub: string; tone?: 'warning' | 'success'
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-center gap-2 mb-1.5">{icon}
        <span className="text-2xs font-semibold text-text-secondary uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className={`text-xl font-bold tabular ${
        tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-text-primary'
      }`}>{value}</div>
      <div className="text-2xs text-text-tertiary mt-0.5">{sub}</div>
    </div>
  )
}

function Step({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${strong ? 'border-t border-border pt-1.5' : ''}`}>
      <span className={`text-2xs ${strong ? 'font-bold text-text-primary' : 'text-text-secondary'}`}>
        {label}
        {hint && <span className="text-text-tertiary font-normal"> · {hint}</span>}
      </span>
      <span className={`tabular shrink-0 ${strong ? 'text-sm font-bold text-text-primary' : 'text-2xs text-text-secondary'}`}>
        {value}
      </span>
    </div>
  )
}

function Cfg({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block text-2xs font-semibold text-text-secondary">{label}</span>
      <span className="block text-2xs text-text-tertiary mb-1">{hint}</span>
      {children}
    </div>
  )
}

/** Le aliquote si scrivono in percentuale, non in decimale: 24, non 0,24. */
function Pct({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  return (
    <span className="flex items-center gap-1">
      <Money value={Math.round(value * 1000) / 10} small onSave={v => onSave(v / 100)} />
      <span className="text-2xs text-text-tertiary">%</span>
    </span>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-4 text-center">
      <p className="text-2xs text-text-tertiary">{children}</p>
    </div>
  )
}
