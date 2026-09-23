/**
 * §410 — la porta della vista sull'utilizzo, una sola.
 *
 * Questa pagina dice chi era al lavoro, quando e per quanto. È l'unica del tool
 * che parla delle **persone** invece che del lavoro, e per questo non basta
 * essere admin: la vede il super admin e nessun altro. Un admin di ruolo — che
 * può essere promosso per tutt'altra ragione — qui non entra.
 *
 * Il gate non è la voce di menu nascosta: `os_sessions` ha RLS senza policy e
 * ci arriva solo il service role da dentro la lettura, che passa di qui.
 */
import { getViewer } from '@/lib/auth'

export const UTILIZZO_DENIED = 'Permesso negato: la vista sull\'utilizzo è del super admin'

/** La stessa domanda senza lanciare: serve alla pagina, che reindirizza. */
export async function hasUsageAccess(): Promise<boolean> {
  const { isSuperAdmin } = await getViewer()
  return isSuperAdmin
}

/** Chi sta guardando, se può. Altrimenti lancia. */
export async function requireUsageAdmin(): Promise<string> {
  const { user, isSuperAdmin } = await getViewer()
  if (!user) throw new Error('Non autenticato')
  if (!isSuperAdmin) throw new Error(UTILIZZO_DENIED)
  return user.id
}
