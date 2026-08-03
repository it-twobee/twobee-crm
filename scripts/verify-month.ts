/**
 * Un mese di conto economico, letto dal database e passato al motore vero.
 *
 *   npx tsx scripts/verify-month.ts 2026-07-01
 *
 * Serve a controllare la catena intera — contratti, righe, subappalti, piano
 * compensi — con lo stesso codice che gira in pagina, non con una riscrittura
 * che potrebbe divergere. Sola lettura: non scrive niente.
 */
import { readFileSync } from 'fs'
import { computeMonth, rowToPlConfig, type RevenueLine, type CostLine, type Partner } from '@/lib/pl'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))

const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

const eur = (n: number) => `€${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pc = (n: number) => `${(n * 100).toFixed(2).replace('.', ',')}%`

async function main() {
  const month = process.argv[2] ?? '2026-07-01'

  const [months, cfgRows, partnerRows, clients, streams] = await Promise.all([
    get<{ id: string; month: string }[]>(`pl_months?select=id,month&month=eq.${month}`),
    get<Record<string, unknown>[]>('pl_config?select=*&id=eq.true'),
    get<Record<string, unknown>[]>('pl_partners?select=*&is_active=eq.true&order=sort_order'),
    get<{ id: string; display_name: string | null; company_name: string; sales_owner_id: string | null; sales_owner_name: string | null }[]>(
      'clients?select=id,display_name,company_name,sales_owner_id,sales_owner_name'),
    get<{ id: string; amount: number; status: string; project_id: string | null }[]>('revenue_streams?select=id,amount,status,project_id'),
  ])
  if (!months.length) throw new Error(`il mese ${month} non esiste`)
  const monthId = months[0].id

  const [revRows, costRows] = await Promise.all([
    get<Record<string, unknown>[]>(`pl_revenue_lines?select=*&month_id=eq.${monthId}&order=sort_order`),
    get<Record<string, unknown>[]>(`pl_cost_lines?select=*&month_id=eq.${monthId}`),
  ])

  const owner = new Map(clients.map(c => [c.id, c]))
  const num = (v: unknown) => Number(v ?? 0)

  // il valore venduto del progetto: decide l'opzione fondo rischio (§186)
  const projectValue = new Map<string, number>()
  for (const s of streams) {
    if (!s.project_id || s.status === 'bozza') continue
    projectValue.set(s.project_id, (projectValue.get(s.project_id) ?? 0) + num(s.amount))
  }

  const revenue: RevenueLine[] = revRows.map(r => ({
    id: String(r.id), label: String(r.label), client_id: (r.client_id as string) ?? null,
    plan_amount: num(r.plan_amount), invoices: num(r.invoices), amount_net: num(r.amount_net),
    vat_rate: num(r.vat_rate), invoice_sent: !!r.invoice_sent, paid: !!r.paid,
    kind: r.kind === 'digital' ? 'digital' : 'growth',
    sales_owner_id: (r.sales_owner_id as string) ?? null,
    sales_owner: (r.sales_owner as string) ?? null,
    client_sales_owner_id: owner.get(String(r.client_id))?.sales_owner_id ?? null,
    client_sales_owner: owner.get(String(r.client_id))?.sales_owner_name ?? null,
    project_id: (r.project_id as string) ?? null,
    project_value: projectValue.get(String(r.project_id ?? '')) ?? null,
    risk_fund: r.risk_fund === true,
    pass_through: r.pass_through === true,
  }))

  const costs: CostLine[] = costRows.map(c => ({
    id: String(c.id), center_id: (c.center_id as string) ?? null,
    project_id: (c.project_id as string) ?? null,
    category: String(c.category), label: String(c.label),
    cost_type: c.cost_type === 'V' ? 'V' : 'F',
    budget: num(c.budget), actual: num(c.actual), paid: !!c.paid,
    vat_applied: !!c.vat_applied, vat_rate: num(c.vat_rate),
  }))

  const partners: Partner[] = partnerRows.map(p => ({
    id: String(p.id), label: String(p.label),
    takes_delivery: p.takes_delivery !== false, takes_residual: p.takes_residual !== false,
  }))

  const config = rowToPlConfig(cfgRows[0])
  const t = computeMonth(revenue, costs, config, partners)

  console.log(`\n═══ ${month} ═══════════════════════════════════════════`)
  console.log(`  righe                 ${revenue.length}`)
  console.log(`  imponibile            ${eur(t.revenue.accrued)}   growth ${eur(t.revenue.growth)} · digital ${eur(t.revenue.digital)}`)
  console.log(`  incassato             ${eur(t.revenue.collected)}   da incassare ${eur(t.revenue.unpaid)}`)
  console.log(`  IVA a debito          ${eur(t.revenue.vat)}`)
  if (t.plan.passThrough > 0) console.log(`  di cui partite di giro ${eur(t.plan.passThrough)}   (fuori dalle quote)`)

  console.log(`\n  ── piano compensi ──`)
  console.log(`  provvigioni           ${eur(t.plan.sales)}`)
  for (const s of t.salesByOwner) {
    console.log(`     ${s.label.padEnd(22)} ${eur(s.amount).padStart(12)}${s.fromRegistry ? '   (dall\'anagrafica)' : ''}`)
  }
  if (t.plan.salesPool > 0) console.log(`     senza commerciale     ${eur(t.plan.salesPool).padStart(11)}   → ${eur(t.plan.poolShare)} a testa`)
  console.log(`  erogato growth        ${eur(t.plan.delivery)}`)
  console.log(`  margine digital       ${eur(t.plan.digitalMargin)}   (subappalti tolti: ${eur(t.plan.digitalExternal)})`)
  console.log(`  quota digital a socio ${eur(t.plan.digitalPerPartner)}   × ${partners.length} = ${eur(t.plan.digitalPartners)}`)
  if (t.plan.digitalRetained !== 0) console.log(`  digital non assegnato ${eur(t.plan.digitalRetained)}`)

  console.log(`\n  ── per socio ──`)
  for (const p of t.perPartner) {
    console.log(`  ${p.partner.label.padEnd(10)} ${eur(p.total).padStart(12)}   erogato ${eur(p.delivery)} · digital ${eur(p.digital)} · provvigione divisa ${eur(p.salesShare)}`)
  }

  console.log(`\n  ── costi e cassa ──`)
  console.log(`  costi effettivi       ${eur(t.costs.actual)}   target ${eur(t.costs.target)} (${pc(config.cost_target_pct)} del growth)`)
  console.log(`  fondo rischio         ${eur(t.plan.riskFund)}`)
  console.log(`  cassa TwoBee          ${eur(t.margin.company)}`)
  console.log(`  margine lordo         ${eur(t.margin.gross)}   distribuito ${eur(t.plan.distributed)} → netto ${eur(t.margin.net)}`)

  /* La quadratura si fa sull'imponibile **al netto delle partite di giro**: quei
     soldi non sono ricavo di nessuno, tornano al cliente come advertising. */
  const somma = t.plan.sales + t.plan.delivery + t.plan.digitalPartners + t.margin.company
    + t.costs.actual + t.plan.digitalExternal
  const base = t.revenue.accrued - t.plan.passThrough
  console.log(`\n  quadratura su ${eur(base)} (imponibile meno le partite di giro)`)
  console.log(`  quote + costi + subappalti = ${eur(somma)} → differenza ${eur(base - somma)}\n`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
