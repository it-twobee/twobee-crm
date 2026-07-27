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
      .select('client_id, project_id, kind, hr_request_id')
      .eq('profile_id', profileId).eq('external_event_id', e.id).maybeSingle()
    const ex = existing as {
      client_id: string | null; project_id: string | null
      kind: string | null; hr_request_id: string | null
    } | null

    await admin.from('calendar_events').upsert({
      profile_id: profileId,
      external_event_id: e.id,
      calendar_id: 'primary',
      client_id: ex?.client_id ?? null,
      project_id: ex?.project_id ?? null,
      // un'assenza resta un'assenza anche quando torna indietro da Google:
      // i campi Google vincono sul contenuto, non sulla natura dell'evento
      kind: ex?.kind ?? 'evento',
      hr_request_id: ex?.hr_request_id ?? null,
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
 * Direzione opposta: tool → Google. Crea (o aggiorna) su Google l'evento che
 * rappresenta un'assenza approvata e salva l'`external_event_id` sul mirror, così
 * il webhook lo riconosce invece di duplicarlo.
 *
 * Non solleva: se l'utente non ha collegato Google, l'assenza resta comunque nel
 * calendario del tool con sync_status='local'.
 */
export async function pushEventToGoogle(admin: Admin, eventId: string): Promise<'synced' | 'local' | 'error'> {
  const { data: row } = await admin.from('calendar_events')
    .select('id, profile_id, external_event_id, title, description, start_at, end_at, all_day, timezone')
    .eq('id', eventId).maybeSingle()
  const ev = row as {
    id: string; profile_id: string; external_event_id: string | null
    title: string; description: string | null
    start_at: string | null; end_at: string | null; all_day: boolean; timezone: string
  } | null
  if (!ev || !ev.start_at || !ev.end_at) return 'error'

  const { data: cred } = await admin.from('google_credentials')
    .select('access_token, refresh_token').eq('profile_id', ev.profile_id).maybeSingle()
  const c = cred as { access_token: string | null; refresh_token: string | null } | null
  if (!c || (!c.access_token && !c.refresh_token)) {
    await admin.from('calendar_events').update({ sync_status: 'local' } as never).eq('id', ev.id)
    return 'local'
  }

  const cal = google.calendar({ version: 'v3', auth: oc(c.access_token, c.refresh_token, ev.profile_id, admin) })
  // Google vuole date nude per gli all-day, e la fine è ESCLUSIVA: +1 giorno
  const dayOf = (s: string) => s.slice(0, 10)
  const dayPlus = (s: string) => {
    const d = new Date(s.slice(0, 10) + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  }
  const body = {
    summary: ev.title,
    description: ev.description ?? undefined,
    start: ev.all_day ? { date: dayOf(ev.start_at) } : { dateTime: ev.start_at, timeZone: ev.timezone },
    end: ev.all_day ? { date: dayPlus(ev.end_at) } : { dateTime: ev.end_at, timeZone: ev.timezone },
  }

  try {
    const res = ev.external_event_id
      ? await cal.events.update({ calendarId: 'primary', eventId: ev.external_event_id, requestBody: body })
      : await cal.events.insert({ calendarId: 'primary', requestBody: body })
    await admin.from('calendar_events').update({
      external_event_id: res.data.id ?? ev.external_event_id,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
    } as never).eq('id', ev.id)
    return 'synced'
  } catch {
    await admin.from('calendar_events').update({ sync_status: 'error' } as never).eq('id', ev.id)
    return 'error'
  }
}

/** Rimuove da Google l'evento di un'assenza revocata. Silenzioso se non c'è. */
export async function deleteEventFromGoogle(admin: Admin, profileId: string, externalEventId: string) {
  const { data: cred } = await admin.from('google_credentials')
    .select('access_token, refresh_token').eq('profile_id', profileId).maybeSingle()
  const c = cred as { access_token: string | null; refresh_token: string | null } | null
  if (!c || (!c.access_token && !c.refresh_token)) return
  const cal = google.calendar({ version: 'v3', auth: oc(c.access_token, c.refresh_token, profileId, admin) })
  try { await cal.events.delete({ calendarId: 'primary', eventId: externalEventId }) } catch { /* già sparito */ }
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
