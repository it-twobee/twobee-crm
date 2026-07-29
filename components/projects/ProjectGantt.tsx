'use client'

import { useMemo, useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Flag, Calendar as CalIcon, User, CheckSquare, FolderTree,
  ChevronRight, CheckCircle2, Repeat, ShieldCheck, CircleDot, AlertTriangle,
} from 'lucide-react'
import type { ProjectWorkstream, Milestone, Task } from '@/lib/types/database'

type Person = { id: string; full_name: string; avatar_url: string | null }
type GanttTask = Pick<Task, 'id' | 'milestone_id' | 'status' | 'parent_task_id'>

/** Corsia generica: una workstream nel dettaglio progetto, un progetto nella vista globale. */
export type GanttLane = {
  id: string
  name: string
  subtitle?: string | null
  /** classe bg del pallino d'accento */
  accent?: string
  /** barra di durata (solo workstream a termine) */
  bar?: { start: string; end: string | null } | null
  milestones: Milestone[]
  /** 0 = riga di raggruppamento (cliente), 1 = figlia (progetto) */
  depth?: number
  /** riga richiudibile: mostra il chevron nella colonna nomi */
  toggle?: { expanded: boolean; onToggle: () => void }
  /** chip a destra del nome, es. «fermo da 24g»: `title`/`detail` lo spiegano in hover */
  badge?: { text: string; tone: string; title: string; detail?: string }
  /** testo al posto di «nessuna milestone datata»; stringa vuota = niente */
  emptyLabel?: string
}

/** L'icona dice che tipo di milestone è e a che punto sta, senza aprire il recap. */
function milestoneIcon(m: Milestone, todayIso: string) {
  if (m.status === 'completata') return CheckCircle2
  if (m.milestone_type === 'system') return Repeat
  if (m.status === 'in_approvazione') return ShieldCheck
  if (m.status === 'in_corso') return CircleDot
  if (m.due_date && m.due_date < todayIso) return AlertTriangle
  return Flag
}

const LEGEND = [
  { Icon: Flag, label: 'Da fare' },
  { Icon: CircleDot, label: 'In corso' },
  { Icon: ShieldCheck, label: 'In approvazione' },
  { Icon: CheckCircle2, label: 'Completata' },
  { Icon: AlertTriangle, label: 'Scaduta' },
  { Icon: Repeat, label: 'Operatività continua' },
]

const MS_LABEL: Record<string, string> = { da_fare: 'Da fare', in_corso: 'In corso', in_approvazione: 'In approvazione', completata: 'Completata' }

const ZOOMS = { giorni: 44, settimane: 20, mesi: 9 } as const
type Zoom = keyof typeof ZOOMS
const MS = 86400000
const LABEL_W = 160 // colonna sinistra nomi workstream
const LANE_H = 56   // altezza corsia (più respiro)

function parse(d: string) { return new Date(d + 'T00:00:00').getTime() }
function addDays(t: number, n: number) { return t + n * MS }
const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

export function ProjectGantt({
  workstreams = [], milestones = [], tasks, profiles, onOpenMilestone,
  title = 'Calendario milestone', laneSubtitle, laneAccent, labelWidth = LABEL_W,
  lanes: externalLanes, laneLabel = 'workstream', milestoneContext, emptyHint, headerNote, headerHint,
}: {
  workstreams?: ProjectWorkstream[]
  milestones?: Milestone[]
  tasks?: GanttTask[]
  profiles?: Person[]
  onOpenMilestone?: (workstreamId: string, milestoneId: string) => void
  title?: string
  /** riga secondaria nella colonna nomi (es. "Progetto · Cliente") */
  laneSubtitle?: (ws: ProjectWorkstream) => string | null
  /** classe bg per il pallino d'accento (raggruppa visivamente per progetto) */
  laneAccent?: (ws: ProjectWorkstream) => string | undefined
  labelWidth?: number
  /** corsie pronte: bypassa la derivazione da workstreams (vista per progetto) */
  lanes?: GanttLane[]
  /** nome plurale della corsia, per il contatore in intestazione */
  laneLabel?: string
  /** testo della riga di contesto nel recap (default: nome corsia) */
  milestoneContext?: (m: Milestone) => string | null
  emptyHint?: string
  /** sostituisce il contatore in intestazione (es. «6 clienti · 2 fermi») */
  headerNote?: React.ReactNode
  /** spiegazione in hover del contatore in intestazione */
  headerHint?: { title: string; detail?: string }
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<Zoom>('giorni')
  const [hover, setHover] = useState<{ m: Milestone; ctx: string; rect: DOMRect } | null>(null)
  const [hint, setHint] = useState<{ title: string; detail?: string; rect: DOMRect } | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const DAY_W = ZOOMS[zoom]
  const showDays = zoom === 'giorni'
  const person = (id: string | null) => (id ? profiles?.find(p => p.id === id) ?? null : null)

  const lanes: GanttLane[] = useMemo(() => {
    if (externalLanes) return externalLanes
    return workstreams
      .map(w => ({
        id: w.id, name: w.name, subtitle: laneSubtitle?.(w) ?? null, accent: laneAccent?.(w),
        bar: w.workstream_type === 'project' && w.start_date ? { start: w.start_date, end: w.end_date } : null,
        milestones: milestones.filter(m => m.workstream_id === w.id && m.due_date),
      }))
      .filter(l => l.milestones.length > 0)
  }, [externalLanes, workstreams, milestones, laneSubtitle, laneAccent])

  const model = useMemo(() => {
    const dates: number[] = []
    lanes.forEach(l => {
      l.milestones.forEach(m => { if (m.due_date) dates.push(parse(m.due_date)) })
      if (l.bar?.start) dates.push(parse(l.bar.start))
      if (l.bar?.end) dates.push(parse(l.bar.end))
    })
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
  }, [lanes, DAY_W])

  useEffect(() => {
    if (model && scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, model.todayLeft - 260)
  }, [model])

  if (!model) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6 text-center shadow-soft">
        <p className="text-2xs text-text-tertiary">{emptyHint ?? 'Nessuna milestone datata: aggiungi una scadenza a una milestone per vederla sul calendario.'}</p>
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
        <span className="text-sm font-bold text-text-primary">{title}</span>
        {headerNote && headerHint ? (
          <button type="button"
            onMouseEnter={e => setHint({ ...headerHint, rect: e.currentTarget.getBoundingClientRect() })}
            onMouseLeave={() => setHint(null)}
            onFocus={e => setHint({ ...headerHint, rect: e.currentTarget.getBoundingClientRect() })}
            onBlur={() => setHint(null)}
            className="text-2xs text-text-tertiary cursor-help text-left">{headerNote}</button>
        ) : (
          <span className="text-2xs text-text-tertiary">
            {headerNote ?? <>· {lanes.reduce((n, l) => n + l.milestones.length, 0)} milestone · {lanes.length} {laneLabel}</>}
          </span>
        )}
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

      {/* spiegazione del chip d'avviso: da solo il badge non dice cosa sta misurando */}
      {mounted && hint && createPortal(
        (() => {
          const r = hint.rect
          const above = r.top > 120
          const half = 112
          const left = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8)
          return (
            <div style={{ position: 'fixed', left, top: above ? r.top - 8 : r.bottom + 8, transform: `translate(-50%, ${above ? '-100%' : '0'})`, zIndex: 60 }}
              className="w-56 pointer-events-none">
              <div className="bg-surface border border-border-strong rounded-xl shadow-pop px-3 py-2 animate-fade-in">
                <p className="text-2xs font-bold text-text-primary leading-snug">{hint.title}</p>
                {hint.detail && <p className="text-2xs text-text-secondary leading-snug mt-0.5">{hint.detail}</p>}
              </div>
            </div>
          )
        })(),
        document.body,
      )}

      {/* recap in hover — portale su body, ancorato al marker, non tagliato dallo scroll */}
      {mounted && hm && hmTone && hover && createPortal(
        (() => {
          const r = hover.rect
          const above = r.top > 150
          const top = above ? r.top - 8 : r.bottom + 8
          const HIcon = milestoneIcon(hm, todayIso)
          return (
            <div style={{ position: 'fixed', left: r.left + r.width / 2, top, transform: `translate(-50%, ${above ? '-100%' : '0'})`, zIndex: 60 }}
              className="w-64 pointer-events-none">
              <div className="bg-surface border border-border-strong rounded-xl shadow-pop p-3 animate-fade-in">
                <div className="flex items-start gap-2">
                  <HIcon className={`w-4 h-4 mt-0.5 shrink-0 ${hmTone.flag}`} />
                  <span className="text-sm font-bold text-text-primary leading-snug">{hm.title}</span>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-2xs text-text-secondary">
                    <FolderTree className="w-3.5 h-3.5 text-gold-text shrink-0" /><span className="truncate">{hover.ctx}</span>
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
        <div className="shrink-0 border-r border-border bg-surface z-10" style={{ width: labelWidth }}>
          <div className="h-7 border-b border-border/60" />
          {showDays && <div className="h-10 border-b border-border" />}
          {lanes.map(l => (
            <div key={l.id} className="border-b border-border/40 flex items-center gap-2 pr-2"
              style={{ height: LANE_H, paddingLeft: 12 + (l.depth ?? 0) * 16 }}>
              {l.toggle && (
                <button onClick={l.toggle.onToggle} aria-expanded={l.toggle.expanded}
                  aria-label={`${l.toggle.expanded ? 'Chiudi' : 'Apri'} ${l.name}`}
                  className="shrink-0 text-text-tertiary hover:text-text-primary press">
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${l.toggle.expanded ? 'rotate-90' : ''}`} />
                </button>
              )}
              {l.accent ? <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${l.accent}`} aria-hidden />
                        : <FolderTree className="w-3.5 h-3.5 text-gold-text shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className={`truncate leading-tight ${l.depth ? 'text-xs text-text-secondary' : 'text-xs font-semibold text-text-primary'}`}>{l.name}</div>
                {l.subtitle && <div className="text-2xs text-text-tertiary truncate leading-tight">{l.subtitle}</div>}
              </div>
              {l.badge && (
                <button type="button"
                  onMouseEnter={e => setHint({ title: l.badge!.title, detail: l.badge!.detail, rect: e.currentTarget.getBoundingClientRect() })}
                  onMouseLeave={() => setHint(null)}
                  onFocus={e => setHint({ title: l.badge!.title, detail: l.badge!.detail, rect: e.currentTarget.getBoundingClientRect() })}
                  onBlur={() => setHint(null)}
                  aria-label={`${l.badge.text}: ${l.badge.title}${l.badge.detail ? `. ${l.badge.detail}` : ''}`}
                  className={`shrink-0 text-2xs font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap cursor-help ${l.badge.tone}`}>
                  {l.badge.text}
                </button>
              )}
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
            {/* header giorni: giorno della settimana + numero */}
            {showDays && (
              <div className="relative h-10 border-b border-border">
                {model.days.map((d, i) => {
                  const iso = d.toISOString().slice(0, 10)
                  const weekend = d.getDay() === 0 || d.getDay() === 6
                  const isToday = iso === todayIso
                  return (
                    <div key={i} className={`absolute top-0 bottom-0 flex flex-col items-center justify-center gap-0.5 border-l ${weekend ? 'bg-overlay/[0.03]' : ''} border-border/30`} style={{ left: i * DAY_W, width: DAY_W }}>
                      <span className={`text-2xs leading-none ${isToday ? 'text-gold-text font-bold' : 'text-text-tertiary/70'}`}>{WEEKDAY_SHORT[d.getDay()]}</span>
                      <span className={`text-2xs tabular leading-none ${isToday ? 'text-gold-text font-bold' : weekend ? 'text-text-tertiary/60' : 'text-text-secondary'}`}>{d.getDate()}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* marker oggi verticale */}
            <div className="absolute bottom-0 w-0.5 bg-gold z-20 pointer-events-none" style={{ left: model.todayLeft + DAY_W / 2, top: showDays ? 68 : 28 }}>
              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gold" />
            </div>

            {/* corsie */}
            {lanes.map(l => {
              const bs = l.bar ? model.x(parse(l.bar.start)) : 0
              const be = l.bar ? (l.bar.end ? model.x(parse(l.bar.end)) : bs + DAY_W) : 0
              // sulla riga cliente convergono le milestone di più progetti: quelle
              // dello stesso giorno si sfalsano, altrimenti una copre l'altra
              const sameDay = new Map<string, number>()
              return (
                <div key={l.id} className="relative border-b border-border/40" style={{ height: LANE_H }}>
                  {l.bar && (
                    <div className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full bg-gold-dim border border-gold/30" style={{ left: bs + DAY_W / 2, width: Math.max(DAY_W, be - bs) }} />
                  )}
                  {l.milestones.length === 0 && l.emptyLabel !== '' && (
                    <span className="absolute top-1/2 -translate-y-1/2 text-2xs text-text-tertiary/70 whitespace-nowrap pointer-events-none"
                      style={{ left: model.todayLeft + DAY_W / 2 + 14 }}>{l.emptyLabel ?? 'nessuna milestone datata'}</span>
                  )}
                  {l.milestones.map(m => {
                    const tone = msTone(m)
                    const owner = person(m.owner_id)
                    const MIcon = milestoneIcon(m, todayIso)
                    const stacked = sameDay.get(m.due_date!) ?? 0
                    sameDay.set(m.due_date!, stacked + 1)
                    return (
                      <button key={m.id}
                        onClick={() => onOpenMilestone?.(m.workstream_id, m.id)}
                        onMouseEnter={e => setHover({ m, ctx: milestoneContext?.(m) ?? l.name, rect: e.currentTarget.getBoundingClientRect() })}
                        onMouseLeave={() => setHover(h => (h?.m.id === m.id ? null : h))}
                        aria-label={`Milestone ${m.title}`}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                        style={{ left: model.x(parse(m.due_date!)) + DAY_W / 2 + stacked * 12 }}>
                        <span className={`relative w-7 h-7 rounded-full border flex items-center justify-center transition-transform hover:scale-110 ${tone.pill}`}>
                          <MIcon className={`w-3.5 h-3.5 ${tone.flag}`} />
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

      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap px-4 py-2 border-t border-border">
        {LEGEND.map(({ Icon, label }) => (
          <span key={label} className="flex items-center gap-1 text-2xs text-text-tertiary">
            <Icon className="w-3 h-3" aria-hidden />{label}
          </span>
        ))}
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
