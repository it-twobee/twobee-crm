import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

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

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, `${base}/api/google/callback`)

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
