import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CalendarioClient } from '@/components/calendario/CalendarioClient'
import type { Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function WorkspaceCalendarioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verità unica: profiles.google_connected. I token veri stanno in
  // google_credentials, mai leggibili dal client. Niente fallback al metadata.
  const { data: flag } = await supabase
    .from('profiles').select('google_connected').eq('id', user.id).maybeSingle()
  const isGoogleConnected = Boolean(flag?.google_connected)

  const startDate = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString()

  const [meetingsRes, profilesRes] = await Promise.all([
    supabase.from('meetings')
      .select('id, title, meeting_date, duration_minutes, description')
      .gte('meeting_date', startDate)
      .order('meeting_date'),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true).order('full_name'),
  ])

  return (
    <CalendarioClient
      isGoogleConnected={isGoogleConnected}
      localMeetings={meetingsRes.data ?? []}
      profiles={(profilesRes.data ?? []) as unknown as Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]}
      currentUserId={user.id}
    />
  )
}
