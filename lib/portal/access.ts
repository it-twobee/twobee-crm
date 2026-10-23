import { portalHref } from './model'

export const PORTAL_TAB = 10
export const PORTAL_ROLES = { referente: 'Referente', collaboratore: 'Collaboratore', lettore: 'Lettore' } as const
export type PortalRole = keyof typeof PORTAL_ROLES
export type PortalAccessInput = {
  email: string; name: string; role: PortalRole; scope: 'all' | 'selected'; projectIds: string[]
}
export type PortalMember = {
  id: string; profileId: string; name: string; email: string; role: PortalRole
  scope: 'all' | 'selected'; projectIds: string[]; revision: number
  revokedAt: string | null; active: boolean; activated: boolean
}
export type PortalAccessData = {
  members: PortalMember[]; projects: { id: string; name: string }[]; portalPath: string
}
export type PortalAccessLink = { url: string; kind: 'invite' | 'recovery' | 'login' }
export type PortalResult<T> = { data: T; error?: never } | { error: string; data?: never }

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function parsePortalAccess(input: PortalAccessInput): PortalAccessInput {
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : ''
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Inserisci un indirizzo email valido.')
  if (!name || name.length > 160) throw new Error('Inserisci il nome del referente (massimo 160 caratteri).')
  if (!Object.hasOwn(PORTAL_ROLES, input.role)) throw new Error('Ruolo portale non valido.')
  if (!['all', 'selected'].includes(input.scope)) throw new Error('Ambito progetti non valido.')
  if (!Array.isArray(input.projectIds) || input.projectIds.length > 200 || !input.projectIds.every(isUuid)) throw new Error('Selezione progetti non valida.')
  const projectIds = input.scope === 'all' ? [] : Array.from(new Set(input.projectIds))
  if (input.scope === 'selected' && !projectIds.length) throw new Error('Seleziona almeno un progetto oppure tutti i progetti condivisi.')
  return { email, name, role: input.role, scope: input.scope, projectIds }
}

export function portalAccessPath(clientId: string, workspace = false) {
  return `${workspace ? '/workspace' : ''}/clienti/${clientId}?tab=${PORTAL_TAB}`
}

/* §493 — l'unico ritorno libero dopo il login è la pagina che autorizza
   Claude, e solo nella sua forma esatta: un `next` qualunque sarebbe un
   reindirizzamento aperto verso un sito esterno. */
const RITORNO_CONSENSO = /^\/oauth\/consent\?authorization_id=[A-Za-z0-9_-]{1,200}$/

export function portalLoginDestination(search: string) {
  const params = new URLSearchParams(search)
  const next = params.get('next')
  if (next && RITORNO_CONSENSO.test(next)) return next
  const clientId = params.get('client')
  return isUuid(clientId) ? portalHref('/portale', clientId) : '/dashboard'
}

export function passwordLink(base: string, clientId: string, token: string, kind: 'invite' | 'recovery') {
  const url = new URL(portalHref('/reset-password', clientId), base)
  // Il segreto resta nel frammento: non arriva ai log HTTP né al rendering server.
  url.hash = new URLSearchParams({ token_hash: token, type: kind }).toString()
  return url.toString()
}
