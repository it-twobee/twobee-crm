'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isSuperAdminRaw, isAdminRole, isExternalResource } from '@/lib/permissions'
import { setTaskAssignees } from '@/app/actions/task-assignees'
import type { Task } from '@/lib/types/database'

/**
 * Attività ad hoc di cliente: task con `scope_type='client'`, `client_id`
 * valorizzato e `project_id` NULL.
 *
 * Non sono task personali, benché non abbiano progetto: la distinzione la fa
 * `scope_type`, e la policy `tasks_team_read_all` (migration 128) le rende
 * visibili al team. Prima della 128, `project_id IS NULL` significava "privata"
 * e queste task sarebbero state invisibili a tutti tranne l'assegnatario.
 *
 * Scrittura via service role: un manager è `role='team'` e la RLS su `tasks`
 * non gli darebbe l'insert su un cliente che non ha assegnato.
 */

async function assertCanManage(): Promise<{ userId: string } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: me } = await sb
    .from('profiles').select('email, app_role, role').eq('id', user.id).single()

  if (isExternalResource(me?.app_role)) {
    return { error: 'Le risorse esterne non possono creare attività' }
  }

  const admin = isSuperAdminRaw(me?.email, me?.app_role) || isAdminRole(me?.app_role) || me?.role === 'admin'
  if (admin || me?.app_role === 'manager' || me?.app_role === 'senior') return { userId: user.id }

  return { error: 'Solo admin, manager o senior possono gestire le attività ad hoc' }
}

export interface AdHocTask extends Task {
  client_id: string
  assignees?: string[]
}

export async function listClientAdHoc(clientId: string) {
  const sb = await createClient()
  const { data, error } = await sb
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url)')
    .eq('client_id', clientId)
    .eq('scope_type', 'client')
    .is('deleted_at', null)
    .order('due_date', { nullsFirst: false })

  if (error) return { ok: false as const, error: error.message, tasks: [] }
  return { ok: true as const, tasks: (data ?? []) as unknown as AdHocTask[] }
}

export interface NewAdHocInput {
  client_id: string
  title: string
  description?: string | null
  due_date?: string | null
  priority?: string
  estimated_hours?: number | null
  assignee_ids?: string[]
  /** Visibile nel portale cliente. Default false: le ad hoc sono interne salvo scelta esplicita. */
  is_client_task?: boolean
}

export async function createClientAdHoc(input: NewAdHocInput) {
  const guard = await assertCanManage()
  if ('error' in guard) return { ok: false as const, error: guard.error }

  if (!input.title.trim()) return { ok: false as const, error: 'Serve un titolo' }

  const admin = createAdminClient()
  const { data, error } = await admin.from('tasks').insert({
    client_id: input.client_id,
    project_id: null,
    scope_type: 'client',
    work_type: 'adhoc',
    title: input.title.trim(),
    description: input.description?.trim() || null,
    due_date: input.due_date || null,
    priority: input.priority ?? 'media',
    estimated_hours: input.estimated_hours ?? null,
    status: 'da_fare',
    is_client_task: input.is_client_task ?? false,
    created_by: guard.userId,
  } as never).select('id').single()

  if (error || !data) return { ok: false as const, error: error?.message ?? 'Errore creazione' }

  if (input.assignee_ids && input.assignee_ids.length > 0) {
    await setTaskAssignees((data as { id: string }).id, input.assignee_ids)
  }

  revalidatePath(`/clienti/${input.client_id}`)
  revalidatePath('/workload')
  revalidatePath('/workspace/workload')
  return { ok: true as const, id: (data as { id: string }).id }
}

export async function updateClientAdHoc(
  taskId: string,
  clientId: string,
  patch: { status?: string; due_date?: string | null; priority?: string; estimated_hours?: number | null; is_client_task?: boolean },
) {
  const guard = await assertCanManage()
  if ('error' in guard) return { ok: false as const, error: guard.error }

  const updates: Record<string, unknown> = {}
  for (const k of ['status', 'due_date', 'priority', 'estimated_hours', 'is_client_task'] as const) {
    if (patch[k] !== undefined) updates[k] = patch[k]
  }
  if (Object.keys(updates).length === 0) return { ok: true as const }

  const { error } = await createAdminClient()
    .from('tasks').update(updates as never).eq('id', taskId).eq('scope_type', 'client')

  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/clienti/${clientId}`)
  revalidatePath('/workload')
  return { ok: true as const }
}

/**
 * Promuove un'attività ad hoc a task di progetto (§10: "collega successivamente
 * a un progetto"). Il trigger `tasks_client_sync` porta scope_type a 'project' e
 * riallinea client_id da solo. Reversibile: basta rimettere project_id a NULL.
 */
export async function linkAdHocToProject(taskId: string, clientId: string, projectId: string) {
  const guard = await assertCanManage()
  if ('error' in guard) return { ok: false as const, error: guard.error }

  const admin = createAdminClient()
  const { data: proj } = await admin.from('projects').select('client_id').eq('id', projectId).single()
  if (!proj || (proj as { client_id: string }).client_id !== clientId) {
    return { ok: false as const, error: 'Il progetto non appartiene a questo cliente' }
  }

  const { error } = await admin.from('tasks')
    .update({ project_id: projectId, scope_type: 'project', work_type: 'project' } as never)
    .eq('id', taskId)

  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/clienti/${clientId}`)
  revalidatePath('/workload')
  return { ok: true as const }
}

export async function deleteClientAdHoc(taskId: string, clientId: string) {
  const guard = await assertCanManage()
  if ('error' in guard) return { ok: false as const, error: guard.error }

  // Soft-delete: finisce nel cestino come ogni altra task (migration 111).
  const { error } = await createAdminClient().from('tasks')
    .update({ deleted_at: new Date().toISOString(), deleted_by: guard.userId } as never)
    .eq('id', taskId).is('deleted_at', null)

  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/clienti/${clientId}`)
  revalidatePath('/workload')
  return { ok: true as const }
}
