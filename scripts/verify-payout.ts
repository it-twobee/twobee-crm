/**
 * §286 — L'erogazione di un mese, letta dal database e passata al motore vero.
 *
 *   npx tsx scripts/verify-payout.ts 2026-07-01
 *   npx tsx scripts/verify-payout.ts 2026-07-01 --date 2026-08-13
 *
 * Risponde alla domanda che si fa il giorno del bonifico: **quanto va a
 * ciascuno, e da cosa viene**. Riga per riga dice cosa è entrato nella finestra
 * e cosa no — incassato dopo, ancora scoperto, già distribuito il mese scorso —
 * perché un totale senza il suo elenco non si può contestare, e un compenso che
 * nessuno può contestare è un compenso di cui nessuno si fida.
 *
 * Sola lettura: non scrive niente.
 */
import { readFileSync } from 'fs'
import {
  computeMonth, rowToPlConfig, shiftMonth, monthLabel,
  type RevenueLine, type CostLine, type Partner,
} from '@/lib/pl'
import { rowContext, toRevenueLines, toCostLines } from '@/lib/pl-rows'
import {
  buildWindow, placeAll, takenIn, marginCostsFor, windowSummary,
  VERDICT_LABEL, TAKEN,
} from '@/lib/payout-window'
import { mergePeople, certify, CERT_LABEL, type CertLine, type CertTx } from '@/lib/cash-certify'

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

const eur = (n: number) =>
  `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const first = (m: string) => `${String(m).slice(0, 7)}-01`
const gg = (iso: string) => iso.split('-').reverse().join('/')
type Row = Record<string, unknown>

async function main() {
  const month = first(process.argv[2] ?? '2026-07-01')
  const iDate = process.argv.indexOf('--date')
  const override = iDate > 0 ? process.argv[iDate + 1] : null

  const [months, cfgRows, partnerRows, clients, streams, bridge] = await Promise.all([
    get<Row[]>('pl_months?select=*&order=month'),
    get<Row[]>('pl_config?select=*&id=eq.true'),
    get<Row[]>('pl_partners?select=*&is_active=eq.true&order=sort_order'),
    get<Row[]>('clients?select=id,display_name,company_name,sales_owner_id,sales_owner_name'),
    get<Row[]>('revenue_streams?select=id,amount,status,project_id'),
    get<{ stream_id: string; project_id: string }[]>('revenue_stream_projects?select=stream_id,project_id'),
  ])

  const config = rowToPlConfig(cfgRows[0])
  const partners: Partner[] = partnerRows.map(p => ({
    id: String(p.id), label: String(p.label),
    takes_delivery: p.takes_delivery !== false, takes_residual: p.takes_residual !== false,
  }))

  const monthOf = new Map(months.map(m => [String(m.id), first(String(m.month))]))
  const dateOf = (m: string) => {
    const row = months.find(x => first(String(x.month)) === m)
    return row?.payout_date ? String(row.payout_date).slice(0, 10) : null
  }

  const w = buildWindow({
    month,
    date: override ?? dateOf(month),
    previousDate: dateOf(shiftMonth(month, -1)),
    day: config.payout_day,
    settledFrom: config.settled_from,
  })

  const ids = months.filter(m => !w.from || first(String(m.month)) >= w.from).map(m => String(m.id))
  const [revRows, costRows, payoutRows] = await Promise.all([
    get<Row[]>(`pl_revenue_lines?select=*&month_id=in.(${ids.join(',')})`),
    get<Row[]>(`pl_cost_lines?select=*&month_id=in.(${ids.join(',')})`),
    get<Row[]>('pl_payouts?select=*'),
  ])

  const num = (v: unknown) => Number(v ?? 0)
  const owner = new Map(clients.map(c => [String(c.id), c]))
  const clientName = (id: unknown) => {
    const c = id ? owner.get(String(id)) : null
    return c ? String(c.display_name || c.company_name) : '—'
  }

  /* §287 — un posto solo per costruire le righe: questo controllo deve vedere
     esattamente quello che vede la pagina. */
  const ctx = rowContext({
    month, months: months as unknown as { id: unknown; month: unknown }[],
    clients, streams, streamProjects: bridge,
  })
  const revenue = toRevenueLines(revRows, ctx)
    .map(r => ({ ...r, invoiceId: null as string | null }))
  const byId = new Map(revRows.map(r => [String(r.id), r]))
  for (const r of revenue) r.invoiceId = (byId.get(r.id)?.invoice_id as string) ?? null
  const costs = toCostLines(costRows, ctx)

  const taken = takenIn(revenue, w)
  const mesi = new Set(taken.map(l => l.month))
  const marginCosts = marginCostsFor(costs, mesi, month)
  const t = computeMonth(taken, marginCosts, config, partners, marginCosts,
    revenue.filter(l => mesi.has(l.month)))
  const s = windowSummary(revenue, w)

  // ── la finestra ────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(76)}`)
  console.log(`EROGAZIONE DI ${monthLabel(w.dueMonth).toUpperCase()} — matura ${monthLabel(month)}`)
  console.log('═'.repeat(76))
  console.log(`  si eroga il          ${gg(w.date)}${override ? '  (forzata da riga di comando)' : dateOf(month) ? '  (scritta sul mese)' : `  (giorno ${config.payout_day} di default)`}`)
  console.log(`  finestra incassi     ${w.since ? `dopo il ${gg(w.since)}` : 'da sempre'} → ${gg(w.date)}`)
  console.log(`  competenza           ${w.from ? `da ${monthLabel(w.from)}` : 'da sempre'} a ${monthLabel(month)}${w.from ? '   (prima è consolidato, §230)' : ''}`)

  // ── le righe, dentro e fuori ──────────────────────────────────────────────
  const placed = placeAll(revenue, w).filter(x =>
    x.verdict !== 'consolidata' && x.verdict !== 'non_matura')
  console.log(`\n${'─'.repeat(76)}\nLE RIGHE`)
  const gruppi = ['presa', 'presunta', 'scoperta', 'dopo', 'gia_erogata'] as const
  for (const v of gruppi) {
    const rows = placed.filter(x => x.verdict === v)
    if (!rows.length) continue
    const tot = rows.reduce((n, x) => n + x.line.amount_net, 0)
    console.log(`\n  ${VERDICT_LABEL[v].toUpperCase()} — ${rows.length} righe · ${eur(tot)}`)
    for (const { line } of rows.sort((a, b) => b.line.amount_net - a.line.amount_net)) {
      const ext = t.lines.find(x => x.line.id === line.id)?.s.external ?? 0
      console.log(`    ${clientName(line.client_id).slice(0, 22).padEnd(22)} `
        + `${eur(line.amount_net).padStart(12)} ${line.kind.padEnd(7)} `
        + `${line.month} ${line.paid_on ? `inc. ${line.paid_on}` : '—         '}`
        + `${ext > 0 ? `  − sub ${eur(ext)}` : ''}`)
    }
  }

  // ── la base ────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(76)}\nLA BASE`)
  console.log(`  imponibile preso     ${eur(s.taken.amount).padStart(14)}   growth ${eur(t.revenue.growth)} · digital ${eur(t.revenue.digital)}`)
  console.log(`  subappalti tolti     ${eur(t.plan.digitalExternal).padStart(14)}`)
  console.log(`  margine digital      ${eur(t.plan.digitalMargin).padStart(14)}`)
  if (t.plan.passThrough > 0) console.log(`  partite di giro      ${eur(t.plan.passThrough).padStart(14)}   fuori dalle quote (§188)`)
  if (s.assumed.n) console.log(`  ⚠ ${s.assumed.n} righe spuntate senza data: assunte dentro (§203)`)

  // ── quanto a ciascuno ─────────────────────────────────────────────────────
  const merged = mergePeople(
    t.perPartner.map(p => ({ id: p.partner.id, label: p.partner.label })),
    Array.from(new Set(t.salesByOwner.map(o => o.label))))
  const socio = (id: string | null) => t.perPartner.find(p => p.partner.id === id) ?? null
  const comm = (names: string[]) =>
    t.salesByOwner.filter(o => names.includes(o.label)).reduce((n, o) => n + o.amount, 0)

  const monthRow = months.find(m => first(String(m.month)) === month)
  const scritte = payoutRows.filter(p => String(p.month_id) === String(monthRow?.id))

  console.log(`\n${'─'.repeat(76)}\nA CIASCUNO`)
  let totale = 0
  for (const m of merged) {
    const p = socio(m.partnerId)
    const nomi = Array.from(new Set([m.label, ...m.names,
      ...t.perPartner.filter(x => x.partner.id === m.partnerId).map(x => x.partner.label)]))
    const c = Math.round(comm(nomi) * 100) / 100
    const q = Math.round((p?.total ?? 0) * 100) / 100
    if (q < 0.005 && c < 0.005) continue
    totale += q + c
    const riga = scritte.find(r => String(r.person_label) === m.label
      || (m.partnerId && String(r.person_key) === `p:${m.partnerId}`))
    console.log(`\n  ${m.label}${riga?.paid ? '   ✓ pagato ' + String(riga.paid_on ?? '').slice(0, 10) : ''}`)
    if (p) {
      console.log(`    erogato growth     ${eur(p.delivery).padStart(12)}   ${Math.round(config.growth_delivery_pct * 100)}% diviso fra i soci`)
      console.log(`    quota digital      ${eur(p.digital).padStart(12)}   sul margine dopo i subappalti`)
      if (p.salesShare > 0) console.log(`    provvigione divisa ${eur(p.salesShare).padStart(12)}   clienti senza commerciale`)
    }
    if (c > 0) console.log(`    provvigione        ${eur(c).padStart(12)}   sui clienti che ha portato`)
    console.log(`    ${'TOTALE'.padEnd(18)} ${eur(q + c).padStart(12)}`)
  }
  console.log(`\n  ${'DA EROGARE'.padEnd(20)} ${eur(totale).padStart(12)}`)

  if (scritte.length) {
    const scritto = scritte.reduce((n, r) => n + num(r.amount), 0)
    const d = Math.round((scritto - totale) * 100) / 100
    console.log(`\n  righe già preparate: ${scritte.length} per ${eur(scritto)}`
      + (Math.abs(d) < 0.02 ? '  ✓ combaciano' : `  ⚠ scarto ${eur(d)} — l'importo si copia quando si prepara (§243)`))
  } else {
    console.log('\n  nessuna riga preparata: «Genera i compensi» le scrive.')
  }

  // ── riconciliazione: banca, poi fatture ───────────────────────────────────
  const [txs, invoices] = await Promise.all([
    get<Row[]>('bank_transactions?select=id,account_id,booked_on,amount,source,kind,counterparty,description,revenue_line_id,cost_line_id'),
    get<Row[]>('invoices?select=*').catch(() => [] as Row[]),
  ])

  const certLines: CertLine[] = taken.map(l => ({
    id: l.id, side: 'entrata', month: l.month, label: l.label,
    net: l.amount_net, vatRate: l.vat_rate, paid: l.paid, paid_on: l.paid_on ?? null,
  }))
  const certs = certify(certLines, txs as unknown as CertTx[], config.settled_from)

  console.log(`\n${'─'.repeat(76)}\nRICONCILIAZIONE — l'estratto conto conferma la base?`)
  let provate = 0, dichiarate = 0
  for (const l of taken.sort((a, b) => b.amount_net - a.amount_net)) {
    const c = certs.get(l.id)
    const stato = c ? CERT_LABEL[c.state] : '—'
    if (c?.state === 'certificata' || c?.state === 'da-datare') provate += l.amount_net
    else dichiarate += l.amount_net
    console.log(`    ${clientName(l.client_id).slice(0, 22).padEnd(22)} ${eur(l.amount_net).padStart(12)}  `
      + `${stato.padEnd(32)}${c?.bookedOn ? `banca ${c.bookedOn}` : ''}`
      + `${c && c.drift ? `  · ${c.drift} gg di scarto` : ''}`)
  }
  console.log(`\n    dimostrate dall'estratto conto  ${eur(provate).padStart(14)}`)
  console.log(`    solo spuntate                   ${eur(dichiarate).padStart(14)}`
    + (dichiarate > 0 ? '   ⚠ nessun movimento le conferma (§226)' : ''))

  /* La terza fonte: l'archivio fatture. Una riga incassata dovrebbe avere una
     fattura emessa dietro — e se non ce l'ha, o la fattura non è stata
     registrata o il ricavo non è mai stato fatturato. Sono due problemi
     diversi e nessuno dei due si vede dal conto economico. */
  if (invoices.length) {
    const inv = new Map(invoices.map(i => [String(i.id), i]))
    const conFattura = taken.filter(l => l.invoiceId && inv.has(l.invoiceId))
    console.log(`\n${'─'.repeat(76)}\nLE FATTURE — ${conFattura.length} righe su ${taken.length} ne hanno una`)
    for (const l of taken.sort((a, b) => b.amount_net - a.amount_net)) {
      const i = l.invoiceId ? inv.get(l.invoiceId) : null
      const num = i ? `${String(i.number ?? '—')} del ${String(i.issued_on ?? '').slice(0, 10)}` : 'nessuna fattura collegata'
      const esclusa = i?.excluded_reason ? `  ⚠ fuori dai conti: ${String(i.excluded_reason)}` : ''
      console.log(`    ${clientName(l.client_id).slice(0, 22).padEnd(22)} ${eur(l.amount_net).padStart(12)}  ${num}${esclusa}`)
    }
  } else {
    console.log('\n    (archivio fatture vuoto o non leggibile: nessun riscontro documentale)')
  }

  // ── cosa non è entrato, e quando entrerà ─────────────────────────────────
  if (s.open.n || s.next.n) {
    console.log(`\n${'─'.repeat(76)}\nCOSA NON È ENTRATO`)
    if (s.open.n) console.log(`  ${s.open.n} righe maturate e non incassate — ${eur(s.open.amount)}: il loro compenso si eroga quando rientrano`)
    if (s.next.n) console.log(`  ${s.next.n} righe incassate dopo il ${gg(w.date)} — ${eur(s.next.amount)}: entrano nella prossima erogazione`)
  }
  console.log('')
}

main().catch(e => { console.error('\n✗', e instanceof Error ? e.message : e, '\n'); process.exit(1) })
