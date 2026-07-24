import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ProjectDetailClient } from '@/components/projects/ProjectDetailClient'
import type {
  Project, ProjectWorkstream, Milestone, Task, RecurringTaskTemplate,
} from '@/lib/types/database'

export const revalidate = 0

export default async function ProjectDetailPage({ params }: { params: { projectId: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: project } = await supabase
    .from('projects').select('*').eq('id', params.projectId).is('deleted_at', null).single()
  if (!project) notFound()

  const [
    { data: client }, { data: workstreams }, { data: milestones },
    { data: tasks }, { data: recurring }, { data: members }, { data: profiles },
  ] = await Promise.all([
    supabase.from('clients').select('id, company_name, display_name').eq('id', project.client_id).single(),
    supabase.from('project_workstreams').select('*').eq('project_id', params.projectId).order('sort_order'),
    supabase.from('milestones').select('*').eq('project_id', params.projectId).order('sort_order'),
    supabase.from('tasks').select('*').eq('project_id', params.projectId).is('deleted_at', null).order('created_at'),
    supabase.from('recurring_task_templates').select('*').eq('project_id', params.projectId).order('created_at'),
    supabase.from('project_members').select('profile_id, role_in_project').eq('project_id', params.projectId),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true),
  ])

  const memberIds = (members ?? []).map(m => m.profile_id)

  return (
    <ProjectDetailClient
      project={project as Project}
      clientName={(client?.display_name || client?.company_name) ?? '—'}
      workstreams={(workstreams ?? []) as ProjectWorkstream[]}
      milestones={(milestones ?? []) as Milestone[]}
      tasks={(tasks ?? []) as Task[]}
      recurring={(recurring ?? []) as RecurringTaskTemplate[]}
      memberIds={memberIds}
      profiles={(profiles ?? []) as { id: string; full_name: string; avatar_url: string | null }[]}
    />
  )
}
