import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BankClient } from '@/components/bank/BankClient'
import { monthKey, shiftMonth } from '@/lib/pl'
import { rowToPlConfig, computeMonth, type RevenueLine, type CostLine, type Partner } from '@/lib/pl'
import type { BankAccount, BankTx, PlLineRef, Expected } from '@/lib/bank'
import { dueOf, collectionIndex } from '@/lib/cash-calendar'
import { rowContext, toRevenueLines, toCostLines } from '@/lib/pl-rows'
import { buildWindow, takenIn, marginCostsFor } from '@/lib/payout-window'
import { payoutLedger, payoutsFromBank, mergePeople } from '@/lib/cash-certify'

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
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const profile = await getSessionProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const month = /^\d{4}-\d{2}-01$/.test(searchParams.m ?? '') ? searchParams.m! : monthKey(new Date())

  const { data: accountRows, error: setupErr } = await supabase.from('bank_accounts')
    .select('*').eq('is_active', true).order('is_primary', { ascending: false })

  const setupNeeded = setupErr?.code === '42P01' || setupErr?.code === 'PGRST205'
  const first = (accountRows ?? [])[0] as BankAccount | undefined

  if (setupNeeded || !first) {
    return <BankClient month={month} setupNeeded accounts={[]} txs={[]} openLines={[]}
      expected={[]} months={[]} plByMonth={[]} clientNames={{}} spendItems={{}}
      today={new Date().toISOString().slice(0, 10)} />
  }

  const num = (v: unknown) => Number(v ?? 0)
  const r2 = (n: number) => Math.round(n * 100) / 100

  const [{ data: txRows }, { data: plMonths }, { data: cfgRow }, { data: partnerRows }, { data: clients }] =
    await Promise.all([
      // tutti i conti insieme: la liquidità è la somma, e i giroconti vanno visti da entrambi i lati
      supabase.from('bank_transactions').select('*')
        .order('booked_on', { ascending: false }).limit(4000),
      supabase.from('pl_months').select('id, month, status').order('month'),
      supabase.from('pl_config').select('*').eq('id', true).maybeSingle(),
      supabase.from('pl_partners').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('clients').select('id, company_name, display_name'),
    ])

  /* §190 — quali aree paga ciascun conto, e quali voci di piano ci cadono: è il
     fabbisogno del bonifico ricorrente, e restringe i candidati della
     riconciliazione a quel conto. */
  const { data: coverRows } = await supabase.from('bank_account_centers').select('account_id, center_id')
  const { data: centerRows } = await supabase.from('cost_centers').select('id, name')
  const { data: itemRows } = await supabase.from('cost_items')
    .select('label, amount, frequency, center_id, project_id, is_active')
    .eq('is_active', true).is('project_id', null)

  const centerName = new Map((centerRows ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))
  const coverage = new Map<string, string[]>()
  for (const r of (coverRows ?? []) as { account_id: string; center_id: string }[]) {
    coverage.set(r.account_id, [...(coverage.get(r.account_id) ?? []), r.center_id])
  }
  const spendItems: Record<string, { label: string; amount: number; center_id: string | null; centerName: string | null }[]> =
    Object.fromEntries((accountRows ?? []).map((a: Record<string, unknown>) => {
      const centers = coverage.get(String(a.id)) ?? []
      const own = (itemRows ?? []).filter((i: Record<string, unknown>) =>
        i.center_id && centers.includes(String(i.center_id)) && i.frequency === 'mensile')
      return [String(a.id), own.map((i: Record<string, unknown>) => ({
        label: String(i.label), amount: num(i.amount),
        center_id: (i.center_id as string) ?? null,
        centerName: centerName.get(String(i.center_id)) ?? null,
      }))]
    }))

  const monthIds = (plMonths ?? []).map((m: { id: string }) => m.id)
  const [{ data: revRows }, { data: costRows }, { data: streams }, { data: inst }, { data: items },
    { data: allocRows }, { data: streamProjects }] =
    monthIds.length
      ? await Promise.all([
          supabase.from('pl_revenue_lines').select('*').in('month_id', monthIds),
          supabase.from('pl_cost_lines').select('*').in('month_id', monthIds),
          supabase.from('revenue_streams').select('*'),
          supabase.from('revenue_installments').select('*'),
          supabase.from('cost_items').select('*').eq('is_active', true),
          // §258 — le quote: un bonifico cumulativo dimostra più di una riga
          supabase.from('bank_tx_lines').select('tx_id, revenue_line_id, cost_line_id'),
          /* §207 — quali progetti copre un accordo. Senza, il margine digital di
             un contratto multi-progetto non toglie i subappalti degli altri
             lavori, e il ponte confermerebbe un numero che la pagina non ha. */
          supabase.from('revenue_stream_projects').select('stream_id, project_id'),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }]

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
    transfer_pair_id: (t.transfer_pair_id as string) ?? null,
    transfer_account_id: (t.transfer_account_id as string) ?? null,
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
  /* §224 — quando una riga aperta è attesa in banca lo dice `dueOf`, non il
     primo del suo mese: lo stipendio di luglio esce il 20 agosto e il subappalto
     quando ha pagato il cliente. Datarle tutte al primo del mese ammassava sul
     giorno 1 quello che nella realtà è distribuito, e la curva scendeva sotto
     zero in un giorno in cui non ci scende. */
  const dueIndex = collectionIndex((revRows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id), side: 'entrata' as const,
    month: monthOf.get(String(r.month_id)) ?? today,
    amount: num(r.amount_net), paid: r.paid === true,
    paid_on: (r.paid_on as string) ?? null,
    due_date: (r.due_date as string) ?? null, terms: (r.terms as string) ?? null,
    project_id: (r.project_id as string) ?? null,
  })))
  const dueOfLine = (l: PlLineRef, row: Record<string, unknown>): string => dueOf({
    id: l.id, side: l.direction === 'in' ? 'entrata' : 'uscita', month: l.month,
    amount: l.net, paid: false,
    due_date: (row.due_date as string) ?? null, terms: (row.terms as string) ?? null,
    category: (row.category as string) ?? null,
    project_id: (row.project_id as string) ?? null,
  }, { collection: dueIndex })
  const rowById = new Map<string, Record<string, unknown>>([
    ...(revRows ?? []).map((r: Record<string, unknown>) => [String(r.id), r] as const),
    ...(costRows ?? []).map((c: Record<string, unknown>) => [String(c.id), c] as const),
  ])

  const expected: Expected[] = [
    // quello che è già a conto economico e non è ancora passato dal conto
    ...openLines.map(l => ({
      date: dueOfLine(l, rowById.get(l.id) ?? {}), label: l.label,
      amount: l.direction === 'in' ? Math.round(l.net * (1 + l.vatRate) * 100) / 100
        : -Math.round(l.net * (1 + l.vatRate) * 100) / 100,
      kind: (l.direction === 'in' ? 'credito' : 'debito') as 'credito' | 'debito',
      overdue: dueOfLine(l, rowById.get(l.id) ?? {}) < today, source: 'riga' as const,
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
  /* §287 — il contesto delle righe si costruisce una volta: chi è il
     commerciale del cliente, quali progetti copre un accordo, quanto vale il
     lavoro venduto. Erano tre mappe riscritte in ogni pagina, e ogni copia ne
     dimenticava una. */
  const rowCtx = rowContext({
    month,
    months: (plMonths ?? []) as unknown as { id: unknown; month: unknown }[],
    clients: (clients ?? []) as Record<string, unknown>[],
    streams: (streams ?? []) as Record<string, unknown>[],
    streamProjects: (streamProjects ?? []) as { stream_id: string; project_id: string }[],
  })

  /* §286 — quanto è **erogabile adesso** verso soci e commerciali. La posta del
     ponte resta il dovuto (l'identità la vuole così, §199); questo è l'altro
     tempo della stessa cifra, e senza starebbero due numeri con lo stesso nome
     in due sezioni. La regola la possiede `payoutLedger` — conosce il
     consolidato (§230) e chi non ha mai preso un euro (§228) — e qui si legge. */
  const allRevAll = toRevenueLines(revRows as Record<string, unknown>[], rowCtx)
  const allCostAll = toCostLines(costRows as Record<string, unknown>[], rowCtx)
  const people = mergePeople(
    partners.map(p => ({ id: p.id, label: p.label })),
    Array.from(new Set(((clients ?? []) as Record<string, unknown>[])
      .map(c => String(c.sales_owner_name ?? '')).filter(Boolean))))
  const payoutDateOfMonth = (mk: string) => {
    const row = (plMonths ?? []).find((x: { month: string }) => x.month.slice(0, 10) === mk)
    const d = (row as unknown as { payout_date?: string | null } | undefined)?.payout_date
    return d ? String(d).slice(0, 10) : null
  }
  const accruals: { key: string; month: string; amount: number }[] = []
  for (const mrow of (plMonths ?? []) as { month: string }[]) {
    const mk = mrow.month.slice(0, 10)
    const w = buildWindow({
      month: mk, date: payoutDateOfMonth(mk),
      previousDate: payoutDateOfMonth(shiftMonth(mk, -1)),
      day: config.payout_day, settledFrom: config.settled_from,
    })
    const presi = takenIn(allRevAll, w)
    const mesi = new Set(presi.map(l => l.month))
    const mc = marginCostsFor(allCostAll, mesi, mk)
    const tw = computeMonth(presi, mc, config, partners, mc,
      allRevAll.filter(l => mesi.has(l.month)))
    for (const pp of tw.perPartner) {
      const k = people.find(x => x.partnerId === pp.partner.id)?.key
      if (k) accruals.push({ key: k, month: mk, amount: pp.total })
    }
    for (const o of tw.salesByOwner) {
      const k = people.find(x => x.label === o.label)?.key
      if (k) accruals.push({ key: k, month: mk, amount: o.amount })
    }
  }
  const payableNow = Math.round(payoutLedger({
    people: people.map(p => ({ key: p.key, label: p.label })),
    accruals,
    facts: payoutsFromBank((txRows ?? []).map((t: Record<string, unknown>) => ({
      id: String(t.id), booked_on: String(t.booked_on).slice(0, 10), amount: num(t.amount),
      source: String(t.source), kind: String(t.kind ?? 'altro'),
      counterparty: (t.counterparty as string) ?? null,
      description: String(t.description ?? ''),
      revenue_line_id: (t.revenue_line_id as string) ?? null,
      cost_line_id: (t.cost_line_id as string) ?? null,
    })), people),
    from: config.settled_from,
  }).reduce((n, p) => n + Math.max(0, p.open), 0) * 100) / 100

  const plByMonth = (plMonths ?? []).map((m: { id: string; month: string; status: string }) => {
    /* §287 — le righe del motore da un posto solo: qui mancava
       `installment_id`, quindi il ponte leggeva un margine digital diverso da
       quello della pagina che deve verificare. */
    const revenue = toRevenueLines(
      (revRows ?? []).filter((r: Record<string, unknown>) => r.month_id === m.id), rowCtx)
    const costs = toCostLines(
      (costRows ?? []).filter((c: Record<string, unknown>) => c.month_id === m.id), rowCtx)
    const t = computeMonth(revenue, costs, config, partners)
    return {
      month: m.month, status: m.status,
      accrued: t.revenue.accrued, collected: t.revenue.collected, unpaid: t.revenue.unpaid,
      vat: t.revenue.vat, growth: t.revenue.growth, digital: t.revenue.digital,
      costs: t.costs.actual, structural: t.costs.structural, external: t.costs.external,
      margin: t.margin.gross, company: t.margin.company,
      distributed: t.plan.distributed, passThrough: t.plan.passThrough,
      /* §199 — servono al ponte fra conto economico e saldo: l'IVA uscita coi
         costi pagati e quanto dei costi è davvero uscito dal conto. */
      costsPaid: t.costs.paid,
      costsVatPaid: r2(costs.filter(c => c.paid && c.vat_applied)
        .reduce((n, c) => n + c.actual * c.vat_rate, 0)),
    }
  })

  const accounts: BankAccount[] = (accountRows ?? []).map((a: Record<string, unknown>) => ({
    id: String(a.id), label: String(a.label), bank_name: (a.bank_name as string) ?? null,
    currency: String(a.currency ?? 'EUR'), opening_balance: num(a.opening_balance),
    opening_date: String(a.opening_date).slice(0, 10), is_primary: a.is_primary === true,
    purpose: (a.purpose as string) ?? null,
    funding_from_id: (a.funding_from_id as string) ?? null,
    funding_day: a.funding_day == null ? null : Number(a.funding_day),
    funding_amount: a.funding_amount == null ? null : num(a.funding_amount),
    // §191 — sottoconti dei soci: il padre li mostra insieme, la quota è erogato
    parent_id: (a.parent_id as string) ?? null,
    owner_partner_id: (a.owner_partner_id as string) ?? null,
    owner_label: (a.owner_label as string) ?? null,
    allowance_amount: a.allowance_amount == null ? null : num(a.allowance_amount),
    centerIds: coverage.get(String(a.id)) ?? [],
  }))

  return (
    <BankClient
      month={month}
      today={today}
      setupNeeded={false}
      accounts={accounts}
      spendItems={spendItems}
      txs={txs}
      openLines={openLines}
      /* §284 — le spunte che nessun movimento **di banca** dimostra: sono soldi
         che si sono mossi davvero (l'ha visto una persona sull'home banking) e
         che l'estratto conto non ha ancora registrato. Si contano dalle
         **righe**, non dai movimenti `derivato`: quelli restano anche quando il
         fatto è arrivato ma nessuno l'ha riconciliato, e sui dati veri i due
         modi divergevano di 24.044 €. */
      unproven={(() => {
        const banca = new Set(txs.filter(t => t.source === 'banca').map(t => t.id))
        const provata = new Set<string>()
        for (const t of txs) {
          if (t.source !== 'banca') continue
          const id = t.revenue_line_id ?? t.cost_line_id
          if (id) provata.add(String(id))
        }
        for (const a of (allocRows ?? []) as Record<string, unknown>[]) {
          if (!banca.has(String(a.tx_id))) continue
          const id = a.revenue_line_id ?? a.cost_line_id
          if (id) provata.add(String(id))
        }
        const inn = (revRows ?? []).filter((r: Record<string, unknown>) =>
          r.paid === true && !provata.has(String(r.id)))
        const out = (costRows ?? []).filter((c: Record<string, unknown>) =>
          c.paid === true && !provata.has(String(c.id)) && (num(c.actual) > 0 || num(c.budget) > 0))
        const r2n = (x: number) => Math.round(x * 100) / 100
        return {
          inflow: r2n(inn.reduce((s2: number, r: Record<string, unknown>) =>
            s2 + num(r.amount_net) * (1 + num(r.vat_rate)), 0)),
          outflow: r2n(out.reduce((s2: number, c: Record<string, unknown>) =>
            s2 + (num(c.actual) > 0 ? num(c.actual) : num(c.budget))
              * (c.vat_applied ? 1 + num(c.vat_rate) : 1), 0)),
          count: inn.length + out.length,
        }
      })()}
      /* §255 — le aree di costo: servono a dire **dove** finisce una voce creata
         da un movimento. Senza la scelta finivano tutte in «Spese fuori piano»,
         e una lettura per area con dentro trentaquattro commissioni non la apre
         più nessuno. */
      centers={(centerRows ?? []).map((c: { id: string; name: string }) => c.name)}
      expected={expected}
      months={(plMonths ?? []).map((m: { month: string }) => m.month)}
      plByMonth={plByMonth}
      payableNow={payableNow}
      clientNames={clientNames}
    />
  )
}
