import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StrategiaClient } from '@/components/strategia/StrategiaClient'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { Profile, Objective, KeyResult, RoadmapItem, StrategicNote } from '@/lib/types/database'

export const revalidate = 0

export default async function StrategiaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['admin', 'manager'].includes(profile?.app_role ?? '')
  if (!isAdmin) redirect('/dashboard')

  const [objRes, roadmapRes, notesRes, profilesRes] = await Promise.all([
    supabase.from('objectives').select(`*, key_results(*)`).order('created_at', { ascending: false }),
    supabase.from('roadmap_items').select('*').order('priority').order('due_date'),
    supabase.from('strategic_notes').select('*').order('pinned', { ascending: false }).order('date', { ascending: false }),
    supabase.from('profiles').select('id,full_name,avatar_url').eq('is_active', true).order('full_name'),
  ])

  return (
    <StrategiaClient
      objectives={(objRes.data ?? []) as (Objective & { key_results: KeyResult[] })[]}
      roadmap={(roadmapRes.data ?? []) as RoadmapItem[]}
      notes={(notesRes.data ?? []) as StrategicNote[]}
      profiles={(profilesRes.data ?? []) as Profile[]}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  )
}
