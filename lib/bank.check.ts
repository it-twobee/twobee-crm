/* Verifica del conto corrente. Esegui: npx tsx lib/bank.check.ts */
import {
  classify, balance, runningBalance, buckets, bucketKey, bucketLabel, weekStart,
  compare, matchCandidates, unreconciled, forecast, bankInsights, byCounterparty,
  byKind, daysToCash, grossOf, isStructural, liquidity, fundingNeed,
  type BankTx, type PlLineRef, type Expected,
} from '@/lib/bank'

let fail = 0
const eq = (label: string, got: number, want: number, tol = 0.01) => {
  const ok = Math.abs(got - want) <= tol
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${got.toFixed(2).padStart(11)}${ok ? '' : `  atteso ${want.toFixed(2)}`}`)
}
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const tx = (o: Partial<BankTx>): BankTx => ({
  id: Math.random().toString(36).slice(2), account_id: 'a',
  booked_on: '2026-07-01', value_on: '2026-07-01', amount: 0,
  description: '', counterparty: null, kind: 'altro', doc_ref: null,
  source: 'banca', revenue_line_id: null, cost_line_id: null,
  matched_at: null, no_match_needed: false, ...o,
})
const line = (o: Partial<PlLineRef>): PlLineRef => ({
  id: 'l', month: '2026-06-01', label: 'riga', net: 0, vatRate: 0.22,
  paid: false, direction: 'in', ...o,
})
const conto = { opening_balance: 0, opening_date: '2026-04-24' }

console.log('\n— Le descrizioni della banca, rese leggibili —')
{
  // le cinque forme di riferimento fattura viste nello stesso estratto conto
  const casi: [string, number, string | null, string | null][] = [
    ['bonif. vs. favore - bon.da leo fatima fattura 1/26', 3660, 'Leo Fatima', '1/26'],
    ['bonif. vs. favore - bon.da leo fatima fattura n. 36', 3812.5, 'Leo Fatima', '36'],
    ['bonif. vs. favore - bon.da tailors style srl pag fatt nr pfr 6/26 servizio', 4880, 'Tailors Style', '6/26'],
    ['bonif. vs. favore - bon.da icuraimpresa s r l saldo fattura nr. f pr 28/26 del', 4392, 'Icuraimpresa', '28/26'],
    ['bonif. vs. favore - bon.da marietta srl fat- 3-26', 1464, 'Marietta', '3'],
  ]
  for (const [d, amt, chi, doc] of casi) {
    const c = classify(d, amt, '480')
    is(`«${d.slice(24, 52)}» → ${doc}`, c.docRef, doc)
    if (chi) is(`   e la controparte`, c.counterparty, chi)
  }
}
{
  // le uscite: il beneficiario sta dopo «favore» e va ripulito
  const c = classify('vostra disposizione - vs.disp. rif. mbvt25166432/00564305  favore affinity srl                       notprovide', -2100, '260')
  is('uscita: beneficiario', c.counterparty, 'Affinity')
  is('uscita: è un pagamento', c.kind, 'pagamento')

  is('commissione riconosciuta',
    classify('comm.su bonifici - rif.mbvt29582010    comm.bon. telematico sct/ ist', -1.5, '662').kind, 'commissione')
  is('F24 riconosciuto',
    classify('i24 agenzia entrate - pag.to telematico', -941.42, '198').kind, 'imposta')
  is('stipendi riconosciuti',
    classify('vs.disp. rif. mb0b91348982/90535572  favore beneficiari vari distinta - add.tot', -3868, '260').kind, 'stipendio')
  is('conferimento socio riconosciuto',
    classify('bon.da lucci marco quota nominale societaria', 1225, '480').kind, 'finanziamento')
  is('addebito SDD: il fornitore è il nome dopo il mandato',
    classify('addebito diretto sdd - sdd core: iylmahpdza6a5qas asana', -304.9, '50C').counterparty, 'Asana')
  is('bollo: commissione', classify('imposta di bollo cc e lr - da 24/04/2026 a 30/06/2026', -21.98, '195').kind, 'commissione')
}

console.log('\n— Saldo: un bonifico esiste una volta sola —')
{
  const txs = [
    tx({ amount: 1275, booked_on: '2026-04-28', source: 'banca' }),
    tx({ amount: -1200, booked_on: '2026-04-28', source: 'banca' }),
    tx({ amount: 3660, booked_on: '2026-05-13', source: 'banca' }),
    // un incasso dichiarato nel conto economico ma non ancora sull'estratto
    tx({ amount: 2440, booked_on: '2026-07-01', source: 'derivato' }),
  ]
  const b = balance(conto, txs)
  eq('saldo reale: solo i movimenti della banca', b.real, 3735)
  eq('saldo dichiarato: anche il derivato', b.declared, 6175)
  eq('la differenza è quanto stai dando per fatto', b.pending, 2440)
  eq('entrate reali', b.inflow, 4935)
  eq('uscite reali', b.outflow, -1200)
  is('ultimo movimento reale', b.lastBookedOn, '2026-05-13')

  // il saldo di apertura conta: senza, è un numero relativo
  eq('con 5.000 di apertura', balance({ opening_balance: 5000 }, txs).real, 8735)
  // e il saldo a una data passata non vede il futuro
  eq('saldo al 30/04', balance(conto, txs, '2026-04-30').real, 75)
}

console.log('\n— La curva del saldo —')
{
  const txs = [
    tx({ amount: 1000, booked_on: '2026-05-01' }),
    tx({ amount: -300, booked_on: '2026-05-01' }),
    tx({ amount: 500, booked_on: '2026-05-05' }),
    tx({ amount: 200, booked_on: '2026-05-03', source: 'derivato' }),
  ]
  const c = runningBalance(conto, txs)
  is('un punto per giorno, non per movimento', c.length, 2)
  eq('primo giorno: 1.000 − 300', c[0].balance, 700)
  eq('e il suo delta', c[0].delta, 700)
  eq('secondo giorno cumulato', c[1].balance, 1200)
  is('il derivato non sporca la curva reale', c.some(p => p.date === '2026-05-03'), false)
}

console.log('\n— Periodi —')
{
  is('lunedì della settimana del 4 agosto 2026', weekStart('2026-08-04'), '2026-08-03')
  is('domenica appartiene alla settimana che inizia il lunedì prima',
    weekStart('2026-08-09'), '2026-08-03')
  is('chiave settimana', bucketKey('2026-08-05', 'week'), '2026-08-03')
  is('chiave mese', bucketKey('2026-08-05', 'month'), '2026-08')
  is('chiave trimestre', bucketKey('2026-08-05', 'quarter'), '2026-T3')
  is('marzo è nel primo trimestre', bucketKey('2026-03-31', 'quarter'), '2026-T1')
  is('aprile nel secondo', bucketKey('2026-04-01', 'quarter'), '2026-T2')
  is('chiave anno', bucketKey('2026-08-05', 'year'), '2026')
  is('etichetta mese', bucketLabel('2026-08', 'month'), 'agosto 2026')
  is('etichetta trimestre', bucketLabel('2026-T3', 'quarter'), '2026 · trimestre 3')

  const txs = [
    tx({ amount: 1000, booked_on: '2026-06-10' }),
    tx({ amount: -400, booked_on: '2026-06-20' }),
    tx({ amount: 2000, booked_on: '2026-07-05' }),
    tx({ amount: -500, booked_on: '2026-07-06' }),
  ]
  const mesi = buckets(txs, 'month', { balance: 0, complete: true })
  is('due mesi', mesi.length, 2)
  eq('giugno: entrate', mesi[0].inflow, 1000)
  eq('giugno: uscite', mesi[0].outflow, -400)
  eq('giugno: netto', mesi[0].net, 600)
  eq('giugno: saldo di chiusura', mesi[0].closing ?? -1, 600)
  eq('luglio: saldo di chiusura cumulato', mesi[1].closing ?? -1, 2100)
  // senza la storia completa il saldo di chiusura è un numero falso: non si dà
  is('finestra parziale: nessun saldo di chiusura', buckets(txs, 'month')[0].closing, null)

  const trim = buckets(txs, 'quarter', { balance: 0, complete: true })
  is('due trimestri diversi', trim.map(t => t.key), ['2026-T2', '2026-T3'])
}

console.log('\n— Confronto fra periodi —')
{
  is('crescita', compare(1200, 1000), { delta: 200, pct: 0.2 })
  is('calo', compare(800, 1000), { delta: -200, pct: -0.2 })
  is('da zero non si calcola una percentuale', compare(500, 0), { delta: 500, pct: null })
  // su una base negativa la percentuale usa il valore assoluto, altrimenti il
  // segno si ribalta e un miglioramento sembra un peggioramento
  is('base negativa', compare(-500, -1000), { delta: 500, pct: 0.5 })
}

console.log('\n— Riconciliazione: tre indizi, nessun aggancio automatico —')
{
  const righe = [
    line({ id: 'ok', label: 'iCura Impresa — Canone — Rata 28/26', clientName: 'iCura Impresa', net: 3600 }),
    line({ id: 'importo', label: 'Sartoria Condotti — Canone', clientName: 'Sartoria Condotti', net: 3600 }),
    line({ id: 'altro', label: 'Marietta — Canone', clientName: 'Marietta', net: 1200 }),
    line({ id: 'pagata', label: 'iCura — già incassata', clientName: 'iCura Impresa', net: 3600, paid: true }),
    line({ id: 'uscita', label: 'un costo', net: 3600, direction: 'out' }),
  ]
  const m = tx({
    amount: 4392, description: 'bon.da icuraimpresa s r l saldo fattura nr. f pr 28/26',
    counterparty: 'Icuraimpresa S R L', doc_ref: '28/26',
  })
  const c = matchCandidates(m, righe)
  is('la prima è quella giusta', c[0].line.id, 'ok')
  is('e il punteggio è alto', c[0].score >= 0.9, true)
  is('spiega perché', c[0].why.length >= 2, true)
  is('le righe già incassate non si propongono', c.some(x => x.line.id === 'pagata'), false)
  is('né quelle nella direzione sbagliata', c.some(x => x.line.id === 'uscita'), false)
  is('un importo uguale ma cliente diverso resta candidato, più in basso',
    c.some(x => x.line.id === 'importo'), true)
  is('e sta dopo quella col numero fattura',
    c.findIndex(x => x.line.id === 'ok') < c.findIndex(x => x.line.id === 'importo'), true)

  // 3.600 netti fanno 4.392 lordi: è il conto che la banca mostra
  eq('lordo di 3.600 + 22%', grossOf({ net: 3600, vatRate: 0.22 }), 4392)

  // un movimento senza candidati non deve inventare abbinamenti
  const nulla = matchCandidates(tx({ amount: 77.5, description: 'canone hosting' }), righe)
  is('nessun candidato plausibile', nulla.length, 0)
}

console.log('\n— Cosa resta da riconciliare —')
{
  const txs = [
    tx({ id: 'x', amount: 4392, kind: 'incasso' }),
    tx({ id: 'fatto', amount: 1464, kind: 'incasso', revenue_line_id: 'l1' }),
    tx({ id: 'comm', amount: -1.5, kind: 'commissione' }),
    tx({ id: 'f24', amount: -941, kind: 'imposta' }),
    tx({ id: 'ignora', amount: -500, kind: 'pagamento', no_match_needed: true }),
    tx({ id: 'derivato', amount: 2000, kind: 'incasso', source: 'derivato' }),
  ]
  is('solo quello che aspetta davvero una risposta', unreconciled(txs).map(t => t.id), ['x'])
  is('commissioni e imposte non fanno rumore', isStructural(txs[2]), true)
  is('un pagamento a fornitore invece sì', isStructural(txs[4]), false)
}

console.log('\n— Previsione: il giorno in cui la cassa non basta —')
{
  const att: Expected[] = [
    { date: '2026-08-10', label: 'iCura luglio', amount: 4392, kind: 'credito', overdue: false, source: 'riga' },
    { date: '2026-08-15', label: 'stipendi', amount: -3868, kind: 'debito', overdue: false, source: 'piano' },
    { date: '2026-08-20', label: 'F24', amount: -941, kind: 'debito', overdue: false, source: 'piano' },
    { date: '2026-09-30', label: 'oltre orizzonte', amount: -9999, kind: 'debito', overdue: false, source: 'piano' },
  ]
  const f = forecast('2026-08-04', 1000, att, 30)
  eq('parte dal saldo di oggi', f.balanceStart, 1000)
  is('quello che cade oltre l\'orizzonte resta fuori', f.items.length, 3)
  eq('entrate attese', f.incoming, 4392)
  eq('uscite attese', f.outgoing, -4809)
  /* 1.000 + 4.392 − 3.868 − 941 = 583: resta positiva per 583 €. Nessun
     break-even, e il punto più basso è quello — la soglia da guardare. */
  is('non va sotto zero, ma di poco', f.breakEven, null)
  eq('il punto più basso', f.lowest?.balance ?? 0, 583)
  // basta un pagamento in più e la cassa non basta
  is('con 700 in più di uscite va sotto',
    forecast('2026-08-04', 1000, [...att.slice(0, 3),
      { date: '2026-08-25', label: 'fornitore', amount: -700, kind: 'debito', overdue: false, source: 'piano' }],
      30).breakEven, '2026-08-25')

  // uno scaduto non è una previsione: si data a oggi e si vede in cima
  const conScaduto = forecast('2026-08-04', 500, [
    { date: '2026-06-30', label: 'fattura scaduta', amount: 1800, kind: 'credito', overdue: false, source: 'riga' },
  ], 30)
  is('lo scaduto è datato a oggi', conScaduto.items[0].date, '2026-08-04')
  is('e marcato come tale', conScaduto.items[0].overdue, true)

  // senza niente in previsione la curva è il solo saldo di partenza
  const vuota = forecast('2026-08-04', 2500, [], 90)
  is('nessun movimento atteso', vuota.items.length, 0)
  is('nessun break-even', vuota.breakEven, null)
  eq('la curva è il saldo di oggi', vuota.curve[0].balance, 2500)
}

console.log('\n— Diagnosi —')
{
  const bal = balance(conto, [tx({ amount: 3000, booked_on: '2026-06-01' })])
  const ids = bankInsights({
    today: '2026-08-04', bal, txs: [], overdueIn: 11500, overdueOut: 0,
    fc: forecast('2026-08-04', 3000, [], 90),
  }).map(f => f.id)
  is('avvisa che il saldo è vecchio', ids.includes('stale'), true)
  is('e che i crediti scaduti superano il saldo', ids.includes('overdue-in'), true)

  const critico = bankInsights({
    today: '2026-08-04', bal, txs: [], overdueIn: 0, overdueOut: 0, vatDue: 6000,
    fc: forecast('2026-08-04', 3000, [
      { date: '2026-08-20', label: 'x', amount: -5000, kind: 'debito', overdue: false, source: 'piano' },
    ], 90),
  })
  is('la cassa sotto zero è critica',
    critico.find(f => f.id === 'break-even')?.severity, 'critico')
  is('l\'IVA che non c\'è sul conto è critica',
    critico.find(f => f.id === 'vat')?.severity, 'critico')
  is('e i critici stanno in cima', critico[0].severity, 'critico')

  const commissioni = Array.from({ length: 40 }, () => tx({ amount: -3, kind: 'commissione' }))
  is('sopra i 100 € le commissioni si segnalano',
    bankInsights({ today: '2026-08-04', bal, txs: commissioni, overdueIn: 0, overdueOut: 0,
      fc: forecast('2026-08-04', 3000, [], 90) }).some(f => f.id === 'fees'), true)
}

console.log('\n— Con chi girano i soldi —')
{
  const txs = [
    tx({ amount: 4392, counterparty: 'iCura Impresa', kind: 'incasso', booked_on: '2026-07-21' }),
    tx({ amount: 8784, counterparty: 'iCura Impresa', kind: 'incasso', booked_on: '2026-06-09' }),
    tx({ amount: -2100, counterparty: 'Affinity', kind: 'pagamento' }),
    tx({ amount: -3050, counterparty: 'Affinity', kind: 'pagamento' }),
    tx({ amount: -1.5, counterparty: null, kind: 'commissione' }),
  ]
  const all = byCounterparty(txs)
  is('il più grosso in valore assoluto è iCura', all[0].name, 'iCura Impresa')
  eq('e vale la somma dei suoi bonifici', all[0].net, 13176)
  is('due movimenti', all[0].count, 2)
  is('l\'ultima data è la più recente', all[0].lastOn, '2026-07-21')
  is('chi non è riconosciuto ha un nome comunque',
    all.some(c => c.name === '(non riconosciuto)'), true)
  is('solo le uscite, se richiesto', byCounterparty(txs, 'out').map(c => c.name),
    ['Affinity', '(non riconosciuto)'])

  const kinds = byKind(txs)
  is('tre tipi presenti', kinds.length, 3)
  eq('incassi', kinds.find(k => k.kind === 'incasso')!.inflow, 13176)
  eq('pagamenti', kinds.find(k => k.kind === 'pagamento')!.outflow, -5150)
}

console.log('\n— Giorni per farsi pagare —')
{
  // competenza giugno, incasso il 21 luglio: 21 giorni dalla fine del mese
  const d = daysToCash([
    { month: '2026-06-01', bookedOn: '2026-07-21' },
    { month: '2026-05-01', bookedOn: '2026-06-09' },
  ])
  eq('media', d.avg ?? -1, 14)
  eq('il peggiore', d.worst ?? -1, 20)
  is('quanti ne ha contati', d.count, 2)
  is('senza dati non si inventa una media', daysToCash([]).avg, null)
}

console.log('\n— §190: più conti, e il conto delle spese —')
{
  const principale = { id: 'p', opening_balance: 0 }
  const vivid = { id: 'v', opening_balance: 0 }
  const txs = [
    tx({ account_id: 'p', amount: 10000, booked_on: '2026-07-01' }),
    // il bonifico ricorrente: esce dal principale, entra su Vivid
    tx({ account_id: 'p', amount: -1000, booked_on: '2026-07-14', kind: 'giroconto',
         transfer_account_id: 'v', transfer_pair_id: 'in1' }),
    tx({ id: 'in1', account_id: 'v', amount: 1000, booked_on: '2026-07-14', kind: 'giroconto',
         transfer_account_id: 'p', transfer_pair_id: 'out1' }),
    tx({ account_id: 'v', amount: -304.9, booked_on: '2026-07-19', kind: 'pagamento', counterparty: 'Asana' }),
  ]
  const l = liquidity([principale, vivid], txs)
  eq('il principale', l.perAccount[0].real, 9000)
  eq('Vivid', l.perAccount[1].real, 695.1)
  /* Il giroconto non muove la liquidità: esce da un conto ed entra nell'altro.
     9.000 + 695,10 = 9.695,10 = 10.000 incassati meno 304,90 spesi. */
  eq('liquidità totale', l.total, 9695.1)
  eq('nessun giroconto in sospeso', l.pendingTransfers, 0)

  // se manca il lato in entrata, la liquidità sembra più bassa: si dichiara
  const mancante = liquidity([principale, vivid], [
    tx({ account_id: 'p', amount: 10000 }),
    tx({ account_id: 'p', amount: -1000, kind: 'giroconto', transfer_account_id: 'v' }),
  ])
  eq('liquidità apparente', mancante.total, 9000)
  eq('e il giroconto in sospeso lo spiega', mancante.pendingTransfers, 1000)
}

console.log('\n— Il fabbisogno del bonifico ricorrente —')
{
  const spese = [
    { label: 'Asana', amount: 90.66, center_id: 'c1', centerName: 'Struttura & Software' },
    { label: 'Google Cloud', amount: 37.05, center_id: 'c1', centerName: 'Struttura & Software' },
    { label: 'Advertising TwoBee', amount: 400, center_id: 'c2', centerName: 'Marketing TwoBee' },
  ]
  const n = fundingNeed({ funding_amount: 500 }, spese, 695.1)
  eq('le spese del mese', n.monthly, 527.71)
  eq('il bonifico dichiarato', n.configured ?? 0, 500)
  // 527,71 di spese contro 500 di provvista: 27,71 al mese di erosione
  eq('lo scarto è un ammanco', n.gap, 27.71)
  is('la voce più grossa in cima', n.items[0].label, 'Advertising TwoBee')
  eq('col saldo attuale regge poco più di un mese', n.monthsCovered ?? 0, 1.3)

  // senza un bonifico dichiarato, il fabbisogno è tutto da coprire
  eq('bonifico non configurato: serve tutto', fundingNeed({ funding_amount: null }, spese, 0).gap, 527.71)
  is('e non si inventa un valore', fundingNeed({ funding_amount: null }, spese, 0).configured, null)
  // nessuna spesa collegata: nessun fabbisogno, e nessuna divisione per zero
  is('nessuna spesa, nessun mese calcolabile', fundingNeed({ funding_amount: 500 }, [], 300).monthsCovered, null)
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
