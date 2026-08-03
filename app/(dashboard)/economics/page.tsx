import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlClient } from '@/components/pl/PlClient'
import { PlPeriod } from '@/components/pl/PlPeriod'
import {
  computeMonth, DEFAULT_PL_CONFIG, rowToPlConfig, monthKey, shiftMonth,
  type PlConfig, type RevenueLine, type CostLine, type Partner,
} from '@/lib/pl'
import type { MonthVat } from '@/lib/vat'
import { forecast } from '@/lib/forecast'

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

  /* Una sola ondata: tutto quello che non dipende da nient'altro parte
     insieme. `pl_months` si legge una volta sola e serve a cinque cose —
     il mese aperto, il precedente, l'elenco dei mesi noti, quelli dell'anno
     per l'IVA e quali sono già aperti nel previsionale. Prima erano quattro
     query separate sulla stessa tabella, in fila. */
  const year = month.slice(0, 4)
  const prevKey = shiftMonth(month, -1)

  const [
    { data: allMonths, error: monthErr }, { data: cfg }, { data: partners },
    { data: profiles }, { data: activeClients }, { data: centers },
    { data: fcStreams }, { data: fcItems }, { data: allProjects },
  ] = await Promise.all([
    supabase.from('pl_months').select('*').order('month', { ascending: false }),
    supabase.from('pl_config').select('*').eq('id', true).maybeSingle(),
    supabase.from('pl_partners').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    // fotografia di oggi: serve a segnalare lo scostamento fra anagrafica e mese
    supabase.from('clients')
      // §185: sales_owner_* serve a mostrare il commerciale dell'anagrafica sulle
      // righe che non ne portano uno, e a sapere se il 6% ha un destinatario
      .select('id, company_name, display_name, mrr, client_type, client_label, is_internal, sales_owner_id, sales_owner_name')
      .order('company_name'),
    // §171: aree di spesa. Se la migration non c'è la tendina resta vuota
    supabase.from('cost_centers').select('id, name').eq('is_active', true).order('sort_order'),
    // §176: il previsionale nasce da quello che è già firmato
    supabase.from('revenue_streams').select('*'),
    supabase.from('cost_items').select('*').eq('is_active', true),
    supabase.from('projects').select('id, name').is('deleted_at', null),
  ])

  type MonthRow = { id: string; month: string; status: string }
  const monthsAll = (allMonths ?? []) as unknown as MonthRow[]
  const monthRow = monthsAll.find(m => m.month === month) ?? null
  const prevRow = monthsAll.find(m => m.month === prevKey) ?? null
  const months = monthsAll.slice(0, 24)
  const yearIds = monthsAll.filter(m => m.month.startsWith(year)).map(m => m.id)

  // Seconda ondata: tutto ciò che ha bisogno degli id appena trovati.
  const streamIds = (fcStreams ?? []).map((x: { id: string }) => x.id)
  const [
    { data: revenue }, { data: costs },
    { data: prevRevenue }, { data: prevCosts },
    { data: yRev }, { data: yCost }, { data: fcInst },
  ] = await Promise.all([
    monthRow ? supabase.from('pl_revenue_lines').select('*').eq('month_id', monthRow.id).order('sort_order')
      : Promise.resolve({ data: [] }),
    monthRow ? supabase.from('pl_cost_lines').select('*').eq('month_id', monthRow.id).order('sort_order')
      : Promise.resolve({ data: [] }),
    prevRow ? supabase.from('pl_revenue_lines').select('amount_net, paid').eq('month_id', prevRow.id)
      : Promise.resolve({ data: [] }),
    prevRow ? supabase.from('pl_cost_lines').select('actual').eq('month_id', prevRow.id)
      : Promise.resolve({ data: [] }),
    yearIds.length ? supabase.from('pl_revenue_lines').select('month_id, amount_net, vat_rate').in('month_id', yearIds)
      : Promise.resolve({ data: [] }),
    yearIds.length ? supabase.from('pl_cost_lines').select('month_id, actual, vat_applied, vat_rate').in('month_id', yearIds)
      : Promise.resolve({ data: [] }),
    streamIds.length ? supabase.from('revenue_installments').select('*').in('stream_id', streamIds)
      : Promise.resolve({ data: [] }),
  ])

  // §174: l'IVA si legge su tutto l'anno perché il credito di un trimestre si
  // riporta su quello dopo: senza i precedenti il numero da versare è sbagliato.
  const vatMonths: MonthVat[] = monthsAll
    .filter(m => m.month.startsWith(year))
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({
      month: m.month,
      debit: (yRev ?? [])
        .filter((r: { month_id: string }) => r.month_id === m.id)
        .reduce((s: number, r: { amount_net: unknown; vat_rate: unknown }) => s + Number(r.amount_net ?? 0) * Number(r.vat_rate ?? 0), 0),
      // l'IVA sugli acquisti si scomputa solo dove è stata davvero pagata
      credit: (yCost ?? [])
        .filter((c: { month_id: string; vat_applied: boolean }) => c.month_id === m.id && c.vat_applied)
        .reduce((s: number, c: { actual: unknown; vat_rate: unknown }) => s + Number(c.actual ?? 0) * Number(c.vat_rate ?? 0), 0),
    }))

  // 42P01 = tabella assente: la 163 non è stata eseguita. Va detto, non subito.
  const setupNeeded = monthErr?.code === '42P01'

  const num = (v: unknown) => Number(v ?? 0)
  const config: PlConfig = rowToPlConfig(cfg as Record<string, unknown> | null)

  const n = (v: unknown) => Number(v ?? 0)
  const prev = {
    accrued: (prevRevenue ?? []).reduce((s: number, r: { amount_net: unknown }) => s + n(r.amount_net), 0),
    costs: (prevCosts ?? []).reduce((s: number, c: { actual: unknown }) => s + n(c.actual), 0),
    exists: !!prevRow,
  }

  // nomi dei progetti a cui le righe sono agganciate: la tabella li mostra
  const projectNames = Object.fromEntries(
    (allProjects ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))

  // la riga di contratto si chiama col servizio: senza questo il cliente sparirebbe
  /* §185 — il commerciale che ciascun cliente ha in anagrafica. Le righe del mese
     ne portano una copia (la fotografia di quando sono nate); questa mappa serve
     a chi non l'ha, così il nome si legge invece di un trattino. */
  const clientOwner = new Map((activeClients ?? []).map((c: Record<string, unknown>) =>
    [String(c.id), {
      id: (c.sales_owner_id as string) ?? null,
      name: (c.sales_owner_name as string) ?? null,
    }]))

  const clientNames = Object.fromEntries((activeClients ?? [])
    .map((c: { id: string; company_name: string; display_name: string | null }) =>
      [c.id, c.display_name || c.company_name]))

  // clienti che oggi fatturerebbero ma non sono in questo mese
  const inMonth = new Set((revenue ?? []).map((r: { client_id: string | null }) => r.client_id).filter(Boolean))
  const missing = (activeClients ?? [])
    .filter(c => !c.is_internal && c.client_label !== 'perso' && c.client_label !== 'pending'
      && Number(c.mrr) > 0 && !inMonth.has(c.id))
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
          supabase.from('clients').select('id, company_name, display_name, sales_owner_id, sales_owner_name'),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }]

    const nameOf = new Map((clientNames ?? []).map((c: { id: string; company_name: string; display_name: string | null }) =>
      [c.id, c.display_name || c.company_name]))
    const ownerOf = new Map((clientNames ?? []).map((c: Record<string, unknown>) =>
      [String(c.id), {
        id: (c.sales_owner_id as string) ?? null,
        name: (c.sales_owner_name as string) ?? null,
      }]))
    const asRev = (r: Record<string, unknown>): RevenueLine => ({
      id: String(r.id), label: String(r.label), client_id: (r.client_id as string) ?? null,
      plan_amount: num(r.plan_amount), invoices: num(r.invoices), amount_net: num(r.amount_net),
      vat_rate: num(r.vat_rate), invoice_sent: !!r.invoice_sent, paid: !!r.paid,
      kind: (r.kind === 'digital' ? 'digital' : 'growth'),
      sales_owner_id: (r.sales_owner_id as string) ?? null,
      sales_owner: (r.sales_owner as string) ?? null,
      client_sales_owner_id: ownerOf.get(String(r.client_id ?? ''))?.id ?? null,
      client_sales_owner: ownerOf.get(String(r.client_id ?? ''))?.name ?? null,
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
        client_sales_owner_id: clientOwner.get(String(r.client_id ?? ''))?.id ?? null,
        client_sales_owner: clientOwner.get(String(r.client_id ?? ''))?.name ?? null,
        origin: (r.origin as 'contratto' | 'anagrafica' | 'manuale') ?? 'manuale',
        project_id: (r.project_id as string) ?? null,
        stream_id: (r.stream_id as string) ?? null,
      })) as RevenueLine[]}
      projectNames={projectNames}
      clientNames={clientNames}
      forecast={forecast(month, 6,
        (fcStreams ?? []) as never, (fcInst ?? []) as never, (fcItems ?? []) as never,
        new Set(monthsAll.map(m => m.month)))}
      vatMonths={vatMonths}
      today={new Date().toISOString().slice(0, 10)}
      centers={(centers ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))}
      costs={(costs ?? []).map((c: Record<string, unknown>) => ({
        id: String(c.id), center_id: (c.center_id as string) ?? null,
        category: String(c.category), label: String(c.label),
        cost_type: (c.cost_type === 'V' ? 'V' : 'F'),
        budget: num(c.budget), actual: num(c.actual), paid: !!c.paid,
        vat_applied: !!c.vat_applied, vat_rate: num(c.vat_rate),
      })) as CostLine[]}
    />
  )
}
