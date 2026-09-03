import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TrackingList } from '@/components/tracking/TrackingList'
import { loadTrackingOverview } from '@/lib/tracking/overview'

export const revalidate = 0

export default async function TrackingPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/workspace/tracking')
  const supabase = await createClient()
  const { rows, lastRun } = await loadTrackingOverview(supabase, 'clients')
  return <TrackingList rows={rows} lastRun={lastRun} clientBase="/clienti" settingsHref="/impostazioni/tracking" />
}
