// Bidirectional sync helpers — chiamati dopo ogni update locale

import { google } from 'googleapis'

// ── Asana ─────────────────────────────────────────────────────────────────────

const ASANA_PAT = process.env.ASANA_PAT

async function asanaRequest(method: string, path: string, body?: unknown) {
  if (!ASANA_PAT) return null
  const res = await fetch(`https://app.asana.com/api/1.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ASANA_PAT}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify({ data: body }) : undefined,
  })
  if (!res.ok) return null
  return res.json()
}

export async function syncTaskToAsana(task: {
  asana_gid?: string | null
  title: string
  status: string
  due_date?: string | null
  notes?: string | null
}) {
  if (!task.asana_gid) return

  const STATUS_MAP: Record<string, string> = {
    da_fare: 'not_started',
    in_corso: 'in_progress',
    in_revisione: 'in_progress',
    completato: 'completed',
  }

  await asanaRequest('PUT', `/tasks/${task.asana_gid}`, {
    name: task.title,
    completed: task.status === 'completato',
    due_on: task.due_date ?? null,
    notes: task.notes ?? '',
    // Asana custom field for status if configured
  })
}

// ── Google Calendar ────────────────────────────────────────────────────────────

function getOAuth2Client(accessToken: string, refreshToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_APP_URL + '/api/google/callback'
  )
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken })
  return auth
}

export async function syncMeetingToGoogleCalendar(
  meeting: { title: string; meeting_date: string; duration_minutes?: number | null; description?: string | null },
  userMeta: { google_access_token?: string; google_refresh_token?: string }
) {
  if (!userMeta.google_access_token) return null

  const auth = getOAuth2Client(userMeta.google_access_token, userMeta.google_refresh_token!)
  const calendar = google.calendar({ version: 'v3', auth })

  const start = new Date(meeting.meeting_date)
  const end = new Date(start.getTime() + (meeting.duration_minutes ?? 60) * 60 * 1000)

  const { data } = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: meeting.title,
      description: meeting.description ?? '',
      start: { dateTime: start.toISOString(), timeZone: 'Europe/Rome' },
      end: { dateTime: end.toISOString(), timeZone: 'Europe/Rome' },
    },
  })

  return data.id
}

export async function updateGoogleEvent(
  googleEventId: string,
  meeting: { title: string; meeting_date: string; duration_minutes?: number | null; description?: string | null },
  userMeta: { google_access_token?: string; google_refresh_token?: string }
) {
  if (!userMeta.google_access_token || !googleEventId) return

  const auth = getOAuth2Client(userMeta.google_access_token, userMeta.google_refresh_token!)
  const calendar = google.calendar({ version: 'v3', auth })

  const start = new Date(meeting.meeting_date)
  const end = new Date(start.getTime() + (meeting.duration_minutes ?? 60) * 60 * 1000)

  await calendar.events.patch({
    calendarId: 'primary',
    eventId: googleEventId,
    requestBody: {
      summary: meeting.title,
      description: meeting.description ?? '',
      start: { dateTime: start.toISOString(), timeZone: 'Europe/Rome' },
      end: { dateTime: end.toISOString(), timeZone: 'Europe/Rome' },
    },
  })
}
