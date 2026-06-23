import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OperativaClient } from '@/components/operativa/OperativaClient'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { Profile, Task, Client, TaskTemplate } from '@/lib/types/database'

export const revalidate = 0

export default async function OperativaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const canAccess = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['admin', 'manager'].includes(profile?.app_role ?? '')
  if (!canAccess) redirect('/dashboard')

  const [{ data: profiles }, { data: tasks }, { data: clients }, { data: templates }] = await Promise.all([
    supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
    supabase.from('tasks').select(`
      *,
      assignee:profiles!tasks_assignee_id_fkey(id,full_name,avatar_url),
      project:projects(id,name,client_id)
    `).neq('status', 'completato').order('due_date').limit(200),
    supabase.from('clients').select('id,company_name,client_type').order('company_name'),
    supabase.from('task_templates').select('*').order('name').then(r => r.error ? { data: [] } : r),
  ])

  return (
    <OperativaClient
      profiles={(profiles ?? []) as Profile[]}
      tasks={(tasks ?? []) as Task[]}
      clients={(clients ?? []) as Pick<Client, 'id' | 'company_name' | 'client_type'>[]}
      templates={(templates ?? []) as TaskTemplate[]}
      currentUserId={user.id}
    />
  )
}
