import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { Map as MapIcon, Target, ArrowUpRight } from 'lucide-react'
import type { RoadmapItem, RoadmapStatus, Objective } from '@/lib/types/database'

export const revalidate = 0

const STATUS_STYLE: Record<RoadmapStatus, { color: string; label: string }> = {
  pianificato: { color: 'var(--color-info)', label: 'Pianificato' },
  in_corso: { color: 'var(--color-gold-text)', label: 'In corso' },
  completato: { color: 'var(--color-success)', label: 'Completato' },
  bloccato: { color: 'var(--color-error)', label: 'Bloccato' },
  rinviato: { color: 'var(--color-text-tertiary)', label: 'Rinviato' },
}

function quarterOf(dateStr: string): string {
  const d = new Date(dateStr)
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
}

export default async function RoadmapPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isFounder = SUPER_ADMIN_EMAILS.includes(profile?.email ?? '') || ['super_admin', 'founder'].includes(profile?.app_role ?? '')
  if (!isFounder) redirect('/dashboard')

  const [itemsRes, objectivesRes] = await Promise.all([
    supabase.from('roadmap_items').select('*').order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('objectives').select('id,title,quarter,progress,status').eq('status', 'attivo'),
  ])

  const items = (itemsRes.data ?? []) as RoadmapItem[]
  const objectives = (objectivesRes.data ?? []) as Pick<Objective, 'id' | 'title' | 'quarter' | 'progress' | 'status'>[]
  const objectiveById = new Map(objectives.map(o => [o.id, o]))

  const byQuarter = new Map<string, RoadmapItem[]>()
  const noDate: RoadmapItem[] = []
  for (const item of items) {
    const key = item.due_date ? quarterOf(item.due_date) : null
    if (!key) { noDate.push(item); continue }
    const arr = byQuarter.get(key) ?? []
    arr.push(item)
    byQuarter.set(key, arr)
  }

  const quarters = Array.from(byQuarter.keys()).sort((a, b) => {
    const [qa, ya] = [Number(a[1]), Number(a.slice(3))]
    const [qb, yb] = [Number(b[1]), Number(b.slice(3))]
    return ya !== yb ? ya - yb : qa - qb
  })

  const currentQuarter = quarterOf(new Date().toISOString())

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-gold-text" />
            Roadmap
          </h1>
          <p className="text-overlay/40 text-sm mt-0.5">{items.length} iniziative su {quarters.length} trimestri</p>
        </div>
        <Link href="/strategia" className="flex items-center gap-1.5 text-xs text-overlay/40 hover:text-gold-text transition-colors">
          <Target className="w-3.5 h-3.5" /> OKR & Strategia <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      {items.length === 0 && (
        <div className="text-center py-20 text-overlay/30 text-sm">
          Nessuna iniziativa in roadmap. Aggiungile da <Link href="/strategia" className="text-gold-text/70 hover:text-gold-text">Strategia & OKR</Link>.
        </div>
      )}

      <div className="space-y-8">
        {quarters.map(q => {
          const isCurrent = q === currentQuarter
          const qItems = byQuarter.get(q) ?? []
          return (
            <section key={q} className="relative">
              <div className="flex items-center gap-3 mb-3">
                <h2 className={`text-sm font-bold ${isCurrent ? 'text-gold-text' : 'text-overlay/60'}`}>{q}</h2>
                {isCurrent && (
                  <span className="text-2xs font-bold uppercase tracking-wider bg-gold-dim text-gold-text px-2 py-0.5 rounded-full">
                    In corso
                  </span>
                )}
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-overlay/30">{qItems.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {qItems.map(item => {
                  const st = STATUS_STYLE[item.status]
                  const obj = item.objective_id ? objectiveById.get(item.objective_id) : null
                  return (
                    <div key={item.id} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-text-primary text-sm font-medium leading-snug">{item.title}</p>
                        <span className="shrink-0 text-2xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: st.color, background: `color-mix(in srgb, ${st.color} 9%, transparent)` }}>
                          {st.label}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-overlay/40 text-xs leading-relaxed line-clamp-2">{item.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-auto pt-1 text-2xs text-overlay/30">
                        <span className="uppercase tracking-wide">{item.area}</span>
                        {item.due_date && (
                          <span>· {new Date(item.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>
                        )}
                        <span className={`ml-auto font-semibold ${item.priority === 'critica' ? 'text-error' : item.priority === 'alta' ? 'text-gold-text/70' : ''}`}>
                          {item.priority}
                        </span>
                      </div>
                      {obj && (
                        <div className="border-t border-border pt-2 flex items-center gap-2">
                          <Target className="w-3 h-3 text-gold-text/50 shrink-0" />
                          <span className="text-2xs text-overlay/40 truncate flex-1">{obj.title}</span>
                          <span className="text-2xs text-gold-text/70 font-semibold">{obj.progress}%</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}

        {noDate.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-bold text-overlay/40">Senza scadenza</h2>
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-overlay/30">{noDate.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {noDate.map(item => {
                const st = STATUS_STYLE[item.status]
                return (
                  <div key={item.id} className="bg-surface border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-text-primary text-sm font-medium leading-snug">{item.title}</p>
                      <span className="shrink-0 text-2xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: st.color, background: `color-mix(in srgb, ${st.color} 9%, transparent)` }}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-2xs text-overlay/30 uppercase tracking-wide mt-2">{item.area}</p>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
