import { createClient } from '@/lib/supabase/server'
import { computeMonth, rowToPlConfig, shiftMonth, monthLabel, type Partner } from '@/lib/pl'
import { rowContext, toRevenueLines, toCostLines } from '@/lib/pl-rows'
import { buildWindow, takenIn, marginCostsFor, placeLine, type WindowVerdict } from '@/lib/payout-window'
import {
  counts, lineBank, withBankPaid, vatOf, vatTotals, vatLever, mergeVoci,
  type MTx, type MAlloc, type VatSources, type LineBank,
} from '@/lib/mese-banca'
import { payoutPeople, groupRows, REASON } from '@/lib/payout-report'
import { quarterOf, quarterMonths, quarterLabel, deadlineFor } from '@/lib/vat'
import { balance, type BankTx } from '@/lib/bank'
import { eur2 } from '@/lib/money'
import { Info, ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

type Row = Record<string, unknown>
type Tx = MTx & { invoice_id?: string | null; account_id?: string }
const num = (v: unknown) => Number(v ?? 0)
const r2 = (n: number) => Math.round(n * 100) / 100
const endOfMonth = (m: string) => `${m.slice(0, 8)}${new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate()}`

const VERDICT: Record<WindowVerdict, string> = {
  presa: 'incassata in finestra', presunta: 'in finestra', dopo: 'incassata dopo la data: erogazione successiva',
  gia_erogata: 'già erogata', non_matura: 'non matura', consolidata: 'mese chiuso', scoperta: 'nessun movimento la copre',
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

function Note({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  return (
    <div className={`flex gap-2 rounded-xl px-3 py-2.5 text-2xs leading-snug ${tone === 'warning' ? 'bg-warning-dim text-warning' : 'bg-surface-hover text-text-secondary'}`}>
      <Info className="w-4 h-4 shrink-0 mt-px" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export async function BancaMese({ month, today }: { month: string; today: string }) {
  const sb = await createClient()
  const upTo = today < endOfMonth(month) ? today : endOfMonth(month)
  const pay = shiftMonth(month, -1)

  const [
    { data: txRows }, { data: allocRows }, { data: invRows }, { data: revRows }, { data: costRows },
    { data: accRows }, { data: settl }, { data: pm }, { data: pmPrev },
    { data: cfg }, { data: partnerRows }, { data: clients }, { data: streams }, { data: sp },
  ] = await Promise.all([
    sb.from('bank_transactions')
      .select('id, account_id, booked_on, amount, source, kind, counterparty, description, revenue_line_id, cost_line_id, no_match_needed, hidden_reason, payslip_id, hr_invoice_id, transfer_pair_id, invoice_id'),
    sb.from('bank_tx_lines').select('tx_id, revenue_line_id, cost_line_id, amount'),
    sb.from('invoices').select('id, number, counterparty_name, vat_amount, total'),
    sb.from('pl_revenue_lines').select('id, month_id, label, amount_net, vat_rate'),
    sb.from('pl_cost_lines').select('*'),
    sb.from('bank_accounts').select('id, label, opening_balance'),
    sb.from('vat_settlements').select('year, quarter, to_pay, paid_on'),
    sb.from('pl_months').select('id, month, payout_date').eq('month', pay).maybeSingle(),
    sb.from('pl_months').select('payout_date').eq('month', shiftMonth(pay, -1)).maybeSingle(),
    sb.from('pl_config').select('*').eq('id', true).maybeSingle(),
    sb.from('pl_partners').select('*').eq('is_active', true).order('sort_order'),
    sb.from('clients').select('id, company_name, display_name, sales_owner_id, sales_owner_name'),
    sb.from('revenue_streams').select('*'),
    sb.from('revenue_stream_projects').select('stream_id, project_id'),
  ])

  const txs = (txRows ?? []) as unknown as Tx[]
  const allocs = ((allocRows ?? []) as Row[]).map(a => ({
    tx_id: String(a.tx_id), revenue_line_id: (a.revenue_line_id as string) ?? null,
    cost_line_id: (a.cost_line_id as string) ?? null, amount: num(a.amount),
  })) as MAlloc[]

  const invById = new Map(((invRows ?? []) as Row[]).map(i => [String(i.id), i]))
  const src: VatSources = {
    invoices: new Map(Array.from(invById, ([id, i]) => [id, { vat: num(i.vat_amount), total: num(i.total) }])),
    revenue: new Map(((revRows ?? []) as Row[]).map(r => [String(r.id), {
      rate: num(r.vat_rate), applied: true, deductible: 1, gross: r2(num(r.amount_net) * (1 + num(r.vat_rate))),
    }])),
    cost: new Map(((costRows ?? []) as Row[]).map(c => {
      const base = num(c.actual) > 0 ? num(c.actual) : num(c.budget)
      return [String(c.id), {
        rate: num(c.vat_rate), applied: c.vat_applied === true,
        deductible: c.vat_deductible_pct == null ? 1 : Math.min(1, Math.max(0, num(c.vat_deductible_pct))),
        gross: r2(base * (c.vat_applied ? 1 + num(c.vat_rate) : 1)),
      }]
    })),
  }
  const labelOf = new Map<string, string>([
    ...((revRows ?? []) as Row[]).map(r => [String(r.id), String(r.label)] as [string, string]),
    ...((costRows ?? []) as Row[]).map(c => [String(c.id), String(c.label)] as [string, string]),
  ])

  /* ── Il mese: i movimenti, uno per uno ─────────────────────────────────── */
  const here = txs.filter(t => counts(t) && t.booked_on.slice(0, 7) === month.slice(0, 7))
    .sort((a, b) => b.booked_on.localeCompare(a.booked_on))
  const entrate = here.filter(t => t.amount > 0)
  const uscite = here.filter(t => t.amount < 0)
  const sum = (xs: Tx[]) => r2(xs.reduce((s, t) => s + Math.abs(t.amount), 0))
  const vatMonth = vatTotals(here, allocs, src)

  const why = (t: Tx): string => {
    const inv = t.invoice_id ? invById.get(t.invoice_id) : null
    if (inv) return `fattura ${inv.number} · ${inv.counterparty_name}`
    const a = allocs.find(x => x.tx_id === t.id && (x.revenue_line_id || x.cost_line_id))
    const lineId = a ? (a.revenue_line_id ?? a.cost_line_id) : (t.revenue_line_id ?? t.cost_line_id)
    if (lineId && labelOf.has(lineId)) return `riga: ${labelOf.get(lineId)}`
    if (t.payslip_id || t.hr_invoice_id) return 'personale'
    if (t.no_match_needed) return 'non richiede una riga'
    return 'nessuna fattura o riga'
  }
  const MovRow = ({ t }: { t: Tx }) => {
    const v = vatOf(t, allocs, src)
    const parte = v.basis > 0 && v.basis < Math.abs(t.amount) - 0.01
    return (
      <div className="px-4 py-2.5 border-b border-border/60 last:border-b-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-text-primary leading-snug break-words">{t.counterparty ?? t.description}</p>
            <p className="text-2xs text-text-tertiary leading-snug break-words">{t.booked_on.slice(0, 10)} · {t.kind} · {why(t)}</p>
          </div>
          <div className="text-right whitespace-nowrap">
            <p className="text-sm font-semibold text-text-primary tabular-nums">{eur2(Math.abs(t.amount))}</p>
            <p className={`text-2xs tabular-nums ${v.via ? 'text-text-tertiary' : 'text-warning'}`}>
              {v.via === null ? 'IVA n/d' : v.via === 'natura' ? 'senza IVA' : `IVA ${eur2(v.vat)}${parte ? ' (parziale)' : ''}`}
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ── La leva dell'IVA: da quando non versiamo ───────────────────────────── */
  /* Si parte dal trimestre dopo l'ultimo versamento fatto (entro la data che si guarda):
     un trimestre senza una riga in `vat_settlements` non è «versato», è solo non
     ancora registrato — e il 3º, dovuto il 16 novembre, è IVA ancora in conto. */
  const versati = ((settl ?? []) as Row[])
    .filter(s => s.paid_on && String(s.paid_on).slice(0, 10) <= upTo)
    .map(s => ({ year: Number(s.year), q: Number(s.quarter) }))
    .sort((x, y) => x.year - y.year || x.q - y.q)
  const ultimo = versati.at(-1)
  const q = ultimo
    ? (ultimo.q === 4 ? { year: ultimo.year + 1, q: 1 as const } : { year: ultimo.year, q: (ultimo.q + 1) as 1 | 2 | 3 | 4 })
    : quarterOf(month)
  const from = quarterMonths(q)[0]
  const lever = vatLever(txs, allocs, src, from, upTo)
  const due = deadlineFor(quarterOf(from))

  const accounts = (accRows ?? []) as Row[]
  const saldo = r2(accounts.reduce((s, a) => s + balance(
    { opening_balance: num(a.opening_balance) },
    txs.filter(t => t.account_id === String(a.id)) as unknown as BankTx[], upTo).real, 0))

  /* ── Compensi: solo la lettura dalla banca ─────────────────────────────── */
  let compensi: ReactNode
  if (!pm) {
    compensi = <Note tone="warning"><p>{monthLabel(pay)} non è stato preparato: senza righe di conto economico non c&apos;è un compenso da calcolare sull&apos;incassato.</p></Note>
  } else {
    const rowsOf = async (table: 'pl_revenue_lines' | 'pl_cost_lines') =>
      (await sb.from(table).select('*').eq('month_id', pm.id)).data as Row[] | null
    const [rr, cc] = await Promise.all([rowsOf('pl_revenue_lines'), rowsOf('pl_cost_lines')])
    const ctx = rowContext({
      month: pay, months: [{ id: pm.id, month: pay }], clients: (clients ?? []) as Row[],
      streams: (streams ?? []) as Row[], streamProjects: (sp ?? []) as { stream_id: string; project_id: string }[],
    })
    const rev = toRevenueLines(rr, ctx)
    const costs = toCostLines(cc, ctx)
    const covR = lineBank(rev.map(l => ({ id: l.id, gross: r2(l.amount_net * (1 + l.vat_rate)) })), 'entrata', txs, allocs)
    const config = rowToPlConfig(cfg as Row | null)
    const partners = ((partnerRows ?? []) as Row[]).map(p => ({
      id: String(p.id), label: String(p.label),
      takes_delivery: p.takes_delivery !== false, takes_residual: p.takes_residual !== false,
    })) as Partner[]
    const w = buildWindow({
      month: pay, date: (pm.payout_date as string | null) ?? null,
      previousDate: (pmPrev as { payout_date?: string | null } | null)?.payout_date ?? null,
      day: config.payout_day, settledFrom: config.settled_from,
    })
    const bankRev = withBankPaid(rev, covR)
    const presi = takenIn(bankRev, w)
    const mc = marginCostsFor(costs, new Set(presi.map(l => l.month)), pay)
    const t = computeMonth(presi, mc, config, partners, mc, rev)
    /* I tre soci, con il nome intero: «Marco» in `pl_partners` e «Marco Lucci»
       fra i commerciali sono una persona sola (`mergePeople`, §226). */
    const SOCI = ['Marco Lucci', 'Toto Piacente', 'Walter Giacobbe']
    const clientNames = new Map(((clients ?? []) as Row[]).map(c => [String(c.id), String(c.display_name || c.company_name)]))
    const persone = payoutPeople({ t, lines: [], owners: SOCI })
      .map(p => ({ ...p, rows: mergeVoci(p.rows) }))
      .map(p => ({ ...p, total: r2(p.rows.reduce((n, r) => n + r.amount, 0)) }))
    const isSocio = (who: string) => SOCI.includes(who)
    const ordinate = [
      ...SOCI.map(n => persone.find(p => p.who === n) ?? { who: n, partnerId: null, socio: 0, comm: 0, total: 0, spent: 0, cash: 0, overspent: 0, rows: [], paid: false, paidOn: null }),
      ...persone.filter(p => !isSocio(p.who)),
    ]
    const tot = r2(ordinate.reduce((a, p) => a + p.total, 0))
    const pct = (x: number) => `${(Math.round(x * 10000) / 100).toString().replace('.', ',')}%`
    compensi = (
      <div className="p-3 space-y-3">
        <Note>
          <p>
            Competenza di {monthLabel(pay)}, erogazione del <strong>{w.date}</strong>. Conta solo ciò che un
            movimento di banca copre per intero, entro quella data
            {w.since ? ` (incassi dopo il ${w.since})` : ''}. Gli arretrati di mesi precedenti non sono inclusi.
            Ogni voce è una riga incassata × la sua percentuale; le voci uguali sono unite, non ripetute.
          </p>
        </Note>
        {ordinate.map(p => {
          const gruppi = groupRows(p.rows)
          return (
            <section key={p.who} className="rounded-xl border border-border overflow-hidden" aria-label={`Compenso di ${p.who}`}>
              <div className="flex items-baseline justify-between gap-2 px-3 py-2.5 bg-surface-hover">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{p.who}</p>
                  <p className="text-2xs text-text-tertiary">{isSocio(p.who) ? 'socio' : 'commerciale, non socio'}</p>
                </div>
                <p className="text-base font-semibold text-text-primary tabular-nums">{eur2(p.total)}</p>
              </div>
              {gruppi.length === 0
                ? <p className="px-3 py-3 text-2xs text-text-tertiary leading-snug">Niente da erogare: nessuna riga incassata in finestra gli porta una quota.</p>
                : gruppi.map(g => (
                  <div key={g.reason}>
                    <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-t border-border/60 bg-surface">
                      <p className="text-2xs font-semibold text-text-secondary">{REASON[g.reason]}</p>
                      <p className="text-2xs font-semibold text-text-secondary tabular-nums">{eur2(g.total)}</p>
                    </div>
                    {g.rows.map(r => (
                      <div key={`${r.lineId}|${r.reason}|${r.month ?? ''}`} className="px-3 py-2 border-t border-border/60">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-text-primary leading-snug break-words min-w-0">
                            {(r.clientId && clientNames.get(r.clientId)) || r.label}
                            {r.month && <span className="text-2xs text-text-tertiary"> · competenza {monthLabel(r.month).toLowerCase()}</span>}
                          </p>
                          <p className="text-sm tabular-nums text-text-primary whitespace-nowrap">{eur2(r.amount)}</p>
                        </div>
                        <p className="text-2xs text-text-tertiary leading-snug break-words">
                          {r.label} · {r.kind === 'digital' ? `margine ${eur2(r.base)}${r.external > 0 ? ` (rata meno ${eur2(r.external)} di subappalto)` : ''}` : `imponibile ${eur2(r.base)}`}
                          {' '}× {pct(r.pct)} = {eur2(r.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
            </section>
          )
        })}
        <div className="flex items-baseline justify-between gap-2 rounded-xl bg-surface-hover px-3 py-2.5">
          <p className="text-sm font-semibold text-text-primary">Totale da erogare</p>
          <p className="text-base font-semibold text-text-primary tabular-nums">{eur2(tot)}</p>
        </div>
        <ul className="text-2xs text-text-tertiary leading-snug space-y-1">
          {bankRev.map(l => {
            const c: LineBank = covR.get(l.id)!
            return (
              <li key={l.id}>
                {l.label} · {eur2(c.gross)}: <span className="text-text-secondary">{VERDICT[placeLine(l, w)]}</span>
                {c.state === 'parziale' && <span className="text-warning"> · coperta per {eur2(c.covered)}, mancano {eur2(c.remaining)}</span>}
                {c.hits.map(h => <span key={h.txId}> · {h.date} {eur2(h.amount)}</span>)}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const noteIva = (inUnk: number, outUnk: number) =>
    inUnk + outUnk > 0.01 ? `IVA non nota su ${eur2(inUnk)} entrati e ${eur2(outUnk)} usciti (nessuna fattura o riga)` : 'IVA nota su tutto'

  return (
    <>
      <section className="bg-surface border border-border rounded-2xl p-4" aria-label="Entrato e uscito">
        <p className="text-2xs text-text-tertiary">Passato dal conto in {monthLabel(month)} · lordo IVA</p>
        <div className="grid grid-cols-2 divide-x divide-border mt-2">
          <div className="pr-3">
            <p className="text-2xs text-text-tertiary">Entrato</p>
            <p className="text-xl font-semibold text-text-primary tabular-nums">{eur2(sum(entrate))}</p>
            <p className="text-2xs text-text-tertiary leading-snug">{entrate.length} movimenti · di cui IVA {eur2(vatMonth.inVat)}</p>
          </div>
          <div className="pl-3">
            <p className="text-2xs text-text-tertiary">Uscito</p>
            <p className="text-xl font-semibold text-text-primary tabular-nums">{eur2(sum(uscite))}</p>
            <p className="text-2xs text-text-tertiary leading-snug">{uscite.length} movimenti · di cui IVA detraibile {eur2(vatMonth.outVat)}</p>
          </div>
        </div>
        <p className="text-2xs text-text-tertiary leading-snug mt-3 pt-3 border-t border-border">
          Netto del mese {eur2(r2(sum(entrate) - sum(uscite)))} · {noteIva(vatMonth.inUnknown, vatMonth.outUnknown)}.
          Fuori: giroconti fra i nostri conti, movimenti nascosti, quelli nati da una spunta.
        </p>
      </section>

      <section className="bg-surface border border-border rounded-2xl p-4" aria-label="Leva dell'IVA">
        <p className="text-2xs text-text-tertiary">Leva dell&apos;IVA · dal {from} al {upTo}</p>
        <p className="text-xl font-semibold text-text-primary tabular-nums leading-tight">{eur2(lever.held)}</p>
        <p className="text-2xs text-text-secondary leading-snug mt-1">
          IVA incassata dai clienti {eur2(lever.inVat)} meno IVA pagata ai fornitori {eur2(lever.outVat)}: soldi dello Stato
          che stanno sul conto fino al versamento del {due.date} ({quarterLabel(quarterOf(from))}).
        </p>
        <div className="grid grid-cols-2 divide-x divide-border mt-3 pt-3 border-t border-border">
          <div className="pr-3">
            <p className="text-2xs text-text-tertiary">Saldo a oggi (banca)</p>
            <p className="text-base font-semibold text-text-primary tabular-nums">{eur2(saldo)}</p>
          </div>
          <div className="pl-3">
            <p className="text-2xs text-text-tertiary">Saldo senza la leva</p>
            <p className={`text-base font-semibold tabular-nums ${saldo - lever.held < 0 ? 'text-error' : 'text-text-primary'}`}>{eur2(r2(saldo - lever.held))}</p>
          </div>
        </div>
        <p className="text-2xs text-text-tertiary leading-snug mt-3">
          È IVA <em>passata dal conto</em>, non il debito fiscale: quello si calcola sulle fatture. {noteIva(lever.inUnknown, lever.outUnknown)}.
          {lever.outUnknown > 0.01 && <> Se tutta l&apos;uscita non agganciata avesse IVA al 22%, la leva scenderebbe a {eur2(r2(lever.held - lever.outUnknown * 0.22 / 1.22))}.</>}
        </p>
      </section>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <Box title="Entrate" total={eur2(sum(entrate))} note={`${entrate.length} movimenti`}>
          {entrate.length === 0 ? <p className="px-4 py-5 text-sm text-text-tertiary">Nessun incasso in questo mese.</p> : entrate.map(t => <MovRow key={t.id} t={t} />)}
        </Box>
        <Box title="Uscite" total={eur2(sum(uscite))} note={`${uscite.length} movimenti`}>
          {uscite.length === 0 ? <p className="px-4 py-5 text-sm text-text-tertiary">Nessuna uscita in questo mese.</p> : uscite.map(t => <MovRow key={t.id} t={t} />)}
        </Box>
      </div>

      <Box title="Compensi dei soci dall'incassato" note="Solo ciò che la banca conferma" open>
        {compensi}
      </Box>
    </>
  )
}
