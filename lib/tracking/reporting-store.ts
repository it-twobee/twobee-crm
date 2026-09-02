import type { SupabaseClient } from '@supabase/supabase-js'
import { TrackingError } from './errors'
import { freezeDefinition, shapeReport, type CollectedRow, type FreezableDefinition, type ReportPeriod, type ShapedReport } from './reporting'
import type { ReportSource } from './vocab'
import type { TrackingReportRun, TrackingReportRow } from '@/lib/types/database'

type Admin = SupabaseClient

/** Si conservano gli ultimi 30 run per cliente; le righe cadono in cascata. */
export const KEEP_RUNS_PER_CLIENT = 30

export type RecordRunInput = {
  clientId: string
  source: ReportSource
  definition: FreezableDefinition
  period: ReportPeriod
  ok: boolean
  error: string | null
  durationMs: number
  rows?: CollectedRow[]
  createdBy?: string | null
}

/**
 * Scrive run e righe. La definizione viene congelata: i file JSON cambiano, e
 * un report di due mesi fa deve restare leggibile con le colonne che aveva.
 * Anche i run falliti restano, con l'errore.
 */
export async function recordRun(admin: Admin, input: RecordRunInput): Promise<string> {
  const frozen = freezeDefinition(input.definition)
  const rows = input.rows ?? []
  const { data: run, error } = await admin.from('tracking_report_runs').insert({
    client_id: input.clientId,
    source: input.source,
    definition: frozen,
    definition_ver: frozen.version ?? 1,
    period_start: input.period.start,
    period_end: input.period.end,
    compare_start: input.period.compareStart,
    compare_end: input.period.compareEnd,
    ok: input.ok,
    error: input.error,
    row_count: rows.length,
    duration_ms: input.durationMs,
    created_by: input.createdBy ?? null,
  }).select('id').single()
  if (error) throw new Error(error.message)
  const runId = run.id as string

  if (rows.length) {
    // l'ordine di inserimento è l'ordine di rilettura: un solo insert, in blocco
    const { error: e2 } = await admin.from('tracking_report_rows').insert(rows.map(r => ({ run_id: runId, ...r })))
    if (e2) throw new Error(e2.message)
  }

  await applyRunRetention(admin, input.clientId)
  return runId
}

async function applyRunRetention(admin: Admin, clientId: string) {
  const { data } = await admin.from('tracking_report_runs').select('id').eq('client_id', clientId)
    .order('created_at', { ascending: false }).range(KEEP_RUNS_PER_CLIENT, KEEP_RUNS_PER_CLIENT + 100)
  if (data?.length) await admin.from('tracking_report_runs').delete().in('id', data.map(r => r.id))
}

export async function runHistory(admin: Admin, clientId: string, limit = 20): Promise<TrackingReportRun[]> {
  const { data, error } = await admin.from('tracking_report_runs').select('*')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as TrackingReportRun[]
}

export async function loadReport(admin: Admin, clientId: string, runId: string): Promise<ShapedReport> {
  const [{ data: run, error }, { data: rows, error: e2 }] = await Promise.all([
    admin.from('tracking_report_runs').select('*').eq('id', runId).eq('client_id', clientId).maybeSingle(),
    admin.from('tracking_report_rows').select('*').eq('run_id', runId).order('id'),
  ])
  if (error) throw new Error(error.message)
  if (e2) throw new Error(e2.message)
  if (!run) throw new TrackingError(404, 'Report non trovato')
  return shapeReport(run as TrackingReportRun, (rows ?? []) as TrackingReportRow[])
}
