import type { SupabaseClient } from '@supabase/supabase-js'
import { TrackingError, errorMessage } from './errors'
import { fetchSite, detectTags, type FoundTags } from './site-check'
import { normalizeUrl } from './validate'
import { runReport } from './ga4'
import { accountPixels } from './meta'
import { ga4ContextFor, metaContextFor, type Ga4Prepared } from './contexts'
import { QA_CHECKS, type QaCheckKey, type QaStatus, type TrackingStatus } from './vocab'
import type { ClientTracking, TrackingQaResult, TrackingQaRun } from '@/lib/types/database'

/**
 * §316 — QA giornaliero: tre controlli per cliente, salvati a DB.
 *
 * Quattro esiti, e le differenze contano:
 *  'na'            manca il dato per controllare (nessun Pixel ID, nessun URL)
 *  'indeterminato' controllato ma non conclude: il sito carica GTM, che
 *                  inietta i tag a runtime, quindi l'assenza dall'HTML non
 *                  dimostra niente. Giallo, non rosso.
 *  'problema'      assenza reale, o errore
 *  'ok'            verificato
 *
 * Una sola richiesta HTTP per cliente serve a GTM e Pixel; il service account
 * GA4 si prepara una volta per tutta la tornata.
 */

type Admin = SupabaseClient
export type CheckResult = { status: QaStatus; detail: string }
export type QaClient = { id: string; name: string; website: string | null; tracking: ClientTracking }

/** Ieri e l'altroieri, più oggi (incompleto). */
const GA4_WINDOW = { startDate: '2daysAgo', endDate: 'today' }

type Site = { ok: boolean; error: string | null; tags: Pick<FoundTags, 'gtmIds' | 'metaIds'> }
const NO_SITE: Site = { ok: false, error: 'Sito non interrogato', tags: { gtmIds: [], metaIds: [] } }

function checkGtm(c: QaClient, site: Site): CheckResult {
  if (!c.website) return { status: 'na', detail: 'URL del sito non inserito' }
  if (!c.tracking.gtm_container_id) return { status: 'na', detail: 'Nessun container GTM configurato in scheda' }
  if (!site.ok) return { status: 'problema', detail: site.error ?? 'Sito non raggiungibile' }
  const wanted = c.tracking.gtm_container_id.toUpperCase()
  if (site.tags.gtmIds.includes(wanted)) return { status: 'ok', detail: `${wanted} presente sul sito` }
  return {
    status: 'problema',
    detail: site.tags.gtmIds.length
      ? `GTM non trovato: sul sito c'è ${site.tags.gtmIds.join(', ')}, non ${wanted}`
      : `GTM non trovato sul sito (atteso ${wanted})`,
  }
}

const fmtWhen = (iso: string) => new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })

/**
 * Fonte di verità quando il connettore Meta è configurato: guarda se il pixel
 * ha ricevuto eventi di recente, non se il codice compare nell'HTML.
 * `null` = connettore non configurato, si usa l'HTML.
 */
async function checkMetaPixelViaApi(admin: Admin, c: QaClient): Promise<CheckResult | null> {
  const prepared = await metaContextFor(admin, c.id)
  if (prepared.context === null) return null
  const pixels = await accountPixels(prepared.adAccountId, prepared.context)
  if (pixels.length === 0) return { status: 'problema', detail: 'Nessun pixel collegato a questo ad account Meta' }

  const limit = Date.now() - 48 * 3600 * 1000
  const active = pixels.filter(p => p.lastFiredTime && Date.parse(p.lastFiredTime) >= limit)
  if (active.length) {
    const p = active[0]
    return { status: 'ok', detail: `Pixel "${p.name}" ha ricevuto eventi il ${fmtWhen(p.lastFiredTime!)}` }
  }
  const last = pixels.filter(p => p.lastFiredTime).sort((a, b) => Date.parse(b.lastFiredTime!) - Date.parse(a.lastFiredTime!))[0]
  return {
    status: 'problema',
    detail: last ? `Nessun evento pixel nelle ultime 48h · ultimo: ${fmtWhen(last.lastFiredTime!)}` : 'Il pixel non ha mai ricevuto eventi',
  }
}

function checkMetaPixel(c: QaClient, site: Site): CheckResult {
  const pixel = c.tracking.meta_pixel_id
  if (!pixel) return { status: 'na', detail: 'Nessun Pixel ID salvato per questo cliente' }
  if (!c.website) return { status: 'na', detail: 'URL del sito non inserito' }
  if (!site.ok) return { status: 'problema', detail: site.error ?? 'Sito non raggiungibile' }
  if (site.tags.metaIds.includes(pixel)) return { status: 'ok', detail: `Pixel ${pixel} presente sul sito` }
  // un altro Pixel nel sorgente è un dato concreto, anche con GTM attivo
  if (site.tags.metaIds.length) {
    return { status: 'problema', detail: `Meta Pixel non trovato: sul sito c'è ${site.tags.metaIds.join(', ')}, non ${pixel}` }
  }
  // nessun Pixel ma il sito carica GTM (uno qualsiasi): l'assenza non dimostra nulla
  if (site.tags.gtmIds.length) {
    return {
      status: 'indeterminato',
      detail: "Non deducibile dall'HTML: il sito carica GTM, e un Pixel configurato lì dentro non compare nel sorgente. " +
        'La verifica certa arriva dal connettore Meta (token in Impostazioni + Ad Account ID nel tab Chiavi).',
    }
  }
  return { status: 'problema', detail: 'Meta Pixel non trovato sul sito' }
}

async function checkGa4(c: QaClient, ga4: Ga4Prepared): Promise<CheckResult> {
  const property = c.tracking.ga4_property_id
  if (!property) return { status: 'na', detail: 'Property ID GA4 non inserito' }
  if (!ga4.context) return { status: 'na', detail: ga4.error }
  try {
    const result = await runReport({ propertyId: property, ...GA4_WINDOW, metrics: ['sessions', 'eventCount'], limit: 1 }, ga4.context)
    const sessions = result.rows[0]?.metrics.sessions ?? 0
    const events = result.rows[0]?.metrics.eventCount ?? 0
    if (sessions > 0 || events > 0) {
      return { status: 'ok', detail: `${sessions.toLocaleString('it-IT')} sessioni e ${events.toLocaleString('it-IT')} eventi nelle ultime 48h` }
    }
    return { status: 'problema', detail: `Nessun dato GA4 nelle ultime 48h (property ${property})` }
  } catch (e) {
    // il messaggio di Google è specifico: si riporta intero, non riassunto
    const msg = errorMessage(e)
    console.error(`[qa] GA4 property ${property}: ${msg}`)
    return { status: 'problema', detail: `GA4 non interrogabile: ${msg}` }
  }
}

/**
 * Un controllo riuscito è la prova più forte che il canale funziona. Solo
 * promozione, mai declassamento — stessa regola della verifica del sito.
 */
async function promoteChannels(admin: Admin, c: QaClient, results: Record<QaCheckKey, CheckResult>) {
  const patch: Record<string, TrackingStatus> = {}
  const pairs: [QaCheckKey, keyof ClientTracking][] = [['gtm', 'status_gtm'], ['ga4', 'status_ga4'], ['meta_pixel', 'status_meta_pixel']]
  for (const [key, field] of pairs) {
    if (results[key].status !== 'ok') continue
    const current = c.tracking[field] as TrackingStatus
    if (current === 'active' || current === 'na') continue
    patch[field] = 'active'
    console.log(`[qa] ${c.name} · ${field}: ${current} → active (verificato dal controllo)`)
  }
  if (Object.keys(patch).length === 0) return
  const { error } = await admin.from('client_tracking').update({ ...patch, updated_at: new Date().toISOString() }).eq('client_id', c.id)
  if (error) console.error(`[qa] ${c.name} · promozione fallita: ${error.message}`)
}

/** Esegue i tre controlli su un cliente e salva l'esito. */
export async function checkClient(admin: Admin, c: QaClient, ga4: Ga4Prepared): Promise<Record<QaCheckKey, CheckResult>> {
  let site: Site = NO_SITE
  if (c.website) {
    try {
      const fetched = await fetchSite(normalizeUrl(c.website))
      site = { ok: fetched.ok, error: fetched.error, tags: fetched.ok ? detectTags(fetched.html) : { gtmIds: [], metaIds: [] } }
    } catch (e) {
      site = { ok: false, error: errorMessage(e), tags: { gtmIds: [], metaIds: [] } }
    }
  }

  let metaResult: CheckResult | null = null
  try {
    metaResult = await checkMetaPixelViaApi(admin, c)
  } catch (e) {
    console.error(`[qa] ${c.name} · pixel via API Meta: ${errorMessage(e)}`)
    metaResult = { status: 'problema', detail: `Meta non interrogabile: ${errorMessage(e)}` }
  }

  const results: Record<QaCheckKey, CheckResult> = {
    gtm: checkGtm(c, site),
    ga4: await checkGa4(c, ga4),
    meta_pixel: metaResult ?? checkMetaPixel(c, site),
  }

  const now = new Date().toISOString()
  const rows = (Object.entries(results) as [QaCheckKey, CheckResult][]).map(([check_key, r]) => ({
    client_id: c.id, check_key, status: r.status, detail: r.detail, checked_at: now,
  }))
  const { error } = await admin.from('tracking_qa_results').upsert(rows, { onConflict: 'client_id,check_key' })
  if (error) throw new Error(error.message)
  for (const [key, r] of Object.entries(results)) if (r.status === 'problema') console.warn(`[qa] ${c.name} · ${key}: ${r.detail}`)

  await promoteChannels(admin, c, results)
  return results
}

/* ── caricamento clienti ────────────────────────────────────────────────── */

type ClientRow = { id: string; company_name: string; display_name: string | null; website: string | null; client_label: string | null }

/** Solo i clienti con una riga di tracking; i persi restano fuori dal giro. */
async function loadQaClients(admin: Admin, onlyId?: string): Promise<QaClient[]> {
  let q = admin.from('client_tracking').select('*')
  if (onlyId) q = q.eq('client_id', onlyId)
  const { data: trackings, error } = await q
  if (error) throw new Error(error.message)
  if (!trackings?.length) return []
  const ids = trackings.map(t => t.client_id as string)
  const { data: clients, error: e2 } = await admin.from('clients')
    .select('id, company_name, display_name, website, client_label').in('id', ids)
  if (e2) throw new Error(e2.message)
  const byId = new Map(((clients ?? []) as ClientRow[]).map(c => [c.id, c]))
  return (trackings as ClientTracking[])
    .map(t => {
      const c = byId.get(t.client_id)
      if (!c || (!onlyId && c.client_label === 'perso')) return null
      return { id: c.id, name: c.display_name?.trim() || c.company_name, website: c.website, tracking: t }
    })
    .filter((x): x is QaClient => x !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
}

export type QaRunSummary = { runId: string; clients: number; problems: number; durationMs: number }

/** Ricontrolla un solo cliente (pulsante nella sua scheda). */
export async function runQaForClient(admin: Admin, clientId: string): Promise<{ checks: QaCheckView[]; problems: number }> {
  const [c] = await loadQaClients(admin, clientId)
  if (!c) throw new TrackingError(409, 'Configura prima il tracking del cliente (archetipo, sito, identificativi)')
  const startedAt = Date.now()
  const results = await checkClient(admin, c, await ga4ContextFor(admin))
  const problems = Object.values(results).filter(r => r.status === 'problema').length
  console.log(`[qa] ricontrollo di ${c.name}: ${problems} problemi, ${Date.now() - startedAt} ms`)
  return { checks: await resultsFor(admin, clientId), problems }
}

/**
 * Tutto il portafoglio, in sequenza. Un run già aperto da meno di 30 minuti
 * blocca il successivo: due giri insieme raddoppierebbero le chiamate a GA4 e
 * Meta senza dire niente di più.
 */
export async function runQa(admin: Admin, origin: TrackingQaRun['origin']): Promise<QaRunSummary> {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { count } = await admin.from('tracking_qa_runs').select('id', { count: 'exact', head: true })
    .is('finished_at', null).gte('started_at', since)
  if ((count ?? 0) > 0) throw new TrackingError(409, 'Un controllo è già in corso: riprova tra qualche minuto')

  const startedAt = Date.now()
  const { data: run, error } = await admin.from('tracking_qa_runs').insert({ origin }).select('id').single()
  if (error) throw new Error(error.message)
  const runId = run.id as string

  let clientsCount = 0
  let problems = 0
  try {
    const clients = await loadQaClients(admin)
    clientsCount = clients.length
    const ga4 = await ga4ContextFor(admin)
    for (const c of clients) {
      const results = await checkClient(admin, c, ga4)
      problems += Object.values(results).filter(r => r.status === 'problema').length
    }
  } catch (e) {
    await admin.from('tracking_qa_runs').update({
      finished_at: new Date().toISOString(), clients: clientsCount, problems, duration_ms: Date.now() - startedAt, error: errorMessage(e),
    }).eq('id', runId)
    throw e
  }

  const durationMs = Date.now() - startedAt
  await admin.from('tracking_qa_runs').update({ finished_at: new Date().toISOString(), clients: clientsCount, problems, duration_ms: durationMs }).eq('id', runId)
  console.log(`[qa] controllo ${origin}: ${clientsCount} clienti, ${problems} problemi, ${durationMs} ms`)
  return { runId, clients: clientsCount, problems, durationMs }
}

/* ── lettura ───────────────────────────────────────────────────────────── */

export type QaCheckView = { key: QaCheckKey; label: string; needs: string; status: QaStatus | null; detail: string; checkedAt: string | null }

/** Esiti per cliente, nell'ordine dei controlli. `status` null = mai controllato. */
export async function resultsFor(admin: Admin, clientId: string): Promise<QaCheckView[]> {
  const { data, error } = await admin.from('tracking_qa_results').select('*').eq('client_id', clientId)
  if (error) throw new Error(error.message)
  const byKey = new Map(((data ?? []) as TrackingQaResult[]).map(r => [r.check_key, r]))
  return QA_CHECKS.map(check => {
    const row = byKey.get(check.key)
    return {
      key: check.key, label: check.label, needs: check.needs,
      status: row?.status ?? null, detail: row?.detail ?? 'Mai controllato', checkedAt: row?.checked_at ?? null,
    }
  })
}

export type QaSummary = { status: 'ok' | 'problema' | 'na'; problems: { key: QaCheckKey; detail: string }[]; verified: number; checkedAt: string }

/**
 * Un solo stato per cliente. Un cliente in cui nessun controllo è stato
 * possibile NON è verde: verde solo se almeno un controllo è passato davvero
 * e nessuno è fallito. `indeterminato` non è un problema.
 */
export function summarize(rows: Pick<TrackingQaResult, 'client_id' | 'check_key' | 'status' | 'detail' | 'checked_at'>[]): Map<string, QaSummary> {
  const map = new Map<string, QaSummary>()
  for (const row of rows) {
    let entry = map.get(row.client_id)
    if (!entry) { entry = { status: 'na', problems: [], verified: 0, checkedAt: row.checked_at }; map.set(row.client_id, entry) }
    if (row.status === 'problema') entry.problems.push({ key: row.check_key, detail: row.detail })
    else if (row.status === 'ok') entry.verified += 1
    if (row.checked_at > entry.checkedAt) entry.checkedAt = row.checked_at
  }
  for (const entry of Array.from(map.values())) entry.status = entry.problems.length ? 'problema' : entry.verified > 0 ? 'ok' : 'na'
  return map
}

export async function summaryByClient(admin: Admin): Promise<Map<string, QaSummary>> {
  const { data, error } = await admin.from('tracking_qa_results').select('client_id, check_key, status, detail, checked_at')
  if (error) throw new Error(error.message)
  return summarize((data ?? []) as TrackingQaResult[])
}

export async function lastRun(admin: Admin): Promise<TrackingQaRun | null> {
  const { data } = await admin.from('tracking_qa_runs').select('*').not('finished_at', 'is', null)
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  return (data ?? null) as TrackingQaRun | null
}
