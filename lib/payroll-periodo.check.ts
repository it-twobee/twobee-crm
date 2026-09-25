/* Il personale su un periodo (§448).
   Esegui: npx tsx lib/payroll-periodo.check.ts

   Le cose da non sbagliare: una cella stimata che si spaccia per vera, chi non
   era ancora assunto che costa lo stesso, la tredicesima già pagata contata di
   nuovo come residuo, e la quattordicesima che matura da gennaio invece che da
   luglio. */

import { DEFAULT_PAYROLL_PARAMS, emptyPerson, personCost, type Payslip } from '@/lib/payroll'
import type { PersonRow } from '@/lib/payroll-map'
import { calendarioUscite, cellaCosto, maturatiAl, matrice } from '@/lib/payroll-periodo'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(64)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const P = DEFAULT_PAYROLL_PARAMS
const persona = (o: Partial<PersonRow>): PersonRow => ({
  ...emptyPerson({ name: 'Anna', kind: 'indeterminato', gross: 28_000, months: 14, fte: 1 }),
  id: 'a', role: null, tfrOpening: 0, active: true, agreedNet: null, status: 'attiva', hiredOn: '2024-01-01', endsOn: null, pensionFundPct: 0, ...o,
})
const slip = (o: Partial<Payslip>): Payslip => ({
  id: 's', personId: 'a', month: '2026-06-01', basePay: 0, holidaysTaken: 0, leavePaid: 0, publicHolidays: 0,
  thirteenth: 0, fourteenth: 0, overtime: 0, bonus: 0, allowances: 0, reimbursements: 0, travel: 0, totalEarnings: 0,
  contributoryBase: 0, taxableBase: 0, employeeContrib: 0, irpef: 0, surcharges: 0, otherDeductions: 0, rounding: 0, netPaid: 0,
  employerContrib: null, inail: null, otherEmployer: 0, tfrAccrued: 0, netPaidOn: null, f24PaidOn: null, paymentStatus: 'pagato', ...o,
})
const anna = persona({})

console.log('\n— Una cella —')
const vera = cellaCosto(anna, slip({ totalEarnings: 2000, contributoryBase: 2000, employerContrib: 600, inail: 10, tfrAccrued: 148 }), P, '2026-06-01')
is('dal cedolino: il costo vero, e la fonte lo dice', [vera.fonte, vera.totale, vera.lordo, vera.oneri, vera.tfr, vera.oneriStimati], ['cedolino', 2758, 2000, 610, 148, false])
is('cedolino senza oneri del consulente: vero, ma oneri stimati', cellaCosto(anna, slip({ totalEarnings: 2000, contributoryBase: 2000 }), P, '2026-06-01').oneriStimati, true)
const stima = cellaCosto(anna, null, P, '2026-10-01')
is('senza cedolino: la stima da contratto, dichiarata', [stima.fonte, stima.totale], ['stima', personCost(anna, P).monthly])
is('le voci della stima tornano al totale', Math.abs(stima.lordo + stima.oneri + stima.tfr + stima.altro - stima.totale) < 0.05, true)
is('prima dell\'assunzione non costa', cellaCosto(persona({ hiredOn: '2026-11-15' }), null, P, '2026-10-01').fonte, 'fuori')
is('dopo la fine del rapporto nemmeno', cellaCosto(persona({ endsOn: '2026-08-31' }), null, P, '2026-09-01').fonte, 'fuori')

console.log('\n— La matrice —')
const m = matrice([anna, persona({ id: 'b', name: 'Bruno', hiredOn: '2027-01-01' })], [slip({ month: '2026-09-01', totalEarnings: 2000, contributoryBase: 2000, employerContrib: 600, inail: 10, tfrAccrued: 148 })], () => P, ['2026-09-01', '2026-10-01'])
is('chi non è mai in forza nel periodo resta fuori', m.righe.map(r => r.persona.id), ['a'])
is('una vera, una stimata', [m.vere, m.stimate, m.righe[0].daCedolino], [1, 1, 1])
is('i totali tornano', m.totale, Math.round((2758 + personCost(anna, P).monthly) * 100) / 100)

console.log('\n— I maturati —')
const rateo = Math.round((28_000 / 14 / 12) * 100) / 100
const set = maturatiAl(anna, [], P, '2026-09-01', null)
is('tredicesima a settembre: nove ratei', set.tredicesima.maturato, Math.round(rateo * 9 * 100) / 100)
is('quattordicesima a settembre: da luglio, tre ratei', set.quattordicesima?.maturato, Math.round(rateo * 3 * 100) / 100)
is('esce a dicembre e a giugno', [set.tredicesima.esce, set.quattordicesima?.esce], ['2026-12-01', '2027-06-01'])
const giugnoPagato = maturatiAl(anna, [slip({ month: '2026-06-01', fourteenth: 2000 })], P, '2026-06-01', null)
is('14ª pagata a giugno: residuo zero', [giugnoPagato.quattordicesima?.pagato, giugnoPagato.quattordicesima?.residuo, giugnoPagato.quattordicesima?.esce], [2000, 0, null])
const nuova = maturatiAl(persona({ hiredOn: '2026-07-01' }), [], P, '2026-09-01', null)
is('assunta a luglio: la 13ª matura da luglio', nuova.tredicesima.maturato, Math.round(rateo * 3 * 100) / 100)
is('senza 14ª nel contratto: niente 14ª', maturatiAl(persona({ months: 13 }), [], P, '2026-09-01', null).quattordicesima, null)
is('l\'uscita di cassa porta gli oneri azienda', set.tredicesima.esceCassa > rateo * 12, true)

console.log('\n— Il TFR e il calendario —')
const tfr = { personId: 'a', accruedMonth: 150, accruedYear: 1350, accruedTotal: 5000, toFund: 0, liquidated: 0, advances: 0, revaluation: 0, inCompany: 5000 }
const esce = maturatiAl(persona({ endsOn: '2026-11-30' }), [], P, '2026-09-01', tfr)
is('chi finisce a novembre: il TFR in azienda esce a novembre', [esce.tfr.esce, esce.tfr.inAzienda], ['2026-11-01', 5000])
const fondo = maturatiAl(persona({ pensionFundPct: 1 }), [], P, '2026-09-01', tfr)
is('con il fondo pensione: una quota ogni mese', fondo.tfr.fondoMensile > 0, true)
const cal = calendarioUscite([{ persona: persona({ endsOn: '2026-11-30' }), maturati: esce }], '2026-09-01', 6)
is('chi lascia a novembre: 13ª e 14ª pro quota e TFR, tutto a novembre', cal.map(u => [u.mese, u.cosa]), [['2026-11-01', 'tredicesima'], ['2026-11-01', 'quattordicesima'], ['2026-11-01', 'tfr']])
is('undici ratei, non dodici', esce.tredicesima.maturato, Math.round(rateo * 9 * 100) / 100)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
