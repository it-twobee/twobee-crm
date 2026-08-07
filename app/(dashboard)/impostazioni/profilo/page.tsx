import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ProfiloClient } from '@/components/impostazioni/ProfiloClient'
import type { Profile } from '@/lib/types/database'
import { PROFILE_COLUMNS } from '@/lib/profile-columns'

export const revalidate = 0

export default async function ProfiloPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const profile = await getSessionProfile()
  return <ProfiloClient profile={profile as Profile} userEmail={user.email ?? ''} />
}
