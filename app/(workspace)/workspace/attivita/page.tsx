import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MieAttivitaClient } from '@/components/tasks/MieAttivitaClient'
import type { Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function WorkspaceAttivitaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const taskSelect = `
    *,
    assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url),
    project:projects(id, name, client_id, clients(company_name))
  `

  const [ownedRes, assignedRes, profileRes, profilesRes] = await Promise.all([
    supabase.from('tasks').select(taskSelect)
      .eq('assignee_id', user.id)
      .is('parent_task_id', null)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('task_assignees').select('task_id').eq('profile_id', user.id)
      .then(async (r) => {
        if (r.error || !r.data?.length) return { data: [], error: null }
        const ids = r.data.map((a: { task_id: string }) => a.task_id)
        return supabase.from('tasks').select(taskSelect)
          .in('id', ids)
          .is('parent_task_id', null)
          .order('due_date', { ascending: true, nullsFirst: false })
      }),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true).order('full_name'),
  ])

  const ownedTasks = (ownedRes.data ?? []) as Parameters<typeof MieAttivitaClient>[0]['tasks']
  const assignedTasks = (assignedRes.data ?? []) as Parameters<typeof MieAttivitaClient>[0]['tasks']
  const seen = new Set(ownedTasks.map(t => t.id))
  const merged = [...ownedTasks, ...assignedTasks.filter(t => !seen.has(t.id))]

  return (
    <MieAttivitaClient
      tasks={merged}
      profile={profileRes.data as Profile}
      profiles={(profilesRes.data ?? []) as Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]}
    />
  )
}
