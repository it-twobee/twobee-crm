'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'

/** Cosa si porta via l'eliminazione: si mostra prima di chiedere conferma. */
export type DeletionPreview = {
  clients: number
  projects: number
  tasks: number
  contracts: number
  revenueLines: number
  channels: number
}

/** `{ error }` se non passa, `{ userId }` se passa: l'id serve alla cronologia (§179). */
async function requireAdmin(): Promise<{ userId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase.from('profiles').select('email, app_role').eq('id', user.id).single()
  if (!profile) return { error: 'Profilo non trovato' }

  const isAdmin = SUPER_ADMIN_EMAILS.includes(profile.email ?? '') || profile.app_role === 'admin'
  return isAdmin ? { userId: user.id } : { error: 'Permesso negato: solo gli admin possono eliminare clienti' }
}

/**
 * Quanto cade insieme al cliente. Tutte le FK sono ON DELETE CASCADE tranne
 * `chat_channels.client_id`, che va tolto a mano (vedi sotto): il conteggio
 * serve a far vedere che non si elimina una riga d'anagrafica, si elimina
 * il lavoro che ci sta sotto.
 */
export async function previewClientDeletion(ids: string[]): Promise<DeletionPreview & { error: string | null }> {
  const empty: DeletionPreview = { clients: 0, projects: 0, tasks: 0, contracts: 0, revenueLines: 0, channels: 0 }
  const { error: denied } = await requireAdmin()
  if (denied) return { ...empty, error: denied }
  if (ids.length === 0) return { ...empty, error: null }

  const db = createAdminClient()
  const { data: projects } = await db.from('projects').select('id').in('client_id', ids)
  const projectIds = (projects ?? []).map((p: { id: string }) => p.id)

  const [contracts, lines, channels, tasks] = await Promise.all([
    db.from('revenue_streams').select('id', { count: 'exact', head: true }).in('client_id', ids),
    db.from('pl_revenue_lines').select('id', { count: 'exact', head: true }).in('client_id', ids),
    db.from('chat_channels').select('id', { count: 'exact', head: true }).in('client_id', ids),
    projectIds.length
      ? db.from('tasks').select('id', { count: 'exact', head: true }).in('project_id', projectIds)
      : Promise.resolve({ count: 0 }),
  ])

  return {
    clients: ids.length,
    projects: projectIds.length,
    tasks: tasks.count ?? 0,
    contracts: contracts.count ?? 0,
    revenueLines: lines.count ?? 0,
    channels: channels.count ?? 0,
    error: null,
  }
}

/**
 * Elimina uno o più clienti. `chat_channels.client_id` è l'unica FK senza
 * ON DELETE CASCADE: senza toglierla prima, il DELETE sul cliente si rifiuta.
 * I figli dei canali (messaggi, membri) cascatano dal canale.
 */
export async function deleteClients(ids: string[]): Promise<{ deleted: number; error: string | null }> {
  const { userId, error: denied } = await requireAdmin()
  if (denied || !userId) return { deleted: 0, error: denied ?? 'Non autenticato' }
  if (ids.length === 0) return { deleted: 0, error: null }

  // l'eliminazione è la modifica che più di tutte deve avere un nome sopra
  const db = createActorClient(userId)
  const { error: chErr } = await db.from('chat_channels').delete().in('client_id', ids)
  if (chErr) return { deleted: 0, error: `Canali chat: ${chErr.message}` }

  const { data, error } = await db.from('clients').delete().in('id', ids).select('id')
  if (error) return { deleted: 0, error: error.message }

  revalidatePath('/clienti')
  revalidatePath('/dashboard')
  return { deleted: (data ?? []).length, error: null }
}
