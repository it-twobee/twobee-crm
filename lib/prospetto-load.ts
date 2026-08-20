/**
 * Il prospetto di un mese, caricato una volta sola. (§268)
 *
 * Lo leggono in due: la pagina e il **report per il board** (`/api/prospetto`).
 * Erano due assemblaggi diversi degli stessi numeri, ed è il modo in cui una
 * riunione si apre con due fogli che non tornano — quello a schermo e quello
 * stampato. Qui la composizione è una: chi ne aggiunge un terzo chiama questa.
 *
 * Non contiene regole: le regole stanno nei motori (`cash-plan`, `pl`,
 * `cash-calendar`, `vat`). Qui c'è solo il lavoro di andare a prendere le righe
 * e darle in pasto nell'ordine giusto.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  shiftMonth, computeMonth, rowToPlConfig,
  type PlConfig, type RevenueLine, type CostLine, type Partner,
} from '@/lib/pl'
import { collectionIndex, fromRevenue, fromCost, dueOf, monthOf } from '@/lib/cash-calendar'
import {
  linesForMonth, coveredProjects, type Coverage, type Installment, type RevenueStream,
} from '@/lib/revenue'
import { plannedForMonth, plannedNotYetInMonth, isPayrollCenter, type CostItem } from '@/lib/costs'
import { vatByQuarter, type MonthVat, type VatActual } from '@/lib/vat'
import { planMonth, type PlanMonth } from '@/lib/cash-plan'
import { buildWindow, takenIn, marginCostsFor } from '@/lib/payout-window'
import { rowContext, toRevenueLines, toCostLines } from '@/lib/pl-rows'

export type ProspettoData = {
  setupNeeded: boolean
  months: { month: string; status: string }[]
  /**
   * §286 — mese → data in cui si eroga quello che vi è maturato. È il limite
   * della finestra da cui dipende quanto si distribuisce, e apre quella del mese
   * dopo: senza, un incasso in ritardo o si perde o si conta due volte.
   */
  payoutDates: Record<string, string>
  revenue: (RevenueLine & { month: string })[]
  costs: (CostLine & { month: string })[]
  txs: { booked_on: string; amount: number; source: string; kind: string }[]
  payouts: {
    /** il mese in cui matura: esce in quello dopo (§224, §291) */
    month: string; partners: number; sales: number
    paidPartners: number; paidSales: number; paidOut: number
    /** §291 — chi prende cosa, dal piano compensi */
    people: { who: string; kind: 'socio' | 'commerciale'; amount: number; paid: number }[]
  }[]
  opening: number
  bankReady: boolean
  collection: [string, string][]
  first: string
  plan: PlanMonth[]
  vatHeld: number
  vatLabel: string
  vatDeadline: string | null
  bank: { inflow: number; outflow: number; balance: number } | null
  /** §312 — il conto del mese come l'ha visto la banca: nessuna attesa dentro */
  bankMonth: { opening: number; inflow: number; outflow: number; lastStatement: string | null } | null
  /** §312 — compensi cumulativi per persona, maturato contro erogato */
  ledger: {
    who: string; kind: 'socio' | 'commerciale'; accrued: number; paid: number
    /** §228 — per lui si conta da sempre: non ha mai ricevuto un bonifico */
    fromAlways: boolean
    /** §233 — mai un bonifico su nessun mese, non solo su quelli in finestra */
    never: boolean
  }[]
  /** §230 — da quale mese conta il cumulato dei compensi: prima è liquidato */
  ledgerSince: string | null
  horizon: string[]
  config: PlConfig
  partners: Partner[]
  status: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadProspetto(
  supabase: SupabaseClient<any, any, any>,
  month: string,
  today: string,
): Promise<ProspettoData> {
  /* §282 — **una sola andata e ritorno.** Erano tre onde in fila: i mesi, poi
     dodici query che filtravano sui loro id, poi le rate che filtravano sugli
     accordi. Ma le righe si prendono comunque tutte — `in(month_id, ids)` con
     tutti i mesi non toglie niente — e le rate sono sedici: la dipendenza era
     solo apparente, e costava due giri di rete su ogni caricamento (982 ms a
     freddo). Adesso parte tutto insieme e si filtra in memoria. */
  const [
    { data: monthRows, error: setupErr },
    { data: revRows }, { data: costRows }, { data: accountRows }, { data: txRows, error: bankErr },
    { data: cfgRow }, { data: partnerRows }, { data: clientRows }, { data: payoutRows },
    { data: streamRows }, { data: coverRows }, { data: instRows }, { data: itemRows },
    { data: centerRows },
    { data: vatActualRows }, { data: allocRows },
  ] = await Promise.all([
    /* `select('*')`: `payout_date` arriva con la 212 e prima non c'è. Chiederla
       per nome farebbe fallire l'intero caricamento per una colonna che è un di
       più — il prospetto si legge lo stesso, con la data di default. */
    supabase.from('pl_months').select('*').order('month'),
    supabase.from('pl_revenue_lines').select('*'),
    supabase.from('pl_cost_lines').select('*'),
    supabase.from('bank_accounts').select('id, opening_balance, is_active'),
    /* §284 — servono anche gli **agganci**: una riga spuntata che nessun
       movimento `banca` dimostra non è dentro il saldo, e va sommata invece che
       data per scontata. */
    supabase.from('bank_transactions')
      .select('id, booked_on, amount, source, kind, revenue_line_id, cost_line_id').limit(5000),
    supabase.from('pl_config').select('*').eq('id', true).maybeSingle(),
    supabase.from('pl_partners').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('clients').select('id, display_name, company_name, sales_owner_name'),
    /* §243 — i compensi come righe spuntabili. Se la 207 non è stata eseguita
       la query fallisce, `payoutRows` resta vuoto e la cassa torna al ripiego
       di prima: il totale dei bonifici `finanziamento` del mese. */
    supabase.from('pl_payouts').select('*'),
    /* §262 — un mese mai aperto non ha righe: quello che succederà lo dicono
       il contratto e il piano dei costi, voce per voce. */
    supabase.from('revenue_streams').select('*'),
    /* §188 — quali progetti copre un accordo: serve al valore venduto e al
       margine digital, che toglie i subappalti di **tutti** quelli coperti. */
    supabase.from('revenue_stream_projects').select('stream_id, project_id'),
    supabase.from('revenue_installments').select('*'),
    supabase.from('cost_items').select('*').eq('is_active', true),
    /* §308 — le aree, per riconoscere quella del personale dal suo **id**:
       `cost_items.category` dice «HR» e l'area si chiama «Personale». */
    supabase.from('cost_centers').select('id, name'),
    supabase.from('vat_settlements').select('year, quarter, to_pay, doc_ref, paid_on'),
    /* §258 — le quote: un bonifico cumulativo nomina più righe, e senza queste
       risulterebbero spuntate senza prova. */
    supabase.from('bank_tx_lines').select('tx_id, revenue_line_id, cost_line_id'),
  ])
  const setupNeeded = setupErr?.code === '42P01' || setupErr?.code === 'PGRST205'
  if (setupNeeded) {
    return {
      setupNeeded: true, months: [], payoutDates: {}, revenue: [], costs: [], txs: [], payouts: [],
      opening: 0, bankReady: false, collection: [], first: month, plan: [],
      vatHeld: 0, vatLabel: '', vatDeadline: null, bank: null, bankMonth: null,
      ledger: [], ledgerSince: null, horizon: [month],
      config: rowToPlConfig({}), partners: [], status: null,
    }
  }

  const num = (v: unknown) => Number(v ?? 0)
  const r2 = (n: number) => Math.round(n * 100) / 100

  const monthOfId = new Map((monthRows ?? []).map((m: { id: string; month: string }) => [m.id, m.month.slice(0, 10)]))

  /* §186/§207 — il **valore venduto** del lavoro che una riga paga: decide se
     l'opzione del fondo rischio digital è disponibile, e si guarda il progetto e
     non la rata — un lavoro da 24.000 € pagato in sei rate da 4.000 resta un
     lavoro da 24.000. Senza questo campo nessuna riga risulta eleggibile, il
     fondo sparisce e ogni socio prende il 28% invece del 25%: sul luglio vero
     erano 4.340,78 € a testa invece di 4.045,94. */
  const projectValue = new Map<string, number>()
  for (const st of (streamRows ?? []) as { project_id: string | null; amount: unknown; status: string }[]) {
    if (!st.project_id || st.status === 'bozza') continue
    projectValue.set(st.project_id, num(projectValue.get(st.project_id)) + num(st.amount))
  }
  const coverage: Coverage = new Map()
  for (const r of (coverRows ?? []) as { stream_id: string; project_id: string }[]) {
    coverage.set(r.stream_id, [...(coverage.get(r.stream_id) ?? []), r.project_id])
  }
  /* §284 — le righe che un movimento **di banca** nomina: per colonna o per
     quota (§258). Sono le sole già contenute nel saldo di partenza. */
  const allocs = (allocRows ?? []) as Record<string, unknown>[]
  const bancaIds = new Set((txRows ?? [])
    .filter((t: Record<string, unknown>) => String(t.source) === 'banca')
    .map((t: Record<string, unknown>) => String(t.id)))
  const inBank = new Set<string>()
  for (const t of (txRows ?? []) as Record<string, unknown>[]) {
    if (String(t.source) !== 'banca') continue
    const id = t.revenue_line_id ?? t.cost_line_id
    if (id) inBank.add(String(id))
  }
  for (const a of allocs) {
    if (!bancaIds.has(String(a.tx_id))) continue
    const id = a.revenue_line_id ?? a.cost_line_id
    if (id) inBank.add(String(id))
  }

  /* §287 — un posto solo per costruire le righe del motore. Qui mancava
     `installment_id`, e il report per il consiglio diceva un centesimo diverso
     dalla pagina: poco, ma sono due cifre con lo stesso nome davanti agli
     stessi tre soci. */
  const rowCtx = rowContext({
    month,
    months: (monthRows ?? []) as { id: unknown; month: unknown }[],
    clients: (clientRows ?? []) as Record<string, unknown>[],
    streams: (streamRows ?? []) as Record<string, unknown>[],
    streamProjects: (coverRows ?? []) as { stream_id: string; project_id: string }[],
  })
  const revenue = toRevenueLines(revRows as Record<string, unknown>[], rowCtx)
  const costs = toCostLines(costRows as Record<string, unknown>[], rowCtx)

  /* §189 — l'apertura conta tutti i conti, i movimenti solo quelli `banca`: il
     motore li filtra da sé, qui si passano tutti perché la pagina dichiara
     anche quanto è «dichiarato e non provato». */
  const opening = (accountRows ?? []).reduce((s: number, a: { opening_balance: unknown }) =>
    s + num(a.opening_balance), 0)

  /* Il subappalto si paga quando ha pagato il cliente: senza l'indice degli
     incassi la sua scadenza sarebbe la fine del mese, e in cassa cadrebbe nel
     mese sbagliato (§224). */
  const ctxIndex = collectionIndex(revenue.map(l => fromRevenue(l, l.month)))
  const ctx = { collection: ctxIndex }

  /* §240 — i compensi non sono righe: si ricalcolano dal piano, mese per mese,
     con lo stesso `computeMonth` del conto economico. Il maturato da lì, quello
     uscito davvero dai movimenti `finanziamento` della banca (§226). */
  const config = rowToPlConfig((cfgRow ?? {}) as Record<string, unknown>)
  const partners = (partnerRows ?? []).map((x: Record<string, unknown>) => ({
    id: String(x.id), label: String(x.label),
    takes_delivery: !!x.takes_delivery, takes_residual: !!x.takes_residual,
  })) as Partner[]
  const ownerOfClient = new Map((clientRows ?? []).map((c: Record<string, unknown>) =>
    [String(c.id), (c.sales_owner_name as string) ?? null]))
  const nameOfClient = new Map((clientRows ?? []).map((c: Record<string, unknown>) =>
    [String(c.id), String(c.display_name || c.company_name || '')]))
  /* §287 — il commerciale dell'anagrafica lo mette già `toRevenueLine`: era la
     terza copia di quella lettura, e le altre due se la dimenticavano. */
  const withOwner = revenue
  const maturato = new Map((monthRows ?? []).map((m: { month: string }) => {
    const mm = m.month.slice(0, 10)
    const t = computeMonth(
      withOwner.filter(l => l.month === mm), costs.filter(c => c.month === mm), config, partners)
    return [mm, {
      partners: t.perPartner.map(x => ({ who: x.partner.label, amount: x.total })),
      sales: t.salesByOwner.map(x => ({ who: x.label, amount: x.amount })),
    }]
  }))

  /* §244 — la riga si ritrova **per nome**, non per chiave: `mergePeople` fonde
     socio e commerciale in una persona sola e le dà la chiave del socio, mentre
     `materializePayouts` scrive la provvigione con quella del commerciale. Due
     spazi di chiavi diversi, e la spunta compariva solo su chi è commerciale e
     basta. Il nome ce l'hanno tutte e due ed è quello che si legge a schermo. */
  const paidOfPerson = (rows: Record<string, unknown>[], who: string, kind: 'socio' | 'commerciale', mm: string) =>
    r2(rows
      .filter(x => x.paid === true && x.kind === kind
        && String(x.person_label ?? '').trim().toLowerCase() === who.trim().toLowerCase()
        && String(x.paid_on ?? '').slice(0, 7) === mm.slice(0, 7))
      .reduce((s2: number, x) => s2 + num(x.amount), 0))

  const payouts = (monthRows ?? []).map((m: { month: string }) => {
    const mm = m.month.slice(0, 10)
    const mat = maturato.get(mm)!
    return {
      month: mm,
      partners: r2(mat.partners.reduce((s, x) => s + x.amount, 0)),
      sales: r2(mat.sales.reduce((s, x) => s + x.amount, 0)),
      /* §243 — spuntato pagato **in questo mese**: la retribuzione di luglio si
         paga ad agosto, e la spunta cade lì. La riga sa anche per quale dei due
         lavori, cosa che un bonifico non dice (§226). */
      paidPartners: (payoutRows ?? [])
        .filter((x: Record<string, unknown>) => x.paid === true && x.kind === 'socio'
          && String(x.paid_on ?? '').slice(0, 7) === mm.slice(0, 7))
        .reduce((s2: number, x: Record<string, unknown>) => s2 + num(x.amount), 0),
      paidSales: (payoutRows ?? [])
        .filter((x: Record<string, unknown>) => x.paid === true && x.kind === 'commerciale'
          && String(x.paid_on ?? '').slice(0, 7) === mm.slice(0, 7))
        .reduce((s2: number, x: Record<string, unknown>) => s2 + num(x.amount), 0),
      paidOut: Math.abs((txRows ?? [])
        .filter((x: Record<string, unknown>) => String(x.source) === 'banca'
          && String(x.kind) === 'finanziamento' && num(x.amount) < 0
          && String(x.booked_on).slice(0, 7) === mm.slice(0, 7))
        .reduce((s: number, x: Record<string, unknown>) => s + num(x.amount), 0)),
      /* §291 — chi prende cosa. Le persone escono dal piano compensi, non le
         ricalcola la pagina: `perPartner` e `salesByOwner` sono la sorgente
         canonica, e un secondo calcolo darebbe due numeri con lo stesso nome.
         `paid` guarda la spunta di `pl_payouts`, che è l'unico numero che un
         bonifico può confermare. */
      people: [
        ...mat.partners.map(x => ({
          who: x.who, kind: 'socio' as const, amount: r2(x.amount),
          paid: paidOfPerson(payoutRows ?? [], x.who, 'socio', mm),
        })),
        ...mat.sales.map(x => ({
          who: x.who, kind: 'commerciale' as const, amount: r2(x.amount),
          paid: paidOfPerson(payoutRows ?? [], x.who, 'commerciale', mm),
        })),
      ],
    }
  })

  /* §312 — il cumulato per persona. Il maturato lo somma dai mesi (`payouts`,
     che nasce da `computeMonth`: la pagina non ricalcola percentuali, §291);
     l'erogato lo legge da **tutte** le righe spuntate di `pl_payouts`, non solo
     da quelle dei mesi in elenco — un bonifico non sa di che mese è, e filtrarlo
     per finestra darebbe a chiunque uno scoperto che non ha (§233). */
  const monthById = new Map((monthRows ?? []).map((m: { id: string; month: string }) =>
    [String(m.id), m.month.slice(0, 10)]))
  const ledger = (() => {
    type Row = {
      who: string; kind: 'socio' | 'commerciale'
      accrued: number; accruedAll: number; paid: number
      /** §233 — l'erogato **fuori** dalla finestra serve a una cosa sola: sapere
       *  se questa persona ha mai ricevuto un bonifico. */
      paidAll: number
    }
    const acc = new Map<string, Row>()
    const key = (who: string, kind: string) => `${kind}|${who.trim().toLowerCase()}`
    /* §230 — la linea del consolidato, che è **una** e vale per tutto: prima di
       quel mese i conti sono liquidati, e un cumulato che parte da sempre
       mostrerebbe ai tre soci un arretrato di mesi già pagati fuori dal tool.
       Chi non ha mai preso un euro è il caso che la linea sbaglia (§228), e lo
       dice il registro del conto economico: lì la regola è scritta una volta,
       insieme ai bonifici che la decidono. */
    const since = config.settled_from ? monthOf(String(config.settled_from)) : null
    for (const m of payouts) {
      const dentro = !since || m.month >= since
      for (const p of m.people) {
        const k = key(p.who, p.kind)
        const cur = acc.get(k) ?? { who: p.who, kind: p.kind, accrued: 0, accruedAll: 0, paid: 0, paidAll: 0 }
        acc.set(k, {
          ...cur,
          accrued: dentro ? r2(cur.accrued + p.amount) : cur.accrued,
          accruedAll: r2(cur.accruedAll + p.amount),
        })
      }
    }
    for (const r of (payoutRows ?? []) as Record<string, unknown>[]) {
      if (r.paid !== true) continue
      /* Lo stesso taglio sull'erogato: un bonifico che ha chiuso un mese
         liquidato non può chiudere due volte. Il mese di competenza sta in
         `month_id` — `pl_payouts` non ha una colonna `month`, e leggerne una che
         non c'è tagliava fuori **tutte** le righe: la tabella diceva «mai un
         bonifico» a chi ne aveva incassati novemila. */
      const mm = monthById.get(String(r.month_id))
      const dentro = !since || (!!mm && mm >= since)
      const who = String(r.person_label ?? '').trim()
      const kind = r.kind === 'commerciale' ? 'commerciale' as const : 'socio' as const
      if (!who) continue
      const k = key(who, kind)
      const cur = acc.get(k) ?? { who, kind, accrued: 0, accruedAll: 0, paid: 0, paidAll: 0 }
      acc.set(k, {
        ...cur,
        paid: dentro ? r2(cur.paid + num(r.amount)) : cur.paid,
        paidAll: r2(cur.paidAll + num(r.amount)),
      })
    }
    /* §228 — la liquidazione è un fatto **per persona**, non una data per tutti.
       La linea vale per chi è stato pagato: a chi non ha mai preso un euro non
       si può dire che fino a giugno è a posto, e per lui si conta da sempre.
       Senza questa riga il prospetto diceva 606 € ad Antonio Giarletta e la
       tenuta di cassa 1.821 — due numeri con lo stesso nome, che è il difetto
       che questa sezione esiste per chiudere.
       La regola sbaglia in una direzione sola, ed è quella giusta: a chi è stato
       pagato in contanti mostra uno scoperto che non ha, e si spegne registrando
       il movimento. */
    return Array.from(acc.values())
      .map(r => {
        /* §233 — e «mai un bonifico» si guarda su **tutti** i mesi, non su
           quelli dentro la linea: Walter ne ha incassati 4.640 € prima di
           luglio, e quelli hanno chiuso i mesi liquidati. Guardando la sola
           finestra risultava mai pagato, e per lui il cumulato ripartiva da
           sempre — 11.162 € invece di 6.522. La stessa frase detta a due
           situazioni opposte è peggio di nessuna frase. */
        const mai = r.paidAll <= 0.5
        return {
          who: r.who, kind: r.kind,
          accrued: mai ? r.accruedAll : r.accrued,
          paid: r.paid,
          /** da sempre invece che dal consolidato, e la tabella lo dice */
          fromAlways: mai && r.accruedAll > r.accrued + 0.5,
          /** §233 — non gli è **mai** uscito un bonifico, su nessun mese */
          never: mai,
        }
      })
      .sort((a, b) => (b.accrued - b.paid) - (a.accrued - a.paid))
  })()

  // ── §262 · il piano di cassa ──────────────────────────────────────────────

  const statusOf = new Map((monthRows ?? []).map((m: { month: string; status: string }) =>
    [m.month.slice(0, 10), m.status]))
  const openMonths = new Set(Array.from(statusOf.keys()))

  /* L'IVA: si legge su tutto l'anno perché il credito di un trimestre si riporta
     su quello dopo, e dove il modello F24 è arrivato vince sulla stima (§242). */
  const vatMonths: MonthVat[] = Array.from(openMonths).sort().map(mm => ({
    month: mm,
    debit: revenue.filter(r => r.month === mm)
      .reduce((s, r) => s + r.amount_net * r.vat_rate, 0),
    credit: costs.filter(c => c.month === mm && c.vat_applied)
      .reduce((s, c) => s + c.actual * c.vat_rate, 0),
  }))
  const vatActuals: VatActual[] = (vatActualRows ?? []).map((r: Record<string, unknown>) => ({
    quarter: { year: Number(r.year), q: Number(r.quarter) as 1 | 2 | 3 | 4 },
    toPay: num(r.to_pay),
    docRef: (r.doc_ref as string) ?? null,
    paidOn: r.paid_on ? String(r.paid_on).slice(0, 10) : null,
  }))
  const quarters = vatByQuarter(vatMonths, today, vatActuals)
  const dues = quarters.filter(q => !q.closed && q.toPay > 0)
    .map(q => ({ date: q.deadline, amount: q.toPay, label: q.label }))
  const vatNow = quarters.find(q => !q.closed && q.toPay > 0) ?? null

  /* Il saldo **reale**: aperture più i soli movimenti dell'estratto conto. Un
     `derivato` nasce da una spunta e non è passato da nessuna banca (§189). */
  const realTx = (txRows ?? []).filter((t: Record<string, unknown>) => String(t.source) === 'banca')
  const balanceAt = (from: string) => r2(opening + realTx
    .filter((t: Record<string, unknown>) => String(t.booked_on).slice(0, 10) < from)
    .reduce((s: number, t: Record<string, unknown>) => s + num(t.amount), 0))
  /* §308 — **fin dove il saldo è un fatto**: la data dell'ultimo movimento
     caricato, non oggi. Il saldo di partenza è quello della banca, e la banca
     contiene solo ciò che l'estratto conto copre: se l'ultimo scaricato si ferma
     al 20 e oggi è il 25, i cinque giorni in mezzo venivano dati per «già nel
     saldo» mentre il conto non li ha visti — e il mese chiudeva con un numero che
     nessun estratto conto avrebbe confermato. */
  const lastStatement = realTx
    .map((t: Record<string, unknown>) => String(t.booked_on).slice(0, 10))
    .sort().at(-1) ?? null

  /* §263 — il saldo **di adesso**: è il numero che si legge in Banca, e contiene
     anche i movimenti che nessuna riga giustifica. Il mese in corso parte da lì,
     non da un'apertura ricostruita dalle righe. */
  const balanceNow = r2(opening + realTx
    .reduce((s: number, t: Record<string, unknown>) => s + num(t.amount), 0))

  /* La catena parte dal mese in cui il saldo è **noto** — quello di oggi — e
     arriva al mese guardato: il saldo di ognuno è l'apertura del successivo, che
     è quello che rende la lista un previsionale e non un elenco. Un mese passato
     si legge da solo, col saldo che aveva a inizio mese. */
  const nowMonth = monthOf(today)
  const first = month <= nowMonth ? month : nowMonth
  const chainMonths: string[] = []
  for (let m2 = first; m2 <= month; m2 = shiftMonth(m2, 1)) chainMonths.push(m2)
  if (!chainMonths.length) chainMonths.push(month)
  /** In quale mese della catena cade una data: quello che è già passato è adesso. */
  const bucket = (iso: string) => {
    const m2 = monthOf(iso)
    return m2 < first ? first : m2
  }

  const cashLines = [
    ...revenue.map(l => ({
      id: l.id, side: 'entrata' as const, label: l.label,
      who: l.client_id ? nameOfClient.get(l.client_id) ?? null : null,
      gross: r2(l.amount_net * (1 + l.vat_rate)),
      due: dueOf(fromRevenue(l, l.month), ctx), month: l.month,
      paid: l.paid, paidOn: l.paid_on ?? null,
    })),
    ...costs.filter(c => c.actual > 0 || c.budget > 0).map(c => ({
      id: c.id, side: 'uscita' as const, label: c.label, who: c.category || null,
      gross: r2((c.actual > 0 ? c.actual : c.budget) * (c.vat_applied ? 1 + c.vat_rate : 1)),
      due: dueOf(fromCost(c, c.month), ctx), month: c.month,
      paid: c.paid, paidOn: c.paid_on ?? null,
      external: !!c.project_id, payroll: isPayrollCenter(c.category),
    })),
  ]

  /* §225 — il costo del lavoro di questo mese: è la stima per i mesi che nessuno
     ha ancora aperto, perché il piano dei costi non contiene l'area Personale. */
  const payrollNow = r2(costs.filter(c => c.month === nowMonth && isPayrollCenter(c.category))
    .reduce((s, c) => s + (c.actual > 0 ? c.actual : c.budget), 0))

  const streams = (streamRows ?? []) as unknown as RevenueStream[]
  const installments = (instRows ?? []) as unknown as Installment[]
  const items = ((itemRows ?? []) as unknown as CostItem[]).filter(i => i.is_active)
  /* §308/§184 — l'area del costo del lavoro, per id: le sue voci a piano non
     entrano nel piano di cassa, perché quelle righe le scrive l'organico. */
  const payrollCenters = new Set(((centerRows ?? []) as { id: string; name: string }[])
    .filter(c => isPayrollCenter(c.name)).map(c => c.id))

  /* Le righe che un mese **avrebbe** se lo si aprisse adesso: servono due volte,
     per le voci del piano di cassa e per sapere quanto matureranno i compensi.
     Non si scrivono da nessuna parte — è una lettura. */
  const plannedRev = (mm: string): RevenueLine[] =>
    linesForMonth(streams, installments, mm).map((l, k) => ({
      id: `${mm}:rev:${k}`, label: l.label, client_id: l.client_id,
      plan_amount: 0, invoices: 0, amount_net: l.amount_net, vat_rate: l.vat_rate,
      invoice_sent: false, paid: false, kind: l.kind,
      sales_owner_id: l.sales_owner_id, sales_owner: null,
      client_sales_owner: l.client_id ? ownerOfClient.get(l.client_id) ?? null : null,
      project_id: l.project_id, pass_through: l.pass_through, risk_fund: false,
    }))
  const plannedCost = (mm: string): CostLine[] =>
    plannedForMonth(items, mm).map((it, k) => ({
      id: `${mm}:cost:${k}`, center_id: it.center_id, cost_item_id: it.id,
      project_id: it.project_id ?? null, partner_id: null, deductible_pct: 1,
      category: it.category, label: it.label, cost_type: it.cost_type,
      budget: it.amount, actual: 0, paid: false,
      vat_applied: it.vat_applied, vat_rate: it.vat_rate,
    }))

  /* §227 — quanto matura un mese in compensi. Per un mese aperto lo dicono le
     righe; per uno mai aperto lo stesso motore sulle righe che il contratto e il
     piano producono — altrimenti dal primo mese non registrato in poi i compensi
     sparirebbero dal previsionale, e sono la seconda uscita del mese. */
  const maturatoOf = (mm: string) => maturato.get(mm)
    ?? (() => {
      const t = computeMonth(plannedRev(mm), plannedCost(mm), config, partners)
      return {
        partners: t.perPartner.map(x => ({ who: x.partner.label, amount: x.total })),
        sales: t.salesByOwner.map(x => ({ who: x.label, amount: x.amount })),
      }
    })()

  /* §286 — quello che si **eroga** non è quello che matura: è quello che è
     maturato in quel mese ed è rientrato entro il giorno dell'erogazione. La
     cassa deve aspettarsi il secondo, o il modello promette un bonifico che
     non si farà — e lo promette proprio nei mesi in cui i clienti sono in
     ritardo, cioè quando sbagliarlo costa di più.
     Per un mese **mai aperto** non ci sono spunte da guardare e non c'è un
     incasso da verificare: lì l'unica stima possibile resta il maturato, e il
     ripiego è il calcolo di prima. */
  const payoutDateOf = (mm: string) => {
    const row = (monthRows ?? []).find((m: Record<string, unknown>) =>
      String(m.month).slice(0, 10) === mm)
    return row?.payout_date ? String(row.payout_date).slice(0, 10) : null
  }
  const erogabileOf = (mm: string) => {
    if (!maturato.has(mm)) return maturatoOf(mm)
    const w = buildWindow({
      month: mm, date: payoutDateOf(mm), previousDate: payoutDateOf(shiftMonth(mm, -1)),
      day: config.payout_day, settledFrom: config.settled_from,
    })
    const presi = takenIn(withOwner, w)
    const mesi = new Set(presi.map((l: { month: string }) => l.month))
    const mc = marginCostsFor(costs, mesi, mm)
    const t = computeMonth(presi, mc, config, partners, mc,
      withOwner.filter(l => mesi.has(l.month)))
    return {
      partners: t.perPartner.map(x => ({ who: x.partner.label, amount: x.total })),
      sales: t.salesByOwner.map(x => ({ who: x.label, amount: x.amount })),
    }
  }

  const plan: PlanMonth[] = chainMonths.map(mm => {
    const open = openMonths.has(mm)
    /* Un mese aperto si legge dalle righe, uno mai aperto dal contratto e dal
       piano: sommarli conterebbe due volte lo stesso canone. */
    const contratti = open ? [] : plannedRev(mm).map(l => ({
      id: l.id, side: 'entrata' as const, label: l.label,
      who: l.client_id ? nameOfClient.get(l.client_id) ?? null : null,
      gross: r2(l.amount_net * (1 + l.vat_rate)),
      due: dueOf({ id: l.id, side: 'entrata', month: mm, amount: l.amount_net, paid: false }),
    }))
    /* §308 — **le spese ricorrenti entrano anche in un mese aperto**, ma solo
       quelle che nessuna riga rappresenta già. «Un mese aperto si legge dalle
       righe» (§262) proteggeva dal doppio conteggio e buttava via il resto: una
       voce a piano che nessuno ha portato nel mese non compariva da nessuna
       parte, e la cassa del mese risultava più leggera del vero. Il legame è
       `cost_item_id`, che la riga porta da quando nasce dal piano. */
    const mancanti = open
      ? plannedNotYetInMonth(items, mm, costs.filter(c => c.month === mm), payrollCenters)
      : plannedForMonth(items, mm)
    const piano = mancanti.map((it: CostItem, k: number) => ({
      id: `${mm}:cost:${k}`, side: 'uscita' as const, label: it.label,
      who: it.supplier ?? it.category ?? null,
      gross: r2(it.amount * (it.vat_applied ? 1 + it.vat_rate : 1)),
      due: dueOf({
        id: '', side: 'uscita', month: mm, amount: it.amount, paid: false,
        category: it.category, project_id: it.project_id ?? null,
      }, ctx),
      external: !!it.project_id,
    }))

    /* I compensi attesi in questo mese. Se il mese è stato preparato (§243) le
       righe esistono e dicono anche a chi e per quale dei due lavori; se no si
       ripiega sul **maturato del mese prima**, che è la stessa regola con cui
       quelle righe verrebbero create: matura in un mese, esce in quello dopo. */
    const materializzati = (payoutRows ?? []).filter((x: Record<string, unknown>) =>
      String(x.due_month ?? '').slice(0, 10) === mm && x.paid !== true)
    const prev = erogabileOf(shiftMonth(mm, -1))
    const compensi = materializzati.length
      ? materializzati.map((x: Record<string, unknown>) => ({
          key: String(x.id), who: String(x.person_label ?? ''),
          kind: (x.kind === 'commerciale' ? 'commerciale' : 'socio') as 'socio' | 'commerciale',
          amount: num(x.amount), from: shiftMonth(mm, -1),
        }))
      : [
          ...(prev?.partners ?? []).map(p => ({
            key: `p:${p.who}`, who: p.who, kind: 'socio' as const, amount: r2(p.amount),
            from: shiftMonth(mm, -1),
          })),
          ...(prev?.sales ?? []).map(p => ({
            key: `o:${p.who}`, who: p.who, kind: 'commerciale' as const, amount: r2(p.amount),
            from: shiftMonth(mm, -1),
          })),
        ]

    return {
      month: mm,
      /* §263 — il mese in corso parte dal saldo vero di oggi; un mese passato da
         quello che aveva a inizio mese, perché lì tutto è già successo. */
      opening: mm === nowMonth ? balanceNow : balanceAt(mm),
      /* §308 — l'ancora è l'ultimo estratto conto, non oggi: è fin dove il saldo
         di partenza è davvero un fatto. */
      anchor: mm === nowMonth ? (lastStatement ?? today) : null,
      open,
      items: planMonth({
        month: mm, today, open, inBank,
        anchor: mm === nowMonth ? (lastStatement ?? today) : null,
        /* Le righe di **tutti** i mesi, ciascuna nel mese in cui la cassa la
           sente: quello del movimento se è già passata, quello della scadenza se
           no — e gli **scaduti pesano sul primo mese** della catena (§225), non
           su quello in cui erano attesi. Senza questo, lo stesso arretrato
           comparirebbe in agosto e in settembre e il modello lo conterebbe due
           volte. */
        /* §264 — si passano **tutte** le righe: quali sono di questo mese e
           quali ci si muovono soltanto lo decide il motore, che è l'unico posto
           dove quella regola deve vivere. */
        lines: cashLines,
        since: first,
        planned: [...contratti, ...piano],
        dues: dues.filter(d => bucket(d.date) === mm),
        payouts: compensi,
        /* §225 — la stima vale solo se il mese **prima** non è aperto: le
           retribuzioni escono il 20 del mese dopo, e dove quelle righe esistono
           sono già in lista. */
        payroll: openMonths.has(shiftMonth(mm, -1)) ? 0 : payrollNow,
      }),
    }
  })


  return {
    setupNeeded: false,
    months: (monthRows ?? []).map((m: { month: string; status: string }) =>
      ({ month: m.month.slice(0, 10), status: m.status })),
    payoutDates: Object.fromEntries((monthRows ?? [])
      .filter((m: Record<string, unknown>) => !!m.payout_date)
      .map((m: Record<string, unknown>) =>
        [String(m.month).slice(0, 10), String(m.payout_date).slice(0, 10)])),
    /* §272 — le righe escono **col commerciale dell'anagrafica attaccato**.
       `ownerOf` legge prima la riga e poi il cliente (§185); senza quel campo
       ogni riga risulta inbound e la provvigione si divide fra i soci — nel
       report la quota di ciascun socio saliva da 4.234,26 a 5.510,78 e le
       provvigioni nominali sparivano. Il maturato lo calcolavano già così tutte
       le altre letture: qui usciva una copia mutilata. */
    revenue: withOwner,
    costs,
    txs: (txRows ?? []).map((t: Record<string, unknown>) => ({
      booked_on: String(t.booked_on).slice(0, 10), amount: num(t.amount),
      source: String(t.source), kind: String(t.kind ?? 'altro'),
    })),
    payouts,
    opening, bankReady: !bankErr,
    collection: Array.from(ctxIndex.entries()),
    first: (monthRows ?? [])[0]?.month?.slice(0, 10) ?? month,
    plan,
    vatHeld: vatNow?.toPay ?? 0,
    vatLabel: vatNow?.label ?? '',
    vatDeadline: vatNow?.deadline ?? null,
    /* §265 — i movimenti **veri** del mese guardato: entrato, uscito, e il saldo
       di adesso. Erano due sezioni a parte che calcolavano il saldo sulla sola
       finestra del prospetto e dicevano «0 €» di apertura: due numeri con lo
       stesso nome. Ora stanno dove c'è il saldo vero. */
    /* §312 — il conto del mese, **come l'ha visto la banca**: apertura, entrato,
       uscito, chiusura. È la prima domanda del prospetto — quanto entra, quanto
       esce, quanto rimane — e l'unica risposta che non contiene niente di
       atteso: una riga non pagata non c'è, per costruzione. `closing` è
       `opening + entrato − uscito`, quindi sul mese in corso è il saldo vero
       (`balance`) e su un mese passato è quello che il conto aveva alla fine —
       che `balance` non poteva dire. */
    bankMonth: !bankErr ? {
      opening: balanceAt(month),
      inflow: r2(realTx
        .filter((t: Record<string, unknown>) => monthOf(String(t.booked_on).slice(0, 10)) === month
          && num(t.amount) > 0)
        .reduce((s: number, t: Record<string, unknown>) => s + num(t.amount), 0)),
      outflow: r2(Math.abs(realTx
        .filter((t: Record<string, unknown>) => monthOf(String(t.booked_on).slice(0, 10)) === month
          && num(t.amount) < 0)
        .reduce((s: number, t: Record<string, unknown>) => s + num(t.amount), 0))),
      lastStatement,
    } : null,
    /* §312 — i compensi **cumulativi**, per persona: quello che ha maturato su
       tutti i mesi e quello che gli è uscito. Il prospetto mostrava le quote del
       mese e taceva sul cumulato, che è la domanda che si fa davvero — «ad
       Antonio quanto dobbiamo in tutto» — e la cui risposta era 1.821 € contro i
       284 che la finestra dell'erogazione rende bonificabili adesso (§311). */
    ledger,
    /** §230 — da quale mese conta il cumulato: prima è liquidato */
    ledgerSince: config.settled_from ? monthOf(String(config.settled_from)) : null,
    bank: !bankErr ? {
      inflow: r2(realTx
        .filter((t: Record<string, unknown>) => monthOf(String(t.booked_on).slice(0, 10)) === month
          && num(t.amount) > 0)
        .reduce((s: number, t: Record<string, unknown>) => s + num(t.amount), 0)),
      outflow: r2(Math.abs(realTx
        .filter((t: Record<string, unknown>) => monthOf(String(t.booked_on).slice(0, 10)) === month
          && num(t.amount) < 0)
        .reduce((s: number, t: Record<string, unknown>) => s + num(t.amount), 0))),
      balance: balanceNow,
    } : null,
    /* §262 — il selettore del mese arriva fino a sei mesi avanti: oltre, il
       previsionale è fatto di contratti che nessuno ha ancora firmato. */
    horizon: Array.from(new Set([
      ...Array.from(openMonths),
      ...Array.from({ length: 7 }, (_, k) => shiftMonth(nowMonth, k)),
    ])).sort(),
    config, partners,
    status: statusOf.get(month) ?? null,
  }
}
