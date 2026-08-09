/**
 * La tenuta di cassa di un mese, letta dal database e passata al motore vero.
 *
 *   npx tsx scripts/verify-cash.ts 2026-08-01
 *
 * Stessa ragione di `verify-month.ts`: controllare la catena — saldo di banca,
 * righe scoperte con la loro scadenza, IVA del trimestre, compensi maturati —
 * col codice che gira in pagina, non con una riscrittura che può divergere.
 * Sola lettura: non scrive niente.
 */
import { readFileSync } from 'fs'
import { cashRunway, type RunwayLine } from '@/lib/cash-runway'
import { dueOf, fromRevenue, fromCost, collectionIndex, monthOf } from '@/lib/cash-calendar'
import { eur } from '@/lib/money'
import { computeMonth, rowToPlConfig, type RevenueLine, type CostLine, type Partner } from '@/lib/pl'
import { vatByQuarter } from '@/lib/vat'
import { payoutLedger, payoutsFromBank, mergePeople, type CertTx } from '@/lib/cash-certify'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))

const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

const num = (v: unknown) => (v == null ? 0 : Number(v))
const MONTH = process.argv[2] ?? new Date().toISOString().slice(0, 8) + '01'
const TODAY = process.argv[3] ?? new Date().toISOString().slice(0, 10)

async function main() {
  const [months, config, partners, clients, accounts, tx] = await Promise.all([
    get<{ id: string; month: string; status: string }[]>('pl_months?select=id,month,status&order=month'),
    get<Record<string, unknown>[]>('pl_config?select=*&limit=1'),
    get<Record<string, unknown>[]>('pl_partners?select=*'),
    get<Record<string, unknown>[]>('clients?select=id,sales_owner_name'),
    get<Record<string, unknown>[]>('bank_accounts?select=id,label,opening_balance'),
    get<Record<string, unknown>[]>('bank_transactions?select=*'),
  ])
  const [rev, cost] = await Promise.all([
    get<Record<string, unknown>[]>('pl_revenue_lines?select=*'),
    get<Record<string, unknown>[]>('pl_cost_lines?select=*'),
  ])
  const cfg = rowToPlConfig(config[0] ?? {})
  const monthOfId = new Map(months.map(m => [m.id, m.month.slice(0, 10)]))
  const plPartners = partners.map(p => ({
    id: String(p.id), label: String(p.label),
    takes_delivery: !!p.takes_delivery, takes_residual: !!p.takes_residual,
  })) as Partner[]

  const asRev = (r: Record<string, unknown>): RevenueLine & { month: string } => ({
    ...(r as unknown as RevenueLine),
    month: monthOfId.get(String(r.month_id)) ?? MONTH,
    amount_net: num(r.amount_net), vat_rate: num(r.vat_rate),
    paid: r.paid === true, paid_on: (r.paid_on as string) ?? null,
  })
  const asCost = (c: Record<string, unknown>): CostLine & { month: string } => ({
    ...(c as unknown as CostLine),
    month: monthOfId.get(String(c.month_id)) ?? MONTH,
    budget: num(c.budget), actual: num(c.actual),
    paid: c.paid === true, paid_on: (c.paid_on as string) ?? null,
  })
  const allRev = rev.map(asRev)
  const allCost = cost.map(asCost)

  const ctx = { collection: collectionIndex(allRev.map(l => fromRevenue(l, l.month))) }
  const open: RunwayLine[] = [
    ...allRev.filter(l => !l.paid).map(l => ({
      id: l.id, label: l.label, side: 'entrata' as const,
      gross: Math.round(l.amount_net * (1 + l.vat_rate) * 100) / 100,
      due: dueOf(fromRevenue(l, l.month), ctx), month: l.month,
    })),
    ...allCost.filter(c => !c.paid && (c.actual > 0 || c.budget > 0)).map(c => ({
      id: c.id, label: c.label, side: 'uscita' as const,
      gross: Math.round((c.actual > 0 ? c.actual : c.budget) * (c.vat_applied ? 1 + c.vat_rate : 1) * 100) / 100,
      due: dueOf(fromCost(c, c.month), ctx), month: c.month,
    })),
  ]

  const balance = accounts.reduce((s, a) => s + num(a.opening_balance), 0)
    + tx.filter(t => t.source === 'banca').reduce((s, t) => s + num(t.amount), 0)

  const vatMonths = months.map(m => {
    const mm = m.month.slice(0, 10)
    return {
      month: mm,
      debit: allRev.filter(l => l.month === mm).reduce((s, l) => s + l.amount_net * l.vat_rate, 0),
      credit: allCost.filter(c => c.month === mm)
        .reduce((s, c) => s + (c.vat_applied ? (c.actual > 0 ? c.actual : c.budget) * c.vat_rate : 0), 0),
    }
  })
  const quarters = vatByQuarter(vatMonths, TODAY)
  const vatNow = quarters.find(q => !q.closed && q.toPay > 0) ?? quarters.find(q => !q.closed) ?? null

  const certTxs: CertTx[] = tx.map(t => ({
    id: String(t.id), booked_on: String(t.booked_on).slice(0, 10), amount: num(t.amount),
    source: String(t.source), kind: String(t.kind ?? 'altro'),
    counterparty: (t.counterparty as string) ?? null, description: String(t.description ?? ''),
    revenue_line_id: (t.revenue_line_id as string) ?? null,
    cost_line_id: (t.cost_line_id as string) ?? null,
  }))
  const people = mergePeople(
    plPartners.map(p => ({ id: p.id, label: p.label })),
    Array.from(new Set(clients.map(c => (c.sales_owner_name as string) ?? '').filter(Boolean))))
  const accruals: { key: string; month: string; amount: number }[] = []
  for (const mk of Array.from(new Set([...allRev, ...allCost].map(l => l.month)))) {
    const t = computeMonth(allRev.filter(l => l.month === mk), allCost.filter(c => c.month === mk), cfg, plPartners)
    for (const p of t.perPartner) {
      const k = people.find(x => x.partnerId === p.partner.id)?.key
      if (k) accruals.push({ key: k, month: mk, amount: p.total })
    }
    for (const s of t.salesByOwner) {
      const k = people.find(x => x.label === s.label)?.key
      if (k) accruals.push({ key: k, month: mk, amount: s.amount })
    }
  }
  const from = (config[0]?.settled_from ?? config[0]?.payout_from) as string | undefined
  const ledger = payoutLedger({
    people: people.map(p => ({ key: p.key, label: p.label })),
    accruals, facts: payoutsFromBank(certTxs, people),
    from: from ? monthOf(String(from)) : null,
  })
  const payoutPlan = Array.from(
    ledger.flatMap(p => p.schedule).reduce((m, x) => m.set(x.month, (m.get(x.month) ?? 0) + x.amount), new Map<string, number>()),
    ([month, amount]) => ({ month, amount }))

  const r = cashRunway({
    month: MONTH, today: TODAY, balance, open,
    planned: [], // il previsionale non serve al controllo dei gradini
    dues: quarters.filter(q => !q.closed && q.toPay > 0).map(q => ({ date: q.deadline, amount: q.toPay, label: q.label })),
    vatHeld: vatNow?.toPay ?? 0, vatDeadline: vatNow?.deadline ?? null,
    vatLabel: vatNow?.label ?? '', vatDays: vatNow?.daysLeft ?? null,
    payouts: {
      open: ledger.reduce((s, p) => s + Math.max(0, p.open), 0),
      people: ledger.filter(p => p.open > 0.5).length,
      never: ledger.filter(p => p.never).length,
      byMonth: payoutPlan, since: from ? monthOf(String(from)) : null,
    },
  })

  console.log(`\nTENUTA DI CASSA — ${MONTH} (oggi ${TODAY})\n`)
  console.log(`  verdetto: ${r.verdict.toUpperCase()}`)
  console.log(`  ${r.headline.replace(/\*\*/g, '')}\n`)
  for (const o of r.outcomes) console.log(`  ${o.title.padEnd(30)} ${eur(o.value).padStart(12)}   ${o.hint}`)
  console.log('')
  for (const s of r.scenarios) {
    const d = s.delta === 0 ? '' : `${s.delta > 0 ? '+' : '−'}${eur(Math.abs(s.delta))}`
    console.log(`  ${s.label.padEnd(42)} ${d.padStart(11)}  →  ${eur(s.balance).padStart(11)}`)
  }
  console.log(`\n  IVA ${eur(r.vatHeld)} · ${r.vatLabel} · scade ${r.vatDeadline}`
    + ` · ${r.vatDueInMonth ? 'DENTRO il mese' : 'fuori dal mese'}`)
  console.log(`  scoperti: ${r.toPayCount} uscite ${eur(r.toPayGross)} (${eur(r.lateOut)} scadute)`
    + ` · incassi ${r.dueInCount} nei termini ${eur(r.dueIn)} + ${r.lateInCount} scaduti ${eur(r.lateIn)}`)
  console.log(`  compensi maturati non erogati: ${eur(r.payoutsOpen)} su ${ledger.length} persone`)
  for (const p of ledger) {
    console.log(`    ${p.who.padEnd(22)} maturato ${eur(p.due).padStart(11)}`
      + ` · erogato ${eur(p.paid).padStart(11)} · resta ${eur(p.open).padStart(11)}`
      + `  (da ${p.from ?? 'sempre'}, ${p.whyFrom})`)
    /* Il compenso di un mese esce in quello dopo: qui si legge dove cade, che è
       la domanda vera quando si decide quanto versare e quando. */
    if (p.schedule.length) {
      console.log(`      esce: ${p.schedule.map(s => `${s.month.slice(0, 7)} ${eur(s.amount)}`).join(' · ')}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
