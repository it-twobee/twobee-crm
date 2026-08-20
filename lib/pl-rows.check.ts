/**
 * Gate di `lib/pl-rows.ts` — §287.
 *
 *   npx tsx lib/pl-rows.check.ts
 *
 * Il controllo che conta è il primo: **nessun campo si perde per strada**. Si
 * costruisce una riga di database con ogni colonna piena di un valore
 * riconoscibile, la si mappa, e si verifica che ogni campo dichiarato in
 * `REVENUE_FIELDS` arrivi dall'altra parte. `Record<keyof RevenueLine, true>`
 * garantisce che l'elenco sia completo (aggiungere un campo al motore non
 * compila finché non lo si dichiara); questo gate garantisce che l'elenco sia
 * **vero** — che il mapper lo porti davvero, e non solo lo prometta.
 *
 * È la difesa contro l'unico difetto che questo modulo esiste per chiudere: una
 * copia mutilata delle righe dà numeri **plausibili e sbagliati**, e nessuno va
 * a controllare un numero plausibile.
 */
import { computeMonth, DEFAULT_PL_CONFIG, type Partner } from './pl'
import {
  rowContext, emptyCtx, toRevenueLine, toCostLine, toRevenueLines, toCostLines,
  REVENUE_FIELDS, COST_FIELDS,
} from './pl-rows'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}
const near = (label: string, got: number, want: number, tol = 0.011) => {
  if (Math.abs(got - want) <= tol) { ok++; return }
  fails.push(`${label}\n    atteso: ${want}\n    ottenuto: ${got}`)
}

// ── il contesto ──────────────────────────────────────────────────────────────

const ctx = rowContext({
  month: '2026-08-01',
  months: [{ id: 'm7', month: '2026-07-01' }, { id: 'm8', month: '2026-08-01' }],
  clients: [{ id: 'c1', sales_owner_id: 'u1', sales_owner_name: 'Walter Giacobbe' }],
  streams: [
    { id: 's-seven', amount: 45000, status: 'attivo', project_id: 'p-seven' },
    { id: 's-multi', amount: 6500, status: 'attivo', project_id: 'p-a' },
    { id: 's-bozza', amount: 90000, status: 'bozza', project_id: 'p-seven' },
  ],
  streamProjects: [
    { stream_id: 's-multi', project_id: 'p-a' },
    { stream_id: 's-multi', project_id: 'p-b' },
    { stream_id: 's-multi', project_id: 'p-c' },
  ],
})

eq('il mese viene da pl_months, non dalla riga', ctx.monthOf.get('m7'), '2026-07-01')
eq('una quotazione in bozza non fa valore venduto (§186)', ctx.soldOf.get('p-seven'), 45000)

// ── nessun campo si perde ────────────────────────────────────────────────────

/** Una riga con **ogni** colonna piena: quello che manca si vede subito. */
const rigaPiena = {
  id: 'r1', month_id: 'm7', label: 'Seven — Rata 1 di 6', client_id: 'c1',
  plan_amount: '6500', invoices: '1', amount_net: '6500', vat_rate: '0.22',
  invoice_sent: true, paid: true, kind: 'digital',
  sales_owner_id: null, sales_owner: null, sales_origin: 'diretto',
  origin: 'contratto', project_id: 'p-seven', stream_id: 's-seven',
  installment_id: 'i-r1', risk_fund: true, pass_through: false,
  paid_on: '2026-08-07T00:00:00+00:00', due_date: '2026-08-15', terms: 'giorni_15',
}
const mappata = toRevenueLine(rigaPiena, ctx) as unknown as Record<string, unknown>
const mancanti = Object.keys(REVENUE_FIELDS).filter(k => !(k in mappata))
eq('ogni campo dichiarato arriva dall\'altra parte', mancanti, [])

eq('id', mappata.id, 'r1')
eq('il mese non è quello della riga: è quello del suo pl_month', mappata.month, '2026-07-01')
eq('gli importi diventano numeri, non stringhe', mappata.amount_net, 6500)
eq('il tipo si normalizza', mappata.kind, 'digital')
eq('il commerciale arriva dall\'anagrafica quando la riga non ne porta uno (§185)',
  [mappata.client_sales_owner_id, mappata.client_sales_owner], ['u1', 'Walter Giacobbe'])
eq('la rata che la finanzia (§285)', mappata.installment_id, 'i-r1')
eq('il valore venduto del progetto (§186)', mappata.project_value, 45000)
eq('il fondo rischio è una scelta della riga', mappata.risk_fund, true)
eq('la data del movimento perde l\'ora: è un giorno, non un istante',
  mappata.paid_on, '2026-08-07')
eq('l\'accordo di pagamento', mappata.terms, 'giorni_15')

/* §207/§188 — un accordo su più lavori: la riga non porta un progetto, ma li
   conosce tutti, o il margine digital distribuirebbe un ricavo di cui una parte
   è già del fornitore. */
const multi = toRevenueLine(
  { id: 'r2', month_id: 'm8', label: 'Fatima — branding', amount_net: 1625,
    vat_rate: 0.22, kind: 'digital', paid: true, stream_id: 's-multi', project_id: null },
  ctx)
eq('un accordo su tre lavori li conosce tutti', multi.project_ids, ['p-a', 'p-b', 'p-c'])
eq('e la riga non ne porta nessuno (§188)', multi.project_id, null)
eq('il valore venduto è quello dei lavori coperti', multi.project_value, 6500)

// ── i costi ──────────────────────────────────────────────────────────────────

const costoPieno = {
  id: 'c1', month_id: 'm7', center_id: 'ce1', cost_item_id: 'it1',
  project_id: 'p-seven', installment_id: 'i-r1', partner_id: 'pa1',
  deductible_pct: '0.75', category: 'Subappalto', label: 'Affinity — CRM',
  cost_type: 'V', budget: '2672.22', actual: '2672.22', paid: true,
  vat_applied: true, vat_rate: '0.22',
  paid_on: '2026-08-11', due_date: '2026-08-31', terms: 'a_incasso',
}
const cm = toCostLine(costoPieno, ctx) as unknown as Record<string, unknown>
eq('nessun campo di costo si perde',
  Object.keys(COST_FIELDS).filter(k => !(k in cm)), [])
eq('la rata che questa lavorazione finanzia (§285)', cm.installment_id, 'i-r1')
eq('la deducibilità dichiarata (§191)', cm.deductible_pct, 0.75)
eq('il socio che l\'ha spesa dal suo sottoconto', cm.partner_id, 'pa1')
eq('e il mese è quello del suo pl_month', cm.month, '2026-07-01')

/* Un valore assente non diventa zero: `deductible_pct` nullo significa
   «interamente deducibile», e uno zero al suo posto direbbe il contrario. */
eq('deducibilità assente = intera, non zero',
  toCostLine({ id: 'c2', category: 'x', label: 'y' }, emptyCtx('2026-08-01')).deductible_pct, 1)
eq('senza pl_months si cade sul mese del contesto',
  toCostLine({ id: 'c3', category: 'x', label: 'y' }, emptyCtx('2026-08-01')).month, '2026-08-01')

// ── il difetto che il modulo esiste per chiudere ─────────────────────────────

/* §272/§287 — la prova sul caso vero. Le stesse righe passate al motore due
   volte: una col contesto intero, una con un contesto **vuoto**, che è quello
   che ogni copia mutilata aveva di fatto. La differenza non è un errore
   visibile: è un numero credibile e sbagliato. */
const soci: Partner[] = ['Marco', 'Toto', 'Walter'].map((label, n) =>
  ({ id: `p${n}`, label, takes_delivery: true, takes_residual: true }))

const righeSeven = [
  { id: 'a', month_id: 'm7', label: 'Seven — acconto', amount_net: 6000, vat_rate: 0.22,
    kind: 'digital', paid: true, paid_on: '2026-07-15', stream_id: 's-seven',
    project_id: 'p-seven', installment_id: 'i-acc', risk_fund: true, client_id: 'c1' },
  { id: 'b', month_id: 'm7', label: 'Seven — rata 1', amount_net: 6500, vat_rate: 0.22,
    kind: 'digital', paid: true, paid_on: '2026-08-07', stream_id: 's-seven',
    project_id: 'p-seven', installment_id: 'i-r1', risk_fund: true, client_id: 'c1' },
]
const costiSeven = [
  { id: 'x', month_id: 'm7', category: 'Subappalto', label: 'sub acconto', project_id: 'p-seven',
    installment_id: 'i-acc', budget: 2459.33, actual: 2459.33, cost_type: 'V', vat_applied: true, vat_rate: 0.22 },
  { id: 'y', month_id: 'm7', category: 'Subappalto', label: 'sub rata 1', project_id: 'p-seven',
    installment_id: 'i-r1', budget: 2672.22, actual: 2672.22, cost_type: 'V', vat_applied: true, vat_rate: 0.22 },
]

const intero = computeMonth(
  toRevenueLines(righeSeven, ctx), toCostLines(costiSeven, ctx), DEFAULT_PL_CONFIG, soci)
near('col contesto intero il fondo rischio si applica: 25% a socio',
  intero.plan.digitalPerPartner, 1842.12)
eq('e la riga lo dichiara eleggibile', intero.lines.every(l => l.s.riskEligible), true)

const vuoto = emptyCtx('2026-07-01')
const mutilato = computeMonth(
  toRevenueLines(righeSeven, vuoto), toCostLines(costiSeven, vuoto), DEFAULT_PL_CONFIG, soci)
near('senza il valore venduto sale al 28%: 221,05 € a socio di troppo',
  mutilato.plan.digitalPerPartner, 2063.17)
eq('ed è un numero credibile — nessuno andrebbe a controllarlo',
  mutilato.plan.digitalPerPartner > intero.plan.digitalPerPartner, true)

/* La stessa prova sul commerciale: senza l'anagrafica la provvigione non
   sparisce, cambia **tasca** — da Walter ai tre soci in parti uguali (§185). */
eq('col contesto la provvigione ha un destinatario',
  intero.salesByOwner.map(s => s.label), ['Walter Giacobbe'])
eq('senza, la riga si legge come inbound e si divide fra i soci',
  mutilato.salesByOwner.length, 0)
near('e finisce nel pool', mutilato.plan.salesPool, 442.11)
near('che è la stessa provvigione, presa dalla tasca sbagliata',
  intero.salesByOwner[0]?.amount ?? 0, 442.11)

if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)
