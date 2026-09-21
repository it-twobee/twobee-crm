import assert from 'node:assert/strict'
import type { calendar_v3 } from 'googleapis'
import { followUpEmail, validateFollowUp } from './sales-follow-up'
import { followUpEventKey, listFollowUps, presentFollowUp, saveFollowUp, removeFollowUp } from './sales-calendar'
import { googleReturnTo, readGoogleOAuthCookie } from './google-oauth'

const actor = '00000000-0000-4000-8000-000000000001'
const dealId = '00000000-0000-4000-8000-000000000002'
const other = '00000000-0000-4000-8000-000000000003'
const input = { dealId, requestId: other, title: 'Richiamo', start: '2026-10-25T08:00:00.000Z', duration: 30, timezone: 'Europe/Rome', inviteContact: false }

async function main() {
  assert.equal(validateFollowUp(input).start, input.start)
  for (const change of [{ title: '' }, { duration: 0 }, { duration: 1441 }, { duration: 30.5 }, { inviteContact: 'false' },
    { start: '2026-02-30T08:00:00.000Z' }, { start: '2026-10-25T08:00' }, { timezone: 'inventato' },
    { dealId: 'x' }, { eventId: 'evento' }]) assert.throws(() => validateFollowUp({ ...input, ...change }))
  assert.equal(followUpEmail(false, null), null)
  assert.throws(() => followUpEmail(true, 'email rotta'))
  assert.equal(followUpEmail(true, ' lead@example.test '), 'lead@example.test')
  assert.equal(googleReturnTo('https://evil.test'), '/workspace/calendario')
  assert.equal(googleReturnTo('//evil.test'), '/workspace/calendario')
  assert.equal(googleReturnTo('/commerciale'), '/commerciale')
  assert.equal(readGoogleOAuthCookie('broken'), null)
  assert.equal(readGoogleOAuthCookie(JSON.stringify({ userId: actor, state: 'a'.repeat(64), returnTo: '//evil.test' }))?.returnTo, '/workspace/calendario')

  const store = new Map<string, calendar_v3.Schema$Event>()
  let inserts = 0, patches = 0, deletes = 0, invitations = 0
  let timeoutAfterSave = false
  const events = {
    insert: async ({ requestBody, sendUpdates }: { requestBody: calendar_v3.Schema$Event; sendUpdates: string }) => {
      if (store.has(requestBody.id!)) throw { code: 409 }
      inserts++; if (sendUpdates === 'all') invitations++
      const data = { ...structuredClone(requestBody), etag: 'v1', status: 'confirmed' }
      store.set(data.id!, data)
      if (timeoutAfterSave) { timeoutAfterSave = false; throw { code: 504 } }
      return { data }
    },
    get: async ({ eventId }: { eventId: string }) => ({ data: structuredClone(store.get(eventId)) }),
    patch: async ({ eventId, requestBody, sendUpdates }: { eventId: string; requestBody: calendar_v3.Schema$Event; sendUpdates: string }, options: { headers: Record<string, string> }) => {
      assert.equal(options.headers['If-Match'], store.get(eventId)?.etag)
      patches++; if (sendUpdates === 'all') invitations++
      const data = { ...store.get(eventId), ...structuredClone(requestBody), etag: `v${patches + 1}` }
      store.set(eventId, data); return { data }
    },
    delete: async ({ eventId }: { eventId: string }, options: { headers: Record<string, string> }) => {
      assert.equal(options.headers['If-Match'], store.get(eventId)?.etag)
      deletes++; store.delete(eventId); return { data: {} }
    },
    list: async ({ pageToken }: { pageToken?: string }) => ({ data: { items: pageToken ? Array.from(store.values()).slice(1) : Array.from(store.values()).slice(0, 1), nextPageToken: pageToken ? undefined : 'next' } }),
  } as unknown as calendar_v3.Resource$Events

  const first = await saveFollowUp(events, actor, validateFollowUp(input), null)
  assert.equal(first.id, followUpEventKey(actor, dealId, other))
  assert.match(first.id!, /^[0-9a-v]{5,1024}$/)
  assert.notEqual(first.id, followUpEventKey(other, dealId, other))
  assert.equal(first.end?.dateTime, '2026-10-25T08:30:00.000Z')
  assert.deepEqual(first.attendees, [])
  assert.equal(first.description, undefined)
  assert.equal(invitations, 0)
  const retries = await Promise.all([saveFollowUp(events, actor, input, null), saveFollowUp(events, actor, input, null)])
  assert.ok(retries.every(e => e.id === first.id)); assert.equal(inserts, 1)
  await assert.rejects(() => saveFollowUp(events, actor, { ...input, title: 'Diverso' }, null), /altri dati/)

  const invitedInput = { ...input, requestId: actor, inviteContact: true }
  timeoutAfterSave = true
  await assert.rejects(() => saveFollowUp(events, actor, invitedInput, 'lead@example.test'))
  const invited = await saveFollowUp(events, actor, invitedInput, 'lead@example.test')
  assert.equal(inserts, 2); assert.equal(invitations, 1)
  assert.equal(presentFollowUp({ ...invited, attendees: [] }).invitedEmail, null)
  store.get(invited.id!)!.attendees!.push({ email: 'collega@example.test' })
  const edited = await saveFollowUp(events, actor, { ...invitedInput, eventId: invited.id!, etag: invited.etag!, start: '2026-10-25T09:00:00.000Z' }, null)
  assert.deepEqual(edited.attendees, [{ email: 'collega@example.test' }])
  assert.equal(edited.extendedProperties?.private?.twobeeDeal, dealId)
  assert.equal(invitations, 2)
  await assert.rejects(() => saveFollowUp(events, actor, { ...input, eventId: edited.id!, etag: 'v1' }, null), /cambiato/)
  await assert.rejects(() => saveFollowUp(events, actor, { ...input, dealId: other, eventId: edited.id!, etag: edited.etag! }, null), /non accessibile/)
  await assert.rejects(() => removeFollowUp(events, other, dealId, edited.id!, edited.etag!), /non accessibile/)
  assert.equal(patches, 1); assert.equal(deletes, 0)
  const foreign = structuredClone(first); foreign.id = 'foreign'; foreign.extendedProperties!.private!.twobeeActor = other
  store.set('foreign', foreign)
  const list = await listFollowUps(events, actor, dealId)
  assert.equal(list.length, 2)
  assert.ok(list.every(e => !('extendedProperties' in e)))
  await assert.rejects(() => removeFollowUp(events, actor, dealId, edited.id!, 'old'), /cambiato/)
  await removeFollowUp(events, actor, dealId, edited.id!, edited.etag!)
  assert.equal(deletes, 1)
  store.get(first.id!)!.recurrence = ['RRULE:FREQ=WEEKLY']
  await assert.rejects(() => removeFollowUp(events, actor, dealId, first.id!, first.etag!), /Google Calendar/)
  assert.equal(deletes, 1)
  console.log('Tutti i controlli passano: date, inviti espliciti, timeout, retry, isolamento lead/utente, paginazione e revisioni Google.')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
