import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { salesAccess, uuid, type SalesAccess } from '@/lib/sales'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

export async function getSalesAccess() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const [{ data: p, error }, { data: grant }] = await Promise.all([
    sb.from('profiles').select('app_role,is_active').eq('id', user.id).single(),
    sb.from('profile_permissions').select('granted').eq('profile_id', user.id).eq('permission', 'can_view_deals').maybeSingle(),
  ])
  if (error || !p) return null
  const access = salesAccess(p.app_role, grant?.granted === true, p.is_active !== false)
  return access ? { actor: user.id, access, sb } : null
}

export async function requireSalesAccess() {
  const context = await getSalesAccess()
  if (!context) throw new Error('Accesso commerciale non abilitato')
  return context
}

/**
 * §430 — quali trattative sono di chi chiama.
 *
 * «Sue» vuol dire che è fra gli Account Owner (`deal_owners`, 236) o che è
 * l'assegnatario della riga (`assigned_to`, quello che legge la RLS di 223).
 * Tutte e due, perché la pagina e le azioni passano dal service role: se ne
 * guardassimo una sola, la RLS e l'elenco risponderebbero in modo diverso
 * alla stessa domanda.
 */
export async function leadDi(actor: string): Promise<Set<string>> {
  const db = createAdminClient()
  const [{ data: owner }, { data: assegnati }] = await Promise.all([
    db.from('deal_owners').select('deal_id').eq('profile_id', actor),
    db.from('deals').select('id').eq('assigned_to', actor),
  ])
  return new Set([
    ...(owner ?? []).map(r => r.deal_id as string),
    ...(assegnati ?? []).map(r => r.id as string),
  ])
}

/** admin e manager vedono tutto; chi è `owner` solo le sue (`salesAccess`) */
export const vedeTutto = (access: SalesAccess) => access === 'admin' || access === 'manager'

/**
 * §430 — la porta di ogni azione su **una** trattativa.
 *
 * `requireSalesAccess()` risponde «può entrare nell'area», non «può toccare
 * questa riga»: con il permesso concesso a un senior (§429), senza questo
 * controllo modificava qualunque lead mandando un id che non vede. L'id si
 * indovina male, ma un file `'use server'` è un endpoint (§329) e la regola
 * vale anche per chi ha il codice davanti.
 */
export async function requireDealAccess(dealId: unknown) {
  const contesto = await requireSalesAccess()
  uuid(dealId)
  if (!vedeTutto(contesto.access) && !(await leadDi(contesto.actor)).has(dealId)) {
    throw new Error('Questo lead non è fra i tuoi')
  }
  return contesto
}

/**
 * §425 — chi configura l'area commerciale, che non è chi la usa.
 *
 * Le fasi, i colori e l'ordine sono la forma del percorso di tutti: un
 * commerciale che se le riordina cambia la bacheca ai colleghi, e un manager
 * che ritira una fase la toglie dalle righe di chi sta lavorando. Quindi
 * **admin e super admin**, come per il resto della configurazione — non chi ha
 * `can_view_deals`, che è il permesso di lavorare i lead.
 *
 * Guarda `app_role`, non `role`: `role='admin'` è la mappatura grossolana per la
 * RLS e ci cade dentro chiunque sia stato promosso admin di ruolo.
 */
export async function requireSalesConfig(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles')
    .select('email, app_role, is_active').eq('id', user.id).maybeSingle()
  const puo = !!p && p.is_active !== false
    && (SUPER_ADMIN_EMAILS.includes(p.email) || p.app_role === 'super_admin' || p.app_role === 'admin')
  if (!puo) throw new Error('La configurazione del commerciale è di admin e super admin')
  return user.id
}

/** La stessa domanda senza lanciare: serve alla pagina, che reindirizza. */
export async function puoConfigurareSales(): Promise<boolean> {
  try { await requireSalesConfig(); return true } catch { return false }
}
