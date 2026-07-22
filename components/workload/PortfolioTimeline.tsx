'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronDown, Flag, Zap, ListChecks, X, ExternalLink } from 'lucide-react'
import { isoLocal, type WLProject, type WLSprint, type WLTask } from '@/lib/workload'
import { usePortalRoutes } from '@/lib/portal-routes'

// Timeline di portfolio espandibile (stile Asana "Cronologia"): ogni progetto in
// parallelo è una riga sulla stessa timeline; espandendola compaiono sprint,
// milestone o task (granularità selezionabile) come barre/traguardi.
type Grana = 'sprint' | 'milestone' | 'task'
type Detail = { kind: 'project' | 'sprint' | 'milestone' | 'task'; id: string; title: string; projectId: string; clientId: string; start?: string; end?: string }
const TYPE_LABEL: Record<Detail['kind'], string> = { project: 'Progetto', sprint: 'Sprint', milestone: 'Milestone', task: 'Task' }

const COL_W = 44          // px per settimana
const NAME_W = 190        // px colonna nomi
const ROW_H = 30
const HEAD_H = 40         // header a due righe (mese + settimana)

const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000)
const monday = (d: Date) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x }
const fmtDay = (d: Date) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

export function PortfolioTimeline({ projects, sprints, tasks }: {
  projects: WLProject[]
  sprints: WLSprint[]
  tasks: WLTask[]
}) {
  const { projectHref } = usePortalRoutes()
  const [grana, setGrana] = useState<Grana>('milestone')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [detail, setDetail] = useState<Detail | null>(null)

  // Scopo tutto ai soli progetti mostrati, così la timeline non si allarga per date altrui.
  const pids = useMemo(() => new Set(projects.map(p => p.id)), [projects])
  const sp = useMemo(() => sprints.filter(s => pids.has(s.project_id)), [sprints, pids])
  const tk = useMemo(() => tasks.filter(t => t.project_id && pids.has(t.project_id)), [tasks, pids])

  const byProject = useMemo(() => {
    const map = new Map<string, { sprints: WLSprint[]; milestones: WLTask[]; tasks: WLTask[] }>()
    for (const p of projects) map.set(p.id, { sprints: [], milestones: [], tasks: [] })
    for (const s of sp) map.get(s.project_id)?.sprints.push(s)
    for (const t of tk) {
      const b = t.project_id ? map.get(t.project_id) : undefined; if (!b) continue
      if (t.is_milestone) { if (t.due_date) b.milestones.push(t) }
      else if (t.due_date || t.start_date) b.tasks.push(t)
    }
    return map
  }, [projects, sp, tk])

  // Intervallo temporale complessivo (con oggi sempre incluso).
  const grid = useMemo(() => {
    const dates: string[] = [isoLocal(new Date())]
    for (const s of sp) { dates.push(s.start_date, s.end_date) }
    for (const t of tk) { if (t.start_date) dates.push(t.start_date); if (t.due_date) dates.push(t.due_date) }
    const valid = dates.filter(Boolean).sort()
    if (!valid.length) return null
    const start = monday(parse(valid[0]))
    const end = parse(valid[valid.length - 1])
    const weeks = Math.max(1, Math.ceil((daysBetween(start, end) + 1) / 7) + 1)
    return { start, weeks }
  }, [sp, tk])

  if (!grid) return <p className="text-xs text-text-tertiary px-1 py-4">Nessuna data pianificata da mostrare.</p>

  const xOf = (dateStr: string) => (daysBetween(grid.start, parse(dateStr)) / 7) * COL_W
  const gridW = grid.weeks * COL_W
  const todayIso = isoLocal(new Date())
  const todayX = xOf(todayIso)
  const todayWeekIdx = Math.floor(daysBetween(grid.start, parse(todayIso)) / 7)
  const todayInRange = todayX >= 0 && todayX <= gridW

  // Settimane + raggruppamento per mese (header a due righe, stile Asana).
  const weeksArr = Array.from({ length: grid.weeks }, (_, i) => { const d = new Date(grid.start); d.setDate(d.getDate() + i * 7); return d })
  const monthSegs: { label: string; start: number; span: number }[] = []
  weeksArr.forEach((d, i) => {
    const label = d.toLocaleDateString('it-IT', { month: 'long' })
    const last = monthSegs[monthSegs.length - 1]
    if (last && last.label === label) last.span++
    else monthSegs.push({ label, start: i, span: 1 })
  })

  const rangeOf = (b: { sprints: WLSprint[]; milestones: WLTask[]; tasks: WLTask[] }): [string, string] | null => {
    const s: string[] = []
    b.sprints.forEach(sp => { s.push(sp.start_date, sp.end_date) })
    b.tasks.forEach(t => { if (t.start_date) s.push(t.start_date); if (t.due_date) s.push(t.due_date) })
    b.milestones.forEach(m => { if (m.due_date) s.push(m.due_date) })
    const v = s.filter(Boolean).sort()
    return v.length ? [v[0], v[v.length - 1]] : null
  }

  const Bar = ({ start, end, accent, label, dim, onClick }: { start: string; end: string; accent: string; label?: string; dim?: boolean; onClick?: () => void }) => {
    const left = xOf(start), w = Math.max(8, xOf(end) - left)
    return (
      <button type="button" onClick={onClick}
        className="absolute top-1/2 -translate-y-1/2 h-4 rounded-md flex items-center px-1.5 overflow-hidden text-left hover:brightness-125 transition-all"
        style={{ left, width: w, background: `color-mix(in srgb, ${accent} ${dim ? 14 : 22}%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)` }}
        title={label}>
        {label && w > 44 && <span className="text-2xs font-semibold truncate" style={{ color: accent }}>{label}</span>}
      </button>
    )
  }
  const Diamond = ({ date, label, onClick }: { date: string; label: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick} className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1 hover:brightness-125 transition-all" style={{ left: xOf(date) - 5 }} title={label}>
      <span className="w-2.5 h-2.5 rotate-45 shrink-0" style={{ background: 'var(--color-gold)', border: '1px solid color-mix(in srgb, var(--color-gold-text) 50%, transparent)' }} />
      <span className="text-2xs text-text-secondary whitespace-nowrap">{label}</span>
    </button>
  )

  const GRANA: { k: Grana; label: string; icon: typeof Zap }[] = [
    { k: 'milestone', label: 'Milestone', icon: Flag }, { k: 'sprint', label: 'Sprint', icon: Zap }, { k: 'task', label: 'Task', icon: ListChecks },
  ]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-text-tertiary">Progetti in parallelo · espandi per {grana === 'milestone' ? 'i traguardi' : grana === 'sprint' ? 'gli sprint' : 'le task'}</p>
        <div className="flex gap-1 rounded-lg bg-background border border-border p-0.5">
          {GRANA.map(g => (
            <button key={g.k} onClick={() => setGrana(g.k)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-2xs font-semibold transition-colors ${grana === g.k ? 'bg-gold-dim text-gold-text' : 'text-text-tertiary hover:text-text-primary'}`}>
              <g.icon className="w-3 h-3" /> {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-auto max-h-[70vh] border border-border rounded-xl">
        <div style={{ minWidth: NAME_W + gridW }}>
          {/* Header a due righe (mese + settimana): fisso in alto, colonna nomi fissa a sinistra */}
          <div className="flex sticky top-0 z-20 bg-surface border-b border-border">
            <div className="shrink-0 sticky left-0 z-30 bg-surface border-r border-border" style={{ width: NAME_W, height: HEAD_H }} />
            <div className="relative" style={{ width: gridW, height: HEAD_H }}>
              {monthSegs.map((m, i) => (
                <div key={`m${i}`} className="absolute top-0 h-5 flex items-center text-2xs font-semibold text-text-secondary capitalize border-l border-border/60 pl-1 overflow-hidden"
                  style={{ left: m.start * COL_W, width: m.span * COL_W }}>{m.label}</div>
              ))}
              {weeksArr.map((d, i) => (
                <div key={`w${i}`} className={`absolute h-5 flex items-center text-2xs border-l border-border/50 pl-1 ${i === todayWeekIdx ? 'text-gold-text font-bold' : 'text-text-tertiary'}`}
                  style={{ top: 20, left: i * COL_W, width: COL_W }}>{d.getDate()}</div>
              ))}
              {todayInRange && (
                <div className="absolute -translate-x-1/2 z-20" style={{ left: todayX, bottom: -4 }} title="Oggi">
                  <span className="block w-2.5 h-2.5 rounded-full bg-gold ring-2 ring-surface" />
                </div>
              )}
            </div>
          </div>

          {/* Righe progetto (con marker "oggi" continuo su tutta l'altezza) */}
          <div className="relative">
          {todayInRange && (
            <div className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 z-[15] pointer-events-none" style={{ left: NAME_W + todayX, background: 'color-mix(in srgb, var(--color-gold) 75%, transparent)' }} />
          )}
          {projects.map(p => {
            const b = byProject.get(p.id)!
            const accent = p.project_kind === 'digital' ? 'var(--color-info)' : 'var(--color-gold-text)'
            const range = rangeOf(b)
            const isOpen = !!open[p.id]
            const items = grana === 'sprint' ? b.sprints : grana === 'milestone' ? b.milestones : b.tasks
            return (
              <div key={p.id} className="border-b border-border last:border-0">
                {/* riga progetto */}
                <div className="flex items-stretch hover:bg-surface-hover transition-colors">
                  <div className="shrink-0 sticky left-0 z-10 bg-surface flex items-center gap-1.5 px-2 border-r border-border" style={{ width: NAME_W, height: ROW_H }}>
                    <button onClick={() => setOpen(o => ({ ...o, [p.id]: !o[p.id] }))} aria-label={isOpen ? 'Comprimi' : 'Espandi'}
                      className="shrink-0 text-text-tertiary hover:text-text-primary" disabled={items.length === 0}>
                      {items.length === 0 ? <span className="inline-block w-3.5" /> : isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => setDetail({ kind: 'project', id: p.id, title: p.name, projectId: p.id, clientId: p.client_id, start: range?.[0], end: range?.[1] })}
                      className="text-2xs font-semibold text-text-primary truncate hover:text-gold-text text-left" title={p.name}>{p.name}</button>
                    {items.length > 0 && <span className="ml-auto text-2xs text-text-tertiary shrink-0">{items.length}</span>}
                  </div>
                  <div className="relative" style={{ width: gridW, height: ROW_H }}>
                    {range && <Bar start={range[0]} end={range[1]} accent={accent} dim
                      onClick={() => setDetail({ kind: 'project', id: p.id, title: p.name, projectId: p.id, clientId: p.client_id, start: range[0], end: range[1] })} />}
                  </div>
                </div>

                {/* righe elementi */}
                {isOpen && items.map(it => (
                  <div key={it.id} className="flex items-stretch bg-background/40">
                    <div className="shrink-0 sticky left-0 z-10 bg-background flex items-center pl-8 pr-2 border-r border-border" style={{ width: NAME_W, height: ROW_H }}>
                      <span className="text-2xs text-text-secondary truncate" title={'name' in it ? (it as WLSprint).name : (it as WLTask).title}>
                        {'name' in it ? (it as WLSprint).name : (it as WLTask).title}
                      </span>
                    </div>
                    <div className="relative" style={{ width: gridW, height: ROW_H }}>
                      {grana === 'sprint' && <Bar start={(it as WLSprint).start_date} end={(it as WLSprint).end_date} accent={accent} label={(it as WLSprint).name}
                        onClick={() => setDetail({ kind: 'sprint', id: it.id, title: (it as WLSprint).name, projectId: p.id, clientId: p.client_id, start: (it as WLSprint).start_date, end: (it as WLSprint).end_date })} />}
                      {grana === 'milestone' && (it as WLTask).due_date && <Diamond date={(it as WLTask).due_date!} label={(it as WLTask).title}
                        onClick={() => setDetail({ kind: 'milestone', id: it.id, title: (it as WLTask).title, projectId: p.id, clientId: p.client_id, start: (it as WLTask).due_date!, end: (it as WLTask).due_date! })} />}
                      {grana === 'task' && <Bar start={(it as WLTask).start_date || (it as WLTask).due_date!} end={(it as WLTask).due_date || (it as WLTask).start_date!} accent={accent} label={(it as WLTask).title}
                        onClick={() => setDetail({ kind: 'task', id: it.id, title: (it as WLTask).title, projectId: p.id, clientId: p.client_id, start: (it as WLTask).start_date || (it as WLTask).due_date || undefined, end: (it as WLTask).due_date || (it as WLTask).start_date || undefined })} />}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
          </div>
        </div>
      </div>

      {/* Popup: dettaglio + link alla sezione dedicata (progetto, o elemento evidenziato) */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-scrim/60 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-surface border border-border rounded-2xl w-full max-w-xs p-4 space-y-2 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-2xs font-bold uppercase tracking-wider text-gold-text">{TYPE_LABEL[detail.kind]}</p>
                <h4 className="text-sm font-bold text-text-primary break-words">{detail.title}</h4>
              </div>
              <button onClick={() => setDetail(null)} aria-label="Chiudi" className="shrink-0 p-1 text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
            </div>
            {detail.start && detail.end && (
              <p className="text-2xs text-text-tertiary">
                {detail.start === detail.end ? fmtDay(parse(detail.start)) : `${fmtDay(parse(detail.start))} → ${fmtDay(parse(detail.end))}`}
              </p>
            )}
            <Link
              href={detail.kind === 'project' ? projectHref(detail.clientId, detail.projectId) : `${projectHref(detail.clientId, detail.projectId)}?focus=${detail.id}&kind=${detail.kind}`}
              className="mt-1 flex items-center justify-center gap-1.5 w-full py-2 bg-gold text-on-gold rounded-lg text-xs font-bold hover:bg-gold/90 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> {detail.kind === 'project' ? 'Apri il progetto' : 'Apri nel progetto'}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
