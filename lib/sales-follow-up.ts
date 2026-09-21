export type FollowUpInput = {
  dealId: string
  requestId: string
  title: string
  start: string
  duration: number
  timezone: string
  inviteContact: boolean
  eventId?: string
  etag?: string
}

export type SalesFollowUp = {
  id: string
  etag: string
  title: string
  start: string
  end: string
  url: string | null
  invitedEmail: string | null
  editable: boolean
}

export class FollowUpError extends Error {
  constructor(message: string, public status = 400, public code = 'invalid_input') { super(message) }
}

export function followUpUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new FollowUpError('Identificativo non valido')
  }
  return value.toLowerCase()
}

export function followUpEventId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9_]{5,1024}$/.test(value)) throw new FollowUpError('Appuntamento non valido')
  return value
}

export function validateFollowUp(raw: unknown): FollowUpInput {
  if (!raw || typeof raw !== 'object') throw new FollowUpError('Dati del follow-up mancanti')
  const v = raw as Record<string, unknown>
  const dealId = followUpUuid(v.dealId), requestId = followUpUuid(v.requestId)
  if (typeof v.title !== 'string' || !v.title.trim() || v.title.trim().length > 200) throw new FollowUpError('Indica un titolo, massimo 200 caratteri')
  if (typeof v.start !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(v.start)
    || !Number.isFinite(Date.parse(v.start))
    || new Date(v.start).toISOString().slice(0, 19) !== v.start.slice(0, 19)) throw new FollowUpError('Data e ora non valide')
  if (!Number.isInteger(v.duration) || Number(v.duration) < 5 || Number(v.duration) > 1440) throw new FollowUpError('La durata deve essere tra 5 minuti e 24 ore')
  if (typeof v.timezone !== 'string') throw new FollowUpError('Fuso orario non valido')
  try { new Intl.DateTimeFormat('it', { timeZone: v.timezone }).format() } catch { throw new FollowUpError('Fuso orario non valido') }
  if (typeof v.inviteContact !== 'boolean') throw new FollowUpError('Scegli se invitare il contatto')
  const eventId = v.eventId === undefined ? undefined : followUpEventId(v.eventId)
  if (eventId && (typeof v.etag !== 'string' || !v.etag || v.etag.length > 200)) throw new FollowUpError('Ricarica l’appuntamento prima di modificarlo')
  return { dealId, requestId, title: v.title.trim(), start: new Date(v.start).toISOString(), duration: Number(v.duration),
    timezone: v.timezone, inviteContact: v.inviteContact, eventId, etag: eventId ? v.etag as string : undefined }
}

export function followUpEmail(invite: boolean, email: string | null): string | null {
  if (!invite) return null
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new FollowUpError('Salva un’email valida nella scheda del lead prima di invitarlo')
  return email.trim()
}
