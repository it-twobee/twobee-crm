import assert from 'node:assert/strict'
import Module from 'node:module'
import type { PortalAccessInput } from '../lib/portal/access'

const actor = 'f2450000-0000-4000-8000-000000000001'
const person = 'f2450000-0000-4000-8000-000000000002'
const staff = 'f2450000-0000-4000-8000-000000000003'
const created = 'f2450000-0000-4000-8000-000000000004'
const client = 'f2451000-0000-4000-8000-000000000001'
const other = 'f2451000-0000-4000-8000-000000000002'
const hidden = 'f2451000-0000-4000-8000-000000000003'
const project = 'f2452000-0000-4000-8000-000000000001'
let role = 'manager', signedIn = true, active = true, missingSchema = false, schemaFailure = false, rpcFailure = false, authFailure = false, revokeDuringAuth = false
let clients = [{ id: client, client_label: 'stabile', workspace_hidden: false }, { id: other, client_label: 'stabile', workspace_hidden: false }, { id: hidden, client_label: 'stabile', workspace_hidden: true }]
const profiles: any[] = [
  { id: person, full_name: 'Persona A', email: 'persona@example.test', role: 'client', app_role: 'client', is_active: true },
  { id: staff, full_name: 'Staff', email: 'staff@example.test', role: 'team', app_role: 'manager', is_active: true },
]
const users: any[] = profiles.map(p => ({ id: p.id, email: p.email, email_confirmed_at: '2026-01-01' }))
let members: any[] = [], scopes: any[] = []
const events: any[] = [], links: any[] = [], calls: string[] = []
let serviceClients = 0

class Query {
  filters: ((row: any) => boolean)[] = []
  one = false
  operation = 'read'
  value: any
  constructor(public table: string, public session: boolean) {}
  select(_columns: string) { return this }
  eq(key: string, value: unknown) { this.filters.push(row => row[key] === value); return this }
  is(key: string, value: unknown) { this.filters.push(row => (row[key] ?? null) === value); return this }
  in(key: string, values: unknown[]) { this.filters.push(row => values.includes(row[key])); return this }
  ilike(key: string, value: string) { this.filters.push(row => row[key]?.toLowerCase() === value.replace(/\\([\\%_])/g, '$1').toLowerCase()); return this }
  order(_key: string) { return this }
  maybeSingle() { this.one = true; return this }
  insert(value: any) { this.operation = 'insert'; this.value = value; return this }
  async then(resolve: (result: any) => unknown, reject?: (e: unknown) => unknown) {
    try {
      calls.push(`${this.session ? 'session' : 'service'}:${this.table}:${this.operation}`)
      if (this.operation === 'insert') {
        assert.equal(this.table, 'portal_events'); assert.equal(this.value.actor_id, actor)
        events.push(this.value); return resolve({ data: null, error: null })
      }
      let rows: any[]
      if (this.table === 'clients' || this.table === 'clients_workspace') rows = clients.filter(c => this.table !== 'clients_workspace' || !c.workspace_hidden)
      else if (this.table === 'profiles') rows = profiles
      else if (this.table === 'projects') rows = [{ id: project, client_id: client, name: 'Progetto A', deleted_at: null }]
      else if (this.table === 'portal_memberships') rows = members
      else if (this.table === 'portal_project_access') rows = scopes
      else throw new Error(`Unexpected table ${this.table}`)
      const result = rows.filter(row => this.filters.every(filter => filter(row))).map(row => ({ ...row }))
      return resolve({ data: this.one ? result[0] ?? null : result, error: null })
    } catch (e) { if (reject) return reject(e); throw e }
  }
}

const db = {
  from: (table: string) => new Query(table, false),
  rpc: async (name: string, p: any) => {
    calls.push(`rpc:${name}`)
    if (missingSchema) return { error: { code: 'PGRST202' }, data: null }
    if (schemaFailure) return { error: { code: '42501' }, data: null }
    if (name === 'portal_access_manager') return { data: actor, error: null }
    if (rpcFailure) return { data: null, error: { code: '40001' } }
    if (name === 'portal_save_access') {
      const found = members.find(m => m.client_id === p.p_client && m.profile_id === p.p_profile)
      if (found && (p.p_revision === null || p.p_revision !== found.revision)) return { data: null, error: { code: '40001' } }
      if (!found) members.push({ id: `membership-${p.p_profile}`, client_id: p.p_client, profile_id: p.p_profile, portal_role: p.p_role, project_scope: p.p_scope, revision: 1, revoked_at: null })
      else Object.assign(found, { portal_role: p.p_role, project_scope: p.p_scope, revision: found.revision + 1, revoked_at: null })
      const member = members.find(m => m.client_id === p.p_client && m.profile_id === p.p_profile)
      scopes = scopes.filter(s => s.membership_id !== member.id).concat(p.p_projects.map((id: string) => ({ client_id: p.p_client, membership_id: member.id, project_id: id })))
      return { data: member.id, error: null }
    }
    if (name === 'portal_revoke_access') {
      const member = members.find(m => m.client_id === p.p_client && m.profile_id === p.p_profile)
      if (!member || member.revision !== p.p_revision) return { data: null, error: { code: '40001' } }
      member.revoked_at = '2026-09-21'; member.revision++
      return { data: null, error: null }
    }
    throw new Error(`Unexpected RPC ${name}`)
  },
  auth: { admin: {
    getUserById: async (id: string) => ({ data: { user: users.find(u => u.id === id) ?? null }, error: null }),
    generateLink: async (input: any) => {
      assert.ok(!input.options?.data?.role && !input.options?.data?.app_role)
      links.push(input)
      if (authFailure) return { data: {}, error: { message: 'DO NOT LEAK PROVIDER SECRET' } }
      let user = users.find(u => u.email === input.email)
      if (!user) {
        assert.equal(input.type, 'invite')
        user = { id: created, email: input.email }; users.push(user)
        profiles.push({ ...user, role: 'guest', app_role: 'guest', full_name: input.options.data.full_name, is_active: true })
      }
      if (revokeDuringAuth) members.find(m => m.profile_id === user.id).revoked_at = '2026-09-21'
      return { data: { user, properties: { hashed_token: 'test-private-token' } }, error: null }
    },
  } },
}
const internal = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown }
const original = internal._load
internal._load = function (name, ...args) {
  if (name === '@/lib/auth') return { getViewer: async () => ({ user: signedIn ? { id: actor } : null, profile: { id: actor, app_role: role, is_active: active } }) }
  if (name === '@/lib/supabase/server') return { createClient: async () => ({ from: (table: string) => new Query(table, true) }) }
  if (name === '@/lib/supabase/admin') return { createActorClient: (id: string) => { assert.equal(id, actor); serviceClients++; return db } }
  if (name === 'next/cache') return { revalidatePath: () => {} }
  return original.call(this, name, ...args)
}

async function main() {
  process.env.NEXT_PUBLIC_APP_URL = 'https://os.example.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only'
  const actions = require('../app/actions/portal-access') as typeof import('../app/actions/portal-access')
  const input: PortalAccessInput = { email: 'persona@example.test', name: 'Persona A', role: 'referente', scope: 'all', projectIds: [] }
  for (const denied of ['client', 'guest', 'junior', 'senior', 'freelance', 'viewer']) {
    role = denied; assert.ok((await actions.inviteClientPortal(client, input)).error)
  }
  role = 'manager'; active = false; assert.ok((await actions.getClientPortalAccess(client)).error)
  active = true; signedIn = false; assert.ok((await actions.resetClientPortalPassword(client, person)).error)
  signedIn = true
  assert.equal(serviceClients, 0); assert.equal(links.length, 0)
  assert.ok((await actions.inviteClientPortal(hidden, input)).error)
  assert.equal(serviceClients, 0)
  missingSchema = true
  assert.match((await actions.inviteClientPortal(client, input)).error!, /244 e 245/)
  assert.equal(links.length, 0)
  missingSchema = false; schemaFailure = true
  assert.ok((await actions.inviteClientPortal(client, input)).error)
  schemaFailure = false
  assert.ok((await actions.inviteClientPortal(client, { ...input, scope: 'selected', projectIds: [other] })).error)
  clients[0].client_label = 'lead'
  assert.ok((await actions.inviteClientPortal(client, input)).error)
  clients[0].client_label = 'stabile'
  assert.ok((await actions.inviteClientPortal(client, { ...input, email: 'staff@example.test' })).error)
  assert.equal(links.length, 0); assert.equal(members.length, 0)

  const existing = await actions.inviteClientPortal(client, input)
  assert.equal(existing.data?.kind, 'login'); assert.equal(members.length, 1); assert.equal(links.length, 0)
  assert.ok((await actions.inviteClientPortal(client, input)).error)
  assert.equal(members.length, 1)
  assert.ok((await actions.resetClientPortalPassword(other, person)).error)
  assert.equal(links.length, 0)
  const reset = await actions.resetClientPortalPassword(client, person)
  assert.equal(reset.data?.kind, 'recovery'); assert.equal(links[0].email, input.email)
  assert.equal(new URL(reset.data!.url).searchParams.has('token_hash'), false)
  assert.equal(events.at(-1).action, 'password_reset_link')
  authFailure = true
  assert.doesNotMatch((await actions.resetClientPortalPassword(client, person)).error!, /SECRET/)
  authFailure = false
  revokeDuringAuth = true
  assert.ok((await actions.resetClientPortalPassword(client, person)).error)
  revokeDuringAuth = false; members[0].revoked_at = null
  assert.ok(!(await actions.revokeClientPortalAccess(client, person, 1)).error)
  const before = links.length
  assert.ok((await actions.resetClientPortalPassword(client, person)).error)
  assert.equal(links.length, before)
  assert.ok((await actions.updateClientPortalAccess(client, person, 1, input)).error)
  assert.ok(!(await actions.updateClientPortalAccess(client, person, 2, { ...input, scope: 'selected', projectIds: [project], role: 'lettore' })).error)
  assert.equal(members[0].revoked_at, null); assert.equal(scopes.length, 1)

  const invitation = await actions.inviteClientPortal(client, { ...input, email: 'new@example.test', name: 'Nuovo referente' })
  assert.equal(invitation.data?.kind, 'invite')
  assert.equal(profiles.find(p => p.id === created).app_role, 'guest')
  assert.equal(members.length, 2)
  assert.equal((await actions.resetClientPortalPassword(client, created)).data?.kind, 'invite')
  const list = await actions.getClientPortalAccess(client)
  assert.equal(list.data?.members.length, 2)
  assert.equal(list.data?.members.find(m => m.profileId === created)?.activated, false)
  assert.equal(JSON.stringify(list).includes('test-private-token'), false)
  assert.equal(JSON.stringify(events).includes('test-private-token'), false)
  profiles.find(p => p.id === person).app_role = 'manager'
  assert.ok((await actions.resetClientPortalPassword(client, person)).error)
  profiles.find(p => p.id === person).app_role = 'client'
  profiles.find(p => p.id === person).is_active = false
  assert.ok((await actions.resetClientPortalPassword(client, person)).error)
  console.log('Tutti i controlli passano: guard reali, schema mancante, client nascosti, scope, account esistenti, inviti, reset, revoca, retry e segreti esclusi dai payload di elenco/audit.')
}
main().finally(() => { internal._load = original }).catch(error => { console.error(error); process.exitCode = 1 })
