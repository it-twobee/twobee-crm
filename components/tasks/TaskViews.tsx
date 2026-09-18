'use client'

import { useState } from 'react'
import { ChevronRight, Clock, Repeat, X, Inbox } from 'lucide-react'
import { Avatar } from '@/components/shared/formkit'
import type { TaskRow } from './TaskList'
import type { TaskStatusV2 } from '@/lib/types/database'
import {
  COLUMNS, PRIO_DOT, PRIO_LABEL, TASK_TONE, STATUS_LABEL, dueLabel, isOverdue, today, type Person,
} from './task-ui'

/**
 * §348 — bacheca e calendario, gli stessi di prima e su un elenco solo.
 *
 * Erano dentro «Le mie attività», che era una **seconda** lista di task con le
 * sue righe, il suo dettaglio e le sue regole: la stessa task si leggeva in due
 * modi a seconda della pagina da cui ci si arrivava, e ogni correzione andava
 * fatta due volte — finché qualcuno non se ne dimenticava. Adesso le viste
 * stanno qui, sopra lo stesso modello di riga della sezione Task, e valgono per
 * tutte e due le pagine.
 */

// ── BACHECA ─────────────────────────────────────────────────────────────────
export function BoardView({ tasks, onOpen, onMove, accentOf, projLabel, personOf }: {
  tasks: TaskRow[]; onOpen: (t: TaskRow) => void; onMove: (t: TaskRow, s: TaskStatusV2) => void
  accentOf: (t: TaskRow) => string | undefined; projLabel: (t: TaskRow) => string
  personOf: (t: TaskRow) => Person | null
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  return (
    <div className="flex gap-3 scroll-x-touch pb-2 items-start">
      {COLUMNS.map(col => {
        const items = tasks.filter(t => t.status === col.key)
        const late = items.filter(isOverdue).length
        return (
          <div key={col.key}
            onDragOver={e => { e.preventDefault(); setOver(col.key) }}
            onDragLeave={() => setOver(o => (o === col.key ? null : o))}
            onDrop={() => {
              const t = tasks.find(x => x.id === dragId)
              if (t && t.status !== col.key) onMove(t, col.key)
              setDragId(null); setOver(null)
            }}
            className={`shrink-0 w-64 rounded-2xl p-2 border transition-colors ${
              over === col.key ? 'border-gold bg-gold-dim' : 'border-border bg-background'
            }`}>
            <div className="flex items-center gap-2 px-1 pb-2">
              <span className={`text-2xs font-bold ${TASK_TONE[col.key]}`}>{col.label}</span>
              <span className="text-2xs text-text-tertiary tabular">{items.length}</span>
              {late > 0 && <span className="ml-auto text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-error-dim text-error tabular">{late}</span>}
            </div>
            <div className="space-y-1.5 min-h-[56px]">
              {items.length === 0 && (
                <p className="text-2xs text-text-tertiary/70 px-1 py-3 text-center">
                  {over === col.key ? 'Rilascia qui' : 'Vuota'}
                </p>
              )}
              {items.map(t => {
                const p = personOf(t)
                const due = dueLabel(t.due_date, t.status === 'completato')
                return (
                  <div key={t.id} draggable onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setOver(null) }}
                    onClick={() => onOpen(t)}
                    className={`bg-surface border rounded-xl p-2.5 cursor-pointer hover:border-border-strong shadow-soft transition-opacity ${
                      dragId === t.id ? 'opacity-40' : ''
                    } ${isOverdue(t) ? 'border-error/40' : 'border-border'}`}>
                    <div className="flex items-start gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${PRIO_DOT[t.priority]}`} title={PRIO_LABEL[t.priority]} />
                      {t.is_recurring_instance && <Repeat className="w-3 h-3 text-success shrink-0 mt-1" />}
                      <span className="text-2xs text-text-primary leading-snug">{t.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`w-2 h-2 rounded-sm shrink-0 ${accentOf(t)}`} />
                      <span className="text-2xs text-text-tertiary truncate flex-1">{projLabel(t)}</span>
                      {due && <span className={`text-2xs tabular shrink-0 ${due.tone}`}>{due.text}</span>}
                      {p && <span title={p.full_name} className="shrink-0"><Avatar name={p.full_name} url={p.avatar_url} size={18} /></span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── CALENDARIO ──────────────────────────────────────────────────────────────
export function CalendarView({ tasks, onOpen, accentOf }: {
  tasks: TaskRow[]; onOpen: (t: TaskRow) => void; accentOf: (t: TaskRow) => string | undefined
}) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [day, setDay] = useState<string | null>(null)
  const first = new Date(cursor.y, cursor.m, 1)
  const startDow = (first.getDay() + 6) % 7
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const monthLabel = first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  const byDay: Record<string, TaskRow[]> = {}
  tasks.forEach(t => { if (t.due_date) (byDay[t.due_date] ??= []).push(t) })
  const pad = (n: number) => String(n).padStart(2, '0')
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const t = today()
  const undated = tasks.filter(x => !x.due_date)

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-border rounded-2xl p-3 shadow-soft">
        <div className="flex items-center gap-2 mb-2.5">
          <button onClick={() => setCursor(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })}
            aria-label="Mese precedente" className="text-text-secondary hover:text-text-primary press"><ChevronRight className="w-4 h-4 rotate-180" /></button>
          <span className="text-sm font-bold text-text-primary capitalize flex-1 text-center">{monthLabel}</span>
          <button onClick={() => setCursor(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })}
            aria-label="Mese successivo" className="text-text-secondary hover:text-text-primary press"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }) }}
            className="text-2xs font-semibold text-gold-text hover:opacity-80 press">Oggi</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-2xs text-text-tertiary mb-1">
          {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => <div key={d} className="text-center font-semibold">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const dateStr = `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`
            const items = byDay[dateStr] ?? []
            const isToday = dateStr === t
            const weekend = i % 7 >= 5
            const late = items.filter(isOverdue).length
            return (
              <button key={i} onClick={() => items.length && setDay(dateStr)}
                className={`min-h-[72px] border rounded-lg p-1 text-left transition-colors ${
                  isToday ? 'border-gold bg-gold-dim' : weekend ? 'border-border bg-background/50' : 'border-border bg-background'
                } ${items.length ? 'hover:bg-surface-hover cursor-pointer' : 'cursor-default'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-2xs tabular ${isToday ? 'text-gold-text font-bold' : weekend ? 'text-text-tertiary/70' : 'text-text-tertiary'}`}>{d}</span>
                  {late > 0 && <span className="w-1.5 h-1.5 rounded-full bg-error" aria-label={`${late} in ritardo`} />}
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {items.slice(0, 3).map(x => (
                    <span key={x.id} className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-sm shrink-0 ${accentOf(x)}`} />
                      <span className={`text-2xs truncate ${
                        isOverdue(x) ? 'text-error' : x.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-primary'
                      }`}>{x.title}</span>
                    </span>
                  ))}
                  {items.length > 3 && <span className="block text-2xs text-text-tertiary">+{items.length - 3}</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-3 shadow-soft">
          <div className="flex items-center gap-1.5 mb-2">
            <Inbox className="w-3.5 h-3.5 text-text-tertiary" />
            <span className="text-2xs font-bold uppercase tracking-wide text-text-tertiary">Senza scadenza</span>
            <span className="text-2xs text-text-tertiary tabular">{undated.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {undated.map(x => (
              <button key={x.id} onClick={() => onOpen(x)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-background border border-border text-2xs text-text-secondary hover:text-text-primary hover:bg-surface-hover max-w-full">
                <span className={`w-2 h-2 rounded-sm shrink-0 ${accentOf(x)}`} />
                <span className="truncate">{x.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* dettaglio del giorno scelto */}
      {day && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-scrim sm:p-4 animate-fade-in" onClick={() => setDay(null)}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Attività del giorno"
            className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-pop animate-slide-up pb-safe overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
              <Clock className="w-4 h-4 text-gold-text shrink-0" />
              <span className="flex-1 text-sm font-bold text-text-primary">
                {new Date(day + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <button onClick={() => setDay(null)} aria-label="Chiudi" className="text-text-tertiary hover:text-text-primary"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {(byDay[day] ?? []).map(x => (
                <button key={x.id} onClick={() => { setDay(null); onOpen(x) }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left hover:bg-surface-hover">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIO_DOT[x.priority]}`} />
                  <span className={`flex-1 min-w-0 truncate text-sm ${
                    x.status === 'completato' ? 'text-text-tertiary line-through' : 'text-text-primary'
                  }`}>{x.title}</span>
                  <span className={`text-2xs font-semibold shrink-0 ${TASK_TONE[x.status]}`}>{STATUS_LABEL[x.status]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

