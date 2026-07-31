import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlClient } from '@/components/pl/PlClient'
import { PlPeriod } from '@/components/pl/PlPeriod'
import {
  computeMonth, DEFAULT_PL_CONFIG, monthKey, shiftMonth,
  type PlConfig, type RevenueLine, type CostLine, type Partner,
} from '@/lib/pl'

export const revalidate = 0

export default async function EconomicsPage({ searchParams }: { searchParams: { m?: string; n?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const month = /^\d{4}-\d{2}-01$/.test(searchParams.m ?? '') ? searchParams.m! : monthKey(new Date())
  // n = quanti mesi guardare insieme. 1 (o assente) = il mese singolo editabile.
  const span = Math.min(24, Math.max(1, Number(searchParams.n) || 1))

  const [
    { data: monthRow, error: monthErr }, { data: cfg }, { data: partners },
    { data: profiles }, { data: months }, { data: activeClients },
  ] = await Promise.all([
    supabase.from('pl_months').select('*').eq('month', month).maybeSingle(),
    supabase.from('pl_config').select('*').eq('id', true).maybeSingle(),
    supabase.from('pl_partners').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('pl_months').select('month, status').order('month', { ascending: false }).limit(24),
    // fotografia di oggi: serve a segnalare lo scostamento fra anagrafica e mese
    supabase.from('clients')
      .select('id, company_name, display_name, mrr, client_type, client_label, is_internal')
      .order('company_name'),
  ])

  // 42P01 = tabella assente: la 163 non è stata eseguita. Va detto, non subito.
  const setupNeeded = monthErr?.code === '42P01'

  const [{ data: revenue }, { data: costs }] = monthRow
    ? await Promise.all([
        supabase.from('pl_revenue_lines').select('*').eq('month_id', monthRow.id).order('sort_order'),
        supabase.from('pl_cost_lines').select('*').eq('month_id', monthRow.id).order('sort_order'),
      ])
    : [{ data: [] }, { data: [] }]

  // mese precedente, per leggere ogni numero come variazione e non come valore isolato
  const prevKey = shiftMonth(month, -1)
  const { data: prevRow } = setupNeeded
    ? { data: null }
    : await supabase.from('pl_months').select('id').eq('month', prevKey).maybeSingle()
  const [{ data: prevRevenue }, { data: prevCosts }] = prevRow
    ? await Promise.all([
        supabase.from('pl_revenue_lines').select('amount_net, paid').eq('month_id', prevRow.id),
        supabase.from('pl_cost_lines').select('actual').eq('month_id', prevRow.id),
      ])
    : [{ data: [] }, { data: [] }]

  const num = (v: unknown) => Number(v ?? 0)
  const config: PlConfig = cfg
    ? {
        growth_sales_pct: num(cfg.growth_sales_pct),
        growth_delivery_pct: num(cfg.growth_delivery_pct),
        digital_sales_pct: num(cfg.digital_sales_pct),
        digital_delivery_pct: num(cfg.digital_delivery_pct),
        cost_target_pct: num(cfg.cost_target_pct),
        risk_fund_pct: num(cfg.risk_fund_pct),
        growth_residual_to_company: cfg.growth_residual_to_company ?? true,
        partner_share_pct: num(cfg.partner_share_pct),
        company_share_pct: num(cfg.company_share_pct),
      }
    : DEFAULT_PL_CONFIG

  const n = (v: unknown) => Number(v ?? 0)
  const prev = {
    accrued: (prevRevenue ?? []).reduce((s: number, r: { amount_net: unknown }) => s + n(r.amount_net), 0),
    costs: (prevCosts ?? []).reduce((s: number, c: { actual: unknown }) => s + n(c.actual), 0),
    exists: !!prevRow,
  }

  // clienti che oggi fatturerebbero ma non sono in questo mese
  const inMonth = new Set((revenue ?? []).map((r: { client_id: string | null }) => r.client_id).filter(Boolean))
  const missing = (activeClients ?? [])
    .filter(c => !c.is_internal && c.client_label !== 'perso' && Number(c.mrr) > 0 && !inMonth.has(c.id))
    .map(c => ({ id: c.id, name: c.display_name || c.company_name, mrr: Number(c.mrr) }))

  // ── vista di periodo: N mesi letti insieme, sola lettura ──────────────────
  if (span > 1 && !setupNeeded) {
    const wanted = Array.from({ length: span }, (_, i) => shiftMonth(month, -i)).reverse()
    const { data: rows } = await supabase.from('pl_months')
      .select('id, month, status').in('month', wanted).order('month')
    const ids = (rows ?? []).map((r: { id: string }) => r.id)

    const [{ data: allRev }, { data: allCost }, { data: clientNames }] = ids.length
      ? await Promise.all([
          supabase.from('pl_revenue_lines').select('*').in('month_id', ids),
          supabase.from('pl_cost_lines').select('*').in('month_id', ids),
          supabase.from('clients').select('id, company_name, display_name'),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }]

    const nameOf = new Map((clientNames ?? []).map((c: { id: string; company_name: string; display_name: string | null }) =>
      [c.id, c.display_name || c.company_name]))
    const asRev = (r: Record<string, unknown>): RevenueLine => ({
      id: String(r.id), label: String(r.label), client_id: (r.client_id as string) ?? null,
      plan_amount: num(r.plan_amount), invoices: num(r.invoices), amount_net: num(r.amount_net),
      vat_rate: num(r.vat_rate), invoice_sent: !!r.invoice_sent, paid: !!r.paid,
      kind: (r.kind === 'digital' ? 'digital' : 'growth'),
      sales_owner_id: (r.sales_owner_id as string) ?? null,
      sales_owner: (r.sales_owner as string) ?? null,
    })
    const asCost = (c: Record<string, unknown>): CostLine => ({
      id: String(c.id), category: String(c.category), label: String(c.label),
      cost_type: (c.cost_type === 'V' ? 'V' : 'F'),
      budget: num(c.budget), actual: num(c.actual), paid: !!c.paid,
      vat_applied: !!c.vat_applied, vat_rate: num(c.vat_rate),
    })

    const plPartners = (partners ?? []).map((p: Record<string, unknown>) => ({
      id: String(p.id), label: String(p.label),
      takes_delivery: !!p.takes_delivery, takes_residual: !!p.takes_residual,
    })) as Partner[]

    const byMonth = new Map((rows ?? []).map((r: { id: string; month: string }) => [r.id, r.month]))
    const perMonth = wanted.map(m => {
      const id = (rows ?? []).find((r: { month: string }) => r.month === m)?.id
      const rev = (allRev ?? []).filter((r: { month_id: string }) => r.month_id === id).map(asRev)
      const cst = (allCost ?? []).filter((c: { month_id: string }) => c.month_id === id).map(asCost)
      return { month: m, exists: !!id, t: computeMonth(rev, cst, config, plPartners) }
    })

    const revWithMonth = (allRev ?? []).map((r: Record<string, unknown>) => ({
      ...asRev(r),
      month: byMonth.get(String(r.month_id)) ?? '',
      client: r.client_id ? (nameOf.get(String(r.client_id)) ?? String(r.label)) : String(r.label),
    }))
    const costWithMonth = (allCost ?? []).map((c: Record<string, unknown>) => ({
      ...asCost(c), month: byMonth.get(String(c.month_id)) ?? '',
    }))

    return (
      <PlPeriod
        month={month} span={span} config={config}
        perMonth={perMonth}
        revenue={revWithMonth}
        costs={costWithMonth}
      />
    )
  }

  return (
    <PlClient
      month={month}
      status={(monthRow?.status ?? 'aperto') as 'aperto' | 'chiuso'}
      exists={!!monthRow}
      setupNeeded={setupNeeded}
      previous={prev}
      missingClients={missing}
      knownMonths={(months ?? []).map((m: { month: string; status: string }) => ({ month: m.month, status: m.status }))}
      config={config}
      partners={(partners ?? []).map((p: Record<string, unknown>) => ({
        id: String(p.id), label: String(p.label),
        takes_delivery: !!p.takes_delivery, takes_residual: !!p.takes_residual,
      })) as Partner[]}
      profiles={(profiles ?? []) as { id: string; full_name: string }[]}
      revenue={(revenue ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id), label: String(r.label), client_id: (r.client_id as string) ?? null,
        plan_amount: num(r.plan_amount), invoices: num(r.invoices), amount_net: num(r.amount_net),
        vat_rate: num(r.vat_rate), invoice_sent: !!r.invoice_sent, paid: !!r.paid,
        kind: (r.kind === 'digital' ? 'digital' : 'growth'),
        sales_owner_id: (r.sales_owner_id as string) ?? null,
        sales_owner: (r.sales_owner as string) ?? null,
      })) as RevenueLine[]}
      costs={(costs ?? []).map((c: Record<string, unknown>) => ({
        id: String(c.id), category: String(c.category), label: String(c.label),
        cost_type: (c.cost_type === 'V' ? 'V' : 'F'),
        budget: num(c.budget), actual: num(c.actual), paid: !!c.paid,
        vat_applied: !!c.vat_applied, vat_rate: num(c.vat_rate),
      })) as CostLine[]}
    />
  )
}
