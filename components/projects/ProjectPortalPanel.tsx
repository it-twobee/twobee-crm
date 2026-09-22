import { getViewer } from '@/lib/auth'
import { canManageClientPortal, isAdminRole, isSuperAdminRaw } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { isMissingPortalSchema } from '@/lib/portal/model'
import { EMPTY_PROJECT_FIELDS } from '@/lib/portal/publish'
import { ProjectPortalTab } from './ProjectPortalTab'
import type { ProjectPortalData, PortalDeliverableRow, PortalTaskRow, PortalVersionRow } from './ProjectPortalTab'
import type { Project } from '@/lib/types/database'

/* §395 — legge con la sessione e la RLS: lo staff passa da `portal_staff_read`,
   e le colonne riservate (`storage_key`, `file_id`) non sono concesse nemmeno
   a noi. Le scritture stanno nelle action, dietro `canManageClientPortal`. */
export async function ProjectPortalPanel({ project, clientName }: { project: Project; clientName: string }) {
  if (!project.client_id) return null
  const { profile } = await getViewer()
  if (!canManageClientPortal(profile)) return null
  const db = await createClient()
  const clientId = project.client_id
  // Il manager non pubblica per un'azienda che il workspace gli nasconde (§213).
  const admin = isAdminRole(profile?.app_role) || isSuperAdminRaw(profile?.email, profile?.app_role)
  const visible = await db.from(admin ? 'clients' : 'clients_workspace').select('id').eq('id', clientId).maybeSingle()
  if (!visible.data) return null

  const [tasks, activities, deliverables, versions, materials, publisher] = await Promise.all([
    db.from('tasks').select('id, title, description, due_date, deleted_at, task_type, client_id')
      .eq('client_id', clientId).eq('task_type', 'cliente').is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(200),
    db.from('portal_activities').select('id, status, kind, published_at, source_task_id')
      .eq('client_id', clientId).not('source_task_id', 'is', null),
    db.from('portal_deliverables').select('id, title, created_at')
      .eq('project_id', project.id).order('created_at'),
    db.from('portal_deliverable_versions')
      .select('id, deliverable_id, version, title, author_name, approval_required, published_at, retired_at')
      .eq('project_id', project.id).order('version', { ascending: false }),
    // §397 — lo spazio file è dell'azienda: qui si vede tutto quello che ci ha
    // mandato, non solo ciò che ha etichettato con questo progetto.
    db.from('portal_materials')
      .select('id, project_id, name, mime, size, kind, uploaded_by_name, created_at')
      .eq('client_id', clientId).is('deleted_at', null).order('created_at', { ascending: false }).limit(200),
    project.portal_published_by
      ? db.from('profiles').select('full_name').eq('id', project.portal_published_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const schemaMissing = [activities.error, deliverables.error, versions.error].some(isMissingPortalSchema)
  const materialsMissing = isMissingPortalSchema(materials.error)
  const byTask = new Map((activities.data ?? []).map(a => [a.source_task_id as string, a]))
  const versionsByDeliverable = new Map<string, PortalVersionRow[]>()
  for (const row of (versions.data ?? []) as (PortalVersionRow & { deliverable_id: string | null })[]) {
    if (!row.deliverable_id) continue
    versionsByDeliverable.set(row.deliverable_id, [...(versionsByDeliverable.get(row.deliverable_id) ?? []), row])
  }

  const data: ProjectPortalData = {
    projectId: project.id,
    clientId,
    companyName: clientName,
    projectName: project.name,
    // Il referente è una persona di TwoBee: senza, «a chi rivolgersi» rimanderebbe
    // il cliente alla propria azienda.
    fallbackContact: profile?.full_name?.trim() || 'Il team TwoBee',
    area: project.area,
    status: project.status,
    saved: {
      ...EMPTY_PROJECT_FIELDS,
      title: project.portal_title ?? '',
      objective: project.portal_objective, scope: project.portal_scope,
      update: project.portal_update, next_step: project.portal_next_step,
      contact: project.portal_contact, target_date: project.portal_target_date,
      date_kind: project.portal_date_kind ?? 'prevista', phase: project.portal_phase,
    },
    publishedAt: project.portal_published_at,
    publishedBy: (publisher.data as { full_name: string | null } | null)?.full_name ?? null,
    tasks: ((tasks.data ?? []) as Omit<PortalTaskRow, 'activity'>[]).map(task => ({
      ...task, activity: byTask.get(task.id) ?? null,
    })),
    deliverables: ((deliverables.data ?? []) as { id: string; title: string }[]).map(d => ({
      id: d.id, title: d.title, versions: versionsByDeliverable.get(d.id) ?? [],
    })) as PortalDeliverableRow[],
    materials: materialsMissing ? [] : ((materials.data ?? []) as ProjectPortalData['materials']),
    materialsMissing,
    schemaMissing,
  }

  return <ProjectPortalTab data={data} />
}
