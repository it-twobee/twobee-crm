'use client'

import { useState, useEffect } from 'react'
import { Calendar, Loader2, Link as LinkIcon, RefreshCw, Plus, MapPin, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { Project, Client, Profile } from '@/lib/types/database'
import { CalendarEventForm, type EventForm } from '@/components/calendario/CalendarEventForm'

export interface GCalEvent {
  id: string; summary?: string; start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }; location?: string
  description?: string; htmlLink?: string; attendees?: { email: string; displayName?: string }[]
}

export function AppointmentsSection({ accent, isAdmin, project, client, profiles, currentUserId }: {
  accent: string; isAdmin: boolean; project: Project; client: Client
  profiles: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]; currentUserId: string
}) {
  const [events, setEvents]       = useState<GCalEvent[]>([])
  const [connected, setConnected] = useState<boolean | null>(null)
  const [loading, setLoading]     = useState(true)
  const [editorEvent, setEditorEvent] = useState<EventForm | null>(null)

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const timeMin = new Date().toISOString()
      const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
      const r = await fetch(`/api/google/events?timeMin=${timeMin}&timeMax=${timeMax}`)
      const data = await r.json()
      if (data.error === 'not_connected') { setConnected(false) }
      else { setConnected(true); setEvents(data.events ?? []) }
    } catch { setConnected(false) }
    setLoading(false)
  }

  useEffect(() => { fetchEvents() }, [])

  // §16.1: apre il CalendarEventForm condiviso precompilato con cliente/progetto.
  const openCreate = () => {
    const d = new Date().toISOString().slice(0, 10)
    setEditorEvent({
      id: null, title: `Call con ${project.name}`, allDay: false,
      date: d, endDate: d, startTime: '09:00', endTime: '10:00',
      location: '', description: `Progetto: ${project.name} — ${client.company_name}`,
      addMeet: false, meetLink: null, attendeeIds: [], attendeeEmails: [],
      timezone: 'Europe/Rome', clientId: client.id, projectId: project.id,
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const projectName = project.name.toLowerCase()
  const upcoming = events.filter(e => {
    const d = (e.start?.dateTime ?? e.start?.date ?? '')
    const title = (e.summary ?? '').toLowerCase()
    return d >= today && title.includes(projectName)
  })

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-16 text-text-tertiary">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-xs">Carico calendario…</span>
    </div>
  )

  if (!connected) return (
    <div className="flex flex-col items-center gap-4 py-14 text-center px-6">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `color-mix(in srgb, ${accent} 7%, transparent)` }}>
        <Calendar className="w-7 h-7" style={{ color: accent }} />
      </div>
      <div>
        <p className="text-sm font-bold text-text-primary mb-1">Collega Google Calendar</p>
        <p className="text-xs text-text-tertiary leading-relaxed max-w-xs">
          Connetti il tuo account Google per vedere e creare appuntamenti direttamente da qui.
        </p>
      </div>
      <a href="/api/google/auth"
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-on-gold transition-all hover:opacity-90"
        style={{ background: accent }}>
        <LinkIcon className="w-4 h-4" /> Connetti Google Calendar
      </a>
    </div>
  )

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">{upcoming.length} prossimi · 60 giorni</span>
          <button onClick={fetchEvents} className="p-1 text-text-tertiary hover:text-text-primary transition-colors">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        {isAdmin && (
          <button onClick={openCreate}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: `color-mix(in srgb, ${accent} 8%, transparent)`, color: accent, border: `1px solid color-mix(in srgb, ${accent} 19%, transparent)` }}>
            <Plus className="w-3 h-3" /> Nuovo evento
          </button>
        )}
      </div>

      {upcoming.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center border border-dashed border-border rounded-2xl">
          <Calendar className="w-8 h-8 text-text-tertiary" />
          <div>
            <p className="text-sm font-semibold text-text-tertiary">Nessun evento nei prossimi 60 giorni</p>
            {isAdmin && <button onClick={openCreate} className="text-xs mt-1 font-bold" style={{ color: accent }}>+ Crea il primo</button>}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map(e => {
            const startRaw = e.start?.dateTime ?? e.start?.date ?? ''
            const dt = startRaw ? new Date(startRaw) : null
            const isToday = dt?.toISOString().slice(0, 10) === today
            const isTomorrow = dt?.toISOString().slice(0, 10) === new Date(Date.now() + 86400000).toISOString().slice(0, 10)
            const dayLabel = isToday ? 'Oggi' : isTomorrow ? 'Domani' : dt ? dt.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' }) : ''
            const timeLabel = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''

            return (
              <div key={e.id} className="group flex items-start gap-3 p-3 border border-border rounded-xl hover:border-border transition-all bg-background">
                <div className="shrink-0 w-11 flex flex-col items-center text-center pt-0.5">
                  <span className="text-2xs font-bold uppercase tracking-wider"
                    style={{ color: isToday ? 'var(--color-success)' : isTomorrow ? accent : 'var(--color-text-tertiary)' }}>
                    {isToday ? 'OGGI' : isTomorrow ? 'DOM.' : dt?.toLocaleDateString('it-IT', { month: 'short' }).toUpperCase()}
                  </span>
                  <span className="text-xl font-black leading-tight" style={{ color: isToday ? 'var(--color-success)' : 'var(--color-text-primary)' }}>
                    {dt?.getDate().toString().padStart(2, '0')}
                  </span>
                  {timeLabel && <span className="text-2xs text-text-tertiary mt-0.5">{timeLabel}</span>}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary leading-tight">{e.summary ?? 'Evento senza titolo'}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {e.location && (
                      <span className="flex items-center gap-1 text-2xs text-text-tertiary">
                        <MapPin className="w-2.5 h-2.5" /> {e.location}
                      </span>
                    )}
                    {(e.attendees?.length ?? 0) > 0 && (
                      <span className="flex items-center gap-1 text-2xs text-text-tertiary">
                        <Users className="w-2.5 h-2.5" /> {e.attendees!.length} partecipanti
                      </span>
                    )}
                    <span className="text-2xs text-text-tertiary">{dayLabel}</span>
                  </div>
                  {e.description && (
                    <p className="text-2xs text-text-tertiary mt-1 line-clamp-1 leading-relaxed">{e.description}</p>
                  )}
                </div>

                {e.htmlLink && (
                  <a href={e.htmlLink} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface transition-all opacity-0 group-hover:opacity-100">
                    <LinkIcon className="w-3 h-3" />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editorEvent && (
        <CalendarEventForm
          form={editorEvent}
          profiles={profiles}
          currentUserId={currentUserId}
          onClose={() => setEditorEvent(null)}
          onSaved={() => { setEditorEvent(null); fetchEvents(); toast.success('Evento salvato su Google Calendar') }}
        />
      )}
    </>
  )
}
