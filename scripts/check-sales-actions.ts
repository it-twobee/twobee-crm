import assert from 'node:assert/strict'
import Module from 'node:module'
import type { SalesAccess } from '../lib/sales'

// Esegue le action vere con confini Supabase sostituiti: nessuna scrittura esterna.
const actor = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
let access: SalesAccess = 'owner'
let rpcCalls = 0
let owner: string | null = actor
let targetRole = 'senior'
let permissionWrites = 0
let args: Record<string, unknown> = {}
const invalidated: string[] = []
const db = {
  from: () => ({
    select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: owner ? { assigned_to: owner } : null, error: null }),
      single: async () => ({ data: { app_role: targetRole, is_active: true }, error: null }),
    }) }),
    upsert: async () => { permissionWrites++; return { error: null } },
  }),
  rpc: async (_name: string, input: Record<string, unknown>) => { rpcCalls++; args = input; return { data: other, error: null } },
}
const internals = Module as unknown as { _load: (name: string, ...rest: unknown[]) => unknown }
const original = internals._load
internals._load = function (name, ...rest) {
  if (name === 'next/cache') return { revalidatePath: (path: string) => { invalidated.push(path) } }
  if (name === '@/lib/sales-guard') return { requireSalesAccess: async () => {
    if (!access) throw new Error('Accesso commerciale non abilitato')
    return { actor, access, sb: db }
  } }
  if (name === '@/lib/supabase/admin') return { createActorClient: (id: string) => { assert.equal(id, actor); return db } }
  return original.call(this, name, ...rest)
}

async function main() {
  const actions = require('../app/actions/sales') as typeof import('../app/actions/sales')
  const input = { outcome: 'ricontattare' as const, content: 'Richiamare', date: '2026-09-16', next_action: 'Telefonare', proposal_ref: '' }
  access = null
  await assert.rejects(() => actions.recordSalesOutcome(other, actor, 0, input), /non abilitato/)
  assert.equal(rpcCalls, 0)
  access = 'owner'; owner = other
  await assert.rejects(() => actions.recordSalesOutcome(other, actor, 0, input), /non accessibile/)
  assert.equal(rpcCalls, 0)
  owner = actor
  await assert.rejects(() => actions.recordSalesOutcome(other, actor, 0, { ...input, outcome: '__proto__' as never }), /non valido/)
  await assert.rejects(() => actions.recordSalesOutcome(other, actor, 0, { ...input, date: '2026-02-30' }), /Data/)
  await assert.rejects(() => actions.recordSalesOutcome(other, actor, NaN, input), /Versione/)
  await assert.rejects(() => actions.addSalesContact(other, actor, 0, { full_name: 'Nome', email: '', phone: '', role: '' }), /recapito/)
  assert.equal(rpcCalls, 0)
  await actions.recordSalesOutcome(other, actor, 2, input)
  assert.equal(rpcCalls, 1)
  assert.equal(args.p_actor, actor)
  assert.equal(args.p_request, other)
  assert.equal((args.p_input as { revision: number }).revision, 2)
  assert.equal(invalidated.includes('/clienti'), false)
  await assert.rejects(() => actions.recordSalesOutcome(other, actor, 2, { ...input, outcome: 'vinta', client_id: 'non-uuid' }), /Identificativo/)
  await actions.recordSalesOutcome(other, actor, 2, { ...input, outcome: 'vinta', client_id: other, proposal_ref: 'Accettata v1' })
  assert.equal((args.p_input as { client_id: string }).client_id, other)
  for (const path of ['/clienti', '/workspace/clienti', '/clienti/[id]', '/workspace/clienti/[id]']) assert.ok(invalidated.includes(path))
  await assert.rejects(() => actions.saveSalesDelivery(other, actor, 2, {
    delivery: {}, delivery_owner_id: actor, project_id: null, service_id: null,
    contact_id: null, proposal_ref: '', complete: true,
  }), /responsabile commerciale/)
  await assert.rejects(() => actions.setSalesPermission(other, true), /Solo gli admin/)
  assert.equal(permissionWrites, 0)
  access = 'admin'; targetRole = 'client'
  await assert.rejects(() => actions.setSalesPermission(other, true), /persona attiva/)
  assert.equal(permissionWrites, 0)
  targetRole = 'senior'
  await actions.setSalesPermission(other, true)
  assert.equal(permissionWrites, 1)
  console.log('Tutti i controlli passano: chiamate dirette, isolamento owner, validazione, attore verificato e grant commerciali.')
}
main().finally(() => { internals._load = original }).catch(error => { console.error(error); process.exitCode = 1 })
