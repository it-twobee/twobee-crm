'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, Loader2, Link2, X, Filter, CheckSquare, Search, Calendar as CalIcon } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, subDays, isSameMonth, isToday, isSameDay, addMonths, subMonths, addWeeks, subWeeks, addYears, subYears, startOfYear, endOfYear } from 'date-fns'
import { it } from 'date-fns/locale'
import type { Profile } from '@/lib/types/database'

interface GoogleEvent {
  id: string; summary: string
  start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }
  description?: string; attendees?: { email: string }[]; colorId?: string
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

const EVENT_STYLE = 'bg-blue-500/15 text-blue-400 border-blue-500/25'
const MEETING_STYLE = 'bg-purple-500/15 text-purple-400 border-purple-500/25'

function taskStyle(due: string): string {
  const d = new Date(due); d.setHours(0, 0, 0, 0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return 'bg-red-500/15 text-red-400 border-red-500/25 ring-1 ring-red-500/30'
  if (diff <= 3) return 'bg-orange-500/15 text-orange-400 border-orange-500/25'
  if (diff <= 7) return 'bg-amber-500/15 text-amber-400 border-amber-500/25'
  return 'bg-gold/10 text-gold border-gold/20'
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
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', date: '', startTime: '09:00', endTime: '10:00', description: '' })
  const [saving, setSaving] = useState(false)
  const [filterUser, setFilterUser] = useState<string | null>(null)
  const [showFilter, setShowFilter] = useState(false)
  const [showTasks, setShowTasks] = useState(true)
  const [search, setSearch] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd]     = useState('')

  const fetchEvents = async (from: Date, to: Date) => {
    setLoadingEvents(true)
    try {
      const res = await fetch(`/api/google/events?timeMin=${from.toISOString()}&timeMax=${to.toISOString()}`)
      const { events } = await res.json()
      setGoogleEvents(events ?? [])
    } catch { } finally { setLoadingEvents(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isGoogleConnected) return
    const range = getViewRange(viewMode, currentDate, rangeStart, rangeEnd)
    if (!range) return
    fetchEvents(range.from, range.to)
  }, [viewMode, currentDate, rangeStart, rangeEnd, isGoogleConnected])

  const filteredTasks = useMemo(() => {
    let t = tasks
    if (filterUser) t = t.filter(tk => tk.assignee_id === filterUser)
    if (search) {
      const q = search.toLowerCase()
      t = t.filter(tk => tk.title.toLowerCase().includes(q) || tk.project?.name.toLowerCase().includes(q))
    }
    return t
  }, [tasks, filterUser, search])

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
    const dt = e.start.dateTime ?? e.start.date
    return dt && isSameDay(new Date(dt), day)
  })
  const meetingsForDay = (day: Date) => filteredMeetings.filter(m => isSameDay(new Date(m.meeting_date), day))
  const tasksForDay = (day: Date) => showTasks ? filteredTasks.filter(t => t.due_date && isSameDay(new Date(t.due_date), day)) : []

  const saveEvent = async () => {
    if (!newEvent.title || !newEvent.date) return
    setSaving(true)
    try {
      const start = new Date(`${newEvent.date}T${newEvent.startTime}:00`)
      const end = new Date(`${newEvent.date}T${newEvent.endTime}:00`)
      await fetch('/api/google/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newEvent.title, description: newEvent.description, start: start.toISOString(), end: end.toISOString() }),
      })
      setShowNewEvent(false); setNewEvent({ title: '', date: '', startTime: '09:00', endTime: '10:00', description: '' })
      const r = getViewRange(viewMode, currentDate, rangeStart, rangeEnd)
      if (r) fetchEvents(r.from, r.to)
    } finally { setSaving(false) }
  }

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
                <h1 className="text-2xl font-bold text-white capitalize">{headerLabel}</h1>
                <div className="flex items-center gap-1">
                  <button onClick={navPrev} className="p-1.5 rounded-lg hover:bg-white/[0.04] text-white/30 hover:text-white transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={goToday} className="px-3 py-1 text-xs bg-white/[0.04] rounded-lg text-white/40 hover:text-white transition-colors">Oggi</button>
                  <button onClick={navNext} className="p-1.5 rounded-lg hover:bg-white/[0.04] text-white/30 hover:text-white transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">Da</span>
                <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                  className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold/40" />
                <span className="text-xs text-white/40">a</span>
                <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                  className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-gold/40" />
              </div>
            )}
            {loadingEvents && <Loader2 className="w-4 h-4 text-gold animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Cerca eventi o task..."
                className="w-48 bg-white/[0.03] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-gold/40 transition-colors" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* View mode */}
            <div className="flex bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
              {(['giorno', 'settimana', 'mese', 'anno', 'personalizzato'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === v ? 'bg-gold text-black font-bold' : 'text-white/40 hover:text-white'}`}>
                  {v === 'giorno' ? 'Giorno' : v === 'settimana' ? 'Sett.' : v === 'mese' ? 'Mese' : v === 'anno' ? 'Anno' : 'Periodo'}
                </button>
              ))}
            </div>

            {/* Task toggle */}
            <button onClick={() => setShowTasks(!showTasks)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                showTasks ? 'bg-gold/10 text-gold' : 'text-white/30 hover:text-white'
              }`}>
              <CheckSquare className="w-3.5 h-3.5" /> Task
            </button>

            {/* User filter */}
            <div className="relative">
              <button onClick={() => setShowFilter(!showFilter)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterUser ? 'bg-gold/10 text-gold' : 'text-white/30 hover:text-white'
                }`}>
                <Filter className="w-3.5 h-3.5" />
                {filterUser ? profiles.find(p => p.id === filterUser)?.full_name?.split(' ')[0] ?? 'Filtro' : 'Colleghi'}
              </button>
              {showFilter && (
                <div className="absolute right-0 top-full mt-1 glass rounded-xl p-2 w-52 z-20 shadow-xl">
                  <button onClick={() => { setFilterUser(null); setShowFilter(false) }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs ${!filterUser ? 'bg-gold/10 text-gold' : 'text-white/40 hover:text-white hover:bg-white/[0.04]'}`}>
                    Tutti
                  </button>
                  {profiles.map(p => (
                    <button key={p.id} onClick={() => { setFilterUser(p.id); setShowFilter(false) }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${filterUser === p.id ? 'bg-gold/10 text-gold' : 'text-white/40 hover:text-white hover:bg-white/[0.04]'}`}>
                      <div className="w-5 h-5 rounded-full bg-gold/20 flex items-center justify-center text-[9px] font-bold text-gold shrink-0">
                        {(p.full_name ?? '?')[0]}
                      </div>
                      <span className="truncate">{p.full_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Google Connect / New event */}
            {!isGoogleConnected ? (
              <a href="/api/google/auth" className="flex items-center gap-2 px-3 py-1.5 glass rounded-lg text-xs text-white hover:border-gold/40 transition-colors">
                <Link2 className="w-3.5 h-3.5 text-gold" /> Connetti Google
              </a>
            ) : (
              <button onClick={() => setShowNewEvent(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-black rounded-lg text-xs font-bold hover:bg-gold/90 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Evento
              </button>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 text-[10px]">
          <span className="flex items-center gap-1.5 text-white/30">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/40" /> Eventi
          </span>
          <span className="flex items-center gap-1.5 text-white/30">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-500/40" /> Riunioni
          </span>
          {showTasks && (
            <span className="flex items-center gap-1.5 text-white/30">
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
        <div className="w-80 border-l border-white/[0.06] p-4 flex flex-col gap-4 bg-[rgba(255,255,255,0.01)]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white capitalize">{format(selectedDay, 'EEEE d MMMM', { locale: it })}</h3>
              <p className="text-xs text-white/30">{selectedDayEvents.length + selectedDayMeetings.length + selectedDayTasks.length} elementi</p>
            </div>
            <button onClick={() => setSelectedDay(null)} className="text-white/30 hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto">
            {selectedDayEvents.length > 0 && (
              <p className="text-[9px] font-bold text-blue-400/60 uppercase tracking-wider">Eventi</p>
            )}
            {selectedDayEvents.map(e => (
              <div key={e.id} className={`p-3 rounded-xl border ${EVENT_STYLE}`}>
                <p className="text-sm font-medium">{e.summary}</p>
                {e.start.dateTime && (
                  <p className="text-xs opacity-70 mt-1">{format(new Date(e.start.dateTime), 'HH:mm')} — {format(new Date(e.end.dateTime!), 'HH:mm')}</p>
                )}
                {e.attendees && e.attendees.length > 0 && <p className="text-xs opacity-60 mt-1">{e.attendees.length} partecipanti</p>}
              </div>
            ))}

            {selectedDayMeetings.length > 0 && (
              <p className="text-[9px] font-bold text-purple-400/60 uppercase tracking-wider mt-2">Riunioni</p>
            )}
            {selectedDayMeetings.map(m => (
              <div key={m.id} className={`p-3 rounded-xl border ${MEETING_STYLE}`}>
                <p className="text-sm font-medium">{m.title}</p>
                {m.duration_minutes && <p className="text-xs opacity-70 mt-1">{m.duration_minutes} minuti</p>}
              </div>
            ))}

            {selectedDayTasks.length > 0 && (
              <p className="text-[9px] font-bold text-gold/60 uppercase tracking-wider mt-2">Task</p>
            )}
            {selectedDayTasks.map(t => (
              <div key={t.id} className={`p-3 rounded-xl border ${taskStyle(t.due_date!)}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckSquare className="w-3 h-3 opacity-50" />
                  <p className="text-sm font-medium">{t.title}</p>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  {t.assignee && (
                    <span className="text-[10px] opacity-70 flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-gold/20 flex items-center justify-center text-[8px] font-bold text-gold">
                        {(t.assignee.full_name ?? '?')[0]}
                      </span>
                      {t.assignee.full_name}
                    </span>
                  )}
                  {t.project && <span className="text-[10px] opacity-60">{t.project.clients?.company_name ?? t.project.name}</span>}
                </div>
              </div>
            ))}
            {selectedDayEvents.length === 0 && selectedDayMeetings.length === 0 && selectedDayTasks.length === 0 && (
              <p className="text-xs text-white/30">Nessun elemento in questo giorno.</p>
            )}
          </div>

          {isGoogleConnected && (
            <button onClick={() => { setNewEvent({ ...newEvent, date: format(selectedDay, 'yyyy-MM-dd') }); setShowNewEvent(true) }}
              className="flex items-center gap-2 justify-center px-3 py-2 glass rounded-xl text-sm text-white hover:border-gold/40 transition-colors">
              <Plus className="w-4 h-4 text-gold" /> Aggiungi evento
            </button>
          )}
        </div>
      )}

      {/* New event modal */}
      {showNewEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="glass-strong rounded-2xl p-6 w-[420px] space-y-4">
            <h3 className="text-lg font-bold text-white font-heading">Nuovo evento</h3>
            <input value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="Titolo evento"
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-gold/40" />
            <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-gold/40" />
            <div className="flex gap-3">
              <input type="time" value={newEvent.startTime} onChange={e => setNewEvent({ ...newEvent, startTime: e.target.value })}
                className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-gold/40" />
              <input type="time" value={newEvent.endTime} onChange={e => setNewEvent({ ...newEvent, endTime: e.target.value })}
                className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-gold/40" />
            </div>
            <textarea value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} placeholder="Descrizione (opzionale)"
              rows={3} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-gold/40 resize-none" />
            <div className="flex gap-3">
              <button onClick={() => setShowNewEvent(false)} className="flex-1 py-2 border border-white/[0.08] rounded-xl text-sm text-white/40 hover:text-white transition-colors">Annulla</button>
              <button onClick={saveEvent} disabled={saving || !newEvent.title || !newEvent.date}
                className="flex-1 py-2 bg-gold text-black rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-gold/90 transition-colors">
                {saving ? 'Salvataggio...' : 'Crea evento'}
              </button>
            </div>
          </div>
        </div>
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
  const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
  const days: Date[] = []; let d = start
  while (d <= end) { days.push(d); d = addDays(d, 1) }
  const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

  return (
    <div className="grid grid-cols-7 gap-px bg-white/[0.04] rounded-xl overflow-hidden flex-1">
      {dayNames.map(dn => (
        <div key={dn} className="bg-[rgba(255,255,255,0.02)] px-3 py-2 text-xs font-semibold text-white/30 text-center">{dn}</div>
      ))}
      {days.map(day => {
        const events = eventsForDay(day)
        const meetings = meetingsForDay(day)
        const dayTasks = tasksForDay(day)
        const total = events.length + meetings.length + dayTasks.length
        const isSelected = selectedDay && isSameDay(day, selectedDay)
        return (
          <div key={day.toISOString()}
            onClick={() => onSelectDay(day)}
            className={`bg-[#0B0B0C] p-2 min-h-[100px] cursor-pointer transition-colors ${
              !isSameMonth(day, currentDate) ? 'opacity-40' : ''
            } ${isSelected ? 'ring-1 ring-inset ring-gold/50 bg-gold/[0.03]' : 'hover:bg-white/[0.02]'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium mb-1 ${
              isToday(day) ? 'bg-gold text-black' : 'text-white'
            }`}>{format(day, 'd')}</div>
            <div className="space-y-0.5">
              {events.slice(0, 2).map(e => (
                <div key={e.id} className={`text-[10px] px-1.5 py-0.5 rounded truncate border ${EVENT_STYLE}`}>{e.summary}</div>
              ))}
              {meetings.slice(0, Math.max(0, 2 - events.length)).map(m => (
                <div key={m.id} className={`text-[10px] px-1.5 py-0.5 rounded truncate border ${MEETING_STYLE}`}>{m.title}</div>
              ))}
              {dayTasks.slice(0, Math.max(0, 3 - events.length - meetings.length)).map(t => (
                <div key={t.id} className={`text-[10px] px-1.5 py-0.5 rounded truncate border ${taskStyle(t.due_date!)}`}>
                  {t.title}
                </div>
              ))}
              {total > 3 && <div className="text-[10px] text-white/20 px-1">+{total - 3} altri</div>}
            </div>
          </div>
        )
      })}
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
          {e.start.dateTime && (
            <p className="text-xs opacity-70 mt-1">
              {format(new Date(e.start.dateTime), 'HH:mm')}{e.end?.dateTime ? ` — ${format(new Date(e.end.dateTime), 'HH:mm')}` : ''}
            </p>
          )}
          {e.attendees && e.attendees.length > 0 && <p className="text-xs opacity-60 mt-1">{e.attendees.length} partecipanti</p>}
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
          <p className="text-sm text-white/30">Nessun elemento per questo giorno</p>
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
    <div className="flex-1 grid grid-cols-7 gap-px bg-white/[0.04] rounded-xl overflow-hidden">
      {days.map(day => {
        const events = eventsForDay(day)
        const meetings = meetingsForDay(day)
        const dayTasks = tasksForDay(day)
        const isSelected = selectedDay && isSameDay(day, selectedDay)
        return (
          <div key={day.toISOString()}
            onClick={() => onSelectDay(day)}
            className={`bg-[#0B0B0C] p-3 cursor-pointer transition-colors flex flex-col min-h-[300px] ${
              isSelected ? 'ring-1 ring-inset ring-gold/50 bg-gold/[0.03]' : 'hover:bg-white/[0.02]'
            }`}>
            <div className="text-center mb-3">
              <p className="text-[10px] text-white/30 uppercase">{format(day, 'EEE', { locale: it })}</p>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold mx-auto mt-1 ${
                isToday(day) ? 'bg-gold text-black' : 'text-white'
              }`}>{format(day, 'd')}</div>
            </div>
            <div className="space-y-1.5 flex-1 overflow-y-auto">
              {events.map(e => (
                <div key={e.id} className={`text-[10px] px-2 py-1.5 rounded-lg border ${EVENT_STYLE}`}>
                  <p className="font-medium truncate">{e.summary}</p>
                  {e.start.dateTime && (
                    <p className="opacity-60 mt-0.5">{format(new Date(e.start.dateTime), 'HH:mm')}</p>
                  )}
                </div>
              ))}
              {meetings.map(m => (
                <div key={m.id} className={`text-[10px] px-2 py-1.5 rounded-lg border ${MEETING_STYLE}`}>
                  <p className="font-medium truncate">{m.title}</p>
                  {m.duration_minutes && <p className="opacity-60 mt-0.5">{m.duration_minutes}min</p>}
                </div>
              ))}
              {dayTasks.map(t => (
                <div key={t.id} className={`text-[10px] px-2 py-1.5 rounded-lg border ${taskStyle(t.due_date!)}`}>
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
            <div key={monthDate.getMonth()} className="bg-[#0B0B0C] rounded-xl p-3 border border-white/[0.04]">
              <p className="text-xs font-bold text-white/60 mb-2 capitalize">
                {format(monthDate, 'MMMM', { locale: it })}
              </p>
              <div className="grid grid-cols-7 gap-0">
                {['L','M','M','G','V','S','D'].map((n, i) => (
                  <div key={i} className="text-[8px] text-white/20 text-center pb-1">{n}</div>
                ))}
                {days.map((day, i) => {
                  const inMonth = isSameMonth(day, monthDate)
                  const total   = inMonth ? eventsForDay(day).length + meetingsForDay(day).length + tasksForDay(day).length : 0
                  const isSel   = selectedDay && isSameDay(day, selectedDay)
                  return (
                    <button key={i} onClick={() => inMonth && onSelectDay(day)}
                      className={`relative text-[10px] text-center w-5 h-5 rounded-full flex items-center justify-center mx-auto transition-colors ${
                        !inMonth ? 'invisible' :
                        isSel ? 'bg-gold text-black font-bold' :
                        isToday(day) ? 'text-gold font-bold' :
                        'text-white/50 hover:text-white hover:bg-white/[0.06]'
                      }`}>
                      {inMonth ? format(day, 'd') : ''}
                      {total > 0 && inMonth && !isSel && (
                        <span className="absolute bottom-0 right-0 w-1 h-1 rounded-full bg-blue-400 translate-x-px -translate-y-px" />
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
        <p className="text-sm text-white/30">Seleziona un intervallo di date sopra</p>
      </div>
    )
  }

  const byDay: Record<string, { ev: GoogleEvent[]; mt: LocalMeeting[]; tk: CalTask[] }> = {}
  const ensure = (d: string) => { if (!byDay[d]) byDay[d] = { ev: [], mt: [], tk: [] } }

  events.forEach(e => {
    const d = (e.start.dateTime ?? e.start.date ?? '').slice(0, 10)
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
        <p className="text-sm text-white/30">Nessun elemento nel periodo selezionato</p>
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
              className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 hover:text-white/60 transition-colors capitalize block">
              {format(new Date(day + 'T12:00:00'), 'EEEE d MMMM', { locale: it })}
            </button>
            <div className="space-y-1.5">
              {ev.map(e => (
                <div key={e.id} className={`p-3 rounded-xl border ${EVENT_STYLE}`}>
                  <p className="text-sm font-medium">{e.summary}</p>
                  {e.start.dateTime && <p className="text-xs opacity-70 mt-0.5">{format(new Date(e.start.dateTime), 'HH:mm')}</p>}
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
