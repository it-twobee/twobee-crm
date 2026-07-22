'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Wizard unico di creazione progetto.
 *
 * Sostituisce gli otto punti di creazione sparsi (workspace-create ×2,
 * NewClientModal, PanoramicaTab, ProjectStatusTab, ProgettiClient,
 * CreateProjectModal, OperativaClient), nessuno dei quali chiedeva il servizio
 * né collegava un accordo economico.
 *
 * La creazione è **atomica**: passa dalla funzione Postgres
 * `create_project_from_wizard`, quindi o esiste tutto (progetto, fasi, sprint,
 * routine, task di startup, accordo) o non esiste niente. Una sequenza di
 * insert dal server non lo garantiva: un crash a metà avrebbe lasciato un
 * progetto con mezza struttura e nessuno se ne sarebbe accorto.
 */

export interface CatalogService {
  key: string
  name: string
  description: string | null
  service_line: string
  delivery_engine: string
  default_revenue_model: string
  growth_vertical: string | null
  suggested_duration_days: number | null
  default_billing_frequency: string | null
  icon: string | null
  phases: { key?: string; name: string }[]
  routines: { key?: string; title: string; description?: string; frequency: string; hours?: number }[]
  startup_tasks: { title: string; description?: string; hours?: number; priority?: string }[]
  position: number
}

export async function listCatalog() {
  const sb = await createClient()
  const { data, error } = await sb
    .from('service_catalog').select('*').eq('is_active', true).order('position')
  if (error) return { ok: false as const, error: error.message, services: [] }
  return { ok: true as const, services: (data ?? []) as unknown as CatalogService[] }
}

/** Contesto del cliente mostrato allo step 1: cosa ha già, per non duplicare. */
export async function clientContext(clientId: string) {
  const sb = await createClient()
  const [{ data: client }, { data: projects }] = await Promise.all([
    sb.from('clients').select('id, company_name, display_name, client_label, payment_status').eq('id', clientId).single(),
    sb.from('projects')
      .select('id, name, service_line, delivery_model, service_key, status, economic_status')
      .eq('client_id', clientId).neq('status', 'archiviato'),
  ])
  return {
    ok: true as const,
    client: client as { id: string; company_name: string; display_name: string | null; client_label: string | null; payment_status: string | null } | null,
    projects: (projects ?? []) as { id: string; name: string; service_line: string; delivery_model: string; service_key: string | null; status: string; economic_status: string }[],
  }
}

export interface WizardPayload {
  client_id: string
  service_key: string
  name?: string
  description?: string
  project_type?: string
  growth_vertical?: string | null
  start_date?: string
  desired_end_date?: string | null
  manager_id?: string | null
  startup_target_days?: number
  sprint_name?: string | null
  is_internal_project?: boolean
  phases?: { key?: string; name: string }[]
  routines?: { key?: string; title: string; description?: string; frequency: string; hours?: number }[]
  startup_tasks?: { title: string; description?: string; hours?: number; priority?: string }[]
  /** Solo admin. Un manager crea il progetto, l'admin gli assegna il valore. */
  agreement?: {
    label?: string
    amount: number
    revenue_model?: string
    billing_frequency?: string
    end_date?: string | null
  } | null
}

export interface WizardResult {
  project_id: string
  sprint_id: string | null
  stream_id: string | null
  phases: number
  routines: number
  startup_tasks: number
  economic_status: string
}

export async function createProjectFromWizard(payload: WizardPayload) {
  const sb = await createClient()

  const { data, error } = await sb.rpc('create_project_from_wizard', {
    payload: payload as unknown as Record<string, unknown>,
  })

  if (error) return { ok: false as const, error: error.message }

  const res = data as unknown as WizardResult
  revalidatePath('/progetti')
  revalidatePath(`/clienti/${payload.client_id}`)
  revalidatePath('/workload')
  return { ok: true as const, result: res }
}

/** Progetti senza accordo economico: la coda dell'admin (VIEW della 132). */
export async function listProjectsMissingAgreement() {
  const sb = await createClient()
  const { data, error } = await sb
    .from('projects_missing_agreement').select('*').order('created_at', { ascending: false })
  if (error) return { ok: false as const, error: error.message, projects: [] }
  return {
    ok: true as const,
    projects: (data ?? []) as { id: string; name: string; client_id: string; client_name: string; service_line: string; delivery_model: string; created_at: string }[],
  }
}
