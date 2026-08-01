'use server'

import { createClient } from '@/lib/supabase/server'
import { createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ProjectStatus } from '@/lib/types/database'

/** Torna l'id di chi sta scrivendo: serve alla cronologia per attribuire la modifica (§179). */
async function requireManagerOrAdmin(projectId?: string): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role, app_role').eq('id', user.id).single()
  if (p?.role === 'admin') return user.id
  if (p?.app_role === 'manager' && projectId) {
    const { data: proj } = await sb.from('projects').select('manager_id').eq('id', projectId).single()
    const { data: mem } = await sb.from('project_members').select('profile_id').eq('project_id', projectId).eq('profile_id', user.id).maybeSingle()
    if (proj?.manager_id === user.id || mem) return user.id
  }
  throw new Error('Permesso negato')
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  const uid = await requireManagerOrAdmin(projectId)
  const { error } = await createActorClient(uid).from('projects').update({ status }).eq('id', projectId)
  if (error) throw new Error(error.message)
  revalidatePath(`/progetti/${projectId}`)
  revalidatePath('/progetti')
}

// Brief = campo description del progetto (editabile/cancellabile dalla panoramica)
export async function updateProjectBrief(projectId: string, description: string | null) {
  const uid = await requireManagerOrAdmin(projectId)
  const { error } = await createActorClient(uid).from('projects')
    .update({ description: description?.trim() || null }).eq('id', projectId)
  if (error) throw new Error(error.message)
  revalidatePath(`/progetti/${projectId}`)
}

// Elimina il progetto intero (soft-delete). Le task figlie vengono soft-deleted;
// workstream/milestone/ricorrenti restano collegati (cadono su hard-delete futuro).
/**
 * Eliminare un progetto che ha contratti venduti significa staccare dei ricavi
 * dal lavoro che li genera: restano attaccati al cliente, spariscono dalla
 * marginalità e nessuno se ne accorge finché non manca un numero. Si blocca e
 * si dice cosa fare — spostare i contratti, o concluderli.
 */
export async function deleteProject(projectId: string, clientId: string | null) {
  const uid = await requireManagerOrAdmin(projectId)
  const admin = createActorClient(uid)
  const now = new Date().toISOString()

  const { data: sold } = await admin.from('revenue_streams')
    .select('label, status').eq('project_id', projectId).neq('status', 'bozza')
  if (sold?.length) {
    const nomi = sold.slice(0, 3).map((s: { label: string }) => `«${s.label}»`).join(', ')
    throw new Error(
      `Questo progetto ha ${sold.length} contratt${sold.length === 1 ? 'o' : 'i'} venduti (${nomi}). ` +
      'Spostali su un altro progetto dall\'Economics del cliente, oppure portali a «concluso», ' +
      'poi elimina il progetto: i ricavi non devono restare senza il lavoro che li ha generati.',
    )
  }
  // soft-delete progetto + tutte le sue task (per non lasciarle orfane nelle viste)
  const { error } = await admin.from('projects').update({ deleted_at: now }).eq('id', projectId)
  if (error) throw new Error(error.message)
  await admin.from('tasks').update({ deleted_at: now }).eq('project_id', projectId).is('deleted_at', null)
  revalidatePath('/progetti')
  revalidatePath(`/clienti/${clientId}`)
}
