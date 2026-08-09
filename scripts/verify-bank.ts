/**
 * I movimenti bancari, letti dal database e passati ai motori veri.
 *
 *   npx tsx scripts/verify-bank.ts [mese]
 *
 * Stessa ragione di `verify-month.ts` e `verify-cash.ts`: controllare la catena
 * col codice che gira in pagina, non con una riscrittura che può divergere.
 * Sola lettura: non scrive niente.
 *
 * Sei controlli, in ordine di gravità:
 *
 *   1. **saldo** per conto — apertura più i soli movimenti `banca` (§189)
 *   2. **il ponte** (§199) — l'identità è esatta, quindi un residuo diverso da
 *      zero è un movimento che nessuna riga giustifica
 *   3. **certificazione** (§226) — quante spunte la banca dimostra
 *   4. **giroconti** spaiati — un lato solo fa sparire liquidità
 *   5. **da riconciliare** — movimenti veri senza una riga dietro
 *   6. **igiene** — duplicati, movimenti senza categoria, buchi nelle date
 */
import { readFileSync } from 'fs'
import { balance, byKind, unreconciled, type BankTx, type TxKind } from '@/lib/bank'
import { cashBridge } from '@/lib/cash-bridge'
import { certify, certSummary, type CertLine, type CertTx } from '@/lib/cash-certify'
import { computeMonth, rowToPlConfig, type RevenueLine, type CostLine, type Partner } from '@/lib/pl'
import { eur2 } from '@/lib/money'

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
const FOCUS = process.argv[2] ?? null
const line = (s = '─') => console.log(s.repeat(78))

async function main() {
  const [accounts, txRows, months, config, partners] = await Promise.all([
    get<Record<string, unknown>[]>('bank_accounts?select=*&order=is_primary.desc'),
    get<Record<string, unknown>[]>('bank_transactions?select=*&order=booked_on'),
    get<{ id: string; month: string; status: string }[]>('pl_months?select=id,month,status&order=month'),
    get<Record<string, unknown>[]>('pl_config?select=*&limit=1'),
    get<Record<string, unknown>[]>('pl_partners?select=*'),
  ])
  const [revRows, costRows, clientRows, streamRows] = await Promise.all([
    get<Record<string, unknown>[]>('pl_revenue_lines?select=*'),
    get<Record<string, unknown>[]>('pl_cost_lines?select=*'),
    get<Record<string, unknown>[]>('clients?select=id,sales_owner_name'),
    get<Record<string, unknown>[]>('revenue_streams?select=project_id,amount,status'),
  ])
  /* Due campi che la riga non porta e il motore usa: il commerciale
     dell'anagrafica (§185) e il valore venduto del progetto, che decide il fondo
     rischio digital sopra i 20.000 € (§186). Senza, le quote — e quindi il
     ponte — verrebbero diverse da quelle della pagina. */
  const ownerOfClient = new Map(clientRows.map(c => [String(c.id), (c.sales_owner_name as string) ?? null]))
  const projectValue = new Map<string, number>()
  for (const st of streamRows) {
    if (!st.project_id || st.status === 'bozza') continue
    const k = String(st.project_id)
    projectValue.set(k, (projectValue.get(k) ?? 0) + num(st.amount))
  }

  const txs: BankTx[] = txRows.map(t => ({
    id: String(t.id), account_id: String(t.account_id),
    booked_on: String(t.booked_on).slice(0, 10),
    value_on: t.value_on ? String(t.value_on).slice(0, 10) : null,
    amount: num(t.amount), currency: String(t.currency ?? 'EUR'),
    causal_code: (t.causal_code as string) ?? null, description: String(t.description ?? ''),
    channel: (t.channel as string) ?? null, counterparty: (t.counterparty as string) ?? null,
    kind: String(t.kind ?? 'altro') as TxKind, doc_ref: (t.doc_ref as string) ?? null,
    source: String(t.source) as BankTx['source'],
    revenue_line_id: (t.revenue_line_id as string) ?? null,
    cost_line_id: (t.cost_line_id as string) ?? null,
    matched_at: (t.matched_at as string) ?? null,
    no_match_needed: t.no_match_needed === true,
    note: (t.note as string) ?? null,
    transfer_pair_id: (t.transfer_pair_id as string) ?? null,
  } as BankTx))
  const nameOf = new Map(accounts.map(a => [String(a.id), String(a.label ?? a.id)]))

  // ── 1 · il saldo, conto per conto ─────────────────────────────────────────
  line('═')
  console.log('1 · SALDI — apertura più i soli movimenti «banca» (§189)')
  line()
  let realTot = 0, declaredTot = 0
  for (const a of accounts) {
    const own = txs.filter(t => t.account_id === String(a.id))
    const b = balance({ opening_balance: num(a.opening_balance) }, own)
    realTot += b.real; declaredTot += b.declared
    console.log(`  ${String(a.label).padEnd(34)} reale ${eur2(b.real).padStart(12)}`
      + ` · dichiarato ${eur2(b.declared).padStart(12)}`
      + ` · ${own.filter(t => t.source === 'banca').length} movimenti`
      + (b.lastBookedOn ? ` · ultimo ${b.lastBookedOn}` : ' · nessuno'))
  }
  console.log(`  ${'TOTALE'.padEnd(34)} reale ${eur2(realTot).padStart(12)} · dichiarato ${eur2(declaredTot).padStart(12)}`)
  const pending = Math.round((declaredTot - realTot) * 100) / 100
  if (Math.abs(pending) > 0.5) {
    console.log(`  ⚠ ${eur2(Math.abs(pending))} di scarto: è quello che il tool crede senza avere una prova.`)
  }

  // ── 2 · il ponte conto economico → saldo ──────────────────────────────────
  const cfg = rowToPlConfig(config[0] ?? {})
  const plPartners = partners.map(p => ({ id: String(p.id), label: String(p.label),
    takes_delivery: !!p.takes_delivery, takes_residual: !!p.takes_residual })) as Partner[]
  const mOf = new Map(months.map(m => [m.id, m.month.slice(0, 10)]))
  const asRev = (r: Record<string, unknown>): RevenueLine & { month: string } => ({
    ...(r as unknown as RevenueLine), month: mOf.get(String(r.month_id)) ?? '',
    amount_net: num(r.amount_net), vat_rate: num(r.vat_rate), paid: r.paid === true,
    client_sales_owner: ownerOfClient.get(String(r.client_id)) ?? null,
    project_value: projectValue.get(String(r.project_id ?? '')) ?? null })
  const asCost = (c: Record<string, unknown>): CostLine & { month: string } => ({
    ...(c as unknown as CostLine), month: mOf.get(String(c.month_id)) ?? '',
    budget: num(c.budget), actual: num(c.actual), paid: c.paid === true })
  const allRev = revRows.map(asRev)
  const allCost = costRows.map(asCost)

  const bridgeMonths = months.map(m => {
    const mm = m.month.slice(0, 10)
    const rev = allRev.filter(l => l.month === mm)
    const cst = allCost.filter(c => c.month === mm)
    const t = computeMonth(rev, cst, cfg, plPartners)
    /* Le stesse definizioni della pagina Banca: se qui divergessero, il ponte
       direbbe che non quadra per colpa del controllo, non dei dati. */
    return {
      month: mm,
      accrued: t.revenue.accrued,
      collected: t.revenue.collected,
      vat: t.revenue.vat,
      costs: t.costs.actual,
      costsPaid: t.costs.paid,
      costsVatPaid: Math.round(cst.filter(c => c.paid && c.vat_applied)
        .reduce((n, c) => n + c.actual * c.vat_rate, 0) * 100) / 100,
      distributed: t.plan.distributed,
      companyPlan: t.margin.company,
    }
  })
  const opening = accounts.reduce((s, a) => s + num(a.opening_balance), 0)
  const bridge = cashBridge(bridgeMonths, txs.map(t => ({
    booked_on: t.booked_on, amount: t.amount, kind: t.kind, source: t.source })), opening)

  line('═')
  console.log('2 · IL PONTE (§199) — ogni euro di differenza deve avere un nome')
  line()
  console.log(`  cassa cumulata del piano  ${eur2(bridge.planCum).padStart(13)}`)
  console.log(`  saldo vero                ${eur2(bridge.balance).padStart(13)}`)
  bridge.items.forEach(i => console.log(`    ${i.label.padEnd(34)} ${eur2(i.amount).padStart(13)}`))
  console.log(`  ${'RESIDUO NON SPIEGATO'.padEnd(36)} ${eur2(bridge.residual).padStart(13)}`
    + (Math.abs(bridge.residual) < 1 ? '   ✓ quadra' : '   ✗ NON QUADRA'))
  if (Math.abs(bridge.residual) >= 1) {
    console.log('  Non è un arrotondamento: è un movimento che nessuna riga giustifica,')
    console.log('  o una spunta «pagato» su qualcosa che dal conto non è uscito.')
  }
  console.log('\n  mese      competenza      costi     cassa in    cassa out    cum. piano   cum. cassa')
  bridge.rows.forEach(r => console.log(`  ${r.month.slice(0, 7)}  ${eur2(r.accrued).padStart(12)}`
    + ` ${eur2(r.costs).padStart(11)} ${eur2(r.cashIn).padStart(12)} ${eur2(r.cashOut).padStart(12)}`
    + ` ${eur2(r.cumPlan).padStart(13)} ${eur2(r.cumCash).padStart(12)}`))

  // ── 3 · quanto delle spunte lo dimostra la banca ──────────────────────────
  const certTxs: CertTx[] = txs.map(t => ({
    id: t.id, booked_on: t.booked_on, amount: t.amount, source: t.source, kind: t.kind,
    counterparty: t.counterparty, description: t.description,
    revenue_line_id: t.revenue_line_id, cost_line_id: t.cost_line_id }))
  const certLines: CertLine[] = [
    ...allRev.map(l => ({ id: l.id, side: 'entrata' as const, month: l.month, label: l.label,
      net: l.amount_net, vatRate: l.vat_rate, paid: l.paid, paid_on: l.paid_on ?? null })),
    ...allCost.map(c => ({ id: c.id, side: 'uscita' as const, month: c.month, label: c.label,
      net: c.actual, vatRate: c.vat_applied ? c.vat_rate : 0, paid: c.paid, paid_on: c.paid_on ?? null })),
  ]
  const settled = (config[0]?.settled_from ?? config[0]?.payout_from) as string | undefined
  const certs = certify(certLines, certTxs, settled ? `${String(settled).slice(0, 7)}-01` : null)
  const all = Array.from(certs.values())
  const sum = certSummary(all)
  line('═')
  console.log('3 · LE SPUNTE CERTIFICATE (§226)')
  line()
  console.log(`  certificate ${sum.certificate} · da datare ${sum.daDatare} · dichiarate ${sum.dichiarate}`
    + ` · sospette ${sum.sospette} · consolidate ${sum.consolidate}`)
  console.log(`  dichiarato senza prova: ${eur2(sum.dichiarateAmount)}`)
  const byId = new Map(certLines.map(l => [l.id, l]))
  const show = (state: string, tag: string, limit = 8) => {
    for (const c of all.filter(x => x.state === state).slice(0, limit)) {
      const l = byId.get(c.lineId)
      console.log(`  ${tag} ${String(l?.month).slice(0, 7)} ${String(l?.label).slice(0, 38).padEnd(40)}`
        + ` ${eur2(c.gross).padStart(11)}${c.bookedOn ? ` · banca ${c.bookedOn}` : ''}`
        + (c.movesMonth ? ' · CAMBIA MESE DI CASSA' : ''))
    }
  }
  show('sospetta', '⚠ sospetta ')
  show('da-datare', '· da datare')
  show('dichiarata', '· dichiar. ', 10)

  // ── 4 · giroconti spaiati ─────────────────────────────────────────────────
  line('═')
  console.log('4 · GIROCONTI — i due lati sono un fatto solo (§190)')
  line()
  const giri = txs.filter(t => t.kind === 'giroconto')
  const spaiati = giri.filter(t => !t.transfer_pair_id)
  console.log(`  ${giri.length} movimenti di giroconto · ${giri.length - spaiati.length} appaiati · ${spaiati.length} soli`)
  spaiati.forEach(t => console.log(`  ⚠ ${t.booked_on} ${eur2(t.amount).padStart(12)}`
    + ` ${nameOf.get(t.account_id)} — ${String(t.counterparty ?? t.description).slice(0, 44)}`))
  if (spaiati.length) {
    console.log('  Un lato senza l\'altro fa sembrare che la liquidità sia scesa, e la lista')
    console.log('  da riconciliare chiede due volte lo stesso fatto.')
  }

  // ── 5 · movimenti veri senza una riga dietro ──────────────────────────────
  line('═')
  console.log('5 · DA RICONCILIARE — movimenti veri che nessuna riga spiega')
  line()
  const open = unreconciled(txs)
  const inflow = open.filter(t => t.amount > 0)
  const outflow = open.filter(t => t.amount < 0)
  console.log(`  ${open.length} movimenti · ${inflow.length} in entrata per`
    + ` ${eur2(inflow.reduce((s, t) => s + t.amount, 0))}`
    + ` · ${outflow.length} in uscita per ${eur2(Math.abs(outflow.reduce((s, t) => s + t.amount, 0)))}`)
  const grossi = open.filter(t => Math.abs(t.amount) >= 500)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  grossi.slice(0, 12).forEach(t => console.log(`  · ${t.booked_on} ${eur2(t.amount).padStart(12)}`
    + ` ${String(t.kind).padEnd(13)} ${String(t.counterparty ?? t.description).slice(0, 40)}`))
  if (grossi.length > 12) console.log(`  … e altri ${grossi.length - 12} sopra i 500 €`)

  // ── 6 · igiene dell'archivio ──────────────────────────────────────────────
  line('═')
  console.log('6 · IGIENE — duplicati, categorie mancanti, buchi')
  line()
  const seen = new Map<string, BankTx[]>()
  for (const t of txs.filter(t => t.source === 'banca')) {
    const k = `${t.booked_on}|${t.amount}|${(t.counterparty ?? t.description).slice(0, 30)}`
    seen.set(k, [...(seen.get(k) ?? []), t])
  }
  const dup = Array.from(seen.values()).filter(v => v.length > 1)
  console.log(`  possibili duplicati: ${dup.length}`)
  dup.slice(0, 6).forEach(v => console.log(`  ⚠ ${v.length}× ${v[0].booked_on} ${eur2(v[0].amount)}`
    + ` ${String(v[0].counterparty ?? v[0].description).slice(0, 40)}`))
  const senzaCat = txs.filter(t => t.source === 'banca' && (!t.kind || t.kind === 'altro'))
  console.log(`  senza categoria: ${senzaCat.length}`
    + (senzaCat.length ? ` per ${eur2(senzaCat.reduce((s, t) => s + Math.abs(t.amount), 0))}` : ''))
  senzaCat.slice(0, 8).forEach(t => console.log(`  · ${t.booked_on} ${eur2(t.amount).padStart(12)}`
    + ` ${String(t.counterparty ?? t.description).slice(0, 46)}`))
  console.log('\n  per tipo:')
  byKind(txs.filter(t => t.source === 'banca')).forEach(k =>
    console.log(`    ${k.kind.padEnd(15)} ${String(k.count).padStart(4)} mov · in ${eur2(k.inflow).padStart(12)}`
      + ` · out ${eur2(k.outflow).padStart(12)}`))

  // ── il mese guardato ──────────────────────────────────────────────────────
  if (FOCUS) {
    const mm = FOCUS.slice(0, 7)
    line('═')
    console.log(`IL MESE ${mm} — cosa è passato dal conto`)
    line()
    const own = txs.filter(t => t.booked_on.slice(0, 7) === mm)
    const real = own.filter(t => t.source === 'banca')
    console.log(`  ${real.length} movimenti veri · in ${eur2(real.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0))}`
      + ` · out ${eur2(Math.abs(real.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)))}`)
    console.log(`  ${own.filter(t => t.source === 'derivato').length} dichiarati`
      + ` · ${own.filter(t => t.source === 'manuale').length} manuali`)
    const row = bridge.rows.find(r => r.month.slice(0, 7) === mm)
    if (row) {
      console.log(`  conto economico: competenza ${eur2(row.accrued)} · costi ${eur2(row.costs)}`
        + ` · cassa TwoBee del piano ${eur2(row.companyPlan)}`)
    }
    const mrev = allRev.filter(l => l.month.slice(0, 7) === mm)
    const mcost = allCost.filter(c => c.month.slice(0, 7) === mm)
    console.log(`  righe: ${mrev.length} entrate (${mrev.filter(l => !l.paid).length} da incassare)`
      + ` · ${mcost.length} uscite (${mcost.filter(c => !c.paid).length} da pagare)`)
    const mcerts = [...mrev, ...mcost].map(l => certs.get(l.id)).filter(Boolean)
    const ms = certSummary(mcerts as never[])
    console.log(`  spunte: ${ms.certificate} certificate · ${ms.dichiarate} dichiarate`
      + ` (${eur2(ms.dichiarateAmount)}) · ${ms.sospette} sospette · ${ms.consolidate} consolidate`)
    const zero = mcost.filter(c => c.actual === 0 && c.budget > 0)
    if (zero.length) console.log(`  ⚠ ${zero.length} uscite con effettivo a zero e preventivato pieno`)
  }
  line('═')
}

main().catch(e => { console.error(e); process.exit(1) })
