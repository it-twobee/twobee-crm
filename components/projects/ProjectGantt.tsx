'use client'

import { useMemo, useRef, useEffect } from 'react'
import { Flag, FolderTree } from 'lucide-react'
import type { ProjectWorkstream, Milestone } from '@/lib/types/database'

const DAY_W = 22 // px per giorno
const MS = 86400000

function parse(d: string) { return new Date(d + 'T00:00:00').getTime() }
function addDays(t: number, n: number) { return t + n * MS }
function iso(t: number) { return new Date(t).toISOString().slice(0, 10) }

const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

export function ProjectGantt({
  workstreams, milestones, onOpenWorkstream,
}: {
  workstreams: ProjectWorkstream[]
  milestones: Milestone[]
  onOpenWorkstream?: (id: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const model = useMemo(() => {
    const dates: number[] = []
    milestones.forEach(m => { if (m.due_date) dates.push(parse(m.due_date)) })
    workstreams.forEach(w => {
      if (w.start_date) dates.push(parse(w.start_date))
      if (w.end_date) dates.push(parse(w.end_date))
    })
    const todayT = parse(new Date().toISOString().slice(0, 10))
    dates.push(todayT)
    if (dates.length === 0) return null
    // range con padding di 7 giorni ai lati
    const min = addDays(Math.min(...dates), -7)
    const max = addDays(Math.max(...dates), 7)
    const totalDays = Math.round((max - min) / MS) + 1
    const x = (t: number) => Math.round((t - min) / MS) * DAY_W
    return { min, max, totalDays, width: totalDays * DAY_W, x, todayLeft: x(todayT) }
  }, [workstreams, milestones])

  // barre workstream a termine
  const bars = useMemo(() => {
    if (!model) return []
    return workstreams
      .filter(w => w.workstream_type === 'project' && w.start_date)
      .map(w => {
        const s = parse(w.start_date!)
        const e = w.end_date ? parse(w.end_date) : addDays(s, 7)
        return { id: w.id, name: w.name, left: model.x(s), width: Math.max(DAY_W, model.x(e) - model.x(s) + DAY_W) }
      })
  }, [workstreams, model])

  const flags = useMemo(() => {
    if (!model) return []
    return milestones.filter(m => m.due_date).map(m => ({
      id: m.id, title: m.title, left: model.x(parse(m.due_date!)),
      done: m.status === 'completata', system: m.milestone_type === 'system',
    }))
  }, [milestones, model])

  // centra su oggi al mount
  useEffect(() => {
    if (model && scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(0, model.todayLeft - 200)
    }
  }, [model])

  if (!model) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6 text-center shadow-soft">
        <p className="text-2xs text-text-tertiary">Nessuna data pianificata: aggiungi scadenze alle milestone o date alle workstream per vedere il Gantt.</p>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <span className="text-sm font-bold text-text-primary">Timeline progetto</span>
        <span className="text-2xs text-text-tertiary">· {flags.length} milestone</span>
        <span className="ml-auto flex items-center gap-1 text-2xs text-text-tertiary">
          <span className="inline-block w-2.5 h-0.5 bg-gold" /> oggi
        </span>
      </div>

      <div ref={scrollRef} className="scroll-x-touch">
        <div className="relative" style={{ width: model.width, minWidth: '100%' }}>
          {/* header mesi */}
          <div className="relative h-7 border-b border-border">
            <MonthTicks model={model} />
          </div>

          {/* marker oggi (verticale, attraversa tutto) */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-gold z-20 pointer-events-none" style={{ left: model.todayLeft }}>
            <span className="absolute -top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gold" />
          </div>

          {/* riga milestone */}
          <div className="relative h-10 border-b border-border">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-2xs font-semibold text-text-tertiary uppercase tracking-wide z-10 bg-surface pr-2">Milestone</span>
            {flags.map(f => (
              <div key={f.id} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group" style={{ left: f.left }}>
                <Flag className={`w-3.5 h-3.5 ${f.done ? 'text-success' : f.system ? 'text-text-tertiary' : 'text-info'}`} />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap bg-surface border border-border-strong rounded-lg px-2 py-1 text-2xs text-text-primary shadow-pop z-30">
                  {f.title}
                </div>
              </div>
            ))}
          </div>

          {/* barre workstream a termine */}
          <div className="py-2 space-y-1.5">
            {bars.length === 0 && (
              <div className="px-2 py-3 text-2xs text-text-tertiary">Nessuna workstream a termine con date.</div>
            )}
            {bars.map(b => (
              <div key={b.id} className="relative h-7">
                <button
                  onClick={() => onOpenWorkstream?.(b.id)}
                  className="absolute top-0 h-7 rounded-lg bg-gold-dim border border-gold/30 flex items-center px-2 gap-1.5 hover:bg-gold/20 transition-colors overflow-hidden"
                  style={{ left: b.left, width: b.width }}>
                  <FolderTree className="w-3 h-3 text-gold-text shrink-0" />
                  <span className="text-2xs font-semibold text-gold-text truncate">{b.name}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MonthTicks({ model }: { model: { min: number; max: number; x: (t: number) => number } }) {
  const ticks: { left: number; label: string }[] = []
  const d = new Date(model.min)
  d.setDate(1)
  while (d.getTime() <= model.max) {
    ticks.push({ left: model.x(d.getTime()), label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` })
    d.setMonth(d.getMonth() + 1)
  }
  return (
    <>
      {ticks.map((t, i) => (
        <div key={i} className="absolute top-0 bottom-0 border-l border-border/60 pl-1.5 flex items-center" style={{ left: t.left }}>
          <span className="text-2xs text-text-tertiary whitespace-nowrap">{t.label}</span>
        </div>
      ))}
    </>
  )
}
