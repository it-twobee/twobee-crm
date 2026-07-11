import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncMirrorFromGoogle } from '@/lib/google-calendar'

// Fase 2c — Webhook Google Calendar (push channels). Google chiama questo endpoint
// quando cambia qualcosa sul calendario watchato. Ri-sincronizziamo il mirror.
// Verifica: mappiamo il channel al profilo (X-Goog-Channel-Token = profile_id).
export async function POST(req: NextRequest) {
  const channelId = req.headers.get('x-goog-channel-id')
  const token = req.headers.get('x-goog-channel-token')
  const state = req.headers.get('x-goog-resource-state')

  // Handshake iniziale di Google: nessun cambiamento da sincronizzare.
  if (state === 'sync') return NextResponse.json({ ok: true })

  const admin = createAdminClient()
  let profileId: string | null = token

  // Fallback: risali al profilo dal channel id salvato.
  if (!profileId && channelId) {
    const { data } = await admin.from('google_credentials')
      .select('profile_id').eq('calendar_channel_id', channelId).maybeSingle()
    profileId = (data as { profile_id: string } | null)?.profile_id ?? null
  }

  // Coerenza: il token deve corrispondere al channel registrato per quel profilo.
  if (profileId && channelId) {
    const { data } = await admin.from('google_credentials')
      .select('calendar_channel_id').eq('profile_id', profileId).maybeSingle()
    if ((data as { calendar_channel_id: string | null } | null)?.calendar_channel_id !== channelId) {
      return NextResponse.json({ ok: true }) // channel non riconosciuto: ignora
    }
  }

  if (profileId) {
    try { await syncMirrorFromGoogle(admin, profileId) } catch { /* non bloccare Google */ }
  }
  // Google si aspetta un 2xx rapido.
  return NextResponse.json({ ok: true })
}
