import assert from 'node:assert/strict'
import { canDeleteFile, canManageFolder, canReadFile, canReadFolder, canShareFile, canWriteStorage, fileResponseHeaders, isStorageStaff, parseStorageContext, sameStorageContext, validStorageObject } from './access'
import type { StorageActor } from './access'

const own = 'f2460000-0000-4000-8000-000000000001'
const other = 'f2460000-0000-4000-8000-000000000002'
const client = 'f2461000-0000-4000-8000-000000000001'
const manager: StorageActor = { userId: own, role: 'team', appRole: 'manager', active: true }
const file = { folder: 'clients' as const, uploaded_by: own, entity_type: 'client', entity_id: client, bucket: 'test', object_key: `clients/${client}/file.pdf` }
for (const appRole of ['client', 'guest']) {
  const outsider = { ...manager, role: appRole, appRole }
  assert.equal(isStorageStaff(outsider), false)
  assert.equal(canReadFile(outsider, file), false, 'neppure il proprietario legacy passa dal portale ai file interni')
  assert.equal(canDeleteFile(outsider, file), false)
  assert.equal(canShareFile(outsider, { ...file, folder: 'misc', entity_type: null }), false)
}
assert.equal(isStorageStaff({ ...manager, appRole: 'unknown' }), false)
assert.equal(isStorageStaff({ ...manager, role: 'guest', appRole: 'admin' }), false)
assert.equal(canReadFile({ ...manager, active: false }, file), false)
assert.equal(canWriteStorage({ ...manager, active: false }), false)
assert.equal(canReadFile(manager, file), true)
assert.equal(canReadFile(manager, { folder: 'payslips', uploaded_by: other }), false)
assert.equal(canReadFolder(manager, { folder: 'personal', created_by: other }), false)
assert.equal(canManageFolder(manager, { created_by: other }), false)
assert.equal(canReadFile({ ...manager, role: 'admin', appRole: 'founder' }, { folder: 'payslips', uploaded_by: other }), true)
const viewer = { ...manager, appRole: 'viewer' }
assert.equal(canReadFile(viewer, file), true)
assert.equal(canDeleteFile(viewer, file), false)
assert.equal(canWriteStorage(viewer), false)
for (const context of [file, { ...file, folder: 'misc' as const, entity_type: 'project' }, { ...file, folder: 'personal' as const, entity_type: null }]) {
  assert.equal(canShareFile(manager, context), false)
  assert.equal(canShareFile({ ...manager, role: 'admin', appRole: 'admin' }, context), false)
}
assert.equal(canShareFile(manager, { ...file, folder: 'misc', entity_type: null }), true)
// Un link anonimo a una consegna sopravviverebbe alla revoca dell'accesso.
assert.equal(canShareFile({ ...manager, role: 'admin', appRole: 'admin' }, { ...file, folder: 'deliverables', entity_type: 'project' }), false)
assert.equal(canShareFile({ ...manager, active: false }, { ...file, folder: 'misc', entity_type: null }), false)
assert.deepEqual(parseStorageContext('clients', 'client', client), { folder: 'clients', entity_type: 'client', entity_id: client })
assert.equal(parseStorageContext('clients', null, null), null)
assert.equal(parseStorageContext('feedback', 'client', client), null)
assert.deepEqual(parseStorageContext('deliverables', 'project', 'f2462000-0000-4000-8000-000000000001'), { folder: 'deliverables', entity_type: 'project', entity_id: 'f2462000-0000-4000-8000-000000000001' })
assert.equal(parseStorageContext('deliverables', 'client', client), null)
assert.equal(parseStorageContext('deliverables', null, null), null)
assert.equal(parseStorageContext('misc', 'invented', client), null)
assert.equal(parseStorageContext('misc', 'client', '../other'), null)
assert.equal(parseStorageContext('misc', null, client), null)
assert.equal(parseStorageContext('misc', { toString: () => 'client' }, client), null)
assert.equal(sameStorageContext(file, { ...file, entity_id: other }), false)
assert.equal(sameStorageContext(file, { ...file, folder: 'personal' }), false)
assert.equal(validStorageObject(file, 'test'), true)
assert.equal(validStorageObject({ ...file, object_key: 'payslips/another-person.pdf' }, 'test'), false)
assert.equal(validStorageObject({ ...file, bucket: 'another-bucket' }, 'test'), false)
assert.equal(validStorageObject({ ...file, object_key: 'clients/../payslips/a.pdf' }, 'test'), false)
assert.match(fileResponseHeaders('documento.pdf', 'application/pdf').get('Content-Disposition')!, /^inline;/)
for (const mime of ['text/html', 'image/svg+xml', 'application/javascript']) {
  const headers = fileResponseHeaders('allegato', mime)
  assert.match(headers.get('Content-Disposition')!, /^attachment;/)
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff')
  assert.match(headers.get('Content-Security-Policy')!, /sandbox/)
  assert.equal(headers.get('Cache-Control'), 'private, no-store')
}
console.log('Tutti i controlli passano: staff attivo, clienti esclusi, privacy cartelle, contesti, consegne legate a un progetto, condivisioni e contenuti attivi.')
