import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RisorsaNav } from '@/components/risorsa/RisorsaNav'
import type { Profile } from '@/lib/types/database'

export default async function RisorsaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  // I clienti vivono nel loro portale; il portale risorsa è per chi opera (staff/team)
  if (profile?.role === 'client' || profile?.role === 'guest') redirect('/portale')

  return (
    <div className="min-h-screen bg-[#111111] flex flex-col">
      <RisorsaNav profile={profile as Profile} />
      <main className="flex-1">{children}</main>
    </div>
  )
}
