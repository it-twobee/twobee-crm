import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HRClient } from '@/components/hr/HRClient'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { Profile, TeamLeave, PerformanceReview, OrgUnit, OrgMember, ResourceProfile } from '@/lib/types/database'

export const revalidate = 0

export default async function HRPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['admin', 'manager'].includes(profile?.app_role ?? '')
  if (!isAdmin) redirect('/dashboard')

  const [profilesRes, leavesRes, reviewsRes, unitsRes, membersRes, rpRes] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('team_leaves').select('*').order('created_at', { ascending: false }),
    supabase.from('performance_reviews').select('*').order('created_at', { ascending: false }),
    supabase.from('org_units').select('*').order('position'),
    supabase.from('org_members').select('*'),
    supabase.from('resource_profiles').select('*'),
  ])

  return (
    <HRClient
      profiles={(profilesRes.data ?? []) as Profile[]}
      leaves={(leavesRes.data ?? []) as TeamLeave[]}
      reviews={(reviewsRes.data ?? []) as PerformanceReview[]}
      orgUnits={(unitsRes.data ?? []) as OrgUnit[]}
      orgMembers={(membersRes.data ?? []) as OrgMember[]}
      resourceProfiles={(rpRes.data ?? []) as ResourceProfile[]}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  )
}
