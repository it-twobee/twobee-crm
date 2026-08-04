import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BankClient } from '@/components/bank/BankClient'
import { monthKey } from '@/lib/pl'
import { rowToPlConfig, computeMonth, type RevenueLine, type CostLine, type Partner } from '@/lib/pl'
import type { BankAccount, BankTx, PlLineRef, Expected } from '@/lib/bank'

export const revalidate = 0

/**
 * Il conto corrente, e tutto quello che ci arriva sopra.
 *
 * La pagina carica tre cose e le tiene distinte: i **movimenti** (fatti), le
 * **righe di conto economico** aperte (crediti e debiti, da riconciliare), e le
 * **scadenze future** (rate firmate e costi a piano) da cui nasce la previsione.
 * Il conto economico per periodo si aggrega dai mesi, che è l'unica granularità
 * in cui esiste.
 */
export default async function BancaPage({ searchParams }: { searchParams: { m?: string; g?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const month = /^\d{4}-\d{2}-01$/.test(searchParams.m ?? '') ? searchParams.m! : monthKey(new Date())

  const { data: accounts, error: setupErr } = await supabase.from('bank_accounts')
    .select('*').eq('is_active', true).order('is_primary', { ascending: false })

  const setupNeeded = setupErr?.code === '42P01' || setupErr?.code === 'PGRST205'
  const account = (accounts ?? [])[0] as BankAccount | undefined

  if (setupNeeded || !account) {
    return <BankClient month={month} setupNeeded account={null} txs={[]} openLines={[]}
      expected={[]} months={[]} plByMonth={[]} clientNames={{}} today={new Date().toISOString().slice(0, 10)} />
  }

  const num = (v: unknown) => Number(v ?? 0)

  const [{ data: txRows }, { data: plMonths }, { data: cfgRow }, { data: partnerRows }, { data: clients }] =
    await Promise.all([
      supabase.from('bank_transactions').select('*').eq('account_id', account.id)
        .order('booked_on', { ascending: false }).limit(2000),
      supabase.from('pl_months').select('id, month, status').order('month'),
      supabase.from('pl_config').select('*').eq('id', true).maybeSingle(),
      supabase.from('pl_partners').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('clients').select('id, company_name, display_name'),
    ])

  const monthIds = (plMonths ?? []).map((m: { id: string }) => m.id)
  const [{ data: revRows }, { data: costRows }, { data: streams }, { data: inst }, { data: items }] =
    monthIds.length
      ? await Promise.all([
          supabase.from('pl_revenue_lines').select('*').in('month_id', monthIds),
          supabase.from('pl_cost_lines').select('*').in('month_id', monthIds),
          supabase.from('revenue_streams').select('*'),
          supabase.from('revenue_installments').select('*'),
          supabase.from('cost_items').select('*').eq('is_active', true),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const monthOf = new Map((plMonths ?? []).map((m: { id: string; month: string }) => [m.id, m.month]))
  const nameOf = new Map((clients ?? []).map((c: { id: string; company_name: string; display_name: string | null }) =>
    [c.id, c.display_name || c.company_name]))
  const clientNames = Object.fromEntries(nameOf)

  // ── i movimenti ────────────────────────────────────────────────────────────
  const txs: BankTx[] = (txRows ?? []).map((t: Record<string, unknown>) => ({
    id: String(t.id), account_id: String(t.account_id),
    booked_on: String(t.booked_on).slice(0, 10),
    value_on: t.value_on ? String(t.value_on).slice(0, 10) : null,
    amount: num(t.amount), description: String(t.description),
    counterparty: (t.counterparty as string) ?? null,
    kind: (t.kind as BankTx['kind']) ?? 'altro',
    doc_ref: (t.doc_ref as string) ?? null,
    source: (t.source as BankTx['source']) ?? 'banca',
    causal_code: (t.causal_code as string) ?? null,
    revenue_line_id: (t.revenue_line_id as string) ?? null,
    cost_line_id: (t.cost_line_id as string) ?? null,
    payslip_id: (t.payslip_id as string) ?? null,
    hr_invoice_id: (t.hr_invoice_id as string) ?? null,
    matched_at: (t.matched_at as string) ?? null,
    no_match_needed: t.no_match_needed === true,
    note: (t.note as string) ?? null,
  }))

  /* Le righe aperte: crediti e debiti che aspettano un movimento. Sono i
     candidati della riconciliazione e, quando la scadenza è passata, la parte
     scaduta della previsione. */
  const openLines: PlLineRef[] = [
    ...(revRows ?? []).filter((r: Record<string, unknown>) => !r.paid).map((r: Record<string, unknown>) => ({
      id: String(r.id), month: monthOf.get(String(r.month_id)) ?? '',
      label: String(r.label), clientName: nameOf.get(String(r.client_id ?? '')) ?? null,
      net: num(r.amount_net), vatRate: num(r.vat_rate),
      paid: false, invoiced: r.invoice_sent === true, direction: 'in' as const,
    })),
    ...(costRows ?? []).filter((c: Record<string, unknown>) => !c.paid && num(c.actual) > 0)
      .map((c: Record<string, unknown>) => ({
        id: String(c.id), month: monthOf.get(String(c.month_id)) ?? '',
        label: String(c.label), clientName: (c.note as string) ?? null,
        net: num(c.actual), vatRate: c.vat_applied ? num(c.vat_rate) : 0,
        paid: false, direction: 'out' as const,
      })),
  ].filter(l => l.month)

  // ── le scadenze future: rate firmate e costi a piano ──────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const streamById = new Map((streams ?? []).map((s: Record<string, unknown>) => [String(s.id), s]))
  const expected: Expected[] = [
    // quello che è già a conto economico e non è ancora passato dal conto
    ...openLines.map(l => ({
      date: l.month, label: l.label,
      amount: l.direction === 'in' ? Math.round(l.net * (1 + l.vatRate) * 100) / 100
        : -Math.round(l.net * (1 + l.vatRate) * 100) / 100,
      kind: (l.direction === 'in' ? 'credito' : 'debito') as 'credito' | 'debito',
      overdue: l.month < today, source: 'riga' as const,
    })),
    // le rate dei contratti che non hanno ancora una riga di mese
    ...(inst ?? []).filter((i: Record<string, unknown>) => {
      const s = streamById.get(String(i.stream_id))
      const stato = (s?.status as string) ?? ''
      return !i.paid && String(i.due_month).slice(0, 10) >= today && stato !== 'bozza' && stato !== 'sospeso'
    }).map((i: Record<string, unknown>) => {
      const s = streamById.get(String(i.stream_id))
      const vat = num(s?.vat_rate ?? 0.22)
      return {
        date: String(i.due_month).slice(0, 10),
        label: `${String(s?.label ?? 'Contratto')} — ${String(i.label ?? 'rata')}`,
        amount: Math.round(num(i.amount) * (1 + vat) * 100) / 100,
        kind: 'credito' as const, overdue: false, source: 'rata' as const,
      }
    }),
    // i costi ricorrenti del piano nei prossimi mesi
    ...(items ?? []).filter((i: Record<string, unknown>) => i.frequency === 'mensile')
      .flatMap((i: Record<string, unknown>) => {
        const out: Expected[] = []
        const base = new Date(today + 'T00:00:00')
        for (let k = 1; k <= 3; k++) {
          const d = new Date(base.getFullYear(), base.getMonth() + k, 1)
          out.push({
            date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
            label: String(i.label),
            amount: -Math.round(num(i.amount) * (i.vat_applied ? 1 + num(i.vat_rate) : 1) * 100) / 100,
            kind: 'debito', overdue: false, source: 'piano',
          })
        }
        return out
      }),
  ]

  // ── il conto economico per mese, dal motore ───────────────────────────────
  const config = rowToPlConfig(cfgRow as Record<string, unknown> | null)
  const partners: Partner[] = (partnerRows ?? []).map((p: Record<string, unknown>) => ({
    id: String(p.id), label: String(p.label),
    takes_delivery: p.takes_delivery !== false, takes_residual: p.takes_residual !== false,
  }))
  const projectValue = new Map<string, number>()
  for (const s of (streams ?? []) as Record<string, unknown>[]) {
    if (!s.project_id || s.status === 'bozza') continue
    projectValue.set(String(s.project_id), (projectValue.get(String(s.project_id)) ?? 0) + num(s.amount))
  }
  const ownerOfClient = new Map((clients ?? []).map((c: Record<string, unknown>) => [String(c.id), c]))

  const plByMonth = (plMonths ?? []).map((m: { id: string; month: string; status: string }) => {
    const revenue: RevenueLine[] = (revRows ?? []).filter((r: Record<string, unknown>) => r.month_id === m.id)
      .map((r: Record<string, unknown>) => ({
        id: String(r.id), label: String(r.label), client_id: (r.client_id as string) ?? null,
        plan_amount: num(r.plan_amount), invoices: num(r.invoices), amount_net: num(r.amount_net),
        vat_rate: num(r.vat_rate), invoice_sent: r.invoice_sent === true, paid: r.paid === true,
        kind: r.kind === 'digital' ? 'digital' : 'growth',
        sales_owner_id: (r.sales_owner_id as string) ?? null,
        sales_owner: (r.sales_owner as string) ?? null,
        client_sales_owner: (ownerOfClient.get(String(r.client_id))?.sales_owner_name as string) ?? null,
        project_id: (r.project_id as string) ?? null,
        project_value: projectValue.get(String(r.project_id ?? '')) ?? null,
        risk_fund: r.risk_fund === true, pass_through: r.pass_through === true,
      }))
    const costs: CostLine[] = (costRows ?? []).filter((c: Record<string, unknown>) => c.month_id === m.id)
      .map((c: Record<string, unknown>) => ({
        id: String(c.id), center_id: (c.center_id as string) ?? null,
        project_id: (c.project_id as string) ?? null,
        category: String(c.category), label: String(c.label),
        cost_type: c.cost_type === 'V' ? 'V' : 'F',
        budget: num(c.budget), actual: num(c.actual), paid: c.paid === true,
        vat_applied: c.vat_applied === true, vat_rate: num(c.vat_rate),
      }))
    const t = computeMonth(revenue, costs, config, partners)
    return {
      month: m.month, status: m.status,
      accrued: t.revenue.accrued, collected: t.revenue.collected, unpaid: t.revenue.unpaid,
      vat: t.revenue.vat, growth: t.revenue.growth, digital: t.revenue.digital,
      costs: t.costs.actual, structural: t.costs.structural, external: t.costs.external,
      margin: t.margin.gross, company: t.margin.company,
      distributed: t.plan.distributed, passThrough: t.plan.passThrough,
    }
  })

  return (
    <BankClient
      month={month}
      today={today}
      setupNeeded={false}
      account={account}
      txs={txs}
      openLines={openLines}
      expected={expected}
      months={(plMonths ?? []).map((m: { month: string }) => m.month)}
      plByMonth={plByMonth}
      clientNames={clientNames}
    />
  )
}
