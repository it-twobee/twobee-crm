/**
 * La porta del laboratorio, una sola: qui si provano le nuove versioni delle
 * sezioni economiche, quindi la vede il super admin e nessun altro — nemmeno un
 * admin di ruolo. Come per l'utilizzo (`presenza-guard`), il gate non è la voce
 * di menu: ogni azione del laboratorio chiama `requireLabAdmin()`.
 */
import { getViewer } from '@/lib/auth'

export const LAB_DENIED = 'Permesso negato: il laboratorio è del super admin'

export async function hasLabAccess(): Promise<boolean> {
  const { isSuperAdmin } = await getViewer()
  return isSuperAdmin
}

export async function requireLabAdmin(): Promise<string> {
  const { user, isSuperAdmin } = await getViewer()
  if (!user) throw new Error('Non autenticato')
  if (!isSuperAdmin) throw new Error(LAB_DENIED)
  return user.id
}
