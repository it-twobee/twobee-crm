'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Repeat, Package, Tag, Wallet, Info, ArrowUpRight, Briefcase, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { monthLabel } from '@/lib/pl'
import { economicsHref } from '@/lib/economics-source'
import { linesForMonth, currentMonth, type RevenueStream, type Installment } from '@/lib/revenue'
import { ContractsPanel, type CatalogService } from '@/components/economics/ContractsPanel'
import { ProjectCostsPanel } from '@/components/economics/ProjectCostsPanel'
import { projectMargin, type CostItem, type CostActual, type MarginView } from '@/lib/costs'

const eur = (n: number) => formatCurrency(Math.round(n))

/**
 * La quotazione del progetto. È lo stesso pannello dell'economics del cliente,
 * ristretto a questo lavoro: un contratto scritto qui compare lì, e viceversa.
 */
export type SiblingProject = {
  id: string; name: string; status: string
  recurring: number; oneOff: number; contracts: number
}

export function ProjectEconomics({
  projectId, clientId, projectKind, projectStart, projectEnd,
  streams, installments, services, profiles, canEdit, siblings = [],
  costItems = [], costActuals = [],
}: {
  projectId: string
  clientId: string | null
  projectKind: 'growth' | 'digital'
  projectStart: string | null
  projectEnd: string | null
  streams: RevenueStream[]
  installments: Installment[]
  services: CatalogService[]
  profiles: { id: string; full_name: string }[]
  canEdit: boolean
  /** gli altri lavori dello stesso cliente: da qui si vede chi è ancora da quotare */
  siblings?: SiblingProject[]
  /** §173: lavorazioni affidate fuori su questo progetto */
  costItems?: CostItem[]
  /** uscite del mese già registrate su questo progetto */
  costActuals?: CostActual[]
}) {
  const totals = useMemo(() => {
    const rec = streams.filter(s => s.billing === 'recurring' && s.status === 'attivo')
    const one = streams.filter(s => s.billing === 'one_off')
    const draft = streams.filter(s => s.status === 'bozza')
    return {
      mrr: rec.reduce((n, s) => n + s.amount, 0),
      oneOff: one.filter(s => s.status !== 'bozza').reduce((n, s) => n + s.amount, 0),
      quoted: draft.reduce((n, s) => n + s.amount, 0),
      thisMonth: linesForMonth(streams, installments, currentMonth())
        .reduce((n, l) => n + l.amount_net, 0),
    }
  }, [streams, installments])

  // due letture, non una: il lavoro a corpo si giudica intero (quotato meno
  // subappalti), il canone mese per mese. Su un progetto venduto 30.000 in sei
  // rate il margine del singolo mese non dice niente sul lavoro
  const margin = useMemo(
    () => projectMargin(totals.thisMonth, totals.oneOff, costItems, costActuals, currentMonth(),
      { start: projectStart, end: projectEnd }),
    [totals.thisMonth, totals.oneOff, costItems, costActuals, projectStart, projectEnd])

  /* L'accordo raccontato in una riga. Quattro numeri in quattro card dicono
     cosa c'è; una frase dice cos'hai venduto — ed è quella che si legge. */
  const deal = useMemo(() => {
    const sold = streams.filter(s => s.status !== 'bozza')
    if (!sold.length) return null
    const rate = installments.filter(i => sold.some(s => s.id === i.stream_id))
    const last = rate.length ? rate.map(i => i.due_month).sort().slice(-1)[0] : null
    const subs = costItems.filter(i => i.is_active)
    const mirrored = subs.length > 1 && rate.length > 1 && subs.length === rate.length
    return {
      total: totals.oneOff + totals.mrr,
      recurring: totals.mrr > 0,
      rate: rate.length,
      last,
      subTotal: margin.work.cost || subs.reduce((n, i) => n + i.amount, 0),
      subCount: subs.length,
      mirrored,
    }
  }, [streams, installments, costItems, totals, margin])

  return (
    <div className="space-y-4 max-w-6xl animate-fade-in">

      {deal && (
        <section className="rounded-2xl border border-gold/30 bg-gold-dim/40 p-5">
          <p className="text-2xs font-semibold text-gold-text uppercase tracking-wider mb-1.5">L&apos;accordo</p>
          <p className="text-sm text-text-primary leading-relaxed">
            <strong className="font-bold">{eur(deal.total)}</strong>
            {deal.recurring ? ' al mese' : ''}
            {deal.rate > 1 && (
              <> in <strong className="font-bold">{deal.rate} scadenze</strong>
                {deal.last ? <> fino a {monthLabel(deal.last)}</> : null}</>
            )}
            {deal.rate === 1 && ' in unica soluzione'}
            {deal.subTotal > 0 ? (
              <> · <strong className="font-bold">{eur(deal.subTotal)}</strong> di lavorazioni affidate fuori
                {deal.mirrored ? ', con la stessa dilazione' : ''}</>
            ) : ' · nessun costo esterno'}
            {margin.hasWork && (
              <> · resta <strong className={`font-bold ${margin.work.margin < 0 ? 'text-error' : 'text-success'}`}>
                {eur(margin.work.margin)}</strong> ({Math.round(margin.work.pct * 100)}%)</>
            )}
          </p>
          <p className="text-2xs text-text-tertiary mt-1.5">
            Tutti gli importi sono IVA esclusa · l&apos;IVA si liquida in Fiscale &amp; Tasse
          </p>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi icon={<Repeat className="w-4 h-4 text-success" />} label="Canone mensile" value={eur(totals.mrr)} />
        <Kpi icon={<Package className="w-4 h-4 text-accent" />} label="Lavori a corpo" value={eur(totals.oneOff)} />
        <Kpi icon={<Tag className="w-4 h-4 text-text-tertiary" />} label="Quotato non venduto" value={eur(totals.quoted)} />
        <Kpi icon={<Wallet className="w-4 h-4 text-gold-text" />} label={`Ricavo di ${monthLabel(currentMonth())}`} value={eur(totals.thisMonth)} />
      </div>

      {/* ── quanto resta davvero: sul lavoro intero e sul mese ── */}
      {(margin.hasWork || margin.month.revenue > 0 || margin.month.cost > 0) && (
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft space-y-4">
          {margin.hasWork && (
            <MarginBar
              title="Margine sul lavoro"
              hint={`Quotato a corpo meno le lavorazioni affidate fuori${
                margin.workMonths > 1 ? `, ricorrenti comprese per i ${margin.workMonths} mesi del progetto` : ''
              }: è il numero che dice se il progetto è stato venduto bene`}
              view={margin.work} />
          )}

          {(margin.month.revenue > 0 || margin.month.cost > 0) && (
            <MarginBar
              title={`Margine di ${monthLabel(currentMonth())}`}
              hint={margin.month.onPlan && margin.month.planned > 0
                ? 'Rata o canone del mese meno i costi esterni che cadono qui — ancora previsione: nessuna uscita registrata'
                : 'Rata o canone del mese meno i costi esterni che cadono qui'}
              view={margin.month} />
          )}

          <p className="flex items-start gap-2 text-2xs text-text-tertiary border-t border-border pt-3">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Contano solo i costi <strong className="font-semibold">esterni</strong>: il tempo del team interno sta nel
            costo del lavoro aziendale, e mescolarli darebbe un margine che nessuno può calcolare davvero.
            {margin.openCostPerMonth > 0 && ` Ci sono anche ${eur(margin.openCostPerMonth)}/mese di lavorazioni senza una fine: non avendo un orizzonte non entrano nel totale del lavoro.`}
            {margin.workMonths === 0 && margin.hasWork && ' Il progetto non ha una data di fine: i costi ricorrenti non si possono totalizzare.'}
          </p>
        </section>
      )}

      <ContractsPanel
        scope={{ kind: 'project', projectId, clientId }}
        streams={streams} installments={installments} services={services} profiles={profiles}
        projects={[]} canEdit={canEdit}
        defaultKind={projectKind} defaultStart={projectStart} defaultEnd={projectEnd}
        subtitle="Una riga per servizio erogato: così si vede quale regge il margine"
      />

      <ProjectCostsPanel projectId={projectId} month={currentMonth()}
        items={costItems} actuals={costActuals} canEdit={canEdit}
        contracts={streams.filter(s => s.status !== 'bozza').map(s => ({
          id: s.id, label: s.label, billing: s.billing,
          terms: s.payment_terms ?? null,
          installments: installments.filter(i => i.stream_id === s.id).length,
        }))} />

      {siblings.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border flex-wrap">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Gli altri lavori di questo cliente</h3>
              <p className="text-2xs text-text-tertiary mt-0.5">
                Ogni progetto ha la sua quotazione: da qui si vede quale non ce l&apos;ha ancora
              </p>
            </div>
            {clientId && (
              <Link href={economicsHref(clientId)}
                className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80">
                Economics del cliente<ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
          <div className="divide-y divide-border/60">
            {siblings.map(p => (
              <Link key={p.id} href={`/progetti/${p.id}?tab=economics`}
                className="flex items-center gap-2 px-5 py-2.5 hover:bg-surface-hover flex-wrap">
                <Briefcase className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                <span className="text-2xs font-semibold text-text-primary flex-1 min-w-[140px] truncate">{p.name}</span>
                {p.contracts === 0 ? (
                  <span className="flex items-center gap-1 text-2xs font-semibold text-warning">
                    <AlertTriangle className="w-3 h-3 shrink-0" />da quotare
                  </span>
                ) : (
                  <>
                    {p.recurring > 0 && <span className="text-2xs tabular text-success">{eur(p.recurring)}/mese</span>}
                    {p.oneOff > 0 && <span className="text-2xs tabular text-accent">{eur(p.oneOff)}</span>}
                    {p.recurring === 0 && p.oneOff === 0 && (
                      <span className="text-2xs text-text-tertiary">solo bozze</span>
                    )}
                  </>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="flex items-start gap-2 text-2xs text-text-tertiary flex-1 min-w-[280px]">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Solo i contratti <strong className="font-semibold">attivi</strong> entrano nel conto economico: una bozza è
          quotata ma non venduta. Un canone pesa in ogni mese fra inizio e fine; un lavoro a corpo pesa attraverso
          le rate, nel mese in cui ciascuna cade.
        </p>
        {clientId && siblings.length === 0 && (
          <Link href={economicsHref(clientId)}
            className="flex items-center gap-1 text-2xs font-semibold text-gold-text hover:opacity-80 shrink-0">
            Economics del cliente<ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </div>
  )
}

/** Verde quello che resta, arancione quello che esce: la proporzione si legge senza numeri. */
function MarginBar({ title, hint, view }: { title: string; hint: string; view: MarginView }) {
  const base = Math.max(view.revenue, view.cost, 1)
  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-text-primary">{title}</h3>
          <p className="text-2xs text-text-tertiary mt-0.5">{hint}</p>
        </div>
        <span className={`text-lg font-bold tabular shrink-0 ${view.margin < 0 ? 'text-error' : 'text-success'}`}>
          {eur(view.margin)}
          {view.revenue > 0 && (
            <span className="text-2xs font-semibold text-text-tertiary ml-1.5">{Math.round(view.pct * 100)}%</span>
          )}
        </span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-surface-active">
        <div className="bg-success" style={{ width: `${Math.max(0, (view.margin / base) * 100)}%` }} />
        <div className="bg-orange" style={{ width: `${Math.min(100, (view.cost / base) * 100)}%` }} />
      </div>
      <p className="text-2xs text-text-tertiary mt-1.5">
        {eur(view.revenue)} di ricavo · {eur(view.cost)} di costi esterni
        {view.revenue === 0 && view.cost > 0 && ' — esce e basta: qui non c\'è ancora ricavo'}
      </p>
    </div>
  )
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-center gap-2 mb-1.5">{icon}
        <span className="text-2xs font-semibold text-text-secondary uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className="text-lg font-bold text-text-primary tabular">{value}</div>
    </div>
  )
}
