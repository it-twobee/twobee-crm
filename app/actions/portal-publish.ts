'use server'

/* §395 — Pubblicare nel portale cliente. Un file `'use server'` esporta
   endpoint (§329): la porta è `requireManager()`, dentro ogni azione, e il
   client di servizio arriva solo dopo. La cronologia del portale legge
   l'attore dall'header, quindi si scrive con `createActorClient`. */
import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { isLead } from '@/lib/clients'
import { createClient } from '@/lib/supabase/server'
import { createActorClient } from '@/lib/supabase/admin'
import { canManageClientPortal, isAdminRole, isSuperAdminRaw } from '@/lib/permissions'
import { isUuid } from '@/lib/portal/access'
import { activityFromTask, nextVersion, parseDeliverableTitle, parsePortalProject } from '@/lib/portal/publish'
import type { PortalActivityKind, PortalProjectFields } from '@/lib/portal/publish'
import type { PortalResult } from '@/lib/portal/access'

function databaseError(error: { code?: string } | null) {
  if (!error) return
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) {
    throw new Error('Pubblicazione non ancora attiva: occorre applicare la migration 249 del portale.')
  }
  if (error.code === '40001') throw new Error('Contenuto modificato da un altro utente. Aggiorna la pagina e riprova.')
  throw new Error('Non è stato possibile aggiornare i contenuti del portale. Riprova.')
}

function failure(error: unknown) {
  return { error: error instanceof Error ? error.message : 'Operazione non riuscita. Riprova.' }
}

async function requireManager() {
  const { user, profile } = await getViewer()
  if (!user || !canManageClientPortal(profile)) {
    throw new Error('Solo amministrativi e manager attivi possono pubblicare nel portale cliente.')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Pubblicazione non configurata in questo ambiente.')
  const session = await createClient()
  return {
    session, actor: user.id,
    authorName: profile?.full_name?.trim() || 'Team TwoBee',
    isAdmin: isAdminRole(profile?.app_role) || isSuperAdminRaw(profile?.email, profile?.app_role),
  }
}

type Manager = Awaited<ReturnType<typeof requireManager>>

/** Il manager pubblica solo per le aziende che il workspace gli mostra (§213). */
async function assertClient(base: Manager, clientId: string) {
  if (!isUuid(clientId)) throw new Error('Cliente non valido.')
  const result = await base.session.from(base.isAdmin ? 'clients' : 'clients_workspace')
    .select('id,client_label').eq('id', clientId).maybeSingle()
  databaseError(result.error)
  if (!result.data) throw new Error('Cliente non disponibile o non autorizzato.')
  if (isLead(result.data)) throw new Error('Acquisisci il lead come cliente prima di pubblicare nel portale.')
  return { ...base, db: createActorClient(base.actor), clientId }
}

const PROJECT_FIELDS = 'id, client_id, name, portal_title, portal_objective, portal_scope, portal_update, portal_next_step, portal_contact, portal_target_date, portal_date_kind, portal_phase, portal_published_at'

async function projectContext(projectId: string) {
  const base = await requireManager()
  if (!isUuid(projectId)) throw new Error('Progetto non valido.')
  const project = await base.session.from('projects').select(PROJECT_FIELDS)
    .eq('id', projectId).is('deleted_at', null).maybeSingle()
  databaseError(project.error)
  if (!project.data) throw new Error('Progetto non disponibile o non autorizzato.')
  if (!project.data.client_id) throw new Error('Un progetto interno non ha un portale dove comparire.')
  const context = await assertClient(base, project.data.client_id)
  return { ...context, project: project.data }
}

function refresh(clientId: string, projectId?: string | null) {
  if (projectId) {
    revalidatePath(`/progetti/${projectId}`)
    revalidatePath(`/workspace/progetti/${projectId}`)
  }
  revalidatePath(`/clienti/${clientId}`)
  revalidatePath(`/workspace/clienti/${clientId}`)
  revalidatePath('/portale', 'layout')
}

function projectPayload(fields: PortalProjectFields) {
  return {
    portal_title: fields.title, portal_objective: fields.objective, portal_scope: fields.scope,
    portal_update: fields.update, portal_next_step: fields.next_step, portal_contact: fields.contact,
    portal_target_date: fields.target_date, portal_date_kind: fields.date_kind, portal_phase: fields.phase,
  }
}

// ── Progetto ────────────────────────────────────────────────────────────────

export async function publishProject(projectId: string, raw: Partial<PortalProjectFields>): Promise<PortalResult<null>> {
  try {
    const context = await projectContext(projectId)
    const result = await context.db.from('projects').update({
      ...projectPayload(parsePortalProject(raw)),
      portal_published_at: new Date().toISOString(), portal_published_by: context.actor,
    }).eq('id', projectId)
    databaseError(result.error)
    refresh(context.clientId, projectId)
    return { data: null }
  } catch (error) { return failure(error) }
}

/* Il database rifiuta una modifica ai campi condivisi che non alzi la data di
   pubblicazione: finché il progetto è pubblicato, salvare **è** ripubblicare. */
export async function saveProjectPortalDraft(projectId: string, raw: Partial<PortalProjectFields>): Promise<PortalResult<null>> {
  try {
    const context = await projectContext(projectId)
    if (context.project.portal_published_at) {
      throw new Error('Il progetto è pubblicato: un contenuto condiviso si aggiorna solo ripubblicandolo.')
    }
    const result = await context.db.from('projects').update(projectPayload(parsePortalProject(raw))).eq('id', projectId)
    databaseError(result.error)
    refresh(context.clientId, projectId)
    return { data: null }
  } catch (error) { return failure(error) }
}

export async function withdrawProject(projectId: string): Promise<PortalResult<null>> {
  try {
    const context = await projectContext(projectId)
    const result = await context.db.from('projects')
      .update({ portal_published_at: null, portal_published_by: null }).eq('id', projectId)
    databaseError(result.error)
    refresh(context.clientId, projectId)
    return { data: null }
  } catch (error) { return failure(error) }
}

// ── Attività al cliente: la task resta l'unico inserimento ──────────────────

export async function publishClientTask(
  taskId: string,
  options: { kind: PortalActivityKind; contactName: string },
): Promise<PortalResult<null>> {
  try {
    const base = await requireManager()
    if (!isUuid(taskId)) throw new Error('Task non valida.')
    const task = await base.session.from('tasks')
      .select('id, client_id, task_type, title, description, due_date, deleted_at')
      .eq('id', taskId).maybeSingle()
    databaseError(task.error)
    if (!task.data) throw new Error('Task non disponibile o non autorizzata.')
    const fields = activityFromTask(task.data, options)
    const context = await assertClient(base, fields.client_id)
    const existing = await context.db.from('portal_activities')
      .select('id').eq('source_task_id', taskId).maybeSingle()
    databaseError(existing.error)
    const published = { published_at: new Date().toISOString(), published_by: context.actor }
    const result = existing.data
      // Il tipo e il contesto sono immutabili: ripubblicare aggiorna i testi.
      ? await context.db.from('portal_activities').update({
          title: fields.title, reason: fields.reason, due_date: fields.due_date,
          contact_name: fields.contact_name, ...published,
        }).eq('id', existing.data.id)
      : await context.db.from('portal_activities').insert({ ...fields, owner_id: context.actor, ...published })
    databaseError(result.error)
    refresh(context.clientId)
    return { data: null }
  } catch (error) { return failure(error) }
}

export async function withdrawClientActivity(activityId: string): Promise<PortalResult<null>> {
  try {
    const base = await requireManager()
    if (!isUuid(activityId)) throw new Error('Attività non valida.')
    const activity = await base.session.from('portal_activities')
      .select('id, client_id, project_id').eq('id', activityId).maybeSingle()
    databaseError(activity.error)
    if (!activity.data) throw new Error('Attività non disponibile o non autorizzata.')
    const context = await assertClient(base, activity.data.client_id)
    const result = await context.db.from('portal_activities')
      .update({ published_at: null, published_by: null }).eq('id', activityId)
    databaseError(result.error)
    refresh(context.clientId, activity.data.project_id)
    return { data: null }
  } catch (error) { return failure(error) }
}

// ── Consegne ────────────────────────────────────────────────────────────────

export async function createDeliverable(projectId: string, title: string): Promise<PortalResult<{ id: string }>> {
  try {
    const context = await projectContext(projectId)
    const result = await context.db.from('portal_deliverables').insert({
      client_id: context.clientId, project_id: projectId,
      title: parseDeliverableTitle(title), created_by: context.actor,
    }).select('id').single()
    databaseError(result.error)
    if (!result.data) throw new Error('Non è stato possibile creare la consegna. Riprova.')
    refresh(context.clientId, projectId)
    return { data: { id: result.data.id } }
  } catch (error) { return failure(error) }
}

export async function addDeliverableVersion(
  projectId: string,
  deliverableId: string,
  fileId: string,
  options: { title?: string; approvalRequired?: boolean },
): Promise<PortalResult<{ id: string }>> {
  try {
    const context = await projectContext(projectId)
    if (!isUuid(deliverableId) || !isUuid(fileId)) throw new Error('Consegna o file non validi.')
    const [deliverable, file] = await Promise.all([
      context.db.from('portal_deliverables').select('id, title')
        .eq('id', deliverableId).eq('project_id', projectId).maybeSingle(),
      context.session.from('files').select('id, object_key, name, folder, entity_type, entity_id')
        .eq('id', fileId).maybeSingle(),
    ])
    databaseError(deliverable.error); databaseError(file.error)
    if (!deliverable.data) throw new Error('Consegna non trovata per questo progetto.')
    if (!file.data) throw new Error('File non disponibile o non autorizzato.')
    if (file.data.folder !== 'deliverables' || file.data.entity_type !== 'project' || file.data.entity_id !== projectId) {
      throw new Error('Il file non è stato caricato fra le consegne di questo progetto.')
    }
    const versions = await context.db.from('portal_deliverable_versions')
      .select('version').eq('deliverable_id', deliverableId)
    databaseError(versions.error)
    const result = await context.db.from('portal_deliverable_versions').insert({
      client_id: context.clientId, project_id: projectId, deliverable_id: deliverableId,
      file_id: fileId, storage_key: file.data.object_key,
      version: nextVersion(versions.data ?? []),
      title: parseDeliverableTitle(options?.title || deliverable.data.title),
      author_id: context.actor, author_name: context.authorName,
      approval_required: options?.approvalRequired === true,
    }).select('id').single()
    databaseError(result.error)
    if (!result.data) throw new Error('Non è stato possibile creare la consegna. Riprova.')
    refresh(context.clientId, projectId)
    return { data: { id: result.data.id } }
  } catch (error) { return failure(error) }
}

export async function publishDeliverableVersion(projectId: string, versionId: string): Promise<PortalResult<null>> {
  try {
    const context = await projectContext(projectId)
    if (!isUuid(versionId)) throw new Error('Versione non valida.')
    const result = await context.db.from('portal_deliverable_versions').update({
      published_at: new Date().toISOString(), published_by: context.actor,
    }).eq('id', versionId).eq('project_id', projectId).is('published_at', null)
    databaseError(result.error)
    refresh(context.clientId, projectId)
    return { data: null }
  } catch (error) { return failure(error) }
}

/* Una versione pubblicata è un fatto: non si corregge, si ritira. Il cliente
   smette di vederla, la storia resta. */
export async function retireDeliverableVersion(projectId: string, versionId: string): Promise<PortalResult<null>> {
  try {
    const context = await projectContext(projectId)
    if (!isUuid(versionId)) throw new Error('Versione non valida.')
    const result = await context.db.from('portal_deliverable_versions').update({
      retired_at: new Date().toISOString(), retired_by: context.actor,
    }).eq('id', versionId).eq('project_id', projectId).is('retired_at', null).not('published_at', 'is', null)
    databaseError(result.error)
    refresh(context.clientId, projectId)
    return { data: null }
  } catch (error) { return failure(error) }
}

export async function deleteDeliverableDraft(projectId: string, versionId: string): Promise<PortalResult<null>> {
  try {
    const context = await projectContext(projectId)
    if (!isUuid(versionId)) throw new Error('Versione non valida.')
    const result = await context.db.from('portal_deliverable_versions')
      .delete().eq('id', versionId).eq('project_id', projectId).is('published_at', null)
    databaseError(result.error)
    refresh(context.clientId, projectId)
    return { data: null }
  } catch (error) { return failure(error) }
}
