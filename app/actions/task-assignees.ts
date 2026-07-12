'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isExternalResource } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'

/**
 * Multi-assegnatario delle task.
 *
 * `task_assignees` è la sorgente canonica (0..N persone per task). `assignee_id`
 * su `tasks` resta il **primario** — il primo della lista — perché ~15 viste lo
 * leggono ancora per mostrare "l'assegnatario". Le due cose vanno tenute in sync
 * o una card mostra una persona diversa da quella nel bridge.
 *
 * Scrittura sempre via service role: la RLS di task_assignees consente l'ALL
 * solo a role='admin', ma anche un `team` (manager, senior…) deve poter assegnare.
 * L'autorizzazione la facciamo qui: dev'essere staff (admin o team).
 */
export async function setTaskAssignees(
  taskId: string,
  profileIds: string[],
): Promise<{ ok: true; primaryId: string | null } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: me } = await sb.from('profiles').select('role, app_role').eq('id', user.id).single()
  if (me?.role !== 'admin' && me?.role !== 'team') {
    return { error: 'Solo lo staff può assegnare le task' }
  }
  if (isExternalResource(me?.app_role)) {
    return { error: 'Le risorse esterne non possono assegnare le task' }
  }

  // Dedup preservando l'ordine: il primo resta il primario.
  const ids = Array.from(new Set(profileIds.filter(Boolean)))
  const primaryId = ids[0] ?? null
  const admin = createAdminClient()

  // Rimuovi chi non è più assegnato.
  const del = admin.from('task_assignees').delete().eq('task_id', taskId)
  await (ids.length > 0 ? del.not('profile_id', 'in', `(${ids.join(',')})`) : del)

  // Upsert dei presenti, con il flag di primario allineato all'ordine.
  if (ids.length > 0) {
    const rows = ids.map(pid => ({
      task_id: taskId,
      profile_id: pid,
      is_primary_owner: pid === primaryId,
      role: pid === primaryId ? 'owner' : 'collaborator',
      assigned_by: user.id,
    }))
    const { error } = await admin
      .from('task_assignees')
      .upsert(rows as never, { onConflict: 'task_id,profile_id' })
    if (error) return { error: error.message }
  }

  // Tieni assignee_id = primario, per le viste che leggono ancora il singolo.
  const { error: tErr } = await admin
    .from('tasks').update({ assignee_id: primaryId } as never).eq('id', taskId)
  if (tErr) return { error: tErr.message }

  revalidatePath('/workspace')
  revalidatePath('/le-mie-attivita')
  return { ok: true, primaryId }
}

/**
 * Assegna in blocco lo stesso set di persone a più task (usato dalla riassegnazione
 * multipla). Fa gli stessi passi di setTaskAssignees per ciascuna task.
 */
export async function bulkSetTaskAssignees(
  taskIds: string[],
  profileIds: string[],
): Promise<{ ok: true; primaryId: string | null } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: me } = await sb.from('profiles').select('role, app_role').eq('id', user.id).single()
  if (me?.role !== 'admin' && me?.role !== 'team') {
    return { error: 'Solo lo staff può assegnare le task' }
  }
  if (isExternalResource(me?.app_role)) {
    return { error: 'Le risorse esterne non possono assegnare le task' }
  }

  const ids = Array.from(new Set(profileIds.filter(Boolean)))
  const primaryId = ids[0] ?? null
  const admin = createAdminClient()

  for (const taskId of taskIds) {
    const del = admin.from('task_assignees').delete().eq('task_id', taskId)
    await (ids.length > 0 ? del.not('profile_id', 'in', `(${ids.join(',')})`) : del)
    if (ids.length > 0) {
      await admin.from('task_assignees').upsert(
        ids.map(pid => ({
          task_id: taskId, profile_id: pid,
          is_primary_owner: pid === primaryId,
          role: pid === primaryId ? 'owner' : 'collaborator',
          assigned_by: user.id,
        })) as never,
        { onConflict: 'task_id,profile_id' },
      )
    }
  }

  const { error } = await admin
    .from('tasks').update({ assignee_id: primaryId } as never).in('id', taskIds)
  if (error) return { error: error.message }

  revalidatePath('/workspace')
  revalidatePath('/le-mie-attivita')
  return { ok: true, primaryId }
}
