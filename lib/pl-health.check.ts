import { computeMonth, DEFAULT_PL_CONFIG as C, type RevenueLine, type CostLine } from '@/lib/pl'
import { diagnose, healthScore } from '@/lib/pl-health'

let fail = 0
const has = (l: string, ids: string[], want: string) => {
  const ok = ids.includes(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${l.padEnd(50)} ${ids.join(', ') || '(nessuna)'}`)
}
const none = (l: string, ids: string[], unwanted: string) => {
  const ok = !ids.includes(unwanted)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${l.padEnd(50)} ${ids.join(', ') || '(nessuna)'}`)
}
const rev = (o: Partial<RevenueLine>): RevenueLine => ({
  id: Math.random().toString(), label: 'x', client_id: null, plan_amount: 0, invoices: 1,
  amount_net: 0, vat_rate: 0.22, invoice_sent: true, paid: true, kind: 'growth',
  sales_owner_id: 'u1', sales_owner: 'Walter', ...o,
})
const cost = (o: Partial<CostLine>): CostLine => ({
  id: Math.random().toString(), category: 'Overhead', label: 'y', cost_type: 'F',
  budget: 0, actual: 0, paid: true, vat_applied: false, vat_rate: 0.22, ...o,
})
const P = [{ id: '1', label: 'Marco', takes_delivery: true, takes_residual: true }]
const ids = (r: RevenueLine[], c: CostLine[], prev?: { accrued: number; costs: number }) =>
  diagnose(computeMonth(r, c, C, P), r, c, C, prev).map(f => f.id)

console.log('— Mese sano —')
// quattro clienti al 25%: nessuno sopra la soglia di concentrazione
const sane = [rev({ client_id: 'a', amount_net: 3000 }), rev({ client_id: 'b', amount_net: 3000 }),
              rev({ client_id: 'c', amount_net: 3000 }), rev({ client_id: 'd', amount_net: 3000 })]
has('costi sotto target segnalati come buoni', ids(sane, [cost({ actual: 3000, budget: 3000 })]), 'cost-ok')
none('nessuna concentrazione', ids(sane, [cost({ actual: 3000 })]), 'concentration')

console.log('\n— Costi fuori controllo —')
has('sforo forte = critico', ids(sane, [cost({ actual: 7000, budget: 7000 })]), 'cost-hard')
has('sforo lieve = attenzione', ids(sane, [cost({ actual: 5000, budget: 5000 })]), 'cost-soft')

console.log('\n— Dipendenza da un cliente —')
has('un cliente al 70% è critico',
  ids([rev({ client_id: 'a', amount_net: 7000 }), rev({ client_id: 'b', amount_net: 3000 })], [cost({ actual: 3000 })]),
  'concentration-hard')

console.log('\n— Cassa —')
has('non incassato oltre soglia',
  ids([rev({ client_id: 'a', amount_net: 10000, paid: false })], [cost({ actual: 3000 })]), 'unpaid-hard')

console.log('\n— Costo del lavoro —')
has('HR sopra il 45% delle entrate',
  ids(sane, [cost({ category: 'HR', label: 'Stipendi', actual: 6000 })]), 'hr')

console.log('\n— Andamento —')
has('calo oltre il 15%', ids(sane, [cost({ actual: 3000 })], { accrued: 20000, costs: 3000 }), 'drop')
has('crescita oltre il 15%', ids(sane, [cost({ actual: 3000 })], { accrued: 9000, costs: 3000 }), 'growth')

console.log('\n— Righe incomplete —')
has('riga senza commerciale = provvigione divisa, non errore',
  ids([rev({ client_id: 'a', amount_net: 5000, sales_owner_id: null, sales_owner: null })], [cost({ actual: 1500 })]),
  'inbound')
has('voce di costo a zero con preventivato',
  ids(sane, [cost({ actual: 3000 }), cost({ label: 'Tool', budget: 200, actual: 0 })]), 'cost-empty')

console.log('\n— Mese vuoto —')
has('nessuna entrata', ids([], []), 'no-revenue')

console.log('\n— Voto sintetico —')
const fSane = diagnose(computeMonth(sane, [cost({ actual: 3000 })], C, P), sane, [cost({ actual: 3000 })], C)
const s1 = healthScore(fSane)
console.log(`${s1.severity === 'buono' ? 'OK ' : 'NO '} mese sano → ${s1.score} «${s1.label}»`)
if (s1.severity !== 'buono') fail++

console.log(fail === 0 ? '\nTutti i controlli passano.' : `\n${fail} falliti.`)
process.exit(fail ? 1 : 0)
