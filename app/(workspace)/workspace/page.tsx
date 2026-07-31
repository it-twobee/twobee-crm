import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Clock, Calendar, ArrowRight, Users, Headphones, ListChecks,
  Briefcase, AlertTriangle, CheckSquare, CalendarClock,
} from 'lucide-react'
import type { Task } from '@/lib/types/database'

export const revalidate = 0

const TASK_TONE: Record<string, string> = {
  da_fare: 'text-text-tertiary', in_corso: 'text-info', in_review: 'text-warning',
  richiesta_supporto: 'text-orange', completato: 'text-success',
}
const today = () => new Date().toISOString().slice(0, 10)
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

export default async function WorkspaceDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [hrRes, { data: profile }, clientsRes, ticketsRes, taRes] = await Promise.all([
    supabase.from('hr_requests').select('id, status').eq('profile_id', user.id).eq('status', 'pending'),
    supabase.from('profiles').select('full_name, app_role, email, google_connected').eq('id', user.id).single(),
    supabase.from('clients_workspace').select('id').neq('client_label', 'perso'),
    supabase.from('tickets').select('id').in('status', ['aperto', 'in_lavorazione']),
    supabase.from('task_assignees').select('task_id').eq('profile_id', user.id),
  ])

  // task assegnate (primario o multi-assegnatario), non completate
  const ids = Array.from(new Set((taRes.data ?? []).map(r => r.task_id)))
  const orFilter = ids.length ? `assignee_id.eq.${user.id},id.in.(${ids.join(',')})` : `assignee_id.eq.${user.id}`
  const { data: myTasks } = await supabase
    .from('tasks').select('id, title, status, priority, due_date, assignee_id, project_id, client_id')
    .is('deleted_at', null).neq('status', 'completato')
    .or(orFilter).order('due_date', { ascending: true, nullsFirst: false })
  const tasks = (myTasks ?? []) as Task[]

  // progetti dove sono coinvolto
  const { data: pm } = await supabase.from('project_members').select('project_id').eq('profile_id', user.id)
  const projectIds = Array.from(new Set([
    ...(pm ?? []).map(r => r.project_id),
    ...tasks.map(t => t.project_id).filter(Boolean) as string[],
  ]))
  const [{ data: myProjects }, { data: mgr }] = await Promise.all([
    projectIds.length ? supabase.from('projects').select('id, name, status, area, client_id').in('id', projectIds).is('deleted_at', null) : Promise.resolve({ data: [] }),
    supabase.from('projects').select('id, name, status, area, client_id').eq('manager_id', user.id).is('deleted_at', null),
  ])
  const projMap = new Map<string, { id: string; name: string; status: string; area: string; client_id: string }>()
  ;[...(myProjects ?? []), ...(mgr ?? [])].forEach(p => projMap.set(p.id, p))
  const projects = Array.from(projMap.values()).filter(p => p.status === 'active').slice(0, 6)
  const projectName = (id: string | null) => id ? (projMap.get(id)?.name ?? 'Progetto') : 'Ad Hoc'

  const t = today(), weekEnd = inDays(7)
  const dueToday = tasks.filter(x => x.due_date === t).length
  const dueWeek = tasks.filter(x => x.due_date && x.due_date > t && x.due_date <= weekEnd).length
  const overdue = tasks.filter(x => x.due_date && x.due_date < t).length
  const upcoming = tasks.filter(x => x.due_date).slice(0, 6)

  const googleConnected = Boolean((profile as { google_connected?: boolean } | null)?.google_connected)
  const name = profile?.full_name?.split(' ')[0] ?? 'ciao'

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-heading">Ciao, {name} 👋</h1>
        <p className="text-text-secondary text-sm mt-1 capitalize">
          {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {!googleConnected && (
        <div className="mb-5 flex items-center gap-3 p-4 rounded-2xl border border-gold/30 bg-gold-dim shadow-soft">
          <Calendar className="w-5 h-5 text-gold-text shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">Collega il tuo Google Calendar aziendale</p>
            <p className="text-xs text-text-secondary mt-0.5">Sincronizza appuntamenti e scadenze, e crea eventi dal calendario.</p>
          </div>
          <a href="/api/google/auth" className="px-4 py-2 bg-gold text-on-gold rounded-lg text-sm font-bold hover:bg-gold/90 transition-colors shrink-0 press">
            Collega
          </a>
        </div>
      )}

      {/* Stat operative personali */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 animate-fade-in">
        <StatCard href="/workspace/attivita" label="In scadenza oggi" value={dueToday} icon={<CalendarClock className="w-4 h-4 text-warning" />} />
        <StatCard href="/workspace/attivita" label="Questa settimana" value={dueWeek} icon={<ListChecks className="w-4 h-4 text-info" />} />
        <StatCard href="/workspace/attivita" label="Scadute" value={overdue} tone={overdue ? 'error' : undefined} icon={<AlertTriangle className={`w-4 h-4 ${overdue ? 'text-error' : 'text-text-tertiary'}`} />} />
        <StatCard href="/workspace/progetti" label="Progetti attivi" value={projects.length} icon={<Briefcase className="w-4 h-4 text-gold-text" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Le mie prossime attività */}
        <section className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-gold-text" />
              <h2 className="text-sm font-bold text-text-primary">Le mie attività</h2>
            </div>
            <Link href="/workspace/attivita" className="text-2xs font-semibold text-gold-text hover:opacity-80 flex items-center gap-0.5">
              Tutte <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-2xs text-text-tertiary py-4 text-center">Nessuna attività in scadenza. 🎉</p>
          ) : (
            <div className="space-y-1.5">
              {upcoming.map(x => (
                <Link key={x.id} href="/workspace/attivita" className="flex items-center gap-2 group">
                  <span className="flex-1 text-sm text-text-primary truncate">{x.title}</span>
                  <span className="text-2xs text-text-tertiary truncate max-w-[90px] hidden sm:inline">{projectName(x.project_id)}</span>
                  {x.due_date && x.due_date < t && <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0" />}
                  <span className={`text-2xs tabular shrink-0 ${x.due_date && x.due_date < t ? 'text-error' : 'text-text-tertiary'}`}>{x.due_date}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* I miei progetti */}
        <section className="bg-surface border border-border rounded-2xl p-4 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-gold-text" />
              <h2 className="text-sm font-bold text-text-primary">I miei progetti</h2>
            </div>
            <Link href="/workspace/progetti" className="text-2xs font-semibold text-gold-text hover:opacity-80 flex items-center gap-0.5">
              Tutti <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {projects.length === 0 ? (
            <p className="text-2xs text-text-tertiary py-4 text-center">Nessun progetto attivo assegnato.</p>
          ) : (
            <div className="space-y-1.5">
              {projects.map(p => (
                <Link key={p.id} href={`/workspace/progetti/${p.id}`} className="flex items-center gap-2 group">
                  <Briefcase className="w-3.5 h-3.5 text-gold-text shrink-0" />
                  <span className="flex-1 text-sm text-text-primary truncate">{p.name}</span>
                  <span className="text-2xs text-text-tertiary capitalize shrink-0">{p.area}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* riga inferiore: stat generali + HR */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
        <StatCard href="/workspace/clienti" label="Clienti attivi" value={clientsRes.data?.length ?? 0} icon={<Users className="w-4 h-4 text-info" />} />
        <StatCard href="/workspace/customer-care/tickets" label="Ticket aperti" value={ticketsRes.data?.length ?? 0} icon={<Headphones className="w-4 h-4 text-gold-text" />} />
        {(hrRes.data?.length ?? 0) > 0 && (
          <Link href="/workspace/hr" className="card-interactive bg-surface border border-gold/20 rounded-2xl p-4 flex items-center gap-3 no-tap-highlight">
            <Clock className="w-4 h-4 text-gold-text shrink-0" />
            <span className="text-sm text-gold-text flex-1">{hrRes.data!.length} richiesta HR in attesa</span>
            <ArrowRight className="w-3.5 h-3.5 text-gold-text" />
          </Link>
        )}
      </div>
    </div>
  )
}

function StatCard({ href, label, value, icon, tone }: {
  href: string; label: string; value: number; icon: React.ReactNode; tone?: 'error'
}) {
  return (
    <Link href={href} className="card-interactive bg-surface border border-border rounded-2xl p-4 shadow-soft no-tap-highlight">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-2xs text-text-tertiary">{label}</span>
        {icon}
      </div>
      <p className={`text-2xl font-black tabular font-heading ${tone === 'error' ? 'text-error' : 'text-text-primary'}`}>{value}</p>
    </Link>
  )
}
