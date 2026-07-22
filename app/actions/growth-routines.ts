'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isSuperAdminRaw, isAdminRole, isExternalResource } from '@/lib/permissions'
import {
  routineSeed, focusOf, periodKey, periodDue, periodsBetween, AUTO_CLOSE,
  type RoutineFrequency, type GrowthFocus,
} from '@/lib/growth-routines'

/**
 * Motore Growth: seed, generazione idempotente delle occorrenze e auto-chiusura.
 *
 * La generazione è sicura da rieseguire: `UNIQUE(routine_id, period_key)` più
 * `ON CONFLICT DO NOTHING` significa che due esecuzioni in parallelo, o un
 * doppio click, non creano duplicati. È il §20.11 garantito dal database e non
 * da un `if` nel codice.
 */

async function guard(): Promise<{ userId: string } | { error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: me } = await sb
    .from('profiles').select('email, app_role, role').eq('id', user.id).single()

  if (isExternalResource(me?.app_role)) return { error: 'Le risorse esterne non possono modificare le routine' }

  const admin = isSuperAdminRaw(me?.email, me?.app_role) || isAdminRole(me?.app_role) || me?.role === 'admin'
  if (admin || me?.app_role === 'manager') return { userId: user.id }

  return { error: 'Solo admin o manager possono gestire le routine' }
}

export interface RoutineRow {
  id: string
  project_id: string
  title: string
  description: string | null
  frequency: RoutineFrequency
  default_owner_id: string | null
  default_estimated_hours: number
  starts_on: string
  ends_on: string | null
  is_active: boolean
  template_key: string | null
  position: number
}

export async function listRoutines(projectId: string) {
  const sb = await createClient()
  const { data, error } = await sb
    .from('recurring_task_templates').select('*').eq('project_id', projectId)
    .order('position').order('title')
  if (error) return { ok: false as const, error: error.message, routines: [] }
  return { ok: true as const, routines: (data ?? []) as RoutineRow[] }
}

/**
 * Crea le routine di default sul progetto, scegliendo il set in base al focus
 * (e-commerce o lead generation). Idempotente per `template_key`: rilanciarlo
 * aggiunge solo le voci mancanti, non duplica quelle già presenti né
 * sovrascrive le personalizzazioni.
 */
export async function seedRoutines(projectId: string, focusOverride?: GrowthFocus) {
  const g = await guard()
  if ('error' in g) return { ok: false as const, error: g.error }

  const admin = createAdminClient()
  const { data: proj } = await admin
    .from('projects').select('id, project_type, service_line, client_id').eq('id', projectId).single()
  if (!proj) return { ok: false as const, error: 'Progetto inesistente' }

  const focus = focusOverride ?? focusOf((proj as { project_type: string | null }).project_type)
  const seed = routineSeed(focus)

  const { data: existing } = await admin
    .from('recurring_task_templates').select('template_key').eq('project_id', projectId)
  const have = new Set(((existing ?? []) as { template_key: string | null }[]).map(r => r.template_key))

  const toCreate = seed.filter(s => !have.has(s.key))
  if (toCreate.length === 0) return { ok: true as const, created: 0, focus }

  const { error } = await admin.from('recurring_task_templates').insert(
    toCreate.map((s, i) => ({
      project_id: projectId,
      title: s.title,
      description: s.description,
      frequency: s.frequency,
      default_estimated_hours: s.hours,
      template_key: s.key,
      position: i,
      is_active: true,
    })) as never,
  )
  if (error) return { ok: false as const, error: error.message }

  revalidatePath(`/clienti/${(proj as { client_id: string }).client_id}`)
  return { ok: true as const, created: toCreate.length, focus }
}

/**
 * Genera le occorrenze mancanti fino a `horizonDays` avanti.
 *
 * Non guarda cosa esiste già: prova a inserire tutto e lascia che sia il vincolo
 * di unicità a scartare i doppioni. Meno codice e nessuna finestra di race fra
 * il controllo e la scrittura.
 */
export async function generateOccurrences(projectId: string, horizonDays = 30) {
  const g = await guard()
  if ('error' in g) return { ok: false as const, error: g.error }

  const admin = createAdminClient()
  const { data: routines } = await admin
    .from('recurring_task_templates').select('*').eq('project_id', projectId).eq('is_active', true)

  const list = (routines ?? []) as RoutineRow[]
  if (list.length === 0) return { ok: true as const, created: 0 }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const horizon = new Date(today.getTime() + horizonDays * 86400000)

  const rows: Record<string, unknown>[] = []
  for (const r of list) {
    const from = new Date(Math.max(new Date(r.starts_on).getTime(), today.getTime()))
    const to = r.ends_on ? new Date(Math.min(new Date(r.ends_on).getTime(), horizon.getTime())) : horizon
    if (from > to) continue

    for (const d of periodsBetween(r.frequency, from, to)) {
      rows.push({
        project_id: projectId,
        routine_id: r.id,
        period_key: periodKey(r.frequency, d),
        title: r.title,
        description: r.description,
        status: 'da_fare',
        priority: 'media',
        work_type: 'routine',
        scope_type: 'project',
        estimated_hours: r.default_estimated_hours,
        assignee_id: r.default_owner_id,
        due_date: periodDue(r.frequency, d),
      })
    }
  }
  if (rows.length === 0) return { ok: true as const, created: 0 }

  // ON CONFLICT sull'indice unico (routine_id, period_key): i periodi già
  // generati vengono ignorati in silenzio. Qui sta l'idempotenza.
  const { data, error } = await admin.from('tasks')
    .upsert(rows as never, { onConflict: 'routine_id,period_key', ignoreDuplicates: true })
    .select('id')

  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/workload')
  revalidatePath('/workspace/workload')
  return { ok: true as const, created: (data ?? []).length }
}

/**
 * Chiude come `non_svolta` le occorrenze scadute delle routine ad alta frequenza
 * (decisione Q21, variante C+): una settimana saltata è persa, e lasciarla
 * scaduta a vita riempie le liste di rumore. Mensili e trimestrali NON si
 * toccano: un report lo consegni comunque, anche in ritardo.
 */
export async function closeSkippedOccurrences(projectId: string) {
  const g = await guard()
  if ('error' in g) return { ok: false as const, error: g.error }

  const admin = createAdminClient()
  const { data: routines } = await admin
    .from('recurring_task_templates').select('id, frequency').eq('project_id', projectId)

  const ids = ((routines ?? []) as { id: string; frequency: RoutineFrequency }[])
    .filter(r => AUTO_CLOSE.includes(r.frequency))
    .map(r => r.id)
  if (ids.length === 0) return { ok: true as const, closed: 0 }

  // Solo le occorrenze del periodo PRECEDENTE a quello corrente: quella in corso
  // resta aperta anche se la scadenza è passata di un giorno.
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7)

  const { data, error } = await admin.from('tasks')
    .update({ status: 'non_svolta' } as never)
    .in('routine_id', ids)
    .in('status', ['da_fare', 'in_corso'])
    .lt('due_date', cutoff.toISOString().slice(0, 10))
    .select('id')

  if (error) return { ok: false as const, error: error.message }
  revalidatePath('/workload')
  return { ok: true as const, closed: (data ?? []).length }
}

export async function updateRoutine(
  routineId: string,
  projectId: string,
  patch: Partial<Pick<RoutineRow, 'title' | 'description' | 'frequency' | 'default_owner_id' | 'default_estimated_hours' | 'is_active' | 'ends_on'>>,
) {
  const g = await guard()
  if ('error' in g) return { ok: false as const, error: g.error }

  const { error } = await createAdminClient()
    .from('recurring_task_templates').update(patch as never).eq('id', routineId)
  if (error) return { ok: false as const, error: error.message }

  revalidatePath(`/clienti`)
  return { ok: true as const }
}

/** Modifica della SOLA occorrenza: è una task come le altre, il template non si tocca. */
export async function updateOccurrence(
  taskId: string,
  patch: { status?: string; due_date?: string | null; assignee_id?: string | null; estimated_hours?: number | null },
) {
  const g = await guard()
  if ('error' in g) return { ok: false as const, error: g.error }

  const { error } = await createAdminClient()
    .from('tasks').update(patch as never).eq('id', taskId)
  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/workload')
  return { ok: true as const }
}

// ─── Iniziative ─────────────────────────────────────────────────────────────

export interface InitiativeRow {
  id: string
  project_id: string
  name: string
  description: string | null
  start_date: string | null
  end_date: string | null
  budget: number | null
  owner_id: string | null
  status: string
}

export async function listInitiatives(projectId: string) {
  const sb = await createClient()
  const { data, error } = await sb
    .from('growth_initiatives').select('*').eq('project_id', projectId)
    .order('start_date', { ascending: false, nullsFirst: false })
  if (error) return { ok: false as const, error: error.message, initiatives: [] }
  return { ok: true as const, initiatives: (data ?? []) as InitiativeRow[] }
}

export async function createInitiative(input: {
  project_id: string; name: string; description?: string | null
  start_date?: string | null; end_date?: string | null
  budget?: number | null; owner_id?: string | null
}) {
  const g = await guard()
  if ('error' in g) return { ok: false as const, error: g.error }
  if (!input.name.trim()) return { ok: false as const, error: 'Serve un nome' }

  const { error } = await createAdminClient().from('growth_initiatives').insert({
    project_id: input.project_id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    budget: input.budget ?? null,
    owner_id: input.owner_id || null,
    status: 'pianificata',
  } as never)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export async function updateInitiative(
  initiativeId: string,
  patch: Partial<Pick<InitiativeRow, 'name' | 'description' | 'start_date' | 'end_date' | 'budget' | 'owner_id' | 'status'>>,
) {
  const g = await guard()
  if ('error' in g) return { ok: false as const, error: g.error }

  const { error } = await createAdminClient()
    .from('growth_initiatives').update(patch as never).eq('id', initiativeId)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}
