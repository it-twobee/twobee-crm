import { getSessionProfile, type SessionProfile } from '@/lib/auth'
import { canSeeTrackingSecrets, canManageAgencyKeys, isAdminRole, isSuperAdminRaw } from '@/lib/permissions'
import { TrackingError } from './errors'

/**
 * Guard del modulo Tracking. Non è un file `'use server'` di proposito: le
 * guard non devono diventare endpoint. Le action le chiamano per prime e
 * scrivono poi col service role: qui si decide chi entra, la RLS resta il
 * pavimento per le letture dal browser.
 */

export type Viewer = { uid: string; profile: SessionProfile }

/** Staff: admin e team (role grezzo), come `requireStaff` delle task ad hoc. */
export async function requireStaff(): Promise<Viewer> {
  const profile = await getSessionProfile()
  if (!profile) throw new TrackingError(401, 'Non autenticato')
  if (profile.role !== 'admin' && profile.role !== 'team') throw new TrackingError(403, 'Permesso negato')
  return { uid: profile.id, profile }
}

/** Staff interno: chi può vedere chiavi e password (`TRACKING_SECRET_ROLES`). */
export async function requireInternalStaff(): Promise<Viewer> {
  const v = await requireStaff()
  const ok = canSeeTrackingSecrets(v.profile.app_role) || isSuperAdminRaw(v.profile.email, v.profile.app_role)
  if (!ok) throw new TrackingError(403, 'Le credenziali sono riservate allo staff interno')
  return v
}

/** Admin: chiavi d'agenzia e impostazioni. */
export async function requireAdmin(): Promise<Viewer> {
  const v = await requireStaff()
  const ok = v.profile.role === 'admin' || isAdminRole(v.profile.app_role) || isSuperAdminRaw(v.profile.email, v.profile.app_role)
  if (!ok) throw new TrackingError(403, 'Riservato agli amministratori')
  return v
}

/** Chiavi d'agenzia: admin e manager (`TRACKING_AGENCY_ROLES`). */
export async function requireAgencyKeyManager(): Promise<Viewer> {
  const v = await requireStaff()
  const ok = canManageAgencyKeys(v.profile.app_role) || v.profile.role === 'admin' || isSuperAdminRaw(v.profile.email, v.profile.app_role)
  if (!ok) throw new TrackingError(403, 'Le chiavi d\'agenzia le gestiscono admin e manager')
  return v
}
