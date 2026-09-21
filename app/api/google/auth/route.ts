import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'node:crypto'
import { GOOGLE_OAUTH_COOKIE, googleReturnTo } from '@/lib/google-oauth'

// D4 (Fase 0): solo gli account @twobee.it possono collegare Google Calendar.
// Verifica lato server: nascondere la CTA non è una barriera. Freelance/partner
// con email diversa NON usano il flusso standard (gate dedicato: da progettare).
const isTwoBeeEmail = (email?: string | null) => !!email && email.toLowerCase().endsWith('@twobee.it')

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  // Il redirect_uri DEVE combaciare con quello registrato in Google Console e col
  // dominio reale. In prod NEXT_PUBLIC_APP_URL va impostato al dominio finale; se
  // manca, ripieghiamo sull'origine della richiesta invece che su localhost.
  const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

  // Config mancante (es. env non settate sul deploy): senza questo controllo
  // generateAuthUrl produce un URL SENZA client_id e Google risponde
  // "Missing required parameter: client_id". Torniamo indietro con un errore
  // leggibile invece di mandare l'utente su quella schermata.
  if (!clientId || !clientSecret) {
    // Torna alla pagina di provenienza (stesso host) con l'errore leggibile.
    const referer = req.headers.get('referer')
    let backUrl = new URL('/impostazioni/profilo', base)
    if (referer) {
      try {
        const r = new URL(referer)
        if (r.origin === new URL(base).origin) backUrl = r
      } catch { /* referer malformato: resta il default */ }
    }
    backUrl.searchParams.set('error', 'google_not_configured')
    return NextResponse.redirect(backUrl)
  }

  // Gate dominio: l'utente dev'essere autenticato e con email @twobee.it.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', base))
  if (!isTwoBeeEmail(user.email)) {
    const backUrl = new URL('/workspace/calendario', base)
    backUrl.searchParams.set('error', 'google_domain_not_allowed')
    return NextResponse.redirect(backUrl)
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, `${base}/api/google/callback`)
  const state = randomBytes(32).toString('hex')

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    prompt: 'consent',
    state,
  })

  const response = NextResponse.redirect(url)
  response.cookies.set(GOOGLE_OAUTH_COOKIE, JSON.stringify({ userId: user.id, state, returnTo: googleReturnTo(req.nextUrl.searchParams.get('returnTo')) }),
    { httpOnly: true, secure: new URL(base).protocol === 'https:', sameSite: 'lax', path: '/api/google', maxAge: 600 })
  return response
}
