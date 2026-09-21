import assert from 'node:assert/strict'
import Module from 'node:module'
import { NextRequest } from 'next/server'
import { GOOGLE_OAUTH_COOKIE } from '../lib/google-oauth'

const originalEnv = { ...process.env }
process.env.GOOGLE_CLIENT_ID = 'test-client'
process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
process.env.NEXT_PUBLIC_APP_URL = 'https://os.example.test'
let user = { id: 'user-one', email: 'test@twobee.it' }
let exchanges = 0, writes = 0
let requestedState = ''
const db = {
  auth: { getUser: async () => ({ data: { user } }), updateUser: async () => ({}) },
  from: () => ({ upsert: async () => { writes++; return { error: null } }, update: () => ({ eq: async () => ({ error: null }) }) }),
}
const internals = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown }
const original = internals._load
internals._load = function (name, ...args) {
  if (name === '@/lib/supabase/server') return { createClient: async () => db }
  if (name === '@/lib/supabase/admin') return { createAdminClient: () => db }
  if (name === '@/lib/google-calendar') return { ensureCalendarWatch: async () => {} }
  if (name === 'googleapis') return { google: { auth: { OAuth2: class {
    generateAuthUrl(options: { state: string }) { requestedState = options.state; return `https://accounts.google.com/auth?state=${options.state}` }
    async getToken() { exchanges++; return { tokens: { access_token: 'test-access', refresh_token: 'test-refresh' } } }
  } } } }
  return original.call(this, name, ...args)
}

async function main() {
  const auth = require('../app/api/google/auth/route') as typeof import('../app/api/google/auth/route')
  const callback = require('../app/api/google/callback/route') as typeof import('../app/api/google/callback/route')
  const response = await auth.GET(new NextRequest('https://os.example.test/api/google/auth?returnTo=/commerciale'))
  const cookie = response.cookies.get(GOOGLE_OAUTH_COOKIE)!
  const pending = JSON.parse(cookie.value)
  assert.match(requestedState, /^[a-f0-9]{64}$/)
  assert.equal(pending.state, requestedState)
  assert.match(response.headers.get('set-cookie')!, /HttpOnly/)
  assert.match(response.headers.get('set-cookie')!, /Secure/)
  const req = (state: string, withCookie = true) => new NextRequest(`https://os.example.test/api/google/callback?code=test&state=${state}`, {
    headers: withCookie ? { cookie: `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(cookie.value)}` } : {},
  })
  assert.match((await callback.GET(req('wrong'))).headers.get('location')!, /google_invalid_state/)
  await callback.GET(req(requestedState, false)); assert.equal(exchanges, 0)
  user = { ...user, id: 'user-two' }
  await callback.GET(req(requestedState)); assert.equal(exchanges, 0)
  user = { ...user, id: 'user-one' }
  const done = await callback.GET(req(requestedState))
  assert.equal(done.headers.get('location'), 'https://os.example.test/commerciale?connected=true')
  assert.equal(exchanges, 1); assert.equal(writes, 1)
  assert.equal(done.cookies.get(GOOGLE_OAUTH_COOKIE)?.value, '')
  console.log('Tutti i controlli passano: OAuth state, cookie protetto, sessione vincolata e ritorno al Commerciale.')
}
main().finally(() => { internals._load = original; process.env = originalEnv }).catch(e => { console.error(e); process.exitCode = 1 })
