import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FeedbackWorkspaceClient } from '@/components/feedback/FeedbackWorkspaceClient'
import { attachSubmittedImages } from '@/lib/feedback-attachments'
import type { FeedbackItem, FeedbackSection } from '@/components/feedback/types'

export const revalidate = 0

export default async function WorkspaceFeedbackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [sectionsRes, feedbackRes, votesRes] = await Promise.all([
    supabase.from('workspace_sections').select('key, label').eq('is_active', true).order('sort_order'),
    supabase.from('feedback')
      .select('id, author_id, source_portal, kind, target_section_key, proposed_section_name, title, description, impact, status, admin_note, vote_count, created_at, author:profiles!feedback_author_id_fkey(full_name, avatar_url)')
      .order('vote_count', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('feedback_votes').select('feedback_id').eq('profile_id', user.id),
  ])

  const votedIds = new Set((votesRes.data ?? []).map((v: { feedback_id: string }) => v.feedback_id))

  const feedback = await attachSubmittedImages(supabase, (feedbackRes.data ?? []) as unknown as FeedbackItem[])

  return (
    <FeedbackWorkspaceClient
      currentUserId={user.id}
      sections={(sectionsRes.data ?? []) as FeedbackSection[]}
      feedback={feedback}
      votedIds={Array.from(votedIds)}
    />
  )
}
