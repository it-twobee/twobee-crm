/* Verifica delle agevolazioni. Esegui: npx tsx lib/incentives.check.ts */
import {
  HIRING_INCENTIVES, IMPATRIATE_RULE, COMPANY_MEASURES,
  incentiveByCode, mergeIncentives, checkIncentive, rankIncentives,
  contribRelief, coveredMonthsInYear, incentiveEnds, monthsBetween,
  impatriateView, maxiDeduction, hyperAmortization, relevantMeasures, expiredMeasures,
  type PersonFacts,
} from '@/lib/incentives'

let fail = 0
const eq = (label: string, got: number, want: number, tol = 0.5) => {
  const ok = Math.abs(got - want) <= tol
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${got.toFixed(2).padStart(11)}${ok ? '' : `  atteso ${want.toFixed(2)}`}`)
}
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const facts = (o: Partial<PersonFacts> = {}): PersonFacts => ({
  kind: 'indeterminato', birthDate: '2000-01-01', hiredOn: '2026-01-01',
  neverStable: true, zes: false, ...o,
})

const under30 = incentiveByCode('under30_strutturale')!
const esonero2026 = incentiveByCode('esonero_2026')!
const coesione = incentiveByCode('under35_coesione')!

console.log('\n— Il catalogo si regge in piedi —')
is('sei misure di partenza', HIRING_INCENTIVES.length, 6)
is('nessun codice duplicato',
  new Set(HIRING_INCENTIVES.map(i => i.code)).size, HIRING_INCENTIVES.length)
is('ogni misura ha un riferimento normativo',
  HIRING_INCENTIVES.every(i => i.legalRef.length > 3), true)
is('nessun numero è dichiarato verificato',
  HIRING_INCENTIVES.every(i => i.verifiedAt === null), true)
is('ogni misura della società ha condizioni scritte',
  COMPANY_MEASURES.every(m => m.conditions.length > 0), true)
is('codice inesistente: null e non un default silenzioso', incentiveByCode('non_esiste'), null)

console.log('\n— Il database vince sul codice, campo per campo —')
{
  const merged = mergeIncentives([{ code: 'under30_strutturale', yearlyCap: 4000 }])
  const m = merged.find(i => i.code === 'under30_strutturale')!
  eq('il tetto corretto arriva dal database', m.yearlyCap ?? 0, 4000)
  is('la prosa del codice resta', m.what, under30.what)
  is('le altre misure non si toccano', merged.length, HIRING_INCENTIVES.length)
  // undefined non deve cancellare quello che il codice sa già
  const keep = mergeIncentives([{ code: 'under30_strutturale', label: undefined }])
  is('undefined non cancella l\'etichetta',
    keep.find(i => i.code === 'under30_strutturale')!.label, under30.label)
  // una misura nuova entra comunque
  const added = mergeIncentives([{ code: 'nuova_2027', label: 'Misura 2027', exemptPct: 0.4 }])
  is('una misura sconosciuta entra', added.some(i => i.code === 'nuova_2027'), true)
}

console.log('\n— Chi ne ha diritto —')
{
  const ok = checkIncentive(under30, facts(), '2026-08-01')
  is('under 30 mai assunto: spetta', ok.eligible, true)
  is('nessun ostacolo', ok.blockers.length, 0)
  eq('età all\'assunzione', ok.ageAtHire ?? -1, 26)

  const vecchio = checkIncentive(under30, facts({ birthDate: '1985-01-01' }), '2026-08-01')
  is('over 30: non spetta', vecchio.eligible, false)

  const giaAssunto = checkIncentive(under30, facts({ neverStable: false }), '2026-08-01')
  is('già stato assunto stabilmente: non spetta', giaAssunto.eligible, false)

  const senzaData = checkIncentive(under30, facts({ birthDate: null }), '2026-08-01')
  is('senza data di nascita non si inventa un sì', senzaData.eligible, false)

  const piva = checkIncentive(under30, facts({ kind: 'piva_forfettario' }), '2026-08-01')
  is('su chi fattura non c\'è nulla da esonerare', piva.eligible, false)

  // finestra: il decreto Coesione non copre le assunzioni del 2026
  is('fuori finestra: non spetta',
    checkIncentive(coesione, facts({ hiredOn: '2026-03-01' }), '2026-08-01').eligible, false)
  /* Una misura a finestra chiusa resta valida su chi l'ha già ottenuta — i 24
     mesi si portano a termine — ma non si propone più su nuove assunzioni. */
  is('chi l\'ha già ottenuta la tiene',
    checkIncentive(coesione, facts({ hiredOn: '2025-03-01', birthDate: '1995-01-01' }), '2025-06-01').eligible, true)
  is('ma non viene più proposta',
    rankIncentives(facts({ hiredOn: '2025-03-01', birthDate: '1995-01-01' }), '2025-06-01', 7200)
      .find(r => r.incentive.code === 'under35_coesione')?.value, 0)

  // ZES: la decontribuzione Sud non spetta a chi sta al Nord
  const sud = incentiveByCode('decontribuzione_sud')!
  is('fuori ZES: non spetta', checkIncentive(sud, facts(), '2026-08-01').eligible, false)
  is('in ZES: spetta', checkIncentive(sud, facts({ zes: true }), '2026-08-01').eligible, true)
  // e in ZES il tetto mensile è quello maggiorato, dove la misura lo prevede
  eq('tetto ZES del nuovo esonero',
    checkIncentive(esonero2026, facts({ zes: true }), '2026-08-01').monthlyCap ?? 0, 800)
  eq('tetto ordinario fuori ZES',
    checkIncentive(esonero2026, facts(), '2026-08-01').monthlyCap ?? 0, 650)
}

console.log('\n— Durata: un esonero è un aumento di costo con una data —')
{
  eq('gennaio → agosto sono otto mesi', monthsBetween('2026-01-01', '2026-08-01'), 8)
  is('36 mesi dal gennaio 2026 finiscono a dicembre 2028',
    incentiveEnds(under30, '2026-01-01'), '2028-12-01')
  is('24 mesi da marzo 2026 finiscono a febbraio 2028',
    incentiveEnds(esonero2026, '2026-03-01'), '2028-02-01')

  eq('anno pieno dentro i 36 mesi', coveredMonthsInYear(under30, '2026-01-01', 2027), 12)
  eq('l\'ultimo anno è parziale', coveredMonthsInYear(under30, '2026-01-01', 2028), 12)
  eq('l\'anno dopo la fine non è coperto', coveredMonthsInYear(under30, '2026-01-01', 2029), 0)
  // assunto a luglio: nel primo anno copre sei mesi
  eq('assunzione a luglio: sei mesi', coveredMonthsInYear(under30, '2026-07-01', 2026, 7, 12), 6)
  // 24 mesi da settembre 2025: nel 2027 restano otto mesi
  eq('coda nel terzo anno', coveredMonthsInYear(esonero2026, '2025-09-01', 2027), 8)
  eq('senza data di assunzione non si conta niente',
    coveredMonthsInYear(under30, null, 2026), 0)
}

console.log('\n— Quanto vale: i tetti mordono mese per mese —')
{
  // 24.000 di RAL, 30% di contributi = 7.200. Metà sarebbe 3.600, ma il tetto
  // mensile di 250 € porta il beneficio a 3.000: «50%» non vuol dire metà.
  eq('under 30, RAL 24.000',
    contribRelief(under30, { employerContribYear: 7200, monthsPresent: 12, monthsCovered: 12 }), 3000)
  // su una RAL bassa il tetto non morde e l'esonero è davvero metà
  eq('RAL bassa: metà piena',
    contribRelief(under30, { employerContribYear: 4800, monthsPresent: 12, monthsCovered: 12 }), 2400)
  eq('sei mesi coperti: metà del beneficio',
    contribRelief(under30, { employerContribYear: 7200, monthsPresent: 12, monthsCovered: 6 }), 1500)
  eq('nessun mese coperto: zero',
    contribRelief(under30, { employerContribYear: 7200, monthsPresent: 12, monthsCovered: 0 }), 0)
  // il nuovo esonero azzera i contributi ma entro 650 al mese
  eq('esonero 2026 su contributi alti',
    contribRelief(esonero2026, { employerContribYear: 12000, monthsPresent: 12, monthsCovered: 12 }), 7800)
  /* In ZES il tetto mensile è 800 (9.600 l'anno) ma il tetto annuo di 8.000
     arriva prima: quando due tetti si sovrappongono vince il più stretto, e il
     beneficio pubblicizzato «100%» si ferma lì. */
  eq('in ZES vince il tetto annuo',
    contribRelief(esonero2026, { employerContribYear: 12000, monthsPresent: 12, monthsCovered: 12, zes: true }), 8000)
  // chi c'è mezz'anno ha contributi dimezzati ma il tetto è sempre mensile
  eq('mezzo anno: contributi e tetto scalano insieme',
    contribRelief(esonero2026, { employerContribYear: 6000, monthsPresent: 6, monthsCovered: 6 }), 3900)
  is('i mesi coperti non superano quelli di presenza',
    contribRelief(esonero2026, { employerContribYear: 6000, monthsPresent: 6, monthsCovered: 12 })
      === contribRelief(esonero2026, { employerContribYear: 6000, monthsPresent: 6, monthsCovered: 6 }), true)
}

console.log('\n— L\'ordine: prima quelle che spettano, poi per valore —')
{
  const ranked = rankIncentives(facts(), '2026-08-01', 7200)
  is('la prima spetta davvero', ranked[0].eligible, true)
  is('le non spettanti stanno in fondo',
    ranked.filter(r => r.eligible).length <= ranked.findIndex(r => !r.eligible) || ranked.every(r => r.eligible), true)
  is('il valore delle non spettanti è zero',
    ranked.filter(r => !r.eligible).every(r => r.value === 0), true)
  // fra due misure che spettano vince quella che vale di più
  const best = ranked.find(r => r.eligible)!
  is('nessuna spettante vale più della prima',
    ranked.filter(r => r.eligible).every(r => r.value <= best.value), true)
}

console.log('\n— Rientro dei cervelli —')
{
  const v = impatriateView(40000, '2026-01-01', 2026, false)
  is('attivo nel primo anno', v.active, true)
  eq('metà del reddito fuori dalla base', v.exemptAmount, 20000)
  eq('cinque anni: ultimo il 2030', v.lastYear ?? 0, 2030)
  eq('anni residui compreso quello in corso', v.yearsLeft ?? 0, 5)

  const figli = impatriateView(40000, '2026-01-01', 2026, true)
  eq('con figlio minore il 60%', figli.exemptAmount, 24000)

  const fine = impatriateView(40000, '2026-01-01', 2031, false)
  is('sesto anno: finito', fine.active, false)
  eq('nessuna esenzione', fine.exemptAmount, 0)
  eq('anni residui a zero', fine.yearsLeft ?? -1, 0)

  const prima = impatriateView(40000, '2027-01-01', 2026, false)
  is('prima del trasferimento non è attivo', prima.active, false)

  const ricco = impatriateView(900000, '2026-01-01', 2026, false)
  eq('il tetto è sul reddito agevolabile', ricco.eligibleIncome, IMPATRIATE_RULE.incomeCap)
  eq('quindi l\'esenzione si ferma', ricco.exemptAmount, 300000)

  const senza = impatriateView(40000, null, 2026, false)
  is('senza data non è attivo', senza.active, false)
  eq('e non esenta niente', senza.exemptAmount, 0)
}

console.log('\n— Maxi-deduzione: la base è il minore dei due —')
{
  const a = maxiDeduction({
    newHiresCost: 40000, payrollIncrease: 60000, protectedCost: 0,
    headcountIncrease: true, pct: 0.2, protectedPct: 0.3, iresPct: 0.24,
  })
  eq('base = costo dei nuovi assunti', a.base, 40000)
  eq('maggiorazione del 20%', a.extraDeduction, 8000)
  eq('IRES risparmiata', a.iresSaving, 1920)

  const b = maxiDeduction({
    newHiresCost: 60000, payrollIncrease: 25000, protectedCost: 0,
    headcountIncrease: true, pct: 0.2, protectedPct: 0.3, iresPct: 0.24,
  })
  eq('base = incremento complessivo, che fa da tetto', b.base, 25000)

  const c = maxiDeduction({
    newHiresCost: 40000, payrollIncrease: 40000, protectedCost: 40000,
    headcountIncrease: true, pct: 0.2, protectedPct: 0.3, iresPct: 0.24,
  })
  eq('tutta categoria protetta: 30%', c.extraDeduction, 12000)

  const mix = maxiDeduction({
    newHiresCost: 40000, payrollIncrease: 40000, protectedCost: 20000,
    headcountIncrease: true, pct: 0.2, protectedPct: 0.3, iresPct: 0.24,
  })
  eq('metà e metà: le due aliquote pro-quota', mix.extraDeduction, 20000 * 0.2 + 20000 * 0.3)

  const senzaIncremento = maxiDeduction({
    newHiresCost: 40000, payrollIncrease: 40000, protectedCost: 0,
    headcountIncrease: false, pct: 0.2, protectedPct: 0.3, iresPct: 0.24,
  })
  is('senza incremento occupazionale non spetta', senzaIncremento.applies, false)
  eq('e non vale niente', senzaIncremento.extraDeduction, 0)
  is('con il motivo scritto', senzaIncremento.why.length > 10, true)

  const inCalo = maxiDeduction({
    newHiresCost: 40000, payrollIncrease: -5000, protectedCost: 0,
    headcountIncrease: true, pct: 0.2, protectedPct: 0.3, iresPct: 0.24,
  })
  is('costo del personale in calo: niente base', inCalo.applies, false)
}

console.log('\n— Iper-ammortamento a fasce —')
{
  const piccolo = hyperAmortization(20000, 0.24)
  eq('sotto i 2,5 milioni: +180%', piccolo.extraCost, 36000)
  eq('IRES sull\'ammortamento maggiorato', piccolo.iresSaving, 8640)
  eq('maggiorazione effettiva', piccolo.effectivePct * 100, 180)

  const medio = hyperAmortization(5_000_000, 0.24)
  eq('due fasce: 180% su 2,5M e 100% su 2,5M', medio.extraCost, 2_500_000 * 1.8 + 2_500_000 * 1.0)
  const grande = hyperAmortization(25_000_000, 0.24)
  eq('oltre 20 milioni non si maggiora più',
    grande.extraCost, 2_500_000 * 1.8 + 7_500_000 * 1.0 + 10_000_000 * 0.5)
  eq('investimento zero', hyperAmortization(0, 0.24).extraCost, 0)
}

console.log('\n— Cosa mostrare, e cosa non riproporre —')
{
  const live = relevantMeasures({
    today: '2026-08-01', newHires: 2, impatriates: 0,
    hasWelfare: false, rndSpend: 0, investments: 0, zes: false,
  })
  is('con assunzioni fatte la maxi-deduzione è prima', live[0].code, 'maxi_deduzione')
  is('l\'IRES premiale non è fra le vive', live.some(m => m.code === 'ires_premiale'), false)

  const senzaNulla = relevantMeasures({
    today: '2026-08-01', newHires: 0, impatriates: 0,
    hasWelfare: true, rndSpend: 0, investments: 0, zes: false,
  })
  is('senza dati resta comunque un elenco utile', senzaNulla.length > 3, true)

  const finite = expiredMeasures('2026-08-01')
  is('l\'IRES premiale è fra le scadute', finite.some(m => m.code === 'ires_premiale'), true)
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
