import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedbackItem, FeedbackAttachment } from '@/components/feedback/types'

type FileRow = { id: string; name: string; mime: string | null; entity_id: string | null }

/**
 * Popola `attachments` su ogni feedback leggendo le immagini in public.files
 * (folder 'feedback', entity_type 'feedback'). La RLS lascia leggere questi file
 * a tutto lo staff, quindi passa dal client dell'utente.
 */
export async function attachSubmittedImages(
  supabase: SupabaseClient,
  items: FeedbackItem[],
): Promise<FeedbackItem[]> {
  const ids = items.map(f => f.id)
  if (ids.length === 0) return items

  const { data } = await supabase
    .from('files')
    .select('id, name, mime, entity_id')
    .eq('entity_type', 'feedback')
    .eq('folder', 'feedback')
    .in('entity_id', ids)
    .order('created_at', { ascending: true })

  const byFeedback = new Map<string, FeedbackAttachment[]>()
  for (const row of (data ?? []) as FileRow[]) {
    if (!row.entity_id) continue
    const list = byFeedback.get(row.entity_id) ?? []
    list.push({ id: row.id, name: row.name, mime: row.mime })
    byFeedback.set(row.entity_id, list)
  }

  return items.map(f => ({ ...f, attachments: byFeedback.get(f.id) ?? [] }))
}
