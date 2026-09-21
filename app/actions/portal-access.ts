'use server'

import { revalidatePath } from 'next/cache'
import { getViewer } from '@/lib/auth'
import { isLead } from '@/lib/clients'
import { createClient } from '@/lib/supabase/server'
import { createActorClient } from '@/lib/supabase/admin'
import { canManageClientPortal, isAdminRole, isSuperAdminRaw } from '@/lib/permissions'
import { isPortalRole, portalHref } from '@/lib/portal/model'
import { isUuid, parsePortalAccess, passwordLink } from '@/lib/portal/access'
import type { PortalAccessData, PortalAccessInput, PortalAccessLink, PortalResult } from '@/lib/portal/access'

function databaseError(error: { code?: string } | null) {
  if (!error) return
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) {
    throw new Error('Gestione accessi non ancora attiva: occorre applicare le migration 244 e 245 del portale.')
  }
  if (error.code === '40001') throw new Error('Accesso già presente o modificato da un altro utente. Aggiorna la scheda e riprova.')
  throw new Error('Non è stato possibile aggiornare o leggere gli accessi. Riprova.')
}

function failure(error: unknown) {
  return { error: error instanceof Error ? error.message : 'Operazione non riuscita. Riprova.' }
}

function appOrigin() {
  const value = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (!value) throw new Error('Indirizzo del gestionale non configurato.')
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Indirizzo del gestionale non valido.')
  return url.origin
}

async function requirePortalManager(clientId: string) {
  const { user, profile } = await getViewer()
  if (!user || !canManageClientPortal(profile)) throw new Error('Solo amministrativi e manager attivi possono gestire il portale cliente.')
  if (!isUuid(clientId)) throw new Error('Cliente non valido.')
  const session = await createClient()
  const admin = isAdminRole(profile?.app_role) || isSuperAdminRaw(profile?.email, profile?.app_role)
  const result = await session.from(admin ? 'clients' : 'clients_workspace')
    .select('id,client_label').eq('id', clientId).maybeSingle()
  databaseError(result.error)
  if (!result.data) throw new Error('Cliente non disponibile o non autorizzato.')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Gestione accessi non configurata in questo ambiente.')
  const db = createActorClient(user.id)
  // Verifica anche lo schema prima di creare utenti o generare credenziali Auth.
  const schema = await db.rpc('portal_access_manager', { p_client: clientId })
  databaseError(schema.error)
  return { db, session, actor: user.id, lead: isLead(result.data) }
}

type Context = Awaited<ReturnType<typeof requirePortalManager>>

async function projectsFor(context: Context, clientId: string) {
  const result = await context.session.from('projects').select('id,name').eq('client_id', clientId).is('deleted_at', null).order('name')
  databaseError(result.error)
  return result.data ?? []
}

async function validateProjects(context: Context, clientId: string, input: PortalAccessInput) {
  if (context.lead) throw new Error('Acquisisci il lead come cliente prima di abilitare il portale.')
  const projects = await projectsFor(context, clientId)
  if (input.projectIds.some(id => !projects.some(p => p.id === id))) throw new Error('Uno dei progetti selezionati non appartiene a questo cliente o non è più disponibile.')
}

async function portalAccount(context: Context, profileId: string) {
  const profile = await context.db.from('profiles').select('id,role,app_role,is_active').eq('id', profileId).maybeSingle()
  databaseError(profile.error)
  if (!isPortalRole(profile.data) || !['client', 'guest'].includes(profile.data?.app_role ?? '') || profile.data?.is_active === false) {
    throw new Error('Questa persona non ha un account cliente attivo. Gli account del team non si gestiscono dal portale cliente.')
  }
  const auth = await context.db.auth.admin.getUserById(profileId)
  if (auth.error || !auth.data.user?.email) throw new Error('Account non disponibile nel servizio di autenticazione.')
  const user = auth.data.user
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) throw new Error('Questo account è disabilitato.')
  return user
}

async function membershipFor(context: Context, clientId: string, profileId: string, activeOnly = false) {
  if (!isUuid(profileId)) throw new Error('Referente non valido.')
  const result = await context.db.from('portal_memberships').select('id,revision,revoked_at')
    .eq('client_id', clientId).eq('profile_id', profileId).maybeSingle()
  databaseError(result.error)
  if (!result.data || (activeOnly && result.data.revoked_at)) throw new Error('Accesso al cliente assente o revocato.')
  return result.data
}

async function issueLink(context: Context, clientId: string, profileId: string): Promise<PortalAccessLink> {
  const member = await membershipFor(context, clientId, profileId, true)
  const user = await portalAccount(context, profileId)
  const kind = user.email_confirmed_at ? 'recovery' : 'invite'
  const origin = appOrigin()
  const result = await context.db.auth.admin.generateLink({ type: kind, email: user.email!, options: {
    redirectTo: new URL(portalHref('/reset-password', clientId), origin).toString(),
  } })
  if (result.error || !result.data.properties?.hashed_token || result.data.user?.id !== profileId) {
    throw new Error('Non è stato possibile generare il link personale. Riprova.')
  }
  // Una revoca avvenuta durante la chiamata Auth non deve consegnare un nuovo link.
  const current = await membershipFor(context, clientId, profileId, true)
  if (current.revision !== member.revision) throw new Error('Accesso modificato durante la generazione. Aggiorna la scheda.')
  const audit = await context.db.from('portal_events').insert({
    client_id: clientId, entity_table: 'portal_memberships', entity_id: member.id,
    action: kind === 'invite' ? 'invite_link' : 'password_reset_link', actor_id: context.actor,
  })
  databaseError(audit.error)
  return { kind, url: passwordLink(origin, clientId, result.data.properties.hashed_token, kind) }
}

function refresh(clientId: string) {
  revalidatePath(`/clienti/${clientId}`)
  revalidatePath(`/workspace/clienti/${clientId}`)
  revalidatePath('/portale', 'layout')
}

export async function getClientPortalAccess(clientId: string): Promise<PortalResult<PortalAccessData>> {
  try {
    const context = await requirePortalManager(clientId)
    const [members, scopes, projects] = await Promise.all([
      context.db.from('portal_memberships').select('id,profile_id,portal_role,project_scope,revoked_at,revision').eq('client_id', clientId).order('created_at'),
      context.db.from('portal_project_access').select('membership_id,project_id').eq('client_id', clientId),
      projectsFor(context, clientId),
    ])
    databaseError(members.error); databaseError(scopes.error)
    const rows = members.data ?? []
    const profiles = rows.length ? await context.db.from('profiles').select('id,full_name,is_active,role,app_role').in('id', rows.map(m => m.profile_id)) : { data: [], error: null }
    databaseError(profiles.error)
    const entries = await Promise.all(rows.map(async m => {
      const profile = profiles.data?.find(p => p.id === m.profile_id)
      const account = await context.db.auth.admin.getUserById(m.profile_id)
      if (account.error || !account.data.user) throw new Error('Non è stato possibile leggere lo stato di tutti gli account. Riprova.')
      const user = account.data.user
      return {
        id: m.id, profileId: m.profile_id, name: profile?.full_name || 'Referente', email: user.email ?? '',
        role: m.portal_role, scope: m.project_scope, revision: m.revision, revokedAt: m.revoked_at,
        projectIds: (scopes.data ?? []).filter(p => p.membership_id === m.id).map(p => p.project_id),
        active: !!profile && profile.is_active !== false && isPortalRole(profile) && ['client', 'guest'].includes(profile.app_role ?? '')
          && !(user.banned_until && new Date(user.banned_until).getTime() > Date.now()),
        activated: !!user.email_confirmed_at,
      }
    }))
    return { data: { members: entries, projects, portalPath: portalHref('/portale', clientId) } }
  } catch (error) { return failure(error) }
}

export async function inviteClientPortal(clientId: string, raw: PortalAccessInput): Promise<PortalResult<PortalAccessLink>> {
  try {
    const context = await requirePortalManager(clientId)
    const input = parsePortalAccess(raw)
    await validateProjects(context, clientId, input)
    const origin = appOrigin()
    const found = await context.db.from('profiles').select('id')
      .ilike('email', input.email.replace(/[\\%_]/g, '\\$&')).maybeSingle()
    databaseError(found.error)
    let profileId = found.data?.id as string | undefined
    let invitation: { token: string; userId: string } | null = null
    if (!profileId) {
      const result = await context.db.auth.admin.generateLink({ type: 'invite', email: input.email,
        options: { data: { full_name: input.name }, redirectTo: new URL(portalHref('/reset-password', clientId), origin).toString() },
      })
      if (result.error || !result.data.user || !result.data.properties?.hashed_token) {
        throw new Error('Invito non creato. Se l’email ha già un account, verifica che il profilo sia disponibile e riprova.')
      }
      profileId = result.data.user.id
      invitation = { token: result.data.properties.hashed_token, userId: profileId }
    }
    const user = await portalAccount(context, profileId)
    if (user.email?.toLowerCase() !== input.email) throw new Error('L’indirizzo dell’account è cambiato. Aggiorna il referente prima di invitarlo.')
    const saved = await context.db.rpc('portal_save_access', {
      p_client: clientId, p_profile: profileId, p_role: input.role, p_scope: input.scope,
      p_projects: input.projectIds, p_revision: null,
    })
    databaseError(saved.error)
    refresh(clientId)
    if (invitation) return { data: { kind: 'invite', url: passwordLink(origin, clientId, invitation.token, 'invite') } }
    if (!user.email_confirmed_at) return { data: await issueLink(context, clientId, profileId) }
    return { data: { kind: 'login', url: new URL(portalHref('/portale', clientId), origin).toString() } }
  } catch (error) { return failure(error) }
}

export async function updateClientPortalAccess(clientId: string, profileId: string, revision: number, raw: PortalAccessInput): Promise<PortalResult<null>> {
  try {
    const context = await requirePortalManager(clientId)
    await membershipFor(context, clientId, profileId)
    const input = parsePortalAccess(raw)
    await validateProjects(context, clientId, input)
    await portalAccount(context, profileId)
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Versione accesso non valida.')
    const result = await context.db.rpc('portal_save_access', {
      p_client: clientId, p_profile: profileId, p_role: input.role, p_scope: input.scope,
      p_projects: input.projectIds, p_revision: revision,
    })
    databaseError(result.error); refresh(clientId)
    return { data: null }
  } catch (error) { return failure(error) }
}

export async function revokeClientPortalAccess(clientId: string, profileId: string, revision: number): Promise<PortalResult<null>> {
  try {
    const context = await requirePortalManager(clientId)
    await membershipFor(context, clientId, profileId, true)
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Versione accesso non valida.')
    const result = await context.db.rpc('portal_revoke_access', { p_client: clientId, p_profile: profileId, p_revision: revision })
    databaseError(result.error); refresh(clientId)
    return { data: null }
  } catch (error) { return failure(error) }
}

export async function resetClientPortalPassword(clientId: string, profileId: string): Promise<PortalResult<PortalAccessLink>> {
  try {
    const context = await requirePortalManager(clientId)
    return { data: await issueLink(context, clientId, profileId) }
  } catch (error) { return failure(error) }
}
