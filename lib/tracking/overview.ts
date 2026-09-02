import type { SupabaseClient } from '@supabase/supabase-js'
import { summarize, type QaSummary } from './qa'
import type { ClientTracking, TrackingQaResult, TrackingQaRun } from '@/lib/types/database'

/**
 * Righe della pagina Tracking. `clients` è la tabella o la VIEW del portale
 * (`clients` per l'admin, `clients_workspace` per il team): la RLS decide
 * quali clienti; le tabelle tracking sono leggibili da tutto lo staff.
 */
export async function loadTrackingOverview(sb: SupabaseClient, clientsSource: 'clients' | 'clients_workspace') {
  const [{ data: clients }, { data: trackings }, { data: qaRows }, { data: runs }] = await Promise.all([
    sb.from(clientsSource).select('id, company_name, display_name, website, client_label').order('company_name'),
    sb.from('client_tracking').select('*'),
    sb.from('tracking_qa_results').select('client_id, check_key, status, detail, checked_at'),
    sb.from('tracking_qa_runs').select('*').not('finished_at', 'is', null).order('started_at', { ascending: false }).limit(1),
  ])
  const trackingBy = new Map(((trackings ?? []) as ClientTracking[]).map(t => [t.client_id, t]))
  const qaBy: Map<string, QaSummary> = summarize((qaRows ?? []) as TrackingQaResult[])
  type C = { id: string; company_name: string; display_name: string | null; website: string | null; client_label: string | null }
  const rows = ((clients ?? []) as C[])
    .filter(c => c.client_label !== 'perso')
    .map(c => ({
      id: c.id, name: c.display_name?.trim() || c.company_name, website: c.website,
      tracking: trackingBy.get(c.id) ?? null, qa: qaBy.get(c.id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
  return { rows, lastRun: ((runs ?? [])[0] ?? null) as TrackingQaRun | null }
}
