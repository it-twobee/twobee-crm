'use client'

import { useMemo, useRef, useEffect } from 'react'
import { Flag } from 'lucide-react'
import type { ProjectWorkstream, Milestone } from '@/lib/types/database'

const DAY_W = 34 // px per giorno (spazio per il numero)
const MS = 86400000

function parse(d: string) { return new Date(d + 'T00:00:00').getTime() }
function addDays(t: number, n: number) { return t + n * MS }

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

export function ProjectGantt({
  workstreams, milestones, onOpenMilestone,
}: {
  workstreams: ProjectWorkstream[]
  milestones: Milestone[]
  onOpenMilestone?: (workstreamId: string, milestoneId: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const model = useMemo(() => {
    const dated = milestones.filter(m => m.due_date)
    const dates: number[] = dated.map(m => parse(m.due_date!))
    workstreams.forEach(w => { if (w.start_date) dates.push(parse(w.start_date)); if (w.end_date) dates.push(parse(w.end_date)) })
    const todayT = parse(new Date().toISOString().slice(0, 10))
    dates.push(todayT)
    if (dated.length === 0) return null
    const min = addDays(Math.min(...dates), -5)
    const max = addDays(Math.max(...dates), 5)
    const totalDays = Math.round((max - min) / MS) + 1
    const x = (t: number) => Math.round((t - min) / MS) * DAY_W
    const days = Array.from({ length: totalDays }, (_, i) => new Date(min + i * MS))
    // segmenti mese per l'header superiore
    const monthSegs: { left: number; width: number; label: string }[] = []
    days.forEach((d, i) => {
      const last = monthSegs[monthSegs.length - 1]
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
      if (last && last.label === label) last.width += DAY_W
      else monthSegs.push({ left: i * DAY_W, width: DAY_W, label })
    })
    return { min, max, totalDays, width: totalDays * DAY_W, x, days, monthSegs, todayLeft: x(todayT) }
  }, [workstreams, milestones])

  // milestone ancorate al giorno
  const flags = useMemo(() => {
    if (!model) return []
    return milestones.filter(m => m.due_date).map(m => ({
      id: m.id, workstreamId: m.workstream_id, title: m.title,
      left: model.x(parse(m.due_date!)) + DAY_W / 2,
      done: m.status === 'completata', system: m.milestone_type === 'system',
    }))
  }, [milestones, model])

  useEffect(() => {
    if (model && scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, model.todayLeft - 240)
  }, [model])

  if (!model) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6 text-center shadow-soft">
        <p className="text-2xs text-text-tertiary">Nessuna milestone datata: aggiungi una scadenza a una milestone per vederla sul calendario.</p>
      </div>
    )
  }

  const todayIso = new Date().toISOString().slice(0, 10)

  return (
    <div className="bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <span className="text-sm font-bold text-text-primary">Calendario milestone</span>
        <span className="text-2xs text-text-tertiary">· {flags.length}</span>
        <span className="ml-auto flex items-center gap-1 text-2xs text-text-tertiary">
          <span className="inline-block w-2.5 h-0.5 bg-gold" /> oggi
        </span>
      </div>

      <div ref={scrollRef} className="scroll-x-touch">
        <div className="relative select-none" style={{ width: model.width, minWidth: '100%' }}>
          {/* header mesi */}
          <div className="relative h-6 border-b border-border/60">
            {model.monthSegs.map((s, i) => (
              <div key={i} className="absolute top-0 bottom-0 flex items-center border-l border-border/40 pl-2" style={{ left: s.left, width: s.width }}>
                <span className="text-2xs font-semibold text-text-secondary whitespace-nowrap capitalize">{s.label}</span>
              </div>
            ))}
          </div>

          {/* header giorni */}
          <div className="relative h-8 border-b border-border">
            {model.days.map((d, i) => {
              const iso = d.toISOString().slice(0, 10)
              const weekend = d.getDay() === 0 || d.getDay() === 6
              const isToday = iso === todayIso
              return (
                <div key={i}
                  className={`absolute top-0 bottom-0 flex flex-col items-center justify-center border-l ${weekend ? 'bg-overlay/[0.03]' : ''} border-border/30`}
                  style={{ left: i * DAY_W, width: DAY_W }}>
                  <span className={`text-2xs tabular ${isToday ? 'text-gold-text font-bold' : weekend ? 'text-text-tertiary/60' : 'text-text-tertiary'}`}>{d.getDate()}</span>
                </div>
              )
            })}
          </div>

          {/* marker oggi verticale */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-gold z-20 pointer-events-none" style={{ left: model.todayLeft + DAY_W / 2 }}>
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gold" />
          </div>

          {/* riga milestone: flag ancorati al giorno */}
          <div className="relative py-4" style={{ minHeight: 56 }}>
            {flags.map(f => (
              <button key={f.id}
                onClick={() => onOpenMilestone?.(f.workstreamId, f.id)}
                title={f.title}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center group z-10"
                style={{ left: f.left }}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center border transition-transform group-hover:scale-110 ${
                  f.done ? 'bg-success-dim border-success/40' : f.system ? 'bg-surface-active border-border-strong' : 'bg-info-dim border-info/40'
                }`}>
                  <Flag className={`w-3 h-3 ${f.done ? 'text-success' : f.system ? 'text-text-tertiary' : 'text-info'}`} />
                </span>
                <span className="mt-1 max-w-[80px] truncate text-2xs text-text-secondary group-hover:text-text-primary">{f.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
