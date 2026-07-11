// Fonte unica per gli stati terminali delle task (§7.1 / D16).
// Progettato ESTENDIBILE: per introdurre un nuovo stato terminale (es. 'annullato',
// 'archiviato') basta aggiungerlo qui e tutti i conteggi/filtri che usano gli helper
// si adeguano. NON confrontare mai `status === 'completato'` inline: usare isTaskDone.
//
// Nota: il CHECK DB attuale su tasks.status è ('da_fare','in_corso','in_revisione',
// 'completato'). Aggiungere uno stato terminale richiede anche l'ALTER del CHECK.

export const TERMINAL_TASK_STATUSES = ['completato'] as const
export const ACTIVE_TASK_STATUSES = ['da_fare', 'in_corso', 'in_revisione'] as const

export function isTaskDone(status: string | null | undefined): boolean {
  return !!status && (TERMINAL_TASK_STATUSES as readonly string[]).includes(status)
}

export function isTaskActive(status: string | null | undefined): boolean {
  return !isTaskDone(status)
}
