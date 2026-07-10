'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { FeedbackKind, FeedbackStatus } from '@/components/feedback/types'

// L'insert passa dal client server-side: la RLS impone author_id = auth.uid(),
// quindi non serve il service role e nessuno può firmare a nome di altri.
export async function createFeedback(input: {
  sourcePortal: 'admin' | 'workspace'
  kind: FeedbackKind
  targetSectionKey?: string | null
  proposedSectionName?: string | null
  title: string
  description: string
  impact?: 'bassa' | 'media' | 'alta'
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Non autenticato' }
  if (!input.title.trim() || !input.description.trim()) return { ok: false, error: 'Titolo e descrizione obbligatori' }
  if (input.kind === 'improvement' && !input.targetSectionKey) return { ok: false, error: 'Seleziona la sezione' }
  if (input.kind === 'new_section' && !input.proposedSectionName?.trim()) return { ok: false, error: 'Indica il nome della nuova sezione' }

  const { error } = await supabase.from('feedback').insert({
    author_id: user.id,
    source_portal: input.sourcePortal,
    kind: input.kind,
    target_section_key: input.targetSectionKey ?? null,
    proposed_section_name: input.proposedSectionName?.trim() || null,
    title: input.title.trim(),
    description: input.description.trim(),
    impact: input.impact ?? 'media',
  } as never)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/workspace/feedback')
  revalidatePath('/feedback')
  return { ok: true }
}

export async function voteFeedback(feedbackId: string, on: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Non autenticato' }

  const { error } = on
    ? await supabase.from('feedback_votes').upsert({ feedback_id: feedbackId, profile_id: user.id } as never, { onConflict: 'feedback_id,profile_id' })
    : await supabase.from('feedback_votes').delete().eq('feedback_id', feedbackId).eq('profile_id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/workspace/feedback')
  revalidatePath('/feedback')
  return { ok: true }
}

// Solo l'admin: la RLS (feedback_admin_all) rifiuta l'update a chi non lo è.
export async function setFeedbackStatus(feedbackId: string, status: FeedbackStatus, adminNote?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Non autenticato' }

  const { error } = await supabase.from('feedback')
    .update({ status, admin_note: adminNote ?? null, updated_at: new Date().toISOString() } as never)
    .eq('id', feedbackId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/feedback')
  revalidatePath('/workspace/feedback')
  return { ok: true }
}
