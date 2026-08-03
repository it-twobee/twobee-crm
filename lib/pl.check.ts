/* Verifica del piano compensi. Esegui: npx tsx lib/pl.check.ts */
import { computeMonth, splitLine, pct, DEFAULT_PL_CONFIG as C, type RevenueLine, type CostLine } from '@/lib/pl'

let fail = 0
const eq = (label: string, got: number, want: number) => {
  const ok = Math.abs(got - want) < 0.01
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(46)} ${got.toFixed(2).padStart(10)}  atteso ${want.toFixed(2)}`)
}
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(46)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const rev = (o: Partial<RevenueLine>): RevenueLine => ({
  id: 'r', label: 'x', client_id: null, plan_amount: 0, invoices: 1, amount_net: 0,
  vat_rate: 0.22, invoice_sent: true, paid: true, kind: 'growth',
  sales_owner_id: null, sales_owner: null, ...o,
})
const cost = (o: Partial<CostLine>): CostLine => ({
  id: 'c', category: 'x', label: 'y', cost_type: 'F', budget: 0, actual: 0,
  paid: true, vat_applied: false, vat_rate: 0.22, ...o,
})
const partners = [
  { id: '1', label: 'Marco', takes_delivery: true, takes_residual: true },
  { id: '2', label: 'Toto', takes_delivery: true, takes_residual: true },
  { id: '3', label: 'Walter', takes_delivery: true, takes_residual: true },
]

console.log('\n— Quote da contratto —')
eq('growth: residuo', pct.residual(C, 'growth'), 0.10)
eq('digital: residuo', pct.residual(C, 'digital'), 0.49)

console.log('\n— Growth, 10.000 € imponibile —')
const g = splitLine(rev({ amount_net: 10000, kind: 'growth' }), C)
eq('commerciale 15%', g.sales, 1500)
eq('erogato 30%', g.delivery, 3000)
eq('target costi 35%', g.costTarget, 3500)
eq('fondo rischio 10%', g.riskFund, 1000)
eq('residuo 10%', g.residual, 1000)
eq('residuo ai soci (resta in cassa)', g.residualToPartners, 0)

console.log('\n— Digital, 10.000 € imponibile (§185) —')
const d = splitLine(rev({ amount_net: 10000, kind: 'digital' }), C)
eq('commerciale 6%', d.sales, 600)
eq('erogato', d.delivery, 0)
eq('ai soci 28% dell\'imponibile', d.partnersPool, 2800)
eq('alle casse TwoBee 10%', d.companyQuota, 1000)
eq('target costi 35%', d.costTarget, 3500)
eq('fondo rischio 10%', d.riskFund, 1000)
eq('residuo 49%', d.residual, 4900)
// 49 meno 28 meno 10: margine che nessuno distribuisce e resta in cassa
eq('margine non distribuito 11%', d.retained, 1100)
// le quote dichiarate più costi, rischio e margine fanno l'intero
eq('somma delle quote = imponibile',
  d.sales + d.partnersPool + d.companyQuota + d.costTarget + d.riskFund + d.retained, 10000)
// il vecchio meccanismo «percentuale del residuo» sul digital non si usa più
eq('nessun residuo da ripartire col vecchio metodo', d.residualToPartners, 0)

console.log('\n— Mese misto: growth 10.000 + digital 10.000, costi reali 2.800 —')
const m = computeMonth(
  [rev({ id: 'a', amount_net: 10000, kind: 'growth', sales_owner: 'Walter' }),
   rev({ id: 'b', amount_net: 10000, kind: 'digital', sales_owner: 'Marco' })],
  [cost({ actual: 2800, budget: 3000 })], C, partners)

eq('ricavo maturato', m.revenue.accrued, 20000)
eq('commerciale totale (1500 + 600)', m.plan.sales, 2100)
eq('erogato totale (solo growth)', m.plan.delivery, 3000)
eq('fondo rischio (10% di 20.000)', m.plan.riskFund, 2000)
eq('target costi (35% di 20.000)', m.costs.target, 7000)
eq('scostamento costi (7000 - 2800)', m.costs.variance, 4200)
eq('incidenza costi reale', m.costs.ratio * 100, 14)
eq('margine lordo (20.000 - 2.800)', m.margin.gross, 17200)

console.log('\n— Compensi per socio —')
eq('quota digital ai soci (28% di 10.000)', m.plan.digitalPartners, 2800)
eq('a testa, in parti uguali', m.plan.digitalShare, 933.33)
for (const p of m.perPartner) {
  eq(`${p.partner.label}: erogato 1.000 + digital 933,33`, p.total, 1933.33)
}
/* Cassa TwoBee: il 10% dichiarato del digital, l'11% di margine non distribuito,
   il residuo growth che non si divide, il fondo rischio e il risparmio sui costi.
   La quota dei soci NON ci deve stare: sarebbe contata due volte. */
eq('quota digital alle casse (10%)', m.plan.digitalCompany, 1000)
eq('margine digital non distribuito (11%)', m.plan.digitalRetained, 1100)
eq('trattenuto (1.000 + 1.100 digital + 1.000 growth)',
  m.margin.company - m.plan.riskFund - m.costs.variance, 3100)
eq('cassa TwoBee (3.100 + 2.000 rischio + 4.200 risparmio)', m.margin.company, 9300)
// e la somma di quello che esce dai soci e quello che resta torna al maturato
eq('quote distribuite (2.100 comm + 3.000 erogato + 2.800 digital)', m.plan.distributed, 7900)

console.log('\n— Provvigione senza commerciale: si divide fra i soci —')
const inb = computeMonth([rev({ amount_net: 10000, kind: 'growth', sales_owner: null })], [], C, partners)
eq('provvigione totale (15%)', inb.plan.sales, 1500)
eq('finita tutta nel pool da dividere', inb.plan.salesPool, 1500)
eq('quota a testa (5% di 10.000)', inb.plan.poolShare, 500)
eq('Marco: erogato 1.000 + provvigione 500', inb.perPartner[0].total, 1500)
eq('nessun commerciale in classifica', inb.salesByOwner.length, 0)

// §185 — sul digital vale la stessa regola: il 6% non resta in cassa
const inbD = computeMonth([rev({ amount_net: 10000, kind: 'digital', sales_owner: null })], [], C, partners)
eq('provvigione digital (6%)', inbD.plan.sales, 600)
eq('tutta nel pool', inbD.plan.salesPool, 600)
eq('2% a testa', inbD.plan.poolShare, 200)
eq('socio: 933,33 di digital + 200 di provvigione', inbD.perPartner[0].total, 1133.33)

console.log('\n— Il commerciale può stare solo in anagrafica (§185) —')
{
  // la riga non ha nessuno, il cliente sì: la provvigione ha un destinatario
  const fromRegistry = computeMonth(
    [rev({ amount_net: 10000, kind: 'digital', client_sales_owner: 'Annalisa' })], [], C, partners)
  eq('niente da dividere fra i soci', fromRegistry.plan.salesPool, 0)
  eq('la provvigione è sua', fromRegistry.salesByOwner[0].amount, 600)
  is('col suo nome', fromRegistry.salesByOwner[0].label, 'Annalisa')
  is('e si dichiara da dove viene', fromRegistry.salesByOwner[0].fromRegistry, true)

  // la riga vince sull'anagrafica: un mese chiuso non si riscrive da fuori
  const lineWins = computeMonth(
    [rev({ amount_net: 10000, kind: 'digital', sales_owner: 'Walter', client_sales_owner: 'Annalisa' })],
    [], C, partners)
  is('vince il commerciale scritto sulla riga', lineWins.salesByOwner[0].label, 'Walter')
  is('e non risulta preso dall\'anagrafica', lineWins.salesByOwner[0].fromRegistry, false)

  // nessuno da nessuna parte: si divide
  const nobody = computeMonth([rev({ amount_net: 10000, kind: 'digital' })], [], C, partners)
  eq('senza commerciale da nessuna parte, il 6% si divide', nobody.plan.salesPool, 600)
}

const mix = computeMonth([
  rev({ id: 'x', amount_net: 10000, kind: 'growth', sales_owner: 'Walter' }),
  rev({ id: 'y', amount_net: 10000, kind: 'growth', sales_owner: null }),
], [], C, partners)
eq('con commerciale: resta a lui', mix.salesByOwner[0].amount, 1500)
eq('senza: solo l\'altra riga nel pool', mix.plan.salesPool, 1500)
eq('quota a testa dal pool', mix.plan.poolShare, 500)

const flagged = computeMonth([
  rev({ amount_net: 10000, kind: 'growth', sales_owner: 'Walter', sales_origin: 'inbound' }),
], [], C, partners)
eq('marcata inbound: si divide anche col commerciale valorizzato', flagged.plan.salesPool, 1500)

console.log('\n— Non pagato: il compenso matura comunque —')
const np = computeMonth([rev({ amount_net: 10000, kind: 'growth', paid: false })], [], C, partners)
eq('maturato', np.revenue.accrued, 10000)
eq('incassato', np.revenue.collected, 0)
eq('da incassare', np.revenue.unpaid, 10000)
eq('erogato comunque maturato', np.plan.delivery, 3000)

console.log(fail === 0 ? '\nTutti i controlli passano.' : `\n${fail} controlli falliti.`)
process.exit(fail ? 1 : 0)
