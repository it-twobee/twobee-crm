import type { SupabaseClient } from '@supabase/supabase-js'

export type UserKind = 'staff' | 'client' | 'resource'

// Classifica l'utente per il routing. Un guest con resource_profiles
// (can_access_resource_portal) è una RISORSA → /risorsa; un guest/client
// senza è un cliente → /portale; admin/team è staff → /dashboard.
// Query a resource_profiles solo per i guest (i client puri non lo sono mai).
export async function classifyUser(
  sb: SupabaseClient, userId: string,
): Promise<{ kind: UserKind; home: string }> {
  const { data: profile } = await sb.from('profiles').select('role').eq('id', userId).single()
  const role = profile?.role

  if (role === 'admin' || role === 'team') return { kind: 'staff', home: '/dashboard' }
  if (role === 'client') return { kind: 'client', home: '/portale' }

  // role guest (o altro): potrebbe essere una risorsa esterna
  const { data: rp } = await sb.from('resource_profiles')
    .select('can_access_resource_portal').eq('profile_id', userId).maybeSingle()
  if (rp?.can_access_resource_portal) return { kind: 'resource', home: '/risorsa' }

  return { kind: 'client', home: '/portale' }
}
