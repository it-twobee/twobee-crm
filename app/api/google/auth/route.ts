import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function GET() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_APP_URL + '/api/google/callback'
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    prompt: 'consent',
  })

  return NextResponse.redirect(url)
}
