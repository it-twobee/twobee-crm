import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChatLayout } from '@/components/chat/ChatLayout'
import type { ChatChannel, Profile, Client } from '@/lib/types/database'

export const revalidate = 0

export default async function WorkspaceChatPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { channel: channelId } = await searchParams

  const [{ data: profile }, { data: channels }, { data: allProfiles }, { data: clients }, { data: unreadData }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('chat_channels')
      .select('*')
      .in('type', ['interno', 'cliente_interno'])
      .order('last_message_at', { ascending: false, nullsFirst: false }),
    supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
    supabase.from('clients').select('id, company_name, package, client_label').order('company_name'),
    supabase.rpc('get_unread_counts', { p_user_id: user.id }),
  ])

  if (!profile) redirect('/login')

  const unreadCounts: Record<string, number> = {}
  ;(unreadData ?? []).forEach((r: { channel_id: string; unread_count: number }) => {
    unreadCounts[r.channel_id] = Number(r.unread_count)
  })

  // Auto-join canali interni globali
  for (const ch of (channels ?? []).filter((c: ChatChannel) => c.type === 'interno' && !c.client_id)) {
    await supabase.from('channel_members').upsert(
      { channel_id: ch.id, profile_id: user.id },
      { onConflict: 'channel_id,profile_id', ignoreDuplicates: true }
    )
  }

  return (
    <div className="h-full">
      <ChatLayout
        channels={(channels ?? []) as ChatChannel[]}
        currentProfile={profile as Profile}
        allProfiles={(allProfiles ?? []) as Profile[]}
        clients={(clients ?? []) as Client[]}
        projects={[]}
        initialChannelId={channelId}
        unreadCounts={unreadCounts}
      />
    </div>
  )
}
