'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarPlus, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { usePathname } from 'next/navigation'
import type { SalesFollowUp } from '@/lib/sales-follow-up'

type Draft = { requestId: string; title: string; date: string; duration: number; invite: boolean; event?: SalesFollowUp }
const inputClass = 'w-full rounded-lg border border-border-interactive bg-background px-3 py-2 text-sm text-text-primary'
const buttonClass = 'rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover disabled:opacity-50'

function localDate(iso: string) {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function SalesFollowUps({ dealId, company, email }: { dealId: string; company: string; email: string | null }) {
  const [events, setEvents] = useState<SalesFollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [history, setHistory] = useState(false)
  const [timezone, setTimezone] = useState('Europe/Rome')
  const inFlight = useRef(false)
  const pathname = usePathname()

  async function load(signal?: AbortSignal) {
    setLoading(true); setLoadError(''); setCode('')
    try {
      const res = await fetch(`/api/sales/follow-up?dealId=${encodeURIComponent(dealId)}`, { cache: 'no-store', signal })
      const data = await res.json()
      if (!res.ok) { setCode(data.code ?? ''); throw new Error(data.error || 'Caricamento non riuscito') }
      if (!signal?.aborted) setEvents(data.events)
    } catch (e) {
      if (!signal?.aborted) setLoadError(e instanceof Error ? e.message : 'Caricamento non riuscito')
    } finally { if (!signal?.aborted) setLoading(false) }
  }

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [dealId])

  function edit(event?: SalesFollowUp) {
    setError(''); setCancelId(null)
    setDraft({ requestId: crypto.randomUUID(), title: event?.title ?? `Follow-up · ${company}`,
      date: event ? localDate(event.start) : '', duration: event ? Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60_000) : 30,
      invite: !!event?.invitedEmail, event })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const date = new Date(draft.date)
      if (!Number.isFinite(date.getTime()) || localDate(date.toISOString()) !== draft.date) throw new Error('Data o ora non valida nel tuo fuso orario')
      const res = await fetch('/api/sales/follow-up', { method: draft.event ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, requestId: draft.requestId, title: draft.title, start: date.toISOString(),
          duration: draft.duration, timezone, inviteContact: draft.invite, eventId: draft.event?.id, etag: draft.event?.etag }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Salvataggio non riuscito')
      setEvents(previous => [...previous.filter(x => x.id !== data.event.id), data.event].sort((a, b) => a.start.localeCompare(b.start)))
      setDraft(null)
      if (data.warning) toast.warning(data.warning)
      else toast.success('Follow-up salvato nel tuo Google Calendar')
    } catch (e) { setError(e instanceof Error ? e.message : 'Invio non riuscito. Riprova: il modulo è conservato.') }
    finally { inFlight.current = false; setBusy(false) }
  }

  async function remove(event: SalesFollowUp) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const res = await fetch('/api/sales/follow-up', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, eventId: event.id, etag: event.etag }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Annullamento non riuscito')
      setEvents(previous => previous.filter(x => x.id !== event.id)); setCancelId(null)
      if (draft?.event?.id === event.id) setDraft(null)
      if (data.warning) toast.warning(data.warning)
      else toast.success('Appuntamento annullato')
    } catch (e) { setError(e instanceof Error ? e.message : 'Annullamento non riuscito') }
    finally { inFlight.current = false; setBusy(false) }
  }

  const upcoming = events.filter(e => Date.parse(e.end) >= Date.now())
  const shown = history ? events : upcoming

  return <section className="rounded-xl border border-border p-3 space-y-3" aria-label="Follow-up commerciali">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-text-primary">I tuoi follow-up</h3>
      <button type="button" onClick={() => void load()} disabled={loading || busy} aria-label="Aggiorna i follow-up" className={buttonClass}>
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
    <p className="text-2xs text-text-tertiary">Nel tuo calendario Google personale. Fuso orario: {timezone}.</p>
    {loadError && <div role="status" className="text-sm text-warning space-y-2">
      <p>{loadError}</p>
      {code === 'not_connected' && <a className="inline-block text-gold-text underline" href={`/api/google/auth?returnTo=${encodeURIComponent(pathname)}`}>Collega Google Calendar</a>}
      {code === 'google_not_configured' && <p className="text-2xs">Un amministratore deve configurare le credenziali Google del gestionale.</p>}
    </div>}
    {!loading && !loadError && <>
      {!shown.length && <p className="text-sm text-text-secondary">{history ? 'Nessun follow-up pianificato.' : 'Nessun prossimo follow-up.'}</p>}
      {shown.map(event => <div key={event.id} className="rounded-lg bg-surface-hover p-3 space-y-2">
        <p className="text-sm font-semibold text-text-primary break-words">{event.title}</p>
        <p className="text-2xs text-text-secondary">{new Date(event.start).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        {event.invitedEmail && <p className="text-2xs text-text-secondary break-all">Invitato: {event.invitedEmail}</p>}
        <div className="flex gap-2 flex-wrap">
          {event.editable && <button type="button" disabled={busy} onClick={() => edit(event)} className={buttonClass}>Modifica</button>}
          {event.editable && <button type="button" disabled={busy} onClick={() => setCancelId(event.id)} className={buttonClass}>Annulla appuntamento</button>}
          {event.url && <a href={event.url} target="_blank" rel="noopener noreferrer" className={`${buttonClass} inline-flex items-center gap-1`}><ExternalLink className="h-3 w-3" />Google Calendar</a>}
        </div>
        {!event.editable && <p className="text-2xs text-text-secondary">Evento ricorrente o a giornata intera: gestiscilo da Google Calendar.</p>}
        {cancelId === event.id && <div className="space-y-2 text-sm text-text-secondary">
          <p>Annullare l’appuntamento? Gli eventuali invitati riceveranno l’annullamento.</p>
          <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void remove(event)} className={buttonClass}>Conferma annullamento</button>
            <button type="button" disabled={busy} onClick={() => setCancelId(null)} className={buttonClass}>Mantieni</button></div>
        </div>}
      </div>)}
      {events.length > upcoming.length && <button type="button" onClick={() => setHistory(v => !v)} className="text-2xs text-gold-text underline">{history ? 'Solo prossimi appuntamenti' : 'Mostra anche i precedenti'}</button>}
      {!draft && <button type="button" onClick={() => edit()} className="flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-on-gold">
        <CalendarPlus className="h-4 w-4" />Pianifica follow-up
      </button>}
    </>}
    {draft && <form onSubmit={save} className="space-y-3 border-t border-border pt-3">
      <label className="block text-2xs text-text-secondary">Titolo
        <input required maxLength={200} value={draft.title} disabled={busy} onChange={e => setDraft({ ...draft, title: e.target.value })} className={`${inputClass} mt-1`} />
      </label>
      <label className="block text-2xs text-text-secondary">Data e ora
        <input type="datetime-local" required value={draft.date} disabled={busy} onChange={e => setDraft({ ...draft, date: e.target.value })} className={`${inputClass} mt-1`} />
      </label>
      <label className="block text-2xs text-text-secondary">Durata in minuti
        <input type="number" required min={5} max={1440} value={draft.duration} disabled={busy} onChange={e => setDraft({ ...draft, duration: Number(e.target.value) })} className={`${inputClass} mt-1`} />
      </label>
      <label className="flex items-start gap-2 text-sm text-text-secondary">
        <input type="checkbox" checked={draft.invite} disabled={busy || (!email && !draft.invite)} onChange={e => setDraft({ ...draft, invite: e.target.checked })} className="mt-1" />
        <span>Invita il contatto{email ? <span className="block text-2xs break-all">{email}</span> : <span className="block text-2xs">Aggiungi prima l’email nella scheda.</span>}</span>
      </label>
      <p className="text-2xs text-text-tertiary">Il titolo sarà visibile agli invitati. Le note interne del lead non vengono inviate.</p>
      {draft.event?.invitedEmail && <p className="text-2xs text-text-secondary">Gli invitati riceveranno gli aggiornamenti. Deselezionando il contatto, il suo invito verrà annullato.</p>}
      <div className="flex gap-2 flex-wrap">
        <button type="submit" disabled={busy || !!loadError} className="flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-sm font-semibold text-on-gold disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}{draft.event ? 'Salva modifiche' : 'Salva follow-up'}
        </button>
        <button type="button" disabled={busy} onClick={() => { setDraft(null); setError('') }} className={buttonClass}>Chiudi modulo</button>
      </div>
    </form>}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
  </section>
}
