import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { ProjectDetailClient } from '@/components/projects/ProjectDetailClient'
import { ProjectEconomics } from '@/components/projects/ProjectEconomics'
import type { RevenueStream, Installment } from '@/lib/revenue'
import type { CostItem, CostActual } from '@/lib/costs'
import { monthKey } from '@/lib/pl'
import type {
  Project, ProjectWorkstream, Milestone, Task, RecurringTaskTemplate,
} from '@/lib/types/database'

export const revalidate = 0

export default async function ProjectDetailPage({ params, searchParams }: { params: { projectId: string }; searchParams: { tab?: string } }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const profile = await getSessionProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: project } = await supabase
    .from('projects').select('*').eq('id', params.projectId).is('deleted_at', null).single()
  if (!project) notFound()

  const [
    { data: client }, { data: workstreams }, { data: milestones },
    { data: tasks }, { data: recurring }, { data: members }, { data: profiles },
  ] = await Promise.all([
    supabase.from('clients').select('id, company_name, display_name').eq('id', project.client_id).single(),
    supabase.from('project_workstreams').select('*').eq('project_id', params.projectId).order('sort_order'),
    supabase.from('milestones').select('*').eq('project_id', params.projectId).order('sort_order'),
    supabase.from('tasks').select('*').eq('project_id', params.projectId).is('deleted_at', null).order('created_at'),
    supabase.from('recurring_task_templates').select('*').eq('project_id', params.projectId).order('created_at'),
    supabase.from('project_members').select('profile_id, role_in_project').eq('project_id', params.projectId),
    supabase.from('profiles').select('id, full_name, avatar_url').eq('is_active', true),
  ])

  const memberIds = (members ?? []).map(m => m.profile_id)

  // Economics: solo admin, e degrada in silenzio se la 164/165 non è applicata
  const { data: streams, error: streamErr } = await supabase
    .from('revenue_streams').select('*').eq('project_id', params.projectId).order('created_at')
  const { data: installments } = streamErr || !(streams ?? []).length
    ? { data: [] }
    : await supabase.from('revenue_installments')
        .select('*').in('stream_id', (streams ?? []).map(s => s.id)).order('due_month')
  const { data: services } = streamErr
    ? { data: [] }
    : await supabase.from('service_catalog')
        .select('id, service_type, service_subtype, label, standard_price, price_unit, area')
        .eq('is_active', true).order('area').order('sort_order')

  // §173: lavorazioni affidate fuori + quanto ne è già uscito nel mese in corso.
  // Se la 171/173 non è applicata le query danno errore e restano liste vuote:
  // la scheda economics funziona lo stesso, senza il blocco margine.
  const plMonth = monthKey(new Date())
  const [{ data: costItems }, { data: plMonthRow }] = await Promise.all([
    supabase.from('cost_items').select('*').eq('project_id', params.projectId).order('sort_order'),
    supabase.from('pl_months').select('id').eq('month', plMonth).maybeSingle(),
  ])
  const { data: costActuals } = plMonthRow
    ? await supabase.from('pl_cost_lines')
        .select('id, center_id, cost_item_id, project_id, category, label, cost_type, budget, actual, paid')
        .eq('month_id', plMonthRow.id).eq('project_id', params.projectId)
    : { data: [] }

  // gli altri lavori dello stesso cliente con la loro quotazione: un progetto
  // attivo che nessuno ha quotato non deve restare invisibile
  const { data: others } = streamErr || !project.client_id
    ? { data: [] }
    : await supabase.from('projects').select('id, name, status')
        .eq('client_id', project.client_id).is('deleted_at', null)
        .neq('id', params.projectId).order('created_at', { ascending: false })
  const otherIds = (others ?? []).map((p: { id: string }) => p.id)
  const { data: otherStreams } = otherIds.length
    ? await supabase.from('revenue_streams')
        .select('project_id, amount, billing, status').in('project_id', otherIds)
    : { data: [] }
  type S = { project_id: string | null; amount: number; billing: string; status: string }
  const siblings = (others ?? []).map((p: { id: string; name: string; status: string }) => {
    const own = ((otherStreams ?? []) as S[]).filter(s => s.project_id === p.id)
    return {
      id: p.id, name: p.name, status: p.status,
      contracts: own.length,
      recurring: own.filter(s => s.billing === 'recurring' && s.status === 'attivo')
        .reduce((n, s) => n + Number(s.amount ?? 0), 0),
      oneOff: own.filter(s => s.billing === 'one_off' && s.status !== 'bozza')
        .reduce((n, s) => n + Number(s.amount ?? 0), 0),
    }
  })

  return (
    <ProjectDetailClient
      project={project as Project}
      clientName={(client?.display_name || client?.company_name) ?? '—'}
      workstreams={(workstreams ?? []) as ProjectWorkstream[]}
      milestones={(milestones ?? []) as Milestone[]}
      tasks={(tasks ?? []) as Task[]}
      recurring={(recurring ?? []) as RecurringTaskTemplate[]}
      memberIds={memberIds}
      profiles={(profiles ?? []) as { id: string; full_name: string; avatar_url: string | null }[]}
      initialTab={searchParams.tab === 'workstream' ? 'workstream' : searchParams.tab === 'economics' ? 'economics' : undefined}
      /* §176: l'economics nasce dal cliente. Un progetto interno o esterno non
         ha un accordo economico da gestire: la scheda non compare proprio */
      economics={streamErr || !project.client_id ? undefined : (
        <ProjectEconomics
          projectId={params.projectId}
          clientId={project.client_id ?? null}
          projectKind={project.area === 'digital' ? 'digital' : 'growth'}
          projectStart={project.start_date}
          projectEnd={project.target_end_date}
          streams={(streams ?? []) as RevenueStream[]}
          installments={(installments ?? []) as Installment[]}
          services={(services ?? []) as never}
          profiles={(profiles ?? []) as { id: string; full_name: string }[]}
          canEdit
          siblings={siblings}
          costItems={(costItems ?? []) as CostItem[]}
          costActuals={(costActuals ?? []) as CostActual[]}
        />
      )}
    />
  )
}
