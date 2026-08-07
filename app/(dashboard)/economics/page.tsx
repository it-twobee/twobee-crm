import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PlClient } from '@/components/pl/PlClient'
import { PlPeriod } from '@/components/pl/PlPeriod'
import {
  computeMonth, DEFAULT_PL_CONFIG, rowToPlConfig, monthKey, shiftMonth,
  type PlConfig, type RevenueLine, type CostLine, type Partner,
} from '@/lib/pl'
import type { MonthVat } from '@/lib/vat'
import { forecast } from '@/lib/forecast'
import {
  contractDrift, coveredProjects, type Coverage, type RevenueStream,
} from '@/lib/revenue'

export const revalidate = 0

export default async function EconomicsPage({ searchParams }: { searchParams: { m?: string; n?: string } }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const profile = await getSessionProfile()
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
    { data: fcStreams }, { data: fcItems }, { data: allProjects }, { data: streamProjects },
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
    supabase.from('projects').select('id, name, client_id').is('deleted_at', null),
    // §188: quali progetti copre un accordo. Se la 188 non c'è, resta vuoto e
    // vale `revenue_streams.project_id`, cioè come funzionava prima.
    supabase.from('revenue_stream_projects').select('stream_id, project_id'),
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
  /* §186 — valore venduto di ciascun progetto: la somma dei suoi contratti non in
     bozza. Decide se l'opzione del fondo rischio digital è disponibile, e si
     guarda il progetto e non la rata — un lavoro da 24.000 € pagato in sei rate
     da 4.000 resta un lavoro da 24.000. */
  const projectValue = new Map<string, number>()
  for (const st of (fcStreams ?? []) as { project_id: string | null; amount: unknown; status: string }[]) {
    if (!st.project_id || st.status === 'bozza') continue
    projectValue.set(st.project_id, num(projectValue.get(st.project_id)) + num(st.amount))
  }
  /* §207 — quanto vale il lavoro che una riga paga. Con un accordo su più
     progetti la soglia del fondo rischio guarda l'insieme: è quello che è stato
     venduto, e prenderne uno dei tre lo farebbe sembrare un lavoro piccolo. */
  const soldValue = (ids: string[], fallback: string | null): number | null => {
    const from = ids.length ? ids : fallback ? [fallback] : []
    if (!from.length) return null
    const total = from.reduce((s, p) => s + (projectValue.get(p) ?? 0), 0)
    return total > 0 ? total : null
  }

  /* §188 — i progetti coperti da ciascun accordo. La riga del mese ne porta uno
     solo quando ce n'è uno solo; con tre non ne porta nessuno, ma il margine
     digital deve togliere i subappalti di tutti e tre. */
  const coverage: Coverage = new Map()
  for (const r of (streamProjects ?? []) as { stream_id: string; project_id: string }[]) {
    coverage.set(r.stream_id, [...(coverage.get(r.stream_id) ?? []), r.project_id])
  }
  const streamById = new Map((fcStreams ?? []).map((s: Record<string, unknown>) => [String(s.id), s]))
  const projectsOfStream = (id: string | null): string[] => {
    const s = id ? streamById.get(id) : null
    return s ? coveredProjects(s as unknown as RevenueStream, coverage) : []
  }

  const projectNames = Object.fromEntries(
    (allProjects ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
  /* §192 — di chi è un progetto. Il subappalto sta sul progetto, ma il margine
     che erode è quello di un cliente: senza questa mappa nel conto economico si
     legge il nome del lavoro e non si sa a chi appartiene. */
  const clientOfProject = Object.fromEntries(
    (allProjects ?? []).filter((p: { client_id: string | null }) => !!p.client_id)
      .map((p: { id: string; client_id: string }) => [p.id, p.client_id]))
  // le sorgenti dei subappalti: la voce di piano che sta sul progetto
  const subItems = (fcItems ?? [])
    .filter((i: Record<string, unknown>) => !!i.project_id)
    .map((i: Record<string, unknown>) => ({
      id: String(i.id), label: String(i.label),
      supplier: (i.supplier as string) ?? null,
      amount: num(i.amount), frequency: String(i.frequency),
      is_active: i.is_active !== false,
      project_id: (i.project_id as string) ?? null,
      start_month: (i.start_month as string) ?? null,
      end_month: (i.end_month as string) ?? null,
    }))

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

  /* §207 — le righe che non dicono più quello che dice il loro contratto. Sono
     le righe preparate prima di una correzione: il tipo di lavoro decide il 15%
     o il 6% di provvigione, e una riga rimasta indietro paga la percentuale di
     un altro mestiere senza che niente lo segnali. Un mese chiuso non si
     confronta: è una fotografia. */
  const drift = (monthRow?.status ?? 'aperto') === 'aperto'
    ? contractDrift(
        (revenue ?? []).map((r: Record<string, unknown>) => ({
          id: String(r.id), label: String(r.label),
          stream_id: (r.stream_id as string) ?? null,
          kind: (r.kind === 'digital' ? 'digital' : 'growth') as 'growth' | 'digital',
          project_id: (r.project_id as string) ?? null,
          vat_rate: num(r.vat_rate), pass_through: r.pass_through === true,
        })),
        (fcStreams ?? []) as unknown as RevenueStream[],
        coverage,
      )
    : []

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
      /* §207 — la vista di periodo chiama lo **stesso** motore del mese singolo,
         e senza questi campi lo chiamava con righe mutilate: i subappalti non
         uscivano dal margine, le partite di giro entravano nelle quote e la
         scelta sul fondo rischio spariva. Stesse righe, due risposte diverse a
         seconda di quanti mesi si guardano — e quella sbagliata era sempre la
         più generosa. */
      origin: (r.origin as 'contratto' | 'anagrafica' | 'manuale') ?? 'manuale',
      stream_id: (r.stream_id as string) ?? null,
      project_id: (r.project_id as string) ?? null,
      project_ids: projectsOfStream((r.stream_id as string) ?? null),
      project_value: soldValue(projectsOfStream((r.stream_id as string) ?? null), r.project_id as string | null),
      risk_fund: r.risk_fund === true,
      pass_through: r.pass_through === true,
    })
    const asCost = (c: Record<string, unknown>): CostLine => ({
      id: String(c.id), category: String(c.category), label: String(c.label),
      cost_item_id: (c.cost_item_id as string) ?? null,
      project_id: (c.project_id as string) ?? null,
      // §191: spesa di un socio col suo sottoconto — erogato, non struttura
      partner_id: (c.partner_id as string) ?? null,
      deductible_pct: c.deductible_pct == null ? 1 : num(c.deductible_pct),
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
        // §207: i progetti dell'accordo, non solo quello scritto sulla riga
        project_ids: projectsOfStream((r.stream_id as string) ?? null),
        stream_id: (r.stream_id as string) ?? null,
        // §186: il valore venduto del progetto decide se l'opzione fondo rischio c'è
        project_value: soldValue(projectsOfStream((r.stream_id as string) ?? null), r.project_id as string | null),
        risk_fund: r.risk_fund === true,
        pass_through: r.pass_through === true,
      })) as RevenueLine[]}
      projectNames={projectNames}
      clientNames={clientNames}
      clientOfProject={clientOfProject}
      drift={drift}
      subItems={subItems}
      forecast={forecast(month, 6,
        (fcStreams ?? []) as never, (fcInst ?? []) as never, (fcItems ?? []) as never,
        new Set(monthsAll.map(m => m.month)))}
      vatMonths={vatMonths}
      today={new Date().toISOString().slice(0, 10)}
      centers={(centers ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))}
      costs={(costs ?? []).map((c: Record<string, unknown>) => ({
        id: String(c.id), center_id: (c.center_id as string) ?? null,
        // se c'è la voce di piano, il preventivato lo scrive il piano e non questa pagina
        cost_item_id: (c.cost_item_id as string) ?? null,
        // §186: il subappalto esce dal margine digital prima della spartizione
        project_id: (c.project_id as string) ?? null,
        partner_id: (c.partner_id as string) ?? null,
        deductible_pct: c.deductible_pct == null ? 1 : num(c.deductible_pct),
        category: String(c.category), label: String(c.label),
        cost_type: (c.cost_type === 'V' ? 'V' : 'F'),
        budget: num(c.budget), actual: num(c.actual), paid: !!c.paid,
        vat_applied: !!c.vat_applied, vat_rate: num(c.vat_rate),
      })) as CostLine[]}
    />
  )
}
