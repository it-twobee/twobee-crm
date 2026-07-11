import { google } from 'googleapis'
import { randomUUID } from 'crypto'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

// OAuth client con persistenza del refresh token (come in /api/google/events).
function oc(accessToken: string | null, refreshToken: string | null, profileId: string, admin: Admin) {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/api/google/callback',
  )
  c.setCredentials({ access_token: accessToken ?? undefined, refresh_token: refreshToken ?? undefined })
  c.on('tokens', (t) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (t.access_token) patch.access_token = t.access_token
    if (t.refresh_token) patch.refresh_token = t.refresh_token
    if (t.expiry_date) patch.expiry = new Date(t.expiry_date).toISOString()
    void admin.from('google_credentials').update(patch as never).eq('profile_id', profileId)
  })
  return c
}

const isoOf = (s: string) => (s.length === 10 ? `${s}T00:00:00Z` : s)

/**
 * Allinea il mirror `calendar_events` a Google per un profilo (direzione Google→tool,
 * usata dal webhook 2c). Preserva il link cliente/progetto già presente nel mirror
 * (conflitto: i campi Google vincono, ma il collegamento locale non si perde).
 */
export async function syncMirrorFromGoogle(admin: Admin, profileId: string) {
  const { data: cred } = await admin
    .from('google_credentials').select('access_token, refresh_token').eq('profile_id', profileId).maybeSingle()
  const c = cred as { access_token: string | null; refresh_token: string | null } | null
  if (!c || (!c.access_token && !c.refresh_token)) return

  const cal = google.calendar({ version: 'v3', auth: oc(c.access_token, c.refresh_token, profileId, admin) })
  const timeMin = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const timeMax = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()

  let items: import('googleapis').calendar_v3.Schema$Event[] = []
  try {
    const { data } = await cal.events.list({
      calendarId: 'primary', timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 250,
    })
    items = data.items ?? []
  } catch { return }

  for (const e of items) {
    if (!e.id) continue
    if (e.status === 'cancelled') {
      await admin.from('calendar_events').delete().eq('profile_id', profileId).eq('external_event_id', e.id)
      continue
    }
    const start = e.start?.dateTime ?? e.start?.date
    const end = e.end?.dateTime ?? e.end?.date
    if (!start || !end) continue

    const { data: existing } = await admin.from('calendar_events')
      .select('client_id, project_id').eq('profile_id', profileId).eq('external_event_id', e.id).maybeSingle()
    const ex = existing as { client_id: string | null; project_id: string | null } | null

    await admin.from('calendar_events').upsert({
      profile_id: profileId,
      external_event_id: e.id,
      calendar_id: 'primary',
      client_id: ex?.client_id ?? null,
      project_id: ex?.project_id ?? null,
      title: e.summary ?? '(senza titolo)',
      description: e.description ?? null,
      location: e.location ?? null,
      start_at: isoOf(start),
      end_at: isoOf(end),
      all_day: !e.start?.dateTime,
      meet_link: e.hangoutLink ?? null,
      recurrence: (e.recurrence ?? [])[0] ?? null,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never, { onConflict: 'profile_id,external_event_id' })
  }
}

/**
 * Registra/rinnova il watch channel Google (push) per il webhook 2c. I channel
 * scadono (~7gg): rinnova solo se mancante o in scadenza entro 24h. Richiede
 * NEXT_PUBLIC_APP_URL (dominio pubblico). In dev senza dominio non fa nulla.
 */
export async function ensureCalendarWatch(admin: Admin, profileId: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base || base.includes('localhost')) return

  const { data: cred } = await admin.from('google_credentials')
    .select('access_token, refresh_token, calendar_channel_expiry').eq('profile_id', profileId).maybeSingle()
  const c = cred as { access_token: string | null; refresh_token: string | null; calendar_channel_expiry: string | null } | null
  if (!c || (!c.access_token && !c.refresh_token)) return

  const exp = c.calendar_channel_expiry ? new Date(c.calendar_channel_expiry).getTime() : 0
  if (exp > Date.now() + 24 * 3600 * 1000) return // ancora valido

  const cal = google.calendar({ version: 'v3', auth: oc(c.access_token, c.refresh_token, profileId, admin) })
  try {
    const channelId = randomUUID()
    const { data } = await cal.events.watch({
      calendarId: 'primary',
      requestBody: {
        id: channelId, type: 'web_hook',
        address: `${base}/api/google/webhook`,
        token: profileId, // verificato nel webhook
        expiration: String(Date.now() + 7 * 24 * 3600 * 1000),
      },
    })
    await admin.from('google_credentials').update({
      calendar_channel_id: channelId,
      calendar_resource_id: data.resourceId ?? null,
      calendar_channel_expiry: data.expiration ? new Date(Number(data.expiration)).toISOString() : null,
    } as never).eq('profile_id', profileId)
  } catch {
    // watch fallito (dominio non raggiungibile da Google): resta il live-read.
  }
}
