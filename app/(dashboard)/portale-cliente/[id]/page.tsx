import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { ClientPortalView } from '@/components/portale-cliente/ClientPortalView'
import type { Client, Project, Sprint, Task, ClientKpi, Invoice, Profile, Document } from '@/lib/types/database'
import type { ProjectComment } from '@/components/projects/project-shared'

export const revalidate = 0

export default async function PortaleClienteDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const sb = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: allProfilesRaw }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', user.id).single(),
    sb.from('profiles').select('id, full_name, email, avatar_url, role').order('full_name'),
  ])
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || profile?.app_role === 'super_admin'
  if (!isSuperAdmin) redirect('/dashboard')

  const { data: client } = await admin.from('clients').select('*').eq('id', id).single()
  if (!client) notFound()

  const { data: projects } = await admin.from('projects').select('*').eq('client_id', id).order('created_at')
  const projectIds = (projects ?? []).map((p: Project) => p.id)

  const [tasksRes, sprintsRes, kpisRes, invoicesRes, channelRes, commentsRes, docsRes] = await Promise.all([
    projectIds.length > 0
      ? admin.from('tasks').select('*').in('project_id', projectIds).eq('is_client_task', true as never).is('deleted_at', null).order('order')
      : Promise.resolve({ data: [] }),
    projectIds.length > 0
      ? admin.from('sprints').select('*').in('project_id', projectIds).order('start_date')
      : Promise.resolve({ data: [] }),
    admin.from('client_kpis').select('*').eq('client_id', id).order('month', { ascending: false }).limit(6),
    admin.from('invoices').select('*').eq('client_id', id).order('month', { ascending: false }).limit(12),
    // canale customer_care per la chat con il cliente
    admin.from('chat_channels')
      .select('id, name, type')
      .eq('client_id', id)
      .in('type', ['customer_care', 'cliente'])
      .limit(1)
      .maybeSingle(),
    // aggiornamenti dei progetti (project_comments)
    projectIds.length > 0
      ? admin.from('project_comments')
          .select('*')
          .in('project_id', projectIds)
          .is('parent_id', null)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    admin.from('documents').select('*').eq('client_id', id).order('created_at', { ascending: false }),
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
      allProfiles={(allProfilesRaw ?? []) as Profile[]}
    />
  )
}
