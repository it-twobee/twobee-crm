import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DecisionCenterClient } from '@/components/direzione/DecisionCenterClient'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { Decision } from '@/lib/types/database'

export const revalidate = 0

export default async function DecisionCenterPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isFounder = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['super_admin', 'founder'].includes(profile?.app_role ?? '')
  if (!isFounder) redirect('/dashboard')

  const { data: decisions } = await supabase.from('decisions').select('*').order('created_at', { ascending: false })

  return (
    <DecisionCenterClient
      decisions={(decisions ?? []) as Decision[]}
      currentUserId={user.id}
    />
  )
}
