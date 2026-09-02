import type { SupabaseClient } from '@supabase/supabase-js'
import { seal, open } from './crypto'
import { TrackingError } from './errors'
import type { PlatformKey, AgencyPlatformKey } from './vocab'

/**
 * Accesso ai segreti cifrati. Solo server, solo col service role: le tabelle
 * non hanno policy. Chi può chiamare queste funzioni lo decide la guard
 * dell'action, non questo file.
 */

type Admin = SupabaseClient

export async function readClientKey(admin: Admin, clientId: string, platform: PlatformKey): Promise<string | null> {
  const { data, error } = await admin
    .from('client_platform_keys').select('blob').eq('client_id', clientId).eq('platform', platform).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? open(data.blob as string) : null
}

export async function writeClientKey(admin: Admin, clientId: string, platform: PlatformKey, value: string, by: string) {
  const { error } = await admin.from('client_platform_keys').upsert(
    { client_id: clientId, platform, blob: seal(value), updated_at: new Date().toISOString(), updated_by: by },
    { onConflict: 'client_id,platform' },
  )
  if (error) throw new Error(error.message)
}

export async function deleteClientKey(admin: Admin, clientId: string, platform: PlatformKey) {
  const { error } = await admin.from('client_platform_keys').delete().eq('client_id', clientId).eq('platform', platform)
  if (error) throw new Error(error.message)
}

export async function readAgencyKey(admin: Admin, platform: AgencyPlatformKey): Promise<string | null> {
  const { data, error } = await admin.from('agency_platform_keys').select('blob').eq('platform', platform).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? open(data.blob as string) : null
}

/** Come readAgencyKey, ma con l'errore già pronto per chi ne ha bisogno. */
export async function requireAgencyKey(admin: Admin, platform: AgencyPlatformKey, what: string): Promise<string> {
  const value = await readAgencyKey(admin, platform)
  if (!value) throw new TrackingError(409, `${what} non configurato: va inserito in Impostazioni → Chiavi tracking`)
  return value
}

export async function writeAgencyKey(admin: Admin, platform: AgencyPlatformKey, value: string, by: string) {
  const { error } = await admin.from('agency_platform_keys').upsert(
    { platform, blob: seal(value), updated_at: new Date().toISOString(), updated_by: by },
    { onConflict: 'platform' },
  )
  if (error) throw new Error(error.message)
}

export async function deleteAgencyKey(admin: Admin, platform: AgencyPlatformKey) {
  const { error } = await admin.from('agency_platform_keys').delete().eq('platform', platform)
  if (error) throw new Error(error.message)
}

export async function hasAgencyKey(admin: Admin, platform: AgencyPlatformKey): Promise<boolean> {
  const { count } = await admin.from('agency_platform_keys').select('platform', { count: 'exact', head: true }).eq('platform', platform)
  return (count ?? 0) > 0
}

export async function hasClientKey(admin: Admin, clientId: string, platform: PlatformKey): Promise<boolean> {
  const { count } = await admin.from('client_platform_keys').select('platform', { count: 'exact', head: true })
    .eq('client_id', clientId).eq('platform', platform)
  return (count ?? 0) > 0
}
