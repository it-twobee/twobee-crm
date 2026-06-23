import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MyTasksPanel } from '@/components/dashboard/MyTasksPanel'
import { AlertCenter } from '@/components/dashboard/AlertCenter'
import { DailyFocus } from '@/components/dashboard/DailyFocus'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import type { DashboardData } from '@/components/dashboard/DashboardGrid'
import type { Client, TaskWithAssignee, Profile } from '@/lib/types/database'
import type { DashAlert, AlertSeverity } from '@/components/dashboard/AlertCenter'
import type { FocusItem } from '@/components/dashboard/DailyFocus'
import type { MonthRevenue } from '@/components/dashboard/RevenueSnapshot'
import type { ProjectSummary } from '@/components/dashboard/ProgettiWidget'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { Crown } from 'lucide-react'

export const revalidate = 60

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const isGod = SUPER_ADMIN_EMAILS.includes(profile.email)
  const appRole = isGod ? 'super_admin' : (profile.app_role ?? 'junior')
  const isAdminLevel = isGod || ['admin', 'manager'].includes(appRole)
  const isJuniorLevel = ['junior', 'viewer'].includes(appRole)

  const today    = new Date().toISOString().split('T')[0]
  const weekLater = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const sixMonthsAgo  = new Date(Date.now() - 24 * 30 * 86400000).toISOString().slice(0, 7)
  const twoMonthsAgoDate = new Date(); twoMonthsAgoDate.setMonth(twoMonthsAgoDate.getMonth() - 2); twoMonthsAgoDate.setDate(1)
  const twoMonthsAgo  = twoMonthsAgoDate.toISOString().slice(0, 10)

  // ═══════════════════════════════════════════════════════════════
  // FASE 1 — Tutto in parallelo: nessuna query aspetta un'altra
  // ═══════════════════════════════════════════════════════════════
  const noop    = { data: null, error: null }
  const noopArr: never[] = []
  const noopN   = { count: 0, error: null }
  // PostgrestFilterBuilder è PromiseLike, non Promise — serve Promise.resolve() per .catch()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safe = (q: PromiseLike<unknown>) => Promise.resolve(q).catch(() => noop) as Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeData = (q: PromiseLike<unknown>) => Promise.resolve(q).then((r: any) => r?.data ?? []).catch(() => []) as Promise<any[]>

  const [
    clientsResult,
    assignmentsResult,
    tasksResult,
    tasksTodayResult,
    allTasksResult,
    allProfilesResult,
    invoicesPendingResult,
    invoicesByMonthResult,
    approvalsResult,
    membershipsResult,
    dealsResult,
    ticketsResult,
    okrResult,
    allTasksStatusResult,
    lateInvoicesResult,
    urgentTicketsResult,
    projectsWidgetResult,
    invoicesAllResult,
    decisionsResult,
    kpiSnapshotResult,
  ] = await Promise.all([
    isAdminLevel
      ? safe(supabase.from('clients').select('*').order('company_name'))
      : noop,

    !isAdminLevel
      ? safe(supabase.from('user_client_assignments').select('client_id').eq('user_id', user.id))
      : noop,

    isJuniorLevel
      ? safe(supabase.from('tasks')
          .select(`*, assignee:profiles!tasks_assignee_id_fkey(id,full_name,avatar_url), project:projects(id,name,client_id)`)
          .neq('status', 'completato').lte('due_date', weekLater).gte('due_date', today)
          .is('parent_task_id', null).eq('assigned_to', user.id).order('due_date'))
      : safe(supabase.from('tasks')
          .select(`*, assignee:profiles!tasks_assignee_id_fkey(id,full_name,avatar_url), project:projects(id,name,client_id)`)
          .neq('status', 'completato').lte('due_date', weekLater).gte('due_date', today)
          .is('parent_task_id', null).order('due_date')),

    isJuniorLevel
      ? safe(supabase.from('tasks').select('id,title').neq('status','completato').eq('due_date', today).eq('assigned_to', user.id))
      : safe(supabase.from('tasks').select('id,title').neq('status','completato').eq('due_date', today)),

    isAdminLevel
      ? safe(supabase.from('tasks')
          .select(`*, assignee:profiles!tasks_assignee_id_fkey(id,full_name,avatar_url,email), project:projects(id,name)`)
          .neq('status', 'completato').not('assigned_to', 'is', null))
      : noop,

    isAdminLevel
      ? safe(supabase.from('profiles').select('*').eq('is_active', true).order('full_name'))
      : noop,

    isAdminLevel
      ? safe(supabase.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['da_inviare','in_ritardo']))
      : noopN,

    isAdminLevel
      ? safe(supabase.from('invoices').select('month,amount').eq('invoice_type','fattura').eq('status','pagata').gte('month', sixMonthsAgo).order('month'))
      : noop,

    isAdminLevel
      ? safe(supabase.from('approvals').select('*', { count: 'exact', head: true }).eq('status','pending').then(r => r.error ? { count: 0 } : r))
      : { count: 0 },

    safe(supabase.from('channel_members').select('channel_id,last_read_at').eq('profile_id', user.id)),

    isAdminLevel
      ? safeData(supabase.from('deals').select('id,title,value,stage,probability,expected_close,company_name'))
      : noopArr,

    isAdminLevel
      ? safeData(supabase.from('tickets').select('status'))
      : noopArr,

    isAdminLevel
      ? safeData(supabase.from('objectives').select('id,title,description,quarter,owner_id,status,progress,area').order('progress', { ascending: false }))
      : noopArr,

    isAdminLevel
      ? safeData(supabase.from('tasks').select('status'))
      : noopArr,

    isAdminLevel
      ? safe(supabase.from('invoices').select('id,amount,client:clients(company_name)').eq('status','in_ritardo').limit(3))
      : noop,

    isAdminLevel
      ? safe(supabase.from('tickets').select('id,title,sla_hours,created_at').in('status',['aperto','in_lavorazione']).eq('priority','urgente').limit(2))
      : noop,

    safe(supabase.from('projects')
      .select(`id, name, project_type, project_kind, client_id, clients(company_name), tasks(id,status,due_date)`)
      .eq('status', 'attivo').order('created_at', { ascending: false })),

    isAdminLevel
      ? safeData(supabase.from('invoices').select('status,amount').eq('invoice_type', 'fattura'))
      : noopArr,

    isAdminLevel
      ? safeData(supabase.from('decisions').select('id,title,context,status,priority,outcome,decided_at,created_at')
          .neq('status', 'archiviata').order('created_at', { ascending: false }).limit(30))
      : noopArr,

    isAdminLevel
      ? safe(supabase.from('client_kpis')
          .select('client_id, month, mer, revenue_attributed, organic_sessions, uptime, leads_generated')
          .gte('month', twoMonthsAgo).order('month', { ascending: false }))
      : noop,
  ])

  // ═══════════════════════════════════════════════════════════════
  // FASE 2 — Clienti non-admin (dipende da assignments)
  // ═══════════════════════════════════════════════════════════════
  let clients: Client[] = (clientsResult.data ?? []) as Client[]

  if (!isAdminLevel && assignmentsResult.data?.length) {
    const ids = assignmentsResult.data.map((a: { client_id: string }) => a.client_id)
    const { data } = await supabase.from('clients').select('*').in('id', ids).order('company_name')
    clients = (data ?? []) as Client[]
  }

  // ═══════════════════════════════════════════════════════════════
  // FASE 3 — Chat messages (dipende da memberships per i channelIds)
  // ═══════════════════════════════════════════════════════════════
  const memberships = membershipsResult.data ?? []
  const channelIds = memberships.map((m: { channel_id: string }) => m.channel_id)
  let recentMessages: unknown[] = []
  let unreadCount = 0

  if (channelIds.length > 0) {
    try {
      const minLastRead = memberships
        .map((m: { last_read_at: string }) => m.last_read_at)
        .filter(Boolean).sort()[0] ?? new Date(0).toISOString()

      const [{ data: msgs }, { count: unread }] = await Promise.all([
        supabase.from('chat_messages')
          .select(`*, sender:profiles!chat_messages_sender_id_fkey(id,full_name,avatar_url), channel:chat_channels(id,name,type)`)
          .in('channel_id', channelIds).eq('is_deleted', false).order('created_at', { ascending: false }).limit(10),
        supabase.from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .in('channel_id', channelIds).gt('created_at', minLastRead)
          .eq('is_deleted', false).neq('sender_id', user.id),
      ])
      recentMessages = msgs ?? []
      unreadCount = unread ?? 0
    } catch {
      // network error — defaults già impostati
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Aggrega risultati
  // ═══════════════════════════════════════════════════════════════
  const mrr             = clients.reduce((s, c) => s + (c.mrr ?? 0), 0)
  const clientsAtRisk   = clients.filter(c => c.client_label === 'in_bilico').length
  const clientsLost     = clients.filter(c => c.client_label === 'perso').length
  const tasks           = tasksResult.data as TaskWithAssignee[] ?? []
  const tasksDueToday   = tasksTodayResult.data ?? []
  const allActiveTasks  = (allTasksResult.data ?? []) as TaskWithAssignee[]
  const allProfiles     = (allProfilesResult.data ?? []) as Profile[]
  const invoicesPending = (invoicesPendingResult as { count: number }).count ?? 0
  const approvalsPending = (approvalsResult as { count: number }).count ?? 0

  // Fatture per mese → grafico
  const grouped: Record<string, number> = {}
  for (const inv of invoicesByMonthResult.data ?? []) {
    const key = inv.month.slice(0, 7)
    grouped[key] = (grouped[key] ?? 0) + inv.amount
  }
  const invoicesByMonth = Object.entries(grouped)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // Pulse stats
  interface DealFull { id: string; title: string; value: number | null; stage: string; probability: number | null; expected_close: string | null; company_name: string }
  const dealsAll    = dealsResult as DealFull[]
  const dealsTotal  = dealsAll.length
  const dealsActive = dealsAll.filter(d => !['chiuso_vinto','chiuso_perso'].includes(d.stage)).length
  const dealsWon    = dealsAll.filter(d => d.stage === 'chiuso_vinto').length
  const ticketsAll      = ticketsResult as { status: string }[]
  const ticketsOpen     = ticketsAll.filter(t => !['risolto','chiuso'].includes(t.status)).length
  const ticketsResolved = ticketsAll.filter(t => ['risolto','chiuso'].includes(t.status)).length
  const okrAll      = okrResult as import('@/lib/types/database').Objective[]
  const okrProgress = okrAll.length ? Math.round(okrAll.reduce((s, o) => s + o.progress, 0) / okrAll.length) : 0
  const allTasksAll = allTasksStatusResult as { status: string }[]
  const tasksTotal  = allTasksAll.length
  const tasksDone   = allTasksAll.filter(t => t.status === 'completato').length

  // ─── Financial Control ────────────────────────────────────────
  const invoicesAll = invoicesAllResult as { status: string; amount: number }[]
  const financialSummary = {
    totalPaid:    invoicesAll.filter(i => i.status === 'pagata').reduce((s, i) => s + (i.amount ?? 0), 0),
    totalPending: invoicesAll.filter(i => ['da_inviare','inviata'].includes(i.status)).reduce((s, i) => s + (i.amount ?? 0), 0),
    totalOverdue: invoicesAll.filter(i => i.status === 'in_ritardo').reduce((s, i) => s + (i.amount ?? 0), 0),
    countPending: invoicesAll.filter(i => ['da_inviare','inviata'].includes(i.status)).length,
    countOverdue: invoicesAll.filter(i => i.status === 'in_ritardo').length,
  }

  // ─── Revenue Snapshot ─────────────────────────────────────────
  const revenueMonths: MonthRevenue[] = isAdminLevel ? (() => {
    const months: MonthRevenue[] = invoicesByMonth.map(m => ({ month: m.month, amount: m.amount }))
    const avg = months.length > 0 ? months.reduce((s, m) => s + m.amount, 0) / months.length : mrr
    const now = new Date()
    for (let i = 1; i <= 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const key = d.toISOString().slice(0, 7)
      if (!months.find(m => m.month === key))
        months.push({ month: key, amount: Math.round(avg * (1 + i * 0.02)), projected: true })
    }
    return months.slice(-8)
  })() : []

  // pulseAreas computed in DashboardGrid (needs JSX icons)

  // ─── Alert intelligenti ───────────────────────────────────────
  const alerts: DashAlert[] = []

  if (isAdminLevel) {
    for (const inv of lateInvoicesResult.data ?? []) {
      const clientName = (inv.client as any)?.company_name ?? 'Cliente'
      alerts.push({ id: `inv-${inv.id}`, severity: 'critico', icon: 'invoice', title: `Fattura in ritardo — ${clientName}`, detail: `€${inv.amount?.toLocaleString('it-IT')} non incassata`, href: '/fatturazione' })
    }
    for (const c of clients.filter(c => c.client_label === 'in_bilico').slice(0, 2)) {
      alerts.push({ id: `client-${c.id}`, severity: 'attenzione', icon: 'client', title: `Cliente in bilico — ${c.company_name}`, detail: `MRR a rischio: €${c.mrr?.toLocaleString('it-IT') ?? 0}/mese`, href: `/clienti/${c.id}` })
    }
    for (const c of clients.filter(c => c.client_label === 'perso').slice(0, 1)) {
      alerts.push({ id: `lost-${c.id}`, severity: 'critico', icon: 'client', title: `Cliente perso — ${c.company_name}`, detail: `Churn: -€${c.mrr?.toLocaleString('it-IT') ?? 0}/mese`, href: `/clienti/${c.id}` })
    }
    for (const t of urgentTicketsResult.data ?? []) {
      const elapsed = (Date.now() - new Date(t.created_at).getTime()) / 3600000
      if (elapsed > (t.sla_hours ?? 24) * 0.7) {
        alerts.push({ id: `ticket-${t.id}`, severity: elapsed > (t.sla_hours ?? 24) ? 'critico' : 'attenzione', icon: 'ticket', title: `SLA ${elapsed > (t.sla_hours ?? 24) ? 'superato' : 'quasi superato'} — ${t.title}`, detail: `${Math.round(elapsed)}h / ${t.sla_hours ?? 24}h SLA`, href: '/customer-care/tickets' })
      }
    }
  }

  if (tasksDueToday.length > 0) {
    alerts.push({ id: 'tasks-today', severity: 'attenzione', icon: 'task', title: `${tasksDueToday.length} task in scadenza oggi`, detail: 'Completa le attività prima di fine giornata', href: '/le-mie-attivita', time: 'Oggi' })
  }

  const orderSeverity: Record<AlertSeverity, number> = { critico: 0, attenzione: 1, info: 2 }
  alerts.sort((a, b) => orderSeverity[a.severity] - orderSeverity[b.severity])

  // ─── Progetti Widget ──────────────────────────────────────────
  const now = new Date()
  const projectSummaries: ProjectSummary[] = ((projectsWidgetResult.data ?? []) as unknown as Array<{
    id: string; name: string; project_type: string; project_kind: string | null; client_id: string
    clients: { company_name: string } | null
    tasks: Array<{ id: string; status: string; due_date: string | null }>
  }>).map(p => {
    const tasks = p.tasks ?? []
    const tasks_done    = tasks.filter(t => t.status === 'completato').length
    const tasks_overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'completato').length
    return {
      id: p.id,
      name: p.name,
      project_type: p.project_type ?? 'custom',
      project_kind: p.project_kind ?? null,
      client_name: p.clients?.company_name ?? '—',
      tasks_total: tasks.length,
      tasks_done,
      tasks_overdue,
      open_tickets: (ticketsAll as Array<{ status: string; client_id?: string }>).filter(t => !['risolto','chiuso'].includes(t.status)).length,
      last_activity: null,
    }
  }).sort((a, b) => (b.tasks_overdue + b.open_tickets) - (a.tasks_overdue + a.open_tickets))

  // ─── Daily Focus ──────────────────────────────────────────────
  const focusItems: FocusItem[] = []
  if (tasksDueToday.length > 0)
    focusItems.push({ id: `focus-task-${tasksDueToday[0].id}`, text: (tasksDueToday[0] as any).title, href: '/le-mie-attivita', source: 'Task in scadenza oggi', priority: 'alta' })
  if (isAdminLevel && invoicesPending > 0)
    focusItems.push({ id: 'focus-invoices', text: `${invoicesPending} fatture da gestire`, href: '/fatturazione', source: 'Fatturazione', priority: invoicesPending > 2 ? 'alta' : 'media' })
  if (isAdminLevel && clientsAtRisk > 0)
    focusItems.push({ id: 'focus-clients-risk', text: `${clientsAtRisk} client${clientsAtRisk > 1 ? 'i' : 'e'} a rischio — intervieni`, href: '/clienti', source: 'Salute clienti', priority: 'alta' })
  if (isAdminLevel && ticketsOpen > 3)
    focusItems.push({ id: 'focus-tickets', text: `${ticketsOpen} ticket aperti da smaltire`, href: '/customer-care/tickets', source: 'Customer Care', priority: 'media' })

  const greetingName = profile.full_name.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera'

  const aiContext = {
    mrr,
    clientsCount: clients.length,
    clientsAtRisk,
    clientsLost,
    alertsCount: alerts.length,
    tasksDueSoon: tasks.length,
    projectsCount: projectSummaries.length,
    topAlerts: alerts.slice(0, 4).map(a => ({ title: a.title, severity: a.severity })),
    clients: clients.slice(0, 20).map(c => ({ name: c.company_name, label: c.client_label ?? 'stabile', mrr: c.mrr, type: c.client_type ?? 'growth', id: c.id })),
  }

  // ─── KPI snapshot ─────────────────────────────────────────────
  type RawKpi = { client_id: string; month: string; mer?: number | null; revenue_attributed?: number | null; organic_sessions?: number | null; uptime?: number | null; leads_generated?: number | null }
  const kpiRaw = (kpiSnapshotResult.data ?? []) as RawKpi[]
  const kpiSnapshot = kpiRaw.map(k => ({
    ...k,
    company_name: clients.find(c => c.id === k.client_id)?.company_name ?? '—',
    client_type: clients.find(c => c.id === k.client_id)?.client_type ?? 'growth',
  }))

  const dashboardData: DashboardData = {
    aiContext,
    focusItems,
    greetingName,
    alerts,
    tasks,
    clients,
    mrr,
    revenueMonths,
    projectSummaries,
    allProfiles,
    allActiveTasks,
    clientsAtRisk,
    clientsLost,
    invoicesPending,
    isAdmin: isAdminLevel,
    isSuperAdmin: isGod,
    userId: user.id,
    pulseRaw: { dealsTotal, dealsActive, dealsWon, tasksTotal, tasksDone, ticketsOpen, ticketsResolved, okrProgress },
    dealsFull: dealsAll,
    financialSummary,
    decisions: decisionsResult as import('@/components/dashboard/DecisionCenter').Decision[],
    kpiSnapshot,
    objectives: okrAll,
  }

  return (
    <div className="p-5 lg:p-6 min-h-screen">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-white">{greeting}, {greetingName}</h1>
          <p className="text-[#444] text-xs mt-0.5">
            {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            {isAdminLevel && ` · ${clients.length} clienti · ${allProfiles.length} nel team`}
            {!isAdminLevel && ` · ${clients.length} clienti assegnati`}
          </p>
        </div>
        {isGod && (
          <div className="flex items-center gap-1.5 bg-[#F5C800]/10 border border-[#F5C800]/20 rounded-xl px-3 py-1.5">
            <Crown className="w-3.5 h-3.5 text-[#F5C800]" />
            <span className="text-xs font-black text-[#F5C800]">GOD MODE</span>
          </div>
        )}
      </div>

      {/* ── ADMIN: Dashboard modulare drag/resize/collapse ── */}
      {isAdminLevel && <DashboardGrid data={dashboardData} initialConfig={profile.dashboard_config as import('@/components/dashboard/DashboardGrid').DashboardConfig | null} />}

      {/* ── JUNIOR/SENIOR VIEW ── */}
      {!isAdminLevel && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DailyFocus items={focusItems.slice(0, 4)} name={greetingName} />
            <AlertCenter alerts={alerts.slice(0, 4)} />
          </div>
          <MyTasksPanel userId={user.id} tasks={tasks} />
        </div>
      )}
    </div>
  )
}
