'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireInternalStaff, requireAgencyKeyManager } from '@/lib/tracking/guards'
import { run } from '@/lib/tracking/action-result'
import { TrackingError } from '@/lib/tracking/errors'
import { getVaultKey, seal, open } from '@/lib/tracking/crypto'
import {
  readClientKey, writeClientKey, deleteClientKey, readAgencyKey, writeAgencyKey,
  deleteAgencyKey as dropAgencyKey,
} from '@/lib/tracking/secrets'
import { parseServiceAccount } from '@/lib/tracking/ga4'
import { normalizeUrl, text } from '@/lib/tracking/validate'
import {
  PLATFORMS, AGENCY_CREDENTIALS, isPlatformKey, isAgencyPlatformKey, type PlatformKey, type AgencyPlatformKey,
} from '@/lib/tracking/vocab'
import type { PlatformKeyStatus, AgencyKeyStatus, ClientLoginRow } from '@/lib/types/database'

function revalidate(clientId: string) {
  revalidatePath(`/clienti/${clientId}`)
  revalidatePath(`/workspace/clienti/${clientId}`)
}

function assertPlatform(platform: string): PlatformKey {
  if (!isPlatformKey(platform)) throw new TrackingError(400, `Piattaforma sconosciuta: ${platform}`)
  return platform
}

function assertAgencyPlatform(platform: string): AgencyPlatformKey {
  if (!isAgencyPlatformKey(platform)) throw new TrackingError(400, `Piattaforma sconosciuta: ${platform}`)
  const meta = AGENCY_CREDENTIALS.find(c => c.key === platform)!
  if (!meta.implemented) throw new TrackingError(409, `${meta.label}: connettore non ancora attivo`)
  return platform
}

/* ── Chiavi per cliente ────────────────────────────────────────────────── */

/** Stato degli slot: mai il valore. */
export async function listPlatformKeys(clientId: string) {
  return run(async (): Promise<PlatformKeyStatus[]> => {
    await requireInternalStaff()
    const { data, error } = await createAdminClient()
      .from('client_platform_keys').select('platform, updated_at').eq('client_id', clientId)
    if (error) throw new Error(error.message)
    const byPlatform = new Map((data ?? []).map(r => [r.platform as string, r.updated_at as string]))
    return PLATFORMS.map(p => ({
      platform: p.key, label: p.label, hint: p.hint,
      hasValue: byPlatform.has(p.key), updatedAt: byPlatform.get(p.key) ?? null,
    }))
  })
}

export async function revealPlatformKey(clientId: string, platform: string) {
  return run(async (): Promise<string> => {
    await requireInternalStaff()
    const value = await readClientKey(createAdminClient(), clientId, assertPlatform(platform))
    if (value === null) throw new TrackingError(404, 'Nessun valore salvato')
    return value
  })
}

export async function savePlatformKey(clientId: string, platform: string, value: string) {
  return run(async (): Promise<void> => {
    const { uid } = await requireInternalStaff()
    const v = String(value ?? '').trim()
    if (!v) throw new TrackingError(400, 'Il valore è vuoto: per cancellare usa «Rimuovi»')
    await writeClientKey(createAdminClient(), clientId, assertPlatform(platform), v, uid)
    revalidate(clientId)
  })
}

export async function deletePlatformKey(clientId: string, platform: string) {
  return run(async (): Promise<void> => {
    await requireInternalStaff()
    await deleteClientKey(createAdminClient(), clientId, assertPlatform(platform))
    revalidate(clientId)
  })
}

/* ── Accessi ad account (utente + password) ────────────────────────────── */

const LOGIN_COLUMNS = 'id, client_id, service, label, username, url, note, secret_blob, sort, created_at, updated_at'

type LoginDb = Omit<ClientLoginRow, 'has_secret'> & { secret_blob: string | null }

const present = ({ secret_blob, ...r }: LoginDb): ClientLoginRow => ({ ...r, has_secret: !!secret_blob })

export type LoginInput = {
  service?: string; label?: string; username?: string; url?: string; note?: string; sort?: number
  /** assente = non toccare la password; '' = cancellarla */
  secret?: string
}

function sanitizeLogin(input: LoginInput): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if ('service' in input) {
    out.service = text(input.service, 60)
    if (!out.service) throw new TrackingError(400, 'Il servizio è obbligatorio')
  }
  if ('label' in input) out.label = text(input.label, 120)
  if ('username' in input) out.username = text(input.username, 200)
  if ('url' in input) out.url = input.url?.trim() ? normalizeUrl(input.url) : ''
  if ('note' in input) out.note = text(input.note, 2000)
  if ('sort' in input) out.sort = Number.isFinite(input.sort) ? Math.trunc(input.sort!) : 0
  if ('secret' in input) out.secret_blob = input.secret ? seal(input.secret) : null
  return out
}

export async function listLogins(clientId: string) {
  return run(async (): Promise<ClientLoginRow[]> => {
    await requireInternalStaff()
    const { data, error } = await createAdminClient()
      .from('client_logins').select(LOGIN_COLUMNS).eq('client_id', clientId)
      .order('sort').order('created_at')
    if (error) throw new Error(error.message)
    return ((data ?? []) as LoginDb[]).map(present)
  })
}

export async function createLogin(clientId: string, input: LoginInput) {
  return run(async (): Promise<ClientLoginRow> => {
    const { uid } = await requireInternalStaff()
    const row = sanitizeLogin({ service: '', label: '', username: '', url: '', note: '', ...input })
    const { data, error } = await createAdminClient()
      .from('client_logins')
      .insert({ client_id: clientId, ...row, updated_by: uid })
      .select(LOGIN_COLUMNS).single()
    if (error) throw new Error(error.message)
    revalidate(clientId)
    return present(data as LoginDb)
  })
}

export async function updateLogin(clientId: string, id: string, input: LoginInput) {
  return run(async (): Promise<ClientLoginRow> => {
    const { uid } = await requireInternalStaff()
    const row = sanitizeLogin(input)
    if (Object.keys(row).length === 0) throw new TrackingError(400, 'Nessun campo da salvare')
    const { data, error } = await createAdminClient()
      .from('client_logins')
      .update({ ...row, updated_at: new Date().toISOString(), updated_by: uid })
      .eq('id', id).eq('client_id', clientId)
      .select(LOGIN_COLUMNS).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new TrackingError(404, 'Accesso non trovato')
    revalidate(clientId)
    return present(data as LoginDb)
  })
}

export async function revealLoginSecret(clientId: string, id: string) {
  return run(async (): Promise<string> => {
    await requireInternalStaff()
    const { data, error } = await createAdminClient()
      .from('client_logins').select('secret_blob').eq('id', id).eq('client_id', clientId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new TrackingError(404, 'Accesso non trovato')
    if (!data.secret_blob) throw new TrackingError(404, 'Nessuna password salvata')
    return open(data.secret_blob as string)
  })
}

export async function deleteLogin(clientId: string, id: string) {
  return run(async (): Promise<void> => {
    await requireInternalStaff()
    const { error } = await createAdminClient().from('client_logins').delete().eq('id', id).eq('client_id', clientId)
    if (error) throw new Error(error.message)
    revalidate(clientId)
  })
}

/* ── Chiavi d'agenzia (admin e manager) ────────────────────────────────── */

function revalidateAgency() {
  revalidatePath('/impostazioni/tracking')
  revalidatePath('/workspace/tracking/impostazioni')
}

export async function listAgencyKeys() {
  return run(async (): Promise<AgencyKeyStatus[]> => {
    await requireAgencyKeyManager()
    const { data, error } = await createAdminClient().from('agency_platform_keys').select('platform, updated_at')
    if (error) throw new Error(error.message)
    const byPlatform = new Map((data ?? []).map(r => [r.platform as string, r.updated_at as string]))
    return AGENCY_CREDENTIALS.map(c => ({
      platform: c.key, label: c.label, hint: c.hint, kind: c.kind, implemented: c.implemented,
      hasValue: byPlatform.has(c.key), updatedAt: byPlatform.get(c.key) ?? null,
    }))
  })
}

export async function revealAgencyKey(platform: string) {
  return run(async (): Promise<string> => {
    await requireAgencyKeyManager()
    const value = await readAgencyKey(createAdminClient(), assertAgencyPlatform(platform))
    if (value === null) throw new TrackingError(404, 'Nessun valore salvato')
    return value
  })
}

export async function saveAgencyKey(platform: string, value: string) {
  return run(async (): Promise<void> => {
    const { uid } = await requireAgencyKeyManager()
    getVaultKey()
    const key = assertAgencyPlatform(platform)
    const v = String(value ?? '').trim()
    if (!v) throw new TrackingError(400, 'Il valore è vuoto: per cancellare usa «Rimuovi»')
    // il JSON del service account si valida prima di cifrarlo: un file
    // sbagliato si scopre qui, non al primo report che fallisce
    if (key === 'ga4') parseServiceAccount(v)
    await writeAgencyKey(createAdminClient(), key, v, uid)
    revalidateAgency()
  })
}

export async function deleteAgencyKey(platform: string) {
  return run(async (): Promise<void> => {
    await requireAgencyKeyManager()
    await dropAgencyKey(createAdminClient(), assertAgencyPlatform(platform))
    revalidateAgency()
  })
}
