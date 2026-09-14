/* Verifica del foglio dell'erogazione (§334). Esegui: npx tsx lib/payout-report.check.ts */
import {
  computeMonth, DEFAULT_PL_CONFIG as C, type RevenueLine, type CostLine,
} from '@/lib/pl'
import { payoutPeople, groupRows, payoutReportHtml } from '@/lib/payout-report'
import type { PayoutWindow } from '@/lib/payout-window'

let fail = 0
const eq = (label: string, got: number, want: number) => {
  const ok = Math.abs(got - want) < 0.01
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(52)} ${got.toFixed(2).padStart(11)}  atteso ${want.toFixed(2)}`)
}
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(52)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const yes = (label: string, got: boolean) => {
  if (!got) fail++
  console.log(`${got ? 'OK ' : 'NO '} ${label}`)
}

const rev = (o: Partial<RevenueLine>): RevenueLine => ({
  id: 'r', label: 'x', client_id: null, plan_amount: 0, invoices: 1, amount_net: 0,
  vat_rate: 0.22, invoice_sent: true, paid: true, kind: 'growth',
  sales_owner_id: null, sales_owner: null, ...o,
})
const cost = (o: Partial<CostLine>): CostLine => ({
  id: 'c', category: 'x', label: 'y', cost_type: 'F', budget: 0, actual: 0,
  paid: true, vat_applied: false, vat_rate: 0.22, project_id: null, ...o,
})
const partners = [
  { id: '1', label: 'Marco', takes_delivery: true, takes_residual: true },
  { id: '2', label: 'Toto', takes_delivery: true, takes_residual: true },
  { id: '3', label: 'Walter', takes_delivery: true, takes_residual: true },
]
const w: PayoutWindow = {
  month: '2026-08-01', dueMonth: '2026-09-01', date: '2026-09-20',
  since: '2026-08-13', from: null,
}

/* Un mese che contiene tutti i casi che il foglio deve saper spiegare: un growth
   con un commerciale, un digital con subappalto, una riga senza commerciale
   (pool) e una divisa per scelta (§330). */
const lines = [
  rev({ id: 'a', client_id: 'c1', label: 'Canone growth', amount_net: 10000,
    kind: 'growth', sales_owner: 'Walter Giacobbe' }),
  rev({ id: 'b', client_id: 'c2', label: 'CRM', amount_net: 20000, kind: 'digital',
    project_id: 'p1', sales_owner: 'Walter Giacobbe', sales_split: true }),
  rev({ id: 'd', client_id: 'c3', label: 'Canone inbound', amount_net: 4000, kind: 'growth' }),
]
const costs = [cost({ id: 's1', project_id: 'p1', category: 'Subappalto', actual: 5000 })]
const t = computeMonth(lines, costs, C, partners, costs)

console.log('\n— Chi prende cosa —')
const people = payoutPeople({ t })
is('tre soci più nessun commerciale puro', people.map(p => p.who).sort(),
  ['Marco', 'Toto', 'Walter Giacobbe'])

const walter = people.find(p => p.who === 'Walter Giacobbe')!
const marco = people.find(p => p.who === 'Marco')!
eq('Walter: provvigione del solo growth (15% di 10.000)', walter.comm, 1500)
eq('Marco: nessuna provvigione sua', marco.comm, 0)
/* §226 — socio e commerciale sono la stessa persona e un solo bonifico: se il
   foglio li separasse, chi paga farebbe due versamenti allo stesso IBAN. */
eq('Walter prende anche la quota da socio', walter.socio, marco.socio)
eq('e il suo totale è la somma delle due', walter.total, walter.socio + 1500)

console.log('\n— Ogni compenso si apre e torna (§186) —')
for (const p of people) {
  eq(`le righe di ${p.who} sommano al suo totale`,
    p.rows.reduce((n, r) => n + r.amount, 0), p.total)
}
eq('la somma delle persone è il distribuito del mese',
  people.reduce((n, p) => n + p.total, 0), t.plan.distributed)

console.log('\n— Il motivo di ogni riga —')
const g = groupRows(marco.rows)
is('raggruppate per motivo, nell\'ordine di lettura', g.map(x => x.reason),
  ['erogato', 'digital', 'provvigione-condivisa', 'provvigione-divisa'])
eq('e ogni gruppo somma le sue righe',
  g.reduce((n, x) => n + x.total, 0), marco.total)
/* §330 — le due divisioni sono lo stesso denaro e due fatti diversi: chi legge
   il foglio per correggere qualcosa deve poterle distinguere. */
const divisa = g.find(x => x.reason === 'provvigione-divisa')!
const condivisa = g.find(x => x.reason === 'provvigione-condivisa')!
eq('il cliente senza commerciale: 5% di 4.000 a testa', divisa.total, 200)
/* 20.000 meno 5.000 di subappalto fa 15.000 di margine: il 6% è 900, e diviso
   fra tre soci fa 300 a testa. La base è il margine, non il ricavo (§186). */
eq('la riga divisa per scelta: 2% del margine a testa', condivisa.total, 300)

console.log('\n— Quello che è già uscito non si versa due volte (§191) —')
const conSpesa = computeMonth(lines, [...costs,
  cost({ id: 'x1', partner_id: '1', category: 'Rappresentanza', actual: 400, budget: 400 })],
  C, partners, costs)
const p2 = payoutPeople({ t: conSpesa }).find(x => x.who === 'Marco')!
eq('maturato invariato', p2.total, marco.total)
eq('già uscito dal sottoconto', p2.spent, 400)
eq('da versare: il resto', p2.cash, p2.total - 400)

console.log('\n— Chi è già stato pagato lo dice —')
const [pagato] = payoutPeople({
  t,
  lines: [{ personKey: 'p:1', personLabel: 'Marco', kind: 'socio', amount: 1,
    paid: true, paidOn: '2026-09-20' }],
}).filter(x => x.who === 'Marco')
is('la riga pagata si riconosce per nome', [pagato.paid, pagato.paidOn], [true, '2026-09-20'])

console.log('\n— Il documento —')
const html = payoutReportHtml({
  month: '2026-08-01', today: '2026-09-14', w, t, config: C,
  clientNames: { c1: 'Affinity', c2: 'Seven', c3: 'Josè Restaurant' },
  open: { n: 2, amount: 12200, rows: [
    { label: 'Canone growth', clientId: 'c1', month: '2026-07-01', amount: 3600 },
    { label: 'CRM', clientId: 'c2', month: '2026-08-01', amount: 8600 },
    { label: 'Budget ads anticipato', clientId: 'c3', month: '2026-08-01',
      amount: 500, passThrough: true },
  ] },
})
yes('è un HTML autonomo, senza asset esterni',
  html.startsWith('<!doctype html>') && !/<(script|link)\b/i.test(html))
yes('porta il mese e la data di erogazione', html.includes('Agosto 2026') && html.includes('20 settembre'))
yes('nomina i clienti, non gli id', html.includes('Affinity') && !html.includes('>c1<'))
yes('dichiara cosa è rimasto fuori dalla finestra', html.includes('12.200,00 €'))
/* §335 — la base è l'incassato, e il foglio lo dice con quella parola: «maturato»
   accanto a un numero già in cassa fa credere l'opposto di quello che è. */
yes('la base si chiama col suo nome', html.includes('fatture incassate') && !html.includes('>Maturato<'))
/* Un compenso più basso del previsto ha sempre una ragione, e la domanda è
   «quale cliente non ha pagato»: il totale senza nomi la manda altrove. */
yes('e quello che slitta porta i nomi, non solo il totale',
  html.includes('Affinity') && html.includes('8.600,00 €'))
/* §188 — una partita di giro entra in cassa e non genera nessuna quota: dirla
   fra «il compenso si eroga quando il cliente paga» promette soldi che non ci
   sono. Il foglio la marca e dice il compenso vero in gioco. */
yes('la partita di giro è marcata, e il compenso in gioco è al netto',
  html.includes('partita di giro · nessuna quota') && html.includes('è 12.200,00 €'))
yes('spiega le due divisioni con parole diverse',
  html.includes('cliente senza commerciale') && html.includes('divisa per scelta'))
/* Il foglio si stampa: se una persona si spezza fra due fogli, chi riceve la
   seconda metà non sa che c'era una prima metà. */
yes('tiene ogni persona su una pagina sola', html.includes('page-break-inside: avoid'))
/* §334 — le percentuali si leggono in colonna: un decimale che compare su una
   riga sola («28.0%» accanto a «15%») si legge come una precisione voluta. */
yes('nessun decimale finto sulle percentuali', !/>\d+\.0%</.test(html))
/* La finestra attraversa due mesi: due canoni uguali dello stesso cliente
   stanno uno sotto l'altro, e senza il mese sembrano una riga scritta due volte. */
const dueMesi = computeMonth([
  rev({ id: 'g', client_id: 'c1', label: 'Canone', amount_net: 1800, kind: 'growth', month: '2026-07-01' }),
  rev({ id: 'h', client_id: 'c1', label: 'Canone', amount_net: 1800, kind: 'growth', month: '2026-08-01' }),
], [], C, partners)
const h2 = payoutReportHtml({
  month: '2026-08-01', today: '2026-09-14', w, t: dueMesi, config: C,
  clientNames: { c1: 'Affinity' },
})
yes('la riga di un altro mese porta scritto quale', h2.includes('luglio 2026'))
yes('e quella del mese guardato no', !h2.includes('agosto 2026<'))

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
