'use client'

import { useState, useEffect, useMemo } from 'react'
import { Calendar, Loader2, Link as LinkIcon, RefreshCw, Plus, MapPin, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { Project, Client, Profile } from '@/lib/types/database'
import { CalendarEventForm, type EventForm } from '@/components/calendario/CalendarEventForm'
import { matchEventToContext, type MatchLevel } from '@/lib/calendar-match'
import { clientName as displayName } from '@/lib/utils'
import { isoLocal } from '@/lib/workload'

export interface GCalEvent {
  id: string; summary?: string; start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }; location?: string
  description?: string; htmlLink?: string; attendees?: { email: string; displayName?: string }[]
}

// D13 — finestra 20 giorni, matching OR (nome progetto O nome cliente) normalizzato:
// nel calendario reale i titoli sono "Review Seven - Two Bee", mai "CRM Adamo".
const WINDOW_DAYS = 20

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
      const timeMax = new Date(Date.now() + WINDOW_DAYS * 86400000).toISOString()
      const r = await fetch(`/api/google/events?timeMin=${timeMin}&timeMax=${timeMax}`)
      const data = await r.json()
      const evs = (data.events ?? []) as GCalEvent[]
      // "non collegato" solo se Google non ha restituito nulla: notContected può
      // elencare i colleghi senza token, non me.
      if ((data.error === 'not_connected' || data.setupRequired) && evs.length === 0) setConnected(false)
      else { setConnected(true); setEvents(evs) }
    } catch { setConnected(false) }
    setLoading(false)
  }

  useEffect(() => { fetchEvents() }, [])

  const openCreate = () => {
    const d = isoLocal(new Date())
    setEditorEvent({
      id: null, title: `Call ${project.name}`, allDay: false,
      date: d, endDate: d, startTime: '09:00', endTime: '10:00',
      location: '', description: `Progetto: ${project.name} — ${displayName(client)}`,
      addMeet: false, meetLink: null, attendeeIds: [], attendeeEmails: [],
      timezone: 'Europe/Rome', clientId: client.id, projectId: project.id,
    })
  }

  const cName = displayName(client)
  const upcoming = useMemo(() => {
    const out: { ev: GCalEvent; when: Date; level: MatchLevel }[] = []
    for (const ev of events) {
      const raw = `${ev.summary ?? ''} ${ev.description ?? ''}`
      const byProject = matchEventToContext(raw, { projectName: project.name })
      const byClient  = matchEventToContext(raw, { clientName: cName })
      const level: MatchLevel =
        byProject === 'sicuro' || byClient === 'sicuro' ? 'sicuro'
        : byProject === 'suggerito' || byClient === 'suggerito' ? 'suggerito'
        : 'no'
      if (level === 'no') continue
      const s = ev.start?.dateTime ?? ev.start?.date
      if (!s) continue
      out.push({ ev, when: new Date(s), level })
    }
    return out.sort((a, b) => a.when.getTime() - b.when.getTime())
  }, [events, project.name, cName])

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-16 text-text-tertiary">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-xs">Carico calendario…</span>
    </div>
  )

  if (connected === false) return (
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

  const today = isoLocal(new Date())
  const tomorrow = isoLocal(new Date(Date.now() + 86400000))

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">
            {upcoming.length} appuntamenti · {WINDOW_DAYS} giorni · {project.name} o {cName}
          </span>
          <button onClick={fetchEvents} aria-label="Ricarica il calendario"
            className="p-1 text-text-tertiary hover:text-text-primary transition-colors">
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
        <div className="flex flex-col items-center gap-3 py-12 text-center border border-dashed border-border rounded-2xl px-6">
          <Calendar className="w-8 h-8 text-text-tertiary" />
          <div>
            <p className="text-sm font-semibold text-text-tertiary">
              {events.length === 0
                ? `Nessun evento in calendario nei prossimi ${WINDOW_DAYS} giorni`
                : `Nessuno dei ${events.length} eventi letti risulta collegato a questo progetto`}
            </p>
            {events.length > 0 && (
              <p className="text-2xs text-text-tertiary mt-1 max-w-sm">
                Un evento entra qui se il titolo (o la descrizione) cita <b>{project.name}</b> o <b>{cName}</b>.
              </p>
            )}
            {isAdmin && <button onClick={openCreate} className="text-xs mt-2 font-bold" style={{ color: accent }}>+ Crea evento</button>}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map(({ ev: e, when: dt, level }) => {
            const day = isoLocal(dt)
            const isToday = day === today
            const isTomorrow = day === tomorrow
            const dayLabel = isToday ? 'Oggi' : isTomorrow ? 'Domani' : dt.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })
            const timeLabel = e.start?.dateTime ? dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''

            return (
              <div key={e.id} className="group flex items-start gap-3 p-3 border border-border rounded-xl bg-background">
                <div className="shrink-0 w-11 flex flex-col items-center text-center pt-0.5">
                  <span className="text-2xs font-bold uppercase tracking-wider"
                    style={{ color: isToday ? 'var(--color-success)' : isTomorrow ? accent : 'var(--color-text-tertiary)' }}>
                    {isToday ? 'OGGI' : isTomorrow ? 'DOM.' : dt.toLocaleDateString('it-IT', { month: 'short' }).toUpperCase()}
                  </span>
                  <span className="text-xl font-black leading-tight" style={{ color: isToday ? 'var(--color-success)' : 'var(--color-text-primary)' }}>
                    {String(dt.getDate()).padStart(2, '0')}
                  </span>
                  {timeLabel && <span className="text-2xs text-text-tertiary mt-0.5">{timeLabel}</span>}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-text-primary leading-tight truncate">{e.summary ?? 'Evento senza titolo'}</p>
                    {level === 'suggerito' && (
                      <span className="text-2xs px-1.5 py-0.5 rounded-full bg-warning-dim text-warning shrink-0"
                        title="Match incerto: verifica che sia davvero di questo progetto">
                        da verificare
                      </span>
                    )}
                  </div>
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
                  <a href={e.htmlLink} target="_blank" rel="noopener noreferrer" aria-label="Apri nel calendario"
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
