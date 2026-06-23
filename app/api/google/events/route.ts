import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'

function getOAuth2Client(accessToken: string, refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_APP_URL + '/api/google/callback'
  )
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  return oauth2Client
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meta = user.user_metadata
  if (!meta?.google_access_token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 403 })
  }

  const auth = getOAuth2Client(meta.google_access_token, meta.google_refresh_token)
  const calendar = google.calendar({ version: 'v3', auth })

  const timeMin = req.nextUrl.searchParams.get('timeMin') ?? new Date().toISOString()
  const timeMax = req.nextUrl.searchParams.get('timeMax') ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  })

  return NextResponse.json({ events: data.items ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meta = user.user_metadata
  if (!meta?.google_access_token) return NextResponse.json({ error: 'not_connected' }, { status: 403 })

  const body = await req.json()
  const auth = getOAuth2Client(meta.google_access_token, meta.google_refresh_token)
  const calendar = google.calendar({ version: 'v3', auth })

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
