import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ProjectDetailClient } from '@/components/projects/ProjectDetailClient'
import { ProjectEconomics } from '@/components/projects/ProjectEconomics'
import type { RevenueStream, Installment } from '@/lib/revenue'
import type {
  Project, ProjectWorkstream, Milestone, Task, RecurringTaskTemplate,
} from '@/lib/types/database'

export const revalidate = 0

export default async function ProjectDetailPage({ params, searchParams }: { params: { projectId: string }; searchParams: { tab?: string } }) {
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

  // Economics: solo admin, e degrada in silenzio se la 164/165 non è applicata
  const { data: streams, error: streamErr } = await supabase
    .from('revenue_streams').select('*').eq('project_id', params.projectId).order('created_at')
  const { data: installments } = streamErr || !(streams ?? []).length
    ? { data: [] }
    : await supabase.from('revenue_installments')
        .select('*').in('stream_id', (streams ?? []).map(s => s.id)).order('due_month')
  const { data: services } = streamErr
    ? { data: [] }
    : await supabase.from('service_catalog')
        .select('id, service_type, service_subtype, label, standard_price, price_unit')
        .eq('is_active', true).order('area').order('sort_order')

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
      initialTab={searchParams.tab === 'workstream' ? 'workstream' : searchParams.tab === 'economics' ? 'economics' : undefined}
      economics={streamErr ? undefined : (
        <ProjectEconomics
          projectId={params.projectId}
          projectKind={project.area === 'digital' ? 'digital' : 'growth'}
          projectStart={project.start_date}
          projectEnd={project.target_end_date}
          streams={(streams ?? []) as RevenueStream[]}
          installments={(installments ?? []) as Installment[]}
          services={(services ?? []) as never}
          profiles={(profiles ?? []) as { id: string; full_name: string }[]}
          canEdit
        />
      )}
    />
  )
}
