import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { TwoBeeOSClient } from '@/components/os/TwoBeeOSClient'
import type { OsTask } from '@/app/actions/os-tasks'

export const revalidate = 60

export default async function TwoBeeOSPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('email').eq('id', user.id).single()
  if (!profile || !SUPER_ADMIN_EMAILS.includes(profile.email)) redirect('/dashboard')

  const { data: tasks } = await supabase
    .from('os_tasks')
    .select('*')
    .order('created_at', { ascending: false })

  const openCount = (tasks ?? []).filter(t => t.status === 'aperto').length
  const doneCount = (tasks ?? []).filter(t => t.status === 'completato').length

  return (
    <div className="p-5 lg:p-6 min-h-screen">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">TwoBee OS</h1>
          <p className="text-xs mt-1" style={{ color: '#333' }}>
            Command Center · {openCount} task aperti · {doneCount} completati
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
          style={{ background: 'rgba(245,200,0,0.06)', border: '1px solid rgba(245,200,0,0.15)' }}>
          <span className="text-xs font-black" style={{ color: '#F5C800' }}>👑 GOD MODE</span>
        </div>
      </div>

      <TwoBeeOSClient tasks={(tasks ?? []) as OsTask[]} />
    </div>
  )
}
