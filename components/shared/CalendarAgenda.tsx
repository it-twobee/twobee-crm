'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Loader2, MapPin, Link as LinkIcon, AlertCircle } from 'lucide-react'
import { matchEventToContext, type MatchLevel } from '@/lib/calendar-match'

// Agenda reale dal calendario, condivisa fra dominio cliente e dominio progetto (§16).
// Gli eventi si collegano per NOME (cliente OR progetto) con matching normalizzato:
// nel calendario reale i titoli sono tipo "Review Seven - Two Bee", non "CRM Adamo".

export interface GEvent {
  id: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  location?: string
  description?: string
  htmlLink?: string
}

export interface AgendaNote { id: string; title: string; date: string }

export function CalendarAgenda({
  clientName, projectNames = [], notes = [], upcomingDays = 60, pastDays = 60, compact = false,
}: {
  clientName: string
  /** Nomi dei progetti: un evento che li cita è del cliente anche senza il suo nome. */
  projectNames?: string[]
  /** Incontri registrati a mano (meeting_notes): si fondono con quelli passati. */
  notes?: AgendaNote[]
  upcomingDays?: number
  pastDays?: number
  compact?: boolean
}) {
  const [events, setEvents] = useState<GEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(true)

  const maxDays = Math.max(upcomingDays, pastDays)
  useEffect(() => {
    const run = async () => {
      try {
        const timeMin = new Date(Date.now() - pastDays * 86400000).toISOString()
        const timeMax = new Date(Date.now() + upcomingDays * 86400000).toISOString()
        const r = await fetch(`/api/google/events?timeMin=${timeMin}&timeMax=${timeMax}`)
        const data = await r.json()
        const evs = (data.events ?? []) as GEvent[]
        if ((data.error === 'not_connected' || data.setupRequired) && evs.length === 0) setConnected(false)
        setEvents(evs)
      } catch { setConnected(false) } finally { setLoading(false) }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDays])

  const mine = useMemo(() => {
    const out: { ev: GEvent; when: Date; level: MatchLevel; project?: string }[] = []
    for (const ev of events) {
      const raw = `${ev.summary ?? ''} ${ev.description ?? ''}`
      let level = matchEventToContext(raw, { clientName })
      let project: string | undefined
      for (const pn of projectNames) {
        const l = matchEventToContext(raw, { projectName: pn })
        if (l === 'sicuro') { level = 'sicuro'; project = pn; break }
        if (l === 'suggerito' && level === 'no') { level = 'suggerito'; project = pn }
      }
      if (level === 'no') continue
      const s = ev.start?.dateTime ?? ev.start?.date
      if (!s) continue
      out.push({ ev, when: new Date(s), level, project })
    }
    return out
  }, [events, clientName, projectNames])

  const now = new Date()
  const upLimit = new Date(Date.now() + upcomingDays * 86400000)
  const upcoming = mine.filter(x => x.when >= now && x.when <= upLimit).sort((a, b) => a.when.getTime() - b.when.getTime())
  const past = mine.filter(x => x.when < now).sort((a, b) => b.when.getTime() - a.when.getTime())
  const pastNotes = notes.filter(n => new Date(n.date) < now)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className={compact ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
      <AgendaCard title="Prossimi appuntamenti" icon={<Calendar className="w-3.5 h-3.5 text-gold-text" />}
        subtitle={`calendario · ${upcomingDays} giorni`}>
        {loading ? <Loading /> : !connected ? <NotConnected /> : upcoming.length === 0 ? (
          <Empty text={events.length === 0
            ? `Nessun evento nel calendario in questo periodo.`
            : `Nessuno dei ${events.length} eventi letti risulta collegato a ${clientName}. Metti il nome del cliente o del progetto nel titolo dell'evento.`} />
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.slice(0, 8).map(x => <EventRow key={x.ev.id} x={x} />)}
          </ul>
        )}
      </AgendaCard>

      <AgendaCard title="Ultimi incontri" icon={<Clock className="w-3.5 h-3.5 text-text-secondary" />}
        subtitle={`calendario · ${pastDays} giorni`}>
        {loading ? <Loading /> : past.length === 0 && pastNotes.length === 0 ? (
          <Empty text="Nessun incontro registrato." />
        ) : (
          <ul className="divide-y divide-border">
            {past.slice(0, 6).map(x => <EventRow key={x.ev.id} x={x} past />)}
            {pastNotes.slice(0, 3).map(n => (
              <li key={n.id} className="px-4 py-2.5">
                <p className="text-sm text-text-primary truncate">{n.title}</p>
                <p className="text-2xs text-text-tertiary">
                  {new Date(n.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })} · nota interna
                </p>
              </li>
            ))}
          </ul>
        )}
      </AgendaCard>
    </div>
  )
}

function EventRow({ x, past = false }: { x: { ev: GEvent; when: Date; level: MatchLevel; project?: string }; past?: boolean }) {
  const { ev, when, level, project } = x
  const timed = !!ev.start?.dateTime
  return (
    <li className="px-4 py-2.5 flex items-start gap-3">
      <div className="shrink-0 w-10 text-center">
        <p className={`text-2xs font-bold uppercase ${past ? 'text-text-tertiary' : 'text-gold-text'}`}>
          {when.toLocaleDateString('it-IT', { month: 'short' })}
        </p>
        <p className="text-base font-black text-text-primary leading-none">{String(when.getDate()).padStart(2, '0')}</p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-text-primary truncate">{ev.summary ?? 'Evento senza titolo'}</p>
          {level === 'suggerito' && (
            <span className="text-2xs px-1.5 py-0.5 rounded-full bg-warning-dim text-warning shrink-0" title="Match incerto: verifica che sia di questo cliente">
              da verificare
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-2xs text-text-tertiary mt-0.5">
          {timed && <span>{when.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>}
          {project && <span className="truncate">· {project}</span>}
          {ev.location && <span className="flex items-center gap-0.5 truncate"><MapPin className="w-2.5 h-2.5" /> {ev.location}</span>}
        </div>
      </div>
      {ev.htmlLink && (
        <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" aria-label="Apri nel calendario"
          className="shrink-0 p-1 text-text-tertiary hover:text-gold-text transition-colors">
          <LinkIcon className="w-3.5 h-3.5" />
        </a>
      )}
    </li>
  )
}

function AgendaCard({ title, subtitle, icon, children }: {
  title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        {icon}
        <span className="text-xs font-bold text-text-primary uppercase tracking-wider">{title}</span>
        <span className="ml-auto text-2xs text-text-tertiary">{subtitle}</span>
      </div>
      {children}
    </div>
  )
}

const Loading = () => (
  <div className="flex items-center justify-center gap-2 py-8 text-text-tertiary">
    <Loader2 className="w-4 h-4 animate-spin" /> <span className="text-xs">Leggo il calendario…</span>
  </div>
)
const Empty = ({ text }: { text: string }) => <p className="px-4 py-6 text-sm text-text-tertiary text-center">{text}</p>
const NotConnected = () => (
  <div className="px-4 py-6 text-center">
    <AlertCircle className="w-5 h-5 text-warning mx-auto mb-1.5" />
    <p className="text-xs text-text-secondary">Google Calendar non collegato a questo account.</p>
    <p className="text-2xs text-text-tertiary mt-0.5">Collegalo dal Calendario (serve un account @twobee.it).</p>
  </div>
)
