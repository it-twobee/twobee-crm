import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { MyTasksClient } from '@/components/workspace/MyTasksClient'
import type { Task } from '@/lib/types/database'

export const revalidate = 0

export default async function MieAttivitaPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'team' && profile.role !== 'admin') redirect('/workspace')
  const supabase = await createClient()
  const userId = profile.id

  // task in cui sono assegnatario (primario via assignee_id o in task_assignees).
  // L'elenco dei colleghi non dipende dalle task: parte insieme, non dopo.
  const [{ data: ta }, { data: profiles }] = await Promise.all([
    supabase.from('task_assignees').select('task_id').eq('profile_id', userId),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true),
  ])
  const ids = Array.from(new Set((ta ?? []).map(r => r.task_id)))

  const orFilter = ids.length ? `assignee_id.eq.${userId},id.in.(${ids.join(',')})` : `assignee_id.eq.${userId}`
  const { data: tasks } = await supabase
    .from('tasks').select('*').is('deleted_at', null).or(orFilter).order('due_date', { ascending: true, nullsFirst: false })

  const projectIds = Array.from(new Set((tasks ?? []).map(t => t.project_id).filter(Boolean))) as string[]
  const clientIds = Array.from(new Set((tasks ?? []).map(t => t.client_id).filter(Boolean))) as string[]

  const [{ data: projects }, { data: clients }] = await Promise.all([
    projectIds.length ? supabase.from('projects').select('id, name').in('id', projectIds) : Promise.resolve({ data: [] }),
    // §211 — `clients_workspace`, non `clients`: è la sorgente del portale
    // operativo (economici e fiscali azzerati in tabella) ed è quella che la
    // RLS garantisce leggibile a tutto lo staff. Qui servono solo i nomi.
    clientIds.length ? supabase.from('clients_workspace').select('id, company_name, display_name').in('id', clientIds) : Promise.resolve({ data: [] }),
  ])

  const projectName: Record<string, string> = {}
  ;(projects ?? []).forEach(p => { projectName[p.id] = p.name })
  const clientName: Record<string, string> = {}
  ;(clients ?? []).forEach(c => { clientName[c.id] = c.display_name || c.company_name })

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-text-primary mb-1">Le mie attività</h1>
      <p className="text-sm text-text-secondary mb-5">Task assegnate a te, da tutti i progetti e ad hoc.</p>
      <MyTasksClient
        tasks={(tasks ?? []) as Task[]}
        profiles={(profiles ?? []) as { id: string; full_name: string; avatar_url: string | null }[]}
        projectName={projectName}
        clientName={clientName}
      />
    </div>
  )
}
