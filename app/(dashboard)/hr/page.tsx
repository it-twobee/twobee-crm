import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { HRClient } from '@/components/hr/HRClient'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { Profile, TeamLeave, PerformanceReview, OrgUnit, OrgMember, ResourceProfile, HrRequest, Payslip } from '@/lib/types/database'
import { PROFILE_COLUMNS } from '@/lib/profile-columns'

export const revalidate = 0

export default async function HRPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const profile = await getSessionProfile()
  const isAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['admin', 'manager'].includes(profile?.app_role ?? '')
  if (!isAdmin) redirect('/dashboard')

  const [profilesRes, leavesRes, reviewsRes, unitsRes, membersRes, rpRes, hrReqRes, payslipsRes] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLUMNS).order('full_name'),
    supabase.from('team_leaves').select('*').order('created_at', { ascending: false }),
    supabase.from('performance_reviews').select('*').order('created_at', { ascending: false }),
    supabase.from('org_units').select('*').order('position'),
    supabase.from('org_members').select('*'),
    supabase.from('resource_profiles').select('*'),
    // le richieste che il team invia dal Workspace: tabella diversa da team_leaves
    supabase.from('hr_requests').select('*').order('created_at', { ascending: false }),
    /* §309 — le buste paga del team. Qui arriva **l'admin**, quindi le vede
       tutte; nel workspace la RLS owner-only fa vedere al dipendente solo le
       sue, e il file passa dal proxy autenticato in entrambi i casi. */
    supabase.from('payslips').select('*')
      .order('year', { ascending: false }).order('month', { ascending: false }),
  ])
  /* Senza la 088 la tabella non c'è: la tab resta vuota e il resto della pagina
     funziona identico. Un errore qui non deve portarsi via l'organigramma. */
  const payslips = (payslipsRes.error ? [] : payslipsRes.data ?? []) as Payslip[]

  return (
    <HRClient
      payslips={payslips}
      profiles={(profilesRes.data ?? []) as Profile[]}
      leaves={(leavesRes.data ?? []) as TeamLeave[]}
      reviews={(reviewsRes.data ?? []) as PerformanceReview[]}
      orgUnits={(unitsRes.data ?? []) as OrgUnit[]}
      orgMembers={(membersRes.data ?? []) as OrgMember[]}
      resourceProfiles={(rpRes.data ?? []) as ResourceProfile[]}
      hrRequests={(hrReqRes.data ?? []) as HrRequest[]}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  )
}
