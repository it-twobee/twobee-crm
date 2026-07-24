import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { WorkstreamPageClient } from '@/components/projects/WorkstreamPageClient'
import type { Project, ProjectWorkstream, Milestone, Task, RecurringTaskTemplate } from '@/lib/types/database'

export const revalidate = 0

export default async function WorkspaceWorkstreamPage({
  params, searchParams,
}: {
  params: { projectId: string; wsId: string }
  searchParams: { ms?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role, app_role').eq('id', user.id).single()
  if (profile?.role !== 'team' && profile?.role !== 'admin') redirect('/workspace')

  const { data: ws } = await supabase.from('project_workstreams').select('*').eq('id', params.wsId).single()
  if (!ws || ws.project_id !== params.projectId) notFound()

  const [{ data: project }, { data: milestones }, { data: tasks }, { data: recurring }, { data: profiles }, { data: members }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', params.projectId).single(),
    supabase.from('milestones').select('*').eq('workstream_id', params.wsId).order('sort_order'),
    supabase.from('tasks').select('*').eq('workstream_id', params.wsId).is('deleted_at', null).order('created_at'),
    supabase.from('recurring_task_templates').select('*').eq('workstream_id', params.wsId).order('created_at'),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true).order('full_name'),
    supabase.from('project_members').select('profile_id, role_in_project').eq('project_id', params.projectId),
  ])
  if (!project) notFound()

  const isMemberManager = (members ?? []).some(m => m.profile_id === user.id && m.role_in_project === 'manager')
  const canEdit = profile?.role === 'admin' || (profile?.app_role === 'manager' && (project.manager_id === user.id || isMemberManager))

  return (
    <WorkstreamPageClient
      project={project as Project}
      ws={ws as ProjectWorkstream}
      milestones={(milestones ?? []) as Milestone[]}
      tasks={(tasks ?? []) as Task[]}
      recurring={(recurring ?? []) as RecurringTaskTemplate[]}
      profiles={(profiles ?? []) as { id: string; full_name: string; avatar_url: string | null }[]}
      canEdit={canEdit}
      backHref={`/workspace/progetti/${params.projectId}`}
      focusMilestoneId={searchParams.ms ?? null}
    />
  )
}
