import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CronologiaClient } from '@/components/workspace/CronologiaClient'
import type { ActivityLog } from '@/lib/types/database'

export const revalidate = 0

export default async function CronologiaPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  // Solo le proprie attività. Riusa activity_log (esiste già, usata dalla
  // cronologia admin): niente tabella nuova.
  const { data } = await sb
    .from('activity_log')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(300)

  return <CronologiaClient logs={(data ?? []) as ActivityLog[]} />
}
