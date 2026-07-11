'use client'

import { useState } from 'react'
import { format, addDays } from 'date-fns'
import { X, Users, ChevronRight } from 'lucide-react'
import type { Profile } from '@/lib/types/database'

// Form evento unico (Fase 2a), condiviso tra Calendario admin/workspace e
// Appuntamenti progetto (§8.2). Estratto da EventEditorModal. I nuovi campi
// (timezone, ricorrenza, promemoria, cliente/progetto) arrivano in 2b col backend.
export interface EventForm {
  id: string | null          // null = nuovo, valorizzato = modifica
  title: string
  allDay: boolean
  date: string
  endDate: string
  startTime: string
  endTime: string
  location: string
  description: string
  addMeet: boolean
  meetLink: string | null
  attendeeIds: string[]
  attendeeEmails: string[]
  // Fase 2b (opzionali: default gestiti nel form)
  timezone?: string
  recurrence?: string          // RRULE, es. 'RRULE:FREQ=WEEKLY'
  reminderMinutes?: number | null
  clientId?: string | null
  projectId?: string | null
}

const TIMEZONES = ['Europe/Rome', 'Europe/London', 'Europe/Paris', 'UTC', 'America/New_York']
const RECURRENCE_OPTS: { v: string; label: string }[] = [
  { v: '', label: 'Non si ripete' },
  { v: 'RRULE:FREQ=DAILY', label: 'Ogni giorno' },
  { v: 'RRULE:FREQ=WEEKLY', label: 'Ogni settimana' },
  { v: 'RRULE:FREQ=MONTHLY', label: 'Ogni mese' },
]
const REMINDER_OPTS: { v: string; label: string }[] = [
  { v: '', label: 'Nessuno' },
  { v: '10', label: '10 min prima' },
  { v: '30', label: '30 min prima' },
  { v: '60', label: '1 ora prima' },
  { v: '1440', label: '1 giorno prima' },
]

export function CalendarEventForm({ form: initial, profiles, currentUserId, onClose, onSaved }: {
  form: EventForm
  profiles: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
  currentUserId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<EventForm>(initial)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showGuests, setShowGuests] = useState(false)
  const isEdit = form.id !== null
  const set = <K extends keyof EventForm>(k: K, v: EventForm[K]) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.title || !form.date) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        title: form.title, description: form.description, location: form.location,
        allDay: form.allDay, addMeet: form.addMeet,
        attendeeIds: form.attendeeIds, attendeeEmails: form.attendeeEmails,
        timezone: form.timezone || 'Europe/Rome',
        recurrence: form.recurrence || undefined,
        reminders: form.reminderMinutes != null ? [{ method: 'popup', minutes: form.reminderMinutes }] : undefined,
        clientId: form.clientId ?? undefined,
        projectId: form.projectId ?? undefined,
      }
      if (form.allDay) {
        const endExclusive = addDays(new Date((form.endDate || form.date) + 'T00:00:00'), 1)
        payload.start = form.date
        payload.end = format(endExclusive, 'yyyy-MM-dd')
      } else {
        payload.start = new Date(`${form.date}T${form.startTime}:00`).toISOString()
        payload.end = new Date(`${form.date}T${form.endTime}:00`).toISOString()
      }
      if (isEdit) payload.eventId = form.id
      const res = await fetch('/api/google/events', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      onSaved()
    } catch { setSaving(false) }
  }

  const remove = async () => {
    if (!form.id) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/google/events?eventId=${encodeURIComponent(form.id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      onSaved()
    } catch { setDeleting(false) }
  }

  const toggleGuest = (id: string) =>
    set('attendeeIds', form.attendeeIds.includes(id)
      ? form.attendeeIds.filter(x => x !== id)
      : [...form.attendeeIds, id])

  const guestCount = form.attendeeIds.length + form.attendeeEmails.length
  const inputCls = 'w-full bg-overlay/[0.03] border border-overlay/[0.08] rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-overlay/20 outline-none focus:border-gold/40'

  return (
    <div className="fixed inset-0 bg-scrim backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-strong rounded-2xl p-6 w-[460px] max-h-[90vh] overflow-y-auto space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-primary font-heading">{isEdit ? 'Modifica evento' : 'Nuovo evento'}</h3>
          <button onClick={onClose} aria-label="Chiudi" className="text-overlay/30 hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>

        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Aggiungi titolo" className={inputCls} autoFocus />

        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input type="checkbox" checked={form.allDay} onChange={e => set('allDay', e.target.checked)} className="accent-gold w-3.5 h-3.5" />
          Tutto il giorno
        </label>

        <div className="flex gap-2 items-center">
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={inputCls} aria-label="Data" />
          {form.allDay
            ? <input type="date" value={form.endDate} min={form.date} onChange={e => set('endDate', e.target.value)} className={inputCls} aria-label="Data fine" />
            : <>
                <input type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} className={inputCls} aria-label="Ora inizio" />
                <input type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} className={inputCls} aria-label="Ora fine" />
              </>}
        </div>

        {/* Invitati */}
        <div className="relative">
          <button onClick={() => setShowGuests(v => !v)} className={`${inputCls} flex items-center justify-between text-left`}>
            <span className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-text-tertiary" />
              {guestCount ? `${guestCount} invitati` : 'Aggiungi invitati'}</span>
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showGuests ? 'rotate-90' : ''}`} />
          </button>
          {showGuests && (
            <div className="mt-1 rounded-xl border border-border bg-surface p-2 max-h-48 overflow-y-auto space-y-0.5">
              {profiles.filter(p => p.id !== currentUserId).map(p => (
                <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-surface-hover">
                  <input type="checkbox" checked={form.attendeeIds.includes(p.id)} onChange={() => toggleGuest(p.id)} className="accent-gold w-3.5 h-3.5" />
                  <span className="text-xs text-text-primary truncate">{p.full_name}</span>
                </label>
              ))}
              {form.attendeeEmails.length > 0 && (
                <p className="text-2xs text-text-tertiary px-2 pt-1">Già invitati: {form.attendeeEmails.join(', ')}</p>
              )}
            </div>
          )}
        </div>

        <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Aggiungi luogo" className={inputCls} />

        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input type="checkbox" checked={form.addMeet} onChange={e => set('addMeet', e.target.checked)} className="accent-gold w-3.5 h-3.5" />
          Aggiungi videoconferenza Google Meet
        </label>
        {form.meetLink && (
          <a href={form.meetLink} target="_blank" rel="noopener noreferrer" className="block text-2xs text-info hover:underline truncate">{form.meetLink}</a>
        )}

        <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Aggiungi descrizione"
          rows={3} className={`${inputCls} resize-none`} />

        {/* Fase 2b: fuso, ricorrenza, promemoria */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-2xs text-text-tertiary mb-1">Fuso</label>
            <select value={form.timezone ?? 'Europe/Rome'} onChange={e => set('timezone', e.target.value)} className={inputCls} aria-label="Fuso orario">
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-2xs text-text-tertiary mb-1">Ricorrenza</label>
            <select value={form.recurrence ?? ''} onChange={e => set('recurrence', e.target.value)} className={inputCls} aria-label="Ricorrenza">
              {RECURRENCE_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-2xs text-text-tertiary mb-1">Promemoria</label>
            <select value={form.reminderMinutes != null ? String(form.reminderMinutes) : ''}
              onChange={e => set('reminderMinutes', e.target.value ? Number(e.target.value) : null)} className={inputCls} aria-label="Promemoria">
              {REMINDER_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          {isEdit && (
            <button onClick={remove} disabled={deleting || saving}
              className="px-3 py-2 border border-error/30 text-error rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-error/10 transition-colors">
              {deleting ? 'Elimino…' : 'Elimina'}
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2 border border-overlay/[0.08] rounded-xl text-sm text-overlay/40 hover:text-text-primary transition-colors">Annulla</button>
          <button onClick={save} disabled={saving || deleting || !form.title || !form.date}
            className="flex-1 py-2 bg-gold text-on-gold rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-gold/90 transition-colors">
            {saving ? 'Salvo…' : isEdit ? 'Salva' : 'Crea evento'}
          </button>
        </div>
      </div>
    </div>
  )
}
