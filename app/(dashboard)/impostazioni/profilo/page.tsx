import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfiloClient } from '@/components/impostazioni/ProfiloClient'
import type { Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function ProfiloPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  return <ProfiloClient profile={profile as Profile} userEmail={user.email ?? ''} />
}
