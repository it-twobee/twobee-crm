/**
 * Gate di `lib/payroll-ceiling.ts`. I numeri sono quelli veri del LUL di giugno
 * 2026 e dell'F24 dello stesso mese — non inventati, trascritti.
 *
 *   npx tsx lib/payroll-ceiling.check.ts
 */
import { splitEmployer, monthlyCeiling, ceilingTotals, EMPLOYER_BAND } from './payroll-ceiling'
import { DEFAULT_PAYROLL_PARAMS, type Payslip, type F24, type ContractKind } from './payroll'

let ok = 0
const fails: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { ok++; return }
  fails.push(`${label}\n    atteso: ${JSON.stringify(want)}\n    ottenuto: ${JSON.stringify(got)}`)
}
const near = (label: string, got: number, want: number, tol = 0.51) => {
  if (Math.abs(got - want) <= tol) { ok++; return }
  fails.push(`${label}\n    atteso: ${want} ±${tol}\n    ottenuto: ${got}`)
}

const PRM = { ...DEFAULT_PAYROLL_PARAMS, inpsEmployerPct: 0.30, inailPct: 0.005 }

const slip = (o: Partial<Payslip> & Pick<Payslip, 'personId' | 'contributoryBase'>): Payslip => ({
  id: `s-${o.personId}`, month: '2026-06-01',
  basePay: 0, holidaysTaken: 0, leavePaid: 0, publicHolidays: 0,
  thirteenth: 0, fourteenth: 0, overtime: 0, bonus: 0, allowances: 0,
  reimbursements: 0, travel: 0, totalEarnings: 0, taxableBase: 0,
  employeeContrib: 0, irpef: 0, surcharges: 0, otherDeductions: 0, rounding: 0,
  netPaid: 0, employerContrib: null, inail: null, otherEmployer: 0, tfrAccrued: 0,
  netPaidOn: null, f24PaidOn: null, paymentStatus: 'da_pagare', ...o,
})

// ── i tre cedolini di giugno 2026, dal LUL ──────────────────────────────────
const MICHELE = slip({
  personId: 'michele', contributoryBase: 1730.00, totalEarnings: 1861.80,
  taxableBase: 1567.62, employeeContrib: 161.93, irpef: 199.87, netPaid: 1500,
  travel: 57.00, allowances: 75.25, fourteenth: 128.48, tfrAccrued: 120.51,
})
const SABRINA = slip({
  personId: 'sabrina', contributoryBase: 1409.00, totalEarnings: 1654.27,
  taxableBase: 662.39, employeeContrib: 84.69, irpef: 2.38, rounding: 0.80, netPaid: 1568,
  travel: 213.00, allowances: 31.79, fourteenth: 116.50, tfrAccrued: 107.25,
})
const AGOSTINO = slip({
  personId: 'agostino', contributoryBase: 0, totalEarnings: 846.00,
  taxableBase: 797.71, employeeContrib: 2.29, irpef: 44.21, rounding: 0.50, netPaid: 800,
  basePay: 800, travel: 46.00,
})
const SLIPS = [MICHELE, SABRINA, AGOSTINO]
const KINDS = new Map<string, ContractKind>([
  ['michele', 'indeterminato'], ['sabrina', 'apprendistato'], ['agostino', 'tirocinio'],
])
const F24_GIUGNO: F24 = {
  month: '2026-06-01', erarioGross: 246.46, creditOffset: 107.04, erarioBalance: 139.42,
  inps: 802.00, inail: 0, other: 0, total: 941.42, paidOn: null, individualDetail: false,
}

// ── il cedolino quadra col modello ──────────────────────────────────────────
/* Se questi due non tornassero, tutto il resto sarebbe costruito su una
   trascrizione sbagliata: l'IRPEF dei tre cedolini **è** l'erario del modello, e
   l'indennità L. 207/2024 **è** il credito compensato. */
eq('l\'IRPEF dei cedolini fa l\'erario dell\'F24',
   Math.round((MICHELE.irpef + SABRINA.irpef + AGOSTINO.irpef) * 100) / 100, F24_GIUGNO.erarioGross)
eq('e le indennità esenti fanno il credito',
   Math.round((MICHELE.allowances + SABRINA.allowances) * 100) / 100, F24_GIUGNO.creditOffset)

// ── §235 · l'F24 conferma una ripartizione ──────────────────────────────────
const split = splitEmployer({ slips: SLIPS, kinds: KINDS, f24: F24_GIUGNO, params: PRM,
  apprenticeRates: new Map([['sabrina', PRM.inpsApprenticeY1Pct]]) })
eq('la ripartizione tiene', split.reconciled, true)
/* (802,00 − 161,93 − 84,69 − 1.409,00×3,11%) / 1.730,00 = 29,57%, non il 30%
   di listino. Su un anno sono 90 € di differenza per una persona sola: poco,
   ma è la differenza fra un numero letto e un numero supposto. */
near('l\'aliquota ordinaria si ricava dal modello', split.rateOrdinary * 100, 29.57, 0.01)
const by = new Map(split.people.map(p => [p.personId, p]))
near('Michele porta il residuo del DM10', by.get('michele')!.employer, 511.56)
near('l\'apprendista paga il 3,11%', by.get('sabrina')!.employer, 43.82)
eq('e il tirocinio non paga contributi datore', by.get('agostino')!.employer, 0)
eq('sull\'ordinario la fonte è il modello', by.get('michele')!.source, 'f24')
eq('sull\'apprendista è l\'aliquota di legge', by.get('sabrina')!.source, 'legge')
/* La somma torna al modello: è la proprietà che rende la ripartizione una
   verifica e non un'invenzione. */
near('e la somma è l\'INPS del modello',
   split.people.reduce((n, p) => n + p.employer + (p.kind === 'tirocinio' ? 0 : p.employee), 0),
   F24_GIUGNO.inps)

// ── quando il modello contiene altro, non si ripartisce ─────────────────────
/* Un F24 con dentro una sanzione o una rata farebbe salire l'aliquota ricavata
   a un numero che non è un'aliquota. Attribuirlo a una persona le
   raddoppierebbe il costo, e nessuno andrebbe a cercare perché. */
const sporco = splitEmployer({ slips: SLIPS, kinds: KINDS, params: PRM,
  f24: { ...F24_GIUGNO, inps: 1600 },
  apprenticeRates: new Map([['sabrina', PRM.inpsApprenticeY1Pct]]) })
eq('un modello con dentro altro non si ripartisce', sporco.reconciled, false)
eq('e si torna al listino', sporco.rateOrdinary, PRM.inpsEmployerPct)
eq('dicendolo', sporco.why.includes('fuori dalla banda'), true)
eq('la banda è dichiarata', [EMPLOYER_BAND.min, EMPLOYER_BAND.max], [0.24, 0.36])
/* Senza F24 non c'è niente da ricavare: vale il listino, e la riga lo dice. */
const senza = splitEmployer({ slips: SLIPS, kinds: KINDS, f24: null, params: PRM })
eq('senza modello vale il listino', senza.rateOrdinary, PRM.inpsEmployerPct)
eq('e non è una ripartizione verificata', senza.reconciled, false)

// ── il tetto di Michele ─────────────────────────────────────────────────────
const mic = monthlyCeiling({
  person: { id: 'michele', name: 'Michele Cristallo', kind: 'indeterminato', months: 14, targetNet: 1500 },
  slip: MICHELE, employer: 511.56, employerSource: 'f24', params: PRM,
})
/* Fisso: 1.730,00 imponibile + 511,56 contributi + 8,65 INAIL + 120,51 TFR. */
near('il fisso del mese', mic.fixed, 2370.27, 0.6)
/* Michele arriva esatto ai 1.500 promessi, e ci arriva **grazie** ai 57 € di
   trasferta: senza, la busta ne farebbe 1.443. */
near('le trasferte tengono in piedi il netto', mic.guaranteed, 57.00)
eq('e non avanza niente da comprimere', mic.compressible, 0)
eq('il patto è coperto', mic.topUp, 0)
near('fa il mese ordinario', mic.ordinary, 2427.27, 0.6)
/* La quattordicesima è **già** ratealizzata nell'imponibile (128,48 al mese):
   riaggiungerla sarebbe un errore da 1.500 € l'anno. Resta la tredicesima. */
eq('una sola mensilità esce a parte', mic.extraMonths, 1)
/* E vale dodici volte il rateo — 128,48 × 12 = 1.541,76, cioè 168 ore alla sua
   paga oraria — non un dodicesimo della RAL scritta in anagrafica. */
near('che vale dodici volte il rateo', mic.extraCost, 1541.76 * (1 + 0.2957 + 0.005) + 107.40, 3)
/* I tre numeri che servono, e sono tre domande diverse. */
near('il mese normale', mic.ordinary, 2427.27, 0.6)
near('il mese peggiore', mic.peak, mic.ordinary + mic.extraCost, 0.02)
near('e il tetto sta in mezzo', mic.monthly, (mic.ordinary * 12 + mic.extraCost) / 12, 0.02)
eq('il tetto è più alto dell\'ordinario e più basso della punta',
   mic.ordinary < mic.monthly && mic.monthly < mic.peak, true)
/* Dodici tetti fanno esattamente quello che uscirà nell'anno: è l'unica
   proprietà che rende il tetto un numero da mettere a budget. */
near('dodici tetti fanno l\'anno', mic.monthly * 12, mic.yearly, 0.05)
/* L'indennità della L. 207/2024 esce in busta e rientra col credito F24: non è
   costo, e nel fisso non c'è. */
near('la partita di giro è dichiarata', mic.passThrough, 75.25)
eq('e non entra nel costo', mic.rows.find(r => r.kind === 'giro')?.amount, 75.25)
near('il fisso non la contiene', mic.fixed, 2370.27, 0.6)
eq('i contributi vengono dal modello', mic.rows.find(r => r.kind === 'contributi')?.source, 'f24')
eq('l\'INAIL resta una stima e lo dice', mic.estimates.some(e => e.includes('INAIL')), true)

// ── il tetto di Sabrina: l'apprendista costa un'altra cosa ──────────────────
const sab = monthlyCeiling({
  person: { id: 'sabrina', name: 'Sabrina Nastro', kind: 'apprendistato', months: 14, targetNet: 1600 },
  slip: SABRINA, employer: 43.82, employerSource: 'legge', params: PRM,
})
near('il fisso di un apprendista', sab.fixed, 1409.48 + 43.82 + 7.05 + 107.25, 0.6)
/* 213 € di trasferte in un mese non sono struttura: vanno a budget ma in riga
   loro, o si legge come stipendio quello che dipende da quanti clienti si vanno
   a trovare. */
/* Sabrina invece resta sotto: 1.568 contro 1.600 promessi. I 213 € di trasferta
   servono tutti, e mancano ancora 32 € — che nel tetto ci vanno, perché una
   promessa scoperta non è una spesa da decidere. */
near('a Sabrina le trasferte non bastano', sab.guaranteed, 213.00)
near('e restano 32 € di patto scoperto', sab.topUp, 32.00)
eq('che entrano nel mese ordinario', Math.round(sab.ordinary * 100) / 100,
   Math.round((sab.fixed + 213 + 32) * 100) / 100)
eq('e la riga lo dice', sab.estimates.some(e => e.includes('netto concordato')), true)
eq('anche per lei una mensilità a parte', sab.extraMonths, 1)
/* Il numero che cambia la decisione: col listino al 30% il tool le attribuiva
   circa 420 € al mese di contributi che non esistono. */
eq('i contributi dell\'apprendista sono una frazione', sab.rows.find(r => r.kind === 'contributi')!.amount < 50, true)
/* E il 3,11% non è una stima: è l'aliquota di legge del primo anno. Marcarlo
   «stimato» manderebbe a chiedere al consulente una conferma che non serve. */
eq('e non sono una stima', sab.estimates.some(e => e.includes('contributi')), false)

// ── il tirocinio: nessun contributo, nessun TFR, nessuna mensilità in più ───
const ago = monthlyCeiling({
  person: { id: 'agostino', name: 'Agostino Abate', kind: 'tirocinio', months: 12, targetNet: 800 },
  slip: AGOSTINO, employer: 0, employerSource: 'legge', params: PRM,
})
eq('il tirocinio non ha mensilità aggiuntive', ago.extraMonths, 0)
eq('e nessun costo di punta', ago.extraCost, 0)
eq('quindi tetto e ordinario coincidono', ago.monthly, ago.ordinary)
near('e il costo è indennità più rimborso', ago.ordinary, 846.00, 1)
eq('nessun TFR in riga', ago.rows.some(r => r.kind === 'tfr'), false)
/* E nemmeno la riga dei contributi: uno zero in colonna sembra un dato
   mancante, mentre qui è una certezza di legge. */
eq('sul tirocinio la riga dei contributi non compare', ago.rows.some(r => r.kind === 'contributi'), false)

// ── il totale, che è quello che si mette a budget ───────────────────────────
const tot = ceilingTotals([mic, sab, ago])
near('il tetto dei tre', tot.monthly, mic.monthly + sab.monthly + ago.monthly, 0.02)
/* La punta è il mese in cui cadono insieme tutte le mensilità aggiuntive: è la
   sola cosa che dice **quando** serve la liquidità, non quanta in media. */
eq('la punta è più alta del tetto', tot.peak > tot.monthly, true)
/* §236 — le trasferte non sono un extra: sono lo strumento con cui si arriva al
   netto promesso. Tolte, la persona si trova duecento euro in meno in busta —
   quindi la parte comprimibile è **zero**, e chiamarla variabile faceva
   sembrare tagliabile la parte che tiene in piedi il patto. */
near('escono trasferte e integrazioni', tot.variable, 57 + 213 + 46 + 32)
eq('ma comprimibile non lo è niente', tot.compressible, 0)
near('e quello che manca ai patti è dichiarato', tot.topUp, 32)
near('e le partite di giro pure', tot.passThrough, 75.25 + 31.79)
eq('e si sa quante persone hanno una stima dentro', tot.estimated >= 1, true)

// ────────────────────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`\n${fails.length} controlli falliti su ${ok + fails.length}:\n`)
  fails.forEach(f => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log(`${ok} controlli. Tutti i controlli passano.`)
