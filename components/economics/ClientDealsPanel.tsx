'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Briefcase, Truck, ChevronDown, AlertTriangle, ArrowUpRight, Search,
  CircleDollarSign, Percent,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { ContractsPanel, type CatalogService } from '@/components/economics/ContractsPanel'
import { ProjectCostsPanel } from '@/components/economics/ProjectCostsPanel'
import { projectDeal, type SubItem } from '@/lib/subcontracts'
import type { RevenueStream, Installment } from '@/lib/revenue'
import type { CostItem, CostActual } from '@/lib/costs'

const eur = (n: number) => formatCurrency(Math.round(n))

/**
 * L'economics del cliente, organizzata per **lavoro**.
 *
 * Prima c'erano due posti dove quotare: la scheda del cliente e quella del
 * progetto. Sono la stessa tabella vista da due punti, e il risultato era che lo
 * stesso accordo veniva scritto due volte e il conto economico lo contava due
 * volte. Adesso c'è un posto solo, ed è questo: un progetto per riquadro, dentro
 * ciascuno **quello che il cliente paga** e **quello che si dà via**.
 *
 * La gerarchia che il resto del tool rispetta:
 *
 *   · qui si **scrive** — accordi, rate, subappalti, fornitori;
 *   · il **conto economico** materializza le rate che cadono nel mese e vi
 *     registra quanto è stato fatturato e incassato;
 *   · **Costi & budget** raggruppa i subappalti per fornitore e li somma.
 *
 * Le altre due sezioni sono in sola lettura e riportano qui con un link: quando
 * cade una rata, quanto vale, chi la eroga si decide in un posto solo — perché
 * due numeri per lo stesso patto sono due numeri di cui nessuno si fida.
 */
export function ClientDealsPanel({
  clientId, clientName, projects, streams, installments, subItems, actuals,
  services, profiles, canEdit, defaultKind, defaultStart, defaultEnd, month,
}: {
  clientId: string
  clientName: string
  projects: { id: string; name: string; status?: string; kind?: 'growth' | 'digital' }[]
  streams: RevenueStream[]
  installments: Installment[]
  /** i subappalti: voci di piano con un progetto */
  subItems: SubItem[]
  /** le righe di costo già atterrate nel mese, per progetto */
  actuals: CostActual[]
  services: CatalogService[]
  profiles: { id: string; full_name: string }[]
  canEdit: boolean
  defaultKind: 'growth' | 'digital'
  defaultStart?: string | null
  defaultEnd?: string | null
  month: string
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const known = useMemo(() => new Set(projects.map(p => p.id)), [projects])
  /* Un accordo senza progetto — o su un progetto eliminato — non entra nella
     marginalità di nessun lavoro. Non è una categoria: è una cosa da sistemare,
     e sta in fondo con scritto perché. */
  const loose = useMemo(
    () => streams.filter(s => !s.project_id || !known.has(s.project_id)), [streams, known])

  const cards = useMemo(() => projects.map(p => {
    const own = streams.filter(s => s.project_id === p.id)
    const items = subItems.filter(i => i.project_id === p.id)
    return { project: p, streams: own, items, deal: projectDeal(own, items) }
  }), [projects, streams, subItems])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return cards
    return cards.filter(c =>
      c.project.name.toLowerCase().includes(needle)
      || c.streams.some(s => s.label.toLowerCase().includes(needle))
      || c.deal.suppliers.some(x => x.toLowerCase().includes(needle)))
  }, [cards, q])

  const tot = useMemo(() => {
    const sold = cards.reduce((n, c) => n + c.deal.sold, 0)
    const external = cards.reduce((n, c) => n + c.deal.external, 0)
    return {
      sold, external,
      recurring: cards.reduce((n, c) => n + c.deal.recurring, 0),
      recurringExternal: cards.reduce((n, c) => n + c.deal.recurringExternal, 0)
        + loose.filter(s => s.billing === 'recurring').length * 0,
      looseRecurring: loose.filter(s => s.billing === 'recurring' && s.status === 'attivo')
        .reduce((n, s) => n + s.amount, 0),
      looseSold: loose.filter(s => s.billing !== 'recurring' && s.status !== 'bozza')
        .reduce((n, s) => n + s.amount, 0),
      margin: Math.round((sold - external) * 100) / 100,
      daQuotare: cards.filter(c => !c.deal.quoted).length,
      draft: cards.reduce((n, c) => n + c.deal.draft, 0),
    }
  }, [cards, loose])

  return (
    <div className="space-y-4">
      {/* ══ i quattro numeri che contano mentre si quota ══ */}
      <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
            <CircleDollarSign className="w-4 h-4 text-gold-text" aria-hidden="true" />
            Economics di {clientName}
          </h2>
          <p className="text-2xs text-text-tertiary mt-0.5">
            Un riquadro per lavoro: dentro c&apos;è quello che il cliente paga e quello che si dà
            via. <strong className="text-text-secondary">Si scrive qui</strong>: conto economico e
            Costi &amp; budget leggono e sommano, e riportano a questa pagina
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 p-5">
          <Num label="Canone attivo" value={`${eur(tot.recurring + tot.looseRecurring)}/mese`}
            hint={tot.recurringExternal > 0
              ? `− ${eur(tot.recurringExternal)} affidati fuori`
              : 'nessun canone affidato fuori'} />
          <Num label="Venduto a corpo" value={eur(tot.sold + tot.looseSold)}
            hint={tot.draft > 0 ? `${eur(tot.draft)} ancora in bozza` : 'tutto confermato'}
            tone={tot.draft > 0 ? 'warning' : undefined} />
          <Num label="Affidato fuori" value={eur(tot.external)}
            hint={cards.flatMap(c => c.deal.suppliers).length
              ? Array.from(new Set(cards.flatMap(c => c.deal.suppliers))).join(', ')
              : 'niente in subappalto'} />
          <Num label="Margine sul venduto"
            value={tot.sold > 0 ? `${eur(tot.margin)} · ${Math.round((tot.margin / tot.sold) * 100)}%` : '—'}
            hint={tot.sold > 0 ? 'venduto a corpo meno i lavori affidati fuori' : 'niente venduto a corpo'}
            tone={tot.margin < 0 ? 'error' : tot.sold > 0 ? 'success' : undefined} />
        </div>

        {(tot.daQuotare > 0 || loose.length > 0) && (
          <div className="px-5 pb-4 flex flex-wrap gap-2">
            {tot.daQuotare > 0 && (
              <span className="inline-flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1 rounded-lg
                               bg-warning-dim text-warning border border-warning/30">
                <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                {tot.daQuotare} {tot.daQuotare === 1 ? 'lavoro' : 'lavori'} senza accordo
              </span>
            )}
            {loose.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-2xs font-semibold px-2.5 py-1 rounded-lg
                               bg-surface-active text-text-secondary border border-border">
                {loose.length} {loose.length === 1 ? 'accordo' : 'accordi'} senza progetto
              </span>
            )}
          </div>
        )}

        {cards.length > 3 && (
          <div className="px-5 pb-4">
            <label className="sr-only" htmlFor="cerca-lavoro">Cerca un lavoro, un servizio o un fornitore</label>
            <div className="flex items-center gap-2 bg-background border border-border-interactive rounded-xl px-3 py-2">
              <Search className="w-3.5 h-3.5 text-text-tertiary shrink-0" aria-hidden="true" />
              <input id="cerca-lavoro" value={q} onChange={e => setQ(e.target.value)}
                placeholder="Cerca un lavoro, un servizio, un fornitore…"
                className="flex-1 bg-transparent text-2xs text-text-primary outline-none" />
            </div>
          </div>
        )}
      </section>

      {/* ══ un riquadro per lavoro ══ */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-2xs text-text-tertiary">
            {q ? 'Nessun lavoro con questo nome.' : 'Questo cliente non ha progetti: l’economics nasce da un lavoro.'}
          </p>
        </div>
      ) : filtered.map(({ project, streams: own, items, deal }) => {
        const open = openId === project.id
        return (
          <section key={project.id}
            className={`bg-surface border rounded-2xl shadow-soft overflow-hidden ${
              !deal.quoted ? 'border-warning/40' : 'border-border'}`}>
            <button type="button" aria-expanded={open}
              onClick={() => setOpenId(open ? null : project.id)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-hover">
              <Briefcase className={`w-4 h-4 shrink-0 ${deal.quoted ? 'text-info' : 'text-warning'}`}
                aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-text-primary truncate">{project.name}</p>
                <p className="text-2xs text-text-tertiary mt-0.5">
                  {deal.quoted ? (
                    <>
                      {deal.recurring > 0 && <>{eur(deal.recurring)}/mese</>}
                      {deal.recurring > 0 && deal.sold > 0 && ' · '}
                      {deal.sold > 0 && <>{eur(deal.sold)} a corpo</>}
                      {deal.external > 0 && (
                        <span className="text-orange"> · {eur(deal.external)} affidati fuori</span>
                      )}
                      {deal.suppliers.length > 0 && <> a {deal.suppliers.join(', ')}</>}
                    </>
                  ) : (
                    <span className="text-warning font-semibold">
                      Da quotare{deal.draft > 0 ? ` · ${eur(deal.draft)} in bozza` : ''}
                    </span>
                  )}
                </p>
              </div>

              {/* Il margine del lavoro: la ragione per cui questa pagina esiste */}
              {deal.sold > 0 && (
                <span className="text-right shrink-0 hidden sm:block">
                  <span className={`block text-sm font-bold tabular ${
                    deal.margin < 0 ? 'text-error' : 'text-success'}`}>{eur(deal.margin)}</span>
                  <span className="block text-2xs text-text-tertiary">
                    <Percent className="w-2.5 h-2.5 inline" aria-hidden="true" />
                    {' '}{Math.round(deal.pct * 100)}% di margine
                  </span>
                </span>
              )}
              {deal.sold === 0 && deal.monthlyMargin !== 0 && (
                <span className="text-right shrink-0 hidden sm:block">
                  <span className={`block text-sm font-bold tabular ${
                    deal.monthlyMargin < 0 ? 'text-error' : 'text-success'}`}>
                    {eur(deal.monthlyMargin)}
                  </span>
                  <span className="block text-2xs text-text-tertiary">al mese</span>
                </span>
              )}

              <ChevronDown className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${
                open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>

            {open && (
              <div className="border-t border-border p-4 space-y-4 bg-background/40">
                {/* quello che il cliente paga */}
                <ContractsPanel
                  scope={{ kind: 'project', projectId: project.id, clientId }}
                  streams={own}
                  installments={installments}
                  services={services}
                  profiles={profiles}
                  projects={[]}
                  canEdit={canEdit}
                  defaultKind={project.kind ?? defaultKind}
                  defaultStart={defaultStart ?? null}
                  defaultEnd={defaultEnd ?? null}
                  title="Accordi su questo lavoro"
                  subtitle="Quanto paga il cliente e quando: le rate che cadono nel mese le materializza il conto economico"
                />

                {/* quello che si dà via */}
                <ProjectCostsPanel
                  projectId={project.id}
                  month={month}
                  items={items as unknown as CostItem[]}
                  actuals={actuals.filter(a => items.some(i => i.id === a.cost_item_id))}
                  canEdit={canEdit}
                  contracts={own.filter(s => s.status !== 'bozza').map(s => ({
                    id: s.id, label: s.label, billing: s.billing,
                    terms: s.payment_terms ?? null,
                    installments: installments.filter(i => i.stream_id === s.id).length,
                  }))}
                />

                {/* il conto, in una riga */}
                <div className="rounded-xl border border-border bg-surface px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <p className="text-2xs text-text-secondary">
                      {deal.sold > 0 ? (
                        <>Venduto {eur(deal.sold)} − affidato fuori {eur(deal.external)} ={' '}
                          <strong className={deal.margin < 0 ? 'text-error' : 'text-success'}>
                            {eur(deal.margin)}
                          </strong>{' '}({Math.round(deal.pct * 100)}%)</>
                      ) : deal.recurring > 0 ? (
                        <>Canone {eur(deal.recurring)}/mese − affidato fuori{' '}
                          {eur(deal.recurringExternal)}/mese ={' '}
                          <strong className={deal.monthlyMargin < 0 ? 'text-error' : 'text-success'}>
                            {eur(deal.monthlyMargin)}
                          </strong>/mese</>
                      ) : (
                        <>Nessun accordo confermato su questo lavoro: finché non c&apos;è, il conto
                          economico non ha righe da generare</>
                      )}
                    </p>
                    <Link href={`/progetti/${project.id}?tab=economics`}
                      className="text-2xs font-semibold text-info hover:underline flex items-center gap-1 shrink-0">
                      Apri il progetto <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                    </Link>
                  </div>
                  {deal.margin < 0 && deal.sold > 0 && (
                    <p className="text-2xs text-error mt-1.5">
                      Il subappalto costa più di quanto il cliente paga. Su un lavoro digital la
                      quota dei soci si calcola su questo margine: così com&apos;è, questo lavoro
                      non paga nemmeno chi lo consegna.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        )
      })}

      {/* ══ gli accordi che un progetto non ce l'hanno ══ */}
      {loose.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-2xs text-text-secondary">
              Questi accordi non stanno su nessun lavoro. Esistono per davvero — una quota
              partner, un retainer di consulenza — ma <strong className="text-text-primary">non
              entrano nel margine di nessun progetto</strong>: collegarli a un lavoro è quello che
              rende il margine calcolabile
            </p>
          </div>
          <ContractsPanel
            scope={{ kind: 'client', clientId }}
            streams={loose}
            installments={installments}
            services={services}
            profiles={profiles}
            projects={[]}
            canEdit={canEdit}
            defaultKind={defaultKind}
            defaultStart={defaultStart ?? null}
            defaultEnd={defaultEnd ?? null}
            title="Accordi senza progetto"
            subtitle="Quote, retainer, consulenze: fatturano ma non hanno un lavoro a cui appartenere"
          />
        </div>
      )}

      <p className="flex items-start gap-2 text-2xs text-text-tertiary">
        <Truck className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        Il tempo del team interno non entra nei lavori affidati fuori: sta nel costo del lavoro
        aziendale. Mescolarli darebbe un margine più corretto in teoria e inutilizzabile in pratica,
        perché nessuno rileva le ore. Qui c&apos;è solo quello che esce verso qualcun altro
      </p>
    </div>
  )
}

function Num({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: 'error' | 'warning' | 'success'
}) {
  const cls = tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning'
    : tone === 'success' ? 'text-success' : 'text-text-primary'
  return (
    <div className="rounded-xl border border-border bg-background px-3.5 py-3">
      <p className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold tabular mt-0.5 ${cls}`}>{value}</p>
      {hint && <p className="text-2xs text-text-tertiary mt-0.5 truncate" title={hint}>{hint}</p>}
    </div>
  )
}
