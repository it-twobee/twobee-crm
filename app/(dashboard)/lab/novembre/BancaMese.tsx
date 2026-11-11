import { createClient } from '@/lib/supabase/server'
import { computeMonth, rowToPlConfig, shiftMonth, type Partner, type RevenueLine, type CostLine } from '@/lib/pl'
import { rowContext, toRevenueLines, toCostLines } from '@/lib/pl-rows'
import { buildWindow, takenIn, marginCostsFor, placeLine, type WindowVerdict } from '@/lib/payout-window'
import { lineBank, withBankPaid, monthCash, type MTx, type MAlloc, type LineBank } from '@/lib/mese-banca'
import { eur2 } from '@/lib/money'
import { Info, ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

type Row = Record<string, unknown>
const num = (v: unknown) => Number(v ?? 0)
const r2 = (n: number) => Math.round(n * 100) / 100

const STATE: Record<LineBank['state'], { label: string; cls: string }> = {
  coperta: { label: 'entrata', cls: 'bg-success-dim text-success' },
  eccedente: { label: 'oltre il dovuto', cls: 'bg-warning-dim text-warning' },
  parziale: { label: 'parziale', cls: 'bg-warning-dim text-warning' },
  scoperta: { label: 'non ancora entrata', cls: 'bg-surface-hover text-text-secondary' },
}
const OUT: Record<LineBank['state'], { label: string; cls: string }> = {
  coperta: { label: 'uscita', cls: 'bg-success-dim text-success' },
  eccedente: { label: 'oltre il dovuto', cls: 'bg-warning-dim text-warning' },
  parziale: { label: 'parziale', cls: 'bg-warning-dim text-warning' },
  scoperta: { label: 'non ancora uscita', cls: 'bg-surface-hover text-text-secondary' },
}
const VERDICT: Record<WindowVerdict, string> = {
  presa: 'nella finestra', presunta: 'spunta senza data', dopo: 'incassata dopo la data',
  gia_erogata: 'già erogata', non_matura: 'non ancora matura', consolidata: 'mese chiuso', scoperta: 'non incassata',
}

function Box({ title, total, note, children, open = true }: { title: string; total?: string; note?: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group bg-surface border border-border rounded-2xl overflow-hidden">
      <summary className="flex items-center gap-3 px-4 min-h-[52px] py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-text-primary">{title}</span>
          {note && <span className="block text-2xs text-text-tertiary leading-snug">{note}</span>}
        </span>
        {total && <span className="text-sm font-semibold text-text-primary tabular-nums">{total}</span>}
        <ChevronDown className="w-4 h-4 text-text-tertiary transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-border">{children}</div>
    </details>
  )
}

function LineRow({ label, sub, gross, c, tone }: { label: string; sub?: string; gross: number; c: LineBank; tone: typeof STATE }) {
  const s = tone[c.state]
  return (
    <div className="px-4 py-2.5 border-b border-border/60 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-text-primary leading-snug break-words">{label}</p>
          {sub && <p className="text-2xs text-text-tertiary leading-snug break-words">{sub}</p>}
        </div>
        <p className="text-sm text-text-secondary tabular-nums whitespace-nowrap">{eur2(gross)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
        <span className={`text-2xs font-semibold rounded-full px-2 py-0.5 ${s.cls}`}>{s.label}</span>
        {c.hits.map(h => (
          <span key={h.txId} className="text-2xs text-text-tertiary">{h.date} · {eur2(h.amount)} · {h.who}</span>
        ))}
        {c.state === 'parziale' && <span className="text-2xs text-warning">mancano {eur2(c.remaining)}</span>}
      </div>
    </div>
  )
}

export async function BancaMese({ month, today }: { month: string; today: string }) {
  const sb = await createClient()
  const { data: pm } = await sb.from('pl_months').select('id, month, status, payout_date').eq('month', month).maybeSingle()
  if (!pm) {
    return (
      <div className="flex gap-2 rounded-xl px-3 py-2.5 text-2xs leading-snug bg-warning-dim text-warning">
        <Info className="w-4 h-4 shrink-0 mt-px" aria-hidden />
        <p>Questo mese non è stato ancora preparato: non ci sono righe di conto economico a cui agganciare i movimenti, quindi la lettura dalla banca non c&apos;è. Sotto, il piano dai contratti.</p>
      </div>
    )
  }
  const prev = shiftMonth(month, -1)
  const [
    { data: revRows }, { data: costRows }, { data: txRows }, { data: allocRows },
    { data: cfg }, { data: partnerRows }, { data: clients }, { data: streams }, { data: sp }, { data: prevMonth },
  ] = await Promise.all([
    sb.from('pl_revenue_lines').select('*').eq('month_id', pm.id),
    sb.from('pl_cost_lines').select('*').eq('month_id', pm.id),
    sb.from('bank_transactions')
      .select('id, booked_on, amount, source, kind, counterparty, description, revenue_line_id, cost_line_id, no_match_needed, hidden_reason, payslip_id, hr_invoice_id, transfer_pair_id'),
    sb.from('bank_tx_lines').select('tx_id, revenue_line_id, cost_line_id, amount'),
    sb.from('pl_config').select('*').eq('id', true).maybeSingle(),
    sb.from('pl_partners').select('*').eq('is_active', true).order('sort_order'),
    sb.from('clients').select('id, company_name, display_name, sales_owner_id, sales_owner_name'),
    sb.from('revenue_streams').select('*'),
    sb.from('revenue_stream_projects').select('stream_id, project_id'),
    sb.from('pl_months').select('payout_date').eq('month', prev).maybeSingle(),
  ])

  const clientName = new Map(((clients ?? []) as Row[]).map(c => [String(c.id), String(c.display_name || c.company_name)]))
  const ctx = rowContext({
    month, months: [{ id: pm.id, month: pm.month }], clients: (clients ?? []) as Row[],
    streams: (streams ?? []) as Row[], streamProjects: (sp ?? []) as { stream_id: string; project_id: string }[],
  })
  const rev = toRevenueLines(revRows as Row[] | null, ctx)
  const costs = toCostLines(costRows as Row[] | null, ctx)
  const txs = (txRows ?? []) as unknown as MTx[]
  const allocs = ((allocRows ?? []) as Row[]).map(a => ({
    tx_id: String(a.tx_id), revenue_line_id: (a.revenue_line_id as string) ?? null,
    cost_line_id: (a.cost_line_id as string) ?? null, amount: num(a.amount),
  })) as MAlloc[]

  const revGross = rev.map(l => ({ id: l.id, gross: r2(l.amount_net * (1 + l.vat_rate)) }))
  const costGross = costs.map(c => ({
    id: c.id, gross: r2((c.actual > 0 ? c.actual : c.budget) * (c.vat_applied ? 1 + c.vat_rate : 1)),
  }))
  const covR = lineBank(revGross, 'entrata', txs, allocs)
  const covC = lineBank(costGross, 'uscita', txs, allocs)
  const cash = monthCash(txs, allocs, month)

  const sumC = (m: Map<string, LineBank>) => r2(Array.from(m.values()).reduce((s, c) => s + c.covered, 0))
  const attesoIn = r2(revGross.reduce((s, l) => s + l.gross, 0))
  const attesoOut = r2(costGross.reduce((s, l) => s + l.gross, 0))
  const entrataRighe = sumC(covR)
  const uscitaRighe = sumC(covC)
  const spuntateNoBanca = rev.filter(l => l.paid && !['coperta', 'eccedente'].includes(covR.get(l.id)!.state))

  /* Compensi: lo stesso motore e la stessa finestra del conto economico (§286),
     con tre letture della stessa colonna «incassata». */
  const config = rowToPlConfig(cfg as Row | null)
  const partners = ((partnerRows ?? []) as Row[]).map(p => ({
    id: String(p.id), label: String(p.label),
    takes_delivery: p.takes_delivery !== false, takes_residual: p.takes_residual !== false,
  })) as Partner[]
  const w = buildWindow({
    month, date: (pm.payout_date as string | null) ?? null,
    previousDate: (prevMonth as { payout_date?: string | null } | null)?.payout_date ?? null,
    day: config.payout_day, settledFrom: config.settled_from,
  })
  const costOf = (rows: (RevenueLine & { month: string })[]) => {
    const mesi = new Set(rows.map(l => l.month))
    return marginCostsFor(costs, mesi, month) as (CostLine & { month: string })[]
  }
  const reading = (rows: (RevenueLine & { month: string })[]) => {
    const mc = costOf(rows)
    const t = computeMonth(rows, mc, config, partners, mc, rev)
    const perPerson = new Map<string, number>()
    for (const p of t.perPartner) perPerson.set(p.partner.label, r2((perPerson.get(p.partner.label) ?? 0) + p.total))
    for (const s of t.salesByOwner) perPerson.set(s.label, r2((perPerson.get(s.label) ?? 0) + s.amount))
    return { perPerson, total: r2(Array.from(perPerson.values()).reduce((a, b) => a + b, 0)), base: r2(rows.reduce((s, l) => s + l.amount_net, 0)) }
  }
  const bankRev = withBankPaid(rev, covR)
  const letture = [
    { key: 'maturato', title: 'Maturato', note: 'tutto il mese, incassato o no', r: reading(rev) },
    { key: 'spunte', title: 'Sulle spunte', note: 'come il conto economico in uso', r: reading(takenIn(rev, w)) },
    { key: 'banca', title: 'Sulla banca', note: 'solo righe coperte da un movimento', r: reading(takenIn(bankRev, w)) },
  ]
  const people = Array.from(new Set(letture.flatMap(l => Array.from(l.r.perPerson.keys()))))
  const verdicts = bankRev.map(l => ({ l, v: placeLine(l, w) }))

  return (
    <>
      <section className="bg-surface border border-border rounded-2xl p-4" aria-label="Cassa del mese">
        <p className="text-2xs text-text-tertiary">Dalla banca · movimenti di {month.slice(0, 7)}</p>
        <div className="grid grid-cols-2 divide-x divide-border mt-2">
          <div className="pr-3">
            <p className="text-2xs text-text-tertiary">Entrato</p>
            <p className="text-lg font-semibold text-text-primary tabular-nums">{eur2(cash.entrato)}</p>
            <p className="text-2xs text-text-tertiary leading-snug">{cash.liberoIn > 0 ? `${eur2(cash.liberoIn)} senza una riga` : 'tutto spiegato da una riga'}</p>
          </div>
          <div className="pl-3">
            <p className="text-2xs text-text-tertiary">Uscito</p>
            <p className="text-lg font-semibold text-text-primary tabular-nums">{eur2(cash.uscito)}</p>
            <p className="text-2xs text-text-tertiary leading-snug">{cash.liberoOut > 0 ? `${eur2(cash.liberoOut)} senza una riga` : 'tutto spiegato da una riga'}</p>
          </div>
        </div>
        <p className="text-2xs text-text-tertiary leading-snug mt-3 pt-3 border-t border-border">
          Lordo IVA. Dalle righe del mese: entrate {eur2(entrataRighe)} su {eur2(attesoIn)} attesi · uscite {eur2(uscitaRighe)} su {eur2(attesoOut)}.
          Giroconti, movimenti nascosti e quelli nati da una spunta non contano.
        </p>
      </section>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <Box title="Entrate: cosa è entrato davvero" total={`${eur2(entrataRighe)} / ${eur2(attesoIn)}`} note={`${rev.length} righe · lordo IVA`}>
          {rev.map(l => (
            <LineRow key={l.id} label={l.label} gross={revGross.find(g => g.id === l.id)!.gross} tone={STATE} c={covR.get(l.id)!}
              sub={[l.client_id && clientName.get(l.client_id), l.paid && !['coperta', 'eccedente'].includes(covR.get(l.id)!.state) ? 'spuntata, ma nessun movimento la copre' : null].filter(Boolean).join(' · ') || undefined} />
          ))}
          {cash.liberiIn.length > 0 && (
            <>
              <p className="px-4 py-1.5 bg-surface-hover text-2xs font-semibold text-text-secondary">Entrati senza una riga · {eur2(cash.liberoIn)}</p>
              {cash.liberiIn.map(x => (
                <div key={x.tx.id} className="flex items-start justify-between gap-3 px-4 py-2 border-b border-border/60 last:border-b-0">
                  <p className="text-2xs text-text-secondary leading-snug break-words min-w-0">{x.tx.booked_on.slice(0, 10)} · {x.tx.counterparty ?? x.tx.description}</p>
                  <p className="text-2xs text-text-secondary tabular-nums whitespace-nowrap">{eur2(x.free)}</p>
                </div>
              ))}
            </>
          )}
        </Box>

        <Box title="Uscite: cosa è uscito davvero" total={`${eur2(uscitaRighe)} / ${eur2(attesoOut)}`} note={`${costs.length} righe · lordo IVA`}>
          {costs.map(c => (
            <LineRow key={c.id} label={c.label} gross={costGross.find(g => g.id === c.id)!.gross} tone={OUT} c={covC.get(c.id)!}
              sub={c.category || undefined} />
          ))}
          {cash.liberiOut.length > 0 && (
            <>
              <p className="px-4 py-1.5 bg-surface-hover text-2xs font-semibold text-text-secondary">Usciti senza una riga · {eur2(cash.liberoOut)}</p>
              {cash.liberiOut.map(x => (
                <div key={x.tx.id} className="flex items-start justify-between gap-3 px-4 py-2 border-b border-border/60 last:border-b-0">
                  <p className="text-2xs text-text-secondary leading-snug break-words min-w-0">{x.tx.booked_on.slice(0, 10)} · {x.tx.counterparty ?? x.tx.description} · {x.tx.kind}</p>
                  <p className="text-2xs text-text-secondary tabular-nums whitespace-nowrap">{eur2(x.free)}</p>
                </div>
              ))}
            </>
          )}
        </Box>
      </div>

      <Box title="Compensi dall'incassato" note={`Erogazione del ${w.date}${w.since ? ` · incassi dopo il ${w.since}` : ''}`}>
        <div className="p-3 space-y-3">
          <div className="flex gap-2 rounded-xl px-3 py-2.5 text-2xs leading-snug bg-surface-hover text-text-secondary">
            <Info className="w-4 h-4 shrink-0 mt-px" aria-hidden />
            <p>
              Stesso motore e stessa finestra del conto economico. Cambia solo cosa vale «incassato»:
              la spunta, oppure un movimento di banca che copre la riga per intero. La differenza è
              quanto si erogherebbe su soldi che l&apos;estratto conto non conferma.
              {spuntateNoBanca.length > 0 && <> Righe spuntate senza movimento: <strong>{spuntateNoBanca.length}</strong> ({eur2(r2(spuntateNoBanca.reduce((s, l) => s + l.amount_net * (1 + l.vat_rate), 0)))} lordi).</>}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-2xs text-text-tertiary text-left">
                  <th className="py-1 pr-3 font-semibold">Chi</th>
                  {letture.map(l => <th key={l.key} className="py-1 px-2 font-semibold text-right whitespace-nowrap">{l.title}</th>)}
                  <th className="py-1 pl-2 font-semibold text-right whitespace-nowrap">Banca − spunte</th>
                </tr>
              </thead>
              <tbody>
                {people.map(p => {
                  const [m, s, b] = letture.map(l => l.r.perPerson.get(p) ?? 0)
                  return (
                    <tr key={p} className="border-t border-border/60">
                      <td className="py-1.5 pr-3 text-text-primary">{p}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-text-secondary">{eur2(m)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-text-secondary">{eur2(s)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-text-primary">{eur2(b)}</td>
                      <td className={`py-1.5 pl-2 text-right tabular-nums ${r2(b - s) < 0 ? 'text-error' : 'text-text-secondary'}`}>{eur2(r2(b - s))}</td>
                    </tr>
                  )
                })}
                <tr className="border-t border-border font-semibold">
                  <td className="py-1.5 pr-3 text-text-primary">Totale</td>
                  {letture.map(l => <td key={l.key} className="py-1.5 px-2 text-right tabular-nums text-text-primary">{eur2(l.r.total)}</td>)}
                  <td className="py-1.5 pl-2 text-right tabular-nums text-text-primary">{eur2(r2(letture[2].r.total - letture[1].r.total))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul className="text-2xs text-text-tertiary leading-snug space-y-0.5">
            {verdicts.map(({ l, v }) => (
              <li key={l.id}>{l.label}: <span className="text-text-secondary">{VERDICT[v]}</span></li>
            ))}
          </ul>
          <p className="text-2xs text-text-tertiary leading-snug">Oggi è il {today}: gli incassi dopo la data dell&apos;erogazione entrano nella finestra successiva, non si perdono.</p>
        </div>
      </Box>
    </>
  )
}
