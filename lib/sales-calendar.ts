import { createHash } from 'node:crypto'
import type { calendar_v3 } from 'googleapis'
import { FollowUpError, type FollowUpInput, type SalesFollowUp } from './sales-follow-up'

type Events = calendar_v3.Resource$Events
type Event = calendar_v3.Schema$Event

export function googleStatus(error: unknown): number {
  const e = error as { code?: number; response?: { status?: number } }
  return Number(e?.response?.status ?? e?.code ?? 0)
}

export function followUpEventKey(actor: string, deal: string, request: string): string {
  return 'tb' + createHash('sha256').update(`${actor}:${deal}:${request}`).digest('hex')
}

export function isLinkedFollowUp(e: Event, actor: string, dealId: string): boolean {
  const p = e.extendedProperties?.private
  return e.status !== 'cancelled' && p?.twobeeActor === actor && p?.twobeeDeal === dealId
}

export function presentFollowUp(e: Event): SalesFollowUp {
  const invited = e.extendedProperties?.private?.twobeeInvite
  return { id: e.id!, etag: e.etag ?? '', title: e.summary ?? 'Follow-up', start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '', url: e.htmlLink?.startsWith('https://calendar.google.com/') ? e.htmlLink : null,
    invitedEmail: invited && e.attendees?.some(a => a.email?.toLowerCase() === invited.toLowerCase()) ? invited : null,
    editable: !!e.start?.dateTime && !!e.end?.dateTime && !e.recurrence?.length && !e.recurringEventId }
}

export async function listFollowUps(events: Events, actor: string, dealId: string): Promise<SalesFollowUp[]> {
  const out: SalesFollowUp[] = []
  let pageToken: string | undefined
  do {
    const { data } = await events.list({ calendarId: 'primary', privateExtendedProperty: [`twobeeActor=${actor}`, `twobeeDeal=${dealId}`],
      maxResults: 250, pageToken, showDeleted: false })
    for (const e of data.items ?? []) if (e.id && isLinkedFollowUp(e, actor, dealId)) out.push(presentFollowUp(e))
    pageToken = data.nextPageToken ?? undefined
  } while (pageToken)
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

async function linkedEvent(events: Events, actor: string, dealId: string, eventId: string) {
  const { data } = await events.get({ calendarId: 'primary', eventId })
  if (!isLinkedFollowUp(data, actor, dealId)) throw new FollowUpError('Appuntamento non accessibile da questo lead', 404)
  return data
}

export async function saveFollowUp(events: Events, actor: string, input: FollowUpInput, email: string | null): Promise<Event> {
  const end = new Date(Date.parse(input.start) + input.duration * 60_000).toISOString()
  const body: Event = { summary: input.title, start: { dateTime: input.start, timeZone: input.timezone },
    end: { dateTime: end, timeZone: input.timezone } }
  if (input.eventId) {
    const current = await linkedEvent(events, actor, input.dealId, input.eventId)
    if (!presentFollowUp(current).editable) throw new FollowUpError('Modifica questo appuntamento da Google Calendar')
    if (current.etag !== input.etag) throw new FollowUpError('L’appuntamento è cambiato. Aggiorna l’elenco prima di modificarlo.', 409)
    const previous = current.extendedProperties?.private?.twobeeInvite
    const attendees = (current.attendees ?? []).filter(a => !previous || a.email?.toLowerCase() !== previous.toLowerCase())
    if (email && !attendees.some(a => a.email?.toLowerCase() === email.toLowerCase())) attendees.push({ email })
    body.attendees = attendees
    body.extendedProperties = { private: { ...current.extendedProperties?.private, twobeeInvite: email ?? '' } }
    const { data } = await events.patch({ calendarId: 'primary', eventId: input.eventId, requestBody: body,
      sendUpdates: (current.attendees?.length || attendees.length) ? 'all' : 'none' }, { headers: { 'If-Match': input.etag! } })
    return data
  }
  const id = followUpEventKey(actor, input.dealId, input.requestId)
  const fingerprint = createHash('sha256').update(JSON.stringify({ ...body, email })).digest('hex')
  body.id = id
  body.attendees = email ? [{ email }] : []
  body.extendedProperties = { private: { twobeeActor: actor, twobeeDeal: input.dealId,
    twobeeRequest: input.requestId, twobeeFingerprint: fingerprint, twobeeInvite: email ?? '' } }
  body.reminders = { useDefault: true }
  try {
    const { data } = await events.insert({ calendarId: 'primary', requestBody: body, sendUpdates: email ? 'all' : 'none' })
    return data
  } catch (error) {
    if (googleStatus(error) !== 409) throw error
    // Un timeout dopo l'inserimento non deve creare un secondo evento o reinviare l'invito.
    const existing = await linkedEvent(events, actor, input.dealId, id)
    if (existing.extendedProperties?.private?.twobeeFingerprint !== fingerprint) {
      throw new FollowUpError('Questo invio è già stato salvato con altri dati. Aggiorna l’elenco e modifica l’appuntamento.', 409)
    }
    return existing
  }
}

export async function removeFollowUp(events: Events, actor: string, dealId: string, eventId: string, etag: string) {
  const current = await linkedEvent(events, actor, dealId, eventId)
  if (!presentFollowUp(current).editable) throw new FollowUpError('Gestisci questo appuntamento da Google Calendar')
  if (current.etag !== etag) throw new FollowUpError('L’appuntamento è cambiato. Aggiorna l’elenco prima di annullarlo.', 409)
  await events.delete({ calendarId: 'primary', eventId, sendUpdates: current.attendees?.length ? 'all' : 'none' }, { headers: { 'If-Match': etag } })
}
