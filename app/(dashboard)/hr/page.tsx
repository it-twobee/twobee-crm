import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HRClient } from '@/components/hr/HRClient'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { Profile, TeamLeave, PerformanceReview } from '@/lib/types/database'

export const revalidate = 0

export default async function HRPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['admin', 'manager'].includes(profile?.app_role ?? '')
  if (!isAdmin) redirect('/dashboard')

  const [profilesRes, leavesRes, reviewsRes] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('team_leaves').select('*').order('created_at', { ascending: false }),
    supabase.from('performance_reviews').select('*').order('created_at', { ascending: false }),
  ])

  return (
    <HRClient
      profiles={(profilesRes.data ?? []) as Profile[]}
      leaves={(leavesRes.data ?? []) as TeamLeave[]}
      reviews={(reviewsRes.data ?? []) as PerformanceReview[]}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  )
}
