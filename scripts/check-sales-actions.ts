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

  /* §371 — le azioni della pipeline vecchia sono state rimosse insieme alla
     UI che le chiamava: restano il permesso commerciale, il salvataggio di una
     cella e il collegamento del lead all'anagrafica. Questo file copre quello
     che è rimasto — buttarlo avrebbe tolto in silenzio la copertura sui
     controlli di accesso, che è la parte che conta. */

  // ── il permesso commerciale ──────────────────────────────────────────────
  access = 'owner'
  await assert.rejects(() => actions.setSalesPermission(other, true), /Solo gli admin/)
  assert.equal(permissionWrites, 0)
  access = 'admin'; targetRole = 'client'
  await assert.rejects(() => actions.setSalesPermission(other, true), /persona attiva/)
  assert.equal(permissionWrites, 0)
  targetRole = 'senior'
  await actions.setSalesPermission(other, true)
  assert.equal(permissionWrites, 1)

  // ── salvare una cella: il campo non arriva libero ────────────────────────
  access = null
  await assert.rejects(() => actions.salvaCellaDeal(other, 'company_name', 'X'), /non abilitato/)
  access = 'admin'
  /* La barriera vera: un file `'use server'` esporta un endpoint, e chi ha il
     codice davanti conosce i nomi delle colonne (§329). */
  await assert.rejects(() => actions.salvaCellaDeal(other, 'client_id', other), /Colonna sconosciuta/)
  await assert.rejects(() => actions.salvaCellaDeal(other, 'sheet_row_id', 'x'), /Colonna sconosciuta/)
  await assert.rejects(() => actions.salvaCellaDeal(other, 'sheet_status', 'Chiuso'), /non si modifica/)
  await assert.rejects(() => actions.salvaCellaDeal(other, 'stage', 'vinta'), /non è una fase/)
  await assert.rejects(() => actions.salvaCellaDeal(other, 'company_name', '  '), /non può restare vuoto/)

  // ── la conversione non è aperta a chiunque ───────────────────────────────
  access = null
  await assert.rejects(() => actions.collegaLeadACliente(other, actor), /non abilitato/)

  console.log('Tutti i controlli passano: grant commerciali, whitelist delle celle e accesso alla conversione.')
}
main().finally(() => { internals._load = original }).catch(error => { console.error(error); process.exitCode = 1 })
