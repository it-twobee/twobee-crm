import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { ProjectPageClient, type ProjectComment } from '@/components/projects/ProjectPageClient'
import type { Client, Project, Sprint, Task, ClientKpi, ClientKpiConfig, Profile, MeetingNote, ProjectAppointment } from '@/lib/types/database'

export const revalidate = 0

interface Props {
  params: Promise<{ projectId: string }>
}

export default async function WorkspaceProgettoPage({ params }: Props) {
  const { projectId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: project }, { data: currentProfile }, { data: allProfiles }] = await Promise.all([
    supabase.from('projects').select('*, client:clients(*)').eq('id', projectId).single(),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('profiles').select('*').order('full_name'),
  ])

  if (!project) notFound()

  const client = (project as unknown as { client: Client }).client
  const clientId = project.client_id

  const [
    { data: tasks },
    { data: sprints },
    { data: kpis },
    { data: kpiConfigs },
    { data: comments },
    { data: appointments },
    { data: meetings },
  ] = await Promise.all([
    supabase.from('tasks').select('*').eq('project_id', projectId).order('order', { ascending: true }),
    supabase.from('sprints').select('*').eq('project_id', projectId).order('start_date'),
    supabase.from('client_kpis').select('*').eq('client_id', clientId).eq('project_id', projectId).order('month', { ascending: false }),
    supabase.from('client_kpi_config').select('*').eq('client_id', clientId).eq('project_id', projectId),
    supabase.from('project_comments').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
    supabase.from('project_appointments').select('*').eq('project_id', projectId).order('date', { ascending: true }),
    supabase.from('meeting_notes').select('*').eq('project_id', projectId).order('date', { ascending: false }),
  ])

  return (
    <ProjectPageClient
      client={client as Client}
      project={project as unknown as Project}
      tasks={(tasks ?? []) as Task[]}
      sprints={(sprints ?? []) as Sprint[]}
      kpis={(kpis ?? []) as ClientKpi[]}
      kpiConfig={(kpiConfigs ?? [])[0] ?? null}
      currentProfile={currentProfile as Profile}
      allProfiles={(allProfiles ?? []) as Profile[]}
      comments={(comments ?? []) as ProjectComment[]}
      appointments={(appointments ?? []) as ProjectAppointment[]}
      meetings={(meetings ?? []) as MeetingNote[]}
    />
  )
}
