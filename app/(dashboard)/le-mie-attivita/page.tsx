import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MieAttivitaClient } from '@/components/tasks/MieAttivitaClient'
import type { Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function MieAttivitaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: tasks }, { data: profile }] = await Promise.all([
    supabase.from('tasks').select(`
      *,
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url),
      project:projects(id, name, client_id, clients(company_name))
    `)
    .eq('assignee_id', user.id)
    .is('parent_task_id', null)
    .order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
  ])

  return (
    <MieAttivitaClient
      tasks={(tasks ?? []) as Parameters<typeof MieAttivitaClient>[0]['tasks']}
      profile={profile as Profile}
    />
  )
}
