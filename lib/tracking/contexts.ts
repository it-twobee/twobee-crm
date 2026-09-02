import type { SupabaseClient } from '@supabase/supabase-js'
import { parseServiceAccount, type Ga4Context } from './ga4'
import { normalizeAdAccount, type MetaContext } from './meta'
import type { KlaviyoContext } from './klaviyo'
import { readAgencyKey, readClientKey } from './secrets'
import { isVaultConfigured } from './crypto'
import { errorMessage } from './errors'

/**
 * Prepara i contesti per le API a partire dai segreti cifrati. Non lanciano:
 * restituiscono `error` leggibile, perché il chiamante (report, QA, blocker
 * del tab Report) deve poter dire «manca X» senza interrompere il resto.
 */

export type Ga4Prepared = { context: Ga4Context; error: null } | { context: null; error: string }

/** Il service account si prepara una volta per tutta la tornata. */
export async function ga4ContextFor(admin: SupabaseClient): Promise<Ga4Prepared> {
  if (!isVaultConfigured()) return { context: null, error: 'VAULT_KEY non configurata: il service account non è leggibile' }
  try {
    const raw = await readAgencyKey(admin, 'ga4')
    if (!raw) return { context: null, error: 'Service account GA4 non configurato in Impostazioni → Chiavi tracking' }
    return { context: { account: parseServiceAccount(raw) }, error: null }
  } catch (e) {
    return { context: null, error: `Service account GA4 non utilizzabile: ${errorMessage(e)}` }
  }
}

export type MetaPrepared =
  | { context: MetaContext; adAccountId: string; error: null }
  | { context: null; adAccountId: null; error: string }

/** Token d'agenzia + Ad Account ID del cliente (slot Chiavi `meta`). */
export async function metaContextFor(admin: SupabaseClient, clientId: string): Promise<MetaPrepared> {
  if (!isVaultConfigured()) return { context: null, adAccountId: null, error: 'VAULT_KEY non configurata' }
  try {
    const [token, account] = await Promise.all([readAgencyKey(admin, 'meta'), readClientKey(admin, clientId, 'meta')])
    if (!token) return { context: null, adAccountId: null, error: 'Token Meta non configurato in Impostazioni → Chiavi tracking' }
    if (!account) return { context: null, adAccountId: null, error: 'Ad Account ID Meta non inserito nel tab Chiavi del cliente' }
    return { context: { token }, adAccountId: normalizeAdAccount(account), error: null }
  } catch (e) {
    return { context: null, adAccountId: null, error: `Connettore Meta non utilizzabile: ${errorMessage(e)}` }
  }
}

export type KlaviyoPrepared = { context: KlaviyoContext; error: null } | { context: null; error: string }

/** La chiave Klaviyo è per cliente: ogni cliente ha il suo account. */
export async function klaviyoContextFor(admin: SupabaseClient, clientId: string): Promise<KlaviyoPrepared> {
  if (!isVaultConfigured()) return { context: null, error: 'VAULT_KEY non configurata' }
  try {
    const apiKey = await readClientKey(admin, clientId, 'klaviyo')
    if (!apiKey) return { context: null, error: 'Chiave Klaviyo non inserita nel tab Chiavi del cliente' }
    return { context: { apiKey }, error: null }
  } catch (e) {
    return { context: null, error: `Chiave Klaviyo non utilizzabile: ${errorMessage(e)}` }
  }
}
