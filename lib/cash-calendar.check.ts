/**
 * Gate di `lib/cash-calendar.ts`. I casi ricalcano le righe vere di luglio 2026
 * lette sul database: cinque voci di personale, i subappalti dei progetti
 * digital, le rate dei canoni growth.
 *
 *   npx tsx lib/cash-calendar.check.ts
 */
import {
  addDays, daysBetween, endOfMonth, monthOf, termsOf, dueOf, statusOf,
  collectionIndex, movedIn, openAt, lateAt, summarize, lateLabel, isLate,
  fromRevenue, fromCost, carryOf,
  TERMS, TERMS_LABEL, TERMS_WHY, LATE_BANDS, type CashLine,
} from './cash-calendar'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}

const TODAY = '2026-08-08'
const LUG = '2026-07-01'
const AGO = '2026-08-01'

// ── date ────────────────────────────────────────────────────────────────────
eq('somma giorni', addDays('2026-07-01', 14), '2026-07-15')
eq('cambia mese', addDays('2026-07-30', 3), '2026-08-02')
eq('anno bisestile', addDays('2028-02-28', 1), '2028-02-29')
// il cambio d'ora non deve spostare una scadenza: si lavora in UTC
eq('ultima domenica di ottobre', addDays('2026-10-24', 2), '2026-10-26')
eq('giorni fra due date', daysBetween('2026-07-15', '2026-08-08'), 24)
eq('stessa data = zero', daysBetween('2026-08-08', '2026-08-08'), 0)
eq('all\'indietro è negativo', daysBetween('2026-08-20', '2026-08-08'), -12)
eq('fine mese lungo', endOfMonth(LUG), '2026-07-31')
eq('fine febbraio', endOfMonth('2026-02-01'), '2026-02-28')
eq('mese di una data', monthOf('2026-08-20'), '2026-08-01')

// ── vocabolario ─────────────────────────────────────────────────────────────
eq('ogni accordo ha un\'etichetta', TERMS.every(t => !!TERMS_LABEL[t]), true)
eq('ogni accordo dice perché', TERMS.every(t => !!TERMS_WHY[t]), true)

// ── la regola: la natura della voce decide ──────────────────────────────────
const rev = (o: Partial<CashLine> & { projects?: string[] } = {}): CashLine & { projects?: string[] } => ({
  id: 'r', side: 'entrata', month: LUG, amount: 1800, paid: false, ...o,
})
const cost = (o: Partial<CashLine> = {}): CashLine => ({
  id: 'c', side: 'uscita', month: LUG, amount: 1000, paid: false, ...o,
})

eq('un\'entrata è a 15 giorni', termsOf(rev()), 'giorni_15')
eq('il personale esce il mese dopo', termsOf(cost({ category: 'Personale' })), 'mese_succ_20')
// la 172 chiamava l'area «Persone»: i mesi già scritti non si riscrivono
eq('anche col vecchio nome dell\'area', termsOf(cost({ category: 'Persone' })), 'mese_succ_20')
eq('un subappalto si paga a incasso', termsOf(cost({ project_id: 'p1' })), 'a_incasso')
eq('il resto esce nel mese', termsOf(cost({ category: 'Software' })), 'stesso_mese')
eq('quello scritto sulla riga vince', termsOf(cost({ category: 'Personale', terms: 'giorni_60' })), 'giorni_60')
// un valore che non è del vocabolario non è un accordo: si torna alla natura
eq('una stringa qualsiasi non è un accordo', termsOf(cost({ terms: 'appena posso' })), 'stesso_mese')

// ── scadenze ────────────────────────────────────────────────────────────────
eq('la fattura di luglio scade il 15', dueOf(rev()), '2026-07-15')
eq('lo stipendio di luglio esce il 20 agosto',
   dueOf(cost({ category: 'Personale' })), '2026-08-20')
eq('un canone esce entro il mese', dueOf(cost({ category: 'Software' })), '2026-07-31')
eq('a 60 giorni', dueOf(rev({ terms: 'giorni_60' })), '2026-08-29')
eq('la data scritta a mano vince su tutto',
   dueOf(cost({ category: 'Personale', due_date: '2026-09-03' })), '2026-09-03')
// senza sapere quando incassa il cliente, un subappalto non può scadere prima
// della fine del suo mese: inventare una data più stretta lo farebbe sembrare
// in ritardo per colpa di chi lo ha registrato
eq('subappalto senza rata nota', dueOf(cost({ project_id: 'p1' })), '2026-07-31')

// ── a incasso: il fornitore si paga quando ha pagato il cliente ─────────────
const COLL = collectionIndex([
  rev({ id: 'r1', project_id: 'p1', amount: 1625, due_date: '2026-07-20' }),
  // due rate sullo stesso progetto: vince la più lontana, non la prima
  rev({ id: 'r2', project_id: 'p1', amount: 1625, due_date: '2026-07-28' }),
  // pagata: vale il movimento vero, non la scadenza
  rev({ id: 'r3', project_id: 'p2', amount: 6000, paid: true, paid_on: '2026-07-09', due_date: '2026-07-15' }),
  // altro mese: non deve inquinare luglio
  rev({ id: 'r4', month: AGO, project_id: 'p1', amount: 1625, due_date: '2026-08-30' }),
])
const ctx = { collection: COLL }
eq('la rata più lontana del progetto', COLL.get('p1|2026-07-01'), '2026-07-28')
eq('se il cliente ha pagato vale la data vera', COLL.get('p2|2026-07-01'), '2026-07-09')
eq('agosto non tocca luglio', COLL.get('p1|2026-08-01'), '2026-08-30')
eq('il subappalto segue la rata',
   dueOf(cost({ project_id: 'p1' }), ctx), '2026-07-28')
eq('un accordo su più progetti conta per tutti',
   collectionIndex([rev({ id: 'm', projects: ['a', 'b'], due_date: '2026-07-22' })]).size, 2)

// ── bande del ritardo ───────────────────────────────────────────────────────
const bandOf = (due: string) => statusOf(cost({ due_date: due }), TODAY).band
eq('scadenza avanti = in scadenza', bandOf('2026-08-20'), 'atteso')
eq('scade oggi non è ritardo', bandOf(TODAY), 'atteso')
eq('un giorno oltre è ritardo', bandOf('2026-08-07'), 'in_ritardo')
eq('al quindicesimo è ancora ritardo', bandOf(addDays(TODAY, -LATE_BANDS.scaduto)), 'in_ritardo')
eq('al sedicesimo è scaduto', bandOf(addDays(TODAY, -LATE_BANDS.scaduto - 1)), 'scaduto')
eq('oltre 45 è da recuperare', bandOf(addDays(TODAY, -LATE_BANDS.grave - 1)), 'grave')
eq('pagato non ha bande di ritardo',
   statusOf(cost({ paid: true, paid_on: '2026-08-03', due_date: '2026-06-01' }), TODAY).band, 'pagato')
eq('solo tre bande sono ritardo',
   ['2026-08-20', '2026-08-07', '2026-06-01', TODAY]
     .map(d => isLate(statusOf(cost({ due_date: d }), TODAY))), [false, true, true, false])

// ── il mese di cassa: dove pesa una riga ────────────────────────────────────
const cm = (l: CashLine) => statusOf(l, TODAY, ctx).cashMonth
eq('lo stipendio di luglio pesa su agosto',
   cm(cost({ category: 'Personale', paid: true, paid_on: '2026-08-20' })), AGO)
eq('la fattura di giugno incassata a luglio pesa su luglio',
   cm(rev({ month: '2026-06-01', paid: true, paid_on: '2026-07-04' })), LUG)
/* Un arretrato è atteso adesso: lasciarlo nel mese della scadenza lo farebbe
   sparire dalla vista di chi deve incassarlo. */
eq('un arretrato di giugno pesa su agosto', cm(rev({ month: '2026-06-01' })), AGO)
eq('quello che scade in futuro resta lì',
   cm(cost({ month: AGO, category: 'Personale' })), '2026-09-01')
/* Senza la 203 la colonna non c'è: la riga resta nel suo mese e la pagina
   legge come prima, invece di spostare numeri su una data inventata. */
eq('pagata senza data resta nel suo mese', cm(rev({ paid: true })), LUG)
eq('e lo dichiara', statusOf(rev({ paid: true }), TODAY).assumed, true)

// ── le tre letture di un mese ───────────────────────────────────────────────
/* Luglio come sta sul database: 12 entrate di cui 8 incassate, il personale
   che uscirà il 20 agosto, un subappalto pagato ad agosto. */
const LINES: CashLine[] = [
  rev({ id: 'e1', amount: 1500, paid: true, paid_on: '2026-07-10' }),
  rev({ id: 'e2', amount: 3600, paid: true, paid_on: '2026-07-14' }),
  rev({ id: 'e3', amount: 1800 }),                                  // scoperta dal 15/07
  rev({ id: 'e4', month: '2026-06-01', amount: 2000 }),             // arretrato di giugno
  rev({ id: 'e5', month: AGO, amount: 1200, paid: true, paid_on: '2026-08-05' }),
  cost({ id: 'u1', category: 'Personale', amount: 8899, paid: true, paid_on: '2026-08-20' }),
  cost({ id: 'u2', category: 'Software', amount: 860, paid: true, paid_on: '2026-07-31' }),
  cost({ id: 'u3', category: 'Struttura', amount: 500 }),           // scoperta dal 31/07
]

eq('la cassa di luglio sono i fatti di luglio',
   movedIn(LINES, LUG, TODAY).map(l => l.id), ['e1', 'e2', 'u2'])
/* Lo stipendio di luglio è cassa di agosto: è il punto di tutto il modulo. */
eq('la cassa di agosto prende lo stipendio di luglio',
   movedIn(LINES, AGO, TODAY).map(l => l.id), ['e5', 'u1'])
eq('agosto si trascina gli scoperti dei mesi prima',
   openAt(LINES, AGO, TODAY).map(l => l.id), ['e4', 'e3', 'u3'])
eq('luglio si trascina solo giugno', openAt(LINES, LUG, TODAY).map(l => l.id), ['e4'])
/* Le righe del mese stesso non sono «da altri mesi»: sono già in tabella, e
   mostrarle due volte farebbe contare due volte lo stesso scoperto. */
eq('il mese non si trascina se stesso',
   openAt(LINES, LUG, TODAY).every(l => monthOf(l.month) !== LUG), true)
eq('in ritardo, dalla più vecchia', lateAt(LINES, TODAY).map(l => l.id), ['e4', 'e3', 'u3'])

// ── riassunto ───────────────────────────────────────────────────────────────
const sum = summarize(openAt(LINES, AGO, TODAY), TODAY)
eq('quante e quanto', { n: sum.count, e: sum.amount }, { n: 3, e: 4300 })
eq('la più vecchia', sum.oldest, daysBetween('2026-06-15', TODAY))
eq('la banda peggiore', sum.worst, 'grave')
// lo stipendio di agosto scade il 20 settembre: aspetta, non è in ritardo
const sum2 = summarize([cost({ month: AGO, category: 'Personale', amount: 8899 })], TODAY)
eq('chi aspetta non è in ritardo', { n: sum2.count, w: sum2.waiting, e: sum2.waitingAmount },
   { n: 0, w: 1, e: 8899 })
eq('niente scoperto, niente banda', summarize([], TODAY).count, 0)

// ── dalle righe del conto economico ─────────────────────────────────────────
eq('un ricavo diventa una riga di cassa',
   fromRevenue({
     id: 'x', label: 'Canone', client_id: null, plan_amount: 1800, invoices: 1,
     amount_net: 1800, vat_rate: 0.22, invoice_sent: true, paid: false,
     kind: 'growth', sales_owner_id: null, sales_owner: null,
   }, LUG),
   { id: 'x', side: 'entrata', month: LUG, amount: 1800, label: 'Canone',
     paid: false, paid_on: null, due_date: null, terms: null,
     project_id: null, projects: [],
     carried_at: null, carried_from: null, carry_count: 0 })

/* §290 — quanto una riga si trascina lo scrive la chiusura, non lo si deduce
   dalle date: un mese riaperto e richiuso è una chiusura sola. */
eq('una riga mai trascinata non dice niente',
   carryOf(fromRevenue({
     id: 'x', label: 'Canone', client_id: null, plan_amount: 1800, invoices: 1,
     amount_net: 1800, vat_rate: 0.22, invoice_sent: true, paid: false,
     kind: 'growth', sales_owner_id: null, sales_owner: null,
   }, LUG)), null)
eq('e una trascinata dice da dove e da quante chiusure',
   carryOf(fromRevenue({
     id: 'x', label: 'iCura', client_id: null, plan_amount: 3600, invoices: 1,
     amount_net: 3600, vat_rate: 0.22, invoice_sent: true, paid: false,
     kind: 'growth', sales_owner_id: null, sales_owner: null,
     carried_at: '2026-09-01', carried_from: '2026-07-01', carry_count: 2,
   }, LUG)), { from: '2026-07-01', times: 2, since: '2026-09-01' })
/* Il segno c'è ma il conteggio no: è una riga trascinata dalla 213, che il
   backfill ha marcato senza sapere quante volte. Vale una, non zero. */
eq('senza conteggio vale la prima volta',
   carryOf({ id: 'z', side: 'uscita', month: LUG, amount: 100, paid: false,
     carried_at: '2026-09-01', carried_from: '2026-07-01' })?.times, 1)
/* §207 — un accordo su più progetti li porta tutti: con uno solo si perdeva il
   collegamento e il subappalto degli altri due non trovava la sua rata. */
eq('l\'accordo multi-progetto li porta tutti',
   fromRevenue({
     id: 'x', label: 'iCura', client_id: null, plan_amount: 3600, invoices: 1,
     amount_net: 3600, vat_rate: 0.22, invoice_sent: true, paid: false,
     kind: 'growth', sales_owner_id: null, sales_owner: null,
     project_ids: ['a', 'b', 'c'],
   }, LUG).projects, ['a', 'b', 'c'])
/* Un costo registrato e non ancora consuntivato pesa lo stesso sulla cassa:
   se valesse zero sparirebbe dagli arretrati proprio mentre è quello che pesa. */
const c0 = { id: 'y', category: 'Personale', label: 'Michele', cost_type: 'F' as const,
  budget: 2767, actual: 0, paid: false, vat_applied: false, vat_rate: 0 }
eq('un\'uscita senza effettivo vale il preventivato', fromCost(c0, LUG).amount, 2767)
eq('con l\'effettivo vale l\'effettivo', fromCost({ ...c0, actual: 2880.19 }, LUG).amount, 2880.19)
eq('e la sua scadenza la dice l\'area', dueOf(fromCost(c0, LUG)), '2026-08-20')

// ── parole ──────────────────────────────────────────────────────────────────
const lbl = (l: CashLine) => lateLabel(statusOf(l, TODAY, ctx))
eq('un giorno solo', lbl(cost({ due_date: '2026-08-07' })), 'in ritardo di 1 giorno')
eq('più giorni', lbl(cost({ due_date: '2026-07-01' })), 'in ritardo di 38 giorni')
eq('oggi', lbl(cost({ due_date: TODAY })), 'scade oggi')
eq('domani', lbl(cost({ due_date: '2026-08-09' })), 'scade domani')
eq('più avanti', lbl(cost({ due_date: '2026-08-20' })), 'fra 12 giorni')
eq('pagato dice quando', lbl(cost({ paid: true, paid_on: '2026-08-03' })), 'pagato il 3 agosto')
eq('pagato senza data lo dice', lbl(cost({ paid: true })), 'pagato, data non registrata')

// ────────────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)
