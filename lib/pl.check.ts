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
// §186: il margine digital si distribuisce per intero, un residuo non esiste
eq('digital: nessun residuo', pct.residual(C, 'digital'), 0)
eq('digital: ai soci con tre soci al 28%', pct.digitalPartners(C, 3), 0.84)
eq('col fondo rischio scendono a 25%', pct.digitalPartners(C, 3, true), 0.75)

console.log('\n— Growth, 10.000 € imponibile —')
const g = splitLine(rev({ amount_net: 10000, kind: 'growth' }), C)
eq('commerciale 15%', g.sales, 1500)
eq('erogato 30%', g.delivery, 3000)
eq('target costi 35%', g.costTarget, 3500)
eq('fondo rischio 10%', g.riskFund, 1000)
eq('residuo 10%', g.residual, 1000)
eq('residuo ai soci (resta in cassa)', g.residualToPartners, 0)

console.log('\n— Digital, 10.000 € di margine, tre soci (§186) —')
const d = splitLine(rev({ amount_net: 10000, kind: 'digital' }), C, { partners: 3 })
eq('commerciale 6%', d.sales, 600)
eq('a ciascun socio 28%', d.partnerQuota, 2800)
eq('ai soci in tutto (tre × 28%)', d.partnersPool, 8400)
eq('alle casse TwoBee 10%', d.companyQuota, 1000)
eq('nessun target costi: il margine è distribuito per intero', d.costTarget, 0)
eq('nessun fondo rischio senza l\'opzione', d.riskFund, 0)
// 6 + 84 + 10 = 100: non avanza niente, e se avanzasse si vedrebbe
eq('niente di non assegnato', d.retained, 0)
eq('somma delle quote = margine', d.sales + d.partnersPool + d.companyQuota, 10000)

console.log('\n— Il margine è al netto dei subappalti —')
{
  // progetto da 24.000 con 12.000 affidati fuori: si divide su 12.000
  const sub = splitLine(rev({ amount_net: 24000, kind: 'digital' }), C, { external: 12000, partners: 3 })
  eq('subappalto fuori dal margine', sub.external, 12000)
  eq('base della spartizione', sub.margin, 12000)
  eq('commerciale 6% del margine', sub.sales, 720)
  eq('a socio 28% del margine', sub.partnerQuota, 3360)
  eq('cassa 10% del margine', sub.companyQuota, 1200)
  eq('e non avanza niente', sub.retained, 0)
  // il costo esterno non può superare il ricavo: il margine si ferma a zero
  const upside = splitLine(rev({ amount_net: 5000, kind: 'digital' }), C, { external: 9000, partners: 3 })
  eq('margine mai negativo', upside.margin, 0)
  eq('nessuna quota su un margine inesistente', upside.partnerQuota, 0)
}

console.log('\n— Fondo rischio: opzionale, e solo sopra i 20.000 —')
{
  const small = rev({ amount_net: 10000, kind: 'digital', project_value: 12000, risk_fund: true })
  const sSmall = splitLine(small, C, { partners: 3 })
  eq('sotto soglia non si attiva', sSmall.riskFund, 0)
  eq('e i soci restano al 28%', sSmall.partnerQuota, 2800)

  const big = rev({ amount_net: 10000, kind: 'digital', project_value: 24000, risk_fund: true })
  const sBig = splitLine(big, C, { partners: 3 })
  eq('sopra soglia il fondo prende il 9%', sBig.riskFund, 900)
  eq('e ciascun socio scende al 25%', sBig.partnerQuota, 2500)
  eq('ai soci in tutto il 75%', sBig.partnersPool, 7500)
  eq('la cassa non cambia', sBig.companyQuota, 1000)
  eq('e il conto torna ancora', sBig.sales + sBig.partnersPool + sBig.companyQuota + sBig.riskFund, 10000)

  // sopra soglia ma non scelto: resta 28% a testa, e l'opzione si dichiara
  const off = rev({ amount_net: 10000, kind: 'digital', project_value: 24000 })
  const sOff = splitLine(off, C, { partners: 3 })
  eq('non scelto: nessun fondo', sOff.riskFund, 0)
  eq('soci al 28%', sOff.partnerQuota, 2800)
  is('ma l\'opzione è disponibile', sOff.riskEligible, true)
  is('e sotto soglia no', sSmall.riskEligible, false)
}

console.log('\n— Con un numero di soci diverso da tre le quote non tornano —')
{
  const two = splitLine(rev({ amount_net: 10000, kind: 'digital' }), C, { partners: 2 })
  eq('due soci: 56% invece dell\'84%', two.partnersPool, 5600)
  // non si riscala di nascosto: l'avanzo si mostra
  eq('e restano 2.800 non assegnati', two.retained, 2800)
  const four = splitLine(rev({ amount_net: 10000, kind: 'digital' }), C, { partners: 4 })
  eq('quattro soci: le quote sforano', four.retained, -2800)
}

console.log('\n— Mese misto: growth 10.000 + digital 10.000, costi reali 2.800 —')
const m = computeMonth(
  [rev({ id: 'a', amount_net: 10000, kind: 'growth', sales_owner: 'Walter' }),
   rev({ id: 'b', amount_net: 10000, kind: 'digital', sales_owner: 'Marco' })],
  [cost({ actual: 2800, budget: 3000 })], C, partners)
eq('margine digital senza subappalti', m.plan.digitalMargin, 10000)

eq('ricavo maturato', m.revenue.accrued, 20000)
eq('commerciale totale (1500 + 600)', m.plan.sales, 2100)
eq('erogato totale (solo growth)', m.plan.delivery, 3000)
/* §186: fondo rischio e target costi arrivano dal **solo growth** — il margine
   digital è distribuito per intero, e non ne mette. È la conseguenza voluta del
   piano nuovo: struttura e persone le copre il growth. */
eq('fondo rischio (10% dei soli 10.000 growth)', m.plan.riskFund, 1000)
eq('target costi (35% dei soli 10.000 growth)', m.costs.target, 3500)
eq('scostamento costi (3.500 - 2.800)', m.costs.variance, 700)
eq('incidenza costi reale', m.costs.ratio * 100, 14)
eq('margine lordo (20.000 - 2.800)', m.margin.gross, 17200)

console.log('\n— Compensi per socio —')
eq('a ciascun socio il 28% del margine digital', m.plan.digitalPerPartner, 2800)
eq('ai soci in tutto', m.plan.digitalPartners, 8400)
for (const p of m.perPartner) {
  eq(`${p.partner.label}: erogato 1.000 + digital 2.800`, p.total, 3800)
}
/* Cassa TwoBee: il 10% del margine digital, il residuo growth che non si divide,
   il fondo rischio (solo growth, qui) e il risparmio sui costi. La quota dei
   soci NON ci deve stare: sarebbe contata due volte. */
eq('quota digital alle casse (10%)', m.plan.digitalCompany, 1000)
eq('niente margine non assegnato', m.plan.digitalRetained, 0)
/* Il target costi arriva dal solo growth (3.500): il digital è distribuito per
   intero, quindi non ne mette. Con 2.800 di costi effettivi lo scostamento è
   +700 — e sarebbe negativo in un mese a prevalenza digital, che è il punto. */
eq('target costi: solo growth', m.costs.target, 3500)
eq('scostamento (3.500 - 2.800)', m.costs.variance, 700)
eq('fondo rischio: solo growth', m.plan.riskFund, 1000)
eq('trattenuto (1.000 digital + 1.000 growth)',
  m.margin.company - m.plan.riskFund - m.costs.variance, 2000)
eq('cassa TwoBee (2.000 + 1.000 rischio + 700 risparmio)', m.margin.company, 3700)
// quello che esce: provvigioni, erogato growth, quote digital ai soci
eq('quote distribuite (2.100 comm + 3.000 erogato + 8.400 digital)', m.plan.distributed, 13500)

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
eq('socio: 2.800 di digital + 200 di provvigione', inbD.perPartner[0].total, 3000)

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
