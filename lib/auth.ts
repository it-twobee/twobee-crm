import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isAdminRole, isSuperAdminRaw, isWorkspaceRole } from '@/lib/permissions'
import type { Profile } from '@/lib/types/database'

/**
 * Una lettura dell'identità per richiesta, non una per file.
 *
 * Un caricamento del workspace faceva tre volte la stessa domanda: il layout
 * chiedeva chi sei, la pagina lo richiedeva, un componente annidato pure — e
 * ogni `auth.getUser()` è una chiamata di rete al server di autenticazione,
 * seguita da una query su `profiles`. Sei andate e ritorni prima che la pagina
 * cominciasse a comporsi.
 *
 * `cache()` di React tiene la risposta per la durata di **una** richiesta:
 * layout e pagina vedono lo stesso oggetto, e nessuna riga di dato attraversa
 * due utenti diversi.
 *
 * Colonne: il superset che serve a layout, dashboard e liste. Una sola stringa
 * `as const` perché supabase-js inferisce i tipi dal testo del `select` — una
 * concatenazione perderebbe l'inferenza (stessa ragione di `PROFILE_COLUMNS`).
 * `monthly_cost` resta fuori: è dato da founder, si chiede a mano.
 */
export const SESSION_PROFILE_COLUMNS = 'id, full_name, role, app_role, avatar_url, email, phone, area, competencies, job_title, is_active, invited_by, last_seen_at, created_at, resource_type, seniority, hire_date, birth_date, contract_type, google_connected' as const

export type SessionProfile = Profile & { google_connected: boolean | null }

/** L'utente autenticato, verificato dal server di auth. `null` se non c'è. */
export const getSessionUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/**
 * Il profilo di chi sta guardando. `null` se non autenticato o senza riga.
 * Deduplica anche la `getSessionUser()` che ci sta sotto.
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const user = await getSessionUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select(SESSION_PROFILE_COLUMNS)
    .eq('id', user.id)
    .single()
  return (data ?? null) as SessionProfile | null
})

/** Identità + ruolo già risolto: quello che serve a un gate, in una riga sola. */
export const getViewer = cache(async () => {
  const [user, profile] = await Promise.all([getSessionUser(), getSessionProfile()])
  const isSuperAdmin = isSuperAdminRaw(profile?.email, profile?.app_role)
  const isAdmin = isSuperAdmin || profile?.role === 'admin' || isAdminRole(profile?.app_role)
  return {
    user,
    profile,
    isSuperAdmin,
    isAdmin,
    // Confinato al workspace: staff non-admin. Non basta WORKSPACE_ROLES —
    // un `viewer` o un legacy con role='team' fuori lista resterebbe scoperto.
    isWorkspace: !isAdmin && (isWorkspaceRole(profile?.app_role) || profile?.role === 'team'),
  }
})
