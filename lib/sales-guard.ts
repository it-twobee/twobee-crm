import { createClient } from '@/lib/supabase/server'
import { salesAccess } from '@/lib/sales'

export async function getSalesAccess() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const [{ data: p, error }, { data: grant }] = await Promise.all([
    sb.from('profiles').select('app_role,is_active').eq('id', user.id).single(),
    sb.from('profile_permissions').select('granted').eq('profile_id', user.id).eq('permission', 'can_view_deals').maybeSingle(),
  ])
  if (error || !p) return null
  const access = salesAccess(p.app_role, grant?.granted === true, p.is_active !== false)
  return access ? { actor: user.id, access, sb } : null
}

export async function requireSalesAccess() {
  const context = await getSalesAccess()
  if (!context) throw new Error('Accesso commerciale non abilitato')
  return context
}
