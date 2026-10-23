/* §479 — Una task nel calendario di Progetti. Esegui il gate: npx tsx lib/task-calendario.check.ts

   Feedback del 13 ottobre 2026: certe task dentro una milestone sono consegne
   vere, e devono stare nel calendario di Progetti, che mostra solo le
   milestone. Due versioni di «Trasforma in milestone» sono tornate indietro:
   la prima (16 ottobre) spostava la task in una milestone nuova, la seconda
   (20 ottobre) la eliminava e ne faceva la milestone. Tutte e due creavano un
   riquadro nuovo e la toglievano da quello in cui stava. Il 23 ottobre: **la
   task resta dov'è**, e un segno (`tasks.on_calendar`) la disegna nel
   calendario con la sua data. */
import type { MilestoneStatus, Task, TaskStatusV2, TaskType } from '@/lib/types/database'

/** Quello che il calendario disegna di una task segnata. */
export type TaskInCalendario = Pick<Task,
  'id' | 'title' | 'status' | 'due_date' | 'assignee_id' | 'milestone_id' | 'workstream_id' | 'project_id'>

/** Le colonne da selezionare per `TaskInCalendario`: una sola lista per le pagine che le leggono. */
export const COLONNE_TASK_IN_CALENDARIO = 'id, title, status, due_date, assignee_id, milestone_id, workstream_id, project_id'

/** Icona e colore nel calendario seguono quelli della milestone con lo stesso stato. */
export const STATO_COME_MILESTONE: Record<TaskStatusV2, MilestoneStatus> = {
  da_fare: 'da_fare',
  in_corso: 'in_corso',
  richiesta_supporto: 'in_corso',
  in_review: 'in_approvazione',
  completato: 'completata',
}

export type TaskDaSegnare = {
  task_type: TaskType
  project_id: string | null
  workstream_id: string | null
  milestone_id: string | null
  parent_task_id: string | null
  is_recurring_instance: boolean
  deleted_at?: string | null
}

/** `null` se si può mettere nel calendario; altrimenti la frase da mostrare. */
export function motivoFuoriCalendario(t: TaskDaSegnare): string | null {
  if (t.deleted_at) return 'La task è stata eliminata.'
  if (t.task_type !== 'project' || !t.project_id || !t.workstream_id || !t.milestone_id) return 'Solo una task di progetto va nel calendario di Progetti.'
  if (t.parent_task_id) return 'Una sotto-task non va nel calendario: segna la task che la contiene.'
  if (t.is_recurring_instance) return 'Un\'occorrenza ricorrente non va nel calendario: la prossima nascerebbe senza segno.'
  return null
}

/** Le task che il calendario disegna: segnate, con una data, di primo livello. */
export function taskInCalendario<T extends Partial<Task> & { due_date: string | null }>(tasks: T[]): T[] {
  return tasks.filter(t => t.on_calendar && t.due_date && !t.deleted_at && !t.parent_task_id)
}

/** «Le mie» (§487): una task nel calendario è tua se ne sei assegnatario, primario o no. */
export function taskInCalendarioMie(input: {
  io: string
  tasks: { id: string; assignee_id: string | null }[]
  /** gli id delle task in cui `io` compare in `task_assignees` */
  taskMie?: string[]
}): string[] {
  const mie = new Set(input.taskMie ?? [])
  return input.tasks.filter(t => t.assignee_id === input.io || mie.has(t.id)).map(t => t.id)
}
