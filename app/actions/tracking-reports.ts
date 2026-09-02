'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireStaff } from '@/lib/tracking/guards'
import { run } from '@/lib/tracking/action-result'
import { TrackingError } from '@/lib/tracking/errors'
import { isVaultConfigured } from '@/lib/tracking/crypto'
import { hasAgencyKey, hasClientKey } from '@/lib/tracking/secrets'
import { definitionFor, periodLast30, type ReportPeriod, type ShapedReport } from '@/lib/tracking/reporting'
import { runHistory, loadReport } from '@/lib/tracking/reporting-store'
import {
  runGa4Report as ga4Runner, runKlaviyoReport as klaviyoRunner, runMetaReport as metaRunner,
  type Ga4ReportOutcome, type KlaviyoReportOutcome, type MetaReportOutcome, type ReportClient,
} from '@/lib/tracking/reporting-runners'
import { fetchMetadata, type Ga4Metadata } from '@/lib/tracking/ga4'
import { ga4ContextFor } from '@/lib/tracking/contexts'
import type { ClientTracking, TrackingReportRun } from '@/lib/types/database'

export type SourceState = { canRun: boolean; blockers: string[] }
export type ReportStatus = {
  propertyId: string
  leadEvent: string
  archetype: string | null
  definition: string | null
  period: ReportPeriod
  ga4: SourceState
  klaviyo: SourceState
  meta: SourceState
  runs: TrackingReportRun[]
}

/** Stato del tab: cosa manca per poter generare, per ogni fonte, più lo storico. */
export async function getReportStatus(clientId: string) {
  return run(async (): Promise<ReportStatus> => {
    await requireStaff()
    const admin = createAdminClient()
    const [{ data: tracking }, ga4Agency, klaviyoKey, metaAccount, metaToken, runs] = await Promise.all([
      admin.from('client_tracking').select('*').eq('client_id', clientId).maybeSingle(),
      hasAgencyKey(admin, 'ga4'), hasClientKey(admin, clientId, 'klaviyo'),
      hasClientKey(admin, clientId, 'meta'), hasAgencyKey(admin, 'meta'),
      runHistory(admin, clientId),
    ])
    const t = (tracking ?? null) as ClientTracking | null
    const vault = isVaultConfigured()
    const vaultBlocker = 'VAULT_KEY non configurata sul server: i segreti non sono leggibili'

    const ga4: string[] = []
    if (!t?.archetype) ga4.push('Assegna un archetipo al cliente nel tab Tracking (determina la definizione del report)')
    if (!t?.ga4_property_id) ga4.push('Inserisci il Property ID GA4 di questo cliente')
    if (!ga4Agency) ga4.push('Configura il service account GA4 in Impostazioni → Chiavi tracking')
    if (!vault) ga4.push(vaultBlocker)

    const klaviyo: string[] = []
    if (!klaviyoKey) klaviyo.push('Inserisci la chiave API Klaviyo nel tab Chiavi di questo cliente')
    if (!vault) klaviyo.push(vaultBlocker)

    const meta: string[] = []
    if (!metaAccount) meta.push("Inserisci l'Ad Account ID nel tab Chiavi di questo cliente")
    if (!metaToken) meta.push('Configura il token System User Meta in Impostazioni → Chiavi tracking')
    if (!vault) meta.push(vaultBlocker)

    let definition: string | null = null
    try { definition = t?.archetype ? definitionFor(t.archetype)?.title ?? null : null } catch (e) { ga4.push(String(e instanceof Error ? e.message : e)) }

    return {
      propertyId: t?.ga4_property_id ?? '', leadEvent: t?.lead_event ?? '', archetype: t?.archetype ?? null, definition,
      period: periodLast30(),
      ga4: { canRun: ga4.length === 0, blockers: ga4 },
      klaviyo: { canRun: klaviyo.length === 0, blockers: klaviyo },
      meta: { canRun: meta.length === 0, blockers: meta },
      runs,
    }
  })
}

async function reportClient(clientId: string, uid: string): Promise<ReportClient> {
  const { data } = await createAdminClient().from('client_tracking').select('*').eq('client_id', clientId).maybeSingle()
  if (!data) throw new TrackingError(409, 'Configura prima il tracking del cliente (archetipo, Property ID, chiavi)')
  return { id: clientId, tracking: data as ClientTracking, createdBy: uid }
}

function revalidate(clientId: string) {
  revalidatePath(`/clienti/${clientId}`)
  revalidatePath(`/workspace/clienti/${clientId}`)
}

export async function runGa4Report(clientId: string) {
  return run(async (): Promise<Ga4ReportOutcome> => {
    const { uid } = await requireStaff()
    const result = await ga4Runner(createAdminClient(), await reportClient(clientId, uid))
    revalidate(clientId)
    return result
  })
}

export async function runKlaviyoReport(clientId: string) {
  return run(async (): Promise<KlaviyoReportOutcome> => {
    const { uid } = await requireStaff()
    const result = await klaviyoRunner(createAdminClient(), await reportClient(clientId, uid))
    revalidate(clientId)
    return result
  })
}

export async function runMetaReport(clientId: string) {
  return run(async (): Promise<MetaReportOutcome> => {
    const { uid } = await requireStaff()
    const result = await metaRunner(createAdminClient(), await reportClient(clientId, uid))
    revalidate(clientId)
    return result
  })
}

export async function getReport(clientId: string, runId: string) {
  return run(async (): Promise<ShapedReport> => {
    await requireStaff()
    return loadReport(createAdminClient(), clientId, runId)
  })
}

/** Metriche e dimensioni realmente disponibili sulla property, custom comprese. */
export async function getGa4Metadata(clientId: string) {
  return run(async (): Promise<Ga4Metadata> => {
    await requireStaff()
    const admin = createAdminClient()
    const { data } = await admin.from('client_tracking').select('ga4_property_id').eq('client_id', clientId).maybeSingle()
    if (!data?.ga4_property_id) throw new TrackingError(409, 'Property ID GA4 mancante per questo cliente')
    const prepared = await ga4ContextFor(admin)
    if (!prepared.context) throw new TrackingError(409, prepared.error)
    return fetchMetadata(data.ga4_property_id as string, prepared.context)
  })
}
