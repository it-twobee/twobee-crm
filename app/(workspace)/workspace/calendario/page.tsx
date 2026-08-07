import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { CalendarioClient } from '@/components/calendario/CalendarioClient'
import type { Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function WorkspaceCalendarioPage() {
  // Verità unica: profiles.google_connected. I token veri stanno in
  // google_credentials, mai leggibili dal client. Niente fallback al metadata.
  // Il profilo è quello già letto dal layout, non una query in più.
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  const supabase = await createClient()
  const isGoogleConnected = Boolean(profile.google_connected)

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
      currentUserId={profile.id}
    />
  )
}
