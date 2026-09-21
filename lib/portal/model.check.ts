import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isMissingPortalSchema, isPortalRole, legacyProject, portalHref, selectCompany } from './model'

const companies = [
  { id: 'azienda-a', name: 'A', role: 'referente' as const },
  { id: 'azienda-b', name: 'B', role: 'lettore' as const },
]
assert.equal(selectCompany(companies, 'azienda-estranea'), null, 'URL esterno non ripiega su azienda autorizzata')
assert.equal(selectCompany(companies.slice(0, 1), 'azienda-b'), null, 'conoscere un ID non concede l’accesso')
assert.equal(selectCompany([], 'azienda-a'), null, 'nessuna associazione, nessuna azienda')
assert.equal(selectCompany(companies, 'azienda-b')?.role, 'lettore', 'cambio azienda non eredita ruolo referente')
assert.equal(selectCompany(companies)?.id, 'azienda-a')

for (const role of ['client', 'guest']) assert.equal(isPortalRole({ role, app_role: role }), true)
for (const role of ['admin', 'team', null, undefined]) assert.equal(isPortalRole({ role, app_role: 'client' }), false)
for (const app_role of ['manager', 'viewer', 'freelance', 'super_admin']) assert.equal(isPortalRole({ role: 'guest', app_role }), false)
assert.equal(isPortalRole(null), false)

assert.equal(isMissingPortalSchema({ code: '42P01', message: 'relation public.portal_memberships does not exist' }), true)
assert.equal(isMissingPortalSchema({ code: 'PGRST205', message: "Could not find the table 'public.portal_memberships' in the schema cache" }), true)
for (const code of ['42501', 'PGRST301', 'PGRST204', '08006', '500']) {
  assert.equal(isMissingPortalSchema({ code, message: 'portal_memberships unavailable' }), false, `${code} non riattiva accessi legacy`)
}
assert.equal(isMissingPortalSchema(null), false, 'elenco vuoto valido non riattiva accessi legacy')
assert.equal(isMissingPortalSchema({ code: '42P01', message: 'relation profiles does not exist' }), false)

const unsafe = {
  id: 'p', client_id: 'azienda-a', name: 'Condiviso', area: 'digital', status: 'active',
  description: 'RISERVATO', notes: 'RISERVATO', margin: 72, risk_score: 99,
  monthly_cost: 12345, file_url: 'https://private.invalid', manager: { email: 'interno@example.invalid' },
  target_end_date: '2026-10-01', updated_at: '2026-09-19',
}
const payload = legacyProject(unsafe)
assert.deepEqual(Object.keys(payload).sort(), ['id','client_id','title','area','status','objective','scope','update','next_step','contact','published_at','target_date','date_kind','phase'].sort())
assert.equal(payload.update, null, 'stato operativo non inventa aggiornamento')
assert.equal(payload.published_at, null, 'updated_at non è una pubblicazione')
assert.equal(payload.target_date, null, 'data interna non promette una consegna')
assert.equal(JSON.stringify(payload).includes('RISERVATO'), false)
assert.equal(JSON.stringify(payload).includes('12345'), false)
assert.equal(portalHref('/portale/richieste', 'a&client=b', { nuova: '1' }), '/portale/richieste?nuova=1&client=a%26client%3Db')

const server = readFileSync(new URL('./server.ts', import.meta.url), 'utf8')
assert.equal(/createAdminClient|createActorClient|SUPABASE_SERVICE_ROLE_KEY/.test(server), false, 'letture cliente sempre con RLS')
assert.equal(/\.select\(['"]\*/.test(server), false, 'nessun payload sorgente intero')
assert.equal(/\.from\(['"](?:chat_messages|client_notes|tasks)['"]\)/.test(server), false, 'nessuna conversazione o task interna nel lettore')
assert.equal(/\.insert\(|\.update\(|\.delete\(/.test(server), false, 'primo giro in consultazione')
console.log('Tutti i controlli passano: associazioni, ruoli, fallback chiuso e payload pubblico.')
