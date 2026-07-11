'use client'

import { useMemo, useState } from 'react'
import { Flag, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import type { TaskWithMeta } from './BachecaView'

type Grain = 'giorno' | 'mese'

const DAY_MS = 86_400_000
const DOW = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB']

/** Larghezza di una colonna in px. Fissa: la griglia deve restare leggibile allo scroll. */
const COL_W: Record<Grain, number> = { giorno: 44, mese: 120 }
/** Quante colonne stanno nella finestra. */
const SPAN: Record<Grain, number> = { giorno: 21, mese: 8 }

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6

export function TimelineView({ tasks, onSelect }: { tasks: TaskWithMeta[]; onSelect?: (t: TaskWithMeta) => void }) {
  const [grain, setGrain] = useState<Grain>('giorno')
  const [offset, setOffset] = useState(0)

  const today = midnight(new Date())

  // Finestra visibile: N colonne a partire da `start`.
  const { start, cols } = useMemo(() => {
    if (grain === 'giorno') {
      const s = addDays(today, offset * 7 - 5)
      return { start: s, cols: Array.from({ length: SPAN.giorno }, (_, i) => addDays(s, i)) }
    }
    const s = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), offset * 3 - 2)
    return { start: s, cols: Array.from({ length: SPAN.mese }, (_, i) => addMonths(s, i)) }
  }, [grain, offset, today])

  const end = grain === 'giorno' ? addDays(start, SPAN.giorno) : addMonths(start, SPAN.mese)
  const colW = COL_W[grain]
  const totalW = cols.length * colW

  /** Posizione in px del centro della colonna che contiene `date`, o null se fuori finestra. */
  const posOf = (date: Date): number | null => {
    if (date < start || date >= end) return null
    if (grain === 'giorno') {
      const idx = Math.floor((midnight(date).getTime() - start.getTime()) / DAY_MS)
      return idx * colW + colW / 2
    }
    const idx = (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth())
    // Dentro il mese, interpola sul giorno: due task dello stesso mese non si sovrappongono.
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    return idx * colW + ((date.getDate() - 1) / daysInMonth) * colW
  }

  const withDate = useMemo(
    () => tasks.filter(t => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!)),
    [tasks],
  )
  const visible = withDate.filter(t => posOf(new Date(t.due_date!)) !== null)
  const todayPos = posOf(today)

  // Intestazioni di mese sopra i giorni: raggruppano le colonne dello stesso mese.
  const monthGroups = useMemo(() => {
    if (grain !== 'giorno') return []
    const out: { label: string; span: number }[] = []
    for (const d of cols) {
      const label = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
      const last = out[out.length - 1]
      if (last && last.label === label) last.span++
      else out.push({ label, span: 1 })
    }
    return out
  }, [cols, grain])

  const label = grain === 'giorno'
    ? `${start.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} – ${addDays(start, SPAN.giorno - 1).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${start.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })} – ${addMonths(start, SPAN.mese - 1).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })}`

  return (
    <div className="h-full flex flex-col p-4 gap-3">
      {/* Controlli */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button onClick={() => setOffset(0)}
          className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs font-medium text-text-primary hover:bg-surface-hover transition-colors">
          Oggi
        </button>
        <div className="flex">
          <button onClick={() => setOffset(o => o - 1)} aria-label="Periodo precedente"
            className="p-1.5 rounded-l-lg border border-border bg-surface text-text-tertiary hover:text-text-primary transition-colors">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button onClick={() => setOffset(o => o + 1)} aria-label="Periodo successivo"
            className="p-1.5 rounded-r-lg border border-l-0 border-border bg-surface text-text-tertiary hover:text-text-primary transition-colors">
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <span className="text-sm font-semibold text-text-primary ml-1">{label}</span>

        <div className="ml-auto flex gap-1" role="group" aria-label="Granularità">
          {(['giorno', 'mese'] as const).map(g => (
            <button key={g} onClick={() => { setGrain(g); setOffset(0) }}
              aria-pressed={grain === g}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                grain === g ? 'bg-gold-dim text-gold-text' : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
              }`}>
              {g === 'giorno' ? 'Giorno' : 'Mese'}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-text-tertiary">
          <CalendarDays className="w-8 h-8 opacity-40" aria-hidden="true" />
          <p className="text-sm">
            {withDate.length === 0 ? 'Nessun task con scadenza.' : 'Nessun task in questo periodo.'}
          </p>
        </div>
      )}

      {/* La griglia scorre in orizzontale dentro il suo contenitore: la pagina no. */}
      <div className="flex-1 overflow-auto rounded-xl border border-border bg-surface">
        <div className="relative" style={{ width: totalW, minWidth: '100%' }}>

          {/* Fascia mesi (solo grana giorno) */}
          {monthGroups.length > 0 && (
            <div className="flex sticky top-0 z-20 bg-surface border-b border-border">
              {monthGroups.map((m, i) => (
                <div key={i}
                  style={{ width: m.span * colW }}
                  className="px-2 py-1.5 text-2xs font-bold uppercase tracking-wider text-text-tertiary border-r border-border last:border-r-0 truncate">
                  {m.label}
                </div>
              ))}
            </div>
          )}

          {/* Intestazione colonne */}
          <div className="flex sticky top-0 z-10 bg-surface border-b border-border"
            style={{ top: monthGroups.length > 0 ? 29 : 0 }}>
            {cols.map((d, i) => {
              const isToday = grain === 'giorno' && sameDay(d, today)
              const weekend = grain === 'giorno' && isWeekend(d)
              return (
                <div key={i}
                  style={{ width: colW }}
                  className={[
                    'shrink-0 flex flex-col items-center justify-center py-1.5 border-r border-border last:border-r-0',
                    weekend ? 'bg-surface-hover' : '',
                  ].join(' ')}>
                  {grain === 'giorno' ? (
                    <>
                      <span className="text-[10px] font-semibold uppercase text-text-tertiary leading-none">
                        {DOW[d.getDay()]}
                      </span>
                      <span className={[
                        'mt-1 w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold tabular',
                        isToday ? 'bg-gold text-on-gold' : 'text-text-primary',
                      ].join(' ')}>
                        {d.getDate()}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-semibold text-text-primary">
                      {d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' })}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Corpo: linee guida + righe task */}
          <div className="relative">
            {/* Linee guida verticali, una per colonna. Inizio settimana più marcato. */}
            <div className="absolute inset-0 flex pointer-events-none" aria-hidden="true">
              {cols.map((d, i) => {
                const weekend = grain === 'giorno' && isWeekend(d)
                const weekStart = grain === 'giorno' && d.getDay() === 1
                return (
                  <div key={i} style={{ width: colW }}
                    className={[
                      'shrink-0 border-r border-border last:border-r-0',
                      weekStart ? 'border-l border-l-border-strong' : '',
                      weekend ? 'bg-surface-hover' : '',
                    ].join(' ')} />
                )
              })}
            </div>

            {/* Linea di oggi */}
            {todayPos !== null && (
              <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: todayPos }} aria-hidden="true">
                <div className="w-0.5 h-full bg-error" />
                <div className="absolute -top-1 -left-[3px] w-2 h-2 rounded-full bg-error" />
              </div>
            )}

            <ul className="relative z-10 py-2">
              {visible.map(task => {
                const due = new Date(task.due_date!)
                const pos = posOf(due)!
                const overdue = due < today && task.status !== 'completato'
                const done = task.status === 'completato'
                const chip = done
                  ? 'bg-success-dim text-success border-success/30'
                  : overdue
                    ? 'bg-error-dim text-error border-error/30'
                    : 'bg-gold-dim text-gold-text border-gold/30'

                return (
                  <li key={task.id} className="relative h-9 flex items-center">
                    <div
                      onClick={() => onSelect?.(task)}
                      className={`absolute flex items-center gap-1 px-2 h-7 rounded-lg border text-2xs font-medium max-w-[15rem] ${chip} ${onSelect ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                      style={{ left: Math.max(2, pos - 6) }}
                      title={`${task.title}${task.project ? ` — ${task.project.name}` : ''} · ${due.toLocaleDateString('it-IT')}`}
                    >
                      {task.is_milestone && <Flag className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />}
                      <span className="truncate">{task.title}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-4 text-2xs text-text-tertiary shrink-0">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-gold-dim border border-gold/30" aria-hidden="true" /> In corso</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-error-dim border border-error/30" aria-hidden="true" /> In ritardo</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-success-dim border border-success/30" aria-hidden="true" /> Completato</span>
        <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-error" aria-hidden="true" /> Oggi</span>
      </div>
    </div>
  )
}
