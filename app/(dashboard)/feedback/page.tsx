import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isAdminRole, isSuperAdminRaw } from '@/lib/permissions'
import { FeedbackAdminClient } from '@/components/feedback/FeedbackAdminClient'
import type { FeedbackItem, FeedbackSection } from '@/components/feedback/types'

export const revalidate = 0

export default async function AdminFeedbackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('profiles').select('app_role, email').eq('id', user.id).single()
  if (!isAdminRole(me?.app_role) && !isSuperAdminRaw(me?.email, me?.app_role)) redirect('/dashboard')

  const [sectionsRes, feedbackRes, votesRes] = await Promise.all([
    supabase.from('workspace_sections').select('key, label').eq('is_active', true).order('sort_order'),
    supabase.from('feedback')
      .select('id, author_id, source_portal, kind, target_section_key, proposed_section_name, title, description, impact, status, admin_note, vote_count, created_at, author:profiles!feedback_author_id_fkey(full_name, avatar_url)')
      .order('vote_count', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('feedback_votes').select('feedback_id').eq('profile_id', user.id),
  ])

  return (
    <FeedbackAdminClient
      sections={(sectionsRes.data ?? []) as FeedbackSection[]}
      feedback={(feedbackRes.data ?? []) as unknown as FeedbackItem[]}
      votedIds={(votesRes.data ?? []).map((v: { feedback_id: string }) => v.feedback_id)}
    />
  )
}
