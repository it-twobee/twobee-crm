import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import type { DashboardData } from '@/components/dashboard/DashboardGrid'
import type { Client, Profile, ChatMessageWithSender, ChatChannel } from '@/lib/types/database'
import type { DashAlert, AlertSeverity } from '@/components/dashboard/AlertCenter'
import type { FocusItem } from '@/components/dashboard/DailyFocus'
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

  const twoMonthsAgoDate = new Date()
  twoMonthsAgoDate.setMonth(twoMonthsAgoDate.getMonth() - 2)
  twoMonthsAgoDate.setDate(1)
  const twoMonthsAgo = twoMonthsAgoDate.toISOString().slice(0, 10)

  // Supabase risolve con { error } invece di reject: logga per rendere osservabili i fallimenti.
  const noop = { data: null, error: null }
  const logErr = (label: string, err: unknown) =>
    console.error(`[dashboard] ${label}:`, err instanceof Error ? err.message : err)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safe = (q: PromiseLike<unknown>, label = 'query') => Promise.resolve(q)
    .then((r: any) => { if (r?.error) logErr(label, r.error.message ?? r.error); return r })
    .catch((e) => { logErr(`${label} (throw)`, e); return noop }) as Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeData = (q: PromiseLike<unknown>, label = 'query') => Promise.resolve(q)
    .then((r: any) => { if (r?.error) logErr(label, r.error.message ?? r.error); return r?.data ?? [] })
    .catch((e) => { logErr(`${label} (throw)`, e); return [] }) as Promise<any[]>

  const [
    clientsResult,
    assignmentsResult,
    allProfilesResult,
    membershipsResult,
    ticketsResult,
    urgentTicketsResult,
    kpiSnapshotResult,
  ] = await Promise.all([
    isAdminLevel
      ? safe(supabase.from('clients').select('*').order('company_name'), 'clients')
      : noop,
    !isAdminLevel
      ? safe(supabase.from('user_client_assignments').select('client_id').eq('user_id', user.id), 'assignments')
      : noop,
    isAdminLevel
      ? safe(supabase.from('profiles').select('*').eq('is_active', true).order('full_name'), 'allProfiles')
      : noop,
    safe(supabase.from('channel_members').select('channel_id,last_read_at').eq('profile_id', user.id), 'memberships'),
    isAdminLevel
      ? safeData(supabase.from('tickets').select('status'), 'ticketsStatus')
      : Promise.resolve([]),
    isAdminLevel
      ? safe(supabase.from('tickets').select('id,title,sla_hours,created_at').in('status', ['aperto', 'in_lavorazione']).eq('priority', 'urgente').limit(2), 'urgentTickets')
      : noop,
    isAdminLevel
      ? safe(supabase.from('client_kpis')
          .select('client_id,month,mer,revenue_attributed,organic_sessions,uptime,leads_generated')
          .gte('month', twoMonthsAgo).order('month', { ascending: false }), 'kpiSnapshot')
      : noop,
  ])

  // Clienti non-admin: solo quelli assegnati
  let clients: Client[] = (clientsResult.data ?? []) as Client[]
  if (!isAdminLevel && assignmentsResult.data?.length) {
    const ids = assignmentsResult.data.map((a: { client_id: string }) => a.client_id)
    const { data, error } = await supabase.from('clients').select('*').in('id', ids).order('company_name')
    if (error) logErr('clientsAssigned', error.message)
    clients = (data ?? []) as Client[]
  }

  // Ultimi messaggi delle chat di cui l'utente è membro
  const memberships = membershipsResult.data ?? []
  const channelIds = memberships.map((m: { channel_id: string }) => m.channel_id)
  let recentMessages: DashboardData['recentMessages'] = []
  if (channelIds.length > 0) {
    const { data: msgs, error } = await supabase.from('chat_messages')
      .select('*, sender:profiles!chat_messages_sender_id_fkey(id,full_name,avatar_url), channel:chat_channels(id,name,type)')
      .in('channel_id', channelIds).eq('is_deleted', false)
      .order('created_at', { ascending: false }).limit(10)
    if (error) logErr('chatMessages', error.message)
    recentMessages = (msgs ?? []) as unknown as (ChatMessageWithSender & { channel: Pick<ChatChannel, 'id' | 'name' | 'type'> | null })[]
  }

  const externalClients = clients.filter(c => !c.is_internal)
  const mrr           = externalClients.reduce((s, c) => s + (c.mrr ?? 0), 0)
  const clientsAtRisk = externalClients.filter(c => c.client_label === 'in_bilico').length
  const clientsLost   = externalClients.filter(c => c.client_label === 'perso').length
  const allProfiles   = (allProfilesResult.data ?? []) as Profile[]

  const ticketsAll      = ticketsResult as { status: string }[]
  const ticketsOpen     = ticketsAll.filter(t => !['risolto', 'chiuso'].includes(t.status)).length
  const ticketsResolved = ticketsAll.filter(t => ['risolto', 'chiuso'].includes(t.status)).length

  // ─── Alert ────────────────────────────────────────────────────
  const alerts: DashAlert[] = []
  if (isAdminLevel) {
    for (const c of externalClients.filter(c => c.client_label === 'in_bilico').slice(0, 2)) {
      alerts.push({ id: `client-${c.id}`, severity: 'attenzione', icon: 'client', title: `Cliente in bilico — ${c.company_name}`, detail: `MRR a rischio: €${c.mrr?.toLocaleString('it-IT') ?? 0}/mese`, href: `/clienti/${c.id}` })
    }
    for (const c of externalClients.filter(c => c.client_label === 'perso').slice(0, 1)) {
      alerts.push({ id: `lost-${c.id}`, severity: 'critico', icon: 'client', title: `Cliente perso — ${c.company_name}`, detail: `Churn: -€${c.mrr?.toLocaleString('it-IT') ?? 0}/mese`, href: `/clienti/${c.id}` })
    }
    for (const t of urgentTicketsResult.data ?? []) {
      const elapsed = (Date.now() - new Date(t.created_at).getTime()) / 3600000
      if (elapsed > (t.sla_hours ?? 24) * 0.7) {
        alerts.push({ id: `ticket-${t.id}`, severity: elapsed > (t.sla_hours ?? 24) ? 'critico' : 'attenzione', icon: 'ticket', title: `SLA ${elapsed > (t.sla_hours ?? 24) ? 'superato' : 'quasi superato'} — ${t.title}`, detail: `${Math.round(elapsed)}h / ${t.sla_hours ?? 24}h SLA`, href: '/customer-care/tickets' })
      }
    }
  }
  const orderSeverity: Record<AlertSeverity, number> = { critico: 0, attenzione: 1, info: 2 }
  alerts.sort((a, b) => orderSeverity[a.severity] - orderSeverity[b.severity])

  // ─── Daily Focus ──────────────────────────────────────────────
  const focusItems: FocusItem[] = []
  if (isAdminLevel && clientsAtRisk > 0)
    focusItems.push({ id: 'focus-clients-risk', text: `${clientsAtRisk} client${clientsAtRisk > 1 ? 'i' : 'e'} a rischio — intervieni`, href: '/clienti', source: 'Salute clienti', priority: 'alta' })
  if (isAdminLevel && ticketsOpen > 3)
    focusItems.push({ id: 'focus-tickets', text: `${ticketsOpen} ticket aperti da smaltire`, href: '/customer-care/tickets', source: 'Customer Care', priority: 'media' })

  const greetingName = profile.full_name.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera'

  const aiContext = {
    mrr,
    clientsCount: externalClients.length,
    clientsAtRisk,
    clientsLost,
    alertsCount: alerts.length,
    tasksDueSoon: 0,
    projectsCount: 0,
    topAlerts: alerts.slice(0, 4).map(a => ({ title: a.title, severity: a.severity })),
    clients: externalClients.slice(0, 20).map(c => ({ name: c.company_name, label: c.client_label ?? 'stabile', mrr: c.mrr, type: c.client_type ?? 'growth', id: c.id })),
  }

  type RawKpi = { client_id: string; month: string; mer?: number | null; revenue_attributed?: number | null; organic_sessions?: number | null; uptime?: number | null; leads_generated?: number | null }
  const kpiSnapshot = ((kpiSnapshotResult.data ?? []) as RawKpi[]).map(k => ({
    ...k,
    company_name: clients.find(c => c.id === k.client_id)?.company_name ?? '—',
    client_type: clients.find(c => c.id === k.client_id)?.client_type ?? 'growth',
  }))

  const dashboardData: DashboardData = {
    aiContext,
    focusItems,
    greetingName,
    alerts,
    clients,
    mrr,
    allProfiles,
    clientsAtRisk,
    clientsLost,
    ticketsOpen,
    ticketsResolved,
    recentMessages,
    kpiSnapshot,
    isAdmin: isAdminLevel,
    isSuperAdmin: isGod,
    userId: user.id,
  }

  return (
    <div className="p-4 sm:p-5 lg:p-8 min-h-screen">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-text-primary font-heading tracking-tight">{greeting}, {greetingName}</h1>
          <p className="text-text-secondary text-xs mt-1">
            {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            {isAdminLevel && ` · ${clients.length} clienti · ${allProfiles.length} nel team`}
            {!isAdminLevel && ` · ${clients.length} clienti assegnati`}
          </p>
        </div>
        {isGod && (
          <div className="flex items-center gap-1.5 bg-gold/[0.08] border border-gold/[0.15] rounded-xl px-3 py-1.5">
            <Crown className="w-3.5 h-3.5 text-gold-text" />
            <span className="text-xs font-black text-gold-text">GOD MODE</span>
          </div>
        )}
      </div>

      {isAdminLevel
        ? <DashboardGrid data={dashboardData} initialConfig={profile.dashboard_config as import('@/components/dashboard/DashboardGrid').DashboardConfig | null} />
        : (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center">
            <p className="text-sm text-text-secondary">
              La dashboard operativa verrà ricostruita insieme al nuovo flusso di progetto.
            </p>
          </div>
        )}
    </div>
  )
}
