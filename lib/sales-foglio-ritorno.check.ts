/* Il ritorno sul foglio (§434).
   Esegui: npx tsx lib/sales-foglio-ritorno.check.ts

   Le due cose da non sbagliare mai: toccare una colonna che non è nostra
   (STATUS e Note sono di chi le scrive a mano), e riscrivere celle uguali —
   ogni notte, trecento modifiche che nella cronologia del foglio non dicono
   niente. */

import { COLONNE_OS, pianoRitorno, lettera, rif, giornoRoma, type LeadRitorno } from '@/lib/sales-foglio-ritorno'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}

const lead = (id: string, fase: string, extra: Partial<LeadRitorno> = {}): LeadRitorno => ({
  sheetRowId: id, 'Fase OS': fase, 'Qualifica OS': '', 'Owner OS': '', 'Ultimo contatto OS': '', 'Motivo perso OS': '', ...extra,
})

console.log('\n— I nomi delle colonne —')
is('A, Z, AA, AZ', [lettera(0), lettera(25), lettera(26), lettera(51)], ['A', 'Z', 'AA', 'AZ'])
is('il nome del foglio fra apici, anche con un apice dentro',
  rif("Lead d'agosto", { riga: 11, colonna: 2, valore: '' }), "'Lead d''agosto'!C12")

console.log('\n— Il primo giro: le colonne si aggiungono in fondo —')
const foglio = [
  ['id', 'company_name', 'STATUS', 'Note'],
  ['l:111', 'Acme', 'Nuovo', 'richiamare'],
  ['l:222', 'Beta', 'Chiuso', ''],
  ['l:999', 'Eliminata', 'Nuovo', ''],
]
const p1 = pianoRitorno(foglio, [
  lead('111', 'Qualificata', { 'Owner OS': 'Anna Rossi', 'Ultimo contatto OS': '2026-09-22' }),
  lead('222', 'Perso', { 'Motivo perso OS': 'Prezzo' }),
])
is('le cinque intestazioni, dopo l\'ultima colonna', p1.celle.filter(c => c.riga === 0).map(c => [c.colonna, c.valore]),
  COLONNE_OS.map((n, i) => [4 + i, n]))
is('e il riepilogo le nomina', p1.nuoveColonne.length, 5)
is('STATUS e Note non si toccano mai', p1.celle.some(c => c.colonna === 2 || c.colonna === 3), false)
is('la riga di Acme scrive fase, owner e contatto', p1.celle.filter(c => c.riga === 1).map(c => c.valore),
  ['Qualificata', 'Anna Rossi', '2026-09-22'])
is('una riga che nel tool non c\'è resta com\'è', p1.celle.some(c => c.riga === 3), false)
is('conta le righe abbinate', p1.abbinate, 2)

console.log('\n— Il giro dopo: solo quello che è cambiato —')
const dopo = [
  ['id', 'company_name', 'STATUS', 'Note', ...COLONNE_OS],
  ['l:111', 'Acme', 'Nuovo', 'richiamare', 'Qualificata', '', 'Anna Rossi', '2026-09-22', ''],
  ['l:222', 'Beta', 'Chiuso', '', 'Perso', '', '', '', 'Prezzo'],
]
const uguali = pianoRitorno(dopo, [
  lead('111', 'Qualificata', { 'Owner OS': 'Anna Rossi', 'Ultimo contatto OS': '2026-09-22' }),
  lead('222', 'Perso', { 'Motivo perso OS': 'Prezzo' }),
])
is('niente di cambiato, niente da scrivere', uguali.celle.length, 0)
const mosso = pianoRitorno(dopo, [
  lead('111', 'Proposta inviata', { 'Owner OS': 'Anna Rossi', 'Ultimo contatto OS': '2026-09-22' }),
  lead('222', 'Perso', { 'Motivo perso OS': 'Prezzo' }),
])
is('una fase cambiata è una cella sola', mosso.celle, [{ riga: 1, colonna: 4, valore: 'Proposta inviata' }])
const tolto = pianoRitorno(dopo, [
  lead('111', 'Qualificata', { 'Ultimo contatto OS': '2026-09-22' }),
  lead('222', 'Perso', { 'Motivo perso OS': 'Prezzo' }),
])
is('un owner tolto nel tool si svuota anche là', tolto.celle, [{ riga: 1, colonna: 6, valore: '' }])

console.log('\n— Le colonne si trovano per nome, anche spostate —')
const spostate = [['Owner OS', 'id', 'Fase OS', 'Qualifica OS', 'Ultimo contatto OS', 'Motivo perso OS'], ['', 'l:111', '', '', '', '']]
const p3 = pianoRitorno(spostate, [lead('111', 'Qualificata', { 'Owner OS': 'Anna' })])
is('nessuna colonna nuova se ci sono già', p3.nuoveColonne, [])
is('ognuna al suo posto', p3.celle.map(c => [c.colonna, c.valore]), [[2, 'Qualificata'], [0, 'Anna']])

console.log('\n— Senza la colonna id non si scrive niente —')
let errore = ''
try { pianoRitorno([['company_name'], ['Acme']], [lead('111', 'x')]) } catch (e) { errore = (e as Error).message }
is('lo dice, invece di scrivere a caso', errore.includes('«id»'), true)

console.log('\n— Le date a Roma —')
is('le 23:30 UTC sono già il giorno dopo a Roma', giornoRoma('2026-09-21T23:30:00Z'), '2026-09-22')
is('senza data, niente', [giornoRoma(null), giornoRoma('boh')], ['', ''])

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
