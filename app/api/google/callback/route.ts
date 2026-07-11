import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(`${base}/workspace/calendario?error=no_code`)

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${base}/api/google/callback`,
  )

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)
  // D4 (Fase 0): difesa in profondità — non salvare token per email non-@twobee.it.
  if (!user.email?.toLowerCase().endsWith('@twobee.it')) {
    return NextResponse.redirect(`${base}/workspace/calendario?error=google_domain_not_allowed`)
  }

  const { tokens } = await oauth2Client.getToken(code)

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
    return NextResponse.redirect(`${base}/workspace/calendario?error=${encodeURIComponent(error.message)}`)
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

  return NextResponse.redirect(`${base}/workspace/calendario?connected=true`)
}
