'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createDecision({ title, context, priority }: {
  title: string; context: string | null; priority: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: decision, error } = await admin
    .from('decisions')
    .insert({ title, context, priority, status: 'aperta', created_by: user.id })
    .select()
    .single()

  if (error) return null
  revalidatePath('/dashboard')
  return { decision }
}

export async function updateDecisionStatus(id: string, status: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'decisa') {
    updates.decided_at = new Date().toISOString()
    updates.decided_by = user.id
  }

  await admin.from('decisions').update(updates).eq('id', id)
  revalidatePath('/dashboard')
}
