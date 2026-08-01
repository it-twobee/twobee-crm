'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { ActivityLog, Profile } from '@/lib/types/database'

export type ActivityAuthor = Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
export type ActivityRow = ActivityLog & { user: ActivityAuthor | null }

export type ActivityFilters = {
  search?: string
  /** nome tabella, oppure 'tutti' */
  entityType?: string
  action?: 'create' | 'update' | 'delete' | 'tutti'
  /** id profilo, 'sistema' per le modifiche senza autore, 'tutti' per tutte */
  authorId?: string
  /** ISO YYYY-MM-DD, estremi inclusi */
  from?: string
  to?: string
}

/* Un file 'use server' esporta solo funzioni async: la dimensione della pagina
   resta qui dentro e chi chiama non ha bisogno di conoscerla. */
const PAGE_SIZE = 60

const SELECT = '*, user:profiles!activity_log_user_id_fkey(id, full_name, avatar_url)'

async function requireAdmin() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('email, app_role').eq('id', user.id).single()
  const ok = SUPER_ADMIN_EMAILS.includes(p?.email ?? '') || p?.app_role === 'admin'
  if (!ok) throw new Error('La cronologia completa è riservata agli admin')
  return sb
}

/**
 * Una pagina di cronologia, filtrata **sul database**.
 *
 * Filtrare in pagina le ultime 200 righe su settemila è un filtro che mente:
 * dice «nessun risultato» quando il risultato c'è, solo più indietro. Il conteggio
 * torna nella stessa richiesta delle righe, così la barra dei risultati non
 * costa un secondo viaggio.
 */
export async function fetchActivity(filters: ActivityFilters, offset = 0, limit = PAGE_SIZE): Promise<{
  rows: ActivityRow[]
  total: number
}> {
  const sb = await requireAdmin()

  let q = sb.from('activity_log').select(SELECT, { count: 'exact' })

  if (filters.entityType && filters.entityType !== 'tutti') q = q.eq('entity_type', filters.entityType)
  if (filters.action && filters.action !== 'tutti') q = q.eq('action', filters.action)
  if (filters.authorId === 'sistema') q = q.is('user_id', null)
  else if (filters.authorId && filters.authorId !== 'tutti') q = q.eq('user_id', filters.authorId)
  if (filters.from) q = q.gte('created_at', `${filters.from}T00:00:00`)
  if (filters.to) q = q.lte('created_at', `${filters.to}T23:59:59`)

  const term = filters.search?.trim()
  if (term) {
    // virgole e parentesi spezzerebbero la sintassi di `or`: fuori
    const safe = term.replace(/[%,().]/g, ' ')
    q = q.or(`entity_label.ilike.%${safe}%,entity_type.ilike.%${safe}%`)
  }

  const { data, count, error } = await q
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return { rows: (data ?? []) as unknown as ActivityRow[], total: count ?? 0 }
}

// ── Conservazione (§180) ─────────────────────────────────────────────────────

export type RetentionStatus = {
  /** giorni di vita di una riga; 0 = illimitata */
  retentionDays: number
  /** il giro notturno esiste davvero? Senza, la finestra è solo un'intenzione */
  scheduled: boolean
  lastPurgeAt: string | null
  lastPurgeRows: number
  /** righe che spariscono entro domani */
  expiringSoon: number
  /** la migration 180 non è stata eseguita */
  missing?: boolean
}

/**
 * Da quanto tempo si conserva la cronologia, e se qualcuno la sta davvero
 * ripulendo. Il secondo dato conta quanto il primo: promettere «20 giorni» a
 * chi ha un database senza pg_cron è dire una cosa falsa.
 */
export async function fetchRetentionStatus(): Promise<RetentionStatus> {
  const sb = await requireAdmin()
  const { data, error } = await sb.rpc('activity_retention_status')
  if (error) {
    return { retentionDays: 0, scheduled: false, lastPurgeAt: null, lastPurgeRows: 0, expiringSoon: 0, missing: true }
  }
  const r = data as {
    retention_days: number; scheduled: boolean
    last_purge_at: string | null; last_purge_rows: number; expiring_soon: number
  }
  return {
    retentionDays: r.retention_days,
    scheduled: r.scheduled,
    lastPurgeAt: r.last_purge_at,
    lastPurgeRows: r.last_purge_rows,
    expiringSoon: r.expiring_soon,
  }
}

/** 0 = conserva per sempre. Sotto i 7 giorni il CHECK del database rifiuta. */
export async function setRetentionDays(days: number): Promise<void> {
  await requireAdmin()
  if (days !== 0 && (days < 7 || days > 3650)) {
    throw new Error('La conservazione va da 7 a 3650 giorni, oppure 0 per non cancellare mai')
  }
  const { error } = await createAdminClient().from('activity_config')
    .update({ retention_days: days, updated_at: new Date().toISOString() }).eq('id', true)
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni/cronologia')
}

/** La purga a mano: serve quando pg_cron non c'è, e a vedere subito l'effetto di un cambio. */
export async function purgeActivityLog(): Promise<number> {
  await requireAdmin()
  const { data, error } = await createAdminClient().rpc('purge_activity_log')
  if (error) throw new Error(error.message)
  revalidatePath('/impostazioni/cronologia')
  return (data as number) ?? 0
}
