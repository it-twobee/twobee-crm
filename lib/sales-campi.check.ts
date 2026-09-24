/* I campi personalizzati della scheda lead (§437).
   Esegui: npx tsx lib/sales-campi.check.ts

   Due cose da non sbagliare: un valore che entra nel tipo sbagliato (una data
   che non esiste, un numero che è una parola) e un elenco di campi che confonde
   la scheda (due caselle con lo stesso nome). */

import {
  problemiCampi, validaExtra, opzioniDa, comeColonna, campiDaMostrare, nuovoCampo, chiaveCampo, TIPI_CAMPO,
  type Campo,
} from '@/lib/sales-campi'

let fail = 0
const is = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'NO '} ${label.padEnd(58)} ${JSON.stringify(got)}${ok ? '' : `  atteso ${JSON.stringify(want)}`}`)
}
const c = (etichetta: string, extra: Partial<Campo> = {}): Campo => ({
  chiave: etichetta.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '') || 'x_x',
  etichetta, tipo: 'testo', opzioni: [], riquadro: 'trattativa', aiuto: null, ordine: 10, attivo: true, ...extra,
})
const val = (tipo: Campo['tipo'], v: unknown, opzioni: string[] = []) => validaExtra({ tipo, opzioni, etichetta: 'Campo' }, v)

console.log('\n— Niente importi —')
is('il tipo «importo» non esiste, ed è voluto', (TIPI_CAMPO as readonly string[]).includes('importo'), false)

console.log('\n— Cosa rende salvabile un elenco —')
is('un elenco sano', problemiCampi([c('Settore ATECO'), c('Gestionale', { tipo: 'scelta', opzioni: ['Zucchetti', 'TeamSystem'] })]), [])
is('niente nomi vuoti', problemiCampi([c('')]).some(p => p.includes('senza nome')), true)
is('niente nomi già presenti nella scheda', problemiCampi([c('Email')]).some(p => p.includes('c\'è già')), true)
is('niente nomi ripetuti', problemiCampi([c('Sito'), c('sito', { chiave: 'sito_2' })]).some(p => p.includes('due volte')), true)
is('una scelta senza voci no', problemiCampi([c('Gestionale', { tipo: 'scelta' })]).some(p => p.includes('senza voci')), true)
is('una scelta con una voce ripetuta no', problemiCampi([c('G', { chiave: 'gg', tipo: 'scelta', opzioni: ['A', 'a'] })]).some(p => p.includes('ripetuta')), true)
is('un riquadro inventato no', problemiCampi([c('X', { chiave: 'xx', riquadro: 'provenienza' as never })]).some(p => p.includes('riquadro')), true)
is('trentuno campi sono troppi',
  problemiCampi(Array.from({ length: 31 }, (_, i) => c(`Campo ${i}`, { chiave: `campo_${i}` }))).some(p => p.includes('Al massimo')), true)
is('un campo nuovo ha una chiave libera', nuovoCampo(['nuovo_campo']).chiave, 'nuovo_campo_2')
is('«Notes» non prende la chiave della colonna delle note', chiaveCampo('Notes', []), 'notes_2')
is('e una chiave di colonna scritta a mano si ferma', problemiCampi([c('Appunti', { chiave: 'notes' })]).some(p => p.includes('chiave')), true)

console.log('\n— Le voci di una scelta si scrivono con le virgole —')
is('spazi e vuoti via, doppioni via', opzioniDa(' Zucchetti, TeamSystem ,, Zucchetti '), ['Zucchetti', 'TeamSystem'])

console.log('\n— Un valore entra solo nel suo tipo —')
is('il vuoto toglie, non salva ""', val('testo', '   '), { ok: true, valore: null })
is('il numero all\'italiana', val('numero', '1.250,5'), { ok: true, valore: 1250.5 })
is('il numero semplice', val('numero', '42'), { ok: true, valore: 42 })
is('una parola non è un numero', val('numero', 'tanti').ok, false)
is('una data vera', val('data', '2026-02-28'), { ok: true, valore: '2026-02-28' })
is('il 30 febbraio non esiste', val('data', '2026-02-30').ok, false)
is('sì/no', [val('si_no', true), val('si_no', 'false'), val('si_no', null)],
  [{ ok: true, valore: true }, { ok: true, valore: false }, { ok: true, valore: null }])
is('una voce della scelta', val('scelta', 'Zucchetti', ['Zucchetti']), { ok: true, valore: 'Zucchetti' })
is('una voce inventata no', val('scelta', 'SAP', ['Zucchetti']).ok, false)
is('il link senza https lo prende', val('url', 'twobee.it'), { ok: true, valore: 'https://twobee.it' })
is('una parola non è un link', val('url', 'boh').ok, false)
is('un telefono', val('telefono', '+39 333 123 4567').ok, true)
is('una parola non è un telefono', val('telefono', 'chiamami').ok, false)
is('un\'email', val('email', 'amm@azienda.it').ok, true)
is('senza chiocciola no', val('email', 'amm.azienda.it').ok, false)
is('il motivo dice quale campo', (val('numero', 'x') as { motivo: string }).motivo.startsWith('«Campo»'), true)

console.log('\n— Nella scheda —')
is('la cella di sempre, col tipo giusto', comeColonna(c('Gestionale', { tipo: 'scelta', opzioni: ['A'] })).valori, ['A'])
const defs = [c('Uno', { chiave: 'uno', ordine: 20 }), c('Due', { chiave: 'due', ordine: 10 }), c('Vecchio', { chiave: 'vecchio', attivo: false, ordine: 30 })]
is('in ordine, senza i ritirati', campiDaMostrare(defs, {}).map(x => x.chiave), ['due', 'uno'])
is('un ritirato resta se la riga ha un valore', campiDaMostrare(defs, { vecchio: 'x' }).map(x => x.chiave), ['due', 'uno', 'vecchio'])

console.log(fail === 0 ? '\nTutti i controlli passano.\n' : `\n${fail} controlli falliti.\n`)
process.exit(fail === 0 ? 0 : 1)
