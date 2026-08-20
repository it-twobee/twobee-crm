/**
 * Gate di `lib/pl-aggregate.ts`.
 *
 *   npx tsx lib/pl-aggregate.check.ts
 */
import { prospetto, costMacro, type ProspettoInput } from './pl-aggregate'
import type { RevenueLine, CostLine } from './pl'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}

const TODAY = '2026-08-09'
const MESI = ['2026-06-01', '2026-07-01', '2026-08-01']

const rev = (o: Partial<RevenueLine> & { month: string; amount_net: number }): RevenueLine & { month: string } => ({
  id: o.id ?? `r-${o.month}-${o.amount_net}`, label: o.label ?? 'riga', client_id: null,
  plan_amount: o.amount_net, invoices: 1, vat_rate: 0.22, invoice_sent: true, paid: false,
  kind: 'growth', sales_owner_id: null, sales_owner: null, project_id: null,
  pass_through: false, risk_fund: false, ...o,
} as RevenueLine & { month: string })

const cost = (o: Partial<CostLine> & { month: string; actual: number }): CostLine & { month: string } => ({
  id: o.id ?? `c-${o.month}-${o.actual}-${o.category ?? ''}`, center_id: null, cost_item_id: null,
  project_id: null, partner_id: null, deductible_pct: 1, category: 'Overhead', label: 'voce',
  cost_type: 'F', budget: o.actual, paid: false, vat_applied: false, vat_rate: 0.22, ...o,
} as CostLine & { month: string })

/* Luglio: due canoni growth e un digital, lo stipendio e un subappalto. Lo
   stipendio è pagato il 20 agosto — competenza luglio, cassa agosto — ed è il
   caso che questa sezione esiste per non sbagliare. */
const REVENUE = [
  rev({ month: '2026-07-01', amount_net: 1800, paid: true, paid_on: '2026-07-15' }),
  rev({ month: '2026-07-01', amount_net: 1625, kind: 'digital', paid: false }),
  rev({ month: '2026-07-01', amount_net: 500, pass_through: true, paid: true, paid_on: '2026-07-31' }),
  rev({ month: '2026-08-01', amount_net: 2000, paid: false }),
]
const COSTS = [
  cost({ month: '2026-07-01', actual: 8899, category: 'Personale', paid: true, paid_on: '2026-08-20' }),
  cost({ month: '2026-07-01', actual: 650, category: 'Delivery & Fornitori', project_id: 'p1', paid: true, paid_on: '2026-07-31' }),
  cost({ month: '2026-07-01', actual: 480, category: 'Software & Tool', paid: true, paid_on: '2026-07-31', vat_applied: true }),
  cost({ month: '2026-08-01', actual: 300, category: 'Overhead', paid: false }),
]
const TXS = [
  { booked_on: '2026-07-15', amount: 2196, source: 'banca', kind: 'incasso' },
  { booked_on: '2026-07-31', amount: -650, source: 'banca', kind: 'pagamento' },
  { booked_on: '2026-07-31', amount: -585.60, source: 'banca', kind: 'pagamento' },
  { booked_on: '2026-07-31', amount: 610, source: 'banca', kind: 'incasso' },
  // una dichiarazione, non un fatto: non deve toccare né saldo né confronto
  { booked_on: '2026-07-20', amount: -8899, source: 'derivato', kind: 'pagamento' },
  { booked_on: '2026-08-20', amount: -8899, source: 'banca', kind: 'stipendio' },
]
/* §240 — luglio matura 900 di quote soci e 300 di provvigioni; dalla banca in
   quel mese sono usciti 500. Sono due misure della stessa cosa, non due cose. */
/* Il mese è quello in cui il compenso **matura**: esce in quello dopo (§224).
   Giugno c'è perché è quello che luglio eroga: senza, la prima colonna del
   prospetto sembrerebbe un mese senza compensi, che non è mai vero. */
const PAYOUTS = [
  { month: '2026-06-01', partners: 900, sales: 300, paidOut: 500,
    people: [
      { who: 'Marco', kind: 'socio' as const, amount: 300 },
      { who: 'Walter', kind: 'socio' as const, amount: 300 },
      { who: 'Toto', kind: 'socio' as const, amount: 300 },
      { who: 'Antonio Giarletta', kind: 'commerciale' as const, amount: 300 },
    ] },
  { month: '2026-07-01', partners: 1200, sales: 400, paidOut: 500,
    people: [
      { who: 'Marco', kind: 'socio' as const, amount: 500 },
      { who: 'Walter', kind: 'socio' as const, amount: 400 },
      { who: 'Toto', kind: 'socio' as const, amount: 300 },
      { who: 'Antonio Giarletta', kind: 'commerciale' as const, amount: 400 },
    ] },
]
const base: ProspettoInput = {
  months: MESI, revenue: REVENUE, costs: COSTS, txs: TXS,
  opening: 1000, today: TODAY, basis: 'competenza', payouts: PAYOUTS,
}

// ── le macro ────────────────────────────────────────────────────────────────
/* Il costo del lavoro e il subappalto non sono aree del piano: il primo lo
   scrive l'organico, il secondo è già uscito dal margine del suo progetto.
   Tenerli dentro «Delivery & Fornitori» faceva sembrare struttura una cosa
   venduta al cliente. */
eq('il costo del lavoro è una macro sua', costMacro({ category: 'Personale', project_id: null, partner_id: null }), 'personale')
eq('e il subappalto pure', costMacro({ category: 'Delivery & Fornitori', project_id: 'p1', partner_id: null }), 'subappalti')
eq('la spesa dal sottoconto di un socio è erogato', costMacro({ category: 'Spese soci', project_id: null, partner_id: 'x' }), 'soci')
eq('tutto il resto tiene il nome della sua area', costMacro({ category: 'Software & Tool', project_id: null, partner_id: null }), 'Software & Tool')
eq('e senza area lo dice', costMacro({ category: '', project_id: null, partner_id: null }), 'Senza area')

// ── competenza ──────────────────────────────────────────────────────────────
const comp = prospetto(base)
const rowOf = (p: typeof comp, k: string) => [...p.revenue, ...p.costs].find(r => r.key === k)
const cellOf = (p: typeof comp, k: string, m: string) => rowOf(p, k)?.cells.find(c => c.month === m)?.value
eq('tre mesi in colonna', comp.months, MESI)
eq('il growth di luglio', cellOf(comp, 'growth', '2026-07-01'), 1800)
eq('il digital di luglio', cellOf(comp, 'digital', '2026-07-01'), 1625)
/* Una partita di giro è fatturato e non è margine di nessuno: sta in riga sua,
   o gonfia il growth di soldi che tornano al cliente. */
eq('e la partita di giro sta per conto suo', cellOf(comp, 'giro', '2026-07-01'), 500)
eq('il totale entrate le somma tutte',
   comp.totals.revenue.cells.find(c => c.month === '2026-07-01')?.value, 3925)
eq('il costo del lavoro è in luglio, dov\'è maturato', cellOf(comp, 'personale', '2026-07-01'), 8899)
eq('e ad agosto non c\'è', cellOf(comp, 'personale', '2026-08-01'), 0)
eq('il margine di luglio', comp.totals.margin.cells.find(c => c.month === '2026-07-01')?.value,
   3925 - (8899 + 650 + 480))
/* Le quote dicono dove vanno i soldi: senza, una colonna di numeri non risponde
   alla domanda per cui questa sezione esiste. Il denominatore è tutto quello
   che esce, compensi compresi — vedi sotto. */
eq('ogni riga porta la sua quota', rowOf(comp, 'personale')?.share,
   Math.round((8899 / (10329 + 2800)) * 100) / 100)
eq('le righe vuote non compaiono', comp.costs.some(r => r.total === 0), false)

// ── cassa ───────────────────────────────────────────────────────────────────
const cassa = prospetto({ ...base, basis: 'cassa' })
/* Il caso per cui questa sezione esiste: lo stipendio di luglio esce il 20
   agosto. In competenza è di luglio, in cassa è di agosto, e sono due verità. */
eq('in cassa il costo del lavoro si sposta ad agosto', cellOf(cassa, 'personale', '2026-08-01'), 8899)
eq('e luglio non lo vede più', cellOf(cassa, 'personale', '2026-07-01'), 0)
/* Una riga non pagata non è in nessun mese di cassa: metterla nel suo mese di
   competenza sarebbe raccontare come fatto una cosa che non è successa. */
eq('il digital non incassato sparisce dalla cassa', cassa.revenue.some(r => r.key === 'digital'), false)
eq('e l\'entrata di agosto non incassata resta a zero', cellOf(cassa, 'growth', '2026-08-01'), 0)
eq('mentre il canone incassato resta a luglio', cellOf(cassa, 'growth', '2026-07-01'), 1800)
/* La cassa è un sottoinsieme di quello che è maturato: se fosse più grande
   qualcosa sarebbe contato due volte. */
eq('la cassa non supera mai la competenza',
   cassa.totals.revenue.total <= comp.totals.revenue.total, true)

// ── §240 · i compensi stanno fra le uscite, ma non sono costi ───────────────
/* Dal conto escono come tutto il resto, quindi si vedono lì. Ma non sono righe
   di conto economico — non si scrivono, si ricalcolano — e infilarli in `costs`
   darebbe un margine diverso da quello del conto economico, con lo stesso nome. */
/* §291 — **il compenso pesa sul mese in cui esce**, non su quello in cui matura.
   Le quote di giugno si erogano a luglio: prima il prospetto le metteva a giugno
   e la colonna di luglio mostrava un «resta alla società» che nessun bonifico
   avrebbe confermato. Il prezzo — un mese che sottrae quote maturate altrove —
   è dichiarato sulla riga, non nascosto. */
eq('luglio eroga quello che è maturato a giugno',
   comp.payouts.find(r => r.key === 'erogato')?.cells.find(c => c.month === '2026-07-01')?.value, 900)
eq('e agosto quello di luglio',
   comp.payouts.find(r => r.key === 'erogato')?.cells.find(c => c.month === '2026-08-01')?.value, 1200)
eq('le provvigioni si spostano insieme',
   comp.payouts.find(r => r.key === 'provvigioni')?.cells.find(c => c.month === '2026-07-01')?.value, 300)

/* §291 — e si legge **per persona**: «compensi 1.200 €» non risponde alla
   domanda che uno si fa guardando il P&L, che è «quanto a Marco». */
eq('i tre soci hanno una riga ciascuno',
   comp.payouts.filter(r => r.key.startsWith('socio:')).map(r => r.label).sort(),
   ['Marco', 'Toto', 'Walter'])
eq('il commerciale sta in una riga sua',
   comp.payouts.filter(r => r.key.startsWith('commerciale:')).map(r => r.label), ['Antonio Giarletta'])
eq('Marco a luglio prende la sua quota di giugno',
   comp.payouts.find(r => r.key === 'socio:Marco')?.cells.find(c => c.month === '2026-07-01')?.value, 300)
eq('e ad agosto quella di luglio',
   comp.payouts.find(r => r.key === 'socio:Marco')?.cells.find(c => c.month === '2026-08-01')?.value, 500)
/* Chi prende di più si legge per primo: un elenco di persone in ordine di
   inserimento non si guarda. */
eq('le persone sono in ordine di importo',
   comp.payouts.filter(r => r.key.startsWith('socio:')).map(r => r.label), ['Marco', 'Walter', 'Toto'])

/* Il totale dei compensi si fa sulle **righe di gruppo**, mai su tutte: sommare
   anche le persone lo conterebbe due volte, e sarebbe un margine sbagliato con
   lo stesso nome di quello giusto. */
eq('il totale non conta due volte il dettaglio',
   comp.totals.payouts.cells.find(c => c.month === '2026-07-01')?.value, 1200)
eq('e su tutto il periodo nemmeno', comp.totals.payouts.total, 900 + 300 + 1200 + 400)
eq('e non entrano nei costi', comp.costs.some(r => r.key === 'erogato'), false)
/* Il margine resta quello del conto economico: entrate meno costi. Quello che
   resta **dopo** i compensi è un altro numero, e ha un altro nome. */
eq('il margine non li conta', comp.totals.margin.cells.find(c => c.month === '2026-07-01')?.value,
   3925 - (8899 + 650 + 480))
eq('e «resta alla società» sì',
   comp.totals.left.cells.find(c => c.month === '2026-07-01')?.value,
   3925 - (8899 + 650 + 480) - 1200)
/* Senza righe materializzate la banca dice quanto è uscito, non per quale dei
   due lavori: a un socio che è anche commerciale si bonifica una volta sola. */
eq('in cassa è una riga sola', cassa.payouts.map(r => r.key), ['erogato'])
eq('e vale quello che è uscito davvero',
   cassa.payouts[0].cells.find(c => c.month === '2026-07-01')?.value, 500)
/* §243 — con le righe spuntabili si sa anche **per quale** dei due lavori, e le
   retribuzioni di luglio si pagano ad agosto: la spunta cade lì. */
const conRighe = prospetto({ ...base, basis: 'cassa', payouts: [
  { month: '2026-07-01', partners: 900, sales: 300, paidPartners: 0, paidSales: 0, paidOut: 500 },
  { month: '2026-08-01', partners: 400, sales: 100, paidPartners: 900, paidSales: 300, paidOut: 0,
    people: [{ who: 'Marco', kind: 'socio' as const, amount: 400, paid: 900 }] },
] })
eq('con le righe tornano le due voci di gruppo',
   conRighe.payouts.filter(r => !r.key.includes(':')).map(r => r.key), ['erogato', 'provvigioni'])
/* In cassa la persona si legge dalla **spunta**, non dal maturato: è l'unico
   numero che un bonifico può confermare. */
eq('e in cassa la persona porta quello che ha incassato',
   conRighe.payouts.find(r => r.key === 'socio:Marco')?.cells.find(c => c.month === '2026-08-01')?.value, 900)
eq('e il maturato di luglio esce ad agosto',
   conRighe.payouts.find(r => r.key === 'erogato')?.cells.find(c => c.month === '2026-08-01')?.value, 900)
eq('mentre luglio non ne ha ancora pagato nessuno',
   conRighe.payouts.find(r => r.key === 'erogato')?.cells.find(c => c.month === '2026-07-01')?.value, 0)
/* La quota si legge sul totale che esce, compensi compresi: tenerli fuori dal
   denominatore farebbe sembrare il personale più pesante di quanto è. */
eq('le quote guardano tutto quello che esce',
   comp.costs.find(r => r.key === 'personale')?.share,
   Math.round((8899 / (10329 + 2800)) * 100) / 100)

// ── e in banca ──────────────────────────────────────────────────────────────
const lug = comp.bank.find(b => b.month === '2026-07-01')!
/* Solo i movimenti veri: il `derivato` da 8.899 nasce da una spunta e non è
   passato da nessun conto. Contarlo farebbe quadrare grazie a quello che il
   confronto deve verificare. */
eq('il saldo conta solo i movimenti veri', { in: lug.inflow, out: lug.outflow }, { in: 2806, out: 1235.60 })
eq('e il saldo rotola dall\'apertura', lug.balance, 1000 + 2806 - 1235.6)
eq('agosto porta lo stipendio vero', comp.bank.find(b => b.month === '2026-08-01')?.outflow, 8899)
/* Il ponte fra netto e lordo: l'IVA delle righe mosse in questo mese. Senza,
   confrontare un imponibile con un saldo è l'errore che fa sembrare in utile
   un'azienda che sta finendo i soldi. */
eq('l\'IVA incassata è quella delle righe mosse', lug.vatIn, Math.round((1800 + 500) * 0.22 * 100) / 100)
eq('l\'IVA pagata solo dove c\'era', lug.vatOut, Math.round(480 * 0.22 * 100) / 100)
/* Il prospetto dice 1.800 + 500 incassati e 650 + 480 pagati, IVA compresa:
   2.806 dentro e 1.235,60 fuori — e la banca dice lo stesso. Quando tutto è
   agganciato la differenza è **zero**: è la proprietà che rende quel numero
   leggibile, non una tolleranza da interpretare. */
eq('il prospetto e la banca si confrontano al lordo', lug.sheet, 2806 - 1235.60)
eq('e quando tutto è agganciato chiude a zero', lug.diff, 0)
eq('in tutto il periodo pure', comp.unexplained, 0)
/* Un movimento vero che nessuna riga giustifica esce fuori come differenza: è
   l'unica cosa che il confronto deve far vedere, e non deve poterlo assorbire. */
const orfano = prospetto({ ...base,
  txs: [...TXS, { booked_on: '2026-07-18', amount: 1200, source: 'banca', kind: 'incasso' }] })
eq('un movimento senza riga resta scoperto',
   orfano.bank.find(b => b.month === '2026-07-01')?.diff, 1200)
eq('e si conta sul periodo', orfano.unexplained, 1200)
/* Una spunta senza movimento sbilancia dall'altra parte, ed è l'errore gemello:
   il prospetto dice uscito, il conto non se n'è accorto. */
const spunta = prospetto({ ...base,
  costs: [...COSTS, cost({ month: '2026-07-01', actual: 400, category: 'Professionali', paid: true, paid_on: '2026-07-10' })] })
eq('una spunta senza movimento sbilancia al contrario',
   spunta.bank.find(b => b.month === '2026-07-01')?.diff, 400)

// ── niente da dire ──────────────────────────────────────────────────────────
const vuoto = prospetto({ ...base, revenue: [], costs: [], txs: [] })
eq('senza righe non ci sono macro', { r: vuoto.revenue.length, c: vuoto.costs.length }, { r: 0, c: 0 })
eq('i totali restano a zero', vuoto.totals.margin.total, 0)
eq('e il saldo è l\'apertura', vuoto.bank.at(-1)?.balance, 1000)

// ────────────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)
