'use server'

import { revalidatePath } from 'next/cache'
import { createActorClient, createAdminClient } from '@/lib/supabase/admin'
import { requireDealAccess, requireSalesAccess } from '@/lib/sales-guard'
import { uuid } from '@/lib/sales'
import { personalGoogleCalendar } from '@/lib/google-calendar'
import { normalize, addDays, blocchiAssenza, type RawLeave, type RawRequest } from '@/lib/leave-calendar'
import { nonLavorativo } from '@/lib/calendario-lavorativo'
import { istanteRoma } from '@/lib/sales-timeline'
import { ORARIO, validaFollowup, type Impegno } from '@/lib/sales-agenda'
import { CAMPI_DERIVATI, type Derivati } from '@/lib/sales-timeline'

/**
 * §439 — i miei impegni, per scegliere quando richiamare qualcuno.
 *
 * Si legge **solo l'agenda di chi chiama**: la domanda è «quando sono libero
 * io», e l'agenda di un collega non c'entra (per quella c'è il calendario, con
 * le sue regole di riservatezza). Le fonti sono cinque e ognuna può mancare
 * senza far cadere le altre — un Google scollegato non deve togliere le ferie:
 *
 *   · Google Calendar, se è collegato (e si dice se non lo è);
 *   · gli eventi del tool (`calendar_events`) che Google non ha;
 *   · i follow-up già fissati su altri lead, dal diario;
 *   · ferie e permessi, dalle due tabelle che `normalize` mette insieme;
 *   · le task in scadenza, come promemoria: non occupano l'orario.
 */

export type StatoGoogle = 'collegato' | 'non_collegato' | 'non_configurato' | 'non_raggiungibile'

const MAX_GIORNI = 31

function refresh() {
  revalidatePath('/commerciale')
  revalidatePath('/workspace/commerciale')
}

export async function leggiAgenda(dal: string, al: string): Promise<{ impegni: Impegno[]; google: StatoGoogle }> {
  const { actor } = await requireSalesAccess()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dal) || !/^\d{4}-\d{2}-\d{2}$/.test(al) || al < dal) throw new Error('Intervallo non valido')
  if ((Date.parse(al) - Date.parse(dal)) / 86_400_000 > MAX_GIORNI) throw new Error('Al massimo un mese alla volta')
  const timeMin = istanteRoma(dal, '00:00')!
  const timeMax = istanteRoma(addDays(al, 1), '00:00')!
  const admin = createAdminClient()
  const impegni: Impegno[] = []

  // 1. Google
  let google: StatoGoogle = 'collegato'
  try {
    const cal = await personalGoogleCalendar(admin, actor)
    const { data } = await cal.events.list({ calendarId: 'primary', timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 250 })
    for (const e of data.items ?? []) {
      if (e.status === 'cancelled') continue
      // i follow-up nostri arrivano dal diario, con il nome del lead: qui sarebbero un doppione
      if (e.extendedProperties?.private?.twobeeDeal) continue
      if (e.attendees?.some(a => a.self && a.responseStatus === 'declined')) continue
      const tutto = !e.start?.dateTime
      const inizio = e.start?.dateTime ?? (e.start?.date ? istanteRoma(e.start.date, '00:00') : null)
      const fine = e.end?.dateTime ?? (e.end?.date ? istanteRoma(e.end.date, '00:00') : null)
      if (!inizio || !fine) continue
      impegni.push({ id: `g:${e.id}`, tipo: 'google', titolo: e.summary || '(senza titolo)', inizio, fine,
        tuttoIlGiorno: tutto, occupa: e.transparency !== 'transparent' && !tutto })
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    google = m === 'google_not_configured' ? 'non_configurato' : m === 'not_connected' ? 'non_collegato' : 'non_raggiungibile'
  }

  const [eventi, followup, richieste, registro, assegnate] = await Promise.all([
    // 2. il calendario del tool: le ferie approvate ci scrivono, ma arrivano già dalla loro tabella
    admin.from('calendar_events').select('id, external_event_id, title, start_at, end_at, all_day, hr_request_id')
      .eq('profile_id', actor).lt('start_at', timeMax).gt('end_at', timeMin),
    // 3. i follow-up già fissati
    admin.from('deal_activities').select('id, deal_id, occurred_at, duration_min, content, deals(company_name)')
      .eq('type', 'followup').eq('stato', 'in_programma').eq('created_by', actor)
      .gte('occurred_at', timeMin).lt('occurred_at', timeMax),
    // 4. ferie e permessi
    admin.from('hr_requests').select('id, profile_id, type, status, start_date, end_date, notes, is_full_day, start_time, end_time').eq('profile_id', actor),
    admin.from('team_leaves').select('id, user_id, type, status, start_date, end_date, notes, days_count').eq('user_id', actor),
    // 5. le task in scadenza
    admin.from('task_assignees').select('task_id').eq('profile_id', actor),
  ])

  for (const e of (eventi.data ?? []) as { id: string; external_event_id: string | null; title: string; start_at: string | null; end_at: string | null; all_day: boolean; hr_request_id: string | null }[]) {
    if (!e.start_at || !e.end_at || e.hr_request_id) continue
    if (google === 'collegato' && e.external_event_id) continue
    if (e.external_event_id?.startsWith('tb')) continue
    impegni.push({ id: `c:${e.id}`, tipo: 'interno', titolo: e.title, inizio: e.start_at, fine: e.end_at, tuttoIlGiorno: e.all_day, occupa: !e.all_day })
  }

  for (const f of (followup.data ?? []) as unknown as { id: string; occurred_at: string; duration_min: number | null; content: string | null; deals: { company_name: string } | null }[]) {
    impegni.push({ id: `f:${f.id}`, tipo: 'followup', titolo: `Follow-up · ${f.deals?.company_name ?? 'lead'}`,
      inizio: f.occurred_at, fine: new Date(Date.parse(f.occurred_at) + (f.duration_min ?? 30) * 60_000).toISOString(),
      tuttoIlGiorno: false, occupa: true })
  }

  /* §446 — le assenze come blocchi d'orario: le ferie la giornata di lavoro
     (9–18), un permesso le sue ore. Un permesso dalle 14 alle 16 lascia libera
     la mattina, e prima lo trattavamo come giornata intera. */
  const { spans } = normalize((richieste.data ?? []) as RawRequest[], (registro.data ?? []) as RawLeave[])
  for (const s of spans) {
    if (s.status === 'rifiutata' || s.to < dal || s.from > al) continue
    const approvata = s.status === 'approvata'
    for (const b of blocchiAssenza(s, ORARIO, nonLavorativo)) {
      const inizio = istanteRoma(b.giorno, b.da), fine = istanteRoma(b.giorno, b.a)
      if (!inizio || !fine) continue
      impegni.push({ id: `l:${s.id}:${b.giorno}`, tipo: 'ferie', titolo: s.kind === 'ferie' ? 'Ferie' : s.kind === 'permesso' ? 'Permesso' : 'Assenza',
        inizio, fine, tuttoIlGiorno: false, occupa: approvata, daConfermare: !approvata })
    }
  }

  const idTask = Array.from(new Set(((assegnate.data ?? []) as { task_id: string }[]).map(t => t.task_id)))
  const [{ data: miePerId }, { data: miePrimarie }] = await Promise.all([
    idTask.length
      ? admin.from('tasks').select('id, title, due_date, status').in('id', idTask).gte('due_date', dal).lte('due_date', al).neq('status', 'completato')
      : Promise.resolve({ data: [] as unknown[] }),
    admin.from('tasks').select('id, title, due_date, status').eq('assignee_id', actor).gte('due_date', dal).lte('due_date', al).neq('status', 'completato'),
  ])
  const viste = new Set<string>()
  for (const t of [...(miePerId ?? []), ...(miePrimarie ?? [])] as { id: string; title: string; due_date: string }[]) {
    if (viste.has(t.id)) continue
    viste.add(t.id)
    const inizio = istanteRoma(t.due_date, '00:00'), fine = istanteRoma(addDays(t.due_date, 1), '00:00')
    if (inizio && fine) impegni.push({ id: `t:${t.id}`, tipo: 'task', titolo: t.title, inizio, fine, tuttoIlGiorno: true, occupa: false })
  }

  impegni.sort((a, b) => a.inizio.localeCompare(b.inizio))
  return { impegni, google }
}

async function derivati(dealId: string): Promise<Derivati> {
  const { data } = await createAdminClient().from('deals').select(CAMPI_DERIVATI).eq('id', dealId).single()
  return data as unknown as Derivati
}

/**
 * Un follow-up senza Google: sta nel diario del lead, e un quarto d'ora prima
 * lo ricorda la campanella (`sales_promemoria_followup`, ogni cinque minuti).
 */
export async function pianificaFollowup(dealId: string, input: unknown) {
  const { actor } = await requireDealAccess(dealId)
  const v = validaFollowup(input, Date.now())
  if (!v.ok) throw new Error(v.motivo)
  const { error } = await createActorClient(actor).from('deal_activities').insert({
    deal_id: dealId, type: 'followup', stato: 'in_programma', occurred_at: v.valore.inizio,
    duration_min: v.valore.durata, content: v.valore.titolo, has_time: true, created_by: actor,
  })
  if (error) throw new Error(error.code === '42703' ? 'Follow-up da attivare: manca la migration' : 'Non è stato possibile salvare il follow-up')
  refresh()
  return { derivati: await derivati(dealId) }
}

async function followupInterno(id: unknown) {
  uuid(id)
  const { data } = await createAdminClient().from('deal_activities')
    .select('deal_id, type, stato, google_event_id, created_by').eq('id', id).maybeSingle()
  if (!data || data.type !== 'followup') throw new Error('Questo follow-up non c’è più: ricarica la scheda')
  if (data.stato !== 'in_programma') throw new Error('Questo follow-up ha già un esito')
  if (data.google_event_id) throw new Error('È su Google Calendar: si sposta da lì')
  return data as { deal_id: string; created_by: string | null }
}

export async function spostaFollowup(id: string, input: unknown) {
  const f = await followupInterno(id)
  const { actor, access } = await requireDealAccess(f.deal_id)
  if (access !== 'admin' && f.created_by !== actor) throw new Error('Lo sposta chi l’ha fissato, o un amministratore')
  const v = validaFollowup(input, Date.now())
  if (!v.ok) throw new Error(v.motivo)
  const { error } = await createActorClient(actor).from('deal_activities').update({
    occurred_at: v.valore.inizio, duration_min: v.valore.durata, content: v.valore.titolo,
    updated_at: new Date().toISOString(), updated_by: actor,
  }).eq('id', id)
  if (error) throw new Error('Non è stato possibile spostare il follow-up')
  // spostato: il promemoria già mandato era per l'ora vecchia
  await createAdminClient().from('sales_promemoria').delete().eq('activity_id', id)
  refresh()
  return { derivati: await derivati(f.deal_id) }
}

export async function annullaFollowup(id: string) {
  const f = await followupInterno(id)
  const { actor, access } = await requireDealAccess(f.deal_id)
  if (access !== 'admin' && f.created_by !== actor) throw new Error('Lo annulla chi l’ha fissato, o un amministratore')
  const { error } = await createActorClient(actor).from('deal_activities')
    .update({ stato: 'annullata', updated_at: new Date().toISOString(), updated_by: actor }).eq('id', id)
  if (error) throw new Error('Non è stato possibile annullare il follow-up')
  refresh()
  return { derivati: await derivati(f.deal_id) }
}
