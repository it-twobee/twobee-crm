'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, Loader2, Link2, X, Filter, CheckSquare, Search, Calendar as CalIcon, Users} from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, subDays, isSameMonth, isToday, isSameDay, addMonths, subMonths, addWeeks, subWeeks, addYears, subYears, startOfYear, endOfYear } from 'date-fns'
import { it } from 'date-fns/locale'
import type { Profile } from '@/lib/types/database'
import { colorFor } from '@/lib/calendar-colors'

/** Forma restituita da /api/google/events (già normalizzata e filtrata) */
interface GoogleEvent {
  id: string
  profileId: string
  summary: string
  start: string
  end: string
  allDay: boolean
  /** true quando è l'agenda di un collega: il titolo è "Occupato" */
  masked: boolean
  description?: string | null
  location?: string | null
  meetLink?: string | null
  attendeeEmails?: string[]
}

import { CalendarEventForm, type EventForm } from './CalendarEventForm'

function blankEvent(date = ''): EventForm {
  return {
    id: null, title: '', allDay: false, date, endDate: date,
    startTime: '09:00', endTime: '10:00', location: '', description: '',
    addMeet: false, meetLink: null, attendeeIds: [], attendeeEmails: [],
  }
}

function eventToForm(e: GoogleEvent): EventForm {
  const startD = new Date(e.start)
  const endD = new Date(e.end)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    id: e.id,
    title: e.summary,
    allDay: e.allDay,
    date: e.start.slice(0, 10),
    endDate: e.end.slice(0, 10),
    startTime: `${pad(startD.getHours())}:${pad(startD.getMinutes())}`,
    endTime: `${pad(endD.getHours())}:${pad(endD.getMinutes())}`,
    location: e.location ?? '',
    description: e.description ?? '',
    addMeet: !!e.meetLink,
    meetLink: e.meetLink ?? null,
    attendeeIds: [],
    attendeeEmails: e.attendeeEmails ?? [],
  }
}

interface LocalMeeting {
  id: string; title: string; meeting_date: string; duration_minutes?: number; description?: string
}

interface CalTask {
  id: string; title: string; due_date: string | null; status: string; priority: string; assignee_id: string | null
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  project: { id: string; name: string; clients: { company_name: string } | null } | null
}

type ViewMode = 'giorno' | 'settimana' | 'mese' | 'anno' | 'personalizzato'

function getViewRange(vm: ViewMode, date: Date, rs: string, re: string): { from: Date; to: Date } | null {
  if (vm === 'giorno') {
    const from = new Date(date); from.setHours(0, 0, 0, 0)
    const to = new Date(date); to.setHours(23, 59, 59, 999)
    return { from, to }
  }
  if (vm === 'settimana') return { from: startOfWeek(date, { weekStartsOn: 1 }), to: endOfWeek(date, { weekStartsOn: 1 }) }
  if (vm === 'anno') return { from: startOfYear(date), to: endOfYear(date) }
  if (vm === 'personalizzato') {
    if (!rs || !re) return null
    return { from: new Date(rs + 'T00:00:00'), to: new Date(re + 'T23:59:59') }
  }
  return { from: startOfMonth(date), to: endOfMonth(date) }
}

const EVENT_STYLE = 'bg-info/15 text-info border-info/25'
const MEETING_STYLE = 'bg-accent/15 text-accent border-accent/25'

function taskStyle(due: string): string {
  const d = new Date(due); d.setHours(0, 0, 0, 0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return 'bg-error/15 text-error border-error/25 ring-1 ring-error/30'
  if (diff <= 3) return 'bg-orange/15 text-orange border-orange/25'
  if (diff <= 7) return 'bg-warning/15 text-warning border-warning/25'
  return 'bg-gold/10 text-gold-text border-gold/20'
}

export function CalendarioClient({
  isGoogleConnected, localMeetings = [], tasks = [], profiles = [], currentUserId,
}: {
  isGoogleConnected: boolean; localMeetings: LocalMeeting[]; tasks: CalTask[]
  profiles: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]; currentUserId: string
}) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('mese')
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [editorEvent, setEditorEvent] = useState<EventForm | null>(null)
  // Di default vedo solo la mia agenda. Le task sono personali e restano
  // nascoste finché non le chiedo esplicitamente.
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([currentUserId])
  const [showFilter, setShowFilter] = useState(false)
  const [showTasks, setShowTasks] = useState(false)
  const [notConnected, setNotConnected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd]     = useState('')

  const fetchEvents = async (from: Date, to: Date, profileIds: string[]) => {
    if (profileIds.length === 0) { setGoogleEvents([]); return }
    setLoadingEvents(true)
    try {
      const qs = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        profileIds: profileIds.join(','),
      })
      const res = await fetch(`/api/google/events?${qs}`)
      if (!res.ok) { setGoogleEvents([]); return }
      const { events, notConnected: nc } = await res.json()
      setGoogleEvents(events ?? [])
      setNotConnected(nc ?? [])
    } catch { } finally { setLoadingEvents(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const range = getViewRange(viewMode, currentDate, rangeStart, rangeEnd)
    if (!range) return
    fetchEvents(range.from, range.to, selectedProfiles)
  }, [viewMode, currentDate, rangeStart, rangeEnd, selectedProfiles])

  const filteredTasks = useMemo(() => {
    // Le task restano personali: quelle di un collega non si vedono mai.
    let t = tasks.filter(tk => tk.assignee_id === currentUserId)
    if (search) {
      const q = search.toLowerCase()
      t = t.filter(tk => tk.title.toLowerCase().includes(q) || tk.project?.name.toLowerCase().includes(q))
    }
    return t
  }, [tasks, currentUserId, search])

  const filteredEvents = useMemo(() => {
    if (!search) return googleEvents
    const q = search.toLowerCase()
    return googleEvents.filter(e => e.summary.toLowerCase().includes(q))
  }, [googleEvents, search])

  const filteredMeetings = useMemo(() => {
    if (!search) return localMeetings
    const q = search.toLowerCase()
    return localMeetings.filter(m => m.title.toLowerCase().includes(q))
  }, [localMeetings, search])

  const eventsForDay = (day: Date) => filteredEvents.filter(e => {
    const dt = e.start
    return dt && isSameDay(new Date(dt), day)
  })
  const meetingsForDay = (day: Date) => filteredMeetings.filter(m => isSameDay(new Date(m.meeting_date), day))
  const tasksForDay = (day: Date) => showTasks ? filteredTasks.filter(t => t.due_date && isSameDay(new Date(t.due_date), day)) : []

  const refetch = () => {
    const r = getViewRange(viewMode, currentDate, rangeStart, rangeEnd)
    if (r) fetchEvents(r.from, r.to, selectedProfiles)
  }
  const openCreate = (date?: string) => setEditorEvent(blankEvent(date ?? ''))
  const openEdit = (e: GoogleEvent) => { if (!e.masked) setEditorEvent(eventToForm(e)) }

  const navPrev = () => {
    if (viewMode === 'mese') setCurrentDate(subMonths(currentDate, 1))
    else if (viewMode === 'settimana') setCurrentDate(subWeeks(currentDate, 1))
    else if (viewMode === 'giorno') setCurrentDate(subDays(currentDate, 1))
    else if (viewMode === 'anno') setCurrentDate(subYears(currentDate, 1))
  }
  const navNext = () => {
    if (viewMode === 'mese') setCurrentDate(addMonths(currentDate, 1))
    else if (viewMode === 'settimana') setCurrentDate(addWeeks(currentDate, 1))
    else if (viewMode === 'giorno') setCurrentDate(addDays(currentDate, 1))
    else if (viewMode === 'anno') setCurrentDate(addYears(currentDate, 1))
  }
  const goToday = () => setCurrentDate(new Date())

  const headerLabel =
    viewMode === 'mese' ? format(currentDate, 'MMMM yyyy', { locale: it })
    : viewMode === 'settimana' ? `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM', { locale: it })} — ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: it })}`
    : viewMode === 'giorno' ? format(currentDate, 'EEEE d MMMM yyyy', { locale: it })
    : viewMode === 'anno' ? format(currentDate, 'yyyy')
    : rangeStart && rangeEnd
      ? `${format(new Date(rangeStart + 'T12:00:00'), 'd MMM', { locale: it })} — ${format(new Date(rangeEnd + 'T12:00:00'), 'd MMM yyyy', { locale: it })}`
      : 'Periodo personalizzato'

  const selectedDayEvents = selectedDay ? eventsForDay(selectedDay) : []
  const selectedDayMeetings = selectedDay ? meetingsForDay(selectedDay) : []
  const selectedDayTasks = selectedDay ? tasksForDay(selectedDay) : []

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            {viewMode !== 'personalizzato' ? (
              <>
                <h1 className="text-2xl font-bold text-text-primary capitalize">{headerLabel}</h1>
                <div className="flex items-center gap-1">
                  <button onClick={navPrev} className="p-1.5 rounded-lg hover:bg-overlay/[0.04] text-overlay/30 hover:text-text-primary transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={goToday} className="px-3 py-1 text-xs bg-overlay/[0.04] rounded-lg text-overlay/40 hover:text-text-primary transition-colors">Oggi</button>
                  <button onClick={navNext} className="p-1.5 rounded-lg hover:bg-overlay/[0.04] text-overlay/30 hover:text-text-primary transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-overlay/40">Da</span>
                <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                  className="bg-overlay/[0.03] border border-overlay/[0.08] rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/40" />
                <span className="text-xs text-overlay/40">a</span>
                <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                  className="bg-overlay/[0.03] border border-overlay/[0.08] rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-gold/40" />
              </div>
            )}
            {loadingEvents && <Loader2 className="w-4 h-4 text-gold-text animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-overlay/20" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cerca eventi o task..."
                className="w-48 bg-overlay/[0.03] border border-overlay/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder-overlay/20 focus:outline-none focus:border-gold/40 transition-colors" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-overlay/20 hover:text-overlay/50">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* View mode */}
            <div className="flex bg-overlay/[0.03] border border-overlay/[0.06] rounded-lg p-0.5">
              {(['giorno', 'settimana', 'mese', 'anno', 'personalizzato'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === v ? 'bg-gold text-on-gold font-bold' : 'text-overlay/40 hover:text-text-primary'}`}>
                  {v === 'giorno' ? 'Giorno' : v === 'settimana' ? 'Sett.' : v === 'mese' ? 'Mese' : v === 'anno' ? 'Anno' : 'Periodo'}
                </button>
              ))}
            </div>

            {/* Task personali: nascoste di default */}
            <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              showTasks ? 'bg-gold-dim text-gold-text' : 'text-text-tertiary hover:text-text-primary'
            }`}>
              <input type="checkbox" checked={showTasks} onChange={e => setShowTasks(e.target.checked)}
                className="accent-gold w-3.5 h-3.5" />
              Mostra le mie task
            </label>

            {/* I miei calendari */}
            <div className="relative">
              <button onClick={() => setShowFilter(!showFilter)}
                aria-expanded={showFilter}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  selectedProfiles.length > 1 ? 'bg-gold-dim text-gold-text' : 'text-text-tertiary hover:text-text-primary'
                }`}>
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                {selectedProfiles.length === 1 ? 'I miei calendari' : `${selectedProfiles.length} calendari`}
              </button>

              {showFilter && (
                <div className="absolute right-0 top-full mt-1 rounded-xl border border-border bg-surface p-2 w-60 z-20 shadow-xl">
                  <p className="text-2xs uppercase tracking-wider text-text-tertiary font-bold px-2 py-1.5">
                    I miei calendari
                  </p>
                  {profiles.map(p => {
                    const checked = selectedProfiles.includes(p.id)
                    const col = colorFor(p.id)
                    const isMe = p.id === currentUserId
                    const offline = notConnected.includes(p.id)
                    return (
                      <label key={p.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-surface-hover transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedProfiles(prev =>
                            prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                          className="w-3.5 h-3.5 rounded shrink-0"
                          style={{ accentColor: col.dot }}
                          aria-label={`Mostra il calendario di ${p.full_name}`}
                        />
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.dot }} aria-hidden="true" />
                        <span className="flex-1 min-w-0 text-xs text-text-primary truncate">
                          {isMe ? `${p.full_name} (tu)` : p.full_name}
                        </span>
                        {checked && offline && (
                          <span className="text-2xs text-text-tertiary shrink-0" title="Google non collegato">
                            non collegato
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Google Connect / New event */}
            {!isGoogleConnected ? (
              <a href="/api/google/auth" className="flex items-center gap-2 px-3 py-1.5 bg-gold text-on-gold rounded-lg text-xs font-bold hover:bg-gold/90 transition-colors">
                <Link2 className="w-3.5 h-3.5" /> Connetti Google
              </a>
            ) : (
              <>
                <a href="/api/google/auth" title="Ricollega Google Calendar"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 glass rounded-lg text-xs text-text-secondary hover:text-text-primary hover:border-gold/40 transition-colors">
                  <Link2 className="w-3.5 h-3.5 text-success" /> Google
                </a>
                <button onClick={() => openCreate()} className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-on-gold rounded-lg text-xs font-bold hover:bg-gold/90 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Evento
                </button>
              </>
            )}
          </div>
        </div>

        {/* Collega Google Calendar — sempre in vista finché non è connesso */}
        {!isGoogleConnected && (
          <div className="mb-4 flex items-center gap-3 p-4 rounded-xl border border-gold/30 bg-gold-dim">
            <CalIcon className="w-5 h-5 text-gold-text shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary">Collega il tuo Google Calendar</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Sincronizza i tuoi eventi in tempo reale e crea/modifica appuntamenti direttamente da qui.
                Vedrai anche quando i colleghi sono occupati.
              </p>
            </div>
            <a href="/api/google/auth"
              className="flex items-center gap-2 px-4 py-2 bg-gold text-on-gold rounded-lg text-sm font-bold hover:bg-gold/90 transition-colors shrink-0">
              <Link2 className="w-4 h-4" /> Collega ora
            </a>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 text-2xs">
          <span className="flex items-center gap-1.5 text-overlay/30">
            <span className="w-2.5 h-2.5 rounded-sm bg-info/40" /> Eventi
          </span>
          <span className="flex items-center gap-1.5 text-overlay/30">
            <span className="w-2.5 h-2.5 rounded-sm bg-accent/40" /> Riunioni
          </span>
          {showTasks && (
            <span className="flex items-center gap-1.5 text-overlay/30">
              <span className="w-2.5 h-2.5 rounded-sm bg-gold/40" /> Task
            </span>
          )}
        </div>

        {/* Calendar Grid */}
        {viewMode === 'mese' ? (
          <MonthView
            currentDate={currentDate}
            eventsForDay={eventsForDay}
            meetingsForDay={meetingsForDay}
            tasksForDay={tasksForDay}
            selectedDay={selectedDay}
            onSelectDay={d => setSelectedDay(isSameDay(d, selectedDay ?? new Date(0)) ? null : d)}
          />
        ) : viewMode === 'settimana' ? (
          <WeekView
            currentDate={currentDate}
            eventsForDay={eventsForDay}
            meetingsForDay={meetingsForDay}
            tasksForDay={tasksForDay}
            selectedDay={selectedDay}
            onSelectDay={d => setSelectedDay(isSameDay(d, selectedDay ?? new Date(0)) ? null : d)}
          />
        ) : viewMode === 'giorno' ? (
          <DayView
            currentDate={currentDate}
            eventsForDay={eventsForDay}
            meetingsForDay={meetingsForDay}
            tasksForDay={tasksForDay}
          />
        ) : viewMode === 'anno' ? (
          <YearView
            currentDate={currentDate}
            eventsForDay={eventsForDay}
            meetingsForDay={meetingsForDay}
            tasksForDay={tasksForDay}
            selectedDay={selectedDay}
            onSelectDay={d => setSelectedDay(isSameDay(d, selectedDay ?? new Date(0)) ? null : d)}
          />
        ) : (
          <ListView
            events={filteredEvents}
            meetings={filteredMeetings}
            tasks={filteredTasks}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onSelectDay={d => setSelectedDay(isSameDay(d, selectedDay ?? new Date(0)) ? null : d)}
          />
        )}
      </div>

      {/* Side panel */}
      {selectedDay && (
        <div className="w-80 border-l border-overlay/[0.06] p-4 flex flex-col gap-4 bg-surface">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary capitalize">{format(selectedDay, 'EEEE d MMMM', { locale: it })}</h3>
              <p className="text-xs text-overlay/30">{selectedDayEvents.length + selectedDayMeetings.length + selectedDayTasks.length} elementi</p>
            </div>
            <button onClick={() => setSelectedDay(null)} className="text-overlay/30 hover:text-text-primary"><X className="w-4 h-4" /></button>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto">
            {selectedDayEvents.length > 0 && (
              <p className="text-2xs font-bold text-info/60 uppercase tracking-wider">Eventi</p>
            )}
            {selectedDayEvents.map(e => (
              <div key={e.id}
                onClick={() => openEdit(e)}
                className={`p-3 rounded-xl border ${EVENT_STYLE} ${e.masked ? '' : 'cursor-pointer hover:brightness-110'}`}>
                <p className="text-sm font-medium">{e.summary}</p>
                {!e.allDay && (
                  <p className="text-xs opacity-70 mt-1">{format(new Date(e.start), 'HH:mm')} — {format(new Date(e.end), 'HH:mm')}</p>
                )}
                {e.location && <p className="text-2xs opacity-60 mt-1">📍 {e.location}</p>}
                {!e.masked && <p className="text-2xs opacity-50 mt-1">Tocca per modificare</p>}
              </div>
            ))}

            {selectedDayMeetings.length > 0 && (
              <p className="text-2xs font-bold text-accent/60 uppercase tracking-wider mt-2">Riunioni</p>
            )}
            {selectedDayMeetings.map(m => (
              <div key={m.id} className={`p-3 rounded-xl border ${MEETING_STYLE}`}>
                <p className="text-sm font-medium">{m.title}</p>
                {m.duration_minutes && <p className="text-xs opacity-70 mt-1">{m.duration_minutes} minuti</p>}
              </div>
            ))}

            {selectedDayTasks.length > 0 && (
              <p className="text-2xs font-bold text-gold-text/60 uppercase tracking-wider mt-2">Task</p>
            )}
            {selectedDayTasks.map(t => (
              <div key={t.id} className={`p-3 rounded-xl border ${taskStyle(t.due_date!)}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckSquare className="w-3 h-3 opacity-50" />
                  <p className="text-sm font-medium">{t.title}</p>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  {t.assignee && (
                    <span className="text-2xs opacity-70 flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-gold/20 flex items-center justify-center text-[8px] font-bold text-gold-text">
                        {(t.assignee.full_name ?? '?')[0]}
                      </span>
                      {t.assignee.full_name}
                    </span>
                  )}
                  {t.project && <span className="text-2xs opacity-60">{t.project.clients?.company_name ?? t.project.name}</span>}
                </div>
              </div>
            ))}
            {selectedDayEvents.length === 0 && selectedDayMeetings.length === 0 && selectedDayTasks.length === 0 && (
              <p className="text-xs text-overlay/30">Nessun elemento in questo giorno.</p>
            )}
          </div>

          {isGoogleConnected && (
            <button onClick={() => openCreate(format(selectedDay, 'yyyy-MM-dd'))}
              className="flex items-center gap-2 justify-center px-3 py-2 glass rounded-xl text-sm text-text-primary hover:border-gold/40 transition-colors">
              <Plus className="w-4 h-4 text-gold-text" /> Aggiungi evento
            </button>
          )}
        </div>
      )}

      {/* Editor evento (crea / modifica / elimina) */}
      {editorEvent && (
        <CalendarEventForm
          form={editorEvent}
          profiles={profiles}
          currentUserId={currentUserId}
          onClose={() => setEditorEvent(null)}
          onSaved={() => { setEditorEvent(null); refetch() }}
        />
      )}
    </div>
  )
}

/* ── MONTH VIEW ─────────────────────────────────── */
function MonthView({ currentDate, eventsForDay, meetingsForDay, tasksForDay, selectedDay, onSelectDay }: {
  currentDate: Date
  eventsForDay: (d: Date) => GoogleEvent[]
  meetingsForDay: (d: Date) => LocalMeeting[]
  tasksForDay: (d: Date) => CalTask[]
  selectedDay: Date | null
  onSelectDay: (d: Date) => void
}) {
  const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 })
  const days: Date[] = []; let d = start
  while (d <= end) { days.push(d); d = addDays(d, 1) }
  // Come Google Calendar: la settimana parte da domenica.
  const dayNames = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB']

  /** Quante righe evento entrano prima di dover mostrare "+N in più". */
  const MAX_ROWS = 3

  return (
    // Due griglie: con una sola, auto-rows-fr allargherebbe anche la riga delle
    // intestazioni fino all'altezza di una settimana.
    <div className="flex-1 flex flex-col rounded-xl overflow-hidden border border-border">
      <div className="grid grid-cols-7 gap-px bg-border shrink-0">
        {dayNames.map(dn => (
          <div key={dn} className="bg-surface px-2 py-1.5 text-2xs font-semibold text-text-tertiary text-center tracking-wider">
            {dn}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-border flex-1 auto-rows-fr border-t border-border">
      {days.map(day => {
        const events = eventsForDay(day)
        const meetings = meetingsForDay(day)
        const dayTasks = tasksForDay(day)

        // Un'unica lista ordinata: gli eventi non si mescolano a caso.
        const rows: { key: string; dot: string; label: string; time: string | null; muted: boolean }[] = [
          ...events.map(e => ({
            key: `e-${e.id}`,
            dot: colorFor(e.profileId).dot,
            label: e.summary,
            time: e.allDay ? null : format(new Date(e.start), 'HH:mm'),
            muted: e.masked,
          })),
          ...meetings.map(m => ({
            key: `m-${m.id}`,
            dot: 'var(--color-info)',
            label: m.title,
            time: format(new Date(m.meeting_date), 'HH:mm'),
            muted: false,
          })),
          ...dayTasks.map(t => ({
            key: `t-${t.id}`,
            dot: 'var(--color-text-tertiary)',
            label: t.title,
            time: null,
            muted: false,
          })),
        ]

        const visible = rows.slice(0, MAX_ROWS)
        const hidden = rows.length - visible.length
        const isSelected = selectedDay && isSameDay(day, selectedDay)
        const outside = !isSameMonth(day, currentDate)

        return (
          <div key={day.toISOString()}
            onClick={() => onSelectDay(day)}
            className={`bg-surface px-1.5 pt-1 pb-1.5 min-h-[6.5rem] cursor-pointer transition-colors flex flex-col ${
              outside ? 'opacity-45' : ''
            } ${isSelected ? 'ring-1 ring-inset ring-gold/50' : 'hover:bg-surface-hover'}`}>

            <div className="flex justify-center mb-1 shrink-0">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium tabular ${
                isToday(day) ? 'bg-gold text-on-gold font-bold' : 'text-text-primary'
              }`}>
                {format(day, 'd')}
              </span>
            </div>

            <div className="flex flex-col gap-0.5 min-h-0">
              {visible.map(r => (
                <div key={r.key}
                  className="flex items-center gap-1 px-1 rounded hover:bg-surface-active transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.dot }} aria-hidden="true" />
                  {r.time && <span className="text-2xs text-text-tertiary tabular shrink-0">{r.time}</span>}
                  <span className={`text-2xs truncate ${r.muted ? 'text-text-tertiary italic' : 'text-text-secondary'}`}>
                    {r.label}
                  </span>
                </div>
              ))}

              {hidden > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); onSelectDay(day) }}
                  className="text-2xs text-text-tertiary hover:text-text-primary px-1 text-left transition-colors">
                  {hidden} in più
                </button>
              )}
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}

/* ── DAY VIEW ───────────────────────────────────── */
function DayView({ currentDate, eventsForDay, meetingsForDay, tasksForDay }: {
  currentDate: Date
  eventsForDay: (d: Date) => GoogleEvent[]
  meetingsForDay: (d: Date) => LocalMeeting[]
  tasksForDay: (d: Date) => CalTask[]
}) {
  const events   = eventsForDay(currentDate)
  const meetings = meetingsForDay(currentDate)
  const tasks    = tasksForDay(currentDate)
  const allEmpty = events.length === 0 && meetings.length === 0 && tasks.length === 0

  return (
    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
      {events.map(e => (
        <div key={e.id} className={`p-4 rounded-xl border ${EVENT_STYLE}`}>
          <p className="text-sm font-semibold">{e.summary}</p>
          {!e.allDay && (
            <p className="text-xs opacity-70 mt-1">
              {format(new Date(e.start), 'HH:mm')} — {format(new Date(e.end), 'HH:mm')}
            </p>
          )}
        </div>
      ))}
      {meetings.map(m => (
        <div key={m.id} className={`p-4 rounded-xl border ${MEETING_STYLE}`}>
          <p className="text-sm font-semibold">{m.title}</p>
          {m.duration_minutes && <p className="text-xs opacity-70 mt-1">{m.duration_minutes} min</p>}
          {m.description && <p className="text-xs opacity-60 mt-1 line-clamp-2">{m.description}</p>}
        </div>
      ))}
      {tasks.map(t => (
        <div key={t.id} className={`p-4 rounded-xl border ${taskStyle(t.due_date!)}`}>
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 opacity-50 shrink-0" />
            <p className="text-sm font-semibold">{t.title}</p>
          </div>
          {t.project && <p className="text-xs opacity-60 mt-1">{t.project.clients?.company_name ?? t.project.name}</p>}
        </div>
      ))}
      {allEmpty && (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-overlay/30">Nessun elemento per questo giorno</p>
        </div>
      )}
    </div>
  )
}

/* ── WEEK VIEW ──────────────────────────────────── */
function WeekView({ currentDate, eventsForDay, meetingsForDay, tasksForDay, selectedDay, onSelectDay }: {
  currentDate: Date
  eventsForDay: (d: Date) => GoogleEvent[]
  meetingsForDay: (d: Date) => LocalMeeting[]
  tasksForDay: (d: Date) => CalTask[]
  selectedDay: Date | null
  onSelectDay: (d: Date) => void
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="flex-1 grid grid-cols-7 gap-px bg-overlay/[0.04] rounded-xl overflow-hidden">
      {days.map(day => {
        const events = eventsForDay(day)
        const meetings = meetingsForDay(day)
        const dayTasks = tasksForDay(day)
        const isSelected = selectedDay && isSameDay(day, selectedDay)
        return (
          <div key={day.toISOString()}
            onClick={() => onSelectDay(day)}
            className={`bg-surface p-3 cursor-pointer transition-colors flex flex-col min-h-[300px] ${
              isSelected ? 'ring-1 ring-inset ring-gold/50 bg-gold/[0.03]' : 'hover:bg-overlay/[0.02]'
            }`}>
            <div className="text-center mb-3">
              <p className="text-2xs text-overlay/30 uppercase">{format(day, 'EEE', { locale: it })}</p>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold mx-auto mt-1 ${
                isToday(day) ? 'bg-gold text-on-gold' : 'text-text-primary'
              }`}>{format(day, 'd')}</div>
            </div>
            <div className="space-y-1.5 flex-1 overflow-y-auto">
              {events.map(e => (
                <div key={e.id} className={`text-2xs px-2 py-1.5 rounded-lg border ${EVENT_STYLE}`}>
                  <p className="font-medium truncate">{e.summary}</p>
                  {!e.allDay && (
                    <p className="opacity-60 mt-0.5">{format(new Date(e.start), 'HH:mm')}</p>
                  )}
                </div>
              ))}
              {meetings.map(m => (
                <div key={m.id} className={`text-2xs px-2 py-1.5 rounded-lg border ${MEETING_STYLE}`}>
                  <p className="font-medium truncate">{m.title}</p>
                  {m.duration_minutes && <p className="opacity-60 mt-0.5">{m.duration_minutes}min</p>}
                </div>
              ))}
              {dayTasks.map(t => (
                <div key={t.id} className={`text-2xs px-2 py-1.5 rounded-lg border ${taskStyle(t.due_date!)}`}>
                  <div className="flex items-center gap-1">
                    <CheckSquare className="w-2.5 h-2.5 shrink-0 opacity-50" />
                    <p className="font-medium truncate">{t.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── YEAR VIEW ──────────────────────────────────── */
function YearView({ currentDate, eventsForDay, meetingsForDay, tasksForDay, selectedDay, onSelectDay }: {
  currentDate: Date
  eventsForDay: (d: Date) => GoogleEvent[]
  meetingsForDay: (d: Date) => LocalMeeting[]
  tasksForDay: (d: Date) => CalTask[]
  selectedDay: Date | null
  onSelectDay: (d: Date) => void
}) {
  const year   = currentDate.getFullYear()
  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1))

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="grid grid-cols-4 gap-3">
        {months.map(monthDate => {
          const monthStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 })
          const monthEnd   = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 })
          const days: Date[] = []; let d = monthStart
          while (d <= monthEnd) { days.push(d); d = addDays(d, 1) }

          return (
            <div key={monthDate.getMonth()} className="bg-surface rounded-xl p-3 border border-overlay/[0.04]">
              <p className="text-xs font-bold text-overlay/60 mb-2 capitalize">
                {format(monthDate, 'MMMM', { locale: it })}
              </p>
              <div className="grid grid-cols-7 gap-0">
                {['L','M','M','G','V','S','D'].map((n, i) => (
                  <div key={i} className="text-[8px] text-overlay/20 text-center pb-1">{n}</div>
                ))}
                {days.map((day, i) => {
                  const inMonth = isSameMonth(day, monthDate)
                  const total   = inMonth ? eventsForDay(day).length + meetingsForDay(day).length + tasksForDay(day).length : 0
                  const isSel   = selectedDay && isSameDay(day, selectedDay)
                  return (
                    <button key={i} onClick={() => inMonth && onSelectDay(day)}
                      className={`relative text-2xs text-center w-5 h-5 rounded-full flex items-center justify-center mx-auto transition-colors ${
                        !inMonth ? 'invisible' :
                        isSel ? 'bg-gold text-on-gold font-bold' :
                        isToday(day) ? 'text-gold-text font-bold' :
                        'text-overlay/50 hover:text-text-primary hover:bg-overlay/[0.06]'
                      }`}>
                      {inMonth ? format(day, 'd') : ''}
                      {total > 0 && inMonth && !isSel && (
                        <span className="absolute bottom-0 right-0 w-1 h-1 rounded-full bg-info translate-x-px -translate-y-px" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── LIST VIEW (periodo personalizzato) ─────────── */
function ListView({ events, meetings, tasks, rangeStart, rangeEnd, onSelectDay }: {
  events: GoogleEvent[]
  meetings: LocalMeeting[]
  tasks: CalTask[]
  rangeStart: string
  rangeEnd: string
  onSelectDay: (d: Date) => void
}) {
  if (!rangeStart || !rangeEnd) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-overlay/30">Seleziona un intervallo di date sopra</p>
      </div>
    )
  }

  const byDay: Record<string, { ev: GoogleEvent[]; mt: LocalMeeting[]; tk: CalTask[] }> = {}
  const ensure = (d: string) => { if (!byDay[d]) byDay[d] = { ev: [], mt: [], tk: [] } }

  events.forEach(e => {
    const d = e.start.slice(0, 10)
    ensure(d); byDay[d].ev.push(e)
  })
  meetings.forEach(m => {
    const d = m.meeting_date.slice(0, 10)
    ensure(d); byDay[d].mt.push(m)
  })
  tasks.filter(t => t.due_date && t.due_date >= rangeStart && t.due_date <= rangeEnd).forEach(t => {
    const d = t.due_date!.slice(0, 10)
    ensure(d); byDay[d].tk.push(t)
  })

  const sortedDays = Object.keys(byDay).sort()

  if (sortedDays.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-overlay/30">Nessun elemento nel periodo selezionato</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-5 pr-1">
      {sortedDays.map(day => {
        const { ev, mt, tk } = byDay[day]
        return (
          <div key={day}>
            <button onClick={() => onSelectDay(new Date(day + 'T12:00:00'))}
              className="text-2xs font-bold text-overlay/40 uppercase tracking-wider mb-2 hover:text-overlay/60 transition-colors capitalize block">
              {format(new Date(day + 'T12:00:00'), 'EEEE d MMMM', { locale: it })}
            </button>
            <div className="space-y-1.5">
              {ev.map(e => (
                <div key={e.id} className={`p-3 rounded-xl border ${EVENT_STYLE}`}>
                  <p className="text-sm font-medium">{e.summary}</p>
                  {!e.allDay && <p className="text-xs opacity-70 mt-0.5">{format(new Date(e.start), 'HH:mm')}</p>}
                </div>
              ))}
              {mt.map(m => (
                <div key={m.id} className={`p-3 rounded-xl border ${MEETING_STYLE}`}>
                  <p className="text-sm font-medium">{m.title}</p>
                  {m.duration_minutes && <p className="text-xs opacity-70 mt-0.5">{m.duration_minutes} min</p>}
                </div>
              ))}
              {tk.map(t => (
                <div key={t.id} className={`p-3 rounded-xl border ${taskStyle(t.due_date!)}`}>
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-3.5 h-3.5 opacity-50 shrink-0" />
                    <p className="text-sm font-medium">{t.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
