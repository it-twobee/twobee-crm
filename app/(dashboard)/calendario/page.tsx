import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CalendarioClient } from '@/components/calendario/CalendarioClient'
import type { Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function CalendarioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verità unica: profiles.google_connected (i token stanno in google_credentials).
  // Niente fallback al metadata: darebbe "connesso" a chi ha token vecchi lì ma
  // nessuna credenziale valida, e il calendario non sincronizzerebbe.
  const { data: meProfile } = await supabase
    .from('profiles').select('google_connected').eq('id', user.id).maybeSingle()
  const isGoogleConnected = Boolean(meProfile?.google_connected)

  const [meetingsRes, tasksRes, profilesRes] = await Promise.all([
    supabase.from('meetings')
      .select('id, title, meeting_date, duration_minutes, description')
      .gte('meeting_date', new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString())
      .order('meeting_date'),
    supabase.from('tasks')
      .select(`id, title, due_date, status, priority, assignee_id,
        assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url),
        project:projects(id, name, clients(company_name))`)
      .not('due_date', 'is', null)
      .neq('status', 'completato')
      .gte('due_date', new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10))
      .order('due_date'),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true).order('full_name'),
  ])

  return (
    <CalendarioClient
      isGoogleConnected={isGoogleConnected}
      localMeetings={meetingsRes.data ?? []}
      tasks={(tasksRes.data ?? []) as unknown as Parameters<typeof CalendarioClient>[0]['tasks']}
      profiles={(profilesRes.data ?? []) as unknown as Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]}
      currentUserId={user.id}
    />
  )
}
