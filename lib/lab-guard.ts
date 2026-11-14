/**
 * La porta del laboratorio, una sola: qui si provano le nuove versioni delle
 * sezioni economiche, quindi la vede il super admin e nessun altro — nemmeno un
 * admin di ruolo. Come per l'utilizzo (`presenza-guard`), il gate non è la voce
 * di menu: ogni azione del laboratorio chiama `requireLabAdmin()`.
 */
import { getViewer } from '@/lib/auth'

export const LAB_DENIED = 'Permesso negato: il laboratorio è del super admin'

export async function hasLabAccess(): Promise<boolean> {
  const { isSuperAdmin, profile } = await getViewer()
  return isSuperAdmin && profile?.is_active !== false
}

export async function requireLabAdmin(): Promise<string> {
  const { user, isSuperAdmin, profile } = await getViewer()
  if (!user) throw new Error('Non autenticato')
  if (!isSuperAdmin || profile?.is_active === false) throw new Error(LAB_DENIED)
  return user.id
}
