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
import { endOfMonth, dueOf, fromRevenue, fromCost, collectionIndex } from '@/lib/cash-calendar'
import { cashRunway, type RunwayLine } from '@/lib/cash-runway'
import { vatByQuarter, nextDue, vatPending, type VatActual } from '@/lib/vat'
import { isPayrollCenter } from '@/lib/costs'
import { eur2 } from '@/lib/money'
import { usedByTx } from '@/lib/tx-links'
import { buildWindow, takenIn, marginCostsFor } from '@/lib/payout-window'
import { rowContext, toRevenueLine, toCostLine } from '@/lib/pl-rows'

const monthOfIso = (iso: string) => `${iso.slice(0, 7)}-01`
import {
  certify, payoutsFromBank, payoutLedger, mergePeople,
  type CertLine, type CertTx,
} from '@/lib/cash-certify'
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
    { data: bankAccounts, error: bankErr }, { data: bankTx }, { data: payoutRows },
    { data: payoutAllocRows },
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
    /* §225 — il saldo **reale**: le aperture dei conti più i soli movimenti
       arrivati dall'estratto conto. I `derivato` nascono da una spunta e non
       sono passati da nessuna banca: contarli qui farebbe dire alla tenuta di
       cassa che i soldi ci sono grazie a quello che deve verificare. */
    supabase.from('bank_accounts').select('id, label, opening_balance').eq('is_active', true),
    /* §226 — i movimenti servono a due cose: il saldo, e a **certificare** le
       spunte. Una riga «pagata» che nessun movimento conferma non è uguale a una
       che l'estratto conto dimostra, e finché si leggevano identiche il conto
       economico era pieno di opinioni con l'aria di fatti. */
    supabase.from('bank_transactions')
      .select('id, account_id, booked_on, amount, source, kind, counterparty, description, revenue_line_id, cost_line_id'),
    /* §243 — i compensi come righe spuntabili. Senza la 207 la query fallisce e
       la sezione mostra il piano come prima, senza spunte. */
    supabase.from('pl_payouts').select('*'),
    /* §305 — quanto di ogni movimento è compenso, secondo il registro (§297).
       Senza la 214 la query fallisce e si torna alla categoria del movimento. */
    supabase.from('payment_allocations').select('tx_id, payout_id, amount').not('payout_id', 'is', null),
  ])

  /* §305 — le allocazioni sui compensi, per movimento: è quello che il registro
     sa e la categoria del movimento no. Senza la 214 resta vuota e si torna al
     comportamento di prima. */
  const payoutAlloc = new Map<string, { who: string; amount: number }[]>()
  {
    const labelOf = new Map(((payoutRows ?? []) as Record<string, unknown>[])
      .map(r => [String(r.id), String(r.person_label ?? '')]))
    for (const a of (payoutAllocRows ?? []) as { tx_id: string; payout_id: string; amount: number }[]) {
      const who = labelOf.get(String(a.payout_id))
      if (!who) continue
      const k = String(a.tx_id)
      payoutAlloc.set(k, [...(payoutAlloc.get(k) ?? []), { who, amount: Number(a.amount ?? 0) }])
    }
  }

  type MonthRow = { id: string; month: string; status: string }
  const monthsAll = (allMonths ?? []) as unknown as MonthRow[]
  const monthRow = monthsAll.find(m => m.month === month) ?? null
  const prevRow = monthsAll.find(m => m.month === prevKey) ?? null
  const months = monthsAll.slice(0, 24)
  const yearIds = monthsAll.filter(m => m.month.startsWith(year)).map(m => m.id)

  /* §224 — la cassa di un mese non è fatta solo dalle righe di quel mese: lo
     stipendio di luglio esce il 20 agosto, e un arretrato di giugno lo si
     incassa adesso. Servono quindi anche le righe **degli altri mesi**, in una
     finestra: diciotto indietro (i crediti vecchi) e tre avanti (gli anticipi). */
  const around = monthsAll.filter(m =>
    m.month !== month && m.month >= shiftMonth(month, -18) && m.month <= shiftMonth(month, 3))
  const aroundIds = around.map(m => m.id)
  const monthById = new Map(monthsAll.map(m => [m.id, m.month]))

  // Seconda ondata: tutto ciò che ha bisogno degli id appena trovati.
  const streamIds = (fcStreams ?? []).map((x: { id: string }) => x.id)
  const [
    { data: revenue }, { data: costs },
    { data: prevRevenue }, { data: prevCosts },
    { data: yRev }, { data: yCost }, { data: fcInst },
    { data: aroundRev }, { data: aroundCost }, { error: cashProbe },
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
    // §224 — le righe degli altri mesi: si filtrano qui sotto, non nella query,
    // così la pagina funziona identica anche senza la 203 (colonne assenti)
    aroundIds.length ? supabase.from('pl_revenue_lines').select('*').in('month_id', aroundIds)
      : Promise.resolve({ data: [] }),
    aroundIds.length ? supabase.from('pl_cost_lines').select('*').in('month_id', aroundIds)
      : Promise.resolve({ data: [] }),
    // 42703 = colonna assente: la 203 non è stata eseguita. Va detto, non fallito
    supabase.from('pl_revenue_lines').select('paid_on').limit(1),
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
  /* §188 — i progetti coperti da ciascun accordo. La riga del mese ne porta uno
     solo quando ce n'è uno solo; con tre non ne porta nessuno, ma il margine
     digital deve togliere i subappalti di tutti e tre. */
  const coverage: Coverage = new Map()
  for (const r of (streamProjects ?? []) as { stream_id: string; project_id: string }[]) {
    coverage.set(r.stream_id, [...(coverage.get(r.stream_id) ?? []), r.project_id])
  }

  const projectNames = Object.fromEntries(
    (allProjects ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
  /* §192 — di chi è un progetto. Il subappalto sta sul progetto, ma il margine
     che erode è quello di un cliente: senza questa mappa nel conto economico si
     legge il nome del lavoro e non si sa a chi appartiene. */
  const clientOfProject = Object.fromEntries(
    (allProjects ?? []).filter((p: { client_id: string | null }) => !!p.client_id)
      .map((p: { id: string; client_id: string }) => [p.id, p.client_id]))
  // la riga di contratto si chiama col servizio: senza questo il cliente sparirebbe
  /* §185 — il commerciale che ciascun cliente ha in anagrafica. Le righe del mese
     ne portano una copia (la fotografia di quando sono nate); questa mappa serve
     a chi non l'ha, così il nome si legge invece di un trattino. */
  const clientNames = Object.fromEntries((activeClients ?? [])
    .map((c: { id: string; company_name: string; display_name: string | null }) =>
      [c.id, c.display_name || c.company_name]))

  /* Da riga di database a riga del motore, in un posto solo. Erano tre copie —
     mese singolo, vista di periodo, e adesso le righe trascinate da altri mesi
     (§224) — e ogni copia si dimenticava un campo diverso: senza `project_ids`
     i subappalti non uscivano dal margine, senza `pass_through` le partite di
     giro entravano nelle quote. Stesse righe, risposte diverse. */
  /* §287 — le righe del motore si costruiscono in **un posto solo**
     (`lib/pl-rows.ts`). Erano dieci copie con dieci sottoinsiemi diversi dei
     campi, e ogni campo dimenticato dà un numero **plausibile e sbagliato** —
     che è la sola categoria di errore che nessuno va a controllare. */
  const rowCtx = rowContext({
    month,
    months: monthsAll as unknown as { id: unknown; month: unknown }[],
    clients: (activeClients ?? []) as Record<string, unknown>[],
    streams: (fcStreams ?? []) as Record<string, unknown>[],
    streamProjects: (streamProjects ?? []) as { stream_id: string; project_id: string }[],
  })
  const asRev = (r: Record<string, unknown>, monthIso: string): RevenueLine =>
    toRevenueLine(r, { ...rowCtx, month: monthIso })
  const asCost = (c: Record<string, unknown>, monthIso: string): CostLine =>
    toCostLine(c, { ...rowCtx, month: monthIso })

  /* §224 — quali righe di altri mesi entrano in questa pagina: le scoperte (che
     si trascinano, e vanno viste dove si spunta) e quelle il cui movimento cade
     in questo mese (che sono la cassa di questo mese, di qualunque competenza).
     Il resto non c'entra e non si carica. */
  const monthEnd = endOfMonth(month)
  const inCash = (r: { paid?: unknown; paid_on?: unknown }) => {
    if (!r.paid) return true
    const on = r.paid_on as string | null | undefined
    return !!on && on >= month && on <= monthEnd
  }
  const carryRevenue = (aroundRev ?? [])
    .filter(inCash)
    .map((r: Record<string, unknown>) => asRev(r, monthById.get(String(r.month_id)) ?? month))
  const carryCosts = (aroundCost ?? [])
    .filter(inCash)
    .map((c: Record<string, unknown>) => asCost(c, monthById.get(String(c.month_id)) ?? month))

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

  /* ── §225 · tenuta di cassa ──────────────────────────────────────────────
     Il margine del mese e i soldi sul conto sono due domande diverse: il primo è
     imponibile e di competenza, i secondi sono lordi e con una data. Qui si
     mettono nella stessa schermata — e l'IVA incassata, che sta sul conto e
     finanzia il mese, si dichiara per quello che è: un debito con una scadenza. */
  const todayIso = new Date().toISOString().slice(0, 10)
  const fcRows = forecast(month, 6,
    (fcStreams ?? []) as never, (fcInst ?? []) as never, (fcItems ?? []) as never,
    new Set(monthsAll.map(m => m.month)))

  const bankReady = !bankErr
  /* Saldo **reale**: aperture più i soli movimenti veri. Vedi §189 — un
     `derivato` è una dichiarazione, non un euro passato da un conto. */
  const bankBalance = bankReady
    ? (bankAccounts ?? []).reduce((s: number, a: { opening_balance: unknown }) => s + num(a.opening_balance), 0)
      + (bankTx ?? []).filter((t: { source: string }) => t.source === 'banca')
        .reduce((s: number, t: { amount: unknown }) => s + num(t.amount), 0)
    : 0

  const allOpenRev = [...(revenue ?? []).map((r: Record<string, unknown>) => asRev(r, month)), ...carryRevenue]
  const allOpenCost = [...(costs ?? []).map((c: Record<string, unknown>) => asCost(c, month)), ...carryCosts]
  const cashCtx = { collection: collectionIndex(allOpenRev.map(l => fromRevenue(l, month))) }
  const runwayLines: RunwayLine[] = [
    ...allOpenRev.filter(l => !l.paid).map(l => ({
      id: l.id, label: l.label, side: 'entrata' as const,
      // dal conto passa il totale della fattura: l'IVA è cassa anche se non è ricavo
      gross: Math.round(l.amount_net * (1 + l.vat_rate) * 100) / 100,
      due: dueOf(fromRevenue(l, month), cashCtx), month: l.month ?? month,
    })),
    ...allOpenCost.filter(c => !c.paid && (c.actual > 0 || c.budget > 0)).map(c => ({
      id: c.id, label: c.label, side: 'uscita' as const,
      gross: Math.round((c.actual > 0 ? c.actual : c.budget) * (c.vat_applied ? 1 + c.vat_rate : 1) * 100) / 100,
      due: dueOf(fromCost(c, month), cashCtx), month: c.month ?? month,
    })),
  ]

  /* §230 — il consolidato: da quando si conta: `pl_config.settled_from`. È una
     **decisione** (fino a giugno è tutto liquidato), non un dato che si deduce:
     dedurla dai mesi chiusi la faceva spostare da sola il giorno in cui si
     chiudeva un mese, facendo sparire dal registro compensi che nessuno aveva
     erogato. Senza la 204 vale null e si conta da sempre, come prima. */
  const payoutOrigin = config.settled_from ? monthOfIso(config.settled_from) : null

  /* ── §226 · l'estratto conto certifica le spunte ──────────────────────────
     Una riga «pagata» che nessun movimento conferma non è una riga pagata: è
     una riga che qualcuno ha spuntato. Non si sbianchetta — può essere un conto
     non caricato o del contante — ma non può nemmeno leggersi identica a una
     che l'estratto conto dimostra. */
  const certTxs: CertTx[] = bankReady
    ? (bankTx ?? []).map((t: Record<string, unknown>) => ({
        id: String(t.id), booked_on: String(t.booked_on).slice(0, 10), amount: num(t.amount),
        source: String(t.source), kind: String(t.kind ?? 'altro'),
        counterparty: (t.counterparty as string) ?? null, description: String(t.description ?? ''),
        revenue_line_id: (t.revenue_line_id as string) ?? null,
        cost_line_id: (t.cost_line_id as string) ?? null,
      }))
    : []
  const certLines: CertLine[] = [
    ...allOpenRev.map(l => ({
      id: l.id, side: 'entrata' as const, month: l.month ?? month, label: l.label,
      net: l.amount_net, vatRate: l.vat_rate, paid: l.paid, paid_on: l.paid_on ?? null,
    })),
    ...allOpenCost.map(c => ({
      id: c.id, side: 'uscita' as const, month: c.month ?? month, label: c.label,
      net: c.actual, vatRate: c.vat_applied ? c.vat_rate : 0, paid: c.paid, paid_on: c.paid_on ?? null,
    })),
  ]
  const certs = Object.fromEntries(certify(certLines, certTxs, payoutOrigin))

  /* ── §226 · i compensi che sono usciti davvero ────────────────────────────
     Il piano dice quanto **spetta**; nessuna riga dice quanto è **uscito** —
     l'erogato non si scrive, si ricalcola — e finché il confronto non c'è, un
     socio pagato per intero e uno che non ha mai preso un euro si leggono
     uguali. Il maturato si somma su **tutti i mesi** noti, perché il bonifico
     in banca non sa di che mese è: confrontarlo con un mese solo darebbe a
     chiunque uno scoperto enorme o un anticipo enorme, e nessuno dei due vero. */
  const plPartners: Partner[] = (partners ?? []).map((p: Record<string, unknown>) => ({
    id: String(p.id), label: String(p.label),
    takes_delivery: !!p.takes_delivery, takes_residual: !!p.takes_residual,
  }))
  const people = mergePeople(
    plPartners.map(p => ({ id: p.id, label: p.label })),
    Array.from(new Set((activeClients ?? [])
      .map((c: Record<string, unknown>) => (c.sales_owner_name as string) ?? '').filter(Boolean))))

  /* §228 — il maturato si tiene **per persona e per mese**: la linea di
     liquidazione non è la stessa per tutti, e sommare prima toglierebbe il modo
     di applicarne una diversa a chi non è mai stato pagato.

     §233 — e si conta su **tutti** i mesi, non sulle righe che questo mese si
     trascina: un bonifico non sa di che mese è, e prendere i soli arretrati di
     cassa dava un maturato diverso a seconda del mese che si stava guardando —
     su luglio 18.749 €, su agosto 25.557 €, per lo stesso registro. */
  const allRev = [...(revenue ?? []).map((r: Record<string, unknown>) => asRev(r, month)),
    ...(aroundRev ?? []).map((r: Record<string, unknown>) => asRev(r, monthById.get(String(r.month_id)) ?? month))]
  const allCost = [...(costs ?? []).map((c: Record<string, unknown>) => asCost(c, month)),
    ...(aroundCost ?? []).map((c: Record<string, unknown>) => asCost(c, monthById.get(String(c.month_id)) ?? month))]
  const accruals: { key: string; month: string; amount: number }[] = []
  const monthsOfLines = Array.from(new Set([...allRev, ...allCost].map(l => l.month ?? month)))
  const payoutDateOfMonth = (mk: string) =>
    (monthsAll.find(m => m.month === mk) as { payout_date?: string | null } | undefined)?.payout_date ?? null
  for (const mk of monthsOfLines) {
    /* §286 — quello che si **deve erogare** non è quello che matura: è quello
       che è maturato in quel mese ed è rientrato entro il giorno della sua
       erogazione. Il registro e la tenuta di cassa devono dire lo stesso numero
       della sezione Compensi, o il conto economico contiene due cifre con lo
       stesso nome — e nella tenuta di cassa la più alta è anche la più
       sbagliata: toglie compensi che si erogheranno solo quando arriverà
       l'incasso che li finanzia, senza contare quell'incasso. */
    const w = buildWindow({
      month: mk, date: payoutDateOfMonth(mk),
      previousDate: payoutDateOfMonth(shiftMonth(mk, -1)),
      day: config.payout_day, settledFrom: config.settled_from,
    })
    const presi = takenIn(allRev.map(l => ({ ...l, month: l.month ?? month })), w)
    const mesi = new Set(presi.map(l => l.month))
    const mc = marginCostsFor(allCost.map(c => ({ ...c, month: c.month ?? month })), mesi, mk)
    const t = computeMonth(presi, mc, config, plPartners, mc,
      allRev.filter(l => mesi.has(l.month ?? month)))
    for (const p of t.perPartner) {
      const k = people.find(x => x.partnerId === p.partner.id)?.key
      if (k) accruals.push({ key: k, month: mk, amount: p.total })
    }
    for (const s of t.salesByOwner) {
      const k = people.find(x => x.label === s.label)?.key
      if (k) accruals.push({ key: k, month: mk, amount: s.amount })
    }
  }
  /* I bonifici si passano **senza** filtro di data: quale finestra vale per
     ciascuno lo decide il registro, che sa chi è stato liquidato e chi no. */
  const payouts = payoutLedger({
    people: people.map(p => ({ key: p.key, label: p.label })),
    accruals,
    /* §305 — quanto di ogni bonifico è compenso lo dice il **registro**, non la
       categoria: `classify` etichetta diversamente i bonifici ai soci di giugno
       e quelli del 13 agosto, e filtrare per categoria dava «erogato 0» a chi
       aveva ricevuto 3.412 €. */
    facts: payoutsFromBank(certTxs, people, undefined, undefined, payoutAlloc),
    from: payoutOrigin,
  })
  /* Quello che resta da erogare, collocato sul mese in cui è atteso: il compenso
     di luglio esce ad agosto, come il costo del lavoro (§224). */
  const payoutPlan = Array.from(
    payouts.flatMap(p => p.schedule).reduce((m2, x) => m2.set(x.month, (m2.get(x.month) ?? 0) + x.amount),
      new Map<string, number>()),
    ([m2, amount]) => ({ month: m2, amount }))

  /* §242 — dove il modello F24 è arrivato, vince sulla stima. Va caricato anche
     qui o le due sezioni tornerebbero a dire due numeri diversi con lo stesso
     nome (§238): la tenuta di cassa toglie questo, e Fiscale mostra quello. */
  const { data: vatActualRows } = await supabase
    .from('vat_settlements').select('year, quarter, to_pay, doc_ref, paid_on')
  const vatActuals: VatActual[] = (vatActualRows ?? []).map((r: Record<string, unknown>) => ({
    quarter: { year: Number(r.year), q: Number(r.quarter) as 1 | 2 | 3 | 4 },
    toPay: num(r.to_pay),
    docRef: (r.doc_ref as string) ?? null,
    paidOn: r.paid_on ? String(r.paid_on).slice(0, 10) : null,
  }))
  const quarters = vatByQuarter(vatMonths, todayIso, vatActuals)
  const vatNow = nextDue(vatMonths, todayIso, vatActuals)
  const runway = cashRunway({
    month, today: todayIso, balance: bankBalance,
    open: runwayLines,
    planned: fcRows.map(f => ({ month: f.month, cashIn: f.cashIn, cashOut: f.cashOut, open: f.open })),
    dues: quarters.filter(vatPending).filter(q => q.toPay > 0)
      .map(q => ({ date: q.deadline, amount: q.toPay, label: q.label })),
    vatHeld: vatNow?.toPay ?? 0,
    vatDeadline: vatNow?.deadline ?? null,
    vatLabel: vatNow?.label ?? '',
    vatDays: vatNow?.daysLeft ?? null,
    /* §225 — il costo del lavoro dei mesi che nessuno ha ancora aperto. Il piano
       dei costi non lo contiene (§184: l'area Personale la scrive l'organico), e
       senza questa stima il previsionale prometterebbe ogni mese novemila euro
       che non ci sono. Vale quello di **questo** mese: è l'unico numero vero che
       si ha, e la stima è dichiarata riga per riga. */
    payroll: allOpenCost
      .filter(c => c.month === month && isPayrollCenter(c.category))
      .reduce((s, c) => s + (c.actual > 0 ? c.actual : c.budget), 0),
    /* §227 — i compensi maturati e non erogati. Non sono righe di costo — non si
       scrivono, si ricalcolano — quindi senza questa riga «se paghi tutto»
       pagava fornitori e stipendi e non i soci né i commerciali. */
    payouts: {
      open: payouts.reduce((s, p) => s + Math.max(0, p.open), 0),
      people: payouts.filter(p => p.open > 0.5).length,
      never: payouts.filter(p => p.never).length,
      byMonth: payoutPlan,
      since: payoutOrigin,
    },
  })

  /* §241 — le uscite vere del mese, dai conti. La sezione Uscite elenca quello
     che il conto economico **prevede**; qui accanto c'è quello che dai conti è
     davvero passato, BPM e Vivid insieme e separati. Sono due domande diverse e
     la seconda non aveva risposta in questa pagina: un mese poteva avere ogni
     riga spuntata e uscite vere per il doppio, e non lo diceva nessuno.
     Solo movimenti `banca` (§189) — un `derivato` nasce dalla spunta che questo
     confronto serve a verificare. */
  const r2 = (n: number) => Math.round(n * 100) / 100
  const accLabel = new Map((bankAccounts ?? []).map((a: Record<string, unknown>) =>
    [String(a.id), String(a.label ?? 'Conto')]))
  const monthTx = (bankTx ?? []).filter((t: Record<string, unknown>) =>
    t.source === 'banca' && String(t.booked_on).slice(0, 7) === month.slice(0, 7))
  const outTx = monthTx.filter((t: Record<string, unknown>) => num(t.amount) < 0)
  const groupBy = <T,>(rows: Record<string, unknown>[], key: (r: Record<string, unknown>) => string) => {
    const m = new Map<string, { label: string; amount: number; count: number }>()
    for (const r of rows) {
      const k = key(r)
      const cur = m.get(k) ?? { label: k, amount: 0, count: 0 }
      m.set(k, { label: k, amount: r2(cur.amount + Math.abs(num(r.amount))), count: cur.count + 1 })
    }
    return Array.from(m.values()).sort((a, b) => b.amount - a.amount) as T[]
  }

  /* §246 — la riconciliazione riga per riga, dentro il conto economico.
     Fin qui si faceva solo in Banca, partendo dal **movimento**: giusto quando
     si carica l'estratto conto, sbagliato quando si sta chiudendo il mese e la
     domanda è «questa fattura chi me l'ha pagata?». Qui la domanda parte dalla
     **riga**, e i candidati sono gli stessi di `matchCandidates` (§189): numero
     documento, importo lordo al centesimo, nome della controparte.
     L'aggancio **non è automatico** — un abbinamento sbagliato dichiara
     incassata una fattura che nessuno ha pagato, ed è un errore che poi nessuno
     cerca — ma un clic sul candidato giusto deve bastare. */
  const txAll = (bankTx ?? []) as Record<string, unknown>[]
  /* §254 — una riga può avere **più** movimenti: «Advertising online» è una voce
     nel mese e ventidue addebiti sul conto. Tenerne uno solo faceva sparire gli
     altri ventuno dalla vista e dalla copertura. Contano `banca` e `manuale`:
     un anticipo di tasca propria è un fatto quanto un bonifico (§195). */
  const grossRev = (r: Record<string, unknown>) => Math.round(num(r.amount_net) * (1 + num(r.vat_rate)) * 100) / 100
  const grossCost = (c: Record<string, unknown>) => Math.round(
    (num(c.actual) > 0 ? num(c.actual) : num(c.budget)) * (c.vat_applied ? 1 + num(c.vat_rate) : 1) * 100) / 100

  /* §258 — le quote: un movimento può stare su più righe, e **quanto** ne sta su
     ciascuna lo dice `bank_tx_lines`. Senza, un bonifico cumulativo risulterebbe
     tutto della prima riga che se l'è preso. Se la 209 non è stata eseguita la
     query fallisce, la mappa resta vuota e si torna al legame per colonna. */
  const { data: allocRows } = await supabase.from('bank_tx_lines')
    .select('tx_id, revenue_line_id, cost_line_id, amount')
  const allocs = (allocRows ?? []) as Record<string, unknown>[]
  /* §282 — il lordo serve **solo per le righe che un'allocazione nomina**, non
     per tutte: erano due scansioni intere della tabella a ogni caricamento per
     leggerne centoventinove. Le righe del mese ce le abbiamo già in memoria; le
     altre si chiedono per id, e la query sparisce del tutto quando in questo
     mese nessuno ha agganciato niente. */
  const grossById = new Map<string, number>()
  for (const r of (revenue ?? []) as Record<string, unknown>[]) grossById.set(String(r.id), grossRev(r))
  for (const c of (costs ?? []) as Record<string, unknown>[]) grossById.set(String(c.id), grossCost(c))
  const mancanti = {
    rev: Array.from(new Set(allocs.map(a => String(a.revenue_line_id ?? ''))
      .filter(id => id && id !== 'null' && !grossById.has(id)))),
    cost: Array.from(new Set(allocs.map(a => String(a.cost_line_id ?? ''))
      .filter(id => id && id !== 'null' && !grossById.has(id)))),
  }
  if (mancanti.rev.length || mancanti.cost.length) {
    const [{ data: revAll }, { data: costAll }] = await Promise.all([
      mancanti.rev.length
        ? supabase.from('pl_revenue_lines').select('id, amount_net, vat_rate').in('id', mancanti.rev)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      mancanti.cost.length
        ? supabase.from('pl_cost_lines').select('id, actual, budget, vat_applied, vat_rate').in('id', mancanti.cost)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ])
    for (const r of (revAll ?? []) as Record<string, unknown>[]) grossById.set(String(r.id), grossRev(r))
    for (const c of (costAll ?? []) as Record<string, unknown>[]) grossById.set(String(c.id), grossCost(c))
  }
  /* §261 — una riga non assorbe più del suo lordo: il travaso della 209 ha dato
     a ciascuna l'importo intero del suo movimento, e l'eccesso non è speso. */
  const usedOfTx = usedByTx(
    allocs.map(a => ({
      txId: String(a.tx_id), lineId: String(a.revenue_line_id ?? a.cost_line_id ?? ''),
      amount: num(a.amount),
    })),
    id => grossById.get(id))
  /** quanto di questo movimento non è ancora assegnato a nessuna riga */
  const freeOfTx = (t: Record<string, unknown>) =>
    r2(Math.abs(num(t.amount)) - (usedOfTx.get(String(t.id)) ?? 0))

  const linkedTx: Record<string, { txId: string; date: string; amount: number; who: string }[]> = {}
  const txById = new Map(txAll.map(t => [String(t.id), t]))
  const push = (lineId: string, t: Record<string, unknown>, amount: number) => {
    if (String(t.source) !== 'banca' && String(t.source) !== 'manuale') return
    if ((linkedTx[lineId] ?? []).some(x => x.txId === String(t.id))) return
    linkedTx[lineId] = [...(linkedTx[lineId] ?? []), {
      txId: String(t.id), date: String(t.booked_on).slice(0, 10), amount,
      who: String(t.counterparty ?? t.description ?? '').slice(0, 40),
    }]
  }
  /* Prima le quote — portano l'importo **allocato**, che è quello che copre la
     riga — poi i legami per colonna rimasti fuori, con l'importo intero. */
  for (const a of allocs) {
    const lineId = String(a.revenue_line_id ?? a.cost_line_id ?? '')
    const t = txById.get(String(a.tx_id))
    if (!lineId || !t) continue
    push(lineId, t, num(t.amount) < 0 ? -Math.abs(num(a.amount)) : Math.abs(num(a.amount)))
  }
  for (const t of txAll) {
    const lineId = (t.revenue_line_id ?? t.cost_line_id) as string | null
    if (lineId) push(String(lineId), t, num(t.amount))
  }
  /* §261 — candidati sono i movimenti **veri** con ancora qualcosa da assegnare,
     non solo quelli intonsi: la 36 di Fatima Leo è un bonifico da 3.812,50 che
     paga growth e marketing, e finché il filtro chiedeva «nessuna riga collegata»
     la seconda non poteva agganciarsi a niente. Un `derivato` resta fuori: nasce
     dalla spunta che si sta cercando di dimostrare. */
  const freeTx = txAll.filter(t => (String(t.source) === 'banca' || String(t.source) === 'manuale')
    && t.no_match_needed !== true && freeOfTx(t) > 0.01)

  type Cand = {
    txId: string; date: string; amount: number; who: string; why: string
    /** §261 — quanto di questo movimento è ancora libero: con un bonifico
        cumulativo è l'unica cosa che dice se può ancora coprire questa riga */
    free: number
  }
  const candidatesFor = (target: number, dir: 'in' | 'out', name: string): Cand[] => {
    const want = Math.round(Math.abs(target) * 100) / 100
    return freeTx
      .filter(t => (dir === 'in' ? num(t.amount) > 0 : num(t.amount) < 0))
      .map(t => {
        const abs = Math.round(Math.abs(num(t.amount)) * 100) / 100
        const libero = freeOfTx(t)
        const speso = r2(abs - libero) > 0.01
        const who = String(t.counterparty ?? '').toLowerCase()
        const desc = String(t.description ?? '').toLowerCase()
        const exact = Math.abs(abs - want) < 0.02
        const close = !exact && want > 0 && Math.abs(abs - want) / want < 0.02
        /* §254 — il nome si confronta **parola per parola**, non per contenimento:
           «Advertising online (Google/Meta)» non contiene «Meta Ads» e viceversa,
           e finché il confronto era `includes` i ventidue addebiti Meta non
           comparivano fra i candidati della loro stessa riga. */
        const parole = (x: string) => new Set(x.toLowerCase()
          .split(/[^a-zà-ù0-9]+/).filter(w => w.length >= 4))
        const A = parole(name), B = parole(`${who} ${desc}`)
        const byName = Array.from(A).some(w => B.has(w))
        /* §261 — un bonifico che **contiene** la riga è un candidato quanto uno
           che le somiglia: 3.812,50 non è né esatto né vicino a 1.830, ed è
           esattamente il movimento che la paga. Vale solo col nome giusto: senza,
           ogni incasso grande comparirebbe sotto ogni riga piccola. */
        const copre = !exact && !close && byName && libero >= want - 0.01
        if (!exact && !close && !byName) return null
        return {
          txId: String(t.id), date: String(t.booked_on).slice(0, 10), amount: num(t.amount),
          who: String(t.counterparty ?? t.description ?? '').slice(0, 40),
          free: libero,
          why: speso ? `già su un'altra riga · resta ${eur2(libero)}`
            : exact ? 'importo esatto' : close ? 'importo vicino'
            : copre ? 'copre questa riga e avanza' : 'stesso nome',
          rank: (exact ? 2 : close ? 1 : 0) + (byName ? 1 : 0) + (copre ? 1 : 0),
        }
      })
      .filter((x): x is Cand & { rank: number } => x !== null)
      .sort((a, b) => (b.rank - a.rank) || b.date.localeCompare(a.date))
      // con la selezione multipla la lista serve intera: ventidue addebiti
      // Meta si agganciano solo se si vedono tutti e ventidue
      .slice(0, 40)
      .map(({ rank: _r, ...c }) => c)
  }

  /* I candidati si mostrano **anche** su una riga già agganciata ma non coperta:
     è il caso dei ventidue Meta, dove al secondo giro se ne aggiungono altri. */
  const matchOptions: Record<string, Cand[]> = {}
  for (const r of (revenue ?? []) as Record<string, unknown>[]) {
    const name = r.client_id ? (clientNames[String(r.client_id)] ?? '') : String(r.label)
    matchOptions[String(r.id)] = candidatesFor(grossRev(r), 'in', name)
  }
  for (const c of (costs ?? []) as Record<string, unknown>[]) {
    matchOptions[String(c.id)] = candidatesFor(grossCost(c), 'out', String(c.label))
  }

  /* §259/§261 — le fatture che potrebbero essere una riga, per agganciarle nello
     stesso gesto in cui si conferma il pagamento.
     Una fattura **copre più righe**: la 36 di Fatima Leo è 3.812,50 € e dentro
     ci sono il canone growth e il marketing, che nel conto economico sono due
     righe. Finché un documento già usato spariva dall'elenco, la seconda riga non
     aveva nessuna fattura da scegliere e l'unica strada era inventarne una.
     Adesso resta, e porta scritto **quanta capienza le è rimasta**: è quello che
     distingue «la stessa fattura, altra voce» da «l'ho già agganciata due volte». */
  const { data: invRows } = await supabase.from('invoices')
    .select('id, direction, number, issued_on, total, sign, counterparty_name')
  const { data: linkedInv } = await supabase.from('pl_cost_lines')
    .select('invoice_id, actual, budget, vat_applied, vat_rate').not('invoice_id', 'is', null)
  const { data: linkedInvR } = await supabase.from('pl_revenue_lines')
    .select('invoice_id, amount_net, vat_rate').not('invoice_id', 'is', null)
  const invUse = new Map<string, { righe: number; importo: number }>()
  const useInv = (id: string, lordo: number) => {
    const cur = invUse.get(id) ?? { righe: 0, importo: 0 }
    invUse.set(id, { righe: cur.righe + 1, importo: r2(cur.importo + lordo) })
  }
  for (const r of (linkedInvR ?? []) as Record<string, unknown>[]) useInv(String(r.invoice_id), grossRev(r))
  for (const c of (linkedInv ?? []) as Record<string, unknown>[]) useInv(String(c.invoice_id), grossCost(c))

  type InvOpt = {
    id: string; number: string; date: string; total: number; who: string
    /** su quante righe di conto economico è già agganciata */
    righe?: number
    /** quanto del suo totale non è ancora coperto da nessuna riga */
    left?: number
  }
  const invFor = (verso: 'emessa' | 'ricevuta', lordo: number, nome: string): InvOpt[] =>
    (invRows ?? [])
      .filter((i: Record<string, unknown>) => i.direction === verso)
      .map((i: Record<string, unknown>) => {
        const tot = num(i.sign) * num(i.total)
        const uso = invUse.get(String(i.id)) ?? { righe: 0, importo: 0 }
        return {
          id: String(i.id), number: String(i.number),
          date: String(i.issued_on).slice(0, 10),
          total: tot,
          who: String(i.counterparty_name ?? ''),
          righe: uso.righe,
          left: r2(Math.abs(tot) - uso.importo),
          vicino: Math.abs(Math.abs(tot) - Math.abs(lordo)) < 0.02,
          stesso: nome.length > 3 && String(i.counterparty_name ?? '').toLowerCase()
            .includes(nome.toLowerCase().split(/[^a-zà-ù]+/)[0] ?? ''),
        }
      })
      .filter(i => i.vicino || i.stesso)
      /* Prima quelle con ancora capienza per questa riga: una fattura esaurita
         resta in fondo e visibile, perché a volte la riga sbagliata è l'altra. */
      .sort((a, b) => Number(b.left >= Math.abs(lordo) - 0.02) - Number(a.left >= Math.abs(lordo) - 0.02)
        || Number(b.vicino) - Number(a.vicino)
        || b.date.localeCompare(a.date))
      .slice(0, 12)
      .map(({ vicino: _v, stesso: _s, ...i }) => i)

  const invoiceOptions: Record<string, InvOpt[]> = {}
  for (const r of (revenue ?? []) as Record<string, unknown>[]) {
    const nome = r.client_id ? (clientNames[String(r.client_id)] ?? '') : String(r.label)
    invoiceOptions[String(r.id)] = invFor('emessa', grossRev(r), nome)
  }
  for (const c of (costs ?? []) as Record<string, unknown>[]) {
    invoiceOptions[String(c.id)] = invFor('ricevuta', grossCost(c), String(c.label))
  }

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

    const [{ data: allRev }, { data: allCost }] = ids.length
      ? await Promise.all([
          supabase.from('pl_revenue_lines').select('*').in('month_id', ids),
          supabase.from('pl_cost_lines').select('*').in('month_id', ids),
        ])
      : [{ data: [] }, { data: [] }]

    /* §207 — la vista di periodo chiama lo **stesso** motore e adesso anche lo
       stesso mapper del mese singolo: quando erano due, questa copia leggeva
       righe mutilate — i subappalti non uscivano dal margine, le partite di giro
       entravano nelle quote — e la risposta sbagliata era sempre la più generosa. */
    const plPartners = (partners ?? []).map((p: Record<string, unknown>) => ({
      id: String(p.id), label: String(p.label),
      takes_delivery: !!p.takes_delivery, takes_residual: !!p.takes_residual,
    })) as Partner[]

    const byMonth = new Map((rows ?? []).map((r: { id: string; month: string }) => [r.id, r.month]))
    const monthOfRow = (r: Record<string, unknown>) => byMonth.get(String(r.month_id)) ?? ''
    const perMonth = wanted.map(m => {
      const id = (rows ?? []).find((r: { month: string }) => r.month === m)?.id
      const rev = (allRev ?? []).filter((r: { month_id: string }) => r.month_id === id).map(r => asRev(r, m))
      const cst = (allCost ?? []).filter((c: { month_id: string }) => c.month_id === id).map(c => asCost(c, m))
      return { month: m, exists: !!id, t: computeMonth(rev, cst, config, plPartners) }
    })

    const revWithMonth = (allRev ?? []).map((r: Record<string, unknown>) => ({
      ...asRev(r, monthOfRow(r)),
      month: monthOfRow(r),
      client: r.client_id ? (clientNames[String(r.client_id)] ?? String(r.label)) : String(r.label),
    }))
    const costWithMonth = (allCost ?? []).map((c: Record<string, unknown>) => ({
      ...asCost(c, monthOfRow(c)), month: monthOfRow(c),
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
      revenue={(revenue ?? []).map((r: Record<string, unknown>) => asRev(r, month))}
      // §224 — quello che si muove in questo mese ma è maturato altrove
      carryRevenue={carryRevenue}
      carryCosts={carryCosts}
      cashSetupNeeded={cashProbe?.code === '42703'}
      projectNames={projectNames}
      clientNames={clientNames}
      clientOfProject={clientOfProject}
      drift={drift}
      /* §286 — la data dell'erogazione di questo mese e quella del mese prima:
         la prima chiude la finestra degli incassi che entrano nei compensi, la
         seconda la apre. Assenti prima della 212: si cade sul giorno di
         default e la pagina lo dichiara. */
      payoutDate={(monthsAll.find(m => m.month === month) as { payout_date?: string | null } | undefined)?.payout_date ?? null}
      prevPayoutDate={(monthsAll.find(m => m.month === shiftMonth(month, -1)) as { payout_date?: string | null } | undefined)?.payout_date ?? null}
      runway={runway}
      bankReady={bankReady}
      certs={certs}
      payouts={payouts}
      vatMonths={vatMonths}
      vatActuals={vatActuals}
      today={todayIso}
      linkedTx={linkedTx}
      matchOptions={matchOptions}
      invoiceOptions={invoiceOptions}
      /* §260 — i bonifici ai soci: `finanziamento` in uscita, non agganciati a
         nessuna riga. Sono i candidati per la conferma di un compenso, e sono
         un insieme diverso dagli altri — un compenso non ha una riga di costo,
         quindi non poteva avere candidati. */
      payoutOptions={freeTx
        .filter(t => num(t.amount) < 0 && String(t.kind) === 'finanziamento')
        .map(t => ({
          txId: String(t.id), date: String(t.booked_on).slice(0, 10), amount: num(t.amount),
          who: String(t.counterparty ?? t.description ?? '').slice(0, 40), why: 'bonifico a un socio',
        }))}
      /* §247 — quali righe hanno un documento sotto. Una spesa pagata senza
         fattura non è un dettaglio contabile: è IVA che non si detrae e un
         costo che in verifica non si difende. */
      /* §302 — **quale** documento sta sotto ogni riga, non solo se c'è.
         Serve a mostrarlo dove si lavora: la fattura si collegava solo dentro il
         dialogo del pagamento, quindi su una riga già pagata non c'era strada.
         Comprende anche le righe **trascinate** da altri mesi (§294): senza la
         loro voce in mappa una riga con la fattura sotto risulterebbe
         cancellabile proprio dove la si guarda per toglierla. */
      invoiceOf={Object.fromEntries([
        ...(revenue ?? []), ...(costs ?? []), ...(aroundRev ?? []), ...(aroundCost ?? []),
      ]
        .filter((r: Record<string, unknown>) => !!r.invoice_id)
        .map((r: Record<string, unknown>) => {
          const inv = (invRows ?? []).find((i: Record<string, unknown>) => String(i.id) === String(r.invoice_id))
          return [String(r.id), inv ? {
            id: String(inv.id), number: String(inv.number),
            date: String(inv.issued_on).slice(0, 10),
            total: r2(num(inv.sign) * num(inv.total)),
            who: String(inv.counterparty_name ?? ''),
          } : { id: String(r.invoice_id), number: '—', date: '', total: 0, who: '' }]
        }))}
      payoutLines={(payoutRows ?? [])
        .filter((r: Record<string, unknown>) => String(r.month_id) === (monthRow?.id ?? ''))
        .map((r: Record<string, unknown>) => ({
          id: String(r.id), person_key: String(r.person_key), person_label: String(r.person_label),
          kind: r.kind === 'commerciale' ? 'commerciale' as const : 'socio' as const,
          amount: num(r.amount), due_month: String(r.due_month).slice(0, 10),
          paid: r.paid === true, paid_on: r.paid_on ? String(r.paid_on).slice(0, 10) : null,
        }))}
      centers={(centers ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))}
      costs={(costs ?? []).map((c: Record<string, unknown>) => asCost(c, month))}
    />
  )
}
