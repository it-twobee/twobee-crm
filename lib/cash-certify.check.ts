/**
 * Gate di `lib/cash-certify.ts`. I casi vengono dall'estratto conto vero letto
 * il 2026-08-08: 138 movimenti `banca`, gli agganci sbagliati di Josè
 * Restaurant, e i bonifici ai soci che a Antonio Giarletta non sono mai andati.
 *
 *   npx tsx lib/cash-certify.check.ts
 */
import {
  certify, certSummary, payoutsFromBank, payoutViews, mergePeople,
  payoutSchedule, payoutDue, payoutLedger, PAYOUT_KINDS,
  CERT_LABEL, type CertLine, type CertTx,
} from './cash-certify'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}

const tx = (o: Partial<CertTx> & Pick<CertTx, 'id' | 'booked_on' | 'amount'>): CertTx => ({
  source: 'banca', kind: 'incasso', counterparty: null, description: '',
  revenue_line_id: null, cost_line_id: null, ...o,
})
const line = (o: Partial<CertLine> & Pick<CertLine, 'id' | 'side' | 'month' | 'paid'>): CertLine => ({
  label: 'riga', net: 1000, vatRate: 0.22, paid_on: null, ...o,
})

// ── i quattro stati ─────────────────────────────────────────────────────────
const LINES: CertLine[] = [
  line({ id: 'a', side: 'entrata', month: '2026-06-01', paid: true, paid_on: '2026-06-17' }),
  line({ id: 'b', side: 'entrata', month: '2026-06-01', paid: true, paid_on: '2026-06-15' }),
  line({ id: 'c', side: 'entrata', month: '2026-06-01', paid: true, paid_on: '2026-06-15' }),
  line({ id: 'd', side: 'entrata', month: '2026-06-01', paid: false }),
  line({ id: 'e', side: 'uscita', month: '2026-06-01', paid: false }),
]
const TXS: CertTx[] = [
  tx({ id: 't1', booked_on: '2026-06-17', amount: 1220, revenue_line_id: 'a' }),
  tx({ id: 't2', booked_on: '2026-08-06', amount: 1220, revenue_line_id: 'b' }),
  tx({ id: 't3', booked_on: '2026-06-20', amount: 1220, revenue_line_id: 'd' }),
  // un `derivato` nasce dalla spunta che stiamo verificando: non certifica niente
  tx({ id: 't4', booked_on: '2026-06-30', amount: -500, source: 'derivato', cost_line_id: 'e' }),
]
const C = certify(LINES, TXS)
eq('data che combacia = certificata', C.get('a')?.state, 'certificata')
eq('movimento con un\'altra data = da datare', C.get('b')?.state, 'da-datare')
eq('e dice quale', C.get('b')?.bookedOn, '2026-08-06')
/* Due mesi di scarto non sono un dettaglio: spostano l'incasso da giugno ad
   agosto, e con lui la cassa e la copertura dei compensi. */
eq('e che cambia mese di cassa', C.get('b')?.movesMonth, true)
eq('spuntata senza movimento = dichiarata', C.get('c')?.state, 'dichiarata')
eq('non spuntata ma pagata = smentita', C.get('d')?.state, 'smentita')
/* Un movimento dichiarato non può certificare la spunta da cui è nato: sarebbe
   un'affermazione che conferma se stessa. */
eq('il derivato non certifica', C.has('e'), false)
eq('una riga non pagata e senza movimento non è nell\'elenco',
   certify([line({ id: 'z', side: 'uscita', month: '2026-06-01', paid: false })], []).size, 0)
eq('ogni stato ha una frase',
   ['certificata', 'da-datare', 'dichiarata', 'smentita', 'sospetta']
     .every(k => !!CERT_LABEL[k as keyof typeof CERT_LABEL]), true)

// ── l'aggancio impossibile ──────────────────────────────────────────────────
/* Sul database vero: la rata di **luglio** di Josè Restaurant era agganciata a
   un bonifico del **15 maggio**. Prendere quella data avrebbe spostato indietro
   di due mesi un incasso di luglio — peggiorando il dato invece di certificarlo. */
const S = certify(
  [line({ id: 'j', side: 'entrata', month: '2026-07-01', paid: true, paid_on: '2026-07-15' })],
  [tx({ id: 'tj', booked_on: '2026-05-15', amount: 1464, revenue_line_id: 'j' })])
eq('movimento prima della competenza = sospetta', S.get('j')?.state, 'sospetta')
/* Dentro il mese invece è un anticipo, ed è legittimo: il cliente ha pagato il 3
   quello che fattureremo il 15. */
const A = certify(
  [line({ id: 'k', side: 'entrata', month: '2026-07-01', paid: true, paid_on: '2026-07-15' })],
  [tx({ id: 'tk', booked_on: '2026-07-03', amount: 1464, revenue_line_id: 'k' })])
eq('un anticipo dentro il mese resta valido', A.get('k')?.state, 'da-datare')

// ── riassunto ───────────────────────────────────────────────────────────────
const sum = certSummary(Array.from(C.values()))
eq('conta gli stati',
   { c: sum.certificate, d: sum.daDatare, di: sum.dichiarate, s: sum.smentite },
   { c: 1, d: 1, di: 1, s: 1 })
eq('e quanto vale il non verificato', sum.dichiarateAmount, 1220)
eq('scarto medio in giorni', sum.meanDrift, 52)

// ── le persone: un socio commerciale è una persona sola ─────────────────────
const PEOPLE = mergePeople(
  [{ id: 'p1', label: 'Walter' }, { id: 'p2', label: 'Marco' }, { id: 'p3', label: 'Toto' }],
  ['Walter Giacobbe', 'Marco Lucci', 'Antonio Giarletta'])
eq('il socio prende il nome completo dell\'anagrafica',
   PEOPLE.filter(p => p.partnerId).map(p => p.label),
   ['Walter Giacobbe', 'Marco Lucci', 'Toto'])
/* Antonio non è socio: resta una persona a sé, e deve esserci — è quello che
   non ha mai preso niente. */
eq('il commerciale non socio resta', PEOPLE.find(p => p.label === 'Antonio Giarletta')?.partnerId, null)
eq('nessuno è contato due volte', PEOPLE.length, 4)

// ── quanto è uscito davvero ─────────────────────────────────────────────────
const PAY: CertTx[] = [
  tx({ id: 'b1', booked_on: '2026-06-04', amount: -5610, kind: 'finanziamento', counterparty: 'Walter', description: 'vs.disp. bon. giacobbe walter' }),
  tx({ id: 'b2', booked_on: '2026-07-25', amount: -3380, kind: 'finanziamento', counterparty: 'Walter', description: 'vs.disp. giacobbe walter' }),
  tx({ id: 'b3', booked_on: '2026-07-10', amount: -3000, kind: 'finanziamento', counterparty: 'Marco', description: 'vs.disp. lucci marco' }),
  // un incasso non è un compenso: si guardano solo le uscite
  tx({ id: 'b4', booked_on: '2026-05-11', amount: 1225, counterparty: 'Marco', description: 'da lucci marco quota nominale' }),
  // «marco» dentro un'altra parola non è Marco
  tx({ id: 'b5', booked_on: '2026-07-01', amount: -900, kind: 'finanziamento', counterparty: 'Marcopolo srl', description: 'fattura marcopolo' }),
  /* Il caso GAV Sistemi: 3.000 € usciti verso Walter il 7 agosto che pagano una
     fattura di una società collegata, non un compenso. Il nome combacia, la
     natura no — e contarli gli avrebbe chiuso uno scoperto che invece esiste. */
  tx({ id: 'b6', booked_on: '2026-08-07', amount: -3000, kind: 'pagamento', counterparty: 'Giacobbe Walter', description: 'vs.disp. favore giacobbe walter' }),
  // già agganciato a una riga: è il pagamento di quella, ed è già contato lì
  tx({ id: 'b7', booked_on: '2026-07-02', amount: -700, kind: 'finanziamento', counterparty: 'Toto', description: 'vs.disp. toto', cost_line_id: 'x1' }),
]
const facts = payoutsFromBank(PAY, PEOPLE)
eq('Walter ha preso due bonifici', facts.get('p:p1')?.paid, 8990)
/* Il pagamento della fattura GAV non entra nei compensi: stesso nome, altra
   natura. È l'unica cosa che separa un bonifico da un altro sullo stesso conto. */
eq('il pagamento di una fattura non è un compenso',
   facts.get('p:p1')?.rows.some(r => r.date === '2026-08-07'), false)
eq('e nemmeno un movimento già agganciato a una riga', facts.get('p:p3')?.paid, 0)
eq('Marco uno solo, e non il versamento in entrata', facts.get('p:p2')?.paid, 3000)
eq('Toto niente', facts.get('p:p3')?.paid, 0)
eq('Antonio niente', facts.get('o:Antonio Giarletta')?.paid, 0)
eq('i movimenti sono in ordine di data', facts.get('p:p1')?.rows.map(r => r.date), ['2026-06-04', '2026-07-25'])

// ── il confronto ────────────────────────────────────────────────────────────
const views = payoutViews([
  { key: 'p:p1', label: 'Walter Giacobbe', amount: 8990 },
  { key: 'p:p2', label: 'Marco Lucci', amount: 9000 },
  { key: 'o:Antonio Giarletta', label: 'Antonio Giarletta', amount: 1200 },
  { key: 'p:p3', label: 'Toto', amount: 0 },
], facts)
const by = new Map(views.map(v => [v.who, v]))
eq('chi è in pari lo dice', by.get('Walter Giacobbe')?.open, 0)
eq('chi ha uno scoperto lo dice', by.get('Marco Lucci')?.open, 6000)
/* Il caso che ha fatto nascere questa sezione: maturato sì, bonifici zero. */
eq('chi non ha mai preso niente è marcato', by.get('Antonio Giarletta')?.never, true)
/* Chi non ha maturato niente non è «mai pagato»: non gli spetta, ed è un'altra
   cosa — marcarlo farebbe suonare un allarme che non c'è. */
eq('chi non ha maturato niente non è un caso', by.get('Toto')?.never, false)
eq('in cima chi aspetta di più', views[0].who, 'Marco Lucci')
/* Chi ha preso più del maturato non è un errore: è un anticipo sui mesi dopo. */
eq('l\'anticipo ha segno negativo',
   payoutViews([{ key: 'p:p1', label: 'W', amount: 5000 }], facts)[0].open, -3990)

// ── §227 · da quando si conta, e quando esce ────────────────────────────────
/* Il compenso di un mese esce nel mese dopo, come il costo del lavoro (§224):
   il conto economico non può dire che il compenso di luglio è in ritardo il 2. */
eq('il compenso di luglio esce ad agosto', payoutDue('2026-07-01'), '2026-08-01')
eq('e quello di dicembre a gennaio', payoutDue('2026-12-15'), '2027-01-01')

/* Prima della linea è tutto liquidato: i bonifici di prima non si guardano, o
   chiuderebbero uno scoperto che appartiene a un periodo già regolato. */
const dopo = payoutsFromBank(PAY, PEOPLE, PAYOUT_KINDS, '2026-07-01')
eq('i bonifici prima della linea non contano', dopo.get('p:p1')?.paid, 3380)
eq('senza linea si conta tutto', payoutsFromBank(PAY, PEOPLE).get('p:p1')?.paid, 8990)

/* L'imputazione è dal più vecchio: un bonifico paga l'arretrato più antico, non
   l'ultimo maturato. È l'unico ordine che una persona userebbe, ed è quello che
   fa emergere un debito che si trascina invece di nasconderlo. */
const ACC = [
  { month: '2026-07-01', amount: 9000 },
  { month: '2026-08-01', amount: 9500 },
  { month: '2026-09-01', amount: 6000 },
]
eq('niente pagato: tutto resta, ognuno nel mese dopo',
   payoutSchedule(ACC, 0),
   [{ month: '2026-08-01', amount: 9000 }, { month: '2026-09-01', amount: 9500 }, { month: '2026-10-01', amount: 6000 }])
eq('un pagamento consuma il più vecchio',
   payoutSchedule(ACC, 9000).map(x => x.month), ['2026-09-01', '2026-10-01'])
eq('e uno parziale lascia il resto',
   payoutSchedule(ACC, 12000), [{ month: '2026-09-01', amount: 6500 }, { month: '2026-10-01', amount: 6000 }])
eq('pagato tutto: niente da collocare', payoutSchedule(ACC, 25000), [])
/* Pagato più del maturato non produce un mese negativo: è un anticipo, e lo
   dice `payoutViews` col segno, non questa lista con un importo assurdo. */
eq('pagato oltre il maturato non inventa righe', payoutSchedule(ACC, 99999), [])
eq('gli accrual arrivano in disordine e non importa',
   payoutSchedule([ACC[2], ACC[0], ACC[1]], 9000).map(x => x.month), ['2026-09-01', '2026-10-01'])

// ── §230 · il consolidato ───────────────────────────────────────────────────
/* Prima della linea i conti sono chiusi: le spunte che nessun movimento
   certifica non sono lavoro arretrato, e segnalarle per sempre insegna solo a
   ignorare le segnalazioni. Vale anche per il personale, che nei mesi vecchi è
   stato preparato con l'organico di oggi. */
const CONS = certify(LINES, TXS, '2026-07-01')
eq('un mese prima della linea è consolidato', CONS.get('c')?.state, 'consolidata')
eq('e non conta fra le dichiarate', certSummary(Array.from(CONS.values())).dichiarate, 0)
/* Quattro e non cinque: la riga non pagata e senza movimento resta fuori
   dall'elenco anche qui — non è ancora successo niente, e un mese consolidato
   non trasforma un fatto mancante in un fatto. */
eq('ma si conta a parte', certSummary(Array.from(CONS.values())).consolidate, 4)
/* Dopo la linea si verifica come sempre: il consolidato è una data, non un
   interruttore che spegne i controlli. */
const DOPO = certify(
  [line({ id: 'n', side: 'entrata', month: '2026-08-01', paid: true, paid_on: '2026-08-15' })],
  [], '2026-07-01')
eq('dopo la linea si verifica come sempre', DOPO.get('n')?.state, 'dichiarata')
eq('senza linea non consolida niente', certSummary(Array.from(C.values())).consolidate, 0)
eq('ogni stato ha una frase, consolidata compresa', !!CERT_LABEL.consolidata, true)

// ── §228 · la liquidazione è per persona, non una data per tutti ────────────
/* I soci hanno bonifici in banca fino a giugno: da luglio si riparte da zero.
   Antonio non ne ha mai ricevuto uno — e a chi non ha mai preso niente non si
   può dire che fino a giugno è a posto: per lui si conta da sempre. */
const ACCR = [
  { key: 'p:p1', month: '2026-05-01', amount: 4000 },
  { key: 'p:p1', month: '2026-07-01', amount: 3000 },
  { key: 'p:p1', month: '2026-08-01', amount: 2000 },
  { key: 'o:Antonio Giarletta', month: '2026-05-01', amount: 600 },
  { key: 'o:Antonio Giarletta', month: '2026-07-01', amount: 400 },
  { key: 'o:Antonio Giarletta', month: '2026-08-01', amount: 245 },
]
const LED = payoutLedger({
  people: [{ key: 'p:p1', label: 'Walter Giacobbe' }, { key: 'o:Antonio Giarletta', label: 'Antonio Giarletta' }],
  accruals: ACCR, facts, from: '2026-07-01',
})
const led = new Map(LED.map(v => [v.who, v]))
eq('chi è stato pagato parte dalla linea', led.get('Walter Giacobbe')?.from, '2026-07-01')
eq('e conta solo il maturato da lì', led.get('Walter Giacobbe')?.due, 5000)
/* I bonifici di giugno appartengono al periodo liquidato: contarli qui
   chiuderebbe un arretrato di luglio con un pagamento di giugno. */
eq('e solo i bonifici da agosto', led.get('Walter Giacobbe')?.paid, 0)
eq('chi non è mai stato pagato non ha una linea', led.get('Antonio Giarletta')?.from, null)
eq('e lo dice perché', led.get('Antonio Giarletta')?.whyFrom, 'mai-pagato')
/* Il numero che questa sezione esiste per far vedere: tutto il maturato, da
   sempre, perché non gliene è mai arrivato un euro. */
eq('per lui si conta da sempre', led.get('Antonio Giarletta')?.due, 1245)
eq('ed è marcato come mai pagato', led.get('Antonio Giarletta')?.never, true)
/* §233 — e chi è stato pagato **prima** della linea non è «mai pagato»: i suoi
   bonifici hanno chiuso i mesi precedenti, e dentro la finestra risulta a zero
   perché quella è la domanda giusta. Dirgli «mai ricevuto un bonifico» dopo
   avergliene versati seimila è la stessa frase detta a due situazioni opposte. */
eq('chi è stato pagato prima della linea non è «mai pagato»',
   { paid: led.get('Walter Giacobbe')?.paid, never: led.get('Walter Giacobbe')?.never },
   { paid: 0, never: false })
/* Ognuno porta il suo scadenzario: il compenso di un mese esce in quello dopo. */
eq('lo scadenzario di chi non ha mai preso niente parte dal primo mese',
   led.get('Antonio Giarletta')?.schedule.map(x => x.month),
   ['2026-06-01', '2026-08-01', '2026-09-01'])
eq('quello dell\'altro parte dalla linea',
   led.get('Walter Giacobbe')?.schedule.map(x => x.month), ['2026-08-01', '2026-09-01'])
// senza linea generale valgono tutti i mesi per tutti
eq('senza linea si conta tutto per tutti',
   payoutLedger({ people: [{ key: 'p:p1', label: 'W' }], accruals: ACCR, facts, from: null })[0].due, 9000)

/* §311 — il maturato e l'erogabile sono due numeri e devono restare due.
   `accruals` arriva già filtrato dalla finestra (§286): finché il maturato non
   aveva un campo suo, l'unica cifra visibile era l'erogabile, e la pagina la
   chiamava «maturato» — ad Antonio Giarletta diceva 284 € su 1.821 maturati. */
eq('senza il maturato niente cambia', led.get('Antonio Giarletta')?.accrued, 1245)
const MAT = [
  { key: 'p:p1', month: '2026-07-01', amount: 5200 },
  { key: 'p:p1', month: '2026-08-01', amount: 4400 },
  { key: 'o:Antonio Giarletta', month: '2026-05-01', amount: 900 },
  { key: 'o:Antonio Giarletta', month: '2026-07-01', amount: 700 },
  { key: 'o:Antonio Giarletta', month: '2026-08-01', amount: 1121 },
]
const LED2 = new Map(payoutLedger({
  people: [{ key: 'p:p1', label: 'Walter Giacobbe' }, { key: 'o:Antonio Giarletta', label: 'Antonio Giarletta' }],
  accruals: ACCR, matured: MAT, facts, from: '2026-07-01',
}).map(v => [v.who, v]))
eq('il maturato è più alto dell\'erogabile',
   { acc: LED2.get('Antonio Giarletta')?.accrued, due: LED2.get('Antonio Giarletta')?.due },
   { acc: 2721, due: 1245 })
/* La linea vale per entrambi: chi è stato liquidato non torna a essere creditore
   dei mesi chiusi solo perché qui si guarda il maturato invece dell'erogabile. */
eq('e rispetta la stessa linea', LED2.get('Walter Giacobbe')?.accrued, 9600)
/* `open` resta la differenza sull'erogabile — è quello che si può bonificare
   adesso — e `owed` è il credito vero: due domande, due numeri. */
eq('resta da erogare sull\'erogabile',
   { open: LED2.get('Walter Giacobbe')?.open, owed: LED2.get('Walter Giacobbe')?.owed },
   { open: 5000, owed: 9600 })
/* §228 — e chi non ha mai preso un euro conta da sempre anche sul maturato:
   è il caso da cui questo controllo nasce. */
eq('chi non è mai stato pagato conta da sempre anche sul maturato',
   LED2.get('Antonio Giarletta')?.owed, 2721)

// ────────────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)
