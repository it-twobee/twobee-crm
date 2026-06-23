'use server'

import { createClient } from '@/lib/supabase/server'

export async function saveDashboardConfig(config: Record<string, unknown>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const { error } = await supabase
    .from('profiles')
    .update({ dashboard_config: config })
    .eq('id', user.id)
  return error ? { error: error.message } : { ok: true }
}
