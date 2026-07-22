'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdminRaw, isAdminRole, isExternalResource } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'

/**
 * Modifiche alle task dalla vista Workload, riservate al PM del progetto o
 * all'admin. "PM" = manager_id del progetto, oppure app_role manager, oppure admin.
 *
 * L'autorizzazione la facciamo qui e scriviamo via service role: un manager è
 * `role='team'` e la RLS su tasks non gli darebbe necessariamente il delete.
 */
async function assertCanManage(projectId: string | null): Promise<{ userId: string } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: me } = await sb
    .from('profiles').select('email, app_role, role').eq('id', user.id).single()

  // Le risorse esterne sono in sola lettura, anche se PM designato per errore.
  if (isExternalResource(me?.app_role)) return { error: 'Le risorse esterne non possono modificare le task' }

  const admin = isSuperAdminRaw(me?.email, me?.app_role) || isAdminRole(me?.app_role) || me?.role === 'admin'
  if (admin) return { userId: user.id }

  // Manager di ruolo: può gestire qualunque progetto operativo.
  if (me?.app_role === 'manager') return { userId: user.id }

  // Le task ad hoc di cliente non hanno progetto, quindi non hanno un PM a cui
  // delegare: restano ad admin e manager, già coperti sopra.
  if (!projectId) return { error: 'Solo un admin o un manager può modificare le attività ad hoc' }

  // Altrimenti dev'essere il PM designato di QUESTO progetto.
  const { data: proj } = await createAdminClient()
    .from('projects').select('manager_id').eq('id', projectId).single()
  if (proj?.manager_id === user.id) return { userId: user.id }

  return { error: 'Solo il PM del progetto o un admin può modificare queste task' }
}

export async function pmUpdateTask(
  projectId: string | null,
  taskId: string,
  patch: { status?: string; due_date?: string | null; priority?: string },
): Promise<{ ok: true } | { error: string }> {
  const auth = await assertCanManage(projectId)
  if ('error' in auth) return { error: auth.error }

  const updates: Record<string, unknown> = {}
  if (patch.status !== undefined) updates.status = patch.status
  if (patch.due_date !== undefined) updates.due_date = patch.due_date
  if (patch.priority !== undefined) updates.priority = patch.priority
  if (Object.keys(updates).length === 0) return { ok: true }

  const { error } = await createAdminClient()
    .from('tasks').update(updates as never).eq('id', taskId)
  if (error) return { error: error.message }

  revalidatePath('/workload')
  revalidatePath('/workspace/workload')
  return { ok: true }
}

export async function pmDeleteTask(
  projectId: string | null,
  taskId: string,
): Promise<{ ok: true } | { error: string }> {
  const auth = await assertCanManage(projectId)
  if ('error' in auth) return { error: auth.error }

  const admin = createAdminClient()
  // Soft-delete: la task finisce nel cestino (ripristinabile). Gli assegnatari
  // NON vengono rimossi, così il ripristino la riporta com'era.
  // Nessun filtro su project_id: le ad hoc di cliente non ne hanno, e l'identità
  // della task è già garantita dall'id. L'autorizzazione è passata da assertCanManage.
  const { error } = await admin.from('tasks')
    .update({ deleted_at: new Date().toISOString(), deleted_by: auth.userId } as never)
    .eq('id', taskId).is('deleted_at', null)
  if (error) return { error: error.message }

  revalidatePath('/workload')
  revalidatePath('/workspace/workload')
  revalidatePath('/cestino')
  return { ok: true }
}
