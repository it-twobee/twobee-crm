/* Quando fissare un follow-up (§439).
   Esegui: npx tsx lib/sales-agenda.check.ts

   Le cose da non sbagliare: proporre un sabato, un festivo o le 19 come «primo
   buco libero»; dire «Domani 9:30» di venerdì; e bloccare invece di avvisare. */

import { validaFollowup, conflitti, primoLibero, scorciatoie, prossimoLavorativo, giornataLavorativa, spiegaConflitto, type Impegno } from '@/lib/sales-agenda'
import { giornoEOraRoma } from '@/lib/sales-timeline'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(66)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const roma = (ms: number | null) => ms === null ? null : (({ giorno, ora }) => `${giorno} ${ora}`)(giornoEOraRoma(ms))
const Z = (s: string) => Date.parse(s)
const imp = (inizio: string, fine: string, x: Partial<Impegno> = {}): Impegno =>
  ({ id: inizio, tipo: 'google', titolo: 'Call', inizio, fine, tuttoIlGiorno: false, occupa: true, ...x })

// giovedì 25 settembre 2026, 11:00 a Roma
const ADESSO = Z('2026-09-25T09:00:00Z')

console.log('\n— La giornata lavorativa —')
is('giovedì 8–18 di Roma', ((g) => g && [roma(g.da), roma(g.a)])(giornataLavorativa('2026-09-24')), ['2026-09-24 08:00', '2026-09-24 18:00'])
is('sabato no', giornataLavorativa('2026-09-26'), null)
is('Natale no', giornataLavorativa('2026-12-25'), null)
is('dopo il venerdì viene il lunedì', prossimoLavorativo('2026-09-25'), '2026-09-28')
is('dopo il 24 dicembre il 28 (Natale e Santo Stefano)', prossimoLavorativo('2026-12-24'), '2026-12-28')

console.log('\n— I conflitti avvisano —')
is('libero', conflitti(Z('2026-09-25T12:00:00Z'), 30, [], ADESSO), [])
is('alle 19 è fuori orario', conflitti(Z('2026-09-25T17:00:00Z'), 30, [], ADESSO).map(c => c.tipo), ['fuori_orario'])
is('17:45 per 30 minuti sfora le 18', conflitti(Z('2026-09-25T15:45:00Z'), 30, [], ADESSO).map(c => c.tipo), ['fuori_orario'])
is('sabato', conflitti(Z('2026-09-26T08:00:00Z'), 30, [], ADESSO).map(spiegaConflitto), ['Non è un giorno lavorativo: è nel fine settimana'])
const call = imp('2026-09-25T12:00:00Z', '2026-09-25T13:00:00Z', { titolo: 'Call Rossi' })
is('sovrapposto a una call', conflitti(Z('2026-09-25T12:30:00Z'), 30, [call], ADESSO).map(spiegaConflitto), ['Si sovrappone a «Call Rossi» (14:00–15:00)'])
is('appena dopo la call non è un conflitto', conflitti(Z('2026-09-25T13:00:00Z'), 30, [call], ADESSO), [])
const task = imp('2026-09-25T12:00:00Z', '2026-09-25T13:00:00Z', { tipo: 'task', occupa: false })
is('una task in scadenza non occupa', conflitti(Z('2026-09-25T12:00:00Z'), 30, [task], ADESSO), [])
const ferie = imp('2026-09-24T22:00:00Z', '2026-09-25T22:00:00Z', { tipo: 'ferie', tuttoIlGiorno: true, titolo: 'Ferie' })
is('in ferie', conflitti(Z('2026-09-25T12:00:00Z'), 30, [ferie], ADESSO).map(c => c.tipo), ['ferie'])
is('nel passato', conflitti(Z('2026-09-25T07:00:00Z'), 30, [], ADESSO).map(c => c.tipo), ['passato'])

console.log('\n— Il primo buco libero —')
is('adesso, arrotondato al quarto d\'ora', roma(primoLibero(Z('2026-09-25T09:07:00Z'), 30, [])), '2026-09-25 11:15')
is('dopo la call', roma(primoLibero(Z('2026-09-25T12:00:00Z'), 30, [call])), '2026-09-25 15:00')
is('alle 17:50 non ci sta: lunedì alle 8', roma(primoLibero(Z('2026-09-25T15:50:00Z'), 30, [])), '2026-09-28 08:00')
is('in ferie: il giorno dopo', roma(primoLibero(Z('2026-09-25T09:00:00Z'), 30, [ferie])), '2026-09-28 08:00')
is('una ferie da approvare non blocca il suggerimento', roma(primoLibero(Z('2026-09-25T09:00:00Z'), 30, [{ ...ferie, daConfermare: true }])), '2026-09-25 11:00')
const pieno = imp('2026-09-25T06:00:00Z', '2026-09-25T16:00:00Z')
is('giornata piena: lunedì', roma(primoLibero(Z('2026-09-25T09:00:00Z'), 60, [pieno])), '2026-09-28 08:00')

console.log('\n— Le scorciatoie —')
const s = scorciatoie(ADESSO)
const per = (k: string) => { const x = s.find(y => y.chiave === k); return x && [x.etichetta, roma(Z(x.istante))] }
is('tra un\'ora', per('tra1h'), ['Tra un’ora · 12:00', '2026-09-25 12:00'])
is('oggi pomeriggio', per('oggi15'), ['Oggi pomeriggio · 15:00', '2026-09-25 15:00'])
is('di venerdì «domani» è lunedì', per('domani930'), ['Lunedì mattina · 9:30', '2026-09-28 09:30'])
is('tra 3 giorni lavorativi', per('tre'), ['Tra 3 giorni lavorativi · mercoledì 10:00', '2026-09-30 10:00'])
is('lunedì prossimo e «domani» di venerdì: la stessa data resta due scelte diverse', per('lunedi'), ['Lunedì prossimo · 10:00', '2026-09-28 10:00'])
const sera = scorciatoie(Z('2026-09-24T17:00:00Z'))
is('alle 19 «oggi pomeriggio» sparisce', sera.some(x => x.chiave === 'oggi15'), false)
is('giovedì sera «domani» è venerdì', sera.find(x => x.chiave === 'domani930')?.etichetta, 'Domani mattina · 9:30')
is('prima di Natale: dopo i festivi', ((x) => x && roma(Z(x.istante)))(scorciatoie(Z('2026-12-24T09:00:00Z')).find(x => x.chiave === 'domani930')), '2026-12-28 09:30')

console.log('\n— Un follow-up dal browser —')
const vf = (x: unknown) => validaFollowup(x, ADESSO)
is('buono', vf({ inizio: '2026-09-26T08:00:00Z', durata: 30, titolo: ' Richiamo ' }), { ok: true, valore: { inizio: '2026-09-26T08:00:00.000Z', durata: 30, titolo: 'Richiamo' } })
is('nel passato no', vf({ inizio: '2026-09-24T08:00:00Z', durata: 30, titolo: 'x' }).ok, false)
is('durata strana no', [vf({ inizio: '2026-09-26T08:00:00Z', durata: 2, titolo: 'x' }).ok, vf({ inizio: '2026-09-26T08:00:00Z', durata: 30.5, titolo: 'x' }).ok], [false, false])
is('senza titolo no', vf({ inizio: '2026-09-26T08:00:00Z', durata: 30, titolo: '  ' }).ok, false)

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
