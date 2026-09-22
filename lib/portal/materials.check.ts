/* §397 — Esegui: npx tsx lib/portal/materials.check.ts
   I limiti dello spazio file del cliente. Un tipo ammesso per sbaglio o un
   Range interpretato male non si vedono leggendo il codice: si vedono quando
   un player va in loop o quando entra un file che esegue qualcosa. */
import assert from 'node:assert/strict'
import {
  MATERIAL_MAX_BYTES, MATERIAL_QUOTA_BYTES, extensionOf, humanBytes, materialDownloadHref,
  materialKind, parseRange, quotaLeft, quotaWarning, rejectMaterial,
} from './materials'

const ok = { name: 'girato.mp4', mime: 'video/mp4', size: 40 * 1024 * 1024 }

assert.equal(materialKind('image/png'), 'immagine')
assert.equal(materialKind('VIDEO/MP4; codecs=avc1'), 'video')
assert.equal(materialKind('audio/mpeg'), 'audio')
assert.equal(materialKind('application/pdf'), 'documento')
assert.equal(materialKind('image/svg+xml'), null, 'un SVG è un documento che esegue')
assert.equal(materialKind('text/html'), null)
assert.equal(materialKind('application/x-msdownload'), null)
assert.equal(materialKind(null), null)

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

console.log('Tutti i controlli passano: tipi ammessi, estensioni bloccate, limite per file, quota d’azienda, formati leggibili e Range.')
