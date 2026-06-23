import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect('/calendario?error=no_code')

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_APP_URL + '/api/google/callback'
  )

  const { tokens } = await oauth2Client.getToken(code)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect('/login')

  // Store tokens in user metadata
  await supabase.auth.updateUser({
    data: {
      google_access_token: tokens.access_token,
      google_refresh_token: tokens.refresh_token,
      google_token_expiry: tokens.expiry_date,
    }
  })

  return NextResponse.redirect(process.env.NEXT_PUBLIC_APP_URL + '/calendario?connected=true')
}
