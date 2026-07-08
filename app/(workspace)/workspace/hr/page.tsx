import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WorkspaceHR } from '@/components/workspace/WorkspaceHR'
import type { HrRequest } from '@/lib/types/database'

export const revalidate = 0

export default async function WorkspaceHRPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: requests } = await supabase
    .from('hr_requests')
    .select('*')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <WorkspaceHR
      requests={(requests ?? []) as HrRequest[]}
      profileId={user.id}
    />
  )
}
