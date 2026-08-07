import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
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
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'team' && profile.role !== 'admin') redirect('/workspace')
  const supabase = await createClient()
  const userId = profile.id

  // Tutto chiave su wsId/projectId dell'indirizzo: il workstream non deve
  // arrivare per primo perché gli altri partano, basta controllarlo dopo.
  const [{ data: ws }, { data: project }, { data: milestones }, { data: tasks }, { data: recurring }, { data: profiles }, { data: members }] = await Promise.all([
    supabase.from('project_workstreams').select('*').eq('id', params.wsId).maybeSingle(),
    supabase.from('projects').select('*').eq('id', params.projectId).maybeSingle(),
    supabase.from('milestones').select('*').eq('workstream_id', params.wsId).order('sort_order'),
    supabase.from('tasks').select('*').eq('workstream_id', params.wsId).is('deleted_at', null).order('created_at'),
    supabase.from('recurring_task_templates').select('*').eq('workstream_id', params.wsId).order('created_at'),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true).order('full_name'),
    supabase.from('project_members').select('profile_id, role_in_project').eq('project_id', params.projectId),
  ])
  if (!project || !ws || ws.project_id !== params.projectId) notFound()

  const isMemberManager = (members ?? []).some(m => m.profile_id === userId && m.role_in_project === 'manager')
  const canEdit = profile.role === 'admin' || (profile.app_role === 'manager' && (project.manager_id === userId || isMemberManager))

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
