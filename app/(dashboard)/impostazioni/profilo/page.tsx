import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ProfiloClient } from '@/components/impostazioni/ProfiloClient'
import type { Profile } from '@/lib/types/database'
import { PROFILE_COLUMNS } from '@/lib/profile-columns'

export const revalidate = 0

export default async function ProfiloPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const profile = await getSessionProfile()
  /* §483 — il colore si legge qui e non nel profilo di sessione, che passa da
     ogni layout: una colonna in più lì, senza la migration, spegne l'app intera */
  const { data: colore } = await supabase.from('profiles').select('avatar_color').eq('id', user.id).maybeSingle()
  return <ProfiloClient profile={{ ...(profile as Profile), avatar_color: (colore as { avatar_color?: string | null } | null)?.avatar_color ?? null }}
    userEmail={user.email ?? ''} />
}
