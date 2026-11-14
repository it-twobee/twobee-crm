import assert from 'node:assert/strict'
import { isChunkLoadError, recoverChunkOnce } from '@/lib/chunk-recovery'

for (const error of [
  Object.assign(new Error('missing'), { name: 'ChunkLoadError' }),
  new Error('Loading chunk 840 failed. (error: https://os.twobee.it/_next/static/chunks/app/(dashboard)/lab/fatturazione/page.js)'),
  new Error('Loading CSS chunk 11 failed.'),
  new Error('Failed to fetch dynamically imported module: https://example.test/module.js'),
  'Importing a module script failed.',
]) assert.equal(isChunkLoadError(error), true)
for (const error of [new Error('Permesso negato'), new Error('fetch failed'), null, undefined, 840, { message: 840 }]) {
  assert.equal(isChunkLoadError(error), false)
}
const memory = new Map<string, string>()
const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
let reloads = 0
const options = { version: 'build-a', online: true, storage, reload: () => { reloads++ } }
const error = new Error('Loading chunk 840 failed.')
assert.equal(recoverChunkOnce(error, options), true)
assert.equal(reloads, 1)
assert.equal(recoverChunkOnce(error, options), false, 'Errore duplicato/effect React non crea loop')
assert.equal(recoverChunkOnce(new Error('Loading chunk 900 failed.'), options), false, 'Un altro asset mancante non aggira il limite')
assert.equal(recoverChunkOnce(error, { ...options, version: 'build-b', online: false }), false)
assert.equal(recoverChunkOnce(error, { ...options, version: 'build-b' }), true, 'Nuova versione ha un tentativo distinto')
assert.equal(reloads, 2)
assert.equal(recoverChunkOnce(new Error('Permesso negato'), { ...options, version: 'build-c' }), false)
assert.equal(recoverChunkOnce(error, { ...options, version: 'build-c', storage: { getItem() { throw new Error('Bloccato') }, setItem() {} } }), false)
assert.equal(recoverChunkOnce(error, { ...options, version: 'build-c', storage: { getItem() { return null }, setItem() { throw new Error('Quota') } } }), false)
assert.equal(reloads, 2, 'Storage negato non provoca ricariche ripetute')
console.log('Tutti i controlli passano')
