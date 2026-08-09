'use server'

import { createClient } from '@/lib/supabase/server'
import { createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { requireEconomicsAdmin } from '@/lib/economics-guard'
import { buildSchedule, type ScheduleSpec } from '@/lib/revenue'

export interface WizardTaskInput {
  title: string
  description?: string | null
  status?: string
  priority?: string
  assignee_id?: string | null
  due_date?: string | null
  estimated_hours?: number | null
  visibility?: string
  sort_order?: number
}
export interface WizardMilestoneInput {
  title: string
  description?: string | null
  milestone_type?: string
  status?: string
  owner_id?: string | null
  due_date?: string | null
  approval_required?: boolean
  deliverable?: string | null
  visibility?: string
  sort_order?: number
  tasks?: WizardTaskInput[]
}
export interface WizardRecurringInput {
  title: string
  description?: string | null
  frequency: string
  interval?: number
  weekdays?: number[] | null
  day_of_month?: number | null
  start_date?: string | null
  end_date?: string | null
  generation_lead_days?: number
  owner_id?: string | null
  priority?: string
  estimated_hours?: number | null
  visibility?: string
}
export interface WizardWorkstreamInput {
  name: string
  description?: string | null
  workstream_type?: string
  status?: string
  owner_id?: string | null
  priority?: string
  visibility?: string
  start_date?: string | null
  end_date?: string | null
  sort_order?: number
  milestones?: WizardMilestoneInput[]
  recurring?: WizardRecurringInput[]
}
export interface WizardPayload {
  project: {
    /** null = progetto interno, senza anagrafica cliente (migration 155) */
    client_id: string | null
    name: string
    description?: string | null
    area: string
    service_type: string
    service_subtype?: string | null
    operating_model?: string | null
    revenue_model?: string | null
    status?: string
    manager_id?: string | null
    priority?: string
    visibility?: string
    start_date?: string | null
    target_end_date?: string | null
  }
  members?: string[]
  workstreams?: WizardWorkstreamInput[]
}

/**
 * L'accordo economico deciso in fase di creazione.
 *
 * Nasce qui perché è qui che si decide: quando vendi un progetto sai già la
 * quota, la durata e come te la faranno pagare. Rimandarlo a dopo significa
 * avere progetti attivi senza un numero, che è esattamente il buco che il
 * conto economico non riesce a colmare.
 *
 * Tutti gli importi sono **imponibili**: l'IVA si calcola in Fiscale & Tasse.
 */
export interface WizardEconomics {
  label: string
  billing: 'recurring' | 'one_off'
  /** canone mensile se recurring, totale del lavoro se one_off */
  amount: number
  status: 'bozza' | 'attivo'
  payment_terms?: string | null
  /** piano rate per i lavori a corpo */
  schedule?: ScheduleSpec | null
  /** la lavorazione affidata fuori, se c'è */
  subcontract?: {
    label: string
    supplier: string | null
    amount: number
    /** ricalca la dilazione concordata col cliente */
    mirror: boolean
  } | null
}

/**
 * Crea l'accordo economico del progetto appena nato.
 *
 * Separata dalla creazione del progetto perché è un'altra decisione, con
 * un'altra autorizzazione: i progetti li creano anche i manager, i numeri li
 * vedono solo gli admin. Se fallisce, il progetto resta — meglio un progetto
 * senza quotazione che nessun progetto.
 */
export async function attachWizardEconomics(projectId: string, eco: WizardEconomics) {
  // §234 — la stessa porta del resto del dominio economico: era una copia in
  // più della domanda, e chiedeva `role` invece di `app_role`.
  const user = { id: await requireEconomicsAdmin() }

  const admin = createActorClient(user.id)
  const { data: project } = await admin.from('projects')
    .select('client_id, area, start_date, target_end_date').eq('id', projectId).single()
  if (!project?.client_id) throw new Error('L\'economics esiste solo sui progetti di un cliente')

  const { data: stream, error } = await admin.from('revenue_streams').insert({
    project_id: projectId,
    label: eco.label,
    kind: project.area === 'digital' ? 'digital' : 'growth',
    billing: eco.billing,
    amount: eco.amount,
    status: eco.status,
    start_date: project.start_date,
    end_date: eco.billing === 'one_off' ? project.target_end_date : null,
    payment_terms: eco.payment_terms ?? null,
    created_by: user.id,
  }).select('id').single()
  if (error) throw new Error(error.message)

  // le rate del cliente: senza, un lavoro a corpo non entra in nessun mese
  let drafts: { due_month: string; label: string; amount: number }[] = []
  if (eco.billing === 'one_off' && eco.schedule) {
    drafts = buildSchedule(eco.amount, eco.schedule)
    if (drafts.length) {
      const { error: e2 } = await admin.from('revenue_installments')
        .insert(drafts.map((d, i) => ({ stream_id: stream.id, ...d, sort_order: i * 10 })))
      if (e2) throw new Error(e2.message)
    }
  }

  // il subappalto, con la stessa dilazione se richiesto
  if (eco.subcontract && eco.subcontract.amount > 0) {
    const { data: center } = await admin.from('cost_centers')
      .select('id').eq('name', 'Delivery & Fornitori').maybeSingle()

    const base = {
      project_id: projectId,
      center_id: center?.id ?? null,
      category: 'Subappalto',
      cost_type: 'V' as const,
      vat_applied: true,
      supplier: eco.subcontract.supplier,
      payment_terms: eco.subcontract.mirror ? (eco.payment_terms ?? null) : null,
      is_active: true,
    }

    const rows = eco.subcontract.mirror && drafts.length
      ? drafts.map((d, i) => {
          const share = eco.amount > 0 ? d.amount / eco.amount : 1 / drafts.length
          return {
            ...base,
            label: `${eco.subcontract!.label} — ${d.label}`,
            amount: Math.round(eco.subcontract!.amount * share * 100) / 100,
            frequency: 'una_tantum' as const,
            start_month: d.due_month,
            sort_order: i * 10,
          }
        })
      : [{
          ...base,
          label: eco.subcontract.label,
          amount: eco.subcontract.amount,
          frequency: (eco.billing === 'recurring' ? 'mensile' : 'una_tantum') as string,
          start_month: project.start_date ? project.start_date.slice(0, 8) + '01' : null,
          sort_order: 0,
        }]

    const { error: e3 } = await admin.from('cost_items').insert(rows)
    if (e3) throw new Error(e3.message)
  }

  revalidatePath(`/progetti/${projectId}`)
  revalidatePath('/economics')
  revalidatePath(`/clienti/${project.client_id}`)
  return stream.id as string
}

export async function createProjectFromWizard(payload: WizardPayload): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile } = await sb
    .from('profiles').select('role, app_role').eq('id', user.id).single()
  const canCreate = profile?.role === 'admin' || profile?.app_role === 'manager'
  if (!canCreate) throw new Error('Permesso negato: solo admin o manager possono creare progetti')

  if (!payload.project?.name?.trim()) throw new Error('Nome progetto mancante')

  // §179: la RPC crea progetto, workstream e task — la cronologia deve saperlo da chi
  const { data, error } = await createActorClient(user.id)
    .rpc('create_project_from_template', { p_payload: payload, p_created_by: user.id })
  if (error) throw new Error(error.message)

  revalidatePath('/progetti')
  revalidatePath('/workspace/progetti')
  if (payload.project.client_id) revalidatePath(`/clienti/${payload.project.client_id}`)
  return data as string
}
