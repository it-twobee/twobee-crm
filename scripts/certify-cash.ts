/**
 * §226 — L'estratto conto certifica il conto economico.
 *
 *   npx tsx scripts/certify-cash.ts            → legge e riporta, non scrive
 *   npx tsx scripts/certify-cash.ts --apply    → scrive le date vere
 *
 * Cosa scrive, e **solo** questo: la data del movimento sulle righe che hanno
 * già un aggancio confermato (`paid_on := bank_transactions.booked_on`), e la
 * spunta sulle righe che la banca ha pagato e nessuno aveva spuntato. Sono
 * fatti dell'estratto conto, non ipotesi.
 *
 * Cosa **non** scrive: non toglie mai una spunta perché manca il movimento.
 * L'assenza di prova non è prova dell'assenza — può essere un conto non
 * caricato, o del contante — e sbianchettare l'incasso di un cliente che ha
 * pagato davvero è un danno peggiore del dubbio. Quelle righe le riporta e le
 * conta, e in pagina restano marcate «dichiarata».
 */
import { readFileSync } from 'fs'
import {
  certify, certSummary, payoutsFromBank, payoutLedger, mergePeople,
  type Cert, type CertLine, type CertTx,
} from '@/lib/cash-certify'
import {
  monthLabel, computeMonth, rowToPlConfig, shiftMonth,
  type Partner, type RevenueLine, type CostLine,
} from '@/lib/pl'

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env.local`, 'utf8').split('\n')
    .map(l => l.match(/^([A-Z_0-9]+)=(.*)$/)).filter(Boolean)
    .map(m => [m![1], m![2].trim().replace(/^["']|["']$/g, '')]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes('--apply')

async function get<T>(p: string): Promise<T> {
  const r = await fetch(`${URL}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}
async function patch(table: string, id: string, body: Record<string, unknown>) {
  const r = await fetch(`${URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`PATCH ${table}/${id}: ${r.status} ${await r.text()}`)
}

const n = (v: unknown) => Number(v ?? 0)
const eur = (x: number) => `${x.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

async function main() {
  const [txRows, months, revRows, costRows, clients, partnerRows] = await Promise.all([
    get<Record<string, unknown>[]>('bank_transactions?select=*&limit=5000'),
    get<{ id: string; month: string; status: string }[]>('pl_months?select=*&order=month'),
    get<Record<string, unknown>[]>('pl_revenue_lines?select=*&limit=2000'),
    get<Record<string, unknown>[]>('pl_cost_lines?select=*&limit=2000'),
    get<Record<string, unknown>[]>('clients?select=id,company_name,display_name,sales_owner_name'),
    get<Record<string, unknown>[]>('pl_partners?select=*&is_active=eq.true'),
  ])

  const mById = new Map(months.map(m => [m.id, m.month]))
  const txs: CertTx[] = txRows.map(t => ({
    id: String(t.id), booked_on: String(t.booked_on).slice(0, 10), amount: n(t.amount),
    source: String(t.source), kind: String(t.kind),
    counterparty: (t.counterparty as string) ?? null, description: String(t.description),
    revenue_line_id: (t.revenue_line_id as string) ?? null,
    cost_line_id: (t.cost_line_id as string) ?? null,
  }))

  const lines: CertLine[] = [
    ...revRows.map(r => ({
      id: String(r.id), side: 'entrata' as const, month: mById.get(String(r.month_id)) ?? '',
      label: String(r.label), net: n(r.amount_net), vatRate: n(r.vat_rate),
      paid: r.paid === true, paid_on: (r.paid_on as string) ?? null,
    })),
    ...costRows.map(c => ({
      id: String(c.id), side: 'uscita' as const, month: mById.get(String(c.month_id)) ?? '',
      label: String(c.label), net: n(c.actual), vatRate: c.vat_applied ? n(c.vat_rate) : 0,
      paid: c.paid === true, paid_on: (c.paid_on as string) ?? null,
    })),
  ].filter(l => l.month)

  const cfg = rowToPlConfig((await get<Record<string, unknown>[]>('pl_config?select=*&id=eq.true'))[0])
  const argFrom = process.argv.find(a => a.startsWith('--from='))?.slice(7)
  const origin = (argFrom ?? cfg.settled_from) ? `${(argFrom ?? cfg.settled_from!).slice(0, 7)}-01` : null

  const certs = certify(lines, txs, origin)
  const byId = new Map(lines.map(l => [l.id, l]))

  console.log(`\n${APPLY ? '### APPLICO' : '### LETTURA (aggiungi --apply per scrivere)'}\n`)

  // ── mese per mese ─────────────────────────────────────────────────────────
  for (const m of months) {
    const own = lines.filter(l => l.month === m.month)
    const s = certSummary(own.map(l => certs.get(l.id)).filter(Boolean) as Cert[])
    console.log(`── ${monthLabel(m.month)} [${m.status}]`)
    console.log(`   certificate ${s.certificate} · da datare ${s.daDatare} (di cui ${s.moveMonth} cambiano mese di cassa)`
      + ` · dichiarate ${s.dichiarate} per ${eur(s.dichiarateAmount)} · smentite ${s.smentite}`
      + (s.consolidate ? ` · ${s.consolidate} consolidate` : ''))
    for (const l of own) {
      const c = certs.get(l.id)
      if (!c || c.state === 'certificata' || c.state === 'consolidata') continue
      const tag = c.state === 'da-datare' ? (c.movesMonth ? 'MESE' : 'data')
        : c.state === 'smentita' ? 'BANCA' : 'dich.'
      const move = c.bookedOn ? `${l.paid_on ?? '—'} → ${c.bookedOn}` : 'nessun movimento'
      console.log(`     ${tag.padEnd(6)} ${l.side === 'entrata' ? '+' : '−'}${eur(l.net).padStart(12)}  ${l.label.slice(0, 44).padEnd(45)} ${move}`)
    }
    console.log()
  }

  const all = certSummary(Array.from(certs.values()))
  console.log('── TOTALE')
  console.log(`   ${all.certificate} certificate · ${all.daDatare} da datare · ${all.dichiarate} dichiarate `
    + `(${eur(all.dichiarateAmount)}) · ${all.smentite} smentite`)
  console.log(`   scarto medio fra data spuntata e data vera: ${all.meanDrift} giorni`)
  console.log(`   righe che cambiano mese di cassa: ${all.moveMonth}\n`)

  /* ── compensi: quanto è uscito davvero ────────────────────────────────────
     Un socio che è anche commerciale è **una persona sola**: Walter Giacobbe
     prende l'erogato come socio e la provvigione come commerciale, e li riceve
     sullo stesso conto. Tenerli come due voci faceva due danni insieme —
     l'importo si divideva a metà, e nessuno dei due matchava il bonifico perché
     due nomi corrispondevano allo stesso movimento e l'abbinamento si rifiutava
     (giustamente) di indovinare. */
  const owners = Array.from(new Set(clients.map(c => (c.sales_owner_name as string) ?? '').filter(Boolean)))
  const people = mergePeople(
    partnerRows.map(p => ({ id: String(p.id), label: String(p.label) })), owners)


  const facts = payoutsFromBank(txs, people)

  /* Il maturato si somma su **tutti** i mesi: un bonifico non sa di che mese è,
     e confrontarlo con un mese solo darebbe a chiunque uno scoperto enorme. */
  const plPartners: Partner[] = partnerRows.map(p => ({
    id: String(p.id), label: String(p.label),
    takes_delivery: !!p.takes_delivery, takes_residual: !!p.takes_residual,
  }))
  const ownerOf = new Map(clients.map(c => [String(c.id), {
    id: null as string | null, name: (c.sales_owner_name as string) ?? null,
  }]))
  const accruals: { key: string; month: string; amount: number }[] = []
  for (const m of months) {
    const rev: RevenueLine[] = revRows.filter(r => r.month_id === m.id).map(r => ({
      id: String(r.id), label: String(r.label), client_id: (r.client_id as string) ?? null,
      plan_amount: n(r.plan_amount), invoices: n(r.invoices), amount_net: n(r.amount_net),
      vat_rate: n(r.vat_rate), invoice_sent: r.invoice_sent === true, paid: r.paid === true,
      kind: r.kind === 'digital' ? 'digital' : 'growth',
      sales_owner_id: (r.sales_owner_id as string) ?? null,
      sales_owner: (r.sales_owner as string) ?? null,
      client_sales_owner: ownerOf.get(String(r.client_id ?? ''))?.name ?? null,
      project_id: (r.project_id as string) ?? null,
      risk_fund: r.risk_fund === true, pass_through: r.pass_through === true,
    }))
    const cst: CostLine[] = costRows.filter(c => c.month_id === m.id).map(c => ({
      id: String(c.id), category: String(c.category), label: String(c.label),
      project_id: (c.project_id as string) ?? null,
      partner_id: (c.partner_id as string) ?? null,
      cost_type: c.cost_type === 'V' ? 'V' : 'F',
      budget: n(c.budget), actual: n(c.actual), paid: c.paid === true,
      vat_applied: c.vat_applied === true, vat_rate: n(c.vat_rate),
    }))
    const t = computeMonth(rev, cst, cfg, plPartners)
    for (const pp of t.perPartner) {
      const k = people.find(x => x.partnerId === pp.partner.id)?.key
      if (k) accruals.push({ key: k, month: m.month, amount: pp.total })
    }
    for (const s of t.salesByOwner) {
      const k = people.find(x => x.label === s.label)?.key
      if (k) accruals.push({ key: k, month: m.month, amount: s.amount })
    }
  }
  const ledger = payoutLedger({
    people: people.map(p => ({ key: p.key, label: p.label })), accruals, facts, from: origin,
  })

  console.log(`── COMPENSI: maturato contro uscito — da ${origin ? monthLabel(origin) : 'sempre'}`
    + (origin ? ' (pl_config.settled_from: prima è liquidato)' : ' (pl_config.settled_from non impostato)'))
  let openTot = 0
  for (const v of ledger) {
    if (v.open > 0) openTot += v.open
    const why = v.whyFrom === 'mai-pagato' ? 'da sempre (mai pagato)' : `da ${v.from ? monthLabel(v.from) : 'sempre'}`
    console.log(`   ${v.who.padEnd(26)} maturato ${eur(v.due).padStart(13)}  uscito ${eur(v.paid).padStart(13)}  resta ${eur(v.open).padStart(13)}  ${why}`)
  }
  console.log(`   ${'DA EROGARE'.padEnd(26)} ${eur(openTot).padStart(46)}`)
  console.log()

  if (!APPLY) {
    const toWrite = Array.from(certs.values()).filter(c => c.state === 'da-datare' || c.state === 'smentita')
    console.log(`Con --apply scriverei ${toWrite.length} righe: la data del movimento su quelle agganciate,`)
    console.log('e la spunta su quelle che la banca ha pagato. Nessuna spunta viene tolta.\n')
    return
  }

  // ── scrittura ─────────────────────────────────────────────────────────────
  let dated = 0, ticked = 0
  for (const c of Array.from(certs.values())) {
    const l = byId.get(c.lineId)!
    const table = l.side === 'entrata' ? 'pl_revenue_lines' : 'pl_cost_lines'
    if (c.state === 'da-datare' && c.bookedOn) {
      await patch(table, c.lineId, { paid_on: c.bookedOn })
      dated++
    } else if (c.state === 'smentita' && c.bookedOn) {
      /* Prima la spunta, poi la data: il trigger della 203 riempie `paid_on` col
         giorno di oggi appena `paid` diventa vero, e sovrascriverebbe quella
         giusta se arrivassero insieme nell'ordine sbagliato. */
      await patch(table, c.lineId, { paid: true })
      await patch(table, c.lineId, { paid_on: c.bookedOn })
      ticked++
    }
  }
  console.log(`Scritte ${dated} date e ${ticked} spunte. Nessuna spunta tolta.\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
