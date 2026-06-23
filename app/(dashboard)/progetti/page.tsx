import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProgettiClient } from '@/components/progetti/ProgettiClient'

export const revalidate = 0

export default async function ProgettiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projects } = await supabase
    .from('projects')
    .select(`
      *,
      clients(id, company_name, client_type, client_label, status),
      tasks(id, title, status, priority, due_date, assignee_id),
      sprints(id, name, status, end_date)
    `)
    .order('created_at', { ascending: false })

  return <ProgettiClient projects={(projects ?? []) as Parameters<typeof ProgettiClient>[0]['projects']} />
}
