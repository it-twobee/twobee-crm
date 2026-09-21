import assert from 'node:assert/strict'
import { canManageClientPortal } from '../permissions'
import { isUuid, parsePortalAccess, passwordLink, portalAccessPath, portalLoginDestination } from './access'
import type { PortalAccessInput } from './access'

const client = 'f2451000-0000-4000-8000-000000000001'
const project = 'f2452000-0000-4000-8000-000000000001'
const input: PortalAccessInput = { email: ' Referente@Example.test ', name: ' Referente ', role: 'lettore', scope: 'all', projectIds: [] }
assert.equal(isUuid(client), true)
assert.equal(isUuid('../../admin'), false)
for (const role of ['admin', 'founder', 'super_admin', 'manager']) assert.equal(canManageClientPortal({ app_role: role }), true)
for (const role of ['senior', 'junior', 'stage', 'client', 'guest', 'freelance', 'partner', 'viewer']) assert.equal(canManageClientPortal({ app_role: role }), false)
assert.equal(canManageClientPortal({ app_role: 'manager', is_active: false }), false)
assert.equal(canManageClientPortal(null), false)
assert.equal(parsePortalAccess(input).email, 'referente@example.test')
assert.deepEqual(parsePortalAccess({ ...input, scope: 'selected', projectIds: [project, project] }).projectIds, [project])
for (const patch of [
  { role: 'admin' }, { role: '__proto__' }, { scope: 'anything' }, { email: 'no-email' },
  { name: '' }, { projectIds: ['not-a-uuid'] }, { scope: 'selected', projectIds: [] },
]) assert.throws(() => parsePortalAccess({ ...input, ...patch } as PortalAccessInput))
assert.equal(portalAccessPath(client, true), `/workspace/clienti/${client}?tab=10`)
assert.equal(portalLoginDestination(`?client=${client}&next=https://evil.invalid`), `/portale?client=${client}`)
assert.equal(portalLoginDestination('?client=//evil.invalid'), '/dashboard')
const link = new URL(passwordLink('https://os.example.test', client, 'secret&token', 'recovery'))
assert.equal(link.pathname, '/reset-password')
assert.equal(link.searchParams.get('client'), client)
assert.equal(link.search.includes('secret'), false)
assert.equal(new URLSearchParams(link.hash.slice(1)).get('token_hash'), 'secret&token')
console.log('Tutti i controlli passano: ruoli, ambito, input, ritorno azienda e link senza segreto nella query HTTP.')
