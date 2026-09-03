import type { SupabaseClient } from '@supabase/supabase-js'
import { TrackingError, errorMessage } from './errors'
import { ga4ContextFor, metaContextFor, type Ga4Prepared } from './contexts'
import {
  fetchQaSite, checkGtm, checkMetaPixel, checkMetaPixelViaApi, checkGa4, promotionsFor, countProblems, viewsFor, summarize,
  type CheckResult, type QaResults, type QaCheckView, type QaSummary,
} from './qa-checks'
import type { QaCheckKey } from './vocab'
import type { ClientTracking, TrackingQaResult, TrackingQaRun } from '@/lib/types/database'

export type { CheckResult, QaCheckView, QaSummary } from './qa-checks'
export { summarize } from './qa-checks'

/**
 * §316 — QA giornaliero sul CRM: carica i clienti da Supabase, esegue i tre
 * controlli di `qa-checks.ts` e salva gli esiti. Una sola richiesta HTTP per
 * cliente; il service account GA4 si prepara una volta per tutta la tornata.
 */

type Admin = SupabaseClient
export type QaClient = { id: string; name: string; website: string | null; tracking: ClientTracking }

/** Esegue i tre controlli su un cliente e salva l'esito. */
export async function checkClient(admin: Admin, c: QaClient, ga4: Ga4Prepared): Promise<QaResults> {
  const target = { website: c.website, ...c.tracking }
  const site = await fetchQaSite(c.website)

  // Meta: se il connettore è configurato vince l'API, che dice se il pixel
  // riceve dati davvero; altrimenti si ricade sulla lettura dell'HTML.
  let metaResult: CheckResult | null = null
  const meta = await metaContextFor(admin, c.id)
  if (meta.context !== null) {
    try {
      metaResult = await checkMetaPixelViaApi(meta.adAccountId, meta.context)
    } catch (e) {
      console.error(`[qa] ${c.name} · pixel via API Meta: ${errorMessage(e)}`)
      metaResult = { status: 'problema', detail: `Meta non interrogabile: ${errorMessage(e)}` }
    }
  }

  const results: QaResults = {
    gtm: checkGtm(target, site),
    ga4: await checkGa4(target, ga4.context, ga4.error ?? undefined),
    meta_pixel: metaResult ?? checkMetaPixel(target, site),
  }

  const now = new Date().toISOString()
  const rows = (Object.entries(results) as [QaCheckKey, CheckResult][]).map(([check_key, r]) => ({
    client_id: c.id, check_key, status: r.status, detail: r.detail, checked_at: now,
  }))
  const { error } = await admin.from('tracking_qa_results').upsert(rows, { onConflict: 'client_id,check_key' })
  if (error) throw new Error(error.message)
  for (const [key, r] of Object.entries(results)) if (r.status === 'problema') console.warn(`[qa] ${c.name} · ${key}: ${r.detail}`)

  const patch = promotionsFor(c.tracking, results)
  if (Object.keys(patch).length) {
    for (const [field, to] of Object.entries(patch)) console.log(`[qa] ${c.name} · ${field}: → ${to} (verificato dal controllo)`)
    const { error: e2 } = await admin.from('client_tracking').update({ ...patch, updated_at: now }).eq('client_id', c.id)
    if (e2) console.error(`[qa] ${c.name} · promozione fallita: ${e2.message}`)
  }
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
  const problems = countProblems(results)
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
    for (const c of clients) problems += countProblems(await checkClient(admin, c, ga4))
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

export async function resultsFor(admin: Admin, clientId: string): Promise<QaCheckView[]> {
  const { data, error } = await admin.from('tracking_qa_results').select('*').eq('client_id', clientId)
  if (error) throw new Error(error.message)
  return viewsFor((data ?? []) as TrackingQaResult[])
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
