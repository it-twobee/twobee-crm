import 'server-only'
import { getViewer } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createActorClient } from '@/lib/supabase/admin'
import { isMissingPortalSchema, isPortalRole } from './model'
import { isUuid } from './access'

/* §397 — La porta di scrittura del cliente. Fin qui il portale leggeva soltanto,
   e `lib/portal/server.ts` non ha nemmeno il client di servizio: le scritture
   passano da qui, dopo aver verificato chi sei e per quale azienda.
   L'anteprima dello staff non scrive: guardare non è partecipare. */
export type PortalWriter = {
  userId: string
  name: string
  clientId: string
  role: 'referente' | 'collaboratore' | 'lettore'
  projectIds: string[] | 'all'
  session: Awaited<ReturnType<typeof createClient>>
  db: ReturnType<typeof createActorClient>
}
export type PortalWriterError = { status: number; error: string }

export function isWriterError(value: PortalWriter | PortalWriterError): value is PortalWriterError {
  return 'status' in value
}

export async function requirePortalWriter(clientId: string): Promise<PortalWriter | PortalWriterError> {
  const viewer = await getViewer()
  if (!viewer.user) return { status: 401, error: 'Non autorizzato' }
  if (!viewer.profile || viewer.profile.is_active === false) return { status: 403, error: 'Accesso non attivo' }
  if (!isPortalRole(viewer.profile)) return { status: 403, error: 'Questa azione è riservata agli account del portale cliente.' }
  if (!isUuid(clientId)) return { status: 404, error: 'Azienda non trovata' }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { status: 503, error: 'Caricamento non configurato in questo ambiente.' }

  const session = await createClient()
  const membership = await session.from('portal_memberships')
    .select('id, portal_role, project_scope').eq('client_id', clientId).is('revoked_at', null).maybeSingle()
  if (membership.error) {
    if (isMissingPortalSchema(membership.error)) return { status: 503, error: 'Lo spazio file non è ancora attivo.' }
    return { status: 503, error: 'Non è stato possibile verificare il tuo accesso. Riprova.' }
  }
  if (!membership.data) return { status: 404, error: 'Azienda non trovata' }
  if (membership.data.portal_role === 'lettore') {
    return { status: 403, error: 'Il tuo accesso è in sola lettura: chiedi al tuo referente di abilitarti.' }
  }

  let projectIds: string[] | 'all' = 'all'
  if (membership.data.project_scope !== 'all') {
    const scopes = await session.from('portal_project_access')
      .select('project_id').eq('membership_id', membership.data.id)
    if (scopes.error) return { status: 503, error: 'Non è stato possibile verificare i progetti condivisi. Riprova.' }
    projectIds = (scopes.data ?? []).map(s => s.project_id as string)
  }

  return {
    userId: viewer.user.id,
    name: viewer.profile.full_name?.trim() || 'Referente',
    clientId,
    role: membership.data.portal_role as PortalWriter['role'],
    projectIds,
    session,
    db: createActorClient(viewer.user.id),
  }
}
