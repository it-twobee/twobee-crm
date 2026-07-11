import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminRaw, isAdminRole, isWorkspaceRole } from '@/lib/permissions'
import { ensureCalendarWatch } from '@/lib/google-calendar'

export interface CalendarEvent {
  id: string
  profileId: string
  summary: string
  start: string
  end: string
  allDay: boolean
  /** true se il titolo è stato oscurato perché l'evento è di un collega */
  masked: boolean
  // Popolati solo per i propri eventi (masked=false): servono all'editor.
  description?: string | null
  location?: string | null
  meetLink?: string | null
  attendeeEmails?: string[]
}

function oauthFor(
  accessToken: string | null,
  refreshToken: string | null,
  persist?: { profileId: string; admin: ReturnType<typeof createAdminClient> },
) {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/api/google/callback',
  )
  c.setCredentials({
    access_token: accessToken ?? undefined,
    refresh_token: refreshToken ?? undefined,
  })
  // Fase 2b: quando googleapis rinnova il token, ripersisti in google_credentials
  // (prima restava in memoria → expiry stale). Fire-and-forget.
  if (persist) {
    c.on('tokens', (t) => {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (t.access_token) patch.access_token = t.access_token
      if (t.refresh_token) patch.refresh_token = t.refresh_token
      if (t.expiry_date) patch.expiry = new Date(t.expiry_date).toISOString()
      void persist.admin.from('google_credentials').update(patch as never).eq('profile_id', persist.profileId)
    })
  }
  return c
}

/** Solo lo staff interno può vedere le agende dei colleghi. */
function canSeeColleagues(role: string | null, appRole: string | null, email: string | null) {
  return isSuperAdminRaw(email, appRole)
    || isAdminRole(appRole)
    || isWorkspaceRole(appRole)
    || role === 'admin'
    || role === 'team'
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase
    .from('profiles').select('role, app_role, email').eq('id', user.id).single()

  const requested = (req.nextUrl.searchParams.get('profileIds') ?? user.id)
    .split(',').map(s => s.trim()).filter(Boolean)

  // La propria agenda sempre; quelle altrui solo allo staff interno.
  const others = requested.filter(id => id !== user.id)
  if (others.length > 0 && !canSeeColleagues(me?.role ?? null, me?.app_role ?? null, me?.email ?? null)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const timeMin = req.nextUrl.searchParams.get('timeMin') ?? new Date().toISOString()
  const timeMax = req.nextUrl.searchParams.get('timeMax')
    ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()

  // I token stanno in google_credentials (deny-all, solo service role): non
  // possono passare dal client, nemmeno per la propria agenda.
  const admin = createAdminClient()
  const { data: creds, error: credErr } = await admin
    .from('google_credentials')
    .select('profile_id, access_token, refresh_token')
    .in('profile_id', requested)

  // Migration 091 non applicata: nessun evento Google, ma riunioni e task
  // interne devono continuare a comparire.
  if (credErr) {
    return NextResponse.json({ events: [], notConnected: requested, setupRequired: true })
  }

  type Cred = { profile_id: string; access_token: string | null; refresh_token: string | null }
  const credMap = new Map((creds ?? []).map((c: Cred) => [c.profile_id, c]))

  const events: CalendarEvent[] = []
  const notConnected: string[] = []

  // Una richiesta per profilo: un collega scollegato non fa fallire gli altri.
  await Promise.all(requested.map(async profileId => {
    const cred = credMap.get(profileId)
    if (!cred?.refresh_token && !cred?.access_token) { notConnected.push(profileId); return }

    try {
      const calendar = google.calendar({ version: 'v3', auth: oauthFor(cred.access_token, cred.refresh_token, { profileId, admin }) })
      const { data } = await calendar.events.list({
        calendarId: 'primary',
        timeMin, timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      })

      const isMine = profileId === user.id

      for (const e of data.items ?? []) {
        const start = e.start?.dateTime ?? e.start?.date
        const end = e.end?.dateTime ?? e.end?.date
        if (!start || !end) continue

        // Privacy: dell'agenda di un collega mostriamo solo che è occupato.
        // Niente titolo, descrizione o partecipanti.
        events.push({
          id: e.id ?? `${profileId}-${start}`,
          profileId,
          summary: isMine ? (e.summary ?? '(senza titolo)') : 'Occupato',
          start,
          end,
          allDay: !e.start?.dateTime,
          masked: !isMine,
          // Dettagli solo per i propri eventi: dei colleghi non si espone nulla.
          ...(isMine ? {
            description: e.description ?? null,
            location: e.location ?? null,
            meetLink: e.hangoutLink ?? null,
            attendeeEmails: (e.attendees ?? []).map(a => a.email ?? '').filter(Boolean),
          } : {}),
        })
      }
    } catch {
      // Token scaduto o revocato: come non collegato.
      notConnected.push(profileId)
    }
  }))

  // Fase 2c: rinnovo lazy del watch channel dell'utente (no-op se valido o senza dominio).
  if (credMap.has(user.id)) { void ensureCalendarWatch(admin, user.id) }

  return NextResponse.json({ events, notConnected })
}

interface EventBody {
  title?: string
  description?: string
  location?: string
  start?: string        // ISO datetime, oppure YYYY-MM-DD se allDay
  end?: string
  allDay?: boolean
  addMeet?: boolean
  attendeeIds?: string[]    // profili colleghi: le email si risolvono lato server
  attendeeEmails?: string[] // indirizzi liberi
  eventId?: string          // solo per PATCH/DELETE
  // Fase 2b
  timezone?: string
  recurrence?: string       // RRULE, es. 'RRULE:FREQ=WEEKLY'
  reminders?: { method: string; minutes: number }[]
  clientId?: string | null  // link mirror (non inviato a Google)
  projectId?: string | null // link mirror (non inviato a Google)
}

/** Le email degli invitati non passano dal client: si risolvono dai profili. */
async function resolveAttendeeEmails(
  admin: ReturnType<typeof createAdminClient>, body: EventBody,
): Promise<string[]> {
  const emails = new Set((body.attendeeEmails ?? []).map(e => e.trim()).filter(Boolean))
  if (body.attendeeIds?.length) {
    const { data } = await admin.from('profiles').select('email').in('id', body.attendeeIds)
    for (const p of (data ?? []) as { email: string | null }[]) if (p.email) emails.add(p.email)
  }
  return Array.from(emails)
}

function buildRequestBody(body: EventBody, attendeeEmails: string[]) {
  const tz = body.timezone || 'Europe/Rome'
  const rb: Record<string, unknown> = {
    summary: body.title,
    description: body.description || undefined,
    location: body.location || undefined,
  }
  if (body.allDay && body.start && body.end) {
    // Google: per l'all-day end.date è esclusivo. Il client manda già il giorno dopo.
    rb.start = { date: body.start }
    rb.end = { date: body.end }
  } else {
    rb.start = { dateTime: body.start, timeZone: tz }
    rb.end = { dateTime: body.end, timeZone: tz }
  }
  if (attendeeEmails.length) rb.attendees = attendeeEmails.map(email => ({ email }))
  if (body.addMeet) {
    rb.conferenceData = {
      createRequest: { requestId: `twobee-${body.start}`, conferenceSolutionKey: { type: 'hangoutsMeet' } },
    }
  }
  // Ricorrenza (RRULE) e promemoria (§8.2 / Cal-Q3).
  if (body.recurrence) rb.recurrence = [body.recurrence]
  if (body.reminders && body.reminders.length) {
    rb.reminders = { useDefault: false, overrides: body.reminders }
  }
  return rb
}

/** Upsert nel mirror locale dopo una scrittura su Google (write-through, Fase 2b). */
async function syncMirror(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  body: EventBody,
  googleEvent: { id?: string | null; hangoutLink?: string | null },
) {
  if (!googleEvent.id) return
  const row = {
    profile_id: profileId,
    external_event_id: googleEvent.id,
    calendar_id: 'primary',
    client_id: body.clientId ?? null,
    project_id: body.projectId ?? null,
    title: body.title ?? '(senza titolo)',
    description: body.description ?? null,
    location: body.location ?? null,
    start_at: body.allDay ? (body.start ? `${body.start}T00:00:00Z` : null) : (body.start ?? null),
    end_at: body.allDay ? (body.end ? `${body.end}T00:00:00Z` : null) : (body.end ?? null),
    all_day: !!body.allDay,
    timezone: body.timezone || 'Europe/Rome',
    meet_link: googleEvent.hangoutLink ?? null,
    recurrence: body.recurrence ?? null,
    reminders: body.reminders ?? null,
    sync_status: 'synced',
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  // Non blocchiamo la risposta all'utente se il mirror fallisce: Google resta la fonte.
  await admin.from('calendar_events').upsert(row as never, { onConflict: 'profile_id,external_event_id' })
}

/** OAuth del solo utente corrente: si può scrivere unicamente sul proprio calendario. */
async function myCalendar(userId: string) {
  const admin = createAdminClient()
  const { data: cred } = await admin
    .from('google_credentials')
    .select('access_token, refresh_token')
    .eq('profile_id', userId)
    .maybeSingle()
  if (!cred?.access_token && !cred?.refresh_token) return null
  return {
    admin,
    calendar: google.calendar({ version: 'v3', auth: oauthFor(cred.access_token, cred.refresh_token, { profileId: userId, admin }) }),
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await myCalendar(user.id)
  if (!ctx) return NextResponse.json({ error: 'not_connected' }, { status: 403 })

  const body = (await req.json()) as EventBody
  const attendees = await resolveAttendeeEmails(ctx.admin, body)

  const { data } = await ctx.calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: body.addMeet ? 1 : 0,
    sendUpdates: attendees.length ? 'all' : 'none',
    requestBody: buildRequestBody(body, attendees),
  })

  await syncMirror(ctx.admin, user.id, body, data)
  return NextResponse.json({ event: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await myCalendar(user.id)
  if (!ctx) return NextResponse.json({ error: 'not_connected' }, { status: 403 })

  const body = (await req.json()) as EventBody
  if (!body.eventId) return NextResponse.json({ error: 'missing_event_id' }, { status: 400 })
  const attendees = await resolveAttendeeEmails(ctx.admin, body)

  const { data } = await ctx.calendar.events.patch({
    calendarId: 'primary',
    eventId: body.eventId,
    conferenceDataVersion: body.addMeet ? 1 : 0,
    sendUpdates: attendees.length ? 'all' : 'none',
    requestBody: buildRequestBody(body, attendees),
  })

  await syncMirror(ctx.admin, user.id, body, data)
  return NextResponse.json({ event: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const eventId = req.nextUrl.searchParams.get('eventId')
  if (!eventId) return NextResponse.json({ error: 'missing_event_id' }, { status: 400 })

  const ctx = await myCalendar(user.id)
  if (!ctx) return NextResponse.json({ error: 'not_connected' }, { status: 403 })

  await ctx.calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' })
  await ctx.admin.from('calendar_events').delete().eq('profile_id', user.id).eq('external_event_id', eventId)
  return NextResponse.json({ ok: true })
}
