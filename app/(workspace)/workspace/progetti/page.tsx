import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ProgettiClient } from '@/components/projects/ProgettiClient'
import type {
  ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode,
  ProjectWorkstream, Milestone, Task,
} from '@/lib/types/database'

export const revalidate = 0

export default async function WorkspaceProgettiPage({ searchParams }: { searchParams: { client?: string; new?: string } }) {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'team' && profile.role !== 'admin') redirect('/workspace')
  const supabase = await createClient()
  // stesso gate di createProjectFromWizard: niente CTA se il wizard fallirebbe a fine flusso
  const canCreate = profile.role === 'admin' || profile.app_role === 'manager'

  // RLS scope: team interni vedono tutti i progetti, esterni solo i propri.
  // clients_workspace = VIEW senza dati economici (mrr/fiscali azzerati).
  const [
    { data: clients }, { data: profiles }, { data: services },
    { data: templates }, { data: nodes }, { data: projects },
  ] = await Promise.all([
    supabase.from('clients_workspace').select('id, company_name, display_name, client_label').order('company_name'),
    supabase.from('profiles').select('id, full_name, app_role, avatar_url').eq('is_active', true).order('full_name'),
    supabase.from('service_catalog').select('*').order('area').order('sort_order'),
    supabase.from('project_templates').select('*').order('sort_order'),
    supabase.from('project_template_nodes').select('*').order('sort_order'),
    supabase.from('projects').select('id, name, status, area, service_type, client_id, created_at')
      .is('deleted_at', null).order('created_at', { ascending: false }),
  ])

  // Dati per il calendario milestone globale: progetti in corso (esclude completati/archiviati)
  const activeIds = (projects ?? []).filter(p => ['active', 'draft', 'on_hold'].includes(p.status)).map(p => p.id)
  const [{ data: workstreams }, { data: milestones }, { data: calTasks }] = activeIds.length
    ? await Promise.all([
        supabase.from('project_workstreams').select('*').in('project_id', activeIds).order('sort_order'),
        supabase.from('milestones').select('*').in('project_id', activeIds).order('sort_order'),
        supabase.from('tasks').select('id, milestone_id, status, parent_task_id').in('project_id', activeIds).is('deleted_at', null),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const clientOpts = (clients ?? []).map((c: { id: string; company_name: string; display_name: string | null; client_label: string | null }) =>
    ({ id: c.id, name: c.display_name || c.company_name, lost: c.client_label === 'perso' }))

  return (
    <ProgettiClient
      clients={clientOpts}
      profiles={(profiles ?? []) as { id: string; full_name: string; app_role: string | null; avatar_url: string | null }[]}
      services={(services ?? []) as ServiceCatalogEntry[]}
      templates={(templates ?? []) as ProjectTemplate[]}
      nodes={(nodes ?? []) as ProjectTemplateNode[]}
      projects={(projects ?? []) as { id: string; name: string; status: string; area: string; service_type: string; client_id: string; created_at: string }[]}
      workstreams={(workstreams ?? []) as ProjectWorkstream[]}
      milestones={(milestones ?? []) as Milestone[]}
      calTasks={(calTasks ?? []) as Pick<Task, 'id' | 'milestone_id' | 'status' | 'parent_task_id'>[]}
      basePath="/workspace/progetti"
      canCreate={canCreate}
      initialClientId={canCreate && searchParams.client && clientOpts.some(c => c.id === searchParams.client) ? searchParams.client : undefined}
      openWizard={canCreate && searchParams.new === '1'}
    />
  )
}
