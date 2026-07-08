import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WorkspaceHR } from '@/components/workspace/WorkspaceHR'
import type { HrRequest, VacationBalance } from '@/lib/types/database'

export const revalidate = 0

export default async function WorkspaceHRPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: requests }, { data: balanceRows }] = await Promise.all([
    supabase
      .from('hr_requests')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.rpc('get_vacation_balance', {
      p_profile_id: user.id,
      p_year: new Date().getFullYear(),
    }),
  ])

  const balance = Array.isArray(balanceRows) && balanceRows.length > 0
    ? (balanceRows[0] as VacationBalance)
    : null

  return (
    <WorkspaceHR
      requests={(requests ?? []) as HrRequest[]}
      profileId={user.id}
      vacationBalance={balance}
    />
  )
}
