import type { SupabaseClient } from '@supabase/supabase-js'
import { TrackingError, errorMessage, isTrackingError } from './errors'
import { runReport } from './ga4'
import { accountInsights } from './meta'
import { listLiveFlows, findConversionMetric, flowValues } from './klaviyo'
import { ga4ContextFor, klaviyoContextFor, metaContextFor } from './contexts'
import {
  definitionFor, periodLast30, totalsMetrics, funnelQuery, breakdownQuery, eventParameterQuery, deriveFunnel,
  skippedEmpty, skippedUnavailable, ga4Snapshot, klaviyoMetrics, sumFlows,
  DEFAULT_LEAD_EVENT, KLAVIYO_DEFINITION, META_DEFINITION,
  type CollectedRow, type SkippedSection, type ShapedReport,
} from './reporting'
import { recordRun, loadReport } from './reporting-store'
import type { ClientTracking } from '@/lib/types/database'

type Admin = SupabaseClient
type Period = 'current' | 'previous'

export type ReportClient = { id: string; tracking: ClientTracking; createdBy?: string | null }

const status = (e: unknown) => (isTrackingError(e) ? e.status : 502)

/* ── GA4 ───────────────────────────────────────────────────────────────── */

export type Ga4ReportOutcome = ShapedReport & { sampled: boolean; skipped: SkippedSection[]; leadEvent: string }

/**
 * Sequenziale di proposito: se una query fallisce si sa esattamente quale, e
 * non si bruciano quote con una raffica di richieste in parallelo.
 */
export async function runGa4Report(admin: Admin, client: ReportClient, reference?: Date): Promise<Ga4ReportOutcome> {
  const t = client.tracking
  const def = definitionFor(t.archetype)
  if (!def) throw new TrackingError(409, 'Assegna un archetipo al cliente: determina la definizione del report')
  if (!t.ga4_property_id) throw new TrackingError(409, 'Property ID GA4 mancante per questo cliente')
  const prepared = await ga4ContextFor(admin)
  if (!prepared.context) throw new TrackingError(409, prepared.error)
  const ctx = prepared.context

  const period = periodLast30(reference)
  const startedAt = Date.now()
  const propertyId = t.ga4_property_id
  // evento del lead nel funnel: personalizzabile, non tutti l'hanno chiamato uguale in GTM
  const leadEvent = t.lead_event.trim() || DEFAULT_LEAD_EVENT

  const ranges: { period: Period; startDate: string; endDate: string }[] = [
    { period: 'current', startDate: period.start, endDate: period.end },
    { period: 'previous', startDate: period.compareStart, endDate: period.compareEnd },
  ]
  const collected: CollectedRow[] = []
  const skipped: SkippedSection[] = []
  let sampled = false

  try {
    for (const range of ranges) {
      const base = { propertyId, startDate: range.startDate, endDate: range.endDate }

      const totals = await runReport({ ...base, metrics: def.ga4.totals.metrics, limit: 1 }, ctx)
      sampled = sampled || totals.sampled
      collected.push({ period: range.period, scope: 'total', breakdown: null, dimensions: {}, metrics: totalsMetrics(totals.rows, def.ga4.totals.metrics) })

      // funnel: due query filtrate, le colonne derivate le calcoliamo qui
      // perché la Data API v1beta non espone un endpoint funnel
      for (const funnel of def.ga4.funnels ?? []) {
        const q = { ...base, ...funnelQuery(funnel) }
        const [visite, lead] = await Promise.all([runReport(q, ctx), runReport({ ...q, eventName: leadEvent }, ctx)])
          .catch(e => { throw new TrackingError(status(e), `Funnel "${funnel.id}": ${errorMessage(e)}`) })
        for (const row of deriveFunnel(visite.rows, lead.rows)) {
          collected.push({ period: range.period, scope: 'breakdown', breakdown: funnel.id, dimensions: row.dimensions, metrics: row.metrics })
        }
        sampled = sampled || visite.sampled || lead.sampled
      }

      for (const breakdown of def.ga4.breakdowns ?? []) {
        const result = await runReport({ ...base, ...breakdownQuery(breakdown) }, ctx)
          // attribuisce l'errore al blocco: un nome di metrica sbagliato dà un errore GA4 senza contesto
          .catch(e => { throw new TrackingError(status(e), `Blocco "${breakdown.id}": ${errorMessage(e)}`) })
        sampled = sampled || result.sampled
        for (const row of result.rows) {
          collected.push({ period: range.period, scope: 'breakdown', breakdown: breakdown.id, dimensions: row.dimensions, metrics: row.metrics })
        }
      }

      // parametri custom: dipendono dal GTM del cliente. Se la dimensione non è
      // registrata sulla property GA4 risponde con un errore, che qui NON deve
      // affondare il report: si salta la sezione e si dice perché.
      for (const param of def.ga4.eventParameters ?? []) {
        try {
          const result = await runReport({ ...base, ...eventParameterQuery(param) }, ctx)
          for (const row of result.rows) {
            collected.push({ period: range.period, scope: 'breakdown', breakdown: param.id, dimensions: row.dimensions, metrics: row.metrics })
          }
          if (result.rows.length === 0 && range.period === 'current') skipped.push(skippedEmpty(param))
        } catch (e) {
          if (range.period === 'current') skipped.push(skippedUnavailable(param, errorMessage(e)))
        }
      }
    }
  } catch (e) {
    await recordRun(admin, { clientId: client.id, source: 'ga4', definition: def, period, ok: false, error: errorMessage(e), durationMs: Date.now() - startedAt, createdBy: client.createdBy })
    throw e
  }

  const runId = await recordRun(admin, {
    clientId: client.id, source: 'ga4', definition: ga4Snapshot(def, leadEvent), period,
    ok: true, error: null, durationMs: Date.now() - startedAt, rows: collected, createdBy: client.createdBy,
  })
  return { ...(await loadReport(admin, client.id, runId)), sampled, skipped, leadEvent }
}

/* ── Klaviyo ───────────────────────────────────────────────────────────── */

export type KlaviyoReportOutcome = ShapedReport & { conversionMetric: string; flows: number }

/** Flussi attivi, stesso schema di GA4 con `source = 'klaviyo'`. */
export async function runKlaviyoReport(admin: Admin, client: ReportClient, reference?: Date): Promise<KlaviyoReportOutcome> {
  const prepared = await klaviyoContextFor(admin, client.id)
  if (!prepared.context) throw new TrackingError(409, prepared.error)
  const ctx = prepared.context
  const period = periodLast30(reference)
  const startedAt = Date.now()

  try {
    const flows = await listLiveFlows(ctx)
    if (flows.length === 0) throw new TrackingError(409, 'Nessun flusso attivo su questo account Klaviyo')
    const metric = await findConversionMetric(ctx)
    const flowIds = flows.map(f => f.id)

    const ranges: { period: Period; start: string; end: string }[] = [
      { period: 'current', start: period.start, end: period.end },
      { period: 'previous', start: period.compareStart, end: period.compareEnd },
    ]
    const collected: CollectedRow[] = []
    for (const range of ranges) {
      const values = await flowValues({ flowIds, conversionMetricId: metric.id, start: range.start, end: range.end }, ctx)
      const rows: CollectedRow[] = flows.map(flow => ({
        period: range.period, scope: 'breakdown', breakdown: 'flussi',
        dimensions: { flusso: flow.name }, metrics: klaviyoMetrics(values.get(flow.id)),
      }))
      collected.push(...rows, { period: range.period, scope: 'total', breakdown: null, dimensions: {}, metrics: sumFlows(rows) })
    }

    const runId = await recordRun(admin, {
      clientId: client.id, source: 'klaviyo', definition: KLAVIYO_DEFINITION, period,
      ok: true, error: null, durationMs: Date.now() - startedAt, rows: collected, createdBy: client.createdBy,
    })
    return { ...(await loadReport(admin, client.id, runId)), conversionMetric: metric.name, flows: flows.length }
  } catch (e) {
    await recordRun(admin, { clientId: client.id, source: 'klaviyo', definition: KLAVIYO_DEFINITION, period, ok: false, error: errorMessage(e), durationMs: Date.now() - startedAt, createdBy: client.createdBy })
    throw e
  }
}

/* ── Meta ──────────────────────────────────────────────────────────────── */

export type MetaReportOutcome = ShapedReport & { adAccountId: string; conversionActions: string[]; vuoto: boolean }

export async function runMetaReport(admin: Admin, client: ReportClient, reference?: Date): Promise<MetaReportOutcome> {
  const prepared = await metaContextFor(admin, client.id)
  if (!prepared.context) throw new TrackingError(409, prepared.error)
  const { context, adAccountId } = prepared
  const period = periodLast30(reference)
  const startedAt = Date.now()

  try {
    const ranges: { period: Period; since: string; until: string }[] = [
      { period: 'current', since: period.start, until: period.end },
      { period: 'previous', since: period.compareStart, until: period.compareEnd },
    ]
    const collected: CollectedRow[] = []
    let conversionActions: string[] = []
    let vuoto = true
    for (const range of ranges) {
      const insight = await accountInsights({ adAccountId, since: range.since, until: range.until }, context)
      if (range.period === 'current') { conversionActions = insight.conversionActions; vuoto = insight.vuoto }
      collected.push({ period: range.period, scope: 'total', breakdown: null, dimensions: {}, metrics: { ...insight.metrics } })
      for (const a of insight.actions) {
        collected.push({ period: range.period, scope: 'breakdown', breakdown: 'azioni', dimensions: { azione: a.action_type }, metrics: { conteggio: a.conteggio, costo_per_azione: a.costo_per_azione } })
      }
    }

    const runId = await recordRun(admin, {
      clientId: client.id, source: 'meta', definition: META_DEFINITION, period,
      ok: true, error: null, durationMs: Date.now() - startedAt, rows: collected, createdBy: client.createdBy,
    })
    return { ...(await loadReport(admin, client.id, runId)), adAccountId, conversionActions, vuoto }
  } catch (e) {
    await recordRun(admin, { clientId: client.id, source: 'meta', definition: META_DEFINITION, period, ok: false, error: errorMessage(e), durationMs: Date.now() - startedAt, createdBy: client.createdBy })
    throw e
  }
}
