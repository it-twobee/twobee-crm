'use client'

import { useMemo, useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Flag, Calendar as CalIcon, User, CheckSquare, FolderTree } from 'lucide-react'
import type { ProjectWorkstream, Milestone, Task } from '@/lib/types/database'

type Person = { id: string; full_name: string; avatar_url: string | null }

const MS_LABEL: Record<string, string> = { da_fare: 'Da fare', in_corso: 'In corso', in_approvazione: 'In approvazione', completata: 'Completata' }

const ZOOMS = { giorni: 44, settimane: 20, mesi: 9 } as const
type Zoom = keyof typeof ZOOMS
const MS = 86400000
const LABEL_W = 160 // colonna sinistra nomi workstream
const LANE_H = 56   // altezza corsia (più respiro)

function parse(d: string) { return new Date(d + 'T00:00:00').getTime() }
function addDays(t: number, n: number) { return t + n * MS }
const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

export function ProjectGantt({
  workstreams, milestones, tasks, profiles, onOpenMilestone,
}: {
  workstreams: ProjectWorkstream[]
  milestones: Milestone[]
  tasks?: Task[]
  profiles?: Person[]
  onOpenMilestone?: (workstreamId: string, milestoneId: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<Zoom>('giorni')
  const [hover, setHover] = useState<{ m: Milestone; wsName: string; rect: DOMRect } | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const DAY_W = ZOOMS[zoom]
  const showDays = zoom === 'giorni'
  const person = (id: string | null) => (id ? profiles?.find(p => p.id === id) ?? null : null)

  const lanes = useMemo(() =>
    workstreams
      .map(w => ({ ws: w, ms: milestones.filter(m => m.workstream_id === w.id && m.due_date) }))
      .filter(l => l.ms.length > 0),
    [workstreams, milestones])

  const model = useMemo(() => {
    const dates: number[] = []
    milestones.forEach(m => { if (m.due_date) dates.push(parse(m.due_date)) })
    workstreams.forEach(w => { if (w.start_date) dates.push(parse(w.start_date)); if (w.end_date) dates.push(parse(w.end_date)) })
    const todayT = parse(new Date().toISOString().slice(0, 10))
    dates.push(todayT)
    if (lanes.length === 0) return null
    const min = addDays(Math.min(...dates), -5)
    const max = addDays(Math.max(...dates), 5)
    const totalDays = Math.round((max - min) / MS) + 1
    const x = (t: number) => Math.round((t - min) / MS) * DAY_W
    const days = Array.from({ length: totalDays }, (_, i) => new Date(min + i * MS))
    const monthSegs: { left: number; width: number; label: string }[] = []
    days.forEach((d, i) => {
      const last = monthSegs[monthSegs.length - 1]
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
      if (last && last.label === label) last.width += DAY_W
      else monthSegs.push({ left: i * DAY_W, width: DAY_W, label })
    })
    return { min, max, totalDays, width: totalDays * DAY_W, x, days, monthSegs, todayLeft: x(todayT) }
  }, [workstreams, milestones, lanes, DAY_W])

  useEffect(() => {
    if (model && scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, model.todayLeft - 260)
  }, [model])

  if (!model) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6 text-center shadow-soft">
        <p className="text-2xs text-text-tertiary">Nessuna milestone datata: aggiungi una scadenza a una milestone per vederla sul calendario.</p>
      </div>
    )
  }

  const todayIso = new Date().toISOString().slice(0, 10)
  const msTone = (m: Milestone) => {
    if (m.status === 'completata') return { pill: 'bg-success-dim border-success/40', flag: 'text-success' }
    if (m.milestone_type === 'system') return { pill: 'bg-surface-active border-border-strong', flag: 'text-text-tertiary' }
    if (m.due_date && m.due_date < todayIso) return { pill: 'bg-error-dim border-error/40', flag: 'text-error' }
    if (m.due_date && m.due_date <= addIso(3)) return { pill: 'bg-orange-dim border-orange/40', flag: 'text-orange' }
    return { pill: 'bg-info-dim border-info/40', flag: 'text-info' }
  }

  // recap milestone in hover
  const hm = hover?.m
  const hmTone = hm ? msTone(hm) : null
  const hmOwner = hm ? person(hm.owner_id) : null
  const hmTasks = hm ? (tasks ?? []).filter(t => t.milestone_id === hm.id && !t.parent_task_id) : []
  const hmDone = hmTasks.filter(t => t.status === 'completato').length
  const hmRel = hm?.due_date ? relDaysLabel(hm.due_date, todayIso) : null

  return (
    <div className="relative bg-surface border border-border rounded-2xl shadow-soft overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-wrap">
        <span className="text-sm font-bold text-text-primary">Calendario milestone</span>
        <span className="text-2xs text-text-tertiary">· {lanes.reduce((n, l) => n + l.ms.length, 0)}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { if (scrollRef.current) scrollRef.current.scrollTo({ left: Math.max(0, model.todayLeft - 260), behavior: 'smooth' }) }}
            className="text-2xs font-semibold text-gold-text hover:opacity-80 press">Oggi</button>
          <div className="flex bg-surface-active rounded-lg p-0.5">
            {(Object.keys(ZOOMS) as Zoom[]).map(z => (
              <button key={z} onClick={() => setZoom(z)} aria-pressed={zoom === z}
                className={`px-2.5 py-1 rounded-md text-2xs font-semibold capitalize ${zoom === z ? 'bg-surface text-text-primary shadow-soft' : 'text-text-secondary hover:text-text-primary'}`}>{z}</button>
            ))}
          </div>
        </div>
      </div>

      {/* recap in hover — portale su body, ancorato al marker, non tagliato dallo scroll */}
      {mounted && hm && hmTone && hover && createPortal(
        (() => {
          const r = hover.rect
          const above = r.top > 150
          const top = above ? r.top - 8 : r.bottom + 8
          return (
            <div style={{ position: 'fixed', left: r.left + r.width / 2, top, transform: `translate(-50%, ${above ? '-100%' : '0'})`, zIndex: 60 }}
              className="w-64 pointer-events-none">
              <div className="bg-surface border border-border-strong rounded-xl shadow-pop p-3 animate-fade-in">
                <div className="flex items-start gap-2">
                  <Flag className={`w-4 h-4 mt-0.5 shrink-0 ${hmTone.flag}`} />
                  <span className="text-sm font-bold text-text-primary leading-snug">{hm.title}</span>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-2xs text-text-secondary">
                    <FolderTree className="w-3.5 h-3.5 text-gold-text shrink-0" /><span className="truncate">{hover.wsName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-2xs text-text-secondary">
                    <CalIcon className="w-3.5 h-3.5 text-text-tertiary shrink-0" /><span className="tabular">{hm.due_date}</span>
                    {hmRel && <span className={hmRel.tone}>· {hmRel.text}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-2xs text-text-secondary">
                    <User className="w-3.5 h-3.5 text-text-tertiary shrink-0" /><span className="truncate">{hmOwner ? hmOwner.full_name : 'Non assegnata'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-2xs text-text-secondary">
                    <CheckSquare className="w-3.5 h-3.5 text-text-tertiary shrink-0" /><span className="tabular">{hmDone}/{hmTasks.length} task</span>
                    <span className={`ml-auto text-2xs font-semibold px-2 py-0.5 rounded-full border ${hmTone.pill} ${hmTone.flag}`}>{MS_LABEL[hm.status]}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })(),
        document.body,
      )}

      <div className="flex">
        {/* colonna nomi sticky */}
        <div className="shrink-0 border-r border-border bg-surface z-10" style={{ width: LABEL_W }}>
          <div className="h-7 border-b border-border/60" />
          {showDays && <div className="h-8 border-b border-border" />}
          {lanes.map(l => (
            <div key={l.ws.id} className="border-b border-border/40 flex items-center px-3" style={{ height: LANE_H }}>
              <FolderTree className="w-3.5 h-3.5 text-gold-text shrink-0 mr-1.5" />
              <span className="text-xs font-semibold text-text-primary truncate">{l.ws.name}</span>
            </div>
          ))}
        </div>

        {/* griglia scrollabile */}
        <div ref={scrollRef} className="scroll-x-touch flex-1">
          <div className="relative select-none" style={{ width: model.width, minWidth: '100%' }}>
            {/* header mesi */}
            <div className="relative h-7 border-b border-border/60">
              {model.monthSegs.map((s, i) => (
                <div key={i} className="absolute top-0 bottom-0 flex items-center border-l border-border/40 pl-2" style={{ left: s.left, width: s.width }}>
                  <span className="text-xs font-semibold text-text-secondary whitespace-nowrap capitalize">{s.label}</span>
                </div>
              ))}
            </div>
            {/* header giorni */}
            {showDays && (
              <div className="relative h-8 border-b border-border">
                {model.days.map((d, i) => {
                  const iso = d.toISOString().slice(0, 10)
                  const weekend = d.getDay() === 0 || d.getDay() === 6
                  const isToday = iso === todayIso
                  return (
                    <div key={i} className={`absolute top-0 bottom-0 flex flex-col items-center justify-center border-l ${weekend ? 'bg-overlay/[0.03]' : ''} border-border/30`} style={{ left: i * DAY_W, width: DAY_W }}>
                      <span className={`text-2xs tabular ${isToday ? 'text-gold-text font-bold' : weekend ? 'text-text-tertiary/60' : 'text-text-secondary'}`}>{d.getDate()}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* marker oggi verticale */}
            <div className="absolute bottom-0 w-0.5 bg-gold z-20 pointer-events-none" style={{ left: model.todayLeft + DAY_W / 2, top: showDays ? 60 : 28 }}>
              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gold" />
            </div>

            {/* corsie */}
            {lanes.map(l => {
              const w = l.ws
              const hasBar = w.workstream_type === 'project' && w.start_date
              const bs = hasBar ? model.x(parse(w.start_date!)) : 0
              const be = hasBar ? (w.end_date ? model.x(parse(w.end_date)) : bs + DAY_W) : 0
              return (
                <div key={w.id} className="relative border-b border-border/40" style={{ height: LANE_H }}>
                  {hasBar && (
                    <div className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full bg-gold-dim border border-gold/30" style={{ left: bs + DAY_W / 2, width: Math.max(DAY_W, be - bs) }} />
                  )}
                  {l.ms.map(m => {
                    const tone = msTone(m)
                    const owner = person(m.owner_id)
                    return (
                      <button key={m.id}
                        onClick={() => onOpenMilestone?.(w.id, m.id)}
                        onMouseEnter={e => setHover({ m, wsName: w.name, rect: e.currentTarget.getBoundingClientRect() })}
                        onMouseLeave={() => setHover(h => (h?.m.id === m.id ? null : h))}
                        aria-label={`Milestone ${m.title}`}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10" style={{ left: model.x(parse(m.due_date!)) + DAY_W / 2 }}>
                        <span className={`relative w-7 h-7 rounded-full border flex items-center justify-center transition-transform hover:scale-110 ${tone.pill}`}>
                          <Flag className={`w-3.5 h-3.5 ${tone.flag}`} />
                          {owner && (
                            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-gold border-2 border-surface overflow-hidden" aria-label={`Responsabile: ${owner.full_name}`}>
                              {owner.avatar_url && <img src={owner.avatar_url} className="w-full h-full object-cover" alt="" />}
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function addIso(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

function relDaysLabel(iso: string, today: string) {
  const d = Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
  if (d < 0) return { text: `scaduta ${-d}g fa`, tone: 'text-error' }
  if (d === 0) return { text: 'oggi', tone: 'text-warning' }
  if (d <= 7) return { text: `tra ${d}g`, tone: 'text-warning' }
  return { text: `tra ${d}g`, tone: 'text-text-tertiary' }
}
