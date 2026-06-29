import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function PortaleLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Solo i clienti accedono al portale; lo staff viene rimandato alla dashboard
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'client' && profile?.role !== 'guest') redirect('/dashboard')

  return <div className="min-h-screen bg-[#111111]">{children}</div>
}
