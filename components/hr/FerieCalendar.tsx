'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle, Plane, Clock, Thermometer, Info } from 'lucide-react'
import {
  normalize, monthGrid, upcoming, busiestDay, addDays,
  type RawRequest, type RawLeave, type Span, type LeaveKind,
} from '@/lib/leave-calendar'
import type { Profile } from '@/lib/types/database'

const KIND_ICON: Record<LeaveKind, React.ReactNode> = {
  ferie: <Plane className="w-3 h-3" />,
  permesso: <Clock className="w-3 h-3" />,
  malattia: <Thermometer className="w-3 h-3" />,
  altro: <Info className="w-3 h-3" />,
}
/* Il colore dice il **tipo**, l'opacità dice lo **stato**: due informazioni su
   due canali diversi, così una ferie da approvare non si confonde con un
   permesso approvato. Solo token — il tema chiaro deve reggere. */
const KIND_TONE: Record<LeaveKind, string> = {
  ferie: 'bg-gold-dim text-gold-text border-gold/40',
  permesso: 'bg-info-dim text-info border-info/40',
  malattia: 'bg-error-dim text-error border-error/40',
  altro: 'bg-surface-active text-text-secondary border-border',
}
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const DOW = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']

/**
 * §223 — Il calendario delle assenze, per chi deve organizzare il lavoro.
 *
 * Due cose che un elenco cronologico non risponde e un calendario sì: **chi
 * manca insieme a chi**, e **quando arriva il buco**. Per questo in cima c'è
 * l'avviso a dieci giorni — la finestra in cui una consegna si può ancora
 * spostare — e sotto il mese, dove le sovrapposizioni si vedono a colpo d'occhio
 * invece di doverle incrociare a mente.
 */
export function FerieCalendar({ requests, leaves, profiles, today }: {
  requests: RawRequest[]; leaves: RawLeave[]; profiles: Profile[]; today: string
}) {
  const [month, setMonth] = useState(() => `${today.slice(0, 7)}-01`)

  const { spans, dropped } = useMemo(() => normalize(requests, leaves), [requests, leaves])
  const soon = useMemo(() => upcoming(spans, today, 10), [spans, today])
  const weeks = useMemo(() => monthGrid(spans, month, today), [spans, month, today])
  const peak = useMemo(() => busiestDay(weeks), [weeks])

  const nameOf = useMemo(() => {
    const m = new Map(profiles.map(p => [p.id, p.full_name]))
    return (id: string) => m.get(id) ?? 'Sconosciuto'
  }, [profiles])
  const initials = (id: string) => nameOf(id).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const shift = (n: number) => setMonth(m => `${addDays(m, n > 0 ? 32 : -1).slice(0, 7)}-01`)
  const [y, mo] = month.split('-')

  return (
    <div className="space-y-4">
      {/* ── L'avviso: chi non c'è nei prossimi dieci giorni ── */}
      <section className={`rounded-2xl border p-4 ${
        soon.length ? 'border-warning/40 bg-warning-dim' : 'border-border bg-surface'}`}>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className={`w-4 h-4 ${soon.length ? 'text-warning' : 'text-text-tertiary'}`} />
          <h3 className="text-sm font-bold text-text-primary flex-1">Prossimi 10 giorni</h3>
          <span className="text-2xs text-text-tertiary">{soon.length} assenz{soon.length === 1 ? 'a' : 'e'}</span>
        </div>
        {soon.length === 0 ? (
          <p className="text-2xs text-text-tertiary">
            Nessuno in ferie o permesso da qui al {new Date(addDays(today, 10)).toLocaleDateString('it-IT')}.
          </p>
        ) : (
          <div className="space-y-1.5 mt-2">
            {soon.map(s => (
              <div key={s.id} className="flex items-center gap-2 flex-wrap">
                <span className="w-7 h-7 rounded-full bg-surface border border-border flex items-center justify-center text-2xs font-black text-text-secondary shrink-0">
                  {initials(s.profileId)}
                </span>
                <span className="text-sm font-semibold text-text-primary">{nameOf(s.profileId)}</span>
                <span className={`inline-flex items-center gap-1 text-2xs font-semibold px-1.5 py-0.5 rounded border ${KIND_TONE[s.kind]} ${
                  s.status === 'da approvare' ? 'opacity-60' : ''}`}>
                  {KIND_ICON[s.kind]}{s.kind}
                </span>
                {s.status === 'da approvare' && (
                  <span className="text-2xs font-semibold text-warning">da approvare</span>
                )}
                <span className="text-2xs text-text-secondary tabular">
                  {new Date(s.from).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                  {s.days > 1 && ` → ${new Date(s.to).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`}
                  {' · '}{s.days}gg
                </span>
                <span className="flex-1" />
                {/* «Già via» non è un ritardo dell'avviso: è la risposta alla
                    domanda vera, cioè su chi non posso contare adesso. */}
                <span className={`text-2xs font-bold tabular shrink-0 ${
                  s.started ? 'text-error' : s.inDays <= 3 ? 'text-warning' : 'text-text-secondary'}`}>
                  {s.started ? 'già via' : s.inDays === 0 ? 'da oggi' : s.inDays === 1 ? 'domani' : `fra ${s.inDays}gg`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Il mese ── */}
      <section className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <button onClick={() => shift(-1)} aria-label="Mese precedente"
            className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <h3 className="text-sm font-bold text-text-primary capitalize flex-1">
            {MONTHS[Number(mo) - 1]} {y}
          </h3>
          {peak && (
            <span className="text-2xs text-text-tertiary">
              picco il {new Date(peak.date).toLocaleDateString('it-IT', { day: 'numeric' })}:{' '}
              <strong className="text-text-secondary">{peak.count} fuori</strong>
            </span>
          )}
          <button onClick={() => shift(1)} aria-label="Mese successivo"
            className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover press">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-border">
          {DOW.map(d => (
            <div key={d} className="px-2 py-1.5 text-2xs font-semibold text-text-tertiary uppercase text-center">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {weeks.flat().map(day => (
            <div key={day.date}
              className={`min-h-[74px] border-b border-r border-border/60 p-1 ${
                !day.inMonth ? 'opacity-40' : ''} ${day.isWeekend ? 'bg-background/50' : ''}`}>
              <div className={`text-2xs tabular mb-1 ${
                day.isToday
                  ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold text-on-gold font-black'
                  : 'text-text-tertiary'}`}>
                {Number(day.date.slice(8))}
              </div>
              <div className="space-y-0.5">
                {day.spans.slice(0, 3).map(s => (
                  <div key={s.id}
                    title={`${nameOf(s.profileId)} — ${s.kind}${s.status === 'da approvare' ? ' (da approvare)' : ''}`}
                    className={`flex items-center gap-1 px-1 py-0.5 rounded border text-2xs truncate ${KIND_TONE[s.kind]} ${
                      s.status === 'da approvare' ? 'opacity-55 border-dashed' : ''}`}>
                    {KIND_ICON[s.kind]}
                    <span className="truncate">{nameOf(s.profileId).split(' ')[0]}</span>
                  </div>
                ))}
                {day.spans.length > 3 && (
                  <div className="text-2xs text-text-tertiary px-1">+{day.spans.length - 3}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-t border-border">
          {(['ferie', 'permesso', 'malattia'] as LeaveKind[]).map(k => (
            <span key={k} className={`inline-flex items-center gap-1 text-2xs font-semibold px-1.5 py-0.5 rounded border ${KIND_TONE[k]}`}>
              {KIND_ICON[k]}{k}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 text-2xs text-text-tertiary">
            <span className="w-3 h-3 rounded border border-dashed border-border-strong opacity-55" />
            tratteggio = da approvare
          </span>
        </div>
      </section>

      {/* Quello che il calendario non può mostrare, invece di farlo sparire */}
      {dropped.length > 0 && (
        <p className="flex items-start gap-2 text-2xs text-text-tertiary">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {dropped.length} richiest{dropped.length === 1 ? 'a' : 'e'} fuori dal calendario:{' '}
          {Array.from(new Set(dropped.map(d => d.reason))).join(' · ')}. Una data rovesciata non si
          corregge da sola — non si sa quale delle due sia quella giusta.
        </p>
      )}
    </div>
  )
}
