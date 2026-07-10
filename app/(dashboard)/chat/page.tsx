import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChatLayout } from '@/components/chat/ChatLayout'
import { ensureTeamChannels } from '@/app/actions/chat-dm'
import type { ChatChannel, Profile, Client } from '@/lib/types/database'

export const revalidate = 0

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { channel: channelId } = await searchParams

  const [{ data: profile }, { data: channels }, { data: allProfiles }, { data: clients }, { data: unreadData }, { data: projects }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('chat_channels').select('*').order('last_message_at', { ascending: false, nullsFirst: false }),
    supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
    supabase.from('clients').select('id, company_name, package, client_label').order('company_name'),
    supabase.rpc('get_unread_counts', { p_user_id: user.id }),
    supabase.from('projects').select('id, name, client_id, status, project_kind, client:clients(id, company_name)').order('name'),
  ])

  const unreadCounts: Record<string, number> = {}
  ;(unreadData ?? []).forEach((r: { channel_id: string; unread_count: number }) => {
    unreadCounts[r.channel_id] = Number(r.unread_count)
  })

  if (!profile) redirect('/login')

  // I canali team sono fissi: se mancano li creiamo (idempotente).
  // Non blocca il render se la migration 090 non è ancora stata applicata.
  try { await ensureTeamChannels() } catch { /* migration 090 mancante */ }

  const activeProjectIds = new Set(
    (projects ?? []).filter((p: { status: string }) => p.status === 'attivo').map((p: { id: string }) => p.id)
  )

  // I DM dell'utente: servono i canali a cui partecipa e chi è l'altra persona.
  let dmChannelIds: string[] = []
  const dmPeers: Record<string, string> = {}   // channel_id -> profile_id dell'altro
  const { data: myDms, error: dmErr } = await supabase
    .from('chat_dm_participants').select('channel_id').eq('profile_id', user.id)

  if (!dmErr && myDms && myDms.length > 0) {
    dmChannelIds = myDms.map((r: { channel_id: string }) => r.channel_id)
    const { data: peers } = await supabase
      .from('chat_dm_participants')
      .select('channel_id, profile_id')
      .in('channel_id', dmChannelIds)
      .neq('profile_id', user.id)
    for (const p of (peers ?? []) as { channel_id: string; profile_id: string }[]) {
      dmPeers[p.channel_id] = p.profile_id
    }
  }

  // La chat NON mostra più il customer care: quei canali restano in /customer-care.
  // Per progetto tiene un solo canale, quello interno di team.
  const CUSTOMER_CARE_TYPES = new Set(['customer_care', 'cliente', 'partner_customer_care'])

  const filteredChannels = (channels ?? []).filter((c: ChatChannel) => {
    if (CUSTOMER_CARE_TYPES.has(c.type)) return false
    if (c.type === 'dm') return dmChannelIds.includes(c.id)
    if (c.type === 'team') return true
    // legacy: canali interni senza cliente né progetto valgono come canali team
    if (c.type === 'interno' && !c.client_id && !c.project_id) return true
    if (c.project_id && activeProjectIds.has(c.project_id)) return true
    if (c.is_archived) return true
    return false
  })

  for (const ch of filteredChannels.filter((c: ChatChannel) => (c.type === 'interno' || c.type === 'team') && !c.client_id)) {
    await supabase.from('channel_members').upsert(
      { channel_id: ch.id, profile_id: user.id },
      { onConflict: 'channel_id,profile_id', ignoreDuplicates: true }
    )
  }

  return (
    <div className="h-full">
      <ChatLayout
        channels={filteredChannels as ChatChannel[]}
        currentProfile={profile as Profile}
        allProfiles={(allProfiles ?? []) as Profile[]}
        clients={(clients ?? []) as Client[]}
        projects={(projects ?? []).filter((p: { status: string }) => p.status === 'attivo') as unknown as Array<{ id: string; name: string; client_id: string; project_kind: string | null; client: { id: string; company_name: string } | null }>}
        initialChannelId={channelId}
        unreadCounts={unreadCounts}
        dmPeers={dmPeers}
      />
    </div>
  )
}
