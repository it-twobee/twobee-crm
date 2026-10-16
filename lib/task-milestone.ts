/* §479 — Una task diventa milestone. Esegui il gate: npx tsx lib/task-milestone.check.ts

   Feedback del 13 ottobre 2026: le task dentro una milestone a volte sono
   consegne vere, e devono stare nel calendario di Progetti, che mostra solo le
   milestone. Decisione del committente: **la task entra nella milestone nuova**
   — commenti, checklist, sotto-task e assegnatari restano dove sono, non si
   perde niente. */
import { milestoneName, taskName, bareTask } from '@/lib/project-naming'
import type { MilestoneStatus, TaskStatusV2, TaskType } from '@/lib/types/database'

/** Gli stati non si chiamano uguali: la task si spunta, la milestone si consegna. */
export const STATO_MILESTONE_DA_TASK: Record<TaskStatusV2, MilestoneStatus> = {
  da_fare: 'da_fare',
  in_corso: 'in_corso',
  richiesta_supporto: 'in_corso',
  in_review: 'in_approvazione',
  completato: 'completata',
}

export type TaskDaTrasformare = {
  title: string
  status: TaskStatusV2
  due_date: string | null
  assignee_id: string | null
  task_type: TaskType
  project_id: string | null
  workstream_id: string | null
  parent_task_id: string | null
  is_recurring_instance: boolean
  deleted_at?: string | null
}

/** `null` se si può; altrimenti la frase da mostrare. */
export function motivoNonTrasformabile(t: TaskDaTrasformare): string | null {
  if (t.deleted_at) return 'La task è stata eliminata.'
  if (t.task_type !== 'project' || !t.project_id || !t.workstream_id) return 'Solo una task di progetto può diventare una milestone.'
  if (t.parent_task_id) return 'Una sotto-task non diventa milestone: trasforma la task che la contiene.'
  if (t.is_recurring_instance) return 'Un\'occorrenza ricorrente non diventa milestone: la prossima nascerebbe di nuovo task.'
  return null
}

/**
 * La milestone nuova: titolo con la convention `M{n} · …` (n = quante consegne
 * ha già la corsia, più uno), stessa data, responsabile = l'assegnatario
 * primario. Nasce interna: farla vedere al cliente è una pubblicazione, non un
 * effetto collaterale.
 */
export function milestoneDaTask(t: TaskDaTrasformare, consegneEsistenti: number) {
  return {
    title: milestoneName(consegneEsistenti, bareTask(t.title)),
    status: STATO_MILESTONE_DA_TASK[t.status] ?? 'da_fare',
    due_date: t.due_date,
    owner_id: t.assignee_id,
  }
}

/** Il nome della task segue la milestone se portava il prefisso della vecchia: «M1 · Demo» → «M4 · Demo». */
export function titoloNellaMilestone(title: string, consegneEsistenti: number): string {
  return /^M\d+\s*·\s*/.test(title) ? taskName(consegneEsistenti, title) : title
}
