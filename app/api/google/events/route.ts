import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminRaw, isAdminRole, isWorkspaceRole } from '@/lib/permissions'

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

function oauthFor(accessToken: string | null, refreshToken: string | null) {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    (process.env.NEXT_PUBLIC_APP_URL ?? '') + '/api/google/callback',
  )
  c.setCredentials({
    access_token: accessToken ?? undefined,
    refresh_token: refreshToken ?? undefined,
  })
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
      const calendar = google.calendar({ version: 'v3', auth: oauthFor(cred.access_token, cred.refresh_token) })
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
    rb.start = { dateTime: body.start, timeZone: 'Europe/Rome' }
    rb.end = { dateTime: body.end, timeZone: 'Europe/Rome' }
  }
  if (attendeeEmails.length) rb.attendees = attendeeEmails.map(email => ({ email }))
  if (body.addMeet) {
    rb.conferenceData = {
      createRequest: { requestId: `twobee-${body.start}`, conferenceSolutionKey: { type: 'hangoutsMeet' } },
    }
  }
  return rb
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
    calendar: google.calendar({ version: 'v3', auth: oauthFor(cred.access_token, cred.refresh_token) }),
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
  return NextResponse.json({ ok: true })
}
