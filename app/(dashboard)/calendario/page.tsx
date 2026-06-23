import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CalendarioClient } from '@/components/calendario/CalendarioClient'

export const revalidate = 0

export default async function CalendarioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isGoogleConnected = !!user.user_metadata?.google_access_token

  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, meeting_date, duration_minutes, description')
    .gte('meeting_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
    .order('meeting_date')

  return (
    <CalendarioClient
      isGoogleConnected={isGoogleConnected}
      localMeetings={meetings ?? []}
    />
  )
}
