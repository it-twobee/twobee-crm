import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  coarseRole, isAdminRole, isSuperAdminRaw, isExternalResource, hasPermission,
} from '@/lib/permissions'
import type { AppRole, Profile, RolePermission, PermissionSection, PermissionAction } from '@/lib/types/database'

export type Surface = 'dashboard' | 'workspace'

/**
 * Chi sta parlando con l'assistente, e con quali poteri.
 *
 * `sb` è il client con il JWT dell'utente: TUTTE le letture passano da qui, così
 * la RLS resta il pavimento sotto ai permessi applicativi. `admin` è il service
 * role e va toccato solo dentro un tool che ha già superato il proprio gate —
 * nella pratica quasi mai, perché le scritture le fanno i server action esistenti.
 */
export interface AssistantCtx {
  userId: string
  profile: Profile
  appRole: AppRole
  role: 'admin' | 'team' | 'client' | 'guest'
  isSuper: boolean
  isAdmin: boolean
  isManager: boolean
  isExternal: boolean
  perms: RolePermission[]
  sb: Awaited<ReturnType<typeof createClient>>
  admin: ReturnType<typeof createAdminClient>
  surface: Surface
  can: (section: PermissionSection, action: PermissionAction) => boolean
}

export async function buildAssistantCtx(surface: Surface): Promise<AssistantCtx | null> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  const [{ data: p }, { data: rp }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', user.id).single(),
    sb.from('role_permissions').select('*'),
  ])
  if (!p) return null

  const profile = p as Profile
  const appRole = profile.app_role
  const perms = (rp ?? []) as RolePermission[]

  const isSuper = isSuperAdminRaw(profile.email, appRole)
  const isAdmin = isSuper || isAdminRole(appRole) || profile.role === 'admin'

  return {
    userId: user.id,
    profile,
    appRole,
    role: coarseRole(appRole),
    isSuper,
    isAdmin,
    isManager: isAdmin || appRole === 'manager',
    isExternal: isExternalResource(appRole),
    perms,
    sb,
    admin: createAdminClient(),
    surface,
    can: (section, action) => hasPermission(profile, perms, section, action),
  }
}

/** Solo lo staff usa l'assistente: clienti e ospiti hanno portali separati (v2). */
export function isStaffCtx(c: AssistantCtx): boolean {
  return c.role === 'admin' || c.role === 'team'
}
