import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { TimesheetTable } from '@/components/dashboard/TimesheetTable'
import type { TimeEntryRow, Profile, Project, Client } from '@/lib/types/database'

export const revalidate = 0

export default async function TimesheetPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '')
    || ['admin', 'manager'].includes(profile?.app_role ?? '')

  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  const [entriesRes, profilesRes, projectsRes, clientsRes] = await Promise.all([
    supabase
      .from('time_entries')
      .select('*, profile:profiles(id,full_name), project:projects(id,name), client:clients(id,company_name), task:tasks(id,title)')
      .gte('date', firstDay)
      .order('date', { ascending: false }),
    supabase.from('profiles').select('id, full_name, app_role').eq('is_active', true).order('full_name'),
    supabase.from('projects').select('id, name, client_id').eq('status', 'attivo').order('name'),
    supabase.from('clients').select('id, company_name').order('company_name'),
  ])

  const entries = (entriesRes.data ?? []) as unknown as TimeEntryRow[]
  const profiles = (profilesRes.data ?? []) as Pick<Profile, 'id' | 'full_name' | 'app_role'>[]
  const projects = (projectsRes.data ?? []) as (Pick<Project, 'id' | 'name'> & { client_id: string })[]
  const clients = (clientsRes.data ?? []) as Pick<Client, 'id' | 'company_name'>[]

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-black text-text-primary">Timesheet</h1>
        <p className="text-xs text-text-tertiary mt-0.5">Registra e monitora le ore lavorate per progetto</p>
      </div>
      <TimesheetTable
        initialEntries={entries}
        profiles={profiles}
        projects={projects}
        clients={clients}
        currentUserId={user.id}
        isAdmin={isAdmin}
      />
    </div>
  )
}
