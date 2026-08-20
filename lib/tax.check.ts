/* Verifica della stima fiscale. Esegui: npx tsx lib/tax.check.ts */
import { estimateTaxes, entertainmentCap, taxInsights, DEFAULT_TAX_CONFIG as C, type TaxInput } from '@/lib/tax'
import { vatByQuarter, nextDue, vatPending, type VatActual } from '@/lib/vat'

let fail = 0
const eq = (label: string, got: number, want: number, tol = 0.5) => {
  const ok = Math.abs(got - want) <= tol
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${got.toFixed(2).padStart(12)}${ok ? '' : `  atteso ${want.toFixed(2)}`}`)
}
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(54)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

console.log('\n— §191 · Il costo non deducibile torna nell\'imponibile —')
{
  // sei mesi, 60.000 di ricavi e 30.000 di costi → margine annuo 60.000
  const pieno = estimateTaxes(60000, 30000, 6, C, 6)
  eq('margine proiettato', pieno.marginProjected, 60000)
  eq('IRES al 24%', pieno.ires, 14400)

  // gli stessi costi, ma 5.000 non sono deducibili: l'imponibile sale
  const conRipresa = estimateTaxes(60000, 30000, 6, C, 6, 0, 5000)
  eq('la parte non deducibile è dichiarata', conRipresa.nonDeductibleCosts, 5000)
  eq('margine proiettato più alto', conRipresa.marginProjected, 70000)
  eq('e l\'imposta pure', conRipresa.ires, 16800)
  /* Il costo mostrato resta quello vero: la ripresa cambia l'imponibile, non
     quanto è uscito di cassa. Confonderli farebbe sparire 5.000 € dal conto. */
  eq('ma il costo esposto resta quello uscito', conRipresa.costsYtd, 30000)

  const negativo = estimateTaxes(60000, 30000, 6, C, 6, 0, -100)
  eq('un valore negativo non abbassa le imposte', negativo.marginProjected, 60000)
}

console.log('\n— §191 · Il tetto della rappresentanza —')
{
  eq('su 150.000 di ricavi il tetto è 2.250', entertainmentCap(150000), 2250)
  eq('su 75.125, poco più di mille', entertainmentCap(75125), 1126.88)
  eq('senza ricavi non c\'è tetto da spendere', entertainmentCap(0), 0)
  // oltre i 10 milioni lo scaglione scende allo 0,6%
  eq('12 milioni: 150.000 + 12.000', entertainmentCap(12_000_000), 162000)
  eq('un fatturato negativo non produce un tetto', entertainmentCap(-5000), 0)
}

console.log('\n— §191 · L\'avviso scatta prima di spendere, non dopo —')
{
  const base = (entertainmentYtd: number, revenueYtd: number, monthsBooked: number): TaxInput => ({
    today: '2026-08-04', vat: [], nextVat: null,
    estimate: estimateTaxes(revenueYtd, revenueYtd * 0.5, monthsBooked, C, 5),
    aside: { total: 0, neededIva: 0, neededTaxes: 0, set: 0, gap: 0, coveredPct: 0 } as unknown as TaxInput['aside'],
    costsWithoutVat: 0, costsWithVat: 0, vatOnUnpaid: 0, q4Share: 0,
    hasWelfare: false, hasTraining: false, rndSpend: 0, deadlines: [],
    entertainmentYtd,
    iresPct: C.ires_pct, measures: [], hires: [],
  } as unknown as TaxInput)

  /* Ricavi 75.125 su sei mesi = 150.250 l'anno, tetto 2.254. La rappresentanza si
     proietta allo stesso modo: è l'unico confronto onesto, perché entrambi
     crescono coi mesi. */
  const sopra = taxInsights(base(1500, 75125, 6)).find(f => f.id === 'entertainment-cap')
  is('3.000 proiettati contro 2.254 di tetto: critico', sopra?.severity, 'critico')
  eq('e dice quanti euro restano tassati', sopra?.value ?? 0, 3000 - 2253.75)

  const vicino = taxInsights(base(900, 75125, 6)).find(f => f.id === 'entertainment-near-cap')
  is('all\'80% del tetto: avvisa in tempo', vicino?.severity, 'attenzione')

  const sotto = taxInsights(base(200, 75125, 6))
  is('una cena sola non allarma nessuno',
    sotto.some(f => f.id === 'entertainment-cap' || f.id === 'entertainment-near-cap'), false)

  // il mese in corso di luglio: 522 su cinque mesi registrati sta ancora sotto
  const luglio = taxInsights(base(522, 75125, 5))
  is('luglio 2026, com\'è davvero: nessun allarme',
    luglio.some(f => f.id === 'entertainment-cap'), false)

  const senza = taxInsights(base(0, 75125, 6))
  is('senza rappresentanza non si dice niente',
    senza.some(f => f.id.startsWith('entertainment')), false)
}

console.log('\n— §242 · Il modello F24 batte la stima —')
{
  /* La stima nasce dalle righe registrate e sarà sempre diversa dal modello: il
     registro IVA del commercialista contiene fatture che il conto economico non
     ha ancora. Quando il documento arriva vince lui, e **la differenza resta
     scritta** — è l'unico posto in cui quel buco si vede senza cercarlo. */
  const MESI = [
    { month: '2026-04-01', debit: 3000, credit: 200 },
    { month: '2026-05-01', debit: 3000, credit: 300 },
    { month: '2026-06-01', debit: 3108, credit: 291.30 },
  ]
  const stima = vatByQuarter(MESI, '2026-08-09')[0]
  is('senza modello è una stima', stima.source, 'stima')
  is('e non c\'è nessuno scarto da dichiarare', stima.gap, 0)

  const conF24 = vatByQuarter(MESI, '2026-08-09', [
    { quarter: { year: 2026, q: 2 }, toPay: 9669.33, docRef: 'F24 20/08/2026' },
  ])[0]
  is('col modello vince il modello', { s: conF24.source, p: conF24.toPay }, { s: 'f24', p: 9669.33 })
  is('la stima resta accanto', conF24.estimated, stima.toPay)
  is('e lo scarto è dichiarato', conF24.gap, Math.round((9669.33 - stima.toPay) * 100) / 100)
  is('il riferimento si ritrova', conF24.docRef, 'F24 20/08/2026')
  /* Il riporto al trimestre dopo nasce dal saldo **calcolato**: sostituirlo con
     un numero che il documento non contiene sposterebbe l'errore avanti invece
     di mostrarlo. */
  is('ma il riporto resta quello del calcolo', conF24.carried, stima.carried)
  is('e debito e credito pure', { d: conF24.debit, c: conF24.credit }, { d: stima.debit, c: stima.credit })

  /* §289 — una liquidazione **versata** non è più un'uscita da fare. Il 20 agosto
     il 2º trimestre è uscito dal conto: continuare a toglierlo dal saldo lo
     sottraeva due volte, e proprio nel giorno in cui il verdetto serve. */
  const versato: VatActual[] = [
    { quarter: { year: 2026, q: 2 }, toPay: 9669.33, docRef: 'F24 20/08/2026', paidOn: '2026-08-20' },
  ]
  const pagato = vatByQuarter(MESI, '2026-08-20', versato)[0]
  is('un trimestre versato resta in tabella col suo importo', pagato.toPay, 9669.33)
  is('ma non è più fra quelli da versare', vatPending(pagato), false)
  is('e la prossima scadenza non è più lui', nextDue(MESI, '2026-08-20', versato), null)
  /* Senza la data di pagamento il 20 agosto è ancora il giorno della scadenza:
     scaduto no, da versare sì. È il caso che rende visibile la differenza. */
  const nonVersato = vatByQuarter(MESI, '2026-08-20', [
    { quarter: { year: 2026, q: 2 }, toPay: 9669.33 },
  ])[0]
  is('senza la data resta da versare', vatPending(nonVersato), true)
  is('e nextDue lo trova', nextDue(MESI, '2026-08-20', [
    { quarter: { year: 2026, q: 2 }, toPay: 9669.33 },
  ])?.toPay, 9669.33)
}

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
