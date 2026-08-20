/**
 * Gate di `lib/payout-window.ts` e dell'attribuzione per rata di §285.
 *
 *   npx tsx lib/payout-window.check.ts
 *
 * Il caso centrale è quello vero: **l'erogazione di agosto 2026**, anticipata al
 * 13, sulle otto righe di luglio che a quella data risultavano incassate. I
 * numeri attesi sono quelli calcolati a mano dai soci prima che il tool sapesse
 * farlo — se il motore non li ridice, è il motore a sbagliare.
 */
import { computeMonth, type RevenueLine, type CostLine, type Partner, DEFAULT_PL_CONFIG } from './pl'
import {
  buildWindow, payoutDateFor, placeLine, takenIn, marginCostsFor, windowSummary,
  DEFAULT_PAYOUT_DAY, type PayoutWindow,
} from './payout-window'

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

// ── la data ──────────────────────────────────────────────────────────────────

eq('si eroga nel mese dopo quello maturato', payoutDateFor('2026-07-01'), '2026-08-20')
eq('il giorno di default è il 20', DEFAULT_PAYOUT_DAY, 20)
eq('un giorno diverso si rispetta', payoutDateFor('2026-07-01', 10), '2026-08-10')
eq('l\'eccezione del mese vince sul giorno di default',
  payoutDateFor('2026-07-01', 20, '2026-08-13'), '2026-08-13')
eq('dicembre matura e si eroga a gennaio', payoutDateFor('2026-12-01'), '2027-01-20')
eq('oltre il 28 non si va: febbraio non ha il 30',
  payoutDateFor('2026-01-01', 31), '2026-02-28')

// ── la finestra ──────────────────────────────────────────────────────────────

const wLuglio = buildWindow({
  month: '2026-07-01', date: '2026-08-13', settledFrom: '2026-07-01',
})
eq('la finestra di luglio chiude il 13 agosto', wLuglio.date, '2026-08-13')
eq('il denaro esce ad agosto', wLuglio.dueMonth, '2026-08-01')
eq('prima erogazione dopo il consolidato: nessun limite inferiore', wLuglio.since, null)
eq('e il consolidato è il primo mese guardato', wLuglio.from, '2026-07-01')

const wAgosto = buildWindow({
  month: '2026-08-01', previousDate: '2026-08-13', settledFrom: '2026-07-01',
})
eq('la finestra di agosto parte da dove è finita quella di luglio', wAgosto.since, '2026-08-13')
eq('e chiude il 20 settembre, che è il giorno normale', wAgosto.date, '2026-09-20')

// ── dove cade una riga, e perché ─────────────────────────────────────────────

const riga = (o: Partial<RevenueLine> & { id: string }) => ({
  month: '2026-07-01', paid: true, paid_on: '2026-07-15', ...o,
})
eq('incassata dentro la finestra: presa',
  placeLine(riga({ id: 'a' }), wLuglio), 'presa')
eq('incassata il giorno stesso dell\'erogazione: dentro',
  placeLine(riga({ id: 'b', paid_on: '2026-08-13' }), wLuglio), 'presa')
eq('incassata il giorno dopo: è della prossima',
  placeLine(riga({ id: 'c', paid_on: '2026-08-14' }), wLuglio), 'dopo')
eq('non incassata: scoperta, ed è il motivo per cui a qualcuno spetta meno',
  placeLine(riga({ id: 'd', paid: false, paid_on: null }), wLuglio), 'scoperta')
eq('spuntata senza data: si assume dentro e lo si dichiara',
  placeLine(riga({ id: 'e', paid_on: null }), wLuglio), 'presunta')
eq('competenza di agosto: non matura ancora',
  placeLine(riga({ id: 'f', month: '2026-08-01' }), wLuglio), 'non_matura')
eq('competenza di giugno: consolidata (§230)',
  placeLine(riga({ id: 'g', month: '2026-06-01', paid_on: '2026-08-06' }), wLuglio), 'consolidata')
eq('nella finestra dopo, un arretrato già distribuito non torna',
  placeLine(riga({ id: 'h', paid_on: '2026-07-15' }), wAgosto), 'gia_erogata')
/* Il caso che ha rotto agosto 2026: una riga **di questo mese** incassata prima
   dell'erogazione precedente. Quell'erogazione distribuiva la competenza del
   mese prima, quindi non l'ha mai vista: è la prima volta che si può erogare.
   Tagliandola fuori spariva per sempre — la sezione mostrava zero. */
eq('ma una riga di questo mese incassata prima di quella data è la prima volta che si eroga',
  placeLine(riga({ id: 'h2', month: '2026-08-01', paid_on: '2026-08-11' }), wAgosto), 'presa')
eq('e nella finestra ancora dopo non torna una seconda volta',
  placeLine(riga({ id: 'h3', month: '2026-08-01', paid_on: '2026-08-11' }),
    buildWindow({ month: '2026-09-01', previousDate: '2026-09-20', settledFrom: '2026-07-01' })),
  'gia_erogata')
eq('e uno arrivato dopo il 13 agosto entra proprio lì',
  placeLine(riga({ id: 'i', paid_on: '2026-08-25' }), wAgosto), 'presa')

/* Le due proprietà che rendono la regola usabile per anni: ogni incasso cade in
   una finestra e in una sola. Si verifica sul caso che le rompe entrambe — una
   fattura di luglio che rientra in ritardo. */
const tardiva = riga({ id: 'x', paid_on: '2026-08-25' })
eq('niente si perde: la tardiva entra nella finestra dopo',
  [placeLine(tardiva, wLuglio), placeLine(tardiva, wAgosto)], ['dopo', 'presa'])
const puntuale = riga({ id: 'y', paid_on: '2026-08-03' })
eq('niente si conta due volte: la puntuale entra solo nella prima',
  [placeLine(puntuale, wLuglio), placeLine(puntuale, wAgosto)], ['presa', 'gia_erogata'])

// ── il caso vero: erogazione del 13 agosto 2026 su luglio ────────────────────

const P = (id: string, label: string): Partner =>
  ({ id, label, takes_delivery: true, takes_residual: true })
const soci = [P('m', 'Marco'), P('t', 'Toto'), P('w', 'Walter')]

const SEVEN = 'prj-seven', ISF = 'prj-isf', FATIMA = 'prj-fatima'
const R = (o: Partial<RevenueLine> & { id: string; label: string; amount_net: number }): RevenueLine => ({
  client_id: null, plan_amount: 0, invoices: 1, vat_rate: 0.22,
  invoice_sent: true, paid: true, kind: 'growth', sales_owner_id: null, sales_owner: null,
  month: '2026-07-01', ...o,
}) as RevenueLine

const luglio: RevenueLine[] = [
  // growth — incassate fra il 15 luglio e il 9 agosto
  R({ id: 'r1', label: 'Sartoria — canone', amount_net: 2000, paid_on: '2026-07-15', client_sales_owner: 'Walter Giacobbe' }),
  R({ id: 'r2', label: 'Josè — canone', amount_net: 1200, paid_on: '2026-07-15' }),
  R({ id: 'r3', label: 'Fatima — canone growth', amount_net: 1500, paid_on: '2026-08-09', client_sales_owner: 'Antonio Giarletta' }),
  // digital — Seven ha il fondo rischio (progetto da 45.000)
  R({ id: 'r4', label: 'Seven — acconto', amount_net: 6000, kind: 'digital', paid_on: '2026-07-15',
    project_id: SEVEN, installment_id: 'i-seven-acconto', project_value: 45000, risk_fund: true,
    client_sales_owner: 'Marco Lucci' }),
  R({ id: 'r5', label: 'Seven — rata 1 di 6', amount_net: 6500, kind: 'digital', paid_on: '2026-08-07',
    project_id: SEVEN, installment_id: 'i-seven-r1', project_value: 45000, risk_fund: true,
    client_sales_owner: 'Marco Lucci' }),
  R({ id: 'r6', label: 'ISF — 30% all\'ordine', amount_net: 3000, kind: 'digital', paid_on: '2026-07-17',
    project_id: ISF, installment_id: 'i-isf-30', project_value: 10000, client_sales_owner: 'Walter Giacobbe' }),
  R({ id: 'r7', label: 'ISF — 35% al 50%', amount_net: 3500, kind: 'digital', paid_on: '2026-08-11',
    project_id: ISF, installment_id: 'i-isf-35a', project_value: 10000, client_sales_owner: 'Walter Giacobbe' }),
  R({ id: 'r8', label: 'Fatima — branding rata 1/4', amount_net: 1625, kind: 'digital', paid_on: '2026-08-03',
    project_id: FATIMA, installment_id: 'i-fat-1', project_value: 6500, client_sales_owner: 'Antonio Giarletta' }),
  // maturate a luglio e **non** incassate: restano fuori, e si dice perché
  R({ id: 'r9', label: 'Affinity — canone', amount_net: 1800, paid: false, paid_on: null, client_sales_owner: 'Marco Lucci' }),
  R({ id: 'r10', label: 'iCura — canone', amount_net: 3600, paid: false, paid_on: null, client_sales_owner: 'Walter Giacobbe' }),
  R({ id: 'r11', label: 'Petito — fee growth', amount_net: 1000, paid: false, paid_on: null, client_sales_owner: 'Walter Giacobbe' }),
  R({ id: 'r12', label: 'Petito — budget ads', amount_net: 500, paid: false, paid_on: null, pass_through: true }),
]

const C = (o: Partial<CostLine> & { id: string; label: string; actual: number }): CostLine => ({
  category: 'Subappalto', cost_type: 'V', budget: o.actual, paid: false,
  vat_applied: true, vat_rate: 0.22, month: '2026-07-01', ...o,
}) as CostLine

const subappalti: CostLine[] = [
  C({ id: 'c1', label: 'Seven — acconto', actual: 2459.33, project_id: SEVEN, installment_id: 'i-seven-acconto' }),
  C({ id: 'c2', label: 'Seven — rata 1 di 6', actual: 2672.22, project_id: SEVEN, installment_id: 'i-seven-r1' }),
  C({ id: 'c3', label: 'ISF — 30%', actual: 2100, project_id: ISF, installment_id: 'i-isf-30' }),
  C({ id: 'c4', label: 'ISF — 35% al 50%', actual: 2450, project_id: ISF, installment_id: 'i-isf-35a' }),
  C({ id: 'c5', label: 'Fatima — grafico', actual: 650, project_id: FATIMA, installment_id: 'i-fat-1' }),
]

const prese = takenIn(luglio, wLuglio)
eq('otto righe entrano nell\'erogazione', prese.length, 8)
near('e valgono 25.325 € di imponibile', prese.reduce((s, l) => s + l.amount_net, 0), 25325)

const sommario = windowSummary(luglio, wLuglio)
eq('quattro restano scoperte', sommario.open.n, 4)
near('per 6.900 €', sommario.open.amount, 6900)
eq('nessuna spunta senza data, in questo mese', sommario.assumed.n, 0)

const mesi = new Set(prese.map(l => l.month ?? '2026-07-01'))
const costiMargine = marginCostsFor(subappalti, mesi, '2026-07-01')
eq('i subappalti del margine sono quelli di competenza, non quelli pagati',
  costiMargine.length, 5)

const t = computeMonth(prese, costiMargine, DEFAULT_PL_CONFIG, soci, costiMargine, luglio)

near('margine digital: 20.625 di rate meno 10.331,55 di fornitori',
  t.plan.digitalMargin, 10293.45)
near('growth incassato: 4.700', t.revenue.growth, 4700)
near('erogato growth 30% diviso tre: 470 a testa', t.perPartner[0].delivery, 470)
near('quota digital a socio', t.plan.digitalPerPartner, 2661.12)
near('José non ha commerciale: 180 divisi in tre', t.plan.poolShare, 60)
near('e la base comune a socio fa 3.191,12', t.perPartner[0].total, 3191.12)

const comm = (nome: string) => t.salesByOwner.find(s => s.label === nome)?.amount ?? 0
near('Walter: 300 su Sartoria più 54 e 63 su ISF', comm('Walter Giacobbe'), 417)
near('Marco: il 6% delle due rate Seven', comm('Marco Lucci'), 442.11)
near('Antonio: 225 sul growth Fatima più 58,50 sul digital', comm('Antonio Giarletta'), 283.5)
eq('la partita di giro non genera provvigione a nessuno',
  t.salesByOwner.some(s => s.rows.some(r => r.label.includes('budget ads'))), false)

/* §186 — il fondo rischio è **per riga**: Seven lo ha (progetto da 45.000, e
   l'admin l'ha scelto), ISF e Fatima no. Se la soglia si leggesse sulla rata
   invece che sul progetto, nessuna delle due Seven sarebbe eleggibile. */
const seven = t.lines.filter(x => x.line.project_id === SEVEN)
eq('sulle due righe Seven il fondo rischio è attivo', seven.map(x => x.s.riskOn), [true, true])
near('e vale il 9% del loro margine', seven.reduce((s, x) => s + x.s.riskFund, 0), 663.16)
eq('su ISF no: il progetto vale 10.000, sotto la soglia',
  t.lines.filter(x => x.line.project_id === ISF).some(x => x.s.riskOn), false)

/* §285 — la ragione per cui il legame esiste. Senza, i due subappalti Seven di
   luglio si spalmerebbero sulle due rate in proporzione all'imponibile: stesso
   totale, ma ogni riga con la base sbagliata — e basta che una sola delle due
   abbia il fondo rischio perché il totale cambi anche lui. */
const senzaLegame = computeMonth(
  prese, costiMargine.map(c => ({ ...c, installment_id: null })),
  DEFAULT_PL_CONFIG, soci,
  costiMargine.map(c => ({ ...c, installment_id: null })), luglio)
const acconto = (x: ReturnType<typeof computeMonth>) =>
  x.lines.find(l => l.line.id === 'r4')!.s.external
near('col legame l\'acconto Seven porta il suo subappalto', acconto(t), 2459.33)
near('senza, se ne prende una fetta proporzionale: 3,81 € di troppo', acconto(senzaLegame), 2463.14)
near('il totale del margine però non cambia: è la distribuzione a cambiare',
  senzaLegame.plan.digitalMargin, t.plan.digitalMargin)

/* Il denominatore della ripartizione resta il ricavo **intero** del mese. Se lo
   si prendesse dalle sole righe incassate, l'unica rata rientrata di un progetto
   si porterebbe addosso il subappalto di tutte e mostrerebbe un margine più
   basso del vero — e una quota più bassa del dovuto. */
const soloUna = prese.filter(l => l.id !== 'r7')
const sbagliato = computeMonth(
  soloUna, costiMargine.filter(c => !c.installment_id?.includes('35a')),
  DEFAULT_PL_CONFIG, soci,
  costiMargine.filter(c => !c.installment_id?.includes('35a')).map(c => ({ ...c, installment_id: null })),
  soloUna)
const giusto = computeMonth(
  soloUna, costiMargine.filter(c => !c.installment_id?.includes('35a')),
  DEFAULT_PL_CONFIG, soci,
  costiMargine.filter(c => !c.installment_id?.includes('35a')).map(c => ({ ...c, installment_id: null })),
  luglio)
const isf30 = (x: ReturnType<typeof computeMonth>) =>
  x.lines.find(l => l.line.id === 'r6')!.s.external
near('col denominatore intero la rata ISF incassata porta la sua metà', isf30(giusto), 969.23)
near('con quello ristretto se le prenderebbe tutte', isf30(sbagliato), 2100)

// ── la finestra dopo non ripaga quello che ha già pagato ─────────────────────

const preseAgosto = takenIn(luglio, wAgosto)
eq('nessuna riga di luglio torna nell\'erogazione di settembre', preseAgosto.length, 0)

const tardive: RevenueLine[] = [R({ id: 'z', label: 'Affinity — canone, rientrato tardi',
  amount_net: 1800, paid: true, paid_on: '2026-09-02' })]
eq('ma una rientrata dopo il 13 agosto sì', takenIn(tardive, wAgosto).length, 1)

// ── il consolidato chiude la coda ────────────────────────────────────────────

const wSenzaConsolidato = buildWindow({ month: '2026-07-01', date: '2026-08-13' })
eq('senza consolidato si guarda anche giugno',
  placeLine(riga({ id: 'k', month: '2026-06-01', paid_on: '2026-08-06' }), wSenzaConsolidato), 'presa')
eq('col consolidato no, quei conti sono chiusi',
  placeLine(riga({ id: 'k', month: '2026-06-01', paid_on: '2026-08-06' }), wLuglio), 'consolidata')

// ── una finestra senza date scritte cade sul giorno di default ───────────────

const wDefault: PayoutWindow = buildWindow({ month: '2026-09-01', settledFrom: '2026-07-01' })
eq('senza eccezioni, si eroga il 20 ottobre', wDefault.date, '2026-10-20')
eq('e la finestra parte dal 20 settembre', wDefault.since, '2026-09-20')

if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)
