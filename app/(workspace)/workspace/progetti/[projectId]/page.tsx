import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { ProjectDetailClient } from '@/components/projects/ProjectDetailClient'
import type {
  Project, ProjectWorkstream, Milestone, Task, RecurringTaskTemplate,
} from '@/lib/types/database'

export const revalidate = 0

export default async function WorkspaceProjectDetailPage({ params, searchParams }: { params: { projectId: string }; searchParams: { tab?: string } }) {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'team' && profile.role !== 'admin') redirect('/workspace')
  const supabase = await createClient()
  const userId = profile.id

  // Il cliente arriva in join col progetto, così l'intera pagina è un solo
  // giro: prima il progetto si leggeva da solo e tutto il resto aspettava.
  // RLS: se l'utente non può vederlo, single() torna vuoto → 404
  const [
    { data: project }, { data: workstreams }, { data: milestones },
    { data: tasks }, { data: recurring }, { data: members }, { data: profiles },
  ] = await Promise.all([
    supabase.from('projects')
      .select('*, client:clients(id, company_name, display_name)')
      .eq('id', params.projectId).is('deleted_at', null).maybeSingle(),
    supabase.from('project_workstreams').select('*').eq('project_id', params.projectId).order('sort_order'),
    supabase.from('milestones').select('*').eq('project_id', params.projectId).order('sort_order'),
    supabase.from('tasks').select('*').eq('project_id', params.projectId).is('deleted_at', null).order('created_at'),
    supabase.from('recurring_task_templates').select('*').eq('project_id', params.projectId).order('created_at'),
    supabase.from('project_members').select('profile_id, role_in_project').eq('project_id', params.projectId),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true),
  ])

  if (!project) notFound()
  const client = (project as { client?: { company_name: string; display_name: string | null } | null }).client ?? null

  const memberIds = (members ?? []).map(m => m.profile_id)
  const isMemberManager = (members ?? []).some(m => m.profile_id === userId && m.role_in_project === 'manager')
  const canManageProject = profile.role === 'admin'
    || (profile.app_role === 'manager' && (project.manager_id === userId || isMemberManager))

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
      backHref="/workspace/progetti"
      canManageProject={canManageProject}
      canEditTasks
      initialTab={searchParams.tab === 'workstream' ? 'workstream' : undefined}
    />
  )
}
