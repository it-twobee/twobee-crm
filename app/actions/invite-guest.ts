'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * §329 — chi invita è staff, e il ruolo non lo scrive l'invitante.
 *
 * L'azione aveva un solo controllo — «c'è una sessione» — e girava col service
 * role per spedire l'invito. Due cose non andavano, e insieme facevano una
 * scalata di privilegi che non richiedeva nemmeno di forgiare una richiesta:
 * il form «ospite esterno» del Customer Care ha un campo **ruolo a testo
 * libero**, quel testo finiva in `user_metadata.role`, e il trigger
 * `handle_new_user` (001) copia `raw_user_meta_data->>'role'` dentro
 * `profiles.role` — cioè la colonna che `get_my_role()` legge per la RLS e che
 * il middleware usa per decidere il portale. Bastava scrivere «admin» nel
 * campo del ruolo e invitare un proprio indirizzo.
 *
 * Qui si chiudono i due lati applicativi: **chi** può invitare (staff interno,
 * come per ogni altra scrittura del Customer Care) e **cosa** si scrive nei
 * metadati (mai un ruolo: l'etichetta del ruolo è una descrizione del compito,
 * sta in `channel_guests.role` e lì resta). Il terzo lato è il database, e non
 * si chiude da qui: la 221 rende il trigger non influenzabile dai metadati.
 */
async function requireStaff(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin' && p?.role !== 'team') throw new Error('Permesso negato')
  return user.id
}

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
  let uid: string
  try { uid = await requireStaff() } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Permesso negato' }
  }
  const supabase = await createClient()

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
      { channel_id: channelId, email, full_name: fullName, role, guest_type: guestType, invited_by: uid, status: 'pending' },
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
    /* Niente `role` qui: `handle_new_user` lo copierebbe in `profiles.role`,
       che è il ruolo di autorizzazione. L'etichetta sta in `channel_guests.role`. */
    data: {
      full_name: fullName,
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
  try { await requireStaff() } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Permesso negato' }
  }
  const supabase = await createClient()

  const { error } = await supabase
    .from('channel_guests')
    .update({ status: 'revoked' })
    .eq('id', guestId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
