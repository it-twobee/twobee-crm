'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

export async function deleteClient(clientId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase.from('profiles').select('email, app_role').eq('id', user.id).single()
  if (!profile) return { error: 'Profilo non trovato' }

  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(profile.email ?? '')
  const isAdmin = isSuperAdmin || profile.app_role === 'admin'
  if (!isAdmin) return { error: 'Permesso negato: solo gli admin possono eliminare clienti' }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Elimina manualmente i record con FK senza ON DELETE CASCADE applicato in produzione.
  // L'ordine conta: prima i figli dei canali, poi i canali, poi il cliente.
  const channelsRes = await adminClient.from('chat_channels').select('id').eq('client_id', clientId)
  const channelIds = (channelsRes.data ?? []).map((r: { id: string }) => r.id)

  if (channelIds.length > 0) {
    await adminClient.from('channel_members').delete().in('channel_id', channelIds)
    await adminClient.from('messages').delete().in('channel_id', channelIds)
    await adminClient.from('chat_channels').delete().in('id', channelIds)
  }

  const { error } = await adminClient.from('clients').delete().eq('id', clientId)
  if (error) return { error: error.message }

  return { error: null }
}
