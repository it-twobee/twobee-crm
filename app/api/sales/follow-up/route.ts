import { NextRequest, NextResponse } from 'next/server'
import { getSalesAccess } from '@/lib/sales-guard'
import { createActorClient } from '@/lib/supabase/admin'
import { personalGoogleCalendar } from '@/lib/google-calendar'
import { FollowUpError, followUpEmail, followUpEventId, followUpUuid, validateFollowUp } from '@/lib/sales-follow-up'
import { googleStatus, listFollowUps, presentFollowUp, removeFollowUp, saveFollowUp } from '@/lib/sales-calendar'

export const dynamic = 'force-dynamic'

function jsonBody(req: NextRequest) {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new FollowUpError('Formato richiesta non valido', 415)
  }
  return req.json()
}

async function context(rawId: unknown) {
  const auth = await getSalesAccess()
  if (!auth) throw new FollowUpError('Accesso commerciale non abilitato', 403)
  const dealId = followUpUuid(rawId)
  // La sessione passa dalla RLS del lead prima di aprire il calendario privilegiato.
  const { data: deal, error } = await auth.sb.from('deals').select('id,contact_email').eq('id', dealId).maybeSingle()
  if (error) throw new FollowUpError('Non è stato possibile verificare il lead. Riprova.', 503)
  if (!deal) throw new FollowUpError('Lead non accessibile', 404)
  const { data: profile } = await auth.sb.from('profiles').select('email').eq('id', auth.actor).single()
  if (!profile?.email?.toLowerCase().endsWith('@twobee.it')) throw new FollowUpError('Il collegamento Google richiede un account TwoBee', 403)
  const db = createActorClient(auth.actor)
  const calendar = await personalGoogleCalendar(db, auth.actor)
  return { ...auth, db, calendar, dealId, email: deal.contact_email as string | null }
}

function failure(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  if (error instanceof FollowUpError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  const message = error instanceof Error ? error.message : ''
  if (message === 'google_not_configured') return NextResponse.json({ error: 'Google Calendar non è ancora configurato sul gestionale.', code: message }, { status: 503 })
  if (message === 'not_connected' || googleStatus(error) === 401 || message.includes('invalid_grant')) {
    return NextResponse.json({ error: 'Collega o ricollega il tuo Google Calendar per pianificare il follow-up.', code: 'not_connected' }, { status: 403 })
  }
  if ([409, 412].includes(googleStatus(error))) return NextResponse.json({ error: 'L’appuntamento è cambiato. Aggiorna l’elenco prima di riprovare.' }, { status: 409 })
  if ([404, 410].includes(googleStatus(error))) return NextResponse.json({ error: 'L’appuntamento non è più disponibile. Aggiorna l’elenco.' }, { status: 404 })
  return NextResponse.json({ error: 'Google Calendar non è disponibile. I dati inseriti restano nel modulo: riprova.' }, { status: 502 })
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await context(req.nextUrl.searchParams.get('dealId'))
    return NextResponse.json({ events: await listFollowUps(ctx.calendar.events, ctx.actor, ctx.dealId) })
  } catch (error) { return failure(error) }
}

async function save(req: NextRequest, editing: boolean) {
  try {
    const input = validateFollowUp(await jsonBody(req))
    if (!!input.eventId !== editing) throw new FollowUpError('Operazione non valida')
    const ctx = await context(input.dealId)
    const event = await saveFollowUp(ctx.calendar.events, ctx.actor, input, followUpEmail(input.inviteContact, ctx.email))
    const { error } = await ctx.db.from('calendar_events').upsert({ profile_id: ctx.actor, external_event_id: event.id,
      calendar_id: 'primary', title: event.summary, start_at: event.start?.dateTime, end_at: event.end?.dateTime,
      all_day: false, timezone: input.timezone, sync_status: 'synced', last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString() }, { onConflict: 'profile_id,external_event_id' })
    return NextResponse.json({ event: presentFollowUp(event), warning: error ? 'Salvato su Google. Il calendario del gestionale si riallineerà alla prossima sincronizzazione.' : undefined })
  } catch (error) { return failure(error) }
}

export async function POST(req: NextRequest) { return save(req, false) }
export async function PATCH(req: NextRequest) { return save(req, true) }

export async function DELETE(req: NextRequest) {
  try {
    const body = await jsonBody(req)
    if (!body || typeof body !== 'object') throw new FollowUpError('Richiesta non valida')
    const ctx = await context(body.dealId)
    const eventId = followUpEventId(body.eventId)
    if (typeof body.etag !== 'string' || !body.etag || body.etag.length > 200) throw new FollowUpError('Ricarica l’appuntamento prima di annullarlo')
    await removeFollowUp(ctx.calendar.events, ctx.actor, ctx.dealId, eventId, body.etag)
    const { error } = await ctx.db.from('calendar_events').delete().eq('profile_id', ctx.actor).eq('external_event_id', eventId)
    return NextResponse.json({ ok: true, warning: error ? 'Annullato su Google. Aggiorna il calendario del gestionale.' : undefined })
  } catch (error) { return failure(error) }
}
