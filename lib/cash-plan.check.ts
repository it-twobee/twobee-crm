/**
 * Gate di `lib/cash-plan.ts`. I casi sono quelli di agosto 2026. (§262)
 *
 *   npx tsx lib/cash-plan.check.ts
 */
import { planMonth, simulate, outcomes, advice, type PlanMonth } from './cash-plan'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}

const TODAY = '2026-08-09'
const AGO = '2026-08-01'

const LINES = [
  // già incassata il 3 agosto: è un fatto del mese, non un'attesa
  { id: 'r1', side: 'entrata' as const, label: 'Fatima Leo — canone', who: 'Fatima Leo',
    gross: 3812.50, due: '2026-08-15', month: AGO, paid: true, paidOn: '2026-08-03' },
  // in scadenza: la paga chi paga sempre
  { id: 'r2', side: 'entrata' as const, label: 'iCura — canone', who: 'iCura',
    gross: 4392, due: '2026-08-15', month: AGO, paid: false },
  // arretrato di giugno: non è cassa di giugno, è una telefonata di adesso
  { id: 'r3', side: 'entrata' as const, label: 'Seven — saldo', who: 'Seven',
    gross: 5490, due: '2026-06-15', month: '2026-06-01', paid: false },
  { id: 'c1', side: 'uscita' as const, label: 'Software e hosting', who: null,
    gross: 1200, due: '2026-08-31', month: AGO, paid: false },
  { id: 'c2', side: 'uscita' as const, label: 'Grafica sito', who: 'Studio X',
    gross: 650, due: '2026-08-20', month: AGO, paid: false, external: true },
  { id: 'c3', side: 'uscita' as const, label: 'Retribuzioni luglio', who: null,
    gross: 5392, due: '2026-08-20', month: '2026-07-01', paid: false, payroll: true },
]

const PAYOUTS = [
  { key: 'p:1', who: 'Walter Giacobbe', kind: 'socio' as const, amount: 1010, from: '2026-07-01' },
  { key: 'p:2', who: 'Marco Lucci', kind: 'socio' as const, amount: 1010, from: '2026-07-01' },
  { key: 'o:antonio', who: 'Antonio Giarletta', kind: 'commerciale' as const, amount: 405, from: '2026-07-01' },
]

/* §264 — una riga di agosto **di agosto** anche se i soldi escono a settembre:
   il costo del lavoro di agosto si paga il 20 settembre. */
const AGO_PAYROLL = {
  id: 'c4', side: 'uscita' as const, label: 'Retribuzioni agosto', who: null,
  gross: 5392, due: '2026-09-20', month: AGO, paid: false, payroll: true,
}
const items = planMonth({
  month: AGO, today: TODAY, open: true, lines: [...LINES, AGO_PAYROLL], planned: [],
  dues: [{ date: '2026-08-20', amount: 9669.33, label: '2º trimestre 2026' }],
  payouts: PAYOUTS,
})

eq('ogni fatto atteso ha una riga', items.length, 7 + 1 + 3)

/* §264 — l'appartenenza è quella del conto economico: le righe di agosto sono
   di agosto, pagate o no, e l'elenco deve combaciare con quella pagina. */
eq('le voci del mese sono quelle del conto economico',
  items.filter(x => x.accrual).map(x => x.id).sort(),
  ['f:r1', 'o:c1', 'o:c2', 'o:c4', 'o:r2'])
eq('l\'arretrato di giugno non è del mese', items.find(x => x.id === 'o:r3')?.accrual, false)
/* §267 — un incasso **già avvenuto** a maggio è cassa di maggio e basta. Lo
   spostamento sul primo mese della catena vale solo per quello che non si è
   mosso: applicarlo anche ai fatti chiusi riempiva agosto di venticinque righe
   che nessuno doveva più guardare. */
const VECCHIA = planMonth({
  month: AGO, today: TODAY, open: true, since: AGO, planned: [], dues: [], payouts: [],
  lines: [{ id: 'v1', side: 'entrata', label: 'Sartoria — canone di maggio', who: 'Sartoria',
    gross: 2440, due: '2026-05-15', month: '2026-05-01', paid: true, paidOn: '2026-05-15' }],
})
eq('un incasso di maggio non entra in agosto', VECCHIA.length, 0)
eq('ma i suoi soldi si muovono adesso', items.find(x => x.id === 'o:r3')?.movesIn, true)
eq('lo stipendio di luglio non è del mese', items.find(x => x.id === 'o:c3')?.accrual, false)
eq('e quello di agosto è del mese ma non ne muove la cassa',
  [items.find(x => x.id === 'o:c4')?.accrual, items.find(x => x.id === 'o:c4')?.movesIn],
  [true, false])
eq('e lo dice invece di sparire', items.find(x => x.id === 'o:c4')?.why,
  'di questo mese, esce settembre')
/* IVA e compensi non sono righe di conto economico: escono dal conto ma non
   entrano nel totale che deve combaciare con quella pagina. */
eq('l\'IVA non è una riga del mese', items.find(x => x.group === 'iva')?.accrual, false)
eq('nemmeno i compensi', items.filter(x => x.movable).every(x => !x.accrual), true)
eq('l\'incasso già arrivato è un fatto, non un\'attesa',
  items.find(x => x.id === 'f:r1')?.state, 'mosso')
eq('e non compare due volte', items.filter(x => x.label.includes('Fatima')).length, 1)
eq('l\'arretrato di giugno pesa su agosto',
  items.find(x => x.id === 'o:r3')?.state, 'scaduto')
eq('col suo ritardo in giorni', items.find(x => x.id === 'o:r3')?.lateDays, 55)
eq('lo stipendio di luglio esce ad agosto e non è in ritardo',
  items.find(x => x.id === 'o:c3')?.state, 'atteso')
/* §184 — il costo del lavoro è «Persone», non struttura: dentro un'area del
   piano sembrerebbe una spesa decisa questo mese. */
eq('il costo del lavoro sta nel suo gruppo', items.find(x => x.id === 'o:c3')?.group, 'personale')
eq('il subappalto pure', items.find(x => x.id === 'o:c2')?.group, 'esterni')
eq('l\'IVA è una voce sua', items.find(x => x.group === 'iva')?.gross, 9669.33)
/* §237 — l'unica uscita spostabile sono i compensi: se lo fosse anche l'IVA il
   modello suggerirebbe di non versarla. */
eq('spostabili sono solo i compensi',
  Array.from(new Set(items.filter(x => x.movable).map(x => x.group))), ['compensi'])
eq('e sono tre persone', items.filter(x => x.movable).length, 3)

const MESE: PlanMonth = { month: AGO, opening: 12000, open: true, items }

/* Il saldo di partenza è quello di **inizio mese**: i fatti del mese si sommano
   da lì, o l'incasso del 3 agosto verrebbe contato due volte. */
const t = simulate([MESE], new Set())[0]
eq('in cassa entra quello che si muove adesso', t.inflow, 3812.50 + 4392 + 5490)
eq('ed esce quello che si muove adesso', t.outflow, 1200 + 650 + 5392 + 9669.33 + 1010 + 1010 + 405)
/* §264 — il numero che deve combaciare col conto economico di agosto: le sue
   righe, pagate o no, e **solo** quelle. Le retribuzioni di agosto ci sono anche
   se escono a settembre; quelle di luglio no, anche se escono adesso. */
eq('di competenza entrano le righe del mese', t.accrualIn, 3812.50 + 4392)
eq('e ne escono le sue', t.accrualOut, 1200 + 650 + 5392)
eq('saldo a fine mese', t.end, Math.round((12000 + t.inflow - t.outflow) * 100) / 100)
eq('quello che si è già mosso è dichiarato a parte', t.movedIn, 3812.50)
eq('e il resto è la parte su cui si può agire', t.openIn, 4392 + 5490)

/* I tre esiti: le uscite sono certe, gli incassi no. Un numero solo farebbe
   sembrare un fatto una speranza. */
const o = outcomes(MESE, new Set())
eq('se non incassa più niente', o.floor, Math.round((12000 + 3812.50 - t.outflow) * 100) / 100)
eq('se pagano i puntuali', o.expected, Math.round((o.floor + 4392) * 100) / 100)
eq('se rientrano anche gli scaduti', o.best, Math.round((o.expected + 5490) * 100) / 100)
eq('e sono in scala', o.floor <= o.expected && o.expected <= o.best, true)

/* Spegnere una voce non la cancella: dice cosa succede se quella cosa non
   accade. Ed è l'unico modo per sapere da cosa dipende il mese. */
const senzaSeven = simulate([MESE], new Set(['o:r3']))[0]
eq('spegnere un incasso lo toglie dal modello', senzaSeven.inflow, 3812.50 + 4392)
eq('e resta scritto quanto si è tolto', senzaSeven.offIn, 5490)
eq('il saldo scende di quel tanto', Math.round((t.end - senzaSeven.end) * 100) / 100, 5490)

/* Il mese dopo eredita il saldo: spegnere un incasso di agosto deve far
   scendere anche settembre, o il buco si richiuderebbe da solo. */
const SET: PlanMonth = {
  month: '2026-09-01', opening: 0, open: false,
  items: planMonth({
    month: '2026-09-01', today: TODAY, open: false, lines: [],
    planned: [
      { id: 'i1', side: 'entrata', label: 'iCura — canone', who: 'iCura', gross: 4392, due: '2026-09-15' },
      { id: 'u1', side: 'uscita', label: 'Software', who: null, gross: 1200, due: '2026-09-30' },
    ],
    dues: [], payouts: [], payroll: 5392,
  }),
}
/* Gli arretrati pesano sul **primo** mese della catena: senza `since` lo stesso
   scoperto comparirebbe in agosto e in settembre. */
const setSince = planMonth({
  month: '2026-09-01', today: TODAY, open: false, lines: LINES, planned: [],
  dues: [], payouts: [], since: AGO,
})
eq('l\'arretrato non torna nel mese dopo', setSince.some(x => x.id === 'o:r3'), false)

const chain = simulate([MESE, SET], new Set())
eq('il mese dopo parte dal saldo del primo', chain[1].opening, chain[0].end)
eq('e il piano lo compone voce per voce', SET.items.length, 3)
eq('con la stima del costo del lavoro dichiarata',
  SET.items.find(x => x.source === 'organico')?.state, 'stimato')
const chainSenza = simulate([MESE, SET], new Set(['o:r3']))
eq('spegnere agosto sposta anche settembre',
  Math.round((chain[1].end - chainSenza[1].end) * 100) / 100, 5490)

/* §263 — con l'ancora al saldo di oggi, quello che si è già mosso è **dentro**
   il saldo e non si somma: il modello parte dal numero che si legge in Banca. */
const ancorate = planMonth({
  month: AGO, today: TODAY, open: true, lines: LINES, planned: [], anchor: TODAY,
  dues: [{ date: '2026-08-20', amount: 9669.33, label: '2º trimestre 2026' }],
  payouts: PAYOUTS,
})
const ANCORA: PlanMonth = { month: AGO, opening: 15812.50, anchor: TODAY, open: true, items: ancorate }
eq('l\'incasso già arrivato è dentro il saldo',
  ancorate.find(x => x.id === 'f:r1')?.inBalance, true)
eq('e resta in elenco', ancorate.filter(x => x.state === 'mosso').length, 1)
const ta = simulate([ANCORA], new Set())[0]
eq('ma non si somma alle entrate', ta.inflow, 4392 + 5490)
eq('si legge a parte', ta.alreadyIn, 3812.50)
/* Il saldo di partenza (15.812,50 = 12.000 + 3.812,50) contiene già l'incasso:
   il fine mese deve essere lo stesso di prima, o l'incasso sarebbe contato due
   volte — ed è esattamente il difetto che l'ancora chiude. */
eq('e il fine mese è lo stesso', ta.end, t.end)
eq('anche gli esiti partono da lì', outcomes(ANCORA, new Set(), 15812.50).floor,
  Math.round((15812.50 - t.outflow) * 100) / 100)

/* I suggerimenti sono le leve che il mese **ha**, col loro numero: un consiglio
   che non si può quantificare è un consiglio che non si esegue. */
const povero: PlanMonth = { ...MESE, opening: 0 }
const sug = advice(povero, new Set())
/* §233 — il primo consiglio è sempre il **verdetto**, coi tre numeri: un saldo
   finale non dice su cosa poggia, e sono quattro situazioni che vogliono quattro
   azioni diverse. */
eq('prima il verdetto', sug[0].key, 'non-basta')
eq('poi quanto manca', sug[1].key, 'manca')
eq('e quanto manca è quanto manca', sug[1].amount, Math.round(-(0 + t.inflow - t.outflow) * 100) / 100)
eq('gli scaduti sono la prima leva', sug[2].key, 'incassa-scaduti')
eq('i compensi la seconda', sug[3].key, 'rimanda-compensi')
eq('e valgono quello che valgono', sug[3].amount, 1010 + 1010 + 405)
eq('l\'IVA è un vincolo, non una leva',
  sug.find(s => s.key === 'iva-vincolo')?.kind, 'vincolo')

/* Con un saldo che regge il consiglio cambia natura: quanto resta **davvero**,
   cioè al netto dell'IVA che è sul conto e non è tua. */
const senzaIva: PlanMonth = {
  month: AGO, opening: 60000, open: true,
  items: planMonth({ month: AGO, today: TODAY, open: true, lines: LINES, planned: [], dues: [], payouts: PAYOUTS }),
}
const ricco = advice(senzaIva, new Set(), { vatHeld: 9250, vatLabel: 'Il 3º trimestre' })
/* Con 60.000 € di apertura il mese regge **anche senza incassare niente**: il
   verdetto lo dice per primo, e «chiude a X» viene dopo. */
eq('prima il verdetto', ricco[0].key, 'regge')
eq('e poi quanto chiude', ricco[1].key, 'chiude')
eq('e l\'IVA che resta da versare non è capitale',
  ricco.find(s => s.key === 'iva-dopo')?.amount, 9250)
/* Quando la liquidazione cade **in** questo mese è già una riga di uscita:
   ripeterla come «da accantonare» la conterebbe due volte. */
eq('e non si ripete quando scade in questo mese',
  advice({ ...MESE, opening: 60000 }, new Set(), { vatHeld: 9250 }).some(s => s.key === 'iva-dopo'), false)

/* Un mese senza arretrati e senza compensi non ha leve interne, e dirlo è più
   utile che suggerire qualcosa di generico. */
const secco: PlanMonth = {
  month: AGO, opening: 0, open: true,
  items: planMonth({
    month: AGO, today: TODAY, open: true,
    lines: [LINES[3]], planned: [], dues: [], payouts: [],
  }),
}
eq('nessuna leva, e si dice', advice(secco, new Set()).some(s => s.key === 'niente-leve'), true)

if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)
