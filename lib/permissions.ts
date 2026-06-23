import type { AppRole, PermissionSection, PermissionAction, Profile, RolePermission } from './types/database'

export const SUPER_ADMIN_EMAILS = ['m.lucci@twobee.it']
export const SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAILS[0] // legacy compat

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: '👑 Super Admin',
  admin: '🔑 Admin',
  manager: '📊 Manager',
  senior: '⭐ Senior',
  junior: '🌱 Junior',
  viewer: '👁 Viewer',
  client: '🏢 Cliente',
  guest: '🔗 Ospite',
}

export const ROLE_COLORS: Record<AppRole, string> = {
  super_admin: 'bg-gold text-black',
  admin: 'bg-gold/20 text-gold border border-gold/30',
  manager: 'bg-red-500/20 text-red-400 border border-red-500/30',
  senior: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  junior: 'bg-green-500/20 text-green-400 border border-green-500/30',
  viewer: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  client: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  guest: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',
}

export const SECTIONS: PermissionSection[] = ['clienti', 'fatturazione', 'task', 'chat', 'report', 'customer_care', 'impostazioni', 'mrr', 'anagrafica_fiscale']
export const ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete']

export const SECTION_LABELS: Record<PermissionSection, string> = {
  clienti: 'Clienti',
  fatturazione: 'Fatturazione',
  task: 'Task & Progetti',
  chat: 'Chat',
  report: 'Report KPI',
  customer_care: 'Customer Care',
  impostazioni: 'Impostazioni',
  mrr: 'MRR / Dati finanziari',
  anagrafica_fiscale: 'Anagrafica fiscale (P.IVA)',
}

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'Visualizza', create: 'Crea', edit: 'Modifica', delete: 'Elimina',
}

/** True se l'utente è super admin (GOD MODE) */
export function isSuperAdmin(profile: Profile | null): boolean {
  if (!profile) return false
  // Controlla sia email che app_role per robustezza (il campo email potrebbe non essere sincronizzato)
  return (!!profile.email && SUPER_ADMIN_EMAILS.includes(profile.email)) || profile.app_role === 'super_admin'
}

/** True se può gestire utenti e permessi */
export function isAdminOrAbove(profile: Profile | null): boolean {
  if (!profile) return false
  if (isSuperAdmin(profile)) return true
  return profile.app_role === 'admin'
}

/** Controlla un singolo permesso da una lista pre-caricata */
export function hasPermission(
  profile: Profile | null,
  perms: RolePermission[],
  section: PermissionSection,
  action: PermissionAction,
): boolean {
  if (!profile) return false
  if (isSuperAdmin(profile)) return true
  if (profile.app_role === 'admin') return true
  return perms.some((p) => p.role === profile.app_role && p.section === section && p.action === action && p.allowed)
}

/** Costruisce una mappa permessi per ruolo: { manager: { clienti: { view: true, ... }, ... } } */
export function buildPermMap(perms: RolePermission[]): Record<string, Record<string, Record<string, boolean>>> {
  const map: Record<string, Record<string, Record<string, boolean>>> = {}
  for (const p of perms) {
    if (!map[p.role]) map[p.role] = {}
    if (!map[p.role][p.section]) map[p.role][p.section] = {}
    map[p.role][p.section][p.action] = p.allowed
  }
  return map
}
