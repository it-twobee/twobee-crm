'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Calendar, ExternalLink, Loader2, Link2 } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday, isSameDay, addMonths, subMonths } from 'date-fns'
import { it } from 'date-fns/locale'

interface GoogleEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  description?: string
  attendees?: { email: string }[]
  colorId?: string
}

interface LocalMeeting {
  id: string
  title: string
  meeting_date: string
  duration_minutes?: number
  description?: string
}

const EVENT_COLORS: Record<string, string> = {
  '1': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  '2': 'bg-green-500/20 text-green-400 border-green-500/30',
  '3': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  '4': 'bg-red-500/20 text-red-400 border-red-500/30',
  '5': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  default: 'bg-gold/10 text-gold border-gold/20',
}

export function CalendarioClient({
  isGoogleConnected,
  localMeetings = [],
}: {
  isGoogleConnected: boolean
  localMeetings: LocalMeeting[]
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', date: '', startTime: '09:00', endTime: '10:00', description: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isGoogleConnected) return
    fetchEvents()
  }, [currentMonth, isGoogleConnected])

  const fetchEvents = async () => {
    setLoadingEvents(true)
    try {
      const timeMin = startOfMonth(currentMonth).toISOString()
      const timeMax = endOfMonth(currentMonth).toISOString()
      const res = await fetch(`/api/google/events?timeMin=${timeMin}&timeMax=${timeMax}`)
      const { events } = await res.json()
      setGoogleEvents(events ?? [])
    } catch {
      // silent
    } finally {
      setLoadingEvents(false)
    }
  }

  const calendarDays = () => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
    const days: Date[] = []
    let d = start
    while (d <= end) {
      days.push(d)
      d = addDays(d, 1)
    }
    return days
  }

  const eventsForDay = (day: Date): GoogleEvent[] =>
    googleEvents.filter((e) => {
      const dt = e.start.dateTime ?? e.start.date
      return dt && isSameDay(new Date(dt), day)
    })

  const meetingsForDay = (day: Date): LocalMeeting[] =>
    localMeetings.filter((m) => isSameDay(new Date(m.meeting_date), day))

  const saveEvent = async () => {
    if (!newEvent.title || !newEvent.date) return
    setSaving(true)
    try {
      const start = new Date(`${newEvent.date}T${newEvent.startTime}:00`)
      const end = new Date(`${newEvent.date}T${newEvent.endTime}:00`)
      await fetch('/api/google/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newEvent.title, description: newEvent.description, start: start.toISOString(), end: end.toISOString() }),
      })
      setShowNewEvent(false)
      setNewEvent({ title: '', date: '', startTime: '09:00', endTime: '10:00', description: '' })
      fetchEvents()
    } finally {
      setSaving(false)
    }
  }

  const days = calendarDays()
  const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

  const selectedDayEvents = selectedDay ? eventsForDay(selectedDay) : []
  const selectedDayMeetings = selectedDay ? meetingsForDay(selectedDay) : []

  return (
    <div className="flex h-full">
      {/* Main calendar */}
      <div className="flex-1 p-6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: it })}
            </h1>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 rounded-lg hover:bg-[#2A2A2A] text-text-secondary hover:text-white transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setCurrentMonth(new Date())} className="px-3 py-1 text-xs bg-[#2A2A2A] rounded-lg text-text-secondary hover:text-white transition-colors">
                Oggi
              </button>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 rounded-lg hover:bg-[#2A2A2A] text-text-secondary hover:text-white transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {loadingEvents && <Loader2 className="w-4 h-4 text-gold animate-spin" />}
          </div>

          <div className="flex items-center gap-3">
            {!isGoogleConnected ? (
              <a href="/api/google/auth" className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-sm text-white hover:border-gold/40 transition-colors">
                <Link2 className="w-4 h-4 text-gold" />
                Connetti Google Calendar
              </a>
            ) : (
              <button onClick={() => setShowNewEvent(true)} className="flex items-center gap-2 px-4 py-2 bg-gold text-black rounded-lg text-sm font-semibold hover:bg-gold/90 transition-colors">
                <Plus className="w-4 h-4" />
                Nuovo evento
              </button>
            )}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-px bg-[#2A2A2A] rounded-xl overflow-hidden flex-1">
          {dayNames.map((d) => (
            <div key={d} className="bg-[#1A1A1A] px-3 py-2 text-xs font-semibold text-text-secondary text-center">
              {d}
            </div>
          ))}

          {days.map((day) => {
            const events = eventsForDay(day)
            const meetings = meetingsForDay(day)
            const total = events.length + meetings.length
            const isSelected = selectedDay && isSameDay(day, selectedDay)

            return (
              <div
                key={day.toISOString()}
                onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date(0)) ? null : day)}
                className={`bg-[#111111] p-2 min-h-[100px] cursor-pointer transition-colors ${
                  !isSameMonth(day, currentMonth) ? 'opacity-40' : ''
                } ${isSelected ? 'ring-1 ring-inset ring-gold/50 bg-gold/5' : 'hover:bg-[#1A1A1A]'}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium mb-1 ${
                  isToday(day) ? 'bg-gold text-black' : 'text-white'
                }`}>
                  {format(day, 'd')}
                </div>

                <div className="space-y-0.5">
                  {events.slice(0, 2).map((e) => (
                    <div key={e.id} className={`text-[10px] px-1.5 py-0.5 rounded truncate border ${EVENT_COLORS[e.colorId ?? 'default']}`}>
                      {e.summary}
                    </div>
                  ))}
                  {meetings.slice(0, 2 - Math.min(events.length, 2)).map((m) => (
                    <div key={m.id} className="text-[10px] px-1.5 py-0.5 rounded truncate bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      {m.title}
                    </div>
                  ))}
                  {total > 2 && (
                    <div className="text-[10px] text-text-secondary px-1">+{total - 2} altri</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Side panel for selected day */}
      {selectedDay && (
        <div className="w-80 border-l border-[#2A2A2A] p-4 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white capitalize">
              {format(selectedDay, 'EEEE d MMMM', { locale: it })}
            </h3>
            <p className="text-xs text-text-secondary">{selectedDayEvents.length + selectedDayMeetings.length} eventi</p>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto">
            {selectedDayEvents.map((e) => (
              <div key={e.id} className={`p-3 rounded-lg border ${EVENT_COLORS[e.colorId ?? 'default']}`}>
                <p className="text-sm font-medium">{e.summary}</p>
                {e.start.dateTime && (
                  <p className="text-xs opacity-70 mt-1">
                    {format(new Date(e.start.dateTime), 'HH:mm')} — {format(new Date(e.end.dateTime!), 'HH:mm')}
                  </p>
                )}
                {e.attendees && e.attendees.length > 0 && (
                  <p className="text-xs opacity-60 mt-1">{e.attendees.length} partecipanti</p>
                )}
              </div>
            ))}

            {selectedDayMeetings.map((m) => (
              <div key={m.id} className="p-3 rounded-lg border bg-purple-500/10 text-purple-400 border-purple-500/20">
                <p className="text-sm font-medium">{m.title}</p>
                {m.duration_minutes && (
                  <p className="text-xs opacity-70 mt-1">{m.duration_minutes} minuti</p>
                )}
              </div>
            ))}

            {selectedDayEvents.length === 0 && selectedDayMeetings.length === 0 && (
              <p className="text-xs text-text-secondary">Nessun evento in questo giorno.</p>
            )}
          </div>

          {isGoogleConnected && (
            <button
              onClick={() => { setNewEvent({ ...newEvent, date: format(selectedDay, 'yyyy-MM-dd') }); setShowNewEvent(true) }}
              className="flex items-center gap-2 justify-center px-3 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-sm text-white hover:border-gold/40 transition-colors"
            >
              <Plus className="w-4 h-4 text-gold" />
              Aggiungi evento
            </button>
          )}
        </div>
      )}

      {/* New event modal */}
      {showNewEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-6 w-[420px] space-y-4">
            <h3 className="text-lg font-bold text-white">Nuovo evento Google Calendar</h3>

            <input
              value={newEvent.title}
              onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
              placeholder="Titolo evento"
              className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-secondary outline-none focus:border-gold/40"
            />
            <input
              type="date"
              value={newEvent.date}
              onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
              className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-gold/40"
            />
            <div className="flex gap-3">
              <input
                type="time"
                value={newEvent.startTime}
                onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                className="flex-1 bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-gold/40"
              />
              <input
                type="time"
                value={newEvent.endTime}
                onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                className="flex-1 bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-gold/40"
              />
            </div>
            <textarea
              value={newEvent.description}
              onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
              placeholder="Descrizione (opzionale)"
              rows={3}
              className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-secondary outline-none focus:border-gold/40 resize-none"
            />

            <div className="flex gap-3">
              <button onClick={() => setShowNewEvent(false)} className="flex-1 py-2 border border-[#2A2A2A] rounded-lg text-sm text-text-secondary hover:text-white transition-colors">
                Annulla
              </button>
              <button onClick={saveEvent} disabled={saving || !newEvent.title || !newEvent.date} className="flex-1 py-2 bg-gold text-black rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-gold/90 transition-colors">
                {saving ? 'Salvataggio...' : 'Crea evento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
