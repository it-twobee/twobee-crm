import { createClient } from '@/lib/supabase/server'
import { monthKey, monthLabel, shiftMonth, computeMonth, rowToPlConfig, type Partner } from '@/lib/pl'
import { linesForMonth, type Installment, type RevenueStream, type Coverage } from '@/lib/revenue'
import { plannedForMonth, isPayrollCenter, FREQUENCY_LABEL, type CostItem } from '@/lib/costs'
import { rowContext, toRevenueLine, toCostLine } from '@/lib/pl-rows'
import { costoLavoroPrevisto } from '@/lib/payroll-forecast'
import { eur2 } from '@/lib/money'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ChevronDown, Info } from 'lucide-react'
import type { ReactNode } from 'react'

export const revalidate = 0

type Row = Record<string, unknown>
const num = (v: unknown) => Number(v ?? 0)
const r2 = (n: number) => Math.round(n * 100) / 100

const NOV = '2026-11-01'

/* Mobile first: tutto è una colonna di righe che vanno a capo, mai una tabella
   che scorre di lato. Da `md` le stesse righe si allargano, non cambiano forma. */
function Section({ title, total, note, empty, defaultOpen = true, children }: {
  title: string; total?: string; note?: string; empty?: string; defaultOpen?: boolean; children?: ReactNode
}) {
  return (
    <details open={defaultOpen} className="group bg-surface border border-border rounded-2xl overflow-hidden">
      <summary className="flex items-center gap-3 px-4 min-h-[52px] py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-text-primary">{title}</span>
          {note && <span className="block text-2xs text-text-tertiary leading-snug">{note}</span>}
        </span>
        {total && <span className="text-sm font-semibold text-text-primary tabular-nums">{total}</span>}
        <ChevronDown className="w-4 h-4 text-text-tertiary transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-border">
        {empty ? <p className="px-4 py-5 text-sm text-text-tertiary">{empty}</p> : children}
      </div>
    </details>
  )
}

function Row({ title, sub, amount, strong }: { title: string; sub?: string; amount: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-border/60 last:border-b-0">
      <div className="min-w-0">
        <p className={`text-sm leading-snug break-words ${strong ? 'font-semibold text-text-primary' : 'text-text-primary'}`}>{title}</p>
        {sub && <p className="text-2xs text-text-tertiary leading-snug mt-0.5 break-words">{sub}</p>}
      </div>
      <p className={`text-sm tabular-nums whitespace-nowrap ${strong ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>{amount}</p>
    </div>
  )
}

function GroupHead({ label, total }: { label: string; total: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-1.5 bg-surface-hover border-b border-border/60">
      <p className="text-2xs font-semibold text-text-secondary">{label}</p>
      <p className="text-2xs font-semibold text-text-secondary tabular-nums">{total}</p>
    </div>
  )
}

function Callout({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  const c = tone === 'warning' ? 'bg-warning-dim text-warning' : 'bg-surface-hover text-text-secondary'
  return (
    <div className={`flex gap-2 rounded-xl px-3 py-2.5 text-2xs leading-snug ${c}`}>
      <Info className="w-4 h-4 shrink-0 mt-px" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function MonthLink({ href, label, dir }: { href: string; label: string; dir: 'prev' | 'next' }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <Link href={href} aria-label={label}
      className="flex items-center justify-center w-11 h-11 rounded-xl border border-border text-text-secondary hover:bg-surface-hover press">
      <Icon className="w-5 h-5" />
    </Link>
  )
}

export default async function NovembrePage({ searchParams }: { searchParams: { m?: string } }) {
  const month = /^\d{4}-\d{2}-01$/.test(searchParams.m ?? '') ? searchParams.m! : NOV
  const sb = await createClient()

  const [
    { data: streams }, { data: inst }, { data: streamProjects }, { data: items },
    { data: centers }, { data: cfg }, { data: partnerRows }, { data: clients }, { data: projects },
  ] = await Promise.all([
    sb.from('revenue_streams').select('*'),
    sb.from('revenue_installments').select('*'),
    sb.from('revenue_stream_projects').select('stream_id, project_id'),
    sb.from('cost_items').select('*').eq('is_active', true),
    sb.from('cost_centers').select('id, name'),
    sb.from('pl_config').select('*').eq('id', true).maybeSingle(),
    sb.from('pl_partners').select('*').eq('is_active', true).order('sort_order'),
    sb.from('clients').select('id, company_name, display_name, sales_owner_id, sales_owner_name'),
    sb.from('projects').select('id, name').is('deleted_at', null),
  ])

  const coverage: Coverage = new Map()
  for (const r of (streamProjects ?? []) as { stream_id: string; project_id: string }[]) {
    coverage.set(r.stream_id, [...(coverage.get(r.stream_id) ?? []), r.project_id])
  }
  const clientName = new Map(((clients ?? []) as Row[]).map(c => [String(c.id), String(c.display_name || c.company_name)]))
  const projectName = new Map(((projects ?? []) as Row[]).map(p => [String(p.id), String(p.name)]))
  const centerName = new Map(((centers ?? []) as Row[]).map(c => [String(c.id), String(c.name)]))

  /* Entrate: le stesse righe che «Prepara il mese» scriverebbe. */
  const lines = linesForMonth(
    (streams ?? []) as unknown as RevenueStream[], (inst ?? []) as unknown as Installment[], month, coverage)
  const revenue = r2(lines.reduce((s, l) => s + l.amount_net, 0))

  /* Uscite: le voci di piano che cadono nel mese. Il personale non si somma da qui:
     il costo del lavoro viene dall'organico, e le voci HR del piano restano
     elencate ma fuori dal totale — altrimenti il lavoro conta due volte. */
  const due = plannedForMonth((items ?? []) as unknown as CostItem[], month)
  const isHr = (i: CostItem) => isPayrollCenter(i.center_id ? centerName.get(i.center_id) : null)
  const subs = due.filter(i => i.project_id)
  const hr = due.filter(i => !i.project_id && isHr(i))
  const internal = due.filter(i => !i.project_id && !isHr(i))
  const sum = (xs: CostItem[]) => r2(xs.reduce((s, i) => s + i.amount, 0))

  const lavoroMap = await costoLavoroPrevisto(sb, [month])
  const lavoro = lavoroMap?.get(month)?.totale ?? null

  /* Compensi: lo stesso motore del conto economico, sulle righe attese. È il
     maturato di questo mese, non l'erogazione del 20 (vedi la nota in pagina). */
  const ctx = rowContext({
    month, clients: (clients ?? []) as Row[], streams: (streams ?? []) as Row[],
    streamProjects: (streamProjects ?? []) as { stream_id: string; project_id: string }[],
  })
  const revRows = lines.map((l, i) => toRevenueLine({
    id: `${l.stream_id}:${l.installment_id ?? 'canone'}:${i}`, label: l.label, client_id: l.client_id,
    plan_amount: l.amount_net, invoices: 1, amount_net: l.amount_net, vat_rate: l.vat_rate,
    kind: l.kind, sales_owner_id: l.sales_owner_id, stream_id: l.stream_id,
    installment_id: l.installment_id, project_id: l.project_id,
    pass_through: l.pass_through, sales_split: l.sales_split,
  }, ctx))
  const costRows = [
    ...[...internal, ...subs].map(i => toCostLine({
      id: i.id, center_id: i.center_id, cost_item_id: i.id, project_id: i.project_id ?? null,
      installment_id: i.installment_id ?? null, category: i.category, label: i.label,
      cost_type: i.cost_type, budget: i.amount, actual: i.amount,
      vat_applied: i.vat_applied, vat_rate: i.vat_rate,
    }, ctx)),
    ...(lavoro != null ? [toCostLine({
      id: 'lavoro', category: 'Personale', label: 'Costo del lavoro dall\'organico',
      cost_type: 'F', budget: lavoro, actual: lavoro,
    }, ctx)] : []),
  ]
  const t = computeMonth(revRows, costRows, rowToPlConfig(cfg as Row | null),
    ((partnerRows ?? []) as Row[]).map(p => ({
      id: String(p.id), label: String(p.label),
      takes_delivery: p.takes_delivery !== false, takes_residual: p.takes_residual !== false,
    })) as Partner[])

  const costoTot = r2(sum(internal) + sum(subs) + (lavoro ?? 0))
  const margine = r2(revenue - costoTot)

  const byClient = new Map<string, { name: string; total: number; lines: typeof lines }>()
  for (const l of lines) {
    const k = l.client_id ?? 'fuori'
    const cur = byClient.get(k) ?? { name: (l.client_id && clientName.get(l.client_id)) || 'Fuori anagrafica', total: 0, lines: [] }
    cur.total = r2(cur.total + l.amount_net)
    cur.lines.push(l)
    byClient.set(k, cur)
  }
  const clientsSorted = Array.from(byClient.values()).sort((a, b) => b.total - a.total)
  const ratio = revenue > 0 ? costoTot / revenue : 0
  const oggi = monthKey(new Date())
  const usciteTot = costoTot

  return (
    <div className="min-h-full pb-8">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-1.5 flex items-center gap-2">
          <MonthLink href={`/lab/novembre?m=${shiftMonth(month, -1)}`} label={`Mese precedente: ${monthLabel(shiftMonth(month, -1))}`} dir="prev" />
          <div className="flex-1 text-center min-w-0">
            <h1 className="text-base font-semibold text-text-primary leading-tight">{monthLabel(month)}</h1>
            <p className="text-2xs text-text-tertiary leading-tight">
              Laboratorio · sola lettura
              {month !== oggi && <> · <Link href={`/lab/novembre?m=${oggi}`} className="underline text-gold-text">torna a {monthLabel(oggi)}</Link></>}
            </p>
          </div>
          <MonthLink href={`/lab/novembre?m=${shiftMonth(month, 1)}`} label={`Mese successivo: ${monthLabel(shiftMonth(month, 1))}`} dir="next" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 pt-3 space-y-3">
        <section className="bg-surface border border-border rounded-2xl p-4" aria-label="Riepilogo del mese">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-2xs text-text-tertiary">Margine previsto</p>
              <p className={`text-2xl font-semibold tabular-nums leading-tight ${margine < 0 ? 'text-error' : 'text-text-primary'}`}>{eur2(margine)}</p>
            </div>
            <span className="text-2xs font-semibold rounded-full px-2.5 py-1 bg-surface-hover text-text-secondary whitespace-nowrap">
              {revenue > 0 ? `${Math.round((margine / revenue) * 100)}% delle entrate` : 'nessuna entrata'}
            </span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border mt-3 pt-3 border-t border-border">
            <div className="pr-3">
              <p className="text-2xs text-text-tertiary">Entrate</p>
              <p className="text-base font-semibold text-text-primary tabular-nums">{eur2(revenue)}</p>
              <p className="text-2xs text-text-tertiary">{lines.length} {lines.length === 1 ? 'riga' : 'righe'} · IVA esclusa</p>
            </div>
            <div className="pl-3">
              <p className="text-2xs text-text-tertiary">Uscite</p>
              <p className="text-base font-semibold text-text-primary tabular-nums">{eur2(usciteTot)}</p>
              <p className="text-2xs text-text-tertiary">{lavoro == null ? 'senza costo del lavoro (n/d)' : 'struttura, subappalti, lavoro'}</p>
            </div>
          </div>
          {revenue > 0 && (
            <div className="mt-3" role="img" aria-label={`Le uscite assorbono il ${Math.round(ratio * 100)}% delle entrate`}>
              <div className="h-1.5 rounded-full bg-surface-active overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(ratio * 100))}%`, background: ratio > 1 ? 'var(--color-error)' : 'var(--color-accent)' }} />
              </div>
            </div>
          )}
        </section>

        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          <div className="space-y-3">
            <Section title="Entrate" total={eur2(revenue)} note={`${byClient.size} ${byClient.size === 1 ? 'cliente' : 'clienti'} · canoni e rate`}
              empty={lines.length === 0 ? 'Nessun canone né rata in questo mese.' : undefined}>
              {clientsSorted.map(c => (
                <div key={c.name}>
                  <Row strong title={c.name} sub={c.lines.length > 1 ? `${c.lines.length} voci` : c.lines[0].label} amount={eur2(c.total)} />
                  {c.lines.length > 1 && c.lines.map((l, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 pl-8 pr-4 py-1.5 border-b border-border/60 last:border-b-0 bg-surface-hover/40">
                      <p className="text-2xs text-text-secondary leading-snug break-words min-w-0">
                        {l.label}{l.pass_through ? ' · partita di giro' : ''} · {l.kind}
                      </p>
                      <p className="text-2xs text-text-secondary tabular-nums whitespace-nowrap">{eur2(l.amount_net)}</p>
                    </div>
                  ))}
                </div>
              ))}
            </Section>

            <Section title="Compensi dei soci" note="Stima sul maturato del mese" defaultOpen={false}>
              <div className="p-3 space-y-3">
                <Callout>
                  Non è l&apos;erogazione del 20: quella paga il maturato del mese prima, incassato entro quel giorno.
                  Quello che il cliente non ha pagato slitta alla finestra dopo.
                </Callout>
                {t.perPartner.length === 0
                  ? <p className="text-sm text-text-tertiary px-1">Nessun socio attivo.</p>
                  : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {t.perPartner.map(p => (
                        <div key={p.partner.id} className="rounded-xl border border-border px-3 py-2.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-2xs text-text-tertiary">{p.partner.label}</p>
                            <p className="text-base font-semibold text-text-primary tabular-nums">{eur2(p.total)}</p>
                          </div>
                          <p className="text-2xs text-text-tertiary tabular-nums leading-snug mt-1">
                            Erogato {eur2(p.delivery + p.residual)} · Digital {eur2(p.digital)} · Provv. {eur2(p.salesShare)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </Section>
          </div>

          <Section title="Uscite" total={eur2(usciteTot)} note="Struttura, lavoro e subappalti">
            <GroupHead label="Struttura" total={eur2(sum(internal))} />
            {internal.length === 0 && <p className="px-4 py-3 text-sm text-text-tertiary">Nessuna voce ricorrente in questo mese.</p>}
            {internal.map(i => (
              <Row key={i.id} title={i.label}
                sub={`${i.center_id ? centerName.get(i.center_id) ?? 'Senza area' : 'Senza area'} · ${FREQUENCY_LABEL[i.frequency]}`}
                amount={eur2(i.amount)} />
            ))}

            <GroupHead label="Lavoro" total={lavoro == null ? 'n/d' : eur2(lavoro)} />
            <div className="px-4 py-2.5 space-y-2 border-b border-border/60">
              {lavoro == null
                ? <Callout tone="warning">L&apos;organico non si legge o è vuoto: il costo del lavoro non è zero, è sconosciuto.</Callout>
                : <p className="text-2xs text-text-secondary leading-snug">Dall&apos;organico in forza nel mese.</p>}
              {hr.length > 0 && (
                <Callout>
                  Voci HR nel piano costi, <strong>non sommate</strong> per non contare il lavoro due volte:{' '}
                  {hr.map(i => `${i.label} ${eur2(i.amount)}`).join(' · ')} (totale {eur2(sum(hr))}).
                </Callout>
              )}
            </div>

            <GroupHead label="Affidato fuori" total={eur2(sum(subs))} />
            {subs.length === 0 && <p className="px-4 py-3 text-sm text-text-tertiary">Nessun subappalto previsto in questo mese.</p>}
            {subs.map(i => (
              <Row key={i.id} title={i.supplier || i.label}
                sub={(i.project_id && projectName.get(i.project_id)) || undefined} amount={eur2(i.amount)} />
            ))}
          </Section>
        </div>
      </div>
    </div>
  )
}
