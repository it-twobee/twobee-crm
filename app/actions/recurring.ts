'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { RecurrenceFrequency, Priority, Visibility } from '@/lib/types/database'
import { runRecurrences } from '@/lib/recurrence-run'

async function requireStaff(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin' && p?.role !== 'team') throw new Error('Permesso negato')
  return user.id
}

const rev = (projectId: string) => {
  revalidatePath(`/progetti/${projectId}`)
  revalidatePath(`/workspace/progetti/${projectId}`)
  /* §337 — e i posti dove l'occorrenza deve **comparire**: chi la riceve guarda
     lì, non la pagina del progetto. Rigenerare una ricorrente senza rivalidare
     «le mie attività» la fa apparire al prossimo caricamento casuale, cioè
     sembra che non sia successo niente. */
  revalidatePath('/le-mie-attivita')
  revalidatePath('/workspace/attivita')
  revalidatePath('/workspace')
  revalidatePath('/progetti')
}

/**
 * §337 — **genera subito**, e non aspetta il cron.
 *
 * Una ricorrente si scrive per darla a qualcuno, e finché la prima occorrenza
 * non esiste chi la riceve non ha niente da vedere: «l'ho assegnata» e «non mi
 * è arrivato niente» sono la stessa sera. Il giro è ristretto a una serie sola,
 * quindi costa quanto una riga.
 *
 * Non fa fallire l'azione: la regola è scritta, e se la materializzazione va
 * storta ci riprova il cron. Il contrario — perdere il template perché la
 * generazione è inciampata — sarebbe il danno peggiore.
 */
async function generaSubito(opts: { taskTemplateId?: string; milestoneTemplateId?: string }) {
  try { await runRecurrences(createAdminClient() as never, opts) }
  catch { /* ci ripensa il cron: la regola è salva, ed è quella che conta */ }
}

export async function createRecurring(input: {
  client_id: string | null
  project_id: string
  workstream_id: string
  milestone_id: string
  title: string
  frequency: RecurrenceFrequency
  interval?: number
  weekdays?: number[] | null
  day_of_month?: number | null
  start_date?: string | null
  end_date?: string | null
  generation_lead_days?: number
  owner_id?: string | null
  priority?: Priority
  visibility?: Visibility
}) {
  const uid = await requireStaff()
  const { data, error } = await createAdminClient().from('recurring_task_templates').insert({
    client_id: input.client_id,
    project_id: input.project_id,
    workstream_id: input.workstream_id,
    milestone_id: input.milestone_id,
    title: input.title.trim(),
    frequency: input.frequency,
    interval: input.interval ?? 1,
    weekdays: input.weekdays && input.weekdays.length ? input.weekdays : null,
    day_of_month: input.day_of_month ?? null,
    start_date: input.start_date || new Date().toISOString().slice(0, 10),
    end_date: input.end_date || null,
    generation_lead_days: input.generation_lead_days ?? 3,
    owner_id: input.owner_id || null,
    priority: input.priority ?? 'media',
    visibility: input.visibility ?? 'internal',
    active: true,
    created_by: uid,
  }).select('id').single()
  if (error) throw new Error(error.message)
  await generaSubito({ taskTemplateId: String((data as { id: string }).id) })
  rev(input.project_id)
}

export async function updateRecurring(id: string, projectId: string, updates: {
  title?: string
  frequency?: RecurrenceFrequency
  interval?: number
  weekdays?: number[] | null
  day_of_month?: number | null
  /* §338 — anche la data di partenza si corregge: «la review parte da gennaio»
     è una correzione normale, e le occorrenze già generate restano dove sono. */
  start_date?: string
  end_date?: string | null
  generation_lead_days?: number
  owner_id?: string | null
  priority?: Priority
  visibility?: Visibility
  active?: boolean
}) {
  await requireStaff()
  const patch = { ...updates }
  if ('weekdays' in patch) patch.weekdays = patch.weekdays && patch.weekdays.length ? patch.weekdays : null
  const { error } = await createAdminClient().from('recurring_task_templates').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  /* Cambiare la regola o il responsabile è il momento in cui serve rivederne
     l'effetto: le occorrenze già nate non si toccano (una task assegnata è
     lavoro di qualcuno), quelle che mancano nascono adesso. */
  await generaSubito({ taskTemplateId: id })
  rev(projectId)
}

export async function deleteRecurring(id: string, projectId: string) {
  await requireStaff()
  // le occorrenze già generate restano (recurring_template_id -> SET NULL da schema)
  const { error } = await createAdminClient().from('recurring_task_templates').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}

// ── §337 · milestone ricorrenti ──────────────────────────────────────────────

/**
 * Una tappa che torna: la chiusura del mese, la review trimestrale, il piano
 * stagionale. È una **regola che genera milestone vere** (una per periodo,
 * ognuna col suo stato) e non una riga con la data che avanza: quella
 * cancellerebbe il passato, e non si saprebbe più se la chiusura di settembre è
 * stata fatta in ritardo, perché quella riga adesso parla di ottobre.
 *
 * Sul calendario ne compare **una sola per serie** (`collapseSeries`), o dodici
 * bandierine identiche nasconderebbero le consegne vere.
 */
export async function createRecurringMilestone(input: {
  client_id: string | null
  project_id: string
  workstream_id: string
  title: string
  frequency: RecurrenceFrequency
  interval?: number
  weekdays?: number[] | null
  day_of_month?: number | null
  start_date?: string | null
  end_date?: string | null
  generation_lead_days?: number
  owner_id?: string | null
  approval_required?: boolean
  deliverable?: string | null
  visibility?: Visibility
}) {
  const uid = await requireStaff()
  if (!input.title.trim()) throw new Error('La tappa ha bisogno di un nome')
  const { data, error } = await createAdminClient().from('recurring_milestone_templates').insert({
    client_id: input.client_id,
    project_id: input.project_id,
    workstream_id: input.workstream_id,
    title: input.title.trim(),
    frequency: input.frequency,
    interval: input.interval ?? 1,
    weekdays: input.weekdays && input.weekdays.length ? input.weekdays : null,
    day_of_month: input.day_of_month ?? null,
    start_date: input.start_date || new Date().toISOString().slice(0, 10),
    end_date: input.end_date || null,
    /* Novanta giorni e non trenta: una tappa serve a **vederla arrivare**, e un
       trimestre di calendario è quello che si guarda per sapere se ci si sta
       mettendo dentro un'altra consegna. */
    generation_lead_days: input.generation_lead_days ?? 90,
    owner_id: input.owner_id || null,
    approval_required: input.approval_required ?? false,
    deliverable: input.deliverable || null,
    visibility: input.visibility ?? 'internal',
    active: true,
    created_by: uid,
  }).select('id').single()
  if (error) throw new Error(error.message)
  await generaSubito({ milestoneTemplateId: String((data as { id: string }).id) })
  rev(input.project_id)
}

export async function updateRecurringMilestone(id: string, projectId: string, updates: {
  title?: string
  frequency?: RecurrenceFrequency
  interval?: number
  weekdays?: number[] | null
  day_of_month?: number | null
  /* §338 — anche la data di partenza si corregge: «la review parte da gennaio»
     è una correzione normale, e le occorrenze già generate restano dove sono. */
  start_date?: string
  end_date?: string | null
  generation_lead_days?: number
  owner_id?: string | null
  approval_required?: boolean
  deliverable?: string | null
  visibility?: Visibility
  active?: boolean
}) {
  await requireStaff()
  const patch = { ...updates }
  if ('weekdays' in patch) patch.weekdays = patch.weekdays && patch.weekdays.length ? patch.weekdays : null
  const { error } = await createAdminClient()
    .from('recurring_milestone_templates').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  await generaSubito({ milestoneTemplateId: id })
  rev(projectId)
}

/**
 * Togliere la regola non toglie la storia: `recurring_template_id` va a NULL e
 * le tappe già generate restano dove sono. Una milestone completata è un fatto,
 * e cancellarla perché qualcuno ha spento la regola riscriverebbe il passato —
 * che è esattamente quello che questo modello esiste per non fare.
 */
export async function deleteRecurringMilestone(id: string, projectId: string) {
  await requireStaff()
  const { error } = await createAdminClient()
    .from('recurring_milestone_templates').delete().eq('id', id)
  if (error) throw new Error(error.message)
  rev(projectId)
}

/**
 * §337 — «genera adesso», dalla pagina.
 *
 * Il cron gira una volta al giorno; chi ha appena scritto tre regole vuole
 * vedere l'effetto senza aspettare domani. Restituisce il conto invece di un
 * silenzio: «0 nuove» è una risposta legittima — la finestra è già coperta — e
 * detta così non si legge come un errore (§277).
 */
export async function generateRecurrencesNow(projectId: string) {
  await requireStaff()
  const report = await runRecurrences(createAdminClient() as never)
  rev(projectId)
  return report
}
