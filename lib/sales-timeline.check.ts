/* La timeline del lead (§438).
   Esegui: npx tsx lib/sales-timeline.check.ts

   Tre cose da non sbagliare: un contatto già avvenuto nel futuro (il lead non
   risulterebbe mai fermo), un esito che non appartiene al suo tipo (il
   database lo rifiuterebbe con un messaggio da database), e mezzanotte scritta
   come un orario per un contatto di cui l'ora non l'ha segnata nessuno. */

import { validaVoce, quandoContatto, giornoOraRoma, istanteRoma, giornoEOraRoma, titoloVoce, giorniFa } from '@/lib/sales-timeline'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(64)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

// giovedì 25 settembre 2026, 15:00 a Roma
const ADESSO = Date.parse('2026-09-25T13:00:00Z')

console.log('\n— Quando, da leggere al volo —')
is('oggi con l\'ora di Roma', quandoContatto('2026-09-25T12:32:00Z', true, ADESSO), 'Oggi 14:32')
is('ieri', quandoContatto('2026-09-24T07:10:00Z', true, ADESSO), 'Ieri 09:10')
is('tre giorni fa', quandoContatto('2026-09-22T14:05:00Z', true, ADESSO), '3 giorni fa · 16:05')
is('oltre la settimana, il giorno', quandoContatto('2026-09-12T14:05:00Z', true, ADESSO), '12 set 16:05')
is('l\'anno solo quando non è questo', quandoContatto('2025-12-30T10:00:00Z', true, ADESSO), '30 dic 2025 11:00')
is('senza ora registrata: niente mezzanotte', quandoContatto('2026-09-24T00:00:00Z', false, ADESSO), 'Ieri')
is('le 23:30 UTC di ieri sono già oggi a Roma', quandoContatto('2026-09-24T23:30:00Z', true, ADESSO), 'Oggi 01:30')
is('domani, per un follow-up', quandoContatto('2026-09-26T07:30:00Z', true, ADESSO), 'Domani 09:30')
is('vuoto resta vuoto', [quandoContatto(null, true, ADESSO), quandoContatto('boh', true, ADESSO)], ['', ''])
is('giorni fa a Roma: la mezzanotte è quella di Roma', [giorniFa('2026-09-24T22:01:00Z', ADESSO), giorniFa('2026-09-24T21:59:00Z', ADESSO)], [0, 1])

console.log('\n— Per il foglio —')
is('data e ora', giornoOraRoma('2026-09-24T12:32:00Z'), '24/09/2026 14:32')
is('solo il giorno se l\'ora non c\'è', giornoOraRoma('2026-09-24T00:00:00Z', false), '24/09/2026')

console.log('\n— Le 9 di Roma, dal browser di chiunque —')
is('estate: UTC+2', istanteRoma('2026-09-25', '09:00'), '2026-09-25T07:00:00.000Z')
is('inverno: UTC+1', istanteRoma('2026-12-01', '09:00'), '2026-12-01T08:00:00.000Z')
is('l\'ora che non esiste nel cambio d\'ora', istanteRoma('2026-03-29', '02:30'), null)
is('andata e ritorno', giornoEOraRoma(Date.parse(istanteRoma('2026-10-25', '18:45')!)), { giorno: '2026-10-25', ora: '18:45' })
is('forma sbagliata', [istanteRoma('25/09/2026', '09:00'), istanteRoma('2026-09-25', '25:00')], [null, null])

console.log('\n— Una voce dal browser —')
const ok = (x: unknown) => validaVoce(x, ADESSO)
is('chiamata risposta adesso', ok({ type: 'chiamata', outcome: 'risposto', occurred_at: '2026-09-25T13:00:00Z' }).ok, true)
is('chiamata senza esito', ok({ type: 'chiamata', occurred_at: '2026-09-25T13:00:00Z' }).ok, false)
is('esito di un altro tipo', ok({ type: 'chiamata', outcome: 'fatto', occurred_at: '2026-09-25T13:00:00Z' }).ok, false)
is('email senza verso', ok({ type: 'email', occurred_at: '2026-09-25T13:00:00Z' }).ok, false)
const em = ok({ type: 'email', direction: 'entrata', outcome: 'risposto', occurred_at: '2026-09-25T13:00:00Z' })
is('email: l\'esito si scarta, resta il verso', em.ok && [em.valore.outcome, em.valore.direction], [null, 'entrata'])
is('meeting non presentato', ok({ type: 'meeting', outcome: 'non_presentato', occurred_at: '2026-09-25T12:00:00Z' }).ok, true)
is('nel futuro no: per quello c\'è il follow-up', ok({ type: 'chiamata', outcome: 'risposto', occurred_at: '2026-09-26T13:00:00Z' }).ok, false)
is('quattro minuti avanti sì: l\'orologio del telefono', ok({ type: 'chiamata', outcome: 'risposto', occurred_at: '2026-09-25T13:04:00Z' }).ok, true)
is('una nota vuota no', ok({ type: 'nota', content: '  ', occurred_at: '2026-09-25T13:00:00Z' }).ok, false)
is('follow-up e contatto non si scrivono da qui', [ok({ type: 'followup', occurred_at: '2026-09-25T13:00:00Z' }).ok, ok({ type: 'contatto', occurred_at: '2026-09-25T13:00:00Z' }).ok], [false, false])
is('il tipo inventato', ok({ type: 'piccione', occurred_at: '2026-09-25T13:00:00Z' }).ok, false)
const n = ok({ type: 'whatsapp', direction: 'uscita', content: '  ci sentiamo  ', occurred_at: '2026-09-25T12:00:00+02:00', has_time: false })
is('testo ripulito, istante normalizzato, ora non registrata', n.ok && [n.valore.content, n.valore.occurred_at, n.valore.has_time],
  ['ci sentiamo', '2026-09-25T10:00:00.000Z', false])

console.log('\n— Il titolo di una voce —')
is('chiamata', titoloVoce({ type: 'chiamata', outcome: 'non_risposto', direction: null, stato: 'fatta' }), 'Chiamata · Non risposto')
is('messaggio', titoloVoce({ type: 'whatsapp', outcome: null, direction: 'entrata', stato: 'fatta' }), 'Messaggio · Ricevuto da lui')
is('follow-up', titoloVoce({ type: 'followup', outcome: null, direction: null, stato: 'in_programma' }), 'Follow-up in programma')

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
