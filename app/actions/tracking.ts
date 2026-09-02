'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { requireStaff } from '@/lib/tracking/guards'
import { run } from '@/lib/tracking/action-result'
import { TrackingError } from '@/lib/tracking/errors'
import { channelsFor, CHANNEL_KEYS, type TrackingStatus } from '@/lib/tracking/vocab'
import {
  normalizeUrl, parseArchetype, parseStatus, parseGtmContainerId, parseLeadEvent,
  parseMetaPixelId, parseGa4PropertyId, text,
} from '@/lib/tracking/validate'
import { fetchSite, detectTags, evaluate, assertPublicHost, type FoundTags, type EvaluationInput } from '@/lib/tracking/site-check'
import { templateFor, mergeChecklist, hasItem, EMPTY_CHECKLIST, type MergedChecklist, type ChecklistItemState } from '@/lib/tracking/checklist'
import type { ClientTracking, TrackingCheck, TrackingChange } from '@/lib/types/database'

function revalidate(clientId: string) {
  revalidatePath(`/clienti/${clientId}`)
  revalidatePath(`/workspace/clienti/${clientId}`)
  revalidatePath('/tracking')
  revalidatePath('/workspace/tracking')
}

export type ClientTrackingView = { tracking: ClientTracking | null; website: string }

export async function getClientTracking(clientId: string) {
  return run(async (): Promise<ClientTrackingView> => {
    await requireStaff()
    const admin = createAdminClient()
    const [{ data: tracking }, { data: client, error }] = await Promise.all([
      admin.from('client_tracking').select('*').eq('client_id', clientId).maybeSingle(),
      admin.from('clients').select('website').eq('id', clientId).single(),
    ])
    if (error || !client) throw new TrackingError(404, 'Cliente non trovato')
    return { tracking: (tracking ?? null) as ClientTracking | null, website: client.website ?? '' }
  })
}

export type ClientTrackingPatch = Partial<Pick<ClientTracking,
  'archetype' | 'cms' | 'gtm_container_id' | 'meta_pixel_id' | 'ga4_property_id' | 'lead_event' |
  'status_gtm' | 'status_ga4' | 'status_meta_pixel' | 'status_klaviyo' | 'status_gsc'
>>

const STATUS_FIELDS = ['status_gtm', 'status_ga4', 'status_meta_pixel', 'status_klaviyo', 'status_gsc'] as const

/** Scrive solo i campi inviati, validati uno per uno. */
export async function upsertClientTracking(clientId: string, patch: ClientTrackingPatch) {
  return run(async (): Promise<ClientTracking> => {
    const { uid } = await requireStaff()
    const admin = createAdminClient()
    const { data: existing } = await admin.from('client_tracking').select('*').eq('client_id', clientId).maybeSingle()

    const row: Record<string, unknown> = {}
    if ('archetype' in patch) row.archetype = parseArchetype(patch.archetype)
    if ('cms' in patch) row.cms = text(patch.cms, 80)
    if ('gtm_container_id' in patch) row.gtm_container_id = parseGtmContainerId(patch.gtm_container_id)
    if ('meta_pixel_id' in patch) row.meta_pixel_id = parseMetaPixelId(patch.meta_pixel_id)
    if ('ga4_property_id' in patch) row.ga4_property_id = parseGa4PropertyId(patch.ga4_property_id)
    if ('lead_event' in patch) row.lead_event = parseLeadEvent(patch.lead_event)
    for (const f of STATUS_FIELDS) if (f in patch) row[f] = parseStatus(f, patch[f])

    // Alla prima assegnazione di un archetipo i canali non pertinenti partono
    // da «non applicabile», come alla creazione in arealavoro. Solo quando
    // l'archetipo cambia davvero e solo sui canali ancora a «da fare».
    const prevArch = existing?.archetype ?? null
    if ('archetype' in row && row.archetype !== prevArch) {
      const relevant = new Set(channelsFor(row.archetype as string | null))
      for (const key of CHANNEL_KEYS) {
        const f = `status_${key}` as const
        const current = (row[f] ?? existing?.[f] ?? 'todo') as TrackingStatus
        if (!relevant.has(key) && current === 'todo') row[f] = 'na'
        if (relevant.has(key) && current === 'na' && !(f in patch)) row[f] = 'todo'
      }
    }

    if (Object.keys(row).length === 0) throw new TrackingError(400, 'Nessun campo da salvare')
    row.updated_at = new Date().toISOString()
    row.updated_by = uid

    const { data, error } = await admin
      .from('client_tracking')
      .upsert({ client_id: clientId, ...row }, { onConflict: 'client_id' })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    revalidate(clientId)
    return data as ClientTracking
  })
}

/** L'URL del sito vive su `clients.website`: lo usano verifica e QA. */
export async function updateClientWebsite(clientId: string, url: string) {
  return run(async (): Promise<string> => {
    const { uid } = await requireStaff()
    const website = normalizeUrl(url)
    const { error } = await createActorClient(uid)
      .from('clients')
      .update({ website: website || null })
      .eq('id', clientId)
    if (error) throw new Error(error.message)
    revalidate(clientId)
    return website
  })
}

/* ── Verifica automatica del sito ──────────────────────────────────────── */

export type SiteCheckOutcome = {
  ok: boolean
  url: string
  httpStatus: number | null
  error: string | null
  found: FoundTags
  /** dice a chi legge se l'assenza di un tag nell'HTML sia concludente */
  gtmPresente: boolean
  changes: TrackingChange[]
  notes: string[]
  bytes: number
  durationMs: number
}

const NO_TAGS: FoundTags = { gtmIds: [], ga4Ids: [], gtagLoaded: false, metaIds: [], fbevents: false, klaviyo: false }

/** Scarica la homepage, applica le modifiche di stato e registra l'esito. */
export async function runSiteCheck(clientId: string) {
  return run(async (): Promise<SiteCheckOutcome> => {
    await requireStaff()
    const admin = createAdminClient()
    const [{ data: client }, { data: tracking }] = await Promise.all([
      admin.from('clients').select('website').eq('id', clientId).single(),
      admin.from('client_tracking').select('*').eq('client_id', clientId).maybeSingle(),
    ])
    if (!client) throw new TrackingError(404, 'Cliente non trovato')
    if (!client.website) throw new TrackingError(409, "Aggiungi l'URL del sito prima di lanciare la verifica")
    const t = (tracking ?? {
      archetype: null, gtm_container_id: '', meta_pixel_id: '',
      status_gtm: 'todo', status_ga4: 'todo', status_meta_pixel: 'todo', status_klaviyo: 'todo',
    }) as EvaluationInput

    const url = normalizeUrl(client.website)
    assertPublicHost(url)
    const result = await fetchSite(url)
    const found = result.ok ? detectTags(result.html) : NO_TAGS
    // se la pagina non si è scaricata non si conclude nulla: nessuna modifica
    const { changes, notes, gtmPresente } = result.ok ? evaluate(t, found) : { changes: [], notes: [], gtmPresente: false }

    if (changes.length > 0) {
      const patch: Record<string, unknown> = { client_id: clientId, updated_at: new Date().toISOString() }
      for (const c of changes) patch[c.field] = c.to
      const { error } = await admin.from('client_tracking').upsert(patch, { onConflict: 'client_id' })
      if (error) throw new Error(error.message)
    }

    const { error: insErr } = await admin.from('tracking_checks').insert({
      client_id: clientId, url: result.finalUrl, ok: result.ok, http_status: result.httpStatus, error: result.error,
      gtm_ids: found.gtmIds, ga4_ids: found.ga4Ids, meta_ids: found.metaIds, klaviyo: found.klaviyo,
      changes, bytes: result.bytes, duration_ms: result.durationMs,
    })
    if (insErr) throw new Error(insErr.message)

    // storico: le ultime 50 per cliente
    const { data: old } = await admin.from('tracking_checks').select('id').eq('client_id', clientId)
      .order('checked_at', { ascending: false }).range(50, 200)
    if (old && old.length) await admin.from('tracking_checks').delete().in('id', old.map(r => r.id))

    revalidate(clientId)
    return {
      ok: result.ok, url: result.finalUrl, httpStatus: result.httpStatus, error: result.error,
      found, gtmPresente, changes, notes, bytes: result.bytes, durationMs: result.durationMs,
    }
  })
}

export async function getCheckHistory(clientId: string, limit = 10) {
  return run(async (): Promise<TrackingCheck[]> => {
    await requireStaff()
    const { data, error } = await createAdminClient().from('tracking_checks').select('*')
      .eq('client_id', clientId).order('checked_at', { ascending: false }).limit(limit)
    if (error) throw new Error(error.message)
    return (data ?? []) as TrackingCheck[]
  })
}

/* ── Checklist per archetipo ───────────────────────────────────────────── */

/** Template dell'archetipo corrente più l'avanzamento salvato. */
export async function getChecklist(clientId: string) {
  return run(async (): Promise<MergedChecklist> => {
    await requireStaff()
    const admin = createAdminClient()
    const { data: tracking } = await admin.from('client_tracking').select('archetype').eq('client_id', clientId).maybeSingle()
    const template = templateFor(tracking?.archetype as string | null | undefined)
    if (!template) return EMPTY_CHECKLIST
    const { data: states, error } = await admin.from('tracking_checklist_state')
      .select('item_id, done, note, updated_at').eq('client_id', clientId)
    if (error) throw new Error(error.message)
    return mergeChecklist(template, (states ?? []) as ChecklistItemState[])
  })
}

/** Spunta e/o nota di una voce; l'id deve esistere nel template dell'archetipo. */
export async function setChecklistItem(clientId: string, itemId: string, patch: { done?: boolean; note?: string }) {
  return run(async (): Promise<MergedChecklist> => {
    await requireStaff()
    const admin = createAdminClient()
    const { data: tracking } = await admin.from('client_tracking').select('archetype').eq('client_id', clientId).maybeSingle()
    const template = templateFor(tracking?.archetype as string | null | undefined)
    if (!template) throw new TrackingError(409, 'Assegna un archetipo al cliente per avere una checklist')
    if (!hasItem(template, itemId)) throw new TrackingError(404, `Voce sconosciuta: ${itemId}`)

    const { data: existing } = await admin.from('tracking_checklist_state').select('done, note')
      .eq('client_id', clientId).eq('item_id', itemId).maybeSingle()
    const row = {
      client_id: clientId, item_id: itemId,
      done: 'done' in patch ? !!patch.done : (existing?.done ?? false),
      note: 'note' in patch ? text(patch.note, 1000) : (existing?.note ?? ''),
      updated_at: new Date().toISOString(),
    }
    const { error } = await admin.from('tracking_checklist_state').upsert(row, { onConflict: 'client_id,item_id' })
    if (error) throw new Error(error.message)

    const { data: states } = await admin.from('tracking_checklist_state').select('item_id, done, note, updated_at').eq('client_id', clientId)
    return mergeChecklist(template, (states ?? []) as ChecklistItemState[])
  })
}
