import { createClient } from '@/lib/supabase/client'

interface NotifPayload {
  user_id: string
  type: string
  title: string
  body?: string
  link?: string
  entity_type?: string
  entity_id?: string
}

/** Invia una notifica in-app a un utente. Fire-and-forget. */
export async function sendNotification(payload: NotifPayload) {
  const supabase = createClient()
  await supabase.from('notifications').insert({
    profile_id: payload.user_id,  // colonna originale
    user_id: payload.user_id,     // colonna aggiunta in 009
    type: payload.type,
    title: payload.title,
    body: payload.body ?? null,
    link: payload.link ?? null,
    entity_type: payload.entity_type ?? null,
    entity_id: payload.entity_id ?? null,
    read: false,
  })
}

/** Notifica quando una task viene assegnata */
export async function notifyTaskAssigned(taskId: string, taskTitle: string, assigneeId: string, assignerName: string, clientLink?: string) {
  await sendNotification({
    user_id: assigneeId,
    type: 'task_assigned',
    title: `Task assegnata: "${taskTitle}"`,
    body: `Assegnata da ${assignerName}`,
    link: clientLink ?? '/task',
    entity_type: 'task',
    entity_id: taskId,
  })
}

/** Notifica per approvazione richiesta */
export async function notifyApprovalRequest(approverId: string, requesterId: string, title: string) {
  await sendNotification({
    user_id: approverId,
    type: 'approval_request',
    title: `Richiesta approvazione: ${title}`,
    link: '/impostazioni?tab=2',
    entity_type: 'approval',
    entity_id: requesterId,
  })
}
