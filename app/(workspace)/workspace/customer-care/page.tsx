import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CustomerCareClient } from '@/components/customer-care/CustomerCareClient'
import type { Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function WorkspaceCustomerCarePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: allProfiles }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('profiles').select('*').order('full_name'),
  ])

  // Carica progetti con cliente + canali collegati
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      id, name, status, client_id,
      client:clients(id, company_name, client_label),
      channels:chat_channels(*)
    `)
    .eq('status', 'attivo')
    .order('name')

  const projectList = (projects ?? []) as unknown as Array<{
    id: string; name: string; status: string; client_id: string
    client: { id: string; company_name: string; client_label: string } | null
    channels: Array<{ id: string; type: string; name: string; last_message_at: string | null; [key: string]: unknown }>
  }>

  const channelIds = projectList.flatMap(p => p.channels.map(ch => ch.id))

  // Conti messaggi per i canali CC
  const [{ data: msgCounts }, { data: recentMsgCounts }, { data: allAccounts }] = await Promise.all([
    channelIds.length > 0
      ? supabase.rpc('get_cc_message_counts', { p_client_ids: projectList.map(p => p.client_id) })
      : Promise.resolve({ data: [] }),
    channelIds.length > 0
      ? supabase.rpc('get_cc_recent_message_counts', { p_client_ids: projectList.map(p => p.client_id) })
      : Promise.resolve({ data: [] }),
    supabase.from('client_accounts').select('*').in('client_id', projectList.map(p => p.client_id)),
  ])

  const projectsWithData = projectList.map(p => {
    const ccChannel = p.channels.find(ch => ch.type === 'customer_care') ?? null
    const channelId = ccChannel?.id
    return {
      ...p,
      customer_care_channel: ccChannel,
      internal_channel: p.channels.find(ch => ch.type === 'cliente_interno') ?? null,
      accounts: (allAccounts ?? []).filter((a: { client_id: string }) => a.client_id === p.client_id),
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
        projects={projectsWithData as Parameters<typeof CustomerCareClient>[0]['projects']}
        currentProfile={profile as Profile}
        allProfiles={(allProfiles ?? []) as Profile[]}
      />
    </div>
  )
}
