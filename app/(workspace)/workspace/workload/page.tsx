import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isSuperAdminRaw, isAdminRole } from '@/lib/permissions'
import { fetchWorkloadData } from '@/lib/workload-data'
import { WorkloadClient } from '@/components/workload/WorkloadClient'

export const revalidate = 0

export default async function WorkspaceWorkloadPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await sb
    .from('profiles').select('email, app_role, role').eq('id', user.id).single()
  const isAdmin = isSuperAdminRaw(me?.email, me?.app_role) || isAdminRole(me?.app_role) || me?.role === 'admin'
  const isManager = me?.app_role === 'manager'

  // La risorsa vede solo i progetti su cui lavora o che gestisce (restrictToUserId).
  // Admin e manager vedono tutto anche da qui.
  const restrict = (isAdmin || isManager) ? null : user.id
  const data = await fetchWorkloadData(sb, user.id, restrict)

  return (
    <WorkloadClient
      {...data}
      canEditAll={isAdmin || isManager}
      title="Workload"
      subtitle={restrict
        ? 'I tuoi progetti in parallelo, effort e timeline'
        : 'Progetti in parallelo, effort e timeline di tutto il team'}
    />
  )
}
