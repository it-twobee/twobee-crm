import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CustomerCareClient } from '@/components/customer-care/CustomerCareClient'
import type { Profile, ChatChannel } from '@/lib/types/database'

export const revalidate = 0

export default async function CustomerCarePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: allProfiles }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('profiles').select('*').order('full_name'),
  ])

  // Il Customer Care è ancorato al cliente: un canale `customer_care` per cliente.
  const { data: clients } = await supabase
    .from('clients')
    .select('id, company_name, display_name, client_label')
    .neq('client_label', 'perso')
    .order('company_name')

  const clientList = (clients ?? []) as Array<{
    id: string; company_name: string; display_name: string | null; client_label: string
  }>
  const clientIds = clientList.map(c => c.id)

  const [{ data: channels }, { data: msgCounts }, { data: recentMsgCounts }, { data: allAccounts }] = await Promise.all([
    clientIds.length > 0
      ? supabase.from('chat_channels').select('*').in('client_id', clientIds).eq('type', 'customer_care')
      : Promise.resolve({ data: [] }),
    clientIds.length > 0
      ? supabase.rpc('get_cc_message_counts', { p_client_ids: clientIds })
      : Promise.resolve({ data: [] }),
    clientIds.length > 0
      ? supabase.rpc('get_cc_recent_message_counts', { p_client_ids: clientIds })
      : Promise.resolve({ data: [] }),
    clientIds.length > 0
      ? supabase.from('client_accounts').select('*').in('client_id', clientIds)
      : Promise.resolve({ data: [] }),
  ])

  const channelList = (channels ?? []) as ChatChannel[]

  const rows = clientList.map(c => {
    const ccChannel = channelList.find(ch => ch.client_id === c.id) ?? null
    const channelId = ccChannel?.id
    return {
      id: c.id,
      name: c.display_name ?? c.company_name,
      status: 'attivo',
      client_id: c.id,
      client: { id: c.id, company_name: c.company_name, client_label: c.client_label },
      customer_care_channel: ccChannel,
      internal_channel: null,
      accounts: (allAccounts ?? []).filter((a: { client_id: string }) => a.client_id === c.id),
      total_messages: channelId
        ? ((msgCounts ?? []) as { channel_id: string; count: number }[]).find(r => r.channel_id === channelId)?.count ?? 0
        : 0,
      recent_messages: channelId
        ? ((recentMsgCounts ?? []) as { channel_id: string; count: number }[]).find(r => r.channel_id === channelId)?.count ?? 0
        : 0,
    }
  })

  return (
    <div className="h-full">
      <CustomerCareClient
        projects={rows as Parameters<typeof CustomerCareClient>[0]['projects']}
        currentProfile={profile as Profile}
        allProfiles={(allProfiles ?? []) as Profile[]}
      />
    </div>
  )
}
