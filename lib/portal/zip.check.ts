/* §421 — Esegui: npx tsx lib/portal/zip.check.ts
   Gli zip dell'area file: come si chiamano i file dentro, e lo zip stesso. Un
   nome sbagliato qui non dà errori: dà un file che l'estrazione salta, o due
   file che diventano uno. */
import assert from 'node:assert/strict'
import { attachmentHeader, safeSegment, zipEmptyFolders, zipEntryNames, zipFileName } from './zip'

let failures = 0
function is(label: string, actual: unknown, expected: unknown) {
  try { assert.deepEqual(actual, expected); console.log(`OK  ${label}`) }
  catch { failures += 1; console.log(`NO  ${label}\n    ${JSON.stringify(actual)}\n    atteso ${JSON.stringify(expected)}`) }
}

console.log('\n— Nomi che si creano ovunque —')
is('un nome normale resta com’è', safeSegment('Logo bianco 2025.png'), 'Logo bianco 2025.png')
is('i caratteri vietati da Windows diventano _', safeSegment('Preventivo: v2 "finale"?.pdf'), 'Preventivo_ v2 _finale__.pdf')
is('niente barre: sarebbero cartelle', safeSegment('a/b\\c'), 'a_b_c')
is('punti e spazi in fondo spariscono', safeSegment('bozza. . '), 'bozza')
is('un nome riservato si sposta', safeSegment('CON.txt'), '_CON.txt')
is('un nome vuoto non resta vuoto', safeSegment('   '), '_')

console.log('\n— Cosa entra, e con che nome —')
const files = [
  { id: '1', name: 'logo.png', path: 'Brand/Loghi' },
  { id: '2', name: 'Logo.png', path: 'Brand/Loghi' },
  { id: '3', name: 'manuale.pdf', path: 'Brand' },
  { id: '4', name: 'preventivo.pdf', path: null },
  { id: '5', name: 'manuale.pdf', path: 'Brandizzati' },
]
const brand = zipEntryNames(files, 'Brand', 'Brand')
is('la cartella scaricata è la radice dello zip', brand.get('3'), 'Brand/manuale.pdf')
is('le sottocartelle restano sottocartelle', brand.get('1'), 'Brand/Loghi/logo.png')
is('due nomi uguali per Windows non si sovrascrivono', brand.get('2'), 'Brand/Loghi/Logo (2).png')
is('fuori dalla cartella non entra niente', [brand.has('4'), brand.has('5')], [false, false])
const all = zipEntryNames(files, '')
is('tutto lo spazio: senza cartella radice', all.get('4'), 'preventivo.pdf')
is('e tutti i file', all.size, 5)
const picked = zipEntryNames([{ id: 'a', name: 'x.pdf', path: 'A' }, { id: 'b', name: 'x.pdf', path: 'B' }], '')
is('una selezione da cartelle diverse tiene le cartelle', [picked.get('a'), picked.get('b')], ['A/x.pdf', 'B/x.pdf'])
is('un percorso con caratteri vietati si sistema anche lui', zipEntryNames([{ id: 'z', name: 'f.txt', path: 'Q1: bilancio' }], '').get('z'), 'Q1_ bilancio/f.txt')

console.log('\n— Le cartelle vuote ci sono anche nello zip —')
is('una cartella vuota entra', zipEmptyFolders(['Brand/Vuota', 'Brand'], files, 'Brand', 'Brand'), ['Brand/Vuota'])
is('una cartella con dentro un file c’è già', zipEmptyFolders(['Brand/Loghi'], files, 'Brand', 'Brand'), [])
is('fuori dalla cartella no', zipEmptyFolders(['Altro'], files, 'Brand', 'Brand'), [])

console.log('\n— Il nome dello zip —')
is('azienda e cartella', zipFileName('Metro-Quadro (Costruisci & Arreda)', 'Brand'), 'Metro-Quadro (Costruisci & Arreda) – Brand.zip')
is('senza cartella, l’azienda', zipFileName('Azienda', ''), 'Azienda.zip')
is('senza niente, un nome lo stesso', zipFileName('', ''), 'file.zip')
is('l’intestazione ha un nome ASCII e quello vero', attachmentHeader('Città – Brand.zip'),
  'attachment; filename="Citta _ Brand.zip"; filename*=UTF-8\'\'Citt%C3%A0%20%E2%80%93%20Brand.zip')

if (failures) { console.log(`\n${failures} controlli falliti.`); process.exit(1) }
console.log('\nTutti i controlli passano.')
