'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// Fase 1d — Richieste dirette (Admin→Risorsa) e Richiesta supporto (§6.2/6.3, D12).
// Modellate come task con status 'richiesta_supporto' (in attesa di accettazione) +
// notifica al destinatario. Accettazione → 'da_fare'; rifiuto → la task-richiesta
// viene rimossa (non è mai diventata lavoro reale) e il richiedente è notificato.

export async function createTaskRequest(input: {
  targetProfileId: string
  title: string
  note?: string | null
  projectId?: string | null
  originTaskId?: string | null
  dueDate?: string | null
  priority?: string
}): Promise<{ ok: true; taskId: string } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  if (!input.targetProfileId || !input.title.trim()) return { error: 'Destinatario e titolo obbligatori' }

  const admin = createAdminClient()
  const { data: task, error } = await admin.from('tasks').insert({
    title: input.title.trim(),
    description: input.note ?? null,
    status: 'richiesta_supporto',
    priority: input.priority ?? 'media',
    due_date: input.dueDate ?? null,
    project_id: input.projectId ?? null,
    assignee_id: input.targetProfileId,
    requested_by: user.id,
    origin_task_id: input.originTaskId ?? null,
  } as never).select('id').single()
  if (error || !task) return { error: error?.message ?? 'Errore creazione richiesta' }

  // Bridge multi-assegnatario coerente con assignee_id (invariante tasks/task_assignees).
  await admin.from('task_assignees').insert({
    task_id: (task as { id: string }).id, profile_id: input.targetProfileId, is_primary_owner: true,
  } as never)

  const { data: me } = await admin.from('profiles').select('full_name').eq('id', user.id).single()
  await admin.from('notifications').insert({
    profile_id: input.targetProfileId,
    type: 'task_request',
    title: 'Nuova richiesta operativa',
    body: `${(me as { full_name?: string })?.full_name ?? 'Un collega'} ti ha inviato: "${input.title.trim()}"`,
    link: '/workspace/attivita',
  } as never)

  revalidatePath('/workspace/attivita'); revalidatePath('/le-mie-attivita'); revalidatePath('/dashboard')
  return { ok: true, taskId: (task as { id: string }).id }
}

export async function respondToTaskRequest(
  taskId: string, accept: boolean, note?: string,
): Promise<{ ok: true } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const admin = createAdminClient()
  const { data: task } = await admin.from('tasks')
    .select('id, assignee_id, requested_by, title, status').eq('id', taskId).single()
  const t = task as { assignee_id: string | null; requested_by: string | null; title: string; status: string } | null
  if (!t) return { error: 'Richiesta non trovata' }
  if (t.status !== 'richiesta_supporto') return { error: 'Richiesta già gestita' }
  if (t.assignee_id !== user.id) return { error: 'Solo il destinatario può rispondere' }

  const { data: me } = await admin.from('profiles').select('full_name').eq('id', user.id).single()
  const name = (me as { full_name?: string })?.full_name ?? 'Il collega'

  if (accept) {
    const { error } = await admin.from('tasks').update({ status: 'da_fare' } as never).eq('id', taskId)
    if (error) return { error: error.message }
    if (t.requested_by) await admin.from('notifications').insert({
      profile_id: t.requested_by, type: 'task_request_accepted',
      title: 'Richiesta accettata', body: `${name} ha accettato: "${t.title}"`, link: '/workspace/attivita',
    } as never)
  } else {
    await admin.from('task_assignees').delete().eq('task_id', taskId)
    const { error } = await admin.from('tasks').delete().eq('id', taskId)
    if (error) return { error: error.message }
    if (t.requested_by) await admin.from('notifications').insert({
      profile_id: t.requested_by, type: 'task_request_rejected',
      title: 'Richiesta rifiutata', body: `${name} ha rifiutato: "${t.title}"${note ? ` — ${note}` : ''}`, link: '/workspace/attivita',
    } as never)
  }

  revalidatePath('/workspace/attivita'); revalidatePath('/le-mie-attivita'); revalidatePath('/dashboard')
  return { ok: true }
}
