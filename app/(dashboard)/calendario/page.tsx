import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { CalendarioClient } from '@/components/calendario/CalendarioClient'
import type { Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function CalendarioPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  // Verità unica: profiles.google_connected (i token stanno in google_credentials).
  // Niente fallback al metadata: darebbe "connesso" a chi ha token vecchi lì ma
  // nessuna credenziale valida, e il calendario non sincronizzerebbe.
  const meProfile = await getSessionProfile()
  const isGoogleConnected = Boolean(meProfile?.google_connected)

  const [meetingsRes, profilesRes] = await Promise.all([
    supabase.from('meetings')
      .select('id, title, meeting_date, duration_minutes, description')
      .gte('meeting_date', new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString())
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
