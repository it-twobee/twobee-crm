'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type InviteGuestResult =
  | { success: true; guestId: string }
  | { success: false; error: string }

export async function inviteChannelGuest(
  channelId: string,
  email: string,
  guestType: 'cliente' | 'partner',
  fullName: string,
  role: string,
): Promise<InviteGuestResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Non autenticato' }

  // Conta quanti guest di quel tipo esistono già
  const { count } = await supabase
    .from('channel_guests')
    .select('*', { count: 'exact', head: true })
    .eq('channel_id', channelId)
    .eq('guest_type', guestType)
    .neq('status', 'revoked')

  if ((count ?? 0) >= 5) {
    return { success: false, error: `Massimo 5 ospiti di tipo "${guestType}" per canale` }
  }

  // Inserisci o aggiorna guest
  const { data: guest, error: guestError } = await supabase
    .from('channel_guests')
    .upsert(
      { channel_id: channelId, email, full_name: fullName, role, guest_type: guestType, invited_by: user.id, status: 'pending' },
      { onConflict: 'channel_id,email' }
    )
    .select()
    .single()

  if (guestError || !guest) {
    return { success: false, error: guestError?.message ?? 'Errore inserimento guest' }
  }

  // Invia magic link via Supabase Admin
  const admin = createAdminClient()
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/onboarding?token=${guest.invite_token}`,
    data: {
      full_name: fullName,
      role,
      guest_type: guestType,
      invite_token: guest.invite_token,
      channel_id: channelId,
    },
  })

  if (inviteError) {
    // Se l'utente esiste già, genera link di login
    const { error: magicError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/onboarding?token=${guest.invite_token}`,
      },
    })
    if (magicError) {
      return { success: false, error: 'Errore invio email: ' + (inviteError.message) }
    }
  }

  return { success: true, guestId: guest.id }
}

export async function revokeChannelGuest(guestId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Non autenticato' }

  const { error } = await supabase
    .from('channel_guests')
    .update({ status: 'revoked' })
    .eq('id', guestId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
