'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Loader2, MapPin, Link as LinkIcon, AlertCircle } from 'lucide-react'
import type { Client, Project, Sprint, Task, ClientKpi, MeetingNote } from '@/lib/types/database'
import { clientName as displayName } from '@/lib/utils'
import { matchEventToContext, type MatchLevel } from '@/lib/calendar-match'
import { ProgettiAttivi } from './PanoramicaTab'

// §14 — Tab "Progetti attivi": la vista ricca dei progetti (spostata dalla Panoramica)
// + l'agenda REALE del cliente, presa dal calendario (non più dalle sole meeting_notes).

interface GEvent {
  id: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  location?: string
  description?: string
  htmlLink?: string
}

const WINDOW_DAYS = 60

export function ProgettiAttiviTab({ client, projects, sprints, tasks, kpis, meetings, hideEconomics = false }: {
  client: Client
  projects: Project[]
  sprints: Sprint[]
  tasks: Task[]
  kpis: ClientKpi[]
  meetings: MeetingNote[]
  hideEconomics?: boolean
}) {
  return (
    <div className="space-y-6">
      <ClientAgenda client={client} projects={projects} meetings={meetings} />
      <ProgettiAttivi
        projects={projects}
        tasks={tasks}
        sprints={sprints}
        kpis={kpis}
        clientId={client.id}
        hideEconomics={hideEconomics}
      />
    </div>
  )
}

/** Prossimi appuntamenti e ultimi incontri, pescati dal calendario reale (±60 giorni). */
function ClientAgenda({ client, projects, meetings }: {
  client: Client; projects: Project[]; meetings: MeetingNote[]
}) {
  const [events, setEvents] = useState<GEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    const run = async () => {
      try {
        const timeMin = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString()
        const timeMax = new Date(Date.now() + WINDOW_DAYS * 86400000).toISOString()
        const r = await fetch(`/api/google/events?timeMin=${timeMin}&timeMax=${timeMax}`)
        const data = await r.json()
        if (data.error === 'not_connected' || data.notConnected?.length) setConnected(false)
        setEvents((data.events ?? []) as GEvent[])
      } catch { setConnected(false) } finally { setLoading(false) }
    }
    run()
  }, [])

  const cName = displayName(client)
  const projectNames = useMemo(() => projects.map(p => p.name), [projects])

  // Match normalizzato: l'evento è del cliente se combacia col cliente O con un suo progetto.
  const mine = useMemo(() => {
    const out: { ev: GEvent; when: Date; level: MatchLevel; project?: string }[] = []
    for (const ev of events) {
      const raw = `${ev.summary ?? ''} ${ev.description ?? ''}`
      let level = matchEventToContext(raw, { clientName: cName })
      let project: string | undefined
      for (const pn of projectNames) {
        const l = matchEventToContext(raw, { projectName: pn })
        if (l !== 'no' && (l === 'sicuro' || level === 'no')) { level = l === 'sicuro' ? 'sicuro' : level; project = pn }
        if (l === 'sicuro') { level = 'sicuro'; project = pn; break }
      }
      if (level === 'no') continue
      const s = ev.start?.dateTime ?? ev.start?.date
      if (!s) continue
      out.push({ ev, when: new Date(s), level, project })
    }
    return out
  }, [events, cName, projectNames])

  const now = new Date()
  const upcoming = mine.filter(x => x.when >= now).sort((a, b) => a.when.getTime() - b.when.getTime())
  const past = mine.filter(x => x.when < now).sort((a, b) => b.when.getTime() - a.when.getTime())

  // Gli incontri registrati a mano restano: si fondono con quelli del calendario.
  const pastNotes = meetings
    .filter(m => new Date(m.date) < now)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <AgendaCard title="Prossimi appuntamenti" icon={<Calendar className="w-3.5 h-3.5 text-gold-text" />}
        subtitle={`dal calendario · prossimi ${WINDOW_DAYS} giorni`}>
        {loading ? <Loading /> : !connected ? <NotConnected /> : upcoming.length === 0 ? (
          <Empty text={`Nessun appuntamento con ${cName} nei prossimi ${WINDOW_DAYS} giorni.`} />
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.slice(0, 6).map(x => <EventRow key={x.ev.id} x={x} />)}
          </ul>
        )}
      </AgendaCard>

      <AgendaCard title="Ultimi incontri" icon={<Clock className="w-3.5 h-3.5 text-text-secondary" />}
        subtitle={`dal calendario · ultimi ${WINDOW_DAYS} giorni`}>
        {loading ? <Loading /> : past.length === 0 && pastNotes.length === 0 ? (
          <Empty text="Nessun incontro registrato." />
        ) : (
          <ul className="divide-y divide-border">
            {past.slice(0, 5).map(x => <EventRow key={x.ev.id} x={x} past />)}
            {pastNotes.slice(0, 3).map(m => (
              <li key={m.id} className="px-4 py-2.5">
                <p className="text-sm text-text-primary truncate">{m.title}</p>
                <p className="text-2xs text-text-tertiary">
                  {new Date(m.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })} · nota interna
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
            <span className="text-2xs px-1.5 py-0.5 rounded-full bg-warning-dim text-warning shrink-0" title="Match suggerito: verifica che sia davvero di questo cliente">
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
    <p className="text-xs text-text-secondary">Google Calendar non collegato.</p>
    <p className="text-2xs text-text-tertiary mt-0.5">Collegalo dal Calendario per vedere qui gli appuntamenti reali.</p>
  </div>
)
