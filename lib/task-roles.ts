/**
 * Ruoli su `task_assignees.role_in_task`.
 *
 * Sta qui e non nella server action perché un file `'use server'` può esportare
 * solo funzioni async: una costante rompe la build. Serve a entrambi i lati —
 * l'action che la scrive e la UI che la interroga — quindi vive in un modulo neutro.
 */

/** Secondo livello su una task in carico al cliente: chi da noi la presidia. */
export const SUPERVISOR_ROLE = 'supervisore'
