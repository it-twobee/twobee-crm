/* Verifica del piano compensi. Esegui: npx tsx lib/pl.check.ts */
import { computeMonth, splitLine, pct, DEFAULT_PL_CONFIG as C, type RevenueLine, type CostLine } from '@/lib/pl'

let fail = 0
const eq = (label: string, got: number, want: number) => {
  const ok = Math.abs(got - want) < 0.01
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(46)} ${got.toFixed(2).padStart(10)}  atteso ${want.toFixed(2)}`)
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

console.log('\n— Digital, 10.000 € imponibile —')
const d = splitLine(rev({ amount_net: 10000, kind: 'digital' }), C)
eq('commerciale 6%', d.sales, 600)
eq('erogato', d.delivery, 0)
eq('residuo 49%', d.residual, 4900)
eq('residuo ai soci', d.residualToPartners, 4900)

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
for (const p of m.perPartner) {
  eq(`${p.partner.label}: erogato 1.000 + residuo 1.470`, p.total, 2470)
}
eq('residuo trattenuto (490 digital + 1000 growth)', m.margin.company - m.plan.riskFund - m.costs.variance, 1490)
eq('cassa TwoBee (490 + 1000 growth + 2000 rischio + 4200 risparmio)', m.margin.company, 7690)

console.log('\n— Provvigione senza commerciale: 15% diviso in tre —')
const inb = computeMonth([rev({ amount_net: 10000, kind: 'growth', sales_owner: null })], [], C, partners)
eq('provvigione totale (15%)', inb.plan.sales, 1500)
eq('finita tutta nel pool da dividere', inb.plan.salesPool, 1500)
eq('quota a testa (5% di 10.000)', inb.plan.poolShare, 500)
eq('Marco: erogato 1.000 + provvigione 500', inb.perPartner[0].total, 1500)
eq('nessun commerciale in classifica', inb.salesByOwner.length, 0)

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
