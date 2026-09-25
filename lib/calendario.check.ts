/* Il calendario in un tipo solo (§446).
   Esegui: npx tsx lib/calendario.check.ts

   Le cose da non sbagliare: un evento di più giorni che compare solo nel primo,
   due riunioni sovrapposte disegnate una sopra l'altra, un filtro che vale in
   una vista e non in un'altra, e il giorno del browser al posto di quello di Roma. */

import { delGiorno, disponi, filtra, giorniDi, grigliaMese, settimanaDi, tuttoIlGiorno, type VoceCal } from '@/lib/calendario'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(64)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const v = (id: string, inizio: string, fine: string, x: Partial<VoceCal> = {}): VoceCal =>
  ({ id, tipo: 'evento', titolo: id, inizio, fine, tuttoIlGiorno: false, profileId: 'p', ...x })

console.log('\n— I giorni, a Roma —')
const lungo = v('fiera', '2026-09-28T07:00:00Z', '2026-09-30T16:00:00Z')
is('un evento di tre giorni sta su tre giorni', giorniDi(lungo), ['2026-09-28', '2026-09-29', '2026-09-30'])
is('e compare il giorno di mezzo', delGiorno([lungo], '2026-09-29').length, 1)
const tg = { ...v('ferie', '', ''), ...tuttoIlGiorno('2026-09-28', '2026-09-29'), tuttoIlGiorno: true }
is('tutto il giorno: due giorni, non tre', giorniDi(tg), ['2026-09-28', '2026-09-29'])
is('le 23:30 UTC sono già domani a Roma', giorniDi(v('tardi', '2026-09-28T22:30:00Z', '2026-09-28T23:00:00Z')), ['2026-09-29'])
is('finisce a mezzanotte: non tocca il giorno dopo', delGiorno([v('x', '2026-09-28T20:00:00Z', '2026-09-28T22:00:00Z')], '2026-09-29').length, 0)

console.log('\n— Le corsie —')
const g = '2026-09-28'
const d = disponi([
  v('a', '2026-09-28T07:00:00Z', '2026-09-28T08:00:00Z'),   // 9–10
  v('b', '2026-09-28T07:30:00Z', '2026-09-28T09:00:00Z'),   // 9:30–11
  v('c', '2026-09-28T13:00:00Z', '2026-09-28T14:00:00Z'),   // 15–16, da sola
], g)
const per = (id: string) => { const x = d.find(y => y.voce.id === id)!; return [x.corsia, x.corsie, x.daMin, x.perMin] }
is('le due sovrapposte: corsie 0 e 1 di 2', [per('a'), per('b')], [[0, 2, 120, 60], [1, 2, 150, 90]])
is('quella isolata prende tutta la larghezza', per('c'), [0, 1, 480, 60])
is('tutto il giorno fuori dalla griglia', disponi([{ ...tg }], g).length, 0)
is('fuori dalla griglia (alle 23): tagliata via', disponi([v('notte', '2026-09-28T21:00:00Z', '2026-09-28T22:00:00Z')], g).length, 0)
is('un evento di 5 minuti ha almeno un quarto d\'ora', disponi([v('flash', '2026-09-28T08:00:00Z', '2026-09-28T08:05:00Z')], g)[0].perMin, 15)
is('una corsia si libera e si riusa', disponi([
  v('a', '2026-09-28T07:00:00Z', '2026-09-28T09:00:00Z'), v('b', '2026-09-28T07:00:00Z', '2026-09-28T08:00:00Z'), v('c', '2026-09-28T08:00:00Z', '2026-09-28T09:00:00Z'),
], g).map(x => [x.voce.id, x.corsia, x.corsie]), [['a', 0, 2], ['b', 1, 2], ['c', 1, 2]])

console.log('\n— I filtri —')
const voci = [v('e', '', '', { tipo: 'evento' }), v('r', '', '', { tipo: 'riunione', dettaglio: 'Acme srl' }), v('f', '', '', { tipo: 'ferie' }), v('t', '', '', { tipo: 'task' })]
is('eventi e riunioni insieme', filtra(voci, { filtri: new Set(['eventi']) }).map(x => x.id), ['e', 'r'])
is('ferie e permessi', filtra(voci, { filtri: new Set(['assenze', 'task']) }).map(x => x.id), ['f', 't'])
is('la ricerca guarda anche il dettaglio', filtra(voci, { filtri: new Set(['eventi']), cerca: 'acme' }).map(x => x.id), ['r'])

console.log('\n— Settimane e mesi —')
is('la settimana parte da lunedì', settimanaDi('2026-10-01'), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
is('il mese: sei settimane da lunedì', [grigliaMese('2026-10-15')[0], grigliaMese('2026-10-15').length], ['2026-09-28', 42])

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
