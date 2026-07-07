import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RisorsaTimesheet } from '@/components/risorsa/RisorsaTimesheet'

export const revalidate = 0

export default async function RisorsaTimesheetPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const monthStart = new Date(); monthStart.setDate(1)
  const from = monthStart.toISOString().slice(0, 10)

  const [entriesRes, tasksRes] = await Promise.all([
    sb.from('time_entries')
      .select('id, date, hours, note, project_id, task_id, category, projects(name)')
      .eq('profile_id', user.id).gte('date', from).order('date', { ascending: false }),
    sb.from('tasks')
      .select('id, title, project_id, project:projects(id, name)')
      .eq('assignee_id', user.id).neq('status', 'completato'),
  ])

  return (
    <RisorsaTimesheet
      profileId={user.id}
      initialEntries={(entriesRes.data ?? []) as never[]}
      myTasks={(tasksRes.data ?? []) as never[]}
    />
  )
}
