'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type InviteClientResult =
  | { success: true; userId: string; alreadyExisted: boolean }
  | { success: false; error: string }

function slug(s: string) {
  return s.toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Invita un contatto del cliente ad accedere al Portale Cliente.
 * Crea l'utente auth (role='client'), lo collega al client via
 * client_assignments e lo aggiunge come membro del canale customer_care.
 * Solo staff (admin/team) può invitare.
 */
export async function inviteClientToPortal(
  clientId: string,
  email: string,
  fullName: string,
): Promise<InviteClientResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { success: false, error: 'Non autenticato' }

  const { data: me } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin' && me?.role !== 'team') {
    return { success: false, error: 'Permesso negato' }
  }

  const admin = createAdminClient()
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''}/portale`

  // 1. Invita o recupera l'utente auth
  let userId: string | null = null
  let alreadyExisted = false

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: fullName, role: 'client' },
  })

  if (invited?.user) {
    userId = invited.user.id
  } else if (inviteErr) {
    // Utente già registrato: recupera l'id e rimanda un magic link
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: 'magiclink', email, options: { redirectTo },
    })
    if (linkData?.user) {
      userId = linkData.user.id
      alreadyExisted = true
    }
  }

  if (!userId) {
    return { success: false, error: inviteErr?.message ?? 'Impossibile creare l\'utente' }
  }

  // 2. Forza ruolo client sul profilo (il trigger lo crea, qui consolidiamo)
  await admin.from('profiles').update({
    role: 'client', app_role: 'client', full_name: fullName,
  }).eq('id', userId)

  // 3. Collega utente ↔ cliente (idempotente)
  await admin.from('client_assignments').upsert(
    { profile_id: userId, client_id: clientId },
    { onConflict: 'profile_id,client_id', ignoreDuplicates: true },
  )

  // 4. Assicura un canale customer_care e iscrivi il cliente
  const { data: client } = await admin.from('clients').select('company_name').eq('id', clientId).single()
  let { data: channel } = await admin.from('chat_channels')
    .select('id').eq('client_id', clientId).eq('type', 'customer_care').limit(1).maybeSingle()

  if (!channel) {
    const { data: created } = await admin.from('chat_channels')
      .insert({ name: `cc-${slug(client?.company_name ?? 'cliente')}`, type: 'customer_care', client_id: clientId, created_by: user.id })
      .select('id').single()
    channel = created
  }

  if (channel) {
    await admin.from('channel_members').upsert(
      { channel_id: channel.id, profile_id: userId },
      { onConflict: 'channel_id,profile_id', ignoreDuplicates: true },
    )
  }

  revalidatePath('/portale-cliente')
  revalidatePath(`/clienti/${clientId}`)
  return { success: true, userId, alreadyExisted }
}
