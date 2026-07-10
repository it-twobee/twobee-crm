import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertCircle, Clock, Calendar, FolderKanban, CheckCircle2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isAdminRole, isSuperAdminRaw } from '@/lib/permissions'
import { WorkspaceQuickCreate } from '@/components/workspace/WorkspaceQuickCreate'

export const revalidate = 0

function kpiCard(label: string, value: number, icon: React.ReactNode, accent: string) {
  return (
    <div className={cn('p-5 rounded-2xl bg-surface border', accent)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-overlay/50 text-xs">{label}</span>
        <span className={cn('p-1.5 rounded-lg bg-current/10')}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
    </div>
  )
}

export default async function WorkspaceDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().slice(0, 10)
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

  const taskSelect = `
    id, title, status, due_date, priority,
    project:projects(id, name, client_id, clients(company_name))
  `

  const [ownedRes, assignedIdsRes, hrRes, { data: profile }, clientsRes, activeProjectsRes, wsProfilesRes] = await Promise.all([
    supabase.from('tasks')
      .select(taskSelect)
      .eq('assignee_id', user.id)
      .neq('status', 'completato')
      .is('parent_task_id', null)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('task_assignees').select('task_id').eq('profile_id', user.id),
    supabase.from('hr_requests')
      .select('id, status')
      .eq('profile_id', user.id)
      .eq('status', 'pending'),
    supabase.from('profiles').select('full_name, app_role, email, google_connected').eq('id', user.id).single(),
    supabase.from('clients').select('id, company_name').neq('client_label', 'perso').order('company_name'),
    supabase.from('projects').select('id, name, client_id').eq('status', 'attivo').order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).in('role', ['admin', 'team']).order('full_name'),
  ])

  // Solo manager/senior (e admin+) creano progetti/sprint/task dalla dashboard.
  const canCreate =
    profile?.app_role === 'manager' || profile?.app_role === 'senior'
    || isAdminRole(profile?.app_role) || isSuperAdminRaw(profile?.email, profile?.app_role)

  // Collegamento Google Calendar: disponibile a TUTTI i membri dalla home.
  const googleConnected = Boolean((profile as { google_connected?: boolean } | null)?.google_connected)

  const assignedIds = (assignedIdsRes.data ?? []).map((a: { task_id: string }) => a.task_id)
  let extraTasks: typeof ownedRes.data = []
  if (assignedIds.length > 0) {
    const { data } = await supabase.from('tasks')
      .select(taskSelect)
      .in('id', assignedIds)
      .neq('status', 'completato')
      .is('parent_task_id', null)
      .order('due_date', { ascending: true, nullsFirst: false })
    extraTasks = data ?? []
  }

  const ownedSet = new Set((ownedRes.data ?? []).map((t: { id: string }) => t.id))
  const allTasks = [
    ...(ownedRes.data ?? []),
    ...(extraTasks ?? []).filter((t: { id: string }) => !ownedSet.has(t.id)),
  ] as unknown as Array<{
    id: string; title: string; status: string; due_date: string | null; priority: string | null;
    project: { id: string; name: string; client_id: string; clients: { company_name: string } | null } | null
  }>

  const overdue = allTasks.filter(t => t.due_date && t.due_date < today)
  const dueToday = allTasks.filter(t => t.due_date === today)
  const dueWeek = allTasks.filter(t => t.due_date && t.due_date > today && t.due_date <= nextWeek)

  const projectIds = Array.from(new Set(allTasks.map(t => t.project?.id).filter(Boolean) as string[]))
  const name = profile?.full_name?.split(' ')[0] ?? 'ciao'

  const STATUS_COLOR: Record<string, string> = {
    da_fare: 'text-text-tertiary',
    in_corso: 'text-info',
    in_revisione: 'text-accent',
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Ciao, {name} 👋</h1>
          <p className="text-overlay/40 text-sm mt-1">
            {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        {canCreate && (
          <WorkspaceQuickCreate
            clients={(clientsRes.data ?? []) as { id: string; company_name: string }[]}
            projects={(activeProjectsRes.data ?? []) as { id: string; name: string; client_id: string | null }[]}
            profiles={(wsProfilesRes.data ?? []) as { id: string; full_name: string | null }[]}
          />
        )}
      </div>

      {/* Collega Google Calendar — per tutti i membri, finché non connesso */}
      {!googleConnected && (
        <div className="mb-6 flex items-center gap-3 p-4 rounded-xl border border-gold/30 bg-gold-dim">
          <Calendar className="w-5 h-5 text-gold-text shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">Collega il tuo Google Calendar aziendale</p>
            <p className="text-xs text-text-secondary mt-0.5">Sincronizza appuntamenti e scadenze, e crea eventi direttamente dal calendario.</p>
          </div>
          <a href="/api/google/auth"
            className="px-4 py-2 bg-gold text-on-gold rounded-lg text-sm font-bold hover:bg-gold/90 transition-colors shrink-0">
            Collega ora
          </a>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="p-5 rounded-2xl bg-surface border border-error/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-overlay/50 text-xs">Scadute</span>
            <AlertCircle className="w-4 h-4 text-error" />
          </div>
          <p className="text-2xl font-bold text-text-primary">{overdue.length}</p>
        </div>
        <div className="p-5 rounded-2xl bg-surface border border-gold/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-overlay/50 text-xs">Oggi</span>
            <Clock className="w-4 h-4 text-gold-text" />
          </div>
          <p className="text-2xl font-bold text-text-primary">{dueToday.length}</p>
        </div>
        <div className="p-5 rounded-2xl bg-surface border border-info/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-overlay/50 text-xs">Settimana</span>
            <Calendar className="w-4 h-4 text-info" />
          </div>
          <p className="text-2xl font-bold text-text-primary">{dueWeek.length}</p>
        </div>
        <div className="p-5 rounded-2xl bg-surface border border-success/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-overlay/50 text-xs">Progetti</span>
            <FolderKanban className="w-4 h-4 text-success" />
          </div>
          <p className="text-2xl font-bold text-text-primary">{projectIds.length}</p>
        </div>
      </div>

      {/* HR alert */}
      {(hrRes.data?.length ?? 0) > 0 && (
        <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-gold-dim border border-gold/20">
          <Clock className="w-4 h-4 text-gold-text shrink-0" />
          <span className="text-gold-text text-sm">
            {hrRes.data!.length} richiesta HR in attesa
          </span>
          <Link href="/workspace/hr" className="ml-auto text-gold-text/60 hover:text-gold-text text-xs flex items-center gap-1">
            Vedi <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Task list */}
      <div className="flex flex-col gap-6">
        {overdue.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-error uppercase tracking-wider mb-2">
              Scadute ({overdue.length})
            </h2>
            <TaskList tasks={overdue} statusColorMap={STATUS_COLOR} />
          </section>
        )}

        {dueToday.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gold-text uppercase tracking-wider mb-2">
              Oggi ({dueToday.length})
            </h2>
            <TaskList tasks={dueToday} statusColorMap={STATUS_COLOR} />
          </section>
        )}

        {dueWeek.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-info uppercase tracking-wider mb-2">
              Prossimi 7 giorni ({dueWeek.length})
            </h2>
            <TaskList tasks={dueWeek} statusColorMap={STATUS_COLOR} />
          </section>
        )}

        {allTasks.length === 0 && (
          <div className="text-center py-20 text-overlay/30 text-sm">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-success/30" />
            Nessuna task attiva. Ottimo lavoro!
          </div>
        )}

        {allTasks.length > 0 && overdue.length === 0 && dueToday.length === 0 && dueWeek.length === 0 && (
          <section>
            <h2 className="text-xs font-semibold text-overlay/30 uppercase tracking-wider mb-2">
              Altre task ({allTasks.length})
            </h2>
            <TaskList tasks={allTasks.slice(0, 15)} statusColorMap={STATUS_COLOR} />
          </section>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-border">
        <Link href="/workspace/attivita" className="text-overlay/30 hover:text-overlay/60 text-sm flex items-center gap-1 transition-colors">
          Tutte le attività <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}

function TaskList({
  tasks,
  statusColorMap,
}: {
  tasks: Array<{ id: string; title: string; status: string; due_date: string | null; project: { id: string; name: string; client_id: string; clients: { company_name: string } | null } | null }>
  statusColorMap: Record<string, string>
}) {
  return (
    <div className="flex flex-col gap-1">
      {tasks.map(t => (
        <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-surface border border-border hover:border-border/80">
          <span className={cn('text-xs w-16 shrink-0', statusColorMap[t.status] ?? 'text-text-tertiary')}>
            {t.status === 'da_fare' ? 'Da fare' : t.status === 'in_corso' ? 'In corso' : 'Revisione'}
          </span>
          <span className="text-text-primary text-sm truncate flex-1">{t.title}</span>
          {t.project && (
            <Link
              href={`/workspace/progetti/${t.project.id}`}
              className="text-overlay/25 hover:text-overlay/50 text-xs truncate max-w-[120px] shrink-0 transition-colors"
            >
              {t.project.name}
            </Link>
          )}
          {t.due_date && (
            <span className="text-overlay/25 text-xs shrink-0">
              {new Date(t.due_date + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
