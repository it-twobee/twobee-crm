import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TrackingList } from '@/components/tracking/TrackingList'
import { loadTrackingOverview } from '@/lib/tracking/overview'

export const revalidate = 0

export default async function WorkspaceTrackingPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'team' && profile.role !== 'admin') redirect('/workspace')
  const supabase = await createClient()
  // clients_workspace = VIEW senza dati economici, filtrata per chi guarda
  const { rows, lastRun } = await loadTrackingOverview(supabase, 'clients_workspace')
  return <TrackingList rows={rows} lastRun={lastRun} clientBase="/workspace/clienti" />
}
