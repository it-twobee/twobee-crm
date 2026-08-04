'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  Wallet, TrendingUp, TrendingDown, CalendarClock, Target, Sparkles,
  Repeat, Package, AlertTriangle, Info, Briefcase, Clock, Truck,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { monthLabel, type PlConfig, type PlKind } from '@/lib/pl'
import {
  billing, relationship, forecast, rfmRaw, rfmScore, trend, upsell, contribution,
  type ClientInput, type RfmRaw, type Metric,
} from '@/lib/client-economics'
import { ContractsPanel, type CatalogService } from '@/components/economics/ContractsPanel'
import { mrrOrigin, PAYMENT_STATUS_HINT } from '@/lib/economics-source'
import { fallsIn, type SubItem } from '@/lib/subcontracts'

const eur = (n: number) => formatCurrency(Math.round(n))
const pc = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(0)}%`

const PAY_LABEL: Record<string, string> = {
  pagato: 'Tutto incassato', in_attesa: 'Da pagare', scaduto: 'Non pagato',
}
const PAY_TONE: Record<string, string> = {
  pagato: 'bg-success-dim border-success/40 text-success',
  in_attesa: 'bg-warning-dim border-warning/40 text-warning',
  scaduto: 'bg-error-dim border-error/40 text-error',
}

const RFM_TONE: Record<string, string> = {
  'Campione': 'bg-success-dim border-success/40 text-success',
  'Cliente forte': 'bg-success-dim border-success/40 text-success',
  'Fedele': 'bg-info-dim border-info/40 text-info',
  'Da coltivare': 'bg-info-dim border-info/40 text-info',
  'Nuovo o sporadico': 'bg-accent-dim border-accent/40 text-accent',
  'Da recuperare': 'bg-warning-dim border-warning/40 text-warning',
  'Dormiente': 'bg-error-dim border-error/40 text-error',
}

export function ClientEconomicsTab({
  client, base, config, kind, catalog, basePath,
  services, profiles, canEdit, mrrStored, mrrSource, paymentStatus,
  subItems = [], projectNames = {},
}: {
  client: ClientInput
  /** RFM è relativo: serve la fotografia degli altri clienti per i quintili */
  base: RfmRaw[]
  config: PlConfig
  kind: PlKind
  catalog: { service_type: string; service_subtype: string | null; label: string; standard_price: number | null }[]
  basePath: string
  /** listino: alimenta gli accordi «da catalogo» */
  services: CatalogService[]
  profiles: { id: string; full_name: string }[]
  canEdit: boolean
  /** il numero che sta in anagrafica e chi l'ha scritto: i contratti o una persona */
  mrrStored: number
  mrrSource: 'contratti' | 'anagrafica'
  paymentStatus: string
  /** §192 — i lavori affidati fuori sui progetti di questo cliente */
  subItems?: SubItem[]
  projectNames?: Record<string, string>
}) {
  /* §192 — quanto di questo cliente esce verso qualcun altro. Il subappalto sta
     sul progetto ma il margine è del cliente: senza questo blocco la scheda dice
     quanto paga e non quanto resta, ed è la differenza che decide se un cliente
     conviene. Si legge e non si modifica: il patto si cambia sul progetto. */
  const sub = useMemo(() => {
    const mese = new Date().toISOString().slice(0, 7) + '-01'
    const attivi = (subItems ?? []).filter(i => i.is_active)
    const perProgetto = new Map<string, { name: string; monthly: number; items: SubItem[] }>()
    for (const i of attivi) {
      if (!i.project_id) continue
      const cur = perProgetto.get(i.project_id)
        ?? { name: (projectNames ?? {})[i.project_id] ?? 'Progetto', monthly: 0, items: [] }
      if (fallsIn(i, mese)) cur.monthly = Math.round((cur.monthly + i.amount) * 100) / 100
      cur.items.push(i)
      perProgetto.set(i.project_id, cur)
    }
    const monthly = Array.from(perProgetto.values()).reduce((n, p) => n + p.monthly, 0)
    return {
      rows: Array.from(perProgetto, ([id, v]) => ({ id, ...v })).sort((a, b) => b.monthly - a.monthly),
      monthly: Math.round(monthly * 100) / 100,
      suppliers: Array.from(new Set(attivi.map(i => i.supplier).filter(Boolean))) as string[],
    }
  }, [subItems, projectNames])

  const b = useMemo(() => billing(client), [client])
  const rel = useMemo(() => relationship(client), [client])
  const fc = useMemo(() => forecast(client, 6), [client])
  const rfm = useMemo(() => rfmScore(rfmRaw(client), base), [client, base])
  const tr = useMemo(() => trend(client), [client])
  const contrib = useMemo(() => contribution(client, config, kind), [client, config, kind])
  const opportunities = useMemo(() => upsell(client, catalog), [client, catalog])

  // il canone attivo è la somma dei contratti; finché non ce ne sono resta il
  // numero d'anagrafica, e va detto da dove viene invece di mostrare zero
  const fromContracts = client.streams
    .filter(s => s.billing === 'recurring' && s.status === 'attivo')
    .reduce((n, s) => n + s.amount, 0)
  /* §176: il canone del cliente è la somma dei suoi contratti, punto.
     `clients.mrr` resta solo come residuo storico di chi non ha ancora quotato,
     e come tale si segnala — non si mostra al posto del numero vero. */
  const sold = client.streams.filter(s => s.status !== 'bozza')
  const derived = sold.length > 0
  const mrr = fromContracts
  const origin = mrrOrigin(derived ? 'contratti' : 'anagrafica', sold.length)
  const peak = Math.max(1, ...client.history.map(h => h.amount), ...fc.rows.map(r => r.amount))
  const renewal = rel.renewalInDays

  return (
    <div className="space-y-5">

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Wallet className="w-4 h-4 text-gold-text" />} label="Fatturato storico" m={b.lifetime} fmt={eur} />
        <Kpi icon={<Repeat className="w-4 h-4 text-success" />} label="Canone attivo"
          m={{
            value: mrr, ready: mrr > 0,
            basis: derived
              ? (mrr > 0 ? `somma dei canoni attivi · ${origin.label}` : 'nessun contratto ricorrente attivo')
              : 'nessun contratto: quota i progetti qui sotto',
          }}
          fmt={n => `${eur(n)}/mese`} />
        <Kpi icon={<CalendarClock className="w-4 h-4 text-info" />} label="Durata rapporto" m={rel.months}
          fmt={n => `${n} mes${n === 1 ? 'e' : 'i'}`} />
        <Kpi icon={tr.ready && tr.value < 0 ? <TrendingDown className="w-4 h-4 text-error" /> : <TrendingUp className="w-4 h-4 text-success" />}
          label="Andamento" m={tr} fmt={pc} tone={tr.ready ? (tr.value < 0 ? 'error' : 'success') : undefined} />
      </div>

      {/* ── contratti: qui si quota, il resto della pagina lo legge ── */}
      <ContractsPanel
        scope={{ kind: 'client', clientId: client.id }}
        streams={client.streams}
        installments={client.installments}
        services={services}
        profiles={profiles}
        projects={client.projects.map(p => ({ id: p.id, name: p.name, status: p.status }))}
        canEdit={canEdit}
        defaultKind={kind}
        defaultStart={client.contract_start?.slice(0, 10) ?? null}
        defaultEnd={client.contract_end?.slice(0, 10) ?? null}
        title="Contratti del cliente"
        subtitle="Accordi da listino o custom, uno per servizio. Alimentano MRR, previsionale e conto economico"
      />

      {/* ── §192 · quanto di questo cliente esce verso qualcun altro ── */}
      {sub.rows.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
          <div className="flex items-end justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <Truck className="w-4 h-4 text-orange" aria-hidden="true" />Lavori affidati fuori
              </h3>
              <p className="text-2xs text-text-tertiary mt-0.5">
                {sub.suppliers.length > 0
                  ? <>Subappaltatori su questo cliente: {sub.suppliers.join(', ')}</>
                  : 'Nessun subappaltatore ha un nome: si scrive nella scheda del progetto'}
                {' '}· si legge, si modifica sul progetto
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-text-primary tabular">{eur(sub.monthly)}</p>
              <p className="text-2xs text-text-tertiary">al mese, contro {eur(mrr)} di canone</p>
            </div>
          </div>
          <ul className="divide-y divide-border/60">
            {sub.rows.map(r => (
              <li key={r.id} className="px-5 py-2.5">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <Link href={`/progetti/${r.id}?tab=economics`}
                    className="text-2xs font-bold text-text-primary hover:text-gold-text truncate">
                    {r.name}
                  </Link>
                  <span className="text-2xs text-text-tertiary">
                    {r.items.length} {r.items.length === 1 ? 'lavorazione' : 'lavorazioni'}
                  </span>
                  <span className="ml-auto text-2xs tabular font-semibold text-text-primary">
                    {r.monthly > 0 ? `${eur(r.monthly)} questo mese` : 'niente questo mese'}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {r.items.map(i => (
                    <li key={i.id} className="flex items-baseline gap-2 text-2xs">
                      <span className="truncate text-text-secondary">{i.label}</span>
                      <span className={`shrink-0 ${i.supplier ? 'text-text-tertiary' : 'text-warning font-semibold'}`}>
                        {i.supplier ?? 'fornitore da scrivere'}
                      </span>
                      <span className="ml-auto tabular text-text-tertiary shrink-0">{eur(i.amount)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="px-5 py-3 border-t border-border text-2xs text-text-tertiary">
            Il margine del mese lo calcola il <Link href="/economics" className="text-info hover:underline">conto
            economico</Link>, progetto per progetto: è la sezione dove ogni subappalto atterra
          </p>
        </section>
      )}

      {!derived && mrrStored > 0 && (
        <p className="flex items-start gap-2 text-2xs text-warning">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Resta un canone storico di {eur(mrrStored)}/mese in anagrafica, senza nessun contratto dietro. Non si
          scrive più da nessuna parte: il conto economico lo genera come riga «senza contratto» e la marginalità
          per progetto non lo vede. Quota i progetti qui sopra e sparisce da solo.
        </p>
      )}

      {/* ── segmentazione ── */}
      <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Target className="w-4 h-4 text-accent" />Segmentazione RFM
            </h3>
            <p className="text-2xs text-text-tertiary mt-0.5">{rfm.basis}</p>
          </div>
          {rfm.ready && (
            <span className={`text-2xs font-semibold px-2.5 py-1 rounded-full border ${RFM_TONE[rfm.label] ?? 'bg-surface-active border-border-strong text-text-secondary'}`}>
              {rfm.label}
            </span>
          )}
        </div>

        {rfm.ready ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Score label="Recency" hint="da quanto non fattura" value={rfm.r} />
            <Score label="Frequency" hint="mesi con fatturato su 12" value={rfm.f} />
            <Score label="Monetary" hint="fatturato ultimi 12 mesi" value={rfm.m} />
          </div>
        ) : (
          <NotReady basis={rfm.basis} />
        )}
      </section>

      {/* ── previsionale ── */}
      <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Sparkles className="w-4 h-4 text-gold-text" />Previsionale 6 mesi
            </h3>
            <p className="text-2xs text-text-tertiary mt-0.5">
              Non è una stima: è la somma dei contratti attivi se nessuno disdice
            </p>
          </div>
          {fc.total.ready && <span className="text-lg font-bold text-text-primary tabular">{eur(fc.total.value)}</span>}
        </div>

        {fc.total.ready ? (
          <>
            <div className="space-y-1.5">
              {fc.rows.map(r => (
                <div key={r.month} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-2xs text-text-secondary">{monthLabel(r.month)}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-active overflow-hidden">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, (r.amount / peak) * 100)}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-2xs tabular text-text-primary">{eur(r.amount)}</span>
                </div>
              ))}
            </div>
            {fc.expiring.length > 0 && (
              <p className="flex items-start gap-2 text-2xs text-warning mt-3">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {fc.expiring.length} contratt{fc.expiring.length > 1 ? 'i scadono' : 'o scade'} dentro l&apos;orizzonte:{' '}
                {fc.expiring.map(s => s.label).join(' · ')}. Il previsionale cala da lì in poi.
              </p>
            )}
          </>
        ) : (
          <NotReady basis={fc.total.basis} action="Aggiungi i contratti nella scheda Economics del progetto." />
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── storico ── */}
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
            <h3 className="text-sm font-bold text-text-primary">Fatturato mese per mese</h3>
            {/* §178: lo stato esiste solo se esiste qualcosa da incassare */}
            {client.history.length > 0 || client.installments.length > 0 ? (
              <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full border ${PAY_TONE[paymentStatus] ?? 'bg-surface-active border-border-strong text-text-secondary'}`}
                title={PAYMENT_STATUS_HINT}>
                {PAY_LABEL[paymentStatus] ?? paymentStatus}
              </span>
            ) : (
              <span className="text-2xs text-text-tertiary" title="Nessuna rata né riga di conto economico: non c'è ancora niente da incassare">
                nessuna scadenza
              </span>
            )}
          </div>
          <p className="text-2xs text-text-tertiary mb-3">{b.lifetime.basis}</p>
          {client.history.length === 0 ? (
            <NotReady basis="nessun mese di conto economico registrato per questo cliente"
              action="I mesi si popolano da Economics → Conto economico." />
          ) : (
            <div className="space-y-1.5">
              {client.history.slice(-12).map(h => (
                <div key={h.month} className="flex items-center gap-3">
                  <Link href={`/economics?m=${h.month}`} className="w-24 shrink-0 text-2xs text-text-secondary hover:text-gold-text">
                    {monthLabel(h.month)}
                  </Link>
                  <div className="flex-1 h-2 rounded-full bg-surface-active overflow-hidden">
                    <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, (h.amount / peak) * 100)}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-2xs tabular text-text-primary">{eur(h.amount)}</span>
                  {h.amount > h.paid && (
                    <span className="text-2xs text-warning shrink-0" title="Non ancora incassato">•</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border">
            <Small label="Incassato" m={b.collected} />
            <Small label="Da incassare" m={b.unpaid} tone={b.unpaid.value > 0 ? 'warning' : undefined} />
            <Small label="Media mensile" m={b.avgMonth} />
            <Small label="Residuo TwoBee" m={contrib.residual} />
          </div>
        </section>

        {/* ── portafoglio ── */}
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary mb-1">
            <Briefcase className="w-4 h-4 text-gold-text" />Portafoglio
          </h3>
          <p className="text-2xs text-text-tertiary mb-3">
            {client.projects.length} progett{client.projects.length === 1 ? 'o' : 'i'} · {client.streams.length} contratt{client.streams.length === 1 ? 'o' : 'i'}
          </p>

          {client.projects.length === 0 ? (
            <NotReady basis="nessun progetto per questo cliente" />
          ) : (
            <div className="space-y-1.5">
              {client.projects.map(p => {
                const own = client.streams.filter(s => s.project_id === p.id)
                const rec = own.filter(s => s.billing === 'recurring' && s.status === 'attivo')
                  .reduce((n, s) => n + s.amount, 0)
                const one = own.filter(s => s.billing === 'one_off').reduce((n, s) => n + s.amount, 0)
                return (
                  <Link key={p.id} href={`${basePath}/${p.id}?tab=economics`}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-surface-hover transition-colors">
                    <span className="flex-1 min-w-0">
                      <span className="block text-2xs font-semibold text-text-primary truncate">{p.name}</span>
                      <span className="block text-2xs text-text-tertiary">{p.status}</span>
                    </span>
                    {rec > 0 && <span className="text-2xs tabular text-success shrink-0">{eur(rec)}/mese</span>}
                    {one > 0 && <span className="text-2xs tabular text-accent shrink-0">{eur(one)}</span>}
                    {own.length === 0 && <span className="text-2xs text-text-tertiary shrink-0">senza contratto</span>}
                  </Link>
                )
              })}
            </div>
          )}

          {renewal !== null && (
            <p className={`flex items-start gap-2 text-2xs mt-3 pt-3 border-t border-border ${
              renewal < 0 ? 'text-error' : renewal < 60 ? 'text-warning' : 'text-text-tertiary'
            }`}>
              <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {renewal < 0
                ? `Contratto scaduto da ${-renewal} giorni`
                : `Rinnovo fra ${renewal} giorni`}
            </p>
          )}
        </section>
      </div>

      {/* ── opportunità ── */}
      {opportunities.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-soft">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary mb-1">
            <Package className="w-4 h-4 text-info" />Servizi mai venduti a questo cliente
          </h3>
          <p className="text-2xs text-text-tertiary mb-3">
            Dal catalogo, con il prezzo di listino dove è compilato
          </p>
          <div className="flex flex-wrap gap-1.5">
            {opportunities.map(s => (
              <span key={`${s.service_type}|${s.service_subtype ?? ''}`}
                className="text-2xs px-2.5 py-1.5 rounded-lg border border-border text-text-secondary">
                {s.label}
                {s.standard_price != null && (
                  <span className="text-text-tertiary"> · {eur(s.standard_price)}</span>
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="flex items-start gap-2 text-2xs text-text-tertiary">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Gli indicatori che non hanno abbastanza dati lo dicono invece di mostrare zero: uno zero si legge
        come «vale zero» e su un rapporto appena avviato porterebbe a decisioni sbagliate. Si popolano
        man mano che registri mesi e contratti.
      </p>
    </div>
  )
}

function Kpi({ icon, label, m, fmt, tone }: {
  icon: React.ReactNode; label: string; m: Metric; fmt: (n: number) => string; tone?: 'success' | 'error'
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
      <div className="flex items-center gap-2 mb-1.5">{icon}
        <span className="text-2xs font-semibold text-text-secondary uppercase tracking-wider truncate">{label}</span>
      </div>
      {m.ready ? (
        <>
          <div className={`text-xl font-bold tabular ${tone === 'error' ? 'text-error' : tone === 'success' ? 'text-success' : 'text-text-primary'}`}>
            {fmt(m.value)}
          </div>
          <div className="text-2xs text-text-tertiary mt-0.5 truncate" title={m.basis}>{m.basis}</div>
        </>
      ) : (
        <>
          <div className="text-xl font-bold text-text-tertiary">—</div>
          <div className="text-2xs text-text-tertiary mt-0.5 leading-snug">{m.basis}</div>
        </>
      )}
    </div>
  )
}

function Score({ label, hint, value }: { label: string; hint: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-text-primary tabular">{value}</span>
        <span className="text-2xs text-text-tertiary">/5</span>
      </div>
      <div className="text-2xs font-semibold text-text-secondary mt-1">{label}</div>
      <div className="text-2xs text-text-tertiary">{hint}</div>
      <div className="flex gap-0.5 mt-2">
        {[1, 2, 3, 4, 5].map(i => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= value ? 'bg-accent' : 'bg-surface-active'}`} />
        ))}
      </div>
    </div>
  )
}

function Small({ label, m, tone }: { label: string; m: Metric; tone?: 'warning' }) {
  return (
    <div>
      <div className="text-2xs text-text-tertiary">{label}</div>
      <div className={`text-sm font-semibold tabular ${tone === 'warning' ? 'text-warning' : 'text-text-primary'}`}>
        {m.ready ? eur(m.value) : '—'}
      </div>
    </div>
  )
}

/** Un indicatore che non c'è deve spiegare perché, non mostrare zero. */
function NotReady({ basis, action }: { basis: string; action?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-4 text-center">
      <p className="text-2xs text-text-tertiary">{basis}</p>
      {action && <p className="text-2xs text-gold-text font-semibold mt-1">{action}</p>}
    </div>
  )
}
