/* §397 — Esegui: npx tsx lib/portal/materials.check.ts
   I limiti dello spazio file del cliente. Un tipo ammesso per sbaglio o un
   Range interpretato male non si vedono leggendo il codice: si vedono quando
   un player va in loop o quando entra un file che esegue qualcosa. */
import assert from 'node:assert/strict'
import {
  MATERIAL_MAX_BYTES, MATERIAL_QUOTA_BYTES, PATH_DEPTH, buildMaterialTree, countTree,
  extensionOf, folderPathOf, humanBytes, materialDownloadHref, materialKind, normalizePath,
  parseRange, quotaLeft, quotaWarning, rejectMaterial, renderableKind,
  PDF_PREVIEW_MAX_BYTES, hasThumbnail, isZipName, mimeFromName, previewKind,
} from './materials'
import { csvSeparator, parseCsv } from './csv'

const ok = { name: 'girato.mp4', mime: 'video/mp4', size: 40 * 1024 * 1024 }

assert.equal(materialKind('image/png'), 'immagine')
assert.equal(materialKind('VIDEO/MP4; codecs=avc1'), 'video')
assert.equal(materialKind('audio/mpeg'), 'audio')
assert.equal(materialKind('application/pdf'), 'documento')
assert.equal(materialKind('image/svg+xml'), null, 'un SVG è un documento che esegue')
assert.equal(materialKind('text/html'), null)
assert.equal(materialKind('application/x-msdownload'), null)
assert.equal(materialKind(null), null)
// §399 — i file sorgente si riconoscono dall'estensione: il tipo dichiarato mente.
for (const name of ['brand.afdesign', 'brand.afphoto', 'brand.afpub', 'logo.ai', 'impaginato.indd', 'schermo.sketch', 'schermo.fig'])
  assert.equal(materialKind('application/octet-stream', name), 'documento', name)
assert.equal(materialKind('', 'brand.afphoto'), 'documento', 'anche senza tipo dichiarato')
assert.equal(materialKind('image/vnd.adobe.photoshop', 'logo.psd'), 'documento', 'un psd non è un’immagine che il browser disegna')
assert.equal(materialKind('image/png', 'logo.png'), 'immagine')

// Quello che il browser disegna davvero: elenco chiuso, niente promesse.
assert.equal(renderableKind('image/png', 'logo.png'), 'image')
assert.equal(renderableKind('IMAGE/JPEG', 'foto.jpg'), 'image')
assert.equal(renderableKind('video/mp4; codecs=avc1', 'spot.mp4'), 'video')
assert.equal(renderableKind('audio/mpeg', 'voce.mp3'), 'audio')
assert.equal(renderableKind('image/vnd.adobe.photoshop', 'logo.psd'), null, 'niente anteprima rotta')
assert.equal(renderableKind('image/tiff', 'scansione.tif'), null)
assert.equal(renderableKind('application/pdf', 'contratto.pdf'), null, 'il PDF resta da scaricare: la risposta è sandboxata')
assert.equal(renderableKind('application/octet-stream', 'brand.afdesign'), null)
assert.equal(renderableKind(null, 'misterioso'), null)

assert.equal(extensionOf('cartella/girato.finale.MP4'), 'mp4')
assert.equal(extensionOf('senza-estensione'), '')
assert.equal(extensionOf('.nascosto'), '')

assert.equal(rejectMaterial(ok), null)
assert.match(rejectMaterial({ ...ok, size: MATERIAL_MAX_BYTES + 1 })!, /supera/)
assert.match(rejectMaterial({ ...ok, size: 0 })!, /vuoto/)
assert.match(rejectMaterial({ ...ok, mime: 'application/x-sh' })!, /Ammettiamo/)
assert.match(rejectMaterial({ ...ok, name: '   ' })!, /nome/)
assert.match(rejectMaterial({ ...ok, name: `${'x'.repeat(241)}.mp4` })!, /nome/)
// Il tipo dichiarato non basta: conta anche come si chiama.
for (const name of ['pagina.html', 'logo.svg', 'installa.exe', 'script.js', 'archivio.jar'])
  assert.match(rejectMaterial({ ...ok, name })!, /non è ammesso/, name)
// E l'elenco dei bloccati batte quello dei file di progetto.
assert.equal(rejectMaterial({ name: 'brand.afdesign', mime: 'application/octet-stream', size: 1000 }), null)
assert.match(rejectMaterial({ name: 'brand.html', mime: 'application/octet-stream', size: 1000 })!, /non è ammesso/)

assert.equal(quotaLeft(0), MATERIAL_QUOTA_BYTES)
assert.equal(quotaLeft(MATERIAL_QUOTA_BYTES * 2), 0, 'la quota non va sotto zero')
assert.equal(quotaWarning(0), null)
assert.match(quotaWarning(MATERIAL_QUOTA_BYTES * 0.95)!, /Resta poco spazio/)
assert.match(quotaWarning(MATERIAL_QUOTA_BYTES)!, /pieno/)

assert.equal(humanBytes(512), '512 B')
assert.equal(humanBytes(1536), '1.5 KB')
assert.equal(humanBytes(MATERIAL_MAX_BYTES), '1 GB')
assert.equal(humanBytes(-1), 'n/d')

// Range: quello che serve a far scorrere un video, e nient'altro.
assert.equal(parseRange(null, 1000), null)
assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 })
assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 })
assert.deepEqual(parseRange('bytes=-200', 1000), { start: 800, end: 999 })
assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, end: 999 }, 'la coda si accorcia, non si rifiuta')
for (const bad of ['bytes=1000-', 'bytes=500-100', 'bytes=-0', 'bytes=', 'righe=0-1', 'bytes=a-b', 'bytes=0-99, 200-299'])
  assert.equal(parseRange(bad, 1000), 'invalid', bad)
assert.equal(parseRange('bytes=0-99', 0), 'invalid', 'un oggetto senza lunghezza non ha intervalli')

assert.equal(materialDownloadHref('f2500000-0000-4000-8000-000000000001'), '/api/portale/materiali/f2500000-0000-4000-8000-000000000001')

// ── Cartelle: il percorso arriva da fuori, quindi si guarda ────────────────
assert.equal(normalizePath('brand/logo'), 'brand/logo')
assert.equal(normalizePath('/brand/logo/'), 'brand/logo', 'le barre appese si tolgono')
assert.equal(normalizePath('brand//logo'), 'brand/logo')
assert.equal(normalizePath('brand\\logo'), 'brand/logo', 'anche il separatore di Windows')
assert.equal(normalizePath('  brand / logo  '), 'brand/logo')
assert.equal(normalizePath(null), null)
assert.equal(normalizePath(''), null)
assert.equal(normalizePath('   /  '), null)
for (const bad of ['..', 'brand/../fuori', './qui', 'brand/./qui', 'a/'.repeat(PATH_DEPTH + 1), `${'x'.repeat(121)}/logo`, 'brand/lo\u0000go', 42])
  assert.throws(() => normalizePath(bad as never), `percorso accettato: ${String(bad)}`)

assert.equal(folderPathOf('brand/logo/logo.svg'), 'brand/logo')
assert.equal(folderPathOf('logo.svg'), null, 'un file alla radice non ha cartella')
assert.equal(folderPathOf(null), null)
assert.throws(() => folderPathOf('../fuori/logo.svg'))

const tree = buildMaterialTree([
  { path: 'brand/logo', id: 1 }, { path: 'brand/logo', id: 2 },
  { path: 'brand/tipografia', id: 3 }, { path: null, id: 4 }, { path: 'progetto/2026/estate', id: 5 },
])
assert.equal(tree.files.length, 1, 'i file senza cartella stanno alla radice')
assert.deepEqual(tree.folders.map(f => f.name), ['brand', 'progetto'])
assert.deepEqual(tree.folders[0].folders.map(f => f.name), ['logo', 'tipografia'])
assert.equal(tree.folders[0].folders[0].files.length, 2)
assert.equal(tree.folders[0].files.length, 0, 'una cartella intermedia nasce vuota')
assert.equal(tree.folders[1].folders[0].folders[0].path, 'progetto/2026/estate')
assert.equal(countTree(tree), 5)
assert.equal(countTree(buildMaterialTree([])), 0)

// §415 — Cosa si apre nell'anteprima. Il PDF lo disegna pdf.js dai byte, e la
// risposta resta in sandbox: renderableKind continua a dire di no, perché il
// browser da solo non lo deve aprire.
assert.equal(previewKind('application/pdf', 'contratto.pdf', 1000), 'pdf')
assert.equal(previewKind(null, 'contratto.PDF'), 'pdf', 'anche quando il tipo non arriva')
assert.equal(previewKind('application/pdf', 'enorme.pdf', PDF_PREVIEW_MAX_BYTES + 1), null, 'un PDF enorme si scarica')
assert.equal(previewKind('text/plain', 'note.txt'), 'text')
assert.equal(previewKind('text/csv', 'clienti.csv'), 'csv')
assert.equal(previewKind('application/vnd.ms-excel', 'export.csv'), 'csv', 'Windows dichiara i CSV come Excel')
assert.equal(previewKind('image/png', 'logo.png'), 'image')
assert.equal(previewKind('application/postscript', 'logo.ai'), null, 'un file di progetto non si apre, nemmeno se è un PDF dentro')
assert.equal(previewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'lettera.docx'), null, 'Office no: lo si dichiara')
assert.equal(hasThumbnail('application/pdf', 'contratto.pdf'), true, 'la prima pagina di un PDF')
assert.equal(hasThumbnail('image/png', 'logo.png'), true)
assert.equal(hasThumbnail('video/mp4', 'spot.mp4'), false, 'niente fotogramma: sulla macchina manca ffmpeg')
assert.equal(csvSeparator('nome;cognome;città'), ';')
assert.equal(csvSeparator('nome,cognome'), ',')
assert.equal(csvSeparator('nome\tcognome'), '\t')
assert.equal(csvSeparator('una sola colonna'), ',')
assert.deepEqual(parseCsv('nome;note\n"Rossi; Mario";"ha detto ""sì"""\r\nBianchi;'), [['nome', 'note'], ['Rossi; Mario', 'ha detto "sì"'], ['Bianchi', '']])
assert.deepEqual(parseCsv('a,b\n1,2\n3,4', 2), [['a', 'b'], ['1', '2']], 'si ferma alle righe chieste')
assert.deepEqual(parseCsv('a,"due\nrighe"'), [['a', 'due\nrighe']], 'un a capo fra virgolette resta nella cella')

// §421 — Gli archivi si riconoscono dall'estensione: il browser li dichiara come capita.
assert.equal(rejectMaterial({ name: 'consegna.rar', mime: 'application/octet-stream', size: 10 }), null, 'un rar del cliente entra')
assert.equal(rejectMaterial({ name: 'sorgenti.7z', mime: '', size: 10 }), null)
assert.equal(rejectMaterial({ name: 'dentro.zip', mime: 'application/x-zip', size: 10 }), null, 'uno zip dentro uno zip resta un file')
assert.equal(materialKind('application/octet-stream', 'consegna.rar'), 'documento')
assert.notEqual(rejectMaterial({ name: 'virus.exe', mime: 'application/zip', size: 10 }), null, 'l’estensione bloccata vince ancora')
assert.equal(mimeFromName('Logo.PNG'), 'image/png', 'il tipo di un file che esce da uno zip')
assert.equal(mimeFromName('spot.mov'), 'video/quicktime')
assert.equal(mimeFromName('brand.afdesign'), null, 'i file di progetto li riconosce l’estensione, non un tipo')
assert.equal(rejectMaterial({ name: 'brand.afdesign', mime: mimeFromName('brand.afdesign'), size: 10 }), null)
assert.equal(isZipName('Consegna.ZIP'), true)
assert.equal(isZipName('consegna.zip.pdf'), false)

console.log('Tutti i controlli passano: tipi ammessi, estensioni bloccate, limite per file, quota d’azienda, formati leggibili, Range, file di progetto, anteprime senza promesse, PDF e testo nell’anteprima, CSV con le virgolette, archivi dall’estensione e cartelle dal percorso.')
