'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ClientKnowledge } from '@/lib/types/database'

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
