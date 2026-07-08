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

  const [{ data: profile }, { data: channels }, { data: allProfiles }, { data: clients }, { data: unreadData },
    { data: ownedTasks }, { data: assignedIds }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('chat_channels')
      .select('*')
      .in('type', ['interno', 'cliente_interno'])
      .order('last_message_at', { ascending: false, nullsFirst: false }),
    supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
    supabase.from('clients').select('id, company_name, package, client_label').order('company_name'),
    supabase.rpc('get_unread_counts', { p_user_id: user.id }),
    supabase.from('tasks').select('project_id').eq('assignee_id', user.id).neq('status', 'completato'),
    supabase.from('task_assignees').select('task_id').eq('profile_id', user.id),
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

  // Fetch progetti dell'utente via task assegnate
  const assignedTaskIds = (assignedIds ?? []).map((a: { task_id: string }) => a.task_id)
  let extraProjectIds: string[] = []
  if (assignedTaskIds.length > 0) {
    const { data } = await supabase.from('tasks').select('project_id').in('id', assignedTaskIds).neq('status', 'completato')
    extraProjectIds = (data ?? []).map((t: { project_id: string | null }) => t.project_id).filter(Boolean) as string[]
  }
  const ownedProjectIds = (ownedTasks ?? []).map((t: { project_id: string | null }) => t.project_id).filter(Boolean) as string[]
  const allProjectIds = Array.from(new Set([...ownedProjectIds, ...extraProjectIds]))

  let projects: Array<{ id: string; name: string; client_id: string; project_kind: string | null; client: { id: string; company_name: string } | null }> = []
  if (allProjectIds.length > 0) {
    const { data } = await supabase
      .from('projects')
      .select('id, name, client_id, project_kind, client:clients(id, company_name)')
      .in('id', allProjectIds)
      .eq('status', 'attivo')
      .order('name')
    projects = (data ?? []).map((p: { id: string; name: string; client_id: string; project_kind: string | null; client: unknown }) => ({
      id: p.id, name: p.name, client_id: p.client_id, project_kind: p.project_kind,
      client: p.client as { id: string; company_name: string } | null,
    }))
  }

  return (
    <div className="h-full">
      <ChatLayout
        channels={(channels ?? []) as ChatChannel[]}
        currentProfile={profile as Profile}
        allProfiles={(allProfiles ?? []) as Profile[]}
        clients={(clients ?? []) as Client[]}
        projects={projects}
        initialChannelId={channelId}
        unreadCounts={unreadCounts}
      />
    </div>
  )
}
