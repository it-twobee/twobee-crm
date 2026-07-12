import type { AppRole, PermissionSection, PermissionAction, Profile, RolePermission } from './types/database'

export const SUPER_ADMIN_EMAILS = ['m.lucci@twobee.it']
export const SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAILS[0] // legacy compat

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  founder:     'Founder',
  admin:       'Admin',
  manager:     'Manager',
  senior:      'Senior',
  junior:      'Junior',
  stage:       'Stage',
  freelance:   'Freelance',
  partner:     'Partner',
  viewer:      'Viewer',
  client:      'Cliente',
  guest:       'Ospite',
}

export const ROLE_COLORS: Record<AppRole, string> = {
  super_admin: 'bg-gold text-black',
  founder:     'bg-gold/30 text-gold border border-gold/40',
  admin:       'bg-gold/20 text-gold border border-gold/30',
  manager:     'bg-red-500/20 text-red-400 border border-red-500/30',
  senior:      'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  junior:      'bg-green-500/20 text-green-400 border border-green-500/30',
  stage:       'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  freelance:   'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  partner:     'bg-violet-500/20 text-violet-400 border border-violet-500/30',
  viewer:      'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  client:      'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  guest:       'bg-teal-500/20 text-teal-400 border border-teal-500/30',
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

// ─── Gruppi di ruolo ─────────────────────────────────────────────────────────
// Unica fonte di verità: il middleware e la UI devono concordare, altrimenti si
// nasconde una voce di menu lasciando la rotta raggiungibile.

/** Accesso al tool completo (dashboard admin, controllo gestione, direzione…) */
export const ADMIN_ROLES: AppRole[] = ['super_admin', 'founder', 'admin']

/** Dipendenti, collaboratori e partner: vivono solo dentro /workspace */
export const WORKSPACE_ROLES: AppRole[] = ['manager', 'senior', 'junior', 'stage', 'freelance', 'partner']

/** Il cliente vive solo dentro /portale */
export const CLIENT_ROLES: AppRole[] = ['client']

/**
 * Risorse ESTERNE: freelance (P.IVA) e partner. Hanno role='team' come il resto
 * del workspace, ma vedono SOLO i progetti in cui sono inclusi e in SOLA LETTURA.
 * Lo scoping è in RLS (migration 106, is_external_resource/get_my_project_ids);
 * qui è la fonte per il gate applicativo (server action + UI).
 */
export const EXTERNAL_ROLES: AppRole[] = ['freelance', 'partner']

export function isExternalResource(appRole: string | null | undefined): boolean {
  return EXTERNAL_ROLES.includes(appRole as AppRole)
}

export function isAdminRole(appRole: string | null | undefined): boolean {
  return ADMIN_ROLES.includes(appRole as AppRole)
}

export function isWorkspaceRole(appRole: string | null | undefined): boolean {
  return WORKSPACE_ROLES.includes(appRole as AppRole)
}

/**
 * app_role (granulare) → role (grezzo, quello che legge la RLS via get_my_role()
 * e su cui si appoggia il routing). Unica fonte di verità: la usano la
 * registrazione (invite/accept), l'admin che cambia ruolo, e implicitamente il
 * middleware. Se qui e altrove divergono, un utente finisce nel portale sbagliato.
 *
 * `viewer` è staff a sola lettura → 'team' (vive in /workspace, non nel tool admin).
 * `partner` è una risorsa esterna che lavora come il team → 'team', NON 'guest'.
 */
export function coarseRole(appRole: string | null | undefined): 'admin' | 'team' | 'client' | 'guest' {
  if (isAdminRole(appRole)) return 'admin'
  if (isWorkspaceRole(appRole) || appRole === 'viewer') return 'team'
  if (appRole === 'client') return 'client'
  return 'guest'
}

/** True se l'utente è super admin (GOD MODE) */
export function isSuperAdmin(profile: Profile | null): boolean {
  if (!profile) return false
  // Controlla sia email che app_role per robustezza (il campo email potrebbe non essere sincronizzato)
  return (!!profile.email && SUPER_ADMIN_EMAILS.includes(profile.email)) || profile.app_role === 'super_admin'
}

/** Variante per il middleware, dove abbiamo email e app_role sciolti (niente Profile completo) */
export function isSuperAdminRaw(email: string | null | undefined, appRole: string | null | undefined): boolean {
  return (!!email && SUPER_ADMIN_EMAILS.includes(email)) || appRole === 'super_admin'
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
