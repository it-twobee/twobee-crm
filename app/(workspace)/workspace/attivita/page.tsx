import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MyTasksClient } from '@/components/workspace/MyTasksClient'
import type { Task } from '@/lib/types/database'

export const revalidate = 0

export default async function MieAttivitaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'team' && profile?.role !== 'admin') redirect('/workspace')

  // task in cui sono assegnatario (primario via assignee_id o in task_assignees)
  const { data: ta } = await supabase.from('task_assignees').select('task_id').eq('profile_id', user.id)
  const ids = Array.from(new Set((ta ?? []).map(r => r.task_id)))

  const orFilter = ids.length ? `assignee_id.eq.${user.id},id.in.(${ids.join(',')})` : `assignee_id.eq.${user.id}`
  const { data: tasks } = await supabase
    .from('tasks').select('*').is('deleted_at', null).or(orFilter).order('due_date', { ascending: true, nullsFirst: false })

  const projectIds = Array.from(new Set((tasks ?? []).map(t => t.project_id).filter(Boolean))) as string[]
  const clientIds = Array.from(new Set((tasks ?? []).map(t => t.client_id)))

  const [{ data: projects }, { data: clients }, { data: profiles }] = await Promise.all([
    projectIds.length ? supabase.from('projects').select('id, name').in('id', projectIds) : Promise.resolve({ data: [] }),
    clientIds.length ? supabase.from('clients').select('id, company_name, display_name').in('id', clientIds) : Promise.resolve({ data: [] }),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true),
  ])

  const projectName: Record<string, string> = {}
  ;(projects ?? []).forEach(p => { projectName[p.id] = p.name })
  const clientName: Record<string, string> = {}
  ;(clients ?? []).forEach(c => { clientName[c.id] = c.display_name || c.company_name })

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-text-primary mb-1">Le mie attività</h1>
      <p className="text-sm text-text-secondary mb-5">Task assegnate a te, da tutti i progetti e ad hoc.</p>
      <MyTasksClient
        tasks={(tasks ?? []) as Task[]}
        profiles={(profiles ?? []) as { id: string; full_name: string; avatar_url: string | null }[]}
        projectName={projectName}
        clientName={clientName}
      />
    </div>
  )
}
