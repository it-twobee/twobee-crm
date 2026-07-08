import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertCircle, Clock, Calendar, FolderKanban, CheckCircle2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export const revalidate = 0

function kpiCard(label: string, value: number, icon: React.ReactNode, accent: string) {
  return (
    <div className={cn('p-5 rounded-2xl bg-[#1A1A1A] border', accent)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/50 text-xs">{label}</span>
        <span className={cn('p-1.5 rounded-lg bg-current/10')}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
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

  const [ownedRes, assignedIdsRes, hrRes, { data: profile }] = await Promise.all([
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
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
  ])

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
    da_fare: 'text-white/40',
    in_corso: 'text-blue-400',
    in_revisione: 'text-purple-400',
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Ciao, {name} 👋</h1>
        <p className="text-white/40 text-sm mt-1">
          {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="p-5 rounded-2xl bg-[#1A1A1A] border border-red-500/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/50 text-xs">Scadute</span>
            <AlertCircle className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-white">{overdue.length}</p>
        </div>
        <div className="p-5 rounded-2xl bg-[#1A1A1A] border border-[#F5C800]/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/50 text-xs">Oggi</span>
            <Clock className="w-4 h-4 text-[#F5C800]" />
          </div>
          <p className="text-2xl font-bold text-white">{dueToday.length}</p>
        </div>
        <div className="p-5 rounded-2xl bg-[#1A1A1A] border border-blue-500/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/50 text-xs">Settimana</span>
            <Calendar className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white">{dueWeek.length}</p>
        </div>
        <div className="p-5 rounded-2xl bg-[#1A1A1A] border border-green-500/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/50 text-xs">Progetti</span>
            <FolderKanban className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-2xl font-bold text-white">{projectIds.length}</p>
        </div>
      </div>

      {/* HR alert */}
      {(hrRes.data?.length ?? 0) > 0 && (
        <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-[#F5C800]/5 border border-[#F5C800]/20">
          <Clock className="w-4 h-4 text-[#F5C800] shrink-0" />
          <span className="text-[#F5C800] text-sm">
            {hrRes.data!.length} richiesta HR in attesa
          </span>
          <Link href="/workspace/hr" className="ml-auto text-[#F5C800]/60 hover:text-[#F5C800] text-xs flex items-center gap-1">
            Vedi <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Task list */}
      <div className="flex flex-col gap-6">
        {overdue.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">
              Scadute ({overdue.length})
            </h2>
            <TaskList tasks={overdue} statusColorMap={STATUS_COLOR} />
          </section>
        )}

        {dueToday.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-[#F5C800] uppercase tracking-wider mb-2">
              Oggi ({dueToday.length})
            </h2>
            <TaskList tasks={dueToday} statusColorMap={STATUS_COLOR} />
          </section>
        )}

        {dueWeek.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
              Prossimi 7 giorni ({dueWeek.length})
            </h2>
            <TaskList tasks={dueWeek} statusColorMap={STATUS_COLOR} />
          </section>
        )}

        {allTasks.length === 0 && (
          <div className="text-center py-20 text-white/30 text-sm">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-green-400/30" />
            Nessuna task attiva. Ottimo lavoro!
          </div>
        )}

        {allTasks.length > 0 && overdue.length === 0 && dueToday.length === 0 && dueWeek.length === 0 && (
          <section>
            <h2 className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">
              Altre task ({allTasks.length})
            </h2>
            <TaskList tasks={allTasks.slice(0, 15)} statusColorMap={STATUS_COLOR} />
          </section>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-[#2A2A2A]">
        <Link href="/workspace/attivita" className="text-white/30 hover:text-white/60 text-sm flex items-center gap-1 transition-colors">
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
        <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#2A2A2A]/80">
          <span className={cn('text-xs w-16 shrink-0', statusColorMap[t.status] ?? 'text-white/40')}>
            {t.status === 'da_fare' ? 'Da fare' : t.status === 'in_corso' ? 'In corso' : 'Revisione'}
          </span>
          <span className="text-white text-sm truncate flex-1">{t.title}</span>
          {t.project && (
            <Link
              href={`/clienti/${t.project.client_id}/progetto/${t.project.id}`}
              className="text-white/25 hover:text-white/50 text-xs truncate max-w-[120px] shrink-0 transition-colors"
            >
              {t.project.name}
            </Link>
          )}
          {t.due_date && (
            <span className="text-white/25 text-xs shrink-0">
              {new Date(t.due_date + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
