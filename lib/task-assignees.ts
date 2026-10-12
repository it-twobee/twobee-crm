/**
 * Gli assegnatari di una task, scritti in un posto solo.
 *
 * `task_assignees` è la sorgente canonica (CLAUDE.md): il primo della lista è
 * il primario, e il trigger lo ricopia in `tasks.assignee_id`. La stessa
 * scrittura serviva a tre azioni — creazione di progetto, creazione ad hoc,
 * cambio assegnatari — e ognuna se la scriveva da sé: una regola scritta tre
 * volte (§347 l'autore, §350 la notifica) è tre posti dove dimenticarne un pezzo.
 *
 * Non è un file `'use server'`: è un pezzo delle azioni, non un endpoint (§329).
 */
import { createActorClient } from '@/lib/supabase/admin'
import { notificaAssegnazione } from '@/lib/notify'

type Db = ReturnType<typeof createActorClient>

/** Uno per persona, nell'ordine dato, senza vuoti né doppioni. */
export function elencoAssegnatari(...liste: (string | null | undefined | (string | null | undefined)[])[]): string[] {
  return Array.from(new Set(liste.flat().filter((x): x is string => !!x)))
}

export async function scriviAssegnatari(db: Db, opts: {
  taskId: string
  ids: string[]
  /** se manca o non è fra gli `ids`, il primario è il primo della lista */
  primario?: string | null
  /** §347 — chi ha deciso, non chi ha creato la task */
  autore: string
  titolo: string
}) {
  const { taskId, ids, autore, titolo } = opts
  if (!ids.length) return
  const primario = opts.primario && ids.includes(opts.primario) ? opts.primario : ids[0]
  const { error } = await db.from('task_assignees').insert(ids.map(pid => ({
    task_id: taskId, profile_id: pid, is_primary_owner: pid === primario, assigned_by: autore,
  })))
  if (error) throw new Error(error.message)
  /* §350 — una a testa, e mai a chi ha premuto: tre persone, tre notifiche. */
  for (const pid of ids) {
    await notificaAssegnazione({ destinatario: pid, autore, titolo, db })
  }
}
