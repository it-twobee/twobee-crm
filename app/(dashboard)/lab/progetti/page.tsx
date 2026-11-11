import { createClient } from '@/lib/supabase/server'
import { type Installment, type RevenueStream, type Coverage } from '@/lib/revenue'
import { projectDeal, type SubItem } from '@/lib/subcontracts'
import { eur2 } from '@/lib/money'
import Link from 'next/link'
import { ChevronLeft, Info } from 'lucide-react'

export const revalidate = 0

type Row = Record<string, unknown>
type StreamRow = RevenueStream
const r2 = (n: number) => Math.round(n * 100) / 100

export default async function ProgettiLabPage({ searchParams }: { searchParams: { q?: string; solo?: string } }) {
  const sb = await createClient()
  const [{ data: streams }, { data: inst }, { data: sp }, { data: items }, { data: clients }, { data: projects }] = await Promise.all([
    sb.from('revenue_streams').select('*'),
    sb.from('revenue_installments').select('*'),
    sb.from('revenue_stream_projects').select('stream_id, project_id'),
    sb.from('cost_items').select('*').eq('is_active', true).not('project_id', 'is', null),
    sb.from('clients').select('id, company_name, display_name'),
    sb.from('projects').select('id, name, client_id, status').is('deleted_at', null),
  ])

  const coverage: Coverage = new Map()
  for (const r of (sp ?? []) as { stream_id: string; project_id: string }[]) {
    coverage.set(r.stream_id, [...(coverage.get(r.stream_id) ?? []), r.project_id])
  }
  const clientName = new Map(((clients ?? []) as Row[]).map(c => [String(c.id), String(c.display_name || c.company_name)]))
  const allStreams = (streams ?? []) as unknown as StreamRow[]
  const allInst = (inst ?? []) as unknown as Installment[]
  const allItems = (items ?? []) as unknown as SubItem[]

  /* Un accordo che copre più progetti non si attribuisce a nessuno (§188): lo
     si elenca a parte, perché dirlo a uno solo falserebbe gli altri. */
  const shared = allStreams.filter(s => (coverage.get(s.id)?.length ?? 0) > 1 && s.status !== 'bozza')
  const sharedByProject = new Map<string, string[]>()
  for (const s of shared) for (const p of coverage.get(s.id)!) sharedByProject.set(p, [...(sharedByProject.get(p) ?? []), s.label])

  const q = (searchParams.q ?? '').trim().toLowerCase()
  const solo = searchParams.solo
  const rows = ((projects ?? []) as Row[]).map(p => {
    const id = String(p.id)
    const own = allStreams.filter(s => s.project_id === id && (coverage.get(s.id)?.length ?? 0) <= 1)
    const ownIds = new Set(own.map(s => s.id))
    const its = allItems.filter(i => i.project_id === id)
    const deal = projectDeal(own, its)
    const rate = allInst.filter(i => ownIds.has(i.stream_id))
    return {
      id, name: String(p.name),
      client: p.client_id ? clientName.get(String(p.client_id)) ?? null : null,
      hasClient: !!p.client_id,
      deal, rateTot: rate.length,
      rateInv: rate.filter(i => i.invoiced).length,
      ratePaid: rate.filter(i => i.paid).length,
      sharedWith: sharedByProject.get(id) ?? [],
    }
  })
    .filter(r => r.hasClient)
    .filter(r => !q || r.name.toLowerCase().includes(q) || (r.client ?? '').toLowerCase().includes(q))
    .filter(r => solo === 'daquotare' ? !r.deal.quoted && r.sharedWith.length === 0 : solo === 'negativi' ? r.deal.margin < 0 || r.deal.monthlyMargin < 0 : true)
    .sort((a, b) => (a.client ?? '').localeCompare(b.client ?? '') || a.name.localeCompare(b.name))

  const daQuotare = rows.filter(r => !r.deal.quoted && r.sharedWith.length === 0).length
  const negativi = rows.filter(r => r.deal.margin < 0 || r.deal.monthlyMargin < 0).length
  const chip = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`px-3 min-h-[36px] inline-flex items-center rounded-full border text-2xs font-semibold press ${on ? 'bg-gold text-on-gold border-gold' : 'border-border text-text-secondary hover:bg-surface-hover'}`}>{label}</Link>
  )

  return (
    <div className="min-h-full pb-8">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-1.5 flex items-center gap-2">
          <Link href="/lab" aria-label="Torna al Laboratorio" className="flex items-center justify-center w-11 h-11 rounded-xl border border-border text-text-secondary hover:bg-surface-hover press">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-text-primary leading-tight">Progetti</h1>
            <p className="text-2xs text-text-tertiary leading-tight">Laboratorio · sola lettura · IVA esclusa</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 pt-3 space-y-3">
        <form className="flex gap-2" action="/lab/progetti">
          <input name="q" defaultValue={searchParams.q ?? ''} placeholder="Cerca progetto o cliente"
            aria-label="Cerca progetto o cliente"
            className="flex-1 min-w-0 min-h-[44px] px-3 rounded-xl bg-surface border border-border-interactive text-sm text-text-primary" />
          {solo && <input type="hidden" name="solo" value={solo} />}
        </form>
        <div className="flex flex-wrap gap-2">
          {chip('/lab/progetti', `Tutti`, !solo)}
          {chip('/lab/progetti?solo=daquotare', `Da quotare · ${daQuotare}`, solo === 'daquotare')}
          {chip('/lab/progetti?solo=negativi', `Margine negativo · ${negativi}`, solo === 'negativi')}
        </div>

        {shared.length > 0 && (
          <div className="flex gap-2 rounded-xl px-3 py-2.5 text-2xs leading-snug bg-surface-hover text-text-secondary">
            <Info className="w-4 h-4 shrink-0 mt-px" aria-hidden />
            <p>
              {shared.length} {shared.length === 1 ? 'accordo copre' : 'accordi coprono'} più progetti
              ({shared.map(s => s.label).join(' · ')}): il venduto non è attribuibile a nessuno, quindi sui progetti coinvolti il margine è <strong>n/d</strong>.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {rows.length === 0 && <li className="px-4 py-5 text-sm text-text-tertiary bg-surface border border-border rounded-2xl">Nessun progetto con cliente per questo filtro.</li>}
          {rows.map(r => {
            const d = r.deal
            const nd = r.sharedWith.length > 0 && !d.quoted
            return (
              <li key={r.id} className="bg-surface border border-border rounded-2xl px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/progetti/${r.id}`} className="text-sm font-semibold text-text-primary hover:underline break-words">{r.name}</Link>
                    <p className="text-2xs text-text-tertiary leading-snug">{r.client}</p>
                  </div>
                  {nd
                    ? <span className="text-2xs text-text-tertiary border border-border rounded-full px-2 py-0.5 shrink-0">accordo condiviso</span>
                    : !d.quoted
                      ? <span className="text-2xs font-semibold bg-warning-dim text-warning rounded-full px-2 py-0.5 shrink-0">da quotare</span>
                      : null}
                </div>
                {d.quoted && (
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 mt-2.5 pt-2.5 border-t border-border/60">
                    <Cell label="Venduto" value={d.sold > 0 ? eur2(d.sold) : '—'} sub={d.recurring > 0 ? `+ ${eur2(d.recurring)}/mese` : undefined} />
                    <Cell label="Rate" value={r.rateTot ? `${r.ratePaid}/${r.rateTot} incassate` : '—'} sub={r.rateTot ? `${r.rateInv} fatturate` : undefined} />
                    <Cell label="Affidato fuori" value={d.external + d.recurringExternal > 0 ? eur2(d.external) : '—'}
                      sub={d.recurringExternal > 0 ? `+ ${eur2(d.recurringExternal)}/mese` : d.suppliers.join(' · ') || undefined} />
                    <Cell label="Margine" tone={d.margin < 0 ? 'neg' : undefined}
                      value={d.sold > 0 ? eur2(d.margin) : d.recurring > 0 ? `${eur2(d.monthlyMargin)}/mese` : '—'}
                      sub={d.sold > 0 ? `${Math.round(d.pct * 100)}% del venduto` : undefined} />
                  </dl>
                )}
                {d.draft > 0 && <p className="text-2xs text-text-tertiary mt-2">Quotazioni in bozza per {eur2(d.draft)}: valgono zero finché non vengono vendute.</p>}
              </li>
            )
          })}
        </ul>
        <p className="text-2xs text-text-tertiary px-1">{rows.length} progetti · il tempo del team non c&apos;è: sta nel costo del lavoro aziendale.</p>
      </div>
    </div>
  )
}

function Cell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'neg' }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-text-tertiary">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums ${tone === 'neg' ? 'text-error' : 'text-text-primary'}`}>{value}</dd>
      {sub && <p className="text-2xs text-text-tertiary leading-snug break-words">{sub}</p>}
    </div>
  )
}
