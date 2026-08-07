import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { WorkstreamPageClient } from '@/components/projects/WorkstreamPageClient'
import type { Project, ProjectWorkstream, Milestone, Task, RecurringTaskTemplate } from '@/lib/types/database'

export const revalidate = 0

export default async function WorkstreamPage({
  params, searchParams,
}: {
  params: { projectId: string; wsId: string }
  searchParams: { ms?: string }
}) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const profile = await getSessionProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: ws } = await supabase.from('project_workstreams').select('*').eq('id', params.wsId).single()
  if (!ws || ws.project_id !== params.projectId) notFound()

  const [{ data: project }, { data: milestones }, { data: tasks }, { data: recurring }, { data: profiles }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', params.projectId).single(),
    supabase.from('milestones').select('*').eq('workstream_id', params.wsId).order('sort_order'),
    supabase.from('tasks').select('*').eq('workstream_id', params.wsId).is('deleted_at', null).order('created_at'),
    supabase.from('recurring_task_templates').select('*').eq('workstream_id', params.wsId).order('created_at'),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true).order('full_name'),
  ])
  if (!project) notFound()

  return (
    <WorkstreamPageClient
      project={project as Project}
      ws={ws as ProjectWorkstream}
      milestones={(milestones ?? []) as Milestone[]}
      tasks={(tasks ?? []) as Task[]}
      recurring={(recurring ?? []) as RecurringTaskTemplate[]}
      profiles={(profiles ?? []) as { id: string; full_name: string; avatar_url: string | null }[]}
      canEdit
      backHref={`/progetti/${params.projectId}`}
      focusMilestoneId={searchParams.ms ?? null}
    />
  )
}
