import { createClient } from '@/lib/supabase/server'
import { INTERNAL_COARSE_ROLES } from '@/lib/permissions'
import { getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ProgettiClient } from '@/components/projects/ProgettiClient'
import { areaDiPartenza, milestoneMie, soloMieDiPartenza } from '@/lib/area-persona'
import type {
  ServiceCatalogEntry, ProjectTemplate, ProjectTemplateNode,
  ProjectWorkstream, Milestone, Task, ClientLabel,
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
    { data: membri }, { data: assegnazioni },
  ] = await Promise.all([
    supabase.from('clients_workspace').select('id, company_name, display_name, client_label').order('company_name'),
    supabase.from('profiles').select('id, full_name, app_role, avatar_url, avatar_color').eq('is_active', true).in('role', INTERNAL_COARSE_ROLES).order('full_name'),
    supabase.from('service_catalog').select('*').order('area').order('sort_order'),
    supabase.from('project_templates').select('*').order('sort_order'),
    supabase.from('project_template_nodes').select('*').order('sort_order'),
    supabase.from('projects').select('id, name, status, area, service_type, client_id, created_at, manager_id')
      .is('deleted_at', null).order('created_at', { ascending: false }),
    /* §488 — non dipendono da niente: partono con le altre invece di aspettarle */
    supabase.from('project_members').select('project_id').eq('profile_id', profile.id),
    supabase.from('task_assignees').select('task_id').eq('profile_id', profile.id),
  ])

  /* §358 — i progetti in cui questa persona è dentro, come membro o come PM:
     servono a dedurre con quale area aprire il calendario (`profiles.area` è
     vuota per tutti: misurato). Non attraversano più il filtro (§484). */
  const progettiMiei = Array.from(new Set([
    ...(membri ?? []).map(m => m.project_id as string),
    ...(projects ?? []).filter(p => (p as { manager_id?: string | null }).manager_id === profile.id).map(p => p.id),
  ]))
  const areaIniziale = areaDiPartenza({
    appRole: profile.app_role,
    areaProfilo: (profile as { area?: string | null }).area,
    areeDeiProgetti: (projects ?? []).filter(p => progettiMiei.includes(p.id)).map(p => p.area),
  })

  // Dati per il calendario milestone globale: progetti in corso (esclude completati/archiviati)
  const activeIds = (projects ?? []).filter(p => ['active', 'draft', 'on_hold'].includes(p.status)).map(p => p.id)
  const [{ data: workstreams }, { data: milestones }, { data: calTasks }] = activeIds.length
    ? await Promise.all([
        supabase.from('project_workstreams').select('*').in('project_id', activeIds).order('sort_order'),
        supabase.from('milestones').select('*').in('project_id', activeIds).order('sort_order'),
        supabase.from('tasks').select('id, milestone_id, status, parent_task_id, assignee_id').in('project_id', activeIds).is('deleted_at', null),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  /* §487 — le milestone in cui chi guarda è incluso: responsabile, o con una
     task dentro (primaria o fra gli assegnatari). Servono a «Le mie». */
  const milestoneMieIds = milestoneMie({
    io: profile.id,
    milestones: (milestones ?? []) as { id: string; owner_id: string | null }[],
    tasks: (calTasks ?? []) as { id: string; milestone_id: string | null; assignee_id: string | null }[],
    taskMie: (assegnazioni ?? []).map(a => a.task_id as string),
  })

  // Solo la label: nel workspace le aree non esistono (§326) e la VIEW non espone
  // `internal_kind` — passare `is_internal` da solo farebbe passare un lavoro
  // interno per un giro. GAV Sistemi sta fuori già dalla VIEW (§213).
  const clientOpts = (clients ?? []).map((c: { id: string; company_name: string; display_name: string | null; client_label: ClientLabel | null }) =>
    ({ id: c.id, name: c.display_name || c.company_name, client_label: c.client_label }))

  return (
    <ProgettiClient voce="progetti" areaIniziale={areaIniziale}
      milestoneMie={milestoneMieIds} soloMieIniziale={soloMieDiPartenza(profile.app_role)}
      clients={clientOpts}
      profiles={(profiles ?? []) as { id: string; full_name: string; app_role: string | null; avatar_url: string | null; avatar_color: string | null }[]}
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
