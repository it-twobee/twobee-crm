/**
 * Il piano di cassa di un mese, letto dal database e passato al motore vero.
 *
 *   npx tsx scripts/verify-plan.ts [mese]      (default: il mese corrente)
 *
 * Stessa ragione di `verify-cash.ts`: controllare la catena col codice che gira
 * in pagina, non con una riscrittura che può divergere. Sola lettura.
 *
 * Stampa, per il mese chiesto: il saldo di partenza, ogni voce attesa con la sua
 * data e la sua provenienza, i tre esiti e le leve che il mese ha.
 */
import { readFileSync } from 'fs'
import { shiftMonth, computeMonth, rowToPlConfig, monthKey, type Partner } from '@/lib/pl'
import { collectionIndex, fromRevenue, fromCost, dueOf, monthOf, endOfMonth } from '@/lib/cash-calendar'
import { linesForMonth, type Installment, type RevenueStream } from '@/lib/revenue'
import { plannedForMonth, isPayrollCenter, type CostItem } from '@/lib/costs'
import { vatByQuarter, type MonthVat, type VatActual } from '@/lib/vat'
import { planMonth, simulate, outcomes, advice, GROUPS, type PlanMonth } from '@/lib/cash-plan'
import { eur2 } from '@/lib/money'
import { rowContext, toRevenueLines, toCostLines } from '@/lib/pl-rows'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const get = async <T>(p: string): Promise<T> => {
  const r = await fetch(`${URL}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}
const num = (v: unknown) => (v == null ? 0 : Number(v))
const r2 = (n: number) => Math.round(n * 100) / 100
const line = (s = '─') => console.log(s.repeat(78))

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const month = process.argv[2] ? monthKey(new Date(process.argv[2])) : monthKey(new Date())

  const [months, revRows, costRows, accounts, txs, cfgRows, partnerRows, clients,
    payoutRows, streamRows, itemRows, vatRows, coverRows] = await Promise.all([
    get<{ id: string; month: string; status: string }[]>('pl_months?select=id,month,status&order=month'),
    get<Record<string, unknown>[]>('pl_revenue_lines?select=*'),
    get<Record<string, unknown>[]>('pl_cost_lines?select=*'),
    get<Record<string, unknown>[]>('bank_accounts?select=id,opening_balance'),
    get<Record<string, unknown>[]>('bank_transactions?select=id,booked_on,amount,source,kind,revenue_line_id,cost_line_id'),
    get<Record<string, unknown>[]>('pl_config?select=*&limit=1'),
    get<Record<string, unknown>[]>('pl_partners?select=*&is_active=eq.true'),
    get<Record<string, unknown>[]>('clients?select=id,display_name,company_name,sales_owner_id,sales_owner_name'),
    get<Record<string, unknown>[]>('pl_payouts?select=*').catch(() => []),
    get<Record<string, unknown>[]>('revenue_streams?select=*'),
    get<Record<string, unknown>[]>('cost_items?select=*&is_active=eq.true'),
    get<Record<string, unknown>[]>('vat_settlements?select=year,quarter,to_pay,doc_ref,paid_on').catch(() => []),
    get<{ stream_id: string; project_id: string }[]>('revenue_stream_projects?select=stream_id,project_id'),
  ])
  const inst = await get<Record<string, unknown>[]>('revenue_installments?select=*')

  const monthOfId = new Map(months.map(m => [m.id, m.month.slice(0, 10)]))
  const nameOf = new Map(clients.map(c => [String(c.id), String(c.display_name || c.company_name || '')]))

  /* §287 — le righe da un posto solo: questo controllo confronta il piano di
     cassa col conto economico, quindi deve costruire le righe **come** il conto
     economico. Prima ne aveva una copia sua, senza il valore venduto del
     progetto né la rata del subappalto. */
  const rowCtx = rowContext({
    month, months: months as unknown as { id: unknown; month: unknown }[],
    clients: clients as unknown as Record<string, unknown>[],
    streams: streamRows, streamProjects: coverRows,
  })
  const revenue = toRevenueLines(revRows, rowCtx)
  const costs = toCostLines(costRows, rowCtx)

  const config = rowToPlConfig(cfgRows[0] ?? {})
  const partners = partnerRows.map(p => ({
    id: String(p.id), label: String(p.label),
    takes_delivery: !!p.takes_delivery, takes_residual: !!p.takes_residual,
  })) as Partner[]
  /* Il commerciale dell'anagrafica lo mette già `toRevenueLine` (§185/§287). */
  const withOwner = revenue

  const ctx = { collection: collectionIndex(revenue.map(l => fromRevenue(l, l.month))) }
  const openMonths = new Set(months.map(m => m.month.slice(0, 10)))

  const vatMonths: MonthVat[] = Array.from(openMonths).sort().map(mm => ({
    month: mm,
    debit: revenue.filter(r => r.month === mm).reduce((s, r) => s + r.amount_net * r.vat_rate, 0),
    credit: costs.filter(c => c.month === mm && c.vat_applied).reduce((s, c) => s + c.actual * c.vat_rate, 0),
  }))
  const vatActuals: VatActual[] = vatRows.map(r => ({
    quarter: { year: Number(r.year), q: Number(r.quarter) as 1 | 2 | 3 | 4 },
    toPay: num(r.to_pay), docRef: (r.doc_ref as string) ?? null,
    paidOn: r.paid_on ? String(r.paid_on).slice(0, 10) : null,
  }))
  const quarters = vatByQuarter(vatMonths, today, vatActuals)
  const dues = quarters.filter(q => !q.closed && q.toPay > 0)
    .map(q => ({ date: q.deadline, amount: q.toPay, label: q.label }))
  const vatNow = quarters.find(q => !q.closed && q.toPay > 0) ?? null

  /* §284 — le righe che un movimento **di banca** dimostra: le altre spunte
     sono fatti che l'estratto conto non ha ancora visto, e si sommano al saldo
     invece di essere date per scontate. Stessa costruzione del caricamento in
     pagina, o lo script direbbe numeri diversi da quelli a schermo. */
  const alloc = await get<Record<string, unknown>[]>('bank_tx_lines?select=tx_id,revenue_line_id,cost_line_id')
    .catch(() => [] as Record<string, unknown>[])
  const bancaIds = new Set(txs.filter(t => String(t.source) === 'banca').map(t => String(t.id)))
  const inBank = new Set<string>()
  for (const t of txs) {
    if (String(t.source) !== 'banca') continue
    const id = t.revenue_line_id ?? t.cost_line_id
    if (id) inBank.add(String(id))
  }
  for (const a of alloc) {
    if (!bancaIds.has(String(a.tx_id))) continue
    const id = a.revenue_line_id ?? a.cost_line_id
    if (id) inBank.add(String(id))
  }

  const realTx = txs.filter(t => String(t.source) === 'banca')
  const opening = accounts.reduce((s, a) => s + num(a.opening_balance), 0)
  const balanceAt = (from: string) => r2(opening + realTx
    .filter(t => String(t.booked_on).slice(0, 10) < from).reduce((s, t) => s + num(t.amount), 0))
  /* §263 — il saldo di adesso: il mese in corso parte da lì. */
  const balanceNow = r2(opening + realTx.reduce((s, t) => s + num(t.amount), 0))

  const nowMonth = monthOf(today)
  const first = month <= nowMonth ? month : nowMonth
  const chain: string[] = []
  for (let m2 = first; m2 <= month; m2 = shiftMonth(m2, 1)) chain.push(m2)
  const bucket = (iso: string) => (monthOf(iso) < first ? first : monthOf(iso))

  const cashLines = [
    ...revenue.map(l => ({
      id: l.id, side: 'entrata' as const, label: l.label,
      who: l.client_id ? nameOf.get(l.client_id) ?? null : null,
      gross: r2(l.amount_net * (1 + l.vat_rate)),
      due: dueOf(fromRevenue(l, l.month), ctx), month: l.month, paid: l.paid, paidOn: l.paid_on,
    })),
    ...costs.filter(c => c.actual > 0 || c.budget > 0).map(c => ({
      id: c.id, side: 'uscita' as const, label: c.label, who: c.category || null,
      gross: r2((c.actual > 0 ? c.actual : c.budget) * (c.vat_applied ? 1 + c.vat_rate : 1)),
      due: dueOf(fromCost(c, c.month), ctx), month: c.month, paid: c.paid, paidOn: c.paid_on,
      external: !!c.project_id, payroll: isPayrollCenter(c.category),
    })),
  ]
  const payrollNow = r2(costs.filter(c => c.month === nowMonth && isPayrollCenter(c.category))
    .reduce((s, c) => s + (c.actual > 0 ? c.actual : c.budget), 0))

  const maturato = new Map(Array.from(openMonths).map(mm => {
    const t = computeMonth(withOwner.filter(l => l.month === mm), costs.filter(c => c.month === mm), config, partners)
    return [mm, {
      partners: t.perPartner.map(x => ({ who: x.partner.label, amount: x.total })),
      sales: t.salesByOwner.map(x => ({ who: x.label, amount: x.amount })),
    }]
  }))

  const streams = streamRows as unknown as RevenueStream[]
  const installments = inst as unknown as Installment[]
  const items = (itemRows as unknown as CostItem[]).filter(i => i.is_active)

  const plannedRev = (mm: string) => linesForMonth(streams, installments, mm).map((l, k) => ({
    id: `${mm}:rev:${k}`, label: l.label, client_id: l.client_id,
    plan_amount: 0, invoices: 0, amount_net: l.amount_net, vat_rate: l.vat_rate,
    invoice_sent: false, paid: false, kind: l.kind,
    sales_owner_id: l.sales_owner_id, sales_owner: null,
    client_sales_owner: l.client_id ? rowCtx.ownerOf.get(l.client_id)?.name ?? null : null,
    project_id: l.project_id, pass_through: l.pass_through, risk_fund: false,
  }))
  const plannedCost = (mm: string) => plannedForMonth(items, mm).map((it, k) => ({
    id: `${mm}:cost:${k}`, center_id: it.center_id, cost_item_id: it.id,
    project_id: it.project_id ?? null, partner_id: null, deductible_pct: 1,
    category: it.category, label: it.label, cost_type: it.cost_type,
    budget: it.amount, actual: 0, paid: false,
    vat_applied: it.vat_applied, vat_rate: it.vat_rate,
  }))
  const maturatoOf = (mm: string) => maturato.get(mm) ?? (() => {
    const t = computeMonth(plannedRev(mm), plannedCost(mm), config, partners)
    return {
      partners: t.perPartner.map(x => ({ who: x.partner.label, amount: x.total })),
      sales: t.salesByOwner.map(x => ({ who: x.label, amount: x.amount })),
    }
  })()

  const plan: PlanMonth[] = chain.map(mm => {
    const open = openMonths.has(mm)
    const prev = maturatoOf(shiftMonth(mm, -1))
    const mat = payoutRows.filter(x => String(x.due_month ?? '').slice(0, 10) === mm && x.paid !== true)
    return {
      month: mm,
      opening: mm === nowMonth ? balanceNow : balanceAt(mm),
      anchor: mm === nowMonth ? today : null,
      open,
      items: planMonth({
        month: mm, today, open, anchor: mm === nowMonth ? today : null, inBank,
        /* §264 — si passano **tutte** le righe: quali sono di questo mese e
           quali ci si muovono soltanto lo decide il motore, che è l'unico posto
           dove quella regola deve vivere. */
        lines: cashLines,
        since: first,
        planned: open ? [] : [
          ...linesForMonth(streams, installments, mm).map((l, k) => ({
            id: `${mm}:rev:${k}`, side: 'entrata' as const, label: l.label,
            who: l.client_id ? nameOf.get(l.client_id) ?? null : null,
            gross: r2(l.amount_net * (1 + l.vat_rate)),
            due: dueOf({ id: '', side: 'entrata', month: mm, amount: l.amount_net, paid: false }),
          })),
          ...plannedForMonth(items, mm).map((it, k) => ({
            id: `${mm}:cost:${k}`, side: 'uscita' as const, label: it.label, who: it.supplier ?? null,
            gross: r2(it.amount * (it.vat_applied ? 1 + it.vat_rate : 1)),
            due: dueOf({
              id: '', side: 'uscita', month: mm, amount: it.amount, paid: false,
              category: it.category, project_id: it.project_id ?? null,
            }, ctx),
            external: !!it.project_id,
          })),
        ],
        dues: dues.filter(d => bucket(d.date) === mm),
        payouts: mat.length
          ? mat.map(x => ({
              key: String(x.id), who: String(x.person_label ?? ''),
              kind: (x.kind === 'commerciale' ? 'commerciale' : 'socio') as 'socio' | 'commerciale',
              amount: num(x.amount), from: shiftMonth(mm, -1),
            }))
          : [
              ...(prev?.partners ?? []).map(p => ({
                key: `p:${p.who}`, who: p.who, kind: 'socio' as const,
                amount: r2(p.amount), from: shiftMonth(mm, -1),
              })),
              ...(prev?.sales ?? []).map(p => ({
                key: `o:${p.who}`, who: p.who, kind: 'commerciale' as const,
                amount: r2(p.amount), from: shiftMonth(mm, -1),
              })),
            ],
        /* §225 — la stima vale solo se il mese **prima** non è aperto: le
           retribuzioni escono il 20 del mese dopo, e dove quelle righe esistono
           sono già in lista. */
        payroll: openMonths.has(shiftMonth(mm, -1)) ? 0 : payrollNow,
      }),
    }
  })

  const sim = simulate(plan, new Set())
  const idx = plan.findIndex(m => m.month === month)
  const cur = plan[idx], t = sim[idx]

  line('═')
  console.log(`PIANO DI CASSA · ${month}   (oggi ${today}${cur.open ? '' : ' · mese mai aperto'})`)
  line('═')
  console.log(`${cur.anchor ? 'Sul conto adesso   ' : 'Saldo a inizio mese'}  ${eur2(t.opening).padStart(12)}`)
  if (t.alreadyIn > 0 || t.alreadyOut > 0) {
    console.log(`  già passati nel mese: ${eur2(t.alreadyIn)} dentro · ${eur2(t.alreadyOut)} fuori (nel saldo)`)
  }
  if (t.declaredIn > 0 || t.declaredOut > 0) {
    console.log(`  spuntati e non ancora in estratto conto: +${eur2(t.declaredIn)} · −${eur2(t.declaredOut)}`
      + `  → contati come ${eur2(t.opening + t.declaredIn - t.declaredOut)}`)
  }

  for (const side of ['entrata', 'uscita'] as const) {
    const own = cur.items.filter(i => i.side === side)
    if (!own.length) continue
    line()
    console.log(side === 'entrata' ? 'ENTRATE' : 'USCITE')
    for (const g of Object.keys(GROUPS) as (keyof typeof GROUPS)[]) {
      const gi = own.filter(i => i.group === g)
      if (!gi.length) continue
      console.log(`  ${GROUPS[g]} — ${eur2(gi.reduce((s, i) => s + i.gross, 0))}`)
      for (const i of gi) {
        const tag = i.inBalance ? 'nel saldo' : i.movesIn ? (i.accrual ? 'mese+cassa' : 'solo cassa') : 'solo mese'
        console.log(`    ${i.due}  ${eur2(i.gross).padStart(11)}  ${i.state.padEnd(8)}${tag.padEnd(11)}`
          + `${(i.who ? `${i.who} · ` : '')}${i.label}`.slice(0, 44))
      }
    }
  }

  /* §264 — il controllo che conta: le voci di questo mese devono combaciare
     **riga per riga** col conto economico dello stesso mese, pagate o no. */
  line()
  const ceRev = r2(revenue.filter(r => r.month === month)
    .reduce((s2, r) => s2 + r.amount_net * (1 + r.vat_rate), 0))
  const ceCost = r2(costs.filter(c => c.month === month)
    .reduce((s2, c) => s2 + (c.actual > 0 ? c.actual : c.budget) * (c.vat_applied ? 1 + c.vat_rate : 1), 0))
  const nRev = revenue.filter(r => r.month === month).length
  const nCost = costs.filter(c => c.month === month && (c.actual > 0 || c.budget > 0)).length
  const mieRev = cur.items.filter(x => x.accrual && x.side === 'entrata')
  const mieCost = cur.items.filter(x => x.accrual && x.side === 'uscita')
  const okRev = Math.abs(t.accrualIn - ceRev) < 0.02 && (!cur.open || mieRev.length === nRev)
  const okCost = Math.abs(t.accrualOut - ceCost) < 0.02 && (!cur.open || mieCost.length === nCost)
  console.log('CONTROLLO — le voci del mese contro il conto economico')
  console.log(`  entrate  piano ${eur2(t.accrualIn).padStart(12)} (${mieRev.length} voci)`
    + `  ·  conto economico ${eur2(ceRev).padStart(12)} (${nRev} righe)  ${okRev ? '✓' : '✗'}`)
  console.log(`  uscite   piano ${eur2(t.accrualOut).padStart(12)} (${mieCost.length} voci)`
    + `  ·  conto economico ${eur2(ceCost).padStart(12)} (${nCost} righe)  ${okCost ? '✓' : '✗'}`)
  if (!cur.open) console.log('  (mese mai aperto: le voci vengono dal contratto e dal piano)')

  line()
  console.log(`Di competenza: entrate ${eur2(t.accrualIn)} · uscite ${eur2(t.accrualOut)}`)
  console.log(`In cassa: da incassare ${eur2(t.inflow)} · da pagare ${eur2(t.outflow)}`
    + ` · saldo a fine mese ${eur2(t.end)}`)
  const o = outcomes(cur, new Set(), t.opening)
  console.log(`Se non incassi niente ${eur2(o.floor)} · se pagano i puntuali ${eur2(o.expected)}`
    + ` · se rientrano gli scaduti ${eur2(o.best)}`)

  line()
  console.log('COSA PUOI FARE')
  for (const a of advice(cur, new Set(), {
    vatHeld: vatNow?.toPay ?? 0, vatLabel: vatNow?.label ?? '', opening: t.opening,
  })) {
    console.log(`  [${a.kind}] ${a.title}`)
    console.log(`      ${a.detail}`)
  }

  if (plan.length > 1) {
    line()
    console.log('COME PROSEGUE')
    for (const s of sim) console.log(`  ${s.month}  ${eur2(s.end).padStart(12)}`)
  }
  line('═')
}

main().catch(e => { console.error(e); process.exit(1) })
