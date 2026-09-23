/* §416 — Esegui: npx tsx lib/portal/explorer.check.ts
   L'esploratore dell'area file: cosa c'è in una cartella, in che ordine, cosa
   trova una ricerca. Sono le risposte che la pagina dà a chi cerca un file, e
   una risposta sbagliata qui è un file che «non c'è». */
import assert from 'node:assert/strict'
import {
  crumbsOf, extensionBadge, foldText, isInside, isJunkFile, joinPath, lastSegment, listFolder, parentPath,
  searchMaterials, sortFiles, sortFolders,
} from './explorer'

let failures = 0
function is(label: string, actual: unknown, expected: unknown) {
  try { assert.deepEqual(actual, expected); console.log(`OK  ${label}`) }
  catch { failures += 1; console.log(`NO  ${label}\n    ${JSON.stringify(actual)}\n    atteso ${JSON.stringify(expected)}`) }
}

type F = { id: string; name: string; path: string | null; size: number; created_at: string; source: 'team' | 'cliente' }
const f = (id: string, name: string, path: string | null, size: number, day: number, source: F['source'] = 'team'): F =>
  ({ id, name, path, size, created_at: `2026-09-${String(day).padStart(2, '0')}T10:00:00Z`, source })

const files: F[] = [
  f('1', 'Logo_Bianco_2025.png', 'Brand/Loghi', 300, 20),
  f('2', 'logo nero.png', 'Brand/Loghi', 200, 10),
  f('3', 'manuale.pdf', 'Brand', 1000, 5),
  f('4', 'preventivo 10.pdf', null, 50, 22),
  f('5', 'preventivo 9.pdf', null, 40, 21),
  f('6', 'Perché così.docx', 'Varie', 10, 1),
  f('7', 'foto-evento.jpg', 'Brand', 700, 15, 'cliente'),
]
const team = files.filter(x => x.source === 'team')

console.log('\n— Cosa c\'è in una cartella —')
const root = listFolder(team, '')
is('nella radice: le cartelle dirette', root.folders.map(x => x.name).sort(), ['Brand', 'Varie'])
is('e i file che stanno proprio lì', root.files.map(x => x.id).sort(), ['4', '5'])
const brand = root.folders.find(x => x.name === 'Brand')!
is('una cartella conta i file a ogni profondità', brand.count, 3)
is('e pesa quanto quello che contiene', brand.size, 1500)
is('il suo ultimo caricamento è il più recente dentro', brand.latest, '2026-09-20T10:00:00Z')
const loghi = listFolder(team, 'Brand/Loghi')
is('dentro Brand/Loghi: due file', loghi.files.map(x => x.id).sort(), ['1', '2'])
is('e nessuna sottocartella', loghi.folders, [])
is('una cartella che non esiste è vuota, non un errore', listFolder(team, 'Nessuna'), { folders: [], files: [] })
is('un prefisso a metà nome non è una cartella', listFolder([f('9', 'a.png', 'Brandizzati', 1, 1)], 'Brand').files, [])
const withEmpty = listFolder(team, '', ['Archivio 2024', 'Brand/Vecchi'])
is('una cartella esplicita compare anche vuota', withEmpty.folders.find(x => x.name === 'Archivio 2024'), { name: 'Archivio 2024', path: 'Archivio 2024', count: 0, size: 0, latest: null })
is('e una sua sottocartella non gonfia il conteggio di Brand', withEmpty.folders.find(x => x.name === 'Brand')!.count, 3)
is('ma dentro Brand si vede', listFolder(team, 'Brand', ['Brand/Vecchi']).folders.map(x => x.name).sort(), ['Loghi', 'Vecchi'])

console.log('\n— In che ordine —')
is('per data: i più recenti prima', sortFiles(team, 'data', 'desc').map(x => x.id), ['4', '5', '1', '2', '3', '6'])
is('per data, al contrario', sortFiles(team, 'data', 'asc').map(x => x.id), ['6', '3', '2', '1', '5', '4'])
is('per nome: i numeri contano come numeri', sortFiles(root.files, 'nome', 'asc').map(x => x.name), ['preventivo 9.pdf', 'preventivo 10.pdf'])
is('per nome: maiuscole e minuscole insieme', sortFiles([f('b', 'bozza.png', null, 1, 1), f('a', 'Aprile.png', null, 1, 1)], 'nome', 'asc').map(x => x.name), ['Aprile.png', 'bozza.png'])
is('per dimensione: i più pesanti prima', sortFiles(team, 'dimensione', 'desc').map(x => x.id), ['3', '1', '2', '4', '5', '6'])
is('a parità, il nome decide', sortFiles([f('b', 'b.png', null, 1, 1), f('a', 'a.png', null, 1, 1)], 'data', 'desc').map(x => x.id), ['a', 'b'])
const summaries = listFolder(team, '', ['Vuota']).folders
is('cartelle per data: una vuota va in fondo', sortFolders(summaries, 'data', 'desc').map(x => x.name), ['Brand', 'Varie', 'Vuota'])
is('anche al contrario', sortFolders(summaries, 'data', 'asc').map(x => x.name), ['Varie', 'Brand', 'Vuota'])
is('cartelle per nome', sortFolders(summaries, 'nome', 'asc').map(x => x.name), ['Brand', 'Varie', 'Vuota'])

console.log('\n— Cosa trova una ricerca —')
const hit = searchMaterials(files, 'logo bianco')
is('tutte le parole, in qualunque ordine', hit.files.map(x => x.id), ['1'])
is('senza accenti e senza maiuscole', searchMaterials(files, 'PERCHE').files.map(x => x.id), ['6'])
is('in tutti e due gli spazi', searchMaterials(files, 'foto').files.map(x => x.source), ['cliente'])
const folders = searchMaterials(files, 'brand').folders
is('una cartella si trova dal suo nome, in ogni spazio in cui esiste', folders.map(x => `${x.space}:${x.path}`), ['cliente:Brand', 'team:Brand'])
is('col numero di file che contiene', folders.find(x => x.space === 'team')!.count, 3)
is('ma il nome della cartella non trascina i file che contiene', searchMaterials(files, 'brand').files, [])
is('una sottocartella si trova anche lei', searchMaterials(files, 'loghi').folders.map(x => x.path), ['Brand/Loghi'])
is('una cartella esplicita e vuota si trova', searchMaterials(files, 'archivio', [{ space: 'team', path: 'Archivio 2024' }]).folders.map(x => x.count), [0])
is('una ricerca vuota non trova tutto', searchMaterials(files, '   '), { folders: [], files: [] })

console.log('\n— Percorsi —')
is('le tappe del breadcrumb', crumbsOf('Brand/Loghi'), [{ name: 'Brand', path: 'Brand' }, { name: 'Loghi', path: 'Brand/Loghi' }])
is('la radice non ha tappe', crumbsOf(''), [])
is('il padre', parentPath('Brand/Loghi'), 'Brand')
is('il padre della radice è la radice', parentPath('Brand'), '')
is('l\'ultimo pezzo', lastSegment('Brand/Loghi'), 'Loghi')
is('unire due percorsi', joinPath('Brand', 'Loghi/2025'), 'Brand/Loghi/2025')
is('unire alla radice', joinPath('', 'Loghi'), 'Loghi')
is('nessun percorso', joinPath('', ''), null)
assert.throws(() => joinPath('Brand', '../fuori'), 'una risalita non passa nemmeno unendo')
is('dentro la cartella', isInside('Brand/Loghi', 'Brand'), true)
is('è la cartella stessa', isInside('Brand', 'Brand'), true)
is('un prefisso a metà nome non è dentro', isInside('Brandizzati', 'Brand'), false)
is('tutto è dentro la radice', isInside(null, ''), true)

console.log('\n— L\'etichetta del tipo —')
is('un file di progetto', extensionBadge('logo.afdesign'), null)
is('un psd', extensionBadge('copertina.psd'), 'PSD')
is('uno zip', extensionBadge('consegna.ZIP'), 'ZIP')
is('senza estensione', extensionBadge('LEGGIMI'), null)
is('un\'estensione che non è un\'estensione', extensionBadge('verbale.del 3 maggio'), null)
is('foldText toglie gli accenti', foldText('Città È'), 'citta e')

console.log('\n— I file che nessuno ha scelto —')
is('il .DS_Store del Mac', isJunkFile('.DS_Store', 'Brand'), true)
is('la copia AppleDouble', isJunkFile('._logo.png', 'Brand'), true)
is('Thumbs.db di Windows', isJunkFile('Thumbs.db', null), true)
is('tutto ciò che sta sotto __MACOSX', isJunkFile('logo.png', 'consegna/__MACOSX/Brand'), true)
is('un file vero resta', isJunkFile('logo.png', 'Brand'), false)
is('anche se comincia con un punto qualunque', isJunkFile('.gitignore', null), false)

if (failures) { console.log(`\n${failures} controlli falliti.`); process.exit(1) }
console.log('\nTutti i controlli passano.')
