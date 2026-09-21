import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GOOGLE_OAUTH_COOKIE, readGoogleOAuthCookie } from '@/lib/google-oauth'

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
  const pending = readGoogleOAuthCookie(req.cookies.get(GOOGLE_OAUTH_COOKIE)?.value)
  const finish = (error?: string) => {
    const url = new URL(pending?.returnTo ?? '/workspace/calendario', base)
    url.searchParams.set(error ? 'error' : 'connected', error ?? 'true')
    const response = NextResponse.redirect(url)
    response.cookies.set(GOOGLE_OAUTH_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: new URL(base).protocol === 'https:', path: '/api/google', maxAge: 0 })
    return response
  }
  if (!pending || req.nextUrl.searchParams.get('state') !== pending.state) return finish('google_invalid_state')
  if (req.nextUrl.searchParams.has('error')) return finish('google_consent_denied')
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return finish('no_code')

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${base}/api/google/callback`,
  )

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)
  if (user.id !== pending.userId) return finish('google_invalid_state')
  // D4 (Fase 0): difesa in profondità — non salvare token per email non-@twobee.it.
  if (!user.email?.toLowerCase().endsWith('@twobee.it')) {
    return finish('google_domain_not_allowed')
  }

  let tokens
  try { ({ tokens } = await oauth2Client.getToken(code)) }
  catch { return finish('google_connection_failed') }

  // I token NON vanno in user_metadata: il client dell'utente lo legge e lo
  // riscrive. Stanno in google_credentials, tabella deny-all raggiungibile solo
  // dal service role (migration 091).
  const admin = createAdminClient()

  const { error } = await admin.from('google_credentials').upsert({
    profile_id: user.id,
    access_token: tokens.access_token ?? null,
    // Google restituisce il refresh_token solo al primo consenso: se manca non
    // sovrascriviamo con null quello già salvato.
    ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    scope: tokens.scope ?? null,
    updated_at: new Date().toISOString(),
  } as never, { onConflict: 'profile_id' })

  if (error) {
    return finish('google_connection_failed')
  }

  await admin.from('profiles').update({ google_connected: true } as never).eq('id', user.id)

  // Fase 2c: registra il watch channel per il push real-time (no-op senza dominio pubblico).
  try {
    const { ensureCalendarWatch } = await import('@/lib/google-calendar')
    await ensureCalendarWatch(admin, user.id)
  } catch { /* non bloccare la connessione se il watch fallisce */ }

  // Ripulisci i token lasciati nel metadata dai collegamenti precedenti.
  await supabase.auth.updateUser({
    data: { google_access_token: null, google_refresh_token: null, google_token_expiry: null },
  })

  return finish()
}
