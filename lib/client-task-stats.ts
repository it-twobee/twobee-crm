import type { SupabaseClient } from '@supabase/supabase-js'

/** Conteggio task aperte per cliente + urgenza temporale, per la lista clienti attivi. */
export interface ClientTaskStats {
  remaining: number   // task non completate (escluse le milestone)
  imminent: number    // in scadenza entro IMMINENT_DAYS
  overdue: number     // già scadute e non completate
}

/** Task con scadenza entro questi giorni = "imminente" (arancione). */
export const IMMINENT_DAYS = 3

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Aggrega le task aperte per cliente. I task non hanno `client_id`: il legame passa
 * per `tasks.project_id → projects.client_id`. La query gira col client dell'utente,
 * quindi rispetta la RLS (task cestinate/non visibili escluse automaticamente).
 */
export async function fetchClientTaskStats(
  supabase: SupabaseClient,
  clientIds: string[],
): Promise<Record<string, ClientTaskStats>> {
  const out: Record<string, ClientTaskStats> = {}
  if (clientIds.length === 0) return out

  const { data: projects } = await supabase
    .from('projects')
    .select('id, client_id')
    .in('client_id', clientIds)
  const projRows = (projects ?? []) as { id: string; client_id: string }[]
  if (projRows.length === 0) return out

  const projToClient = new Map(projRows.map(p => [p.id, p.client_id]))
  const projectIds = projRows.map(p => p.id)

  const today = new Date()
  const todayStr = iso(today)
  const soon = new Date(today)
  soon.setDate(soon.getDate() + IMMINENT_DAYS)
  const soonStr = iso(soon)

  for (let i = 0; i < projectIds.length; i += 300) {
    const chunk = projectIds.slice(i, i + 300)
    const { data: tasks } = await supabase
      .from('tasks')
      .select('status, due_date, is_milestone, project_id')
      .in('project_id', chunk)
      .neq('status', 'completato')

    for (const t of (tasks ?? []) as { status: string; due_date: string | null; is_milestone: boolean | null; project_id: string }[]) {
      if (t.is_milestone) continue
      const cid = projToClient.get(t.project_id)
      if (!cid) continue
      const s = out[cid] ?? (out[cid] = { remaining: 0, imminent: 0, overdue: 0 })
      s.remaining++
      if (t.due_date) {
        if (t.due_date < todayStr) s.overdue++
        else if (t.due_date <= soonStr) s.imminent++
      }
    }
  }
  return out
}
