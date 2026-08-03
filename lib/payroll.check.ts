/* Verifica del costo del personale. Esegui: npx tsx lib/payroll.check.ts */
import {
  personCost, personNet, accruals, irpefOn, flatTaxNet, compareEmployment,
  teamTotals, payrollHints, tfrRevaluation, contractSpec, emptyPerson,
  DEFAULT_PAYROLL_PARAMS as P, type PersonInput,
} from '@/lib/payroll'

let fail = 0
const eq = (label: string, got: number, want: number, tol = 0.5) => {
  const ok = Math.abs(got - want) <= tol
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(52)} ${got.toFixed(2).padStart(11)}${ok ? '' : `  atteso ${want.toFixed(2)}`}`)
}
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(52)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const p = (o: Partial<PersonInput>) => emptyPerson(o)

console.log('\n— Dipendente indeterminato, RAL 30.000 —')
{
  const dip = p({ kind: 'indeterminato', gross: 30000, months: 14 })
  const c = personCost(dip, P)
  eq('lordo', c.gross, 30000)
  eq('INPS azienda 30%', c.inpsEmployer, 9000)
  eq('INAIL 0,5%', c.inail, 150)
  eq('TFR = RAL/13,5 meno 0,5%', c.tfr, 30000 / 13.5 - 150)
  eq('costo azienda di competenza', c.total, 30000 + 9000 + 150 + (30000 / 13.5 - 150))
  /* Il TFR matura ma non esce: la cassa dell'anno è più bassa del costo, ed è
     la differenza che fa sembrare sostenibile un organico che non lo è. */
  eq('cassa = costo meno TFR', c.cash, c.total - c.tfr)
  eq('ricarico sul lordo ~37%', c.loadPct * 100, 37.2, 0.6)
}

console.log('\n— Part time e mesi parziali —')
{
  const full = personCost(p({ gross: 30000 }), P).total
  eq('part time 50% costa la metà', personCost(p({ gross: 30000, fte: 0.5 }), P).total, full / 2)
  // chi entra a luglio costa sei mesi, non dodici
  eq('ingresso a luglio = mezzo anno',
    personCost(p({ gross: 30000, fromMonth: 7, toMonth: 12 }), P).total, full / 2)
  eq('un solo mese', personCost(p({ gross: 30000, fromMonth: 3, toMonth: 3 }), P).total, full / 12, 1)
}

console.log('\n— Apprendista: l\'aliquota è l\'unica differenza —')
{
  const a = personCost(p({ kind: 'apprendistato', gross: 24000 }), P)
  const i = personCost(p({ kind: 'indeterminato', gross: 24000 }), P)
  // §184: fino a nove dipendenti l'aliquota cambia ogni anno di contratto
  eq('INPS apprendista 1º anno 3,11%', a.inpsEmployer, 24000 * P.inpsApprenticeY1Pct)
  eq('risparmio annuo contro indeterminato', i.total - a.total, 24000 * (0.30 - P.inpsApprenticeY1Pct))
  eq('2º anno 4,61%', personCost(p({ kind: 'apprendistato', gross: 24000, apprenticeYear: 2 }), P).inpsEmployer,
    24000 * P.inpsApprenticeY2Pct)
  eq('3º anno 11,61%', personCost(p({ kind: 'apprendistato', gross: 24000, apprenticeYear: 3 }), P).inpsEmployer,
    24000 * P.inpsApprenticeY3Pct)
  // oltre nove dipendenti l'aliquota è unica per tutta la durata
  const big = { ...P, smallCompany: false }
  eq('oltre 9 dipendenti: 11,61% dal primo anno',
    personCost(p({ kind: 'apprendistato', gross: 24000 }), big).inpsEmployer, 24000 * P.inpsApprenticePct)
  is('l\'apprendista matura TFR', a.tfr > 0, true)
  // e trattiene meno: 5,84% invece di 9,19%, quindi netto più alto a parità di lordo
  const na = personNet(p({ kind: 'apprendistato', gross: 24000, months: 14 }), P)
  eq('contributi apprendista 5,84%', na.socialContributions, 24000 * P.inpsApprenticeEmployeePct)
}

console.log('\n— Determinato: contributo addizionale NASpI —')
{
  const d = personCost(p({ kind: 'determinato', gross: 30000 }), P)
  eq('addizionale 1,4%', d.fixedTermExtra, 420)
  is('costa più dell\'indeterminato', d.total > personCost(p({ gross: 30000 }), P).total, true)
}

console.log('\n— Tirocinio: indennità e nient\'altro —')
{
  const t = personCost(p({ kind: 'tirocinio', gross: 6000 }), P)
  eq('nessun contributo previdenziale', t.inpsEmployer, 0)
  eq('nessun TFR', t.tfr, 0)
  eq('costo = indennità + INAIL', t.total, 6030)
}

console.log('\n— Co.co.co: Gestione Separata, due terzi all\'azienda —')
{
  const c = personCost(p({ kind: 'cococo', gross: 20000 }), P)
  eq('INPS azienda = 26,07% × 2/3', c.inpsEmployer, 20000 * 0.2607 * (2 / 3))
  eq('nessun TFR', c.tfr, 0)
}

console.log('\n— P.IVA: il costo è la fattura —')
{
  const f = personCost(p({ kind: 'piva_forfettario', gross: 30000 }), P)
  eq('forfettario: nessun ricarico', f.total, 30000)
  eq('nessun TFR', f.tfr, 0)
  const o = personCost(p({ kind: 'piva_ordinario', gross: 30000, withRivalsa: true }), P)
  eq('ordinario con rivalsa 4%', o.total, 31200)
  eq('senza rivalsa', personCost(p({ kind: 'piva_ordinario', gross: 30000 }), P).total, 30000)
  // l'IVA non è un costo: si detrae. Se comparisse qui, il confronto mentirebbe.
  is('l\'IVA non entra nel costo', personCost(p({ kind: 'piva_ordinario', gross: 100 }), P).total, 100)
}

console.log('\n— IRPEF a scaglioni —')
eq('10.000 → tutto al 23%', irpefOn(10000, P.irpef), 2300)
eq('28.000 → soglia del primo', irpefOn(28000, P.irpef), 6440)
// 2026: il secondo scaglione è al 33%, non più al 35% (L. 199/2025)
eq('40.000 → 23% + 33% sull\'eccedenza', irpefOn(40000, P.irpef), 6440 + 12000 * 0.33)
eq('60.000 → tre scaglioni', irpefOn(60000, P.irpef), 6440 + 22000 * 0.33 + 10000 * 0.43)
eq('reddito zero', irpefOn(0, P.irpef), 0)

console.log('\n— Netto in busta (stima) —')
{
  const n = personNet(p({ gross: 30000, months: 14 }), P)
  eq('contributi dipendente 9,19%', n.socialContributions, 2757)
  eq('imponibile fiscale', n.taxableIncome, 27243)
  is('il netto sta sotto il lordo', (n.net ?? 0) < 30000, true)
  is('quattordici mensilità', Math.round((n.net ?? 0) / (n.perMonth ?? 1)), 14)
  // dal costo azienda alla tasca: sotto la metà, ed è il numero che sorprende
  is('efficienza fra 40% e 60%', (n.efficiency ?? 0) > 0.4 && (n.efficiency ?? 0) < 0.6, true)
}

console.log('\n— TFR, tredicesima, quattordicesima —')
{
  const a = accruals(p({ gross: 28000, months: 14 }), P)
  eq('TFR annuo', a.tfrYear, 28000 / 13.5 - 140)
  eq('TFR mensile', a.tfrMonth, a.tfrYear / 12)
  eq('tredicesima = una mensilità', a.thirteenth, 2000)
  eq('quattordicesima = una mensilità', a.fourteenth, 2000)
  eq('rateo mensile della tredicesima', a.thirteenthMonthly, 2000 / 12)
  // a dicembre esce la mensilità più i contributi che l'azienda ci versa sopra
  eq('cassa di dicembre', a.decemberCash, 2000 * (1 + 0.30 + 0.005))
}
{
  const a13 = accruals(p({ gross: 26000, months: 13 }), P)
  eq('con 13 mensilità la quattordicesima non c\'è', a13.fourteenth, 0)
  eq('a giugno non esce niente', a13.juneCash, 0)
  const a12 = accruals(p({ gross: 24000, months: 12 }), P)
  eq('con 12 mensilità nessuna aggiuntiva', a12.thirteenth + a12.fourteenth, 0)
}
eq('rivalutazione TFR: 1,5% + 75% inflazione', tfrRevaluation(10000, 0.02, P), 10000 * (0.015 + 0.015))

console.log('\n— Forfettario, dal suo lato —')
{
  const f = flatTaxNet(50000, P, false)
  eq('imponibile = 78% del fatturato', f.taxableIncome, 39000)
  eq('contributi 26,07%', f.contributions, 39000 * 0.2607)
  eq('imposta sostitutiva 15%', f.tax, (39000 - 39000 * 0.2607) * 0.15)
  is('gli resta più della metà', f.net / 50000 > 0.5, true)
  const s = flatTaxNet(50000, P, true)
  is('nei primi 5 anni gli resta di più', s.net > f.net, true)
}

console.log('\n— Il netto di chi fattura non è conoscibile (§182) —')
{
  const v = personNet(p({ kind: 'piva_ordinario', gross: 30000 }), P)
  is('netto null per una P.IVA', v.net, null)
  is('nessuna mensilità', v.perMonth, null)
  is('nessuna efficienza', v.efficiency, null)
  is('niente confronto su chi già fattura',
    compareEmployment(p({ kind: 'piva_forfettario', gross: 30000 }), P), null)
}

console.log('\n— Assumere o affidare fuori, a parità di netto —')
{
  const c = compareEmployment(p({ gross: 35000, months: 14 }), P)!
  is('costo azienda maggiore del netto', c.employeeCost > c.employeeNet, true)
  /* Il confronto onesto è a parità di netto per la persona: la fattura
     equivalente deve dargli quanto la busta paga, non quanto la RAL. */
  const invNet = flatTaxNet(c.equivalentInvoice, P, false).net
  eq('la fattura equivalente dà lo stesso netto', invNet, c.employeeNet, 2)
  is('delta coerente col segno', c.cheaperAsVat, c.equivalentInvoice < c.employeeCost)
}

console.log('\n— Totali di squadra —')
{
  const team: PersonInput[] = [
    p({ name: 'A', kind: 'indeterminato', gross: 30000 }),
    p({ name: 'B', kind: 'apprendistato', gross: 22000 }),
    p({ name: 'C', kind: 'piva_forfettario', gross: 24000 }),
    p({ name: 'D', kind: 'indeterminato', gross: 28000, fte: 0.5 }),
  ]
  const t = teamTotals(team, P)
  is('teste', t.headcount, 4)
  eq('FTE', t.fte, 3.5)
  eq('costo mensile = annuo / 12', t.monthCost, t.yearCost / 12)
  eq('somma dei costi', t.yearCost,
    team.reduce((s, x) => s + personCost(x, P).total, 0))
  is('tre tipologie in squadra', t.byKind.length, 3)
  is('quota subordinati fra 0 e 1', t.internalShare > 0 && t.internalShare < 1, true)
  // la P.IVA non ha TFR: il monte TFR viene solo dai subordinati
  eq('TFR solo dai subordinati', t.tfr,
    team.filter(x => contractSpec(x.kind).tfr).reduce((s, x) => s + personCost(x, P).tfr, 0))
}
is('squadra vuota: nessun costo', teamTotals([], P).yearCost, 0)

console.log('\n— Suggerimenti —')
{
  const team = [p({ name: 'A', kind: 'indeterminato', gross: 22000 })]
  const ids = payrollHints(team, P, 0).map(h => h.id)
  is('avvisa che le aliquote non sono verificate', ids.includes('params-unverified'), true)
  is('propone i fringe benefit', ids.includes('fringe'), true)
  is('propone l\'apprendistato sui junior', ids.includes('apprendistato'), true)
  is('ricorda che il TFR non è cassa', ids.includes('tfr'), true)
  const verified = { ...P, verifiedAt: '2026-08-01' }
  is('verificate: l\'avviso sparisce',
    payrollHints(team, verified, 0).some(h => h.id === 'params-unverified'), false)
  // incidenza sul fatturato: solo quando il fatturato c'è
  is('nessuna incidenza senza fatturato',
    payrollHints(team, P, 0).some(h => h.id === 'incidenza'), false)
  is('incidenza alta segnalata',
    payrollHints(team, P, 40000).some(h => h.id === 'incidenza'), true)
}

console.log('\n— Difese —')
eq('importi negativi non generano costo', personCost(p({ gross: -1000 }), P).total, 0)
eq('FTE negativo azzerato', personCost(p({ gross: 30000, fte: -1 }), P).total, 0)
is('mesi invertiti non danno costo negativo',
  personCost(p({ gross: 30000, fromMonth: 10, toMonth: 2 }), P).total > 0, true)


// ═══════════════════════════════════════════════════════════════════════════
// §182 — i tre valori, sui documenti veri di Two Bee
// ═══════════════════════════════════════════════════════════════════════════
import {
  payslipViews, invoiceViews, monthLedger, tfrLedger, checkF24, ledgerAlerts,
  type Payslip, type CollabInvoice, type F24,
} from '@/lib/payroll'

const slip = (o: Partial<Payslip>): Payslip => ({
  id: 's', personId: 'x', month: '2026-06-01',
  basePay: 0, holidaysTaken: 0, leavePaid: 0, publicHolidays: 0,
  thirteenth: 0, fourteenth: 0, overtime: 0, bonus: 0, allowances: 0,
  reimbursements: 0, travel: 0, totalEarnings: 0,
  contributoryBase: 0, taxableBase: 0,
  employeeContrib: 0, irpef: 0, surcharges: 0, otherDeductions: 0, rounding: 0, netPaid: 0,
  employerContrib: null, inail: null, otherEmployer: 0, tfrAccrued: 0,
  netPaidOn: null, f24PaidOn: null, paymentStatus: 'pagato', ...o,
})
const inv = (o: Partial<CollabInvoice>): CollabInvoice => ({
  id: 'i', personId: 'x', month: '2026-06-01', number: '1',
  taxable: 0, pensionFund: 0, vat: 0, vatDeductible: true, withholding: 0,
  totalInvoice: 0, amountToPay: 0, paidOn: '2026-06-30', paymentStatus: 'pagata',
  hasDocument: true, ...o,
})

// I cedolini veri di giugno 2026
const michele  = slip({ personId: 'm', totalEarnings: 1861.80, contributoryBase: 1861.80,
  employeeContrib: 161.93, irpef: 199.87, netPaid: 1500.00, tfrAccrued: 120.51, employerContrib: null })
const sabrina  = slip({ personId: 's', totalEarnings: 1654.27, contributoryBase: 1654.27,
  employeeContrib: 84.69, irpef: 2.38, rounding: 0.80, netPaid: 1568.00, tfrAccrued: 107.25 })
const agostino = slip({ personId: 'a', totalEarnings: 846.00, travel: 46.00, basePay: 800,
  contributoryBase: 0, employeeContrib: 2.29, irpef: 44.21, rounding: 0.50, netPaid: 800.00 })

console.log('\n— I cedolini di giugno quadrano —')
for (const [nome, s2] of [['Michele', michele], ['Sabrina', sabrina], ['Agostino', agostino]] as const) {
  eq(`${nome}: competenze − trattenute + arrotondamento = netto`,
    s2.totalEarnings - s2.employeeContrib - s2.irpef + s2.rounding, s2.netPaid, 0.01)
}

console.log('\n— Tre valori, mai sommati fra loro —')
{
  const v = payslipViews(michele, 'indeterminato', P)
  // contributi datore stimati: 1.861,80 × 30% = 558,54 · INAIL 0,5% = 9,31
  eq('costo economico = competenze + oneri + TFR', v.economic, 1861.80 + 558.54 + 9.31 + 120.51, 0.05)
  eq('il netto è quello del cedolino', v.net ?? 0, 1500)
  /* La cassa NON contiene il TFR: matura ora, esce quando la persona se ne va.
     Se ci fosse, la stessa somma verrebbe contata due volte — al maturare e
     al pagamento. */
  eq('cassa = costo meno TFR', v.cash, v.economic - michele.tfrAccrued, 0.05)
  is('oneri datore stimati, e dichiarato', v.estimated, true)
  eq('netto + trattenute + oneri = cassa',
    1500 + 161.93 + 199.87 + 558.54 + 9.31, v.cash, 0.05)
}
{
  // col prospetto del consulente la stima sparisce
  const vero = payslipViews({ ...michele, employerContrib: 553.09, inail: 12.00 }, 'indeterminato', P)
  is('con il dato reale non stima più', vero.estimated, false)
  eq('costo col dato reale', vero.economic, 1861.80 + 553.09 + 12.00 + 120.51, 0.01)
}
{
  const t = payslipViews(agostino, 'tirocinio', P)
  eq('tirocinante: nessun TFR nel costo', t.accrued, 0)
  is('costo e cassa coincidono senza TFR', Math.abs(t.economic - t.cash) < 0.01, true)
}

console.log('\n— Fatture: importo pagato, non «netto» —')
{
  const v = invoiceViews(inv({ taxable: 1300, vat: 286, vatDeductible: true, totalInvoice: 1586, amountToPay: 1586 }))
  eq('costo = solo imponibile, l\'IVA si detrae', v.economic, 1300)
  eq('cassa = totale pagato', v.cash, 1586)
  is('il netto personale non è conoscibile', v.net, null)
}
{
  const v = invoiceViews(inv({ taxable: 1000, vat: 220, vatDeductible: false, totalInvoice: 1220, amountToPay: 1220 }))
  eq('IVA indetraibile: entra nel costo', v.economic, 1220)
}
{
  const v = invoiceViews(inv({ taxable: 1000, withholding: 200, totalInvoice: 1000, amountToPay: 800 }))
  eq('la ritenuta non è un costo', v.economic, 1000)
  eq('dalla banca escono 800', v.cash, 800)
}

console.log('\n— Il mese di Two Bee —')
{
  const l = monthLedger(
    [{ slip: michele, kind: 'indeterminato' }, { slip: sabrina, kind: 'apprendistato' },
     { slip: agostino, kind: 'tirocinio' }],
    [inv({ personId: 'g', taxable: 1300, totalInvoice: 1300, amountToPay: 1300 }),
     inv({ personId: 'an', taxable: 750, totalInvoice: 750, amountToPay: 750 })],
    P)
  eq('netti ai dipendenti', l.netPayroll, 1500 + 1568 + 800)
  eq('pagato ai collaboratori', l.paidToCollaborators, 2050)
  eq('trattenute alle persone', l.employeeWithheld, 161.93 + 84.69 + 2.29 + 199.87 + 2.38 + 44.21)
  eq('TFR del mese', l.tfrAccrued, 120.51 + 107.25)
  eq('costo esterno = imponibili', l.externalCost, 2050)
  is('costo = interno + esterno', Math.abs(l.economic - (l.internalCost + l.externalCost)) < 0.01, true)
  /* La differenza fra competenza e cassa è il TFR, e nient'altro: se fosse
     un altro numero vorrebbe dire che qualcosa è contato due volte. */
  eq('competenza − cassa = TFR maturato', l.economic - l.cash, l.tfrAccrued, 0.05)
  /* Tre, non due: anche sul tirocinante l'INAIL si versa, quindi il campo
     vuoto è un dato mancante come per gli altri. */
  is('tre persone con oneri da confermare', l.estimatedCount, 3)
}
is('mese vuoto', monthLedger([], [], P).economic, 0)

console.log('\n— F24 di giugno contro i cedolini —')
{
  const f24: F24 = { month: '2026-06-01', erarioGross: 246.46, creditOffset: 107.04,
    erarioBalance: 139.42, inps: 802, inail: 0, other: 0, total: 941.42,
    paidOn: null, individualDetail: false }
  const c = checkF24(f24, [michele, sabrina, agostino])
  eq('IRPEF trattenuta ai tre', c.withheldIrpef, 246.46)
  is('combacia con l\'erario lordo', c.irpefMatches, true)
  eq('contributi trattenuti', c.withheldContrib, 248.91)
  eq('residuo INPS a carico azienda', c.employerResidual, 553.09)
  is('senza prospetto resta aggregato', c.aggregateOnly, true)
  eq('quadratura del modello', f24.erarioBalance + f24.inps, f24.total, 0.01)
  eq('erario lordo − credito = saldo', f24.erarioGross - f24.creditOffset, f24.erarioBalance, 0.01)
}

console.log('\n— Registro TFR —')
{
  const l = tfrLedger('m', [michele, { ...michele, month: '2026-07-01' }], [], 0, '2026-06-01')
  eq('maturato nel mese', l.accruedMonth, 120.51)
  eq('maturato nell\'anno', l.accruedYear, 241.02)
  eq('resta in azienda', l.inCompany, 241.02)
  const conFondo = tfrLedger('m', [michele], [{ personId: 'm', month: '2026-06-01', kind: 'fondo', amount: 120.51 }], 0, '2026-06-01')
  eq('versato al fondo: niente resta in azienda', conFondo.inCompany, 0)
  const conApertura = tfrLedger('m', [michele], [], 5000, '2026-06-01')
  eq('il pregresso entra nel debito', conApertura.inCompany, 5120.51)
}

console.log('\n— Controlli automatici —')
{
  const person = (id: string, name: string, kind: Parameters<typeof contractSpec>[0], agreedNet: number | null = null) =>
    ({ id, name, kind, agreedNet })
  const rows = [
    { person: person('m', 'Michele', 'indeterminato'), slip: michele },
    { person: person('s', 'Sabrina', 'apprendistato', 1600), slip: sabrina },
    { person: person('a', 'Agostino', 'tirocinio', 800), slip: agostino },
  ]
  const f24: F24 = { month: '2026-06-01', erarioGross: 246.46, creditOffset: 107.04,
    erarioBalance: 139.42, inps: 802, inail: 0, other: 0, total: 941.42, paidOn: null, individualDetail: false }
  const ids = ledgerAlerts(rows, f24, P).map(a => a.id)
  is('nessun errore di quadratura sui netti', ids.some(i => i.startsWith('net-')), false)
  is('scostamento di Sabrina segnalato', ids.includes('agreed-s'), true)
  is('trasferte di Agostino da giustificare', ids.includes('travel-a'), true)
  is('contributi datore stimati: detto', ids.includes('employer-m'), true)
  is('F24 aggregato: dichiarato', ids.includes('f24-aggregate'), true)
  is('F24 non pagato: segnalato', ids.includes('f24-unpaid'), true)
  is('IRPEF combacia: nessun alert', ids.includes('f24-irpef'), false)
  // un TFR su una P.IVA è un errore che gonfia il costo
  const conTfrSbagliato = ledgerAlerts(
    [{ person: person('g', 'Gabriele', 'piva_ordinario'), slip: slip({ tfrAccrued: 50, totalEarnings: 1300, netPaid: 1300 }) }], null, P)
  is('TFR su P.IVA: bloccato', conTfrSbagliato.some(a => a.id === 'tfr-wrong-g'), true)
  // un dipendente senza TFR è un costo sottostimato
  const senzaTfr = ledgerAlerts(
    [{ person: person('m', 'Michele', 'indeterminato'), slip: slip({ totalEarnings: 1000, netPaid: 1000 }) }], null, P)
  is('dipendente senza TFR: segnalato', senzaTfr.some(a => a.id === 'tfr-missing-m'), true)
  // netto che non quadra
  const storto = ledgerAlerts(
    [{ person: person('x', 'Tizio', 'indeterminato'), slip: slip({ totalEarnings: 2000, employeeContrib: 100, irpef: 100, netPaid: 1900, tfrAccrued: 10 }) }], null, P)
  is('netto che non torna: segnalato', storto.some(a => a.id === 'net-x'), true)
  // fattura senza documento
  const senzaDoc = ledgerAlerts(
    [{ person: person('g', 'Gabriele', 'piva_ordinario'), invoice: inv({ taxable: 1300, totalInvoice: 1300, amountToPay: 1300, hasDocument: false }) }], null, P)
  is('pagamento senza documento: segnalato', senzaDoc.some(a => a.id === 'doc-g'), true)
}


// ═══════════════════════════════════════════════════════════════════════════
// §183 — dal netto mensile, età e famiglia
// ═══════════════════════════════════════════════════════════════════════════
import {
  grossFromMonthlyNet, monthlyNetFromGross, monthlyInputSpec,
  ageAt, eligibility, fringeCapFor, APPRENTICE_MAX_AGE,
} from '@/lib/payroll'

console.log('\n— Si inserisce il mese, non la RAL —')
{
  /* Il giro completo: metto 1.500 netti al mese, il tool trova la RAL, e da
     quella RAL rileggo lo stesso netto. Se non torna, chi inserisce vede un
     numero diverso da quello che ha scritto — ed è il modo più veloce per
     perdere fiducia in uno strumento. */
  for (const netto of [1200, 1500, 1568, 2500, 4000]) {
    const ral = grossFromMonthlyNet(netto, 14, 'indeterminato', P)
    const back = monthlyNetFromGross(ral, 14, 'indeterminato', P) ?? 0
    eq(`${netto} netti/mese → RAL ${Math.round(ral)} → rileggo`, back, netto, 1)
  }
}
{
  const ral = grossFromMonthlyNet(1500, 14, 'indeterminato', P)
  is('la RAL supera il netto annuo', ral > 1500 * 14, true)
  /* §184: l'apprendista trattiene il 5,84% invece del 9,19%, quindi per lo
     stesso netto serve una RAL più bassa — e il costo azienda scende due volte,
     sul lordo e sull'aliquota datore. */
  const ralApp = grossFromMonthlyNet(1500, 14, 'apprendistato', P)
  is('per lo stesso netto l\'apprendista ha una RAL più bassa', ralApp < ral, true)
  eq('e la rileggo giusta', monthlyNetFromGross(ralApp, 14, 'apprendistato', P) ?? 0, 1500, 1)
  is('ma il costo azienda è più basso',
    personCost(p({ kind: 'apprendistato', gross: ralApp }), P).total
      < personCost(p({ kind: 'indeterminato', gross: ral }), P).total, true)
}
{
  // per chi fattura non c'è nessuna busta da invertire: 1.300 al mese = 15.600
  eq('P.IVA: compenso × 12', grossFromMonthlyNet(1300, 12, 'piva_ordinario', P), 15600)
  eq('netto zero, RAL zero', grossFromMonthlyNet(0, 14, 'indeterminato', P), 0)
  eq('netto negativo non genera nulla', grossFromMonthlyNet(-100, 14, 'indeterminato', P), 0)
}
is('a un dipendente si chiede il netto', monthlyInputSpec('indeterminato').isNet, true)
is('a una P.IVA il compenso', monthlyInputSpec('piva_ordinario').isNet, false)
is('a un tirocinante l\'indennità lorda', monthlyInputSpec('tirocinio').isNet, false)

console.log('\n— Età —')
is('compleanno già passato', ageAt('1996-03-10', '2026-08-01'), 30)
is('compleanno non ancora arrivato', ageAt('1996-12-10', '2026-08-01'), 29)
is('proprio il giorno del compleanno', ageAt('1996-08-01', '2026-08-01'), 30)
is('senza data di nascita non si inventa', ageAt(null, '2026-08-01'), null)
{
  const giovane = p({ birthDate: '2000-01-01' })
  const e = eligibility(giovane, '2026-08-01')
  is('26 anni: apprendistato possibile', e.apprentice, true)
  is('gli restano tre anni e mezzo', (e.monthsLeft ?? 0) > 0, true)
  const grande = eligibility(p({ birthDate: '1985-01-01' }), '2026-08-01')
  is('41 anni: niente apprendistato', grande.apprentice, false)
  is('nessuna finestra da contare', grande.monthsLeft, null)
  const limite = eligibility(p({ birthDate: '1996-06-01' }), '2026-08-01')
  is(`${APPRENTICE_MAX_AGE + 1} anni compiuti: fuori`, limite.apprentice, false)
}

console.log('\n— Figli a carico —')
is('senza figli: soglia ordinaria', fringeCapFor(p({}), P), P.fringeBenefitCap)
is('con figli: soglia doppia', fringeCapFor(p({ hasChildren: true }), P), P.fringeBenefitCapChildren)
{
  // il potenziale welfare somma le soglie vere, non un tetto medio
  const team = [p({ name: 'A', gross: 30000 }), p({ name: 'B', gross: 30000, hasChildren: true })]
  const h = payrollHints(team, P, 0, '2026-08-01').find(x => x.id === 'fringe')
  eq('potenziale = 1.000 + 2.000', h?.value ?? 0, P.fringeBenefitCap + P.fringeBenefitCapChildren)
}
{
  // l'apprendistato si propone solo a chi ha davvero l'età
  const over = [p({ name: 'Vecchio', gross: 22000, birthDate: '1980-01-01' })]
  is('over 30: nessun suggerimento apprendistato',
    payrollHints(over, P, 0, '2026-08-01').some(h => h.id === 'apprendistato'), false)
  const under = [p({ name: 'Giovane', gross: 22000, birthDate: '2002-01-01' })]
  is('under 30: suggerimento presente',
    payrollHints(under, P, 0, '2026-08-01').some(h => h.id === 'apprendistato'), true)
  // chi sta per compiere 30 anni: la finestra si chiude, e diventa urgente
  const quasi = payrollHints([p({ name: 'Quasi', gross: 22000, birthDate: '1997-01-01' })], P, 0, '2026-08-01')
    .find(h => h.id === 'apprendistato')
  is('a un anno dal limite l\'avviso è urgente', quasi?.severity, 'attenzione')
}

console.log('\n— §184: esoneri contributivi applicati al costo —')
{
  /* Under 30 strutturale: metà dei contributi, ma il tetto di 250 €/mese morde
     quasi sempre — ed è il motivo per cui «esonero al 50%» non vuol dire metà. */
  const junior = p({
    name: 'Junior', kind: 'indeterminato', gross: 24000, birthDate: '2000-06-01',
    hiredOn: '2026-01-01', neverStable: true, incentiveCode: 'under30_strutturale',
  })
  const c = personCost(junior, P)
  eq('contributi pieni 30%', c.inpsEmployerGross, 7200)
  eq('esonero fermato dal tetto annuo di 3.000', c.relief, 3000)
  eq('contributi versati', c.inpsEmployer, 4200)
  eq('costo azienda al netto dell\'esonero', c.total, personCost({ ...junior, incentiveCode: null }, P).total - 3000)
  is('l\'INAIL non si tocca', c.inail, personCost({ ...junior, incentiveCode: null }, P).inail)

  // senza il requisito dichiarato l'esonero non si applica: mai sconti a caso
  const senza = personCost({ ...junior, neverStable: false }, P)
  eq('già assunto a tempo indeterminato: nessuno sconto', senza.relief, 0)
  is('e il motivo è scritto', (senza.incentive?.blockers.length ?? 0) > 0, true)

  // over 30: fuori età
  eq('over 30: nessuno sconto',
    personCost({ ...junior, birthDate: '1985-01-01' }, P).relief, 0)

  // assunto a metà anno: l'esonero copre solo i mesi che tocca
  const meta = personCost({ ...junior, hiredOn: '2026-07-01', fromMonth: 7, toMonth: 12 }, P)
  eq('sei mesi: metà del tetto annuo', meta.relief, 1500)

  // fuori dai 36 mesi: finito
  eq('assunto nel 2022: i 36 mesi sono passati',
    personCost({ ...junior, hiredOn: '2022-01-01' }, P).relief, 0)
}
{
  // il nuovo esonero 2026 azzera i contributi entro 650 €/mese
  const nuovo = p({
    name: 'Nuovo', kind: 'indeterminato', gross: 30000,
    hiredOn: '2026-03-01', incentiveCode: 'esonero_2026', fromMonth: 3, toMonth: 12,
  })
  const c = personCost(nuovo, P)
  // 10 mesi in organico, contributi 30% su 25.000 di lordo riproporzionato
  eq('contributi pieni sui dieci mesi', c.inpsEmployerGross, 7500)
  eq('esonero al 100% entro 650/mese', c.relief, 6500)
  is('fuori finestra non spetta',
    personCost({ ...nuovo, hiredOn: '2025-03-01' }, P).relief === 0, true)
}

console.log('\n— §184: rientro dei cervelli —')
{
  const base = p({ kind: 'indeterminato', gross: 60000, months: 14 })
  const imp = { ...base, impatriateFrom: '2026-01-01' }
  const n0 = personNet(base, P)
  const n1 = personNet(imp, P)
  eq('metà dell\'imponibile esce dalla base IRPEF', n1.exempt, n0.taxableIncome * 0.5, 1)
  is('IRPEF più bassa', n1.irpef < n0.irpef, true)
  is('netto più alto', (n1.net ?? 0) > (n0.net ?? 0), true)
  eq('i contributi restano pieni', n1.socialContributions, n0.socialContributions)
  eq('e il costo azienda non cambia', personCost(imp, P).total, personCost(base, P).total)
  // con figlio minore l'esenzione sale al 60%
  eq('con figlio minore: 60%',
    personNet({ ...imp, impatriateChildren: true }, P).exempt, n0.taxableIncome * 0.6, 1)
  // finita la finestra dei cinque anni si torna a IRPEF piena
  eq('sesto anno: nessuna esenzione',
    personNet({ ...imp, impatriateFrom: '2020-01-01' }, P).exempt, 0)
  // il tetto di 600.000 € è sul reddito agevolabile
  const ricco = personNet({ ...imp, gross: 900000 }, P)
  eq('oltre il tetto si tassa tutto il resto', ricco.exempt, 600000 * 0.5)
}

console.log('\n— §184: suggerimenti sulle agevolazioni —')
{
  const team = [p({
    name: 'Junior', kind: 'indeterminato', gross: 24000, birthDate: '2001-01-01',
    hiredOn: '2026-01-01', neverStable: true,
  })]
  const ids = payrollHints(team, P, 0, '2026-08-01').map(h => h.id)
  is('segnala l\'esonero disponibile', ids.includes('esonero-disponibile'), true)
  is('segnala la maxi-deduzione sulle assunzioni dell\'anno', ids.includes('maxi-deduzione'), true)
  // attivato l'esonero, il suggerimento cambia natura
  const conEsonero = [{ ...team[0], incentiveCode: 'under30_strutturale' }]
  const ids2 = payrollHints(conEsonero, P, 0, '2026-08-01').map(h => h.id)
  is('attivo: non lo propone più', ids2.includes('esonero-disponibile'), false)
  is('e dice quanto sta valendo', ids2.includes('esonero-attivo'), true)
  // esonero configurato ma senza requisiti: è un errore, non un consiglio
  const ko = [{ ...conEsonero[0], neverStable: false }]
  is('non spettante: lo dichiara', payrollHints(ko, P, 0, '2026-08-01').some(h => h.id.startsWith('esonero-ko')), true)
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
