'use client'

import { useState, useEffect } from 'react'
import { Calendar, Loader2, Link as LinkIcon, RefreshCw, Plus, X, MapPin, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { Project, Client } from '@/lib/types/database'

export interface GCalEvent {
  id: string; summary?: string; start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }; location?: string
  description?: string; htmlLink?: string; attendees?: { email: string; displayName?: string }[]
}

export function AppointmentsSection({ accent, isAdmin, project, client }: {
  accent: string; isAdmin: boolean; project: Project; client: Client
}) {
  const [events, setEvents]       = useState<GCalEvent[]>([])
  const [connected, setConnected] = useState<boolean | null>(null)
  const [loading, setLoading]     = useState(true)
  const [creating, setCreating]   = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm2]          = useState({ title: '', date: '', time: '', endTime: '', location: '', description: '' })

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

  const createEvent = async () => {
    if (!form.title || !form.date) return
    setCreating(true)
    const startTime = form.time || '09:00'
    const endTime = form.endTime || (() => {
      const [h, m] = startTime.split(':').map(Number)
      return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    })()
    const startDT = `${form.date}T${startTime}:00`
    const endDT   = `${form.date}T${endTime}:00`
    const r = await fetch('/api/google/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: form.title, description: form.description || `Progetto: ${project.name} — ${client.company_name}`, start: startDT, end: endDT, location: form.location }),
    })
    const data = await r.json()
    setCreating(false)
    if (data.event) {
      setEvents(prev => [...prev, data.event as GCalEvent].sort((a, b) => (a.start?.dateTime ?? a.start?.date ?? '') < (b.start?.dateTime ?? b.start?.date ?? '') ? -1 : 1))
      setShowForm(false)
      toast.success('Evento creato su Google Calendar')
    } else {
      toast.error('Errore creazione evento')
    }
  }

  const inp = 'w-full bg-[#111] border border-[#2A2A2A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F5C800] placeholder:text-[#333]'

  const today = new Date().toISOString().slice(0, 10)
  const clientName = client.company_name.toLowerCase()
  const upcoming = events.filter(e => {
    const d = (e.start?.dateTime ?? e.start?.date ?? '')
    const title = (e.summary ?? '').toLowerCase()
    return d >= today && title.includes(clientName)
  })

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-16 text-[#333]">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-xs">Carico calendario…</span>
    </div>
  )

  if (!connected) return (
    <div className="flex flex-col items-center gap-4 py-14 text-center px-6">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${accent}12` }}>
        <Calendar className="w-7 h-7" style={{ color: accent }} />
      </div>
      <div>
        <p className="text-sm font-bold text-white mb-1">Collega Google Calendar</p>
        <p className="text-xs text-[#444] leading-relaxed max-w-xs">
          Connetti il tuo account Google per vedere e creare appuntamenti direttamente da qui.
        </p>
      </div>
      <a href="/api/google/auth"
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-black transition-all hover:opacity-90"
        style={{ background: accent }}>
        <LinkIcon className="w-4 h-4" /> Connetti Google Calendar
      </a>
    </div>
  )

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#444]">{upcoming.length} prossimi · 60 giorni</span>
          <button onClick={fetchEvents} className="p-1 text-[#333] hover:text-white transition-colors">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>
            <Plus className="w-3 h-3" /> Nuovo evento
          </button>
        )}
      </div>

      {upcoming.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center border border-dashed border-[#1A1A1A] rounded-2xl">
          <Calendar className="w-8 h-8 text-[#1A1A1A]" />
          <div>
            <p className="text-sm font-semibold text-[#333]">Nessun evento nei prossimi 60 giorni</p>
            {isAdmin && <button onClick={() => setShowForm(true)} className="text-xs mt-1 font-bold" style={{ color: accent }}>+ Crea il primo</button>}
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
              <div key={e.id} className="group flex items-start gap-3 p-3 border border-[#1A1A1A] rounded-xl hover:border-[#2A2A2A] transition-all bg-[#080808]">
                <div className="shrink-0 w-11 flex flex-col items-center text-center pt-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider"
                    style={{ color: isToday ? '#22C55E' : isTomorrow ? accent : '#444' }}>
                    {isToday ? 'OGGI' : isTomorrow ? 'DOM.' : dt?.toLocaleDateString('it-IT', { month: 'short' }).toUpperCase()}
                  </span>
                  <span className="text-xl font-black leading-tight" style={{ color: isToday ? '#22C55E' : 'white' }}>
                    {dt?.getDate().toString().padStart(2, '0')}
                  </span>
                  {timeLabel && <span className="text-[9px] text-[#444] mt-0.5">{timeLabel}</span>}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-tight">{e.summary ?? 'Evento senza titolo'}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {e.location && (
                      <span className="flex items-center gap-1 text-[10px] text-[#444]">
                        <MapPin className="w-2.5 h-2.5" /> {e.location}
                      </span>
                    )}
                    {(e.attendees?.length ?? 0) > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-[#444]">
                        <Users className="w-2.5 h-2.5" /> {e.attendees!.length} partecipanti
                      </span>
                    )}
                    <span className="text-[10px] text-[#222]">{dayLabel}</span>
                  </div>
                  {e.description && (
                    <p className="text-[10px] text-[#333] mt-1 line-clamp-1 leading-relaxed">{e.description}</p>
                  )}
                </div>

                {e.htmlLink && (
                  <a href={e.htmlLink} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 p-1.5 rounded-lg text-[#2A2A2A] hover:text-white hover:bg-white/5 transition-all opacity-0 group-hover:opacity-100">
                    <LinkIcon className="w-3 h-3" />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowForm(false)}>
          <div className="bg-[#0E0E0E] border border-[#2A2A2A] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1A1A1A]">
              <div>
                <h3 className="text-sm font-bold text-white">Nuovo evento Google Calendar</h3>
                <p className="text-[10px] text-[#444] mt-0.5">Verrà aggiunto al tuo calendario principale</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1 text-[#444] hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Titolo *</label>
                <input value={form.title} onChange={e => setForm2(p => ({ ...p, title: e.target.value }))} className={inp} placeholder={`Call con ${project.name}`} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3 sm:col-span-1">
                  <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Data *</label>
                  <input type="date" value={form.date} onChange={e => setForm2(p => ({ ...p, date: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Inizio</label>
                  <input type="time" value={form.time} onChange={e => setForm2(p => ({ ...p, time: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Fine</label>
                  <input type="time" value={form.endTime} onChange={e => setForm2(p => ({ ...p, endTime: e.target.value }))} className={inp} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Luogo / Link</label>
                <input value={form.location} onChange={e => setForm2(p => ({ ...p, location: e.target.value }))} className={inp} placeholder="Google Meet, Sede cliente…" />
              </div>
              <div>
                <label className="block text-[10px] text-[#444] mb-1.5 uppercase tracking-wider">Descrizione</label>
                <textarea value={form.description} onChange={e => setForm2(p => ({ ...p, description: e.target.value }))} rows={2} className={`${inp} resize-none`} placeholder="Agenda, argomenti…" />
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-[#2A2A2A] rounded-xl text-sm text-[#555] hover:text-white">Annulla</button>
              <button onClick={createEvent} disabled={creating || !form.title || !form.date}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: accent }}>
                {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Crea su Calendar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
