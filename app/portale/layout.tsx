import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdminRaw } from '@/lib/permissions'

export default async function PortaleLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Accedono i clienti; il super admin entra in anteprima per ispezionare il
  // portale. Ogni altro membro dello staff resta fuori — stessa regola del middleware.
  const { data: profile } = await supabase
    .from('profiles').select('role, app_role, email').eq('id', user.id).single()

  const isClient = profile?.role === 'client' || profile?.role === 'guest'
  const isSuper = isSuperAdminRaw(profile?.email, profile?.app_role)
  if (!isClient && !isSuper) redirect('/dashboard')

  return <div className="min-h-screen bg-background">{children}</div>
}
