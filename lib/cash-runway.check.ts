/**
 * Gate di `lib/cash-runway.ts`. I numeri ricalcano luglio-agosto 2026 sul
 * database: 32.225 € di imponibile, 173 movimenti di banca, IVA del 2º
 * trimestre in scadenza il 20 agosto.
 *
 *   npx tsx lib/cash-runway.check.ts
 */
import { cashRunway, type RunwayLine } from './cash-runway'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}

const TODAY = '2026-08-08'
const AGO = '2026-08-01'

const line = (o: Partial<RunwayLine> & Pick<RunwayLine, 'side' | 'gross' | 'due'>): RunwayLine => ({
  id: o.id ?? `${o.side}-${o.due}-${o.gross}`, label: o.label ?? 'riga',
  month: o.month ?? AGO, ...o,
})

const OPEN: RunwayLine[] = [
  line({ side: 'entrata', gross: 2196, due: '2026-08-15' }),           // canone 1.800 + IVA, nei termini
  line({ side: 'entrata', gross: 2440, due: '2026-07-15', month: '2026-07-01' }), // arretrato
  line({ side: 'entrata', gross: 1220, due: '2026-09-15', month: '2026-09-01' }), // mese dopo
  line({ side: 'uscita', gross: 8899, due: '2026-08-20' }),            // stipendi, senza IVA
  line({ side: 'uscita', gross: 1049, due: '2026-07-31', month: '2026-07-01' }), // scaduta
  line({ side: 'uscita', gross: 610, due: '2026-10-31', month: '2026-10-01' }),
]

const base = {
  month: AGO, today: TODAY, balance: 14000,
  open: OPEN,
  planned: [
    { month: AGO, cashIn: 30000, cashOut: 20000, open: true },   // già aperto: non si somma
    { month: '2026-09-01', cashIn: 24000, cashOut: 18000, open: false },
    { month: '2026-10-01', cashIn: 12000, cashOut: 15000, open: false },
  ],
  dues: [{ date: '2026-08-20', amount: 7090, label: '2º trimestre 2026' }],
  vatHeld: 7090, vatDeadline: '2026-08-20', vatLabel: '2º trimestre 2026', vatDays: 12,
}

// ── cosa cade dentro questo mese ────────────────────────────────────────────
const r = cashRunway(base)
/* Le righe di settembre e ottobre non c'entrano con la tenuta di agosto: la
   domanda è «arrivo a fine mese», non «arrivo a fine anno». */
eq('uscite scoperte entro il mese', { n: r.toPayCount, e: r.toPayGross }, { n: 2, e: 9948 })
eq('incassi attesi entro il mese', { n: r.toCollectCount, e: r.toCollectGross }, { n: 2, e: 4636 })
/* Un arretrato non è di un altro mese: è la bolletta che qualcuno doveva pagare
   e non ha pagato, e la cassa la sente adesso. */
eq('gli arretrati contano adesso', { out: r.lateOut, in: r.lateIn }, { out: 1049, in: 2440 })
/* §233 — e non si sommano agli incassi ancora nei termini: una fattura che
   scade fra una settimana e una scaduta da ventiquattro giorni non sono la
   stessa promessa. */
eq('gli incassi si dividono in due', { nei_termini: r.dueIn, scaduti: r.lateIn }, { nei_termini: 2196, scaduti: 2440 })
eq('con quante righe per parte', { n: r.dueInCount, l: r.lateInCount }, { n: 1, l: 1 })
eq('e da quanto aspetta il più vecchio', r.lateInOldest, 24)

// ── i tre esiti ─────────────────────────────────────────────────────────────
/* Sono la risposta a «e se»: il primo è l'unico che dipende da te, gli altri
   due dipendono da qualcun altro, e sono due «qualcun altro» diversi. */
eq('se non incassi niente', r.floor, 14000 - 9948 - 7090)
eq('se pagano i puntuali', r.expected, 14000 - 9948 - 7090 + 2196)
eq('se rientrano gli arretrati', r.best, 14000 - 9948 - 7090 + 2196 + 2440)
eq('tre esiti, in ordine', r.outcomes.map(o => o.key), ['floor', 'expected', 'best'])
/* Senza crediti scaduti il terzo esito non esiste: un «e se» senza niente
   dentro insegna solo a non leggerli. */
const puntuale = cashRunway({ ...base, open: OPEN.filter(l => l.due !== '2026-07-15') })
eq('senza arretrati restano due esiti', puntuale.outcomes.map(o => o.key), ['floor', 'expected'])
eq('e il migliore coincide con l\'atteso', puntuale.best, puntuale.expected)

// ── la scala ────────────────────────────────────────────────────────────────
const s = Object.fromEntries(r.scenarios.map(x => [x.key, x.balance]))
eq('sul conto adesso', s.ora, 14000)
eq('paghi tutte le uscite scoperte', s.paghi, 14000 - 9948)
eq('poi l\'IVA', s.iva, 14000 - 9948 - 7090)
eq('e poi entrano i puntuali', s.puntuali, r.expected)
eq('e infine gli arretrati', s.arretrati, r.best)
/* Prima quello che esce comunque, poi quello che può entrare: mescolarli
   faceva sembrare un fatto una speranza. */
eq('gli obblighi vengono prima degli incassi',
   r.scenarios.map(x => x.kind), ['saldo', 'obbligo', 'obbligo', 'incasso', 'incasso'])
eq('ogni gradino dichiara il suo delta',
   r.scenarios.map(x => x.delta), [0, -9948, -7090, 2196, 2440])
eq('la somma dei delta porta dall\'inizio alla fine',
   Math.round(r.scenarios.reduce((n, x) => n + x.delta, 14000)), r.best)
/* Un gradino che non toglie e non aggiunge niente è rumore: non compare. */
const noVat = cashRunway({ ...base, vatHeld: 0, dues: [] })
eq('senza IVA a debito il gradino sparisce', noVat.scenarios.some(x => x.key === 'iva'), false)
eq('e il pavimento è quello di prima', noVat.floor, 14000 - 9948)

// ── §233 · l'IVA sa se è il mese da versare ─────────────────────────────────
/* Ad agosto la liquidazione cade il 20: è un bonifico. A luglio la stessa IVA
   c'è già sul conto ma non si versa — ed è un'altra cosa, anche se il numero
   che si toglie è lo stesso. */
eq('ad agosto l\'IVA scade nel mese', r.vatDueInMonth, true)
eq('e la riga lo dice', r.scenarios.find(x => x.key === 'iva')?.label, 'Versi l\'IVA del 2º trimestre 2026')
const lug = cashRunway({ ...base, month: '2026-07-01' })
eq('a luglio no', lug.vatDueInMonth, false)
eq('e la riga cambia parola', lug.scenarios.find(x => x.key === 'iva')?.label,
   'Metti da parte l\'IVA del 2º trimestre 2026')
/* Ma si toglie lo stesso: non sono soldi tuoi nemmeno il giorno prima. */
eq('e si toglie comunque', lug.scenarios.find(x => x.key === 'iva')?.delta, -7090)

// ── il verdetto ─────────────────────────────────────────────────────────────
/* Con 14.000 sul conto: paghi tutto e resti a 4.052, dopo l'IVA a −3.038, e
   torni sopra solo incassando. È «stretto» — la differenza fra «ho margine» e
   «ce la faccio». */
eq('stretto se reggi solo incassando', r.verdict, 'stretto')
eq('regge se ce la fai senza incassare niente', cashRunway({ ...base, balance: 24000 }).verdict, 'regge')
eq('negativo se non basta nemmeno incassare tutto',
   cashRunway({ ...base, balance: 9000 }).verdict, 'negativo')
/* §233 — il caso che il verdetto secco appiattiva: con 14.000 non basta che
   paghino i puntuali (−842), serve che rientri un credito già scaduto. Non è
   «dipendi dai clienti», è «dipendi da chi non ti ha pagato», e la telefonata
   la deve fare qualcuno. */
eq('dipendere dagli arretrati è un caso suo', { e: r.expected < 0, b: r.best >= 0 }, { e: true, b: true })
eq('e lo dice', r.headline.includes('solo se rientrano gli arretrati'), true)
/* Con 17.000 invece bastano le fatture ancora nei termini: stesso verdetto,
   frase diversa, e la differenza è chi devi chiamare. */
const bastanoIPuntuali = cashRunway({ ...base, balance: 17000 })
eq('e il caso più lieve resta distinto',
   { v: bastanoIPuntuali.verdict, e: bastanoIPuntuali.expected >= 0 }, { v: 'stretto', e: true })
eq('con la sua frase', bastanoIPuntuali.headline.includes('dipende dai clienti'), true)

// ── §227 · i compensi ai soci ───────────────────────────────────────────────
/* Non sono righe di conto economico: non si scrivono, si ricalcolano. Senza
   questo gradino «se paghi tutto» pagava fornitori e stipendi e non i soci —
   sul conto vero 22.237 € contro un margine di cassa di 15.205. */
const conComp = cashRunway({
  ...base, balance: 30000,
  payouts: {
    open: 22237, people: 4, never: 1, since: '2026-07-01',
    byMonth: [{ month: AGO, amount: 12000 }, { month: '2026-09-01', amount: 10237 }],
  },
})
eq('i compensi sono l\'ultimo obbligo', conComp.scenarios.map(x => x.key),
   ['ora', 'paghi', 'iva', 'compensi', 'puntuali', 'arretrati'])
eq('e tolgono il maturato non erogato', conComp.scenarios[3].delta, -22237)
eq('il pavimento li comprende', conComp.floor, 30000 - 9948 - 7090 - 22237)
/* Il caso da spiegare bene: fino all'IVA regge, sono i compensi a farlo cadere.
   Dirlo come «negativo» e basta farebbe cercare un problema che non c'è. */
eq('fino all\'IVA reggeva', conComp.holdsWithoutPayouts, true)
eq('e lo dice', conComp.headline.includes('compensi maturati'), true)
eq('da quando si conta', conComp.payoutsSince, '2026-07-01')
/* §237 — l'unico gradino che si può spostare, quindi l'unico con un
   interruttore: quanto respiro dà rimandarli è una domanda che si fa ogni mese,
   e senza il secondo numero te lo calcoli a mente. */
eq('e c\'è la lettura senza erogarli', conComp.alt !== null, true)
eq('che è la scala fermata all\'IVA', conComp.alt!.floor, 30000 - 9948 - 7090)
eq('con i suoi tre esiti', [conComp.alt!.expected, conComp.alt!.best],
   [30000 - 9948 - 7090 + 2196, 30000 - 9948 - 7090 + 2196 + 2440])
eq('e il suo verdetto', conComp.alt!.verdict, 'regge')
/* Senza niente da erogare l'interruttore non c'è: uno che non cambia niente è
   peggio di uno assente. */
eq('senza compensi nessun interruttore', r.alt, null)
/* Nel rotolo escono nel mese in cui sono attesi, non tutti sul primo. */
eq('agosto porta la sua quota', conComp.months[0].payouts, 12000)
eq('settembre la sua', conComp.months[1].payouts, 10237)
eq('e dopo niente', conComp.months[2].payouts, 0)
eq('la quota entra nell\'uscita del mese', conComp.months[1].outflow, r.months[1].outflow + 10237)
// senza scoperto il gradino non compare: un «− 0 €» è rumore
eq('senza scoperto nessun gradino', r.scenarios.some(x => x.key === 'compensi'), false)
eq('e nessuna colpa dei compensi', r.holdsWithoutPayouts, false)

// ── il rotolo dei mesi ──────────────────────────────────────────────────────
const m = r.months
eq('sei mesi di orizzonte', m.length, 6)
eq('il primo mese è quello guardato', m[0].month, AGO)
/* Il mese già aperto nel conto economico ha le sue righe: sommarci anche il
   piano conterebbe due volte lo stesso canone. */
eq('sul mese aperto vale solo il registrato',
   { i: m[0].inflow, o: m[0].outflow }, { i: 4636, o: 9948 })
eq('la scadenza IVA pesa nel suo mese', m[0].vat, 7090)
eq('saldo del primo mese', m[0].balance, 14000 + 4636 - 9948 - 7090)
/* Settembre non è aperto: lì vale il piano, più le righe che scadono lì. */
eq('sul mese chiuso vale il piano più le righe',
   { i: m[1].inflow, o: m[1].outflow }, { i: 24000 + 1220, o: 18000 })
eq('ottobre somma piano e riga', { i: m[2].inflow, o: m[2].outflow }, { i: 12000, o: 15000 + 610 })
eq('senza piano e senza righe il mese è piatto', { i: m[4].inflow, o: m[4].outflow }, { i: 0, o: 0 })
eq('il saldo rotola', m[1].balance, m[0].balance + 25220 - 18000)

// ── il costo del lavoro dei mesi non aperti ─────────────────────────────────
/* §184 — il piano dei costi non contiene l'area Personale, che la scrive
   l'organico: senza una stima ogni mese futuro sembra costare novemila euro in
   meno di quanto costerà, e il previsionale promette una cassa che non c'è. */
const conPaghe = cashRunway({ ...base, payroll: 9000 })
/* Agosto è il mese guardato: le sue paghe sono già una riga scoperta con
   scadenza 20 agosto. Stimarle di nuovo le conterebbe due volte. */
eq('il mese guardato non si stima', conPaghe.months[0].estimated, 0)
/* Settembre paga le paghe di agosto, che sono registrate: niente stima. */
eq('nemmeno il mese dopo uno aperto', conPaghe.months[1].estimated, 0)
/* Ottobre paga quelle di settembre, che nessuno ha aperto: lì si stima. */
eq('dal mese dopo uno chiuso sì', conPaghe.months[2].estimated, 9000)
eq('e la stima entra nell\'uscita', conPaghe.months[2].outflow, m[2].outflow + 9000)
eq('senza il parametro non si stima niente', m.every(x => x.estimated === 0), true)

// ── quando si rompe ─────────────────────────────────────────────────────────
const magro = cashRunway({ ...base, balance: 9000 })
eq('il primo mese sotto zero', magro.breaks, AGO)
eq('e poi risale', magro.months[1].balance > 0, true)
/* Il punto più basso è quello che decide, non l'ultimo saldo: un mese che
   chiude a zero passando da −3.000 è un mese che non si è potuto pagare. */
eq('il punto più basso', magro.lowest?.month, AGO)
const sano = cashRunway({ ...base, balance: 90000 })
eq('se non si rompe non c\'è un mese', sano.breaks, null)
/* Il punto più basso esiste sempre, anche quando è positivo: è il numero che
   dice quanto margine hai davvero, non se ne hai. */
eq('ma il punto più basso c\'è comunque', typeof sano.lowest?.balance, 'number')

// ── niente da dire ──────────────────────────────────────────────────────────
const vuoto = cashRunway({ ...base, open: [], planned: [], dues: [], vatHeld: 0 })
eq('senza righe resta un gradino solo', vuoto.scenarios.map(x => x.key), ['ora'])
eq('e i tre esiti diventano uno', vuoto.outcomes.length, 1)
eq('il saldo resta il saldo', { f: vuoto.floor, b: vuoto.best }, { f: 14000, b: 14000 })
eq('e regge', vuoto.verdict, 'regge')

// ────────────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)
