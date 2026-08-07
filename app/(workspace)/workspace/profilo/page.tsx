import { getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ProfiloClient } from '@/components/workspace/ProfiloClient'
import type { Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function ProfiloPage() {
  // Una lettura sola, già fatta dal layout: colonne esplicite (`select('*')`
  // porterebbe monthly_cost fino al client) e dentro c'è google_connected — i
  // token veri stanno in google_credentials, deny-all, e qui basta il flag.
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')

  return <ProfiloClient profile={profile as Profile} googleConnected={Boolean(profile.google_connected)} />
}
