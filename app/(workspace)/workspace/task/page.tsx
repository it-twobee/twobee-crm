import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TaskHub } from '@/components/tasks/TaskHub'
import type { Profile, Client } from '@/lib/types/database'

export const revalidate = 0

export default async function WorkspaceTaskPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: tasks },
    { data: profiles },
    { data: clients },
  ] = await Promise.all([
    supabase.from('tasks').select(`
      *,
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url),
      project:projects(id, name, client_id, clients(company_name))
    `).is('parent_task_id', null).order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').in('role', ['admin', 'team']).order('full_name'),
    supabase.from('clients').select('*').order('company_name'),
  ])

  return (
    <TaskHub
      tasks={(tasks ?? []) as Parameters<typeof TaskHub>[0]['tasks']}
      profiles={(profiles ?? []) as Profile[]}
      clients={(clients ?? []) as Client[]}
    />
  )
}
