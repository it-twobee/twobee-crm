import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProgettiClient } from '@/components/progetti/ProgettiClient'

export const revalidate = 0

export default async function ProgettiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: projects }, { data: clients }, { data: profiles }, { data: me }] = await Promise.all([
    supabase
    .from('projects')
    .select(`
      *,
      clients(id, company_name, client_type, client_label, status),
      tasks(id, title, status, priority, due_date, assignee_id),
      sprints(id, name, status, end_date)
    `)
    .order('created_at', { ascending: false }),
    supabase.from('clients').select('id, company_name').order('company_name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('profiles').select('email, app_role, role').eq('id', user.id).single(),
  ])

  const isAdmin = (me as { role?: string } | null)?.role === 'admin'

  return (
    <ProgettiClient
      projects={(projects ?? []) as Parameters<typeof ProgettiClient>[0]['projects']}
      clients={(clients ?? []) as { id: string; company_name: string }[]}
      profiles={(profiles ?? []) as { id: string; full_name: string | null }[]}
      isAdmin={isAdmin}
    />
  )
}
