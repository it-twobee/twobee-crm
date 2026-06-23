import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ProjectPageClient, type ProjectComment } from '@/components/projects/ProjectPageClient'
import type { Client, Project, Sprint, Task, ClientKpi, ClientKpiConfig, Profile, MeetingNote, ProjectAppointment } from '@/lib/types/database'

export const revalidate = 0

interface Props {
  params: Promise<{ id: string; projectId: string }>
}

export default async function ProgettoPage({ params }: Props) {
  const { id: clientId, projectId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const [
    { data: client },
    { data: project },
    { data: currentProfile },
    { data: allProfiles },
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).single(),
    supabase.from('projects').select('*').eq('id', projectId).eq('client_id', clientId).single(),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('profiles').select('*').order('full_name'),
  ])

  if (!client || !project) notFound()

  const [
    { data: tasks },
    { data: sprints },
    { data: kpis },
    { data: kpiConfigs },
    { data: comments },
    { data: appointments },
    { data: meetings },
  ] = await Promise.all([
    supabase.from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('order', { ascending: true }),
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
      project={project as Project}
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
