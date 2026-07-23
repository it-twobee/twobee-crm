import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/shared/Sidebar'
import { Header } from '@/components/shared/Header'
import type { Profile } from '@/lib/types/database'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Timeout di 8s — se Supabase non risponde, redirect al login invece di bloccare
  const authResult = await Promise.race([
    supabase.auth.getUser(),
    new Promise<{ data: { user: null } }>((res) =>
      setTimeout(() => res({ data: { user: null } }), 8000)
    ),
  ])

  const user = authResult.data.user
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header profile={profile as Profile | null} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
