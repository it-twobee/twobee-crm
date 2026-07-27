'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { pushEventToGoogle, deleteEventFromGoogle } from '@/lib/google-calendar'
import type { HrRequestType } from '@/lib/types/database'

const LEAVE_TYPES: HrRequestType[] = ['ferie', 'permesso', 'malattia']
const TYPE_LABEL: Record<string, string> = {
  ferie: 'Ferie', permesso: 'Permesso', malattia: 'Malattia',
  spesa: 'Nota spese', documento_hr: 'Documento HR',
}

function rev() {
  revalidatePath('/hr')
  revalidatePath('/workspace/hr')
  revalidatePath('/calendario')
  revalidatePath('/workspace/calendario')
  revalidatePath('/workspace/buste-paga')
  revalidatePath('/workspace/documenti-personali')
}

async function requireAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin') throw new Error('Solo un admin può decidere sulle richieste')
  return user.id
}

/**
 * Approva una richiesta e la trasforma in ciò che rappresenta:
 *  · ferie/permesso/malattia → evento in `calendar_events`, poi spinto su Google
 *  · spesa                   → riga in `payslips` (kind='nota_spese')
 *  · documento_hr            → riga in `personal_documents`
 *
 * L'oggetto creato resta collegato alla richiesta, così un rifiuto successivo
 * o un annullamento lo può rimuovere senza lasciare orfani.
 */
export async function approveHrRequest(requestId: string, note?: string): Promise<{
  routedTo: 'calendario' | 'buste-paga' | 'documenti-personali' | null
  googleSync: 'synced' | 'local' | 'error' | null
}> {
  const uid = await requireAdmin()
  const admin = createAdminClient()

  const { data: reqRow, error: e0 } = await admin
    .from('hr_requests').select('*').eq('id', requestId).single()
  if (e0 || !reqRow) throw new Error(e0?.message ?? 'Richiesta non trovata')
  const r = reqRow as {
    id: string; profile_id: string; type: HrRequestType; status: string
    start_date: string | null; end_date: string | null; is_full_day: boolean
    start_time: string | null; end_time: string | null
    notes: string | null; amount: number | null; attachment_url: string | null
  }
  if (r.status === 'approved') throw new Error('Richiesta già approvata')

  let routedTo: 'calendario' | 'buste-paga' | 'documenti-personali' | null = null
  let googleSync: 'synced' | 'local' | 'error' | null = null
  const patch: Record<string, unknown> = {
    status: 'approved', reviewed_by: uid, reviewed_at: new Date().toISOString(),
    review_note: note?.trim() || null,
  }

  // ── assenze → calendario (+ Google) ──────────────────────────────────────
  if (LEAVE_TYPES.includes(r.type)) {
    if (!r.start_date) throw new Error('La richiesta non ha una data di inizio')
    const end = r.end_date ?? r.start_date
    const allDay = r.is_full_day !== false
    const startAt = allDay ? `${r.start_date}T00:00:00Z` : `${r.start_date}T${r.start_time ?? '09:00'}:00`
    const endAt = allDay ? `${end}T23:59:59Z` : `${end}T${r.end_time ?? '18:00'}:00`

    const { data: profile } = await admin.from('profiles').select('full_name').eq('id', r.profile_id).single()
    const who = (profile as { full_name: string } | null)?.full_name ?? ''

    const { data: ev, error: e1 } = await admin.from('calendar_events').insert({
      profile_id: r.profile_id,
      kind: r.type,
      hr_request_id: r.id,
      title: `${TYPE_LABEL[r.type]}${who ? ` — ${who}` : ''}`,
      description: r.notes,
      start_at: startAt, end_at: endAt, all_day: allDay,
      sync_status: 'pending',
    }).select('id').single()
    if (e1 || !ev) throw new Error(e1?.message ?? 'Evento non creato')

    patch.calendar_event_id = (ev as { id: string }).id
    routedTo = 'calendario'
    googleSync = await pushEventToGoogle(admin, (ev as { id: string }).id)
  }

  // ── nota spese → buste paga ──────────────────────────────────────────────
  if (r.type === 'spesa') {
    const d = r.start_date ? new Date(r.start_date + 'T00:00:00Z') : new Date()
    const { data: ps, error: e2 } = await admin.from('payslips').insert({
      profile_id: r.profile_id,
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1,
      kind: 'nota_spese',
      label: r.notes?.slice(0, 120) || 'Nota spese',
      amount: r.amount,
      file_path: r.attachment_url ?? '',
      file_name: r.attachment_url ? r.attachment_url.split('/').pop() ?? null : null,
      notes: r.notes,
      hr_request_id: r.id,
      uploaded_by: uid,
    }).select('id').single()
    if (e2 || !ps) throw new Error(e2?.message ?? 'Nota spese non registrata')
    patch.payslip_id = (ps as { id: string }).id
    routedTo = 'buste-paga'
  }

  // ── documento HR → documenti personali ───────────────────────────────────
  if (r.type === 'documento_hr') {
    const { data: doc, error: e3 } = await admin.from('personal_documents').insert({
      profile_id: r.profile_id,
      doc_type: 'documento_hr',
      label: r.notes?.slice(0, 120) || 'Documento HR',
      file_path: r.attachment_url,
      file_name: r.attachment_url ? r.attachment_url.split('/').pop() ?? null : null,
      issued_at: r.start_date,
      expires_at: r.end_date,
      notes: r.notes,
      hr_request_id: r.id,
      created_by: uid,
    }).select('id').single()
    if (e3 || !doc) throw new Error(e3?.message ?? 'Documento non registrato')
    patch.personal_document_id = (doc as { id: string }).id
    routedTo = 'documenti-personali'
  }

  const { error: e4 } = await admin.from('hr_requests').update(patch).eq('id', requestId)
  if (e4) throw new Error(e4.message)

  rev()
  return { routedTo, googleSync }
}

/** Rifiuta: nessun oggetto creato, e se c'era già lo si smonta. */
export async function rejectHrRequest(requestId: string, note?: string) {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  await unrouteRequest(requestId)
  const { error } = await admin.from('hr_requests').update({
    status: 'rejected', reviewed_by: uid, reviewed_at: new Date().toISOString(),
    review_note: note?.trim() || null,
    calendar_event_id: null, payslip_id: null, personal_document_id: null,
  }).eq('id', requestId)
  if (error) throw new Error(error.message)
  rev()
}

/**
 * Revoca un'approvazione già data: rimuove l'oggetto prodotto (evento su
 * calendario e su Google, nota spese, documento) e riporta la richiesta in attesa.
 */
export async function revokeHrApproval(requestId: string, note?: string) {
  const uid = await requireAdmin()
  const admin = createAdminClient()
  await unrouteRequest(requestId)
  const { error } = await admin.from('hr_requests').update({
    status: 'pending', reviewed_by: uid, reviewed_at: new Date().toISOString(),
    review_note: note?.trim() || null,
    calendar_event_id: null, payslip_id: null, personal_document_id: null,
  }).eq('id', requestId)
  if (error) throw new Error(error.message)
  rev()
}

/** smonta ciò che l'approvazione aveva creato (idempotente) */
async function unrouteRequest(requestId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('hr_requests')
    .select('calendar_event_id, payslip_id, personal_document_id').eq('id', requestId).maybeSingle()
  const links = data as {
    calendar_event_id: string | null; payslip_id: string | null; personal_document_id: string | null
  } | null
  if (!links) return

  if (links.calendar_event_id) {
    const { data: ev } = await admin.from('calendar_events')
      .select('profile_id, external_event_id').eq('id', links.calendar_event_id).maybeSingle()
    const e = ev as { profile_id: string; external_event_id: string | null } | null
    if (e?.external_event_id) await deleteEventFromGoogle(admin, e.profile_id, e.external_event_id)
    await admin.from('calendar_events').delete().eq('id', links.calendar_event_id)
  }
  if (links.payslip_id) await admin.from('payslips').delete().eq('id', links.payslip_id)
  if (links.personal_document_id) await admin.from('personal_documents').delete().eq('id', links.personal_document_id)
}
