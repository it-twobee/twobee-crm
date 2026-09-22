import { createClient } from '@/lib/supabase/server'
import { INTERNAL_COARSE_ROLES } from '@/lib/permissions'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ProgettiClient } from '@/components/projects/ProgettiClient'
import { areaDiPartenza } from '@/lib/area-persona'
import type {
  ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode,
  ProjectWorkstream, Milestone, Task,
} from '@/lib/types/database'

export const revalidate = 0

export default async function ProgettiPage({ searchParams }: { searchParams: { client?: string; new?: string } }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const profile = await getSessionProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [
    { data: clients }, { data: profiles }, { data: services },
    { data: templates }, { data: nodes }, { data: projects },
  ] = await Promise.all([
    supabase.from('clients').select('id, company_name, display_name, client_label, is_internal, internal_kind').order('company_name'),
    supabase.from('profiles').select('id, full_name, app_role, avatar_url').eq('is_active', true).in('role', INTERNAL_COARSE_ROLES).order('full_name'),
    supabase.from('service_catalog').select('*').order('area').order('sort_order'),
    supabase.from('project_templates').select('*').order('sort_order'),
    supabase.from('project_template_nodes').select('*').order('sort_order'),
    supabase.from('projects').select('id, name, status, area, service_type, client_id, created_at, manager_id')
      .is('deleted_at', null).order('created_at', { ascending: false }),
  ])

  /* §358 — qui ci arriva solo chi governa, quindi il calendario si apre su
     «Tutte» (`areaDiPartenza` lo decide dal ruolo). I progetti propri servono
     lo stesso: se un admin sceglie un'area, i suoi non devono sparire. */
  const { data: membri } = await supabase.from('project_members')
    .select('project_id').eq('profile_id', user.id)
  const progettiMiei = Array.from(new Set([
    ...(membri ?? []).map(m => m.project_id as string),
    ...(projects ?? []).filter(p => (p as { manager_id?: string | null }).manager_id === user.id).map(p => p.id),
  ]))
  const areaIniziale = areaDiPartenza({
    appRole: profile?.app_role,
    areaProfilo: (profile as { area?: string | null } | null)?.area,
    areeDeiProgetti: (projects ?? []).filter(p => progettiMiei.includes(p.id)).map(p => p.area),
  })

  // Dati per il calendario milestone globale: progetti in corso (esclude completati/archiviati)
  const activeIds = (projects ?? []).filter(p => ['active', 'draft', 'on_hold'].includes(p.status)).map(p => p.id)
  const [{ data: workstreams }, { data: milestones }, { data: calTasks }] = activeIds.length
    ? await Promise.all([
        supabase.from('project_workstreams').select('*').in('project_id', activeIds).order('sort_order'),
        supabase.from('milestones').select('*').in('project_id', activeIds).order('sort_order'),
        supabase.from('tasks').select('id, milestone_id, status, parent_task_id').in('project_id', activeIds).is('deleted_at', null),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const clientOpts = (clients ?? []).map(c => ({
    id: c.id, name: c.display_name || c.company_name,
    client_label: c.client_label, is_internal: c.is_internal, internal_kind: c.internal_kind,
  }))

  return (
    <ProgettiClient
      areaIniziale={areaIniziale}
      progettiMiei={progettiMiei}
      clients={clientOpts}
      profiles={(profiles ?? []) as { id: string; full_name: string; app_role: string | null; avatar_url: string | null }[]}
      services={(services ?? []) as ServiceCatalogEntry[]}
      templates={(templates ?? []) as ProjectTemplate[]}
      nodes={(nodes ?? []) as ProjectTemplateNode[]}
      projects={(projects ?? []) as { id: string; name: string; status: string; area: string; service_type: string; client_id: string; created_at: string }[]}
      workstreams={(workstreams ?? []) as ProjectWorkstream[]}
      milestones={(milestones ?? []) as Milestone[]}
      calTasks={(calTasks ?? []) as Pick<Task, 'id' | 'milestone_id' | 'status' | 'parent_task_id'>[]}
      initialClientId={searchParams.client && clientOpts.some(c => c.id === searchParams.client) ? searchParams.client : undefined}
      openWizard={searchParams.new === '1'}
    />
  )
}
