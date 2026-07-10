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
        })
      }
    } catch {
      // Token scaduto o revocato: come non collegato.
      notConnected.push(profileId)
    }
  }))

  return NextResponse.json({ events, notConnected })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: cred } = await admin
    .from('google_credentials')
    .select('access_token, refresh_token')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!cred?.access_token && !cred?.refresh_token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 403 })
  }

  const body = await req.json()
  const calendar = google.calendar({ version: 'v3', auth: oauthFor(cred.access_token, cred.refresh_token) })

  const { data } = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: body.title,
      description: body.description,
      start: { dateTime: body.start, timeZone: 'Europe/Rome' },
      end: { dateTime: body.end, timeZone: 'Europe/Rome' },
      attendees: body.attendees?.map((email: string) => ({ email })),
    },
  })

  return NextResponse.json({ event: data })
}
