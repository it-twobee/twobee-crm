import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientPortalView } from '@/components/portale-cliente/ClientPortalView'
import type { Client, Project, Sprint, Task, ClientKpi, Invoice, Profile, Document } from '@/lib/types/database'
import type { ProjectComment } from '@/components/projects/project-shared'

export const revalidate = 0

export default async function PortalePage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: assignment }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', user.id).single(),
    sb.from('client_assignments').select('client_id').eq('profile_id', user.id).limit(1).maybeSingle(),
  ])

  const clientId = assignment?.client_id
  if (!clientId) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <h1 className="text-lg font-black text-text-primary mb-2">Nessun account collegato</h1>
        <p className="text-sm text-text-tertiary">Il tuo profilo non è ancora associato a un cliente. Contatta il team TwoBee.</p>
      </div>
    )
  }

  // Tutti i fetch passano per RLS: l'utente client vede solo i propri dati
  const { data: client } = await sb.from('clients').select('*').eq('id', clientId).single()
  if (!client) redirect('/login')

  const { data: projects } = await sb.from('projects').select('*').eq('client_id', clientId).order('created_at')
  const projectIds = (projects ?? []).map((p: Project) => p.id)

  const [tasksRes, sprintsRes, kpisRes, invoicesRes, channelRes, commentsRes, docsRes] = await Promise.all([
    projectIds.length > 0
      ? sb.from('tasks').select('*').in('project_id', projectIds).order('order')
      : Promise.resolve({ data: [] }),
    projectIds.length > 0
      ? sb.from('sprints').select('*').in('project_id', projectIds).order('start_date')
      : Promise.resolve({ data: [] }),
    sb.from('client_kpis').select('*').eq('client_id', clientId).order('month', { ascending: false }).limit(6),
    sb.from('invoices').select('*').eq('client_id', clientId).order('month', { ascending: false }).limit(12),
    sb.from('chat_channels').select('id, name, type').eq('client_id', clientId).in('type', ['customer_care', 'cliente']).limit(1).maybeSingle(),
    projectIds.length > 0
      ? sb.from('project_comments').select('*').in('project_id', projectIds).is('parent_id', null).order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
    sb.from('documents').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
  ])

  return (
    <ClientPortalView
      client={client as Client}
      projects={(projects ?? []) as Project[]}
      sprints={(sprintsRes.data ?? []) as Sprint[]}
      clientTasks={(tasksRes.data ?? []) as Task[]}
      kpis={(kpisRes.data ?? []) as ClientKpi[]}
      invoices={(invoicesRes.data ?? []) as Invoice[]}
      ccChannelId={channelRes.data?.id ?? null}
      comments={(commentsRes.data ?? []) as ProjectComment[]}
      documents={(docsRes.data ?? []) as Document[]}
      currentProfile={profile as Profile}
      allProfiles={[profile as Profile]}
      isPreview={false}
    />
  )
}
