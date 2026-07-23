'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ClientKnowledge, ClientCompetitor, ClientIdea } from '@/lib/types/database'

export type ClientKnowledgeInput = Omit<ClientKnowledge, 'id' | 'created_at' | 'updated_at'>

export async function upsertClientKnowledge(input: ClientKnowledgeInput): Promise<ClientKnowledge> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  // RLS client_knowledge_staff fa da guardia: solo staff scrive
  const { data, error } = await sb
    .from('client_knowledge')
    .upsert(input, { onConflict: 'client_id' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/clienti/${input.client_id}`)
  return data as ClientKnowledge
}

// ── Competitor (§26) — RLS client_competitors_staff ──────────────────────────
export type CompetitorInput = Partial<Omit<ClientCompetitor, 'id' | 'client_id' | 'created_at' | 'updated_at' | 'created_by'>>

export async function saveCompetitor(
  clientId: string, id: string | null, input: CompetitorInput,
): Promise<ClientCompetitor> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  if (!input.name?.trim()) throw new Error('Nome competitor obbligatorio')

  const row = { ...input, name: input.name.trim(), client_id: clientId }
  const q = id
    ? sb.from('client_competitors').update(row).eq('id', id).select().single()
    : sb.from('client_competitors').insert({ ...row, created_by: user.id }).select().single()

  const { data, error } = await q
  if (error) throw new Error(error.message)
  revalidatePath(`/clienti/${clientId}`)
  return data as ClientCompetitor
}

export async function deleteCompetitor(clientId: string, id: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('client_competitors').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/clienti/${clientId}`)
}

// ── Idee (§26) — RLS client_ideas_staff ──────────────────────────────────────
export type IdeaInput = Partial<Omit<ClientIdea, 'id' | 'client_id' | 'created_at' | 'updated_at' | 'created_by'>>

export async function saveIdea(
  clientId: string, id: string | null, input: IdeaInput,
): Promise<ClientIdea> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  if (!input.title?.trim()) throw new Error('Titolo idea obbligatorio')

  const row = { ...input, title: input.title.trim(), client_id: clientId }
  const q = id
    ? sb.from('client_ideas').update(row).eq('id', id).select().single()
    : sb.from('client_ideas').insert({ ...row, created_by: user.id }).select().single()

  const { data, error } = await q
  if (error) throw new Error(error.message)
  revalidatePath(`/clienti/${clientId}`)
  return data as ClientIdea
}

export async function deleteIdea(clientId: string, id: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('client_ideas').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/clienti/${clientId}`)
}
