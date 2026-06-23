import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CronologiaClient } from '@/components/impostazioni/CronologiaClient'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import type { ActivityLog, Profile } from '@/lib/types/database'

export const revalidate = 0

export default async function CronologiaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['admin'].includes(profile?.app_role ?? '')
  if (!isAdmin) redirect('/dashboard')

  // Conta totale
  const { count: totalCount } = await supabase
    .from('activity_log')
    .select('*', { count: 'exact', head: true })

  // Ultimi 200 log con profilo utente
  const { data: logs } = await supabase
    .from('activity_log')
    .select(`
      *,
      user:profiles!activity_log_user_id_fkey(id, full_name, avatar_url)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="p-6">
      <CronologiaClient
        logs={(logs ?? []) as (ActivityLog & { user: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null })[]}
        isAdmin={isAdmin}
        totalCount={totalCount ?? 0}
      />
    </div>
  )
}
