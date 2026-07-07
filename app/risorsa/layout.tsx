import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { classifyUser } from '@/lib/resource'
import { RisorsaNav } from '@/components/risorsa/RisorsaNav'
import type { Profile } from '@/lib/types/database'

export default async function RisorsaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Client → /portale; staff e risorse (guest con resource_profile) → ok
  const { kind } = await classifyUser(supabase, user.id)
  if (kind === 'client') redirect('/portale')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isExternal = kind === 'resource'

  return (
    <div className="min-h-screen bg-[#111111] flex flex-col">
      <RisorsaNav profile={profile as Profile} isExternal={isExternal} />
      <main className="flex-1">{children}</main>
    </div>
  )
}
