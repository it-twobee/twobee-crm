import assert from 'node:assert/strict'
import Module from 'node:module'
import { NextRequest } from 'next/server'

const actor = '00000000-0000-4000-8000-000000000001'
const dealId = '00000000-0000-4000-8000-000000000002'
let authorized = true, visible = true, dbError = false, email = 'user@twobee.it', calendarError = '', calendars = 0, reads = 0
let savedEmail: string | null = null, mirrorWrites = 0, mirrorError = false
const internals = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown }
const original = internals._load
internals._load = function (name, ...args) {
  if (name === '@/lib/sales-guard') return { getSalesAccess: async () => authorized ? { actor, sb: {
    from: (table: string) => ({ select: () => ({ eq: (_key: string, value: string) => ({
      maybeSingle: async () => { assert.equal(table, 'deals'); assert.equal(value, dealId); reads++; return { data: visible ? { id: dealId, contact_email: 'lead@example.test' } : null, error: dbError ? {} : null } },
      single: async () => ({ data: { email } }),
    }) }) }),
  } } : null }
  if (name === '@/lib/supabase/admin') return { createActorClient: (id: string) => {
    assert.equal(id, actor)
    return { from: (table: string) => ({ upsert: async (row: { profile_id: string }) => {
      assert.equal(table, 'calendar_events'); assert.equal(row.profile_id, actor); mirrorWrites++; return { error: mirrorError ? {} : null }
    } }) }
  } }
  if (name === '@/lib/sales-calendar') return { ...original.call(this, name, ...args) as object,
    saveFollowUp: async (_events: unknown, id: string, input: { title: string; start: string }, invite: string | null) => {
      assert.equal(id, actor); savedEmail = invite
      return { id: 'tb12345', summary: input.title, start: { dateTime: input.start }, end: { dateTime: input.start } }
    } }
  if (name === '@/lib/google-calendar') return { personalGoogleCalendar: async (_db: unknown, id: string) => {
    assert.equal(id, actor); calendars++
    if (calendarError) throw new Error(calendarError)
    return { events: { list: async () => ({ data: { items: [] } }) } }
  } }
  return original.call(this, name, ...args)
}

async function main() {
  const route = require('../app/api/sales/follow-up/route') as typeof import('../app/api/sales/follow-up/route')
  const req = () => new NextRequest(`http://localhost/api/sales/follow-up?dealId=${dealId}`)
  authorized = false
  assert.equal((await route.GET(req())).status, 403); assert.equal(reads, 0)
  authorized = true; visible = false
  assert.equal((await route.GET(req())).status, 404); assert.equal(calendars, 0)
  visible = true; dbError = true
  assert.equal((await route.GET(req())).status, 503); assert.equal(calendars, 0)
  dbError = false; email = 'user@example.test'
  assert.equal((await route.GET(req())).status, 403); assert.equal(calendars, 0)
  email = 'user@twobee.it'; calendarError = 'google_not_configured'
  assert.equal((await route.GET(req())).status, 503)
  calendarError = 'not_connected'
  assert.equal((await (await route.GET(req())).json()).code, 'not_connected')
  calendarError = ''
  assert.deepEqual(await (await route.GET(req())).json(), { events: [] })
  const before = calendars
  assert.equal((await route.POST(new NextRequest('http://localhost/api/sales/follow-up', { method: 'POST', body: '{}' }))).status, 415)
  assert.equal((await route.POST(new NextRequest('http://localhost/api/sales/follow-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status, 400)
  assert.equal(calendars, before)
  const payload = { dealId, requestId: actor, title: 'Richiamo', start: '2026-10-01T10:00:00.000Z', duration: 30, timezone: 'Europe/Rome', inviteContact: false }
  visible = false
  assert.equal((await route.POST(new NextRequest('http://localhost/api/sales/follow-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))).status, 404)
  assert.equal(calendars, before)
  visible = true
  const body = { ...payload, inviteContact: true, attendeeEmails: ['injected@example.test'], profileId: dealId }
  const response = await route.POST(new NextRequest('http://localhost/api/sales/follow-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  assert.equal(response.status, 200); assert.equal(savedEmail, 'lead@example.test'); assert.equal(mirrorWrites, 1)
  mirrorError = true
  const saved = await route.POST(new NextRequest('http://localhost/api/sales/follow-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }))
  assert.equal(saved.status, 200); assert.ok((await saved.json()).warning)
  console.log('Tutti i controlli passano: route con sessione, grant, RLS del lead, account Google e input invalido.')
}
main().finally(() => { internals._load = original }).catch(e => { console.error(e); process.exitCode = 1 })
