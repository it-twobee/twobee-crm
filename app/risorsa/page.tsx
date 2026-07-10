import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CheckSquare, Clock, AlertTriangle, ArrowRight, CalendarClock } from 'lucide-react'
import type { TaskWithAssignee } from '@/lib/types/database'

export const revalidate = 0

export default async function RisorsaHome() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
  const { data: profile } = await sb.from('profiles').select('full_name').eq('id', user.id).single()

  const [tasksRes, timeRes] = await Promise.all([
    sb.from('tasks')
      .select('*, project:projects(id, name, client_id, clients(company_name))')
      .eq('assignee_id', user.id).neq('status', 'completato')
      .order('due_date', { ascending: true, nullsFirst: false }),
    sb.from('time_entries').select('date, hours').eq('profile_id', user.id).gte('date', weekAgo),
  ])

  const tasks = (tasksRes.data ?? []) as unknown as TaskWithAssignee[]
  const time = (timeRes.data ?? []) as { date: string; hours: number }[]

  const overdue  = tasks.filter(t => t.due_date && t.due_date < today)
  const dueToday = tasks.filter(t => t.due_date === today)
  const dueWeek  = tasks.filter(t => t.due_date && t.due_date > today && t.due_date <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
  const hoursToday = time.filter(t => t.date === today).reduce((s, t) => s + t.hours, 0)
  const hoursWeek  = time.reduce((s, t) => s + t.hours, 0)

  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera' })()

  const Stat = ({ icon, label, value, color, href }: { icon: React.ReactNode; label: string; value: string; color: string; href: string }) => (
    <Link href={href} className="bg-surface border border-border rounded-2xl p-4 hover:border-border transition-colors group">
      <div className="flex items-center justify-between mb-2">
        <span className="p-2 rounded-xl" style={{ background: `${color}15`, color }}>{icon}</span>
        <ArrowRight className="w-3.5 h-3.5 text-text-tertiary group-hover:text-text-secondary" />
      </div>
      <p className="text-2xl font-black" style={{ color }}>{value}</p>
      <p className="text-[10px] text-text-secondary uppercase tracking-wider font-bold mt-0.5">{label}</p>
    </Link>
  )

  return (
    <div className="max-w-4xl mx-auto px-5 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-black text-text-primary">{greeting}, {profile?.full_name?.split(' ')[0] ?? ''}</h1>
        <p className="text-text-tertiary text-xs mt-0.5">{new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Task scaduti" value={String(overdue.length)} color={overdue.length ? '#EF4444' : '#22C55E'} href="/risorsa/attivita" />
        <Stat icon={<CalendarClock className="w-4 h-4" />} label="In scadenza oggi" value={String(dueToday.length)} color="#F5C800" href="/risorsa/attivita" />
        <Stat icon={<Clock className="w-4 h-4" />} label="Ore oggi" value={`${hoursToday}h`} color="#3B82F6" href="/risorsa/timesheet" />
        <Stat icon={<Clock className="w-4 h-4" />} label="Ore settimana" value={`${hoursWeek}h`} color="#A855F7" href="/risorsa/timesheet" />
      </div>

      {/* Prossime attività */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-gold" />
            <span className="text-sm font-bold text-text-primary">Le mie prossime attività</span>
          </div>
          <Link href="/risorsa/attivita" className="text-[10px] text-text-secondary hover:text-text-primary flex items-center gap-1">Tutte <ArrowRight className="w-3 h-3" /></Link>
        </div>
        {tasks.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-text-secondary text-sm">Nessuna attività assegnata.</p>
            <p className="text-text-tertiary text-xs mt-1">Quando ti verrà assegnato un task, lo troverai qui.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {[...overdue, ...dueToday, ...dueWeek].slice(0, 6).map(t => {
              const proj = (t as any).project
              const isOver = t.due_date && t.due_date < today
              return (
                <Link key={t.id} href={proj?.client_id ? `/clienti/${proj.client_id}/progetto/${proj.id}` : '/risorsa/attivita'}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-overlay/[0.03] transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isOver ? '#EF4444' : t.due_date === today ? '#F5C800' : '#3B82F6' }} />
                  <span className="flex-1 text-sm text-text-primary truncate">{t.title}</span>
                  <span className="text-[10px] text-text-tertiary truncate hidden sm:block">{proj?.clients?.company_name ?? proj?.name ?? ''}</span>
                  {t.due_date && <span className={`text-[10px] shrink-0 ${isOver ? 'text-red-400' : 'text-text-secondary'}`}>{new Date(t.due_date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
