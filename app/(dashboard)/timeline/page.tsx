import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TimelineClient } from '@/components/progetti/TimelineClient'

export const revalidate = 0

export default async function TimelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [tasksRes, projectsRes] = await Promise.all([
    supabase.from('tasks').select(`
      id, title, due_date, status, priority, is_milestone, project_id,
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url),
      project:projects(id, name, client_id, status, clients(company_name))
    `)
    .not('due_date', 'is', null)
    .is('parent_task_id', null)
    .order('due_date'),
    supabase.from('projects').select(`
      id, name, status, start_date, end_date, client_id,
      clients(company_name)
    `).in('status', ['attivo', 'pianificato']).order('start_date'),
  ])

  return (
    <TimelineClient
      tasks={(tasksRes.data ?? []) as unknown as Parameters<typeof TimelineClient>[0]['tasks']}
      projects={(projectsRes.data ?? []) as unknown as Parameters<typeof TimelineClient>[0]['projects']}
    />
  )
}
