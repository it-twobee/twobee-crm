'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { INTERNAL_COARSE_ROLES, vedeTitoliColleghi } from '@/lib/permissions'
import { normalize, blocchiAssenza, type RawLeave, type RawRequest } from '@/lib/leave-calendar'
import { nonLavorativo } from '@/lib/calendario-lavorativo'
import { ORARIO } from '@/lib/sales-agenda'
import { istanteRoma } from '@/lib/sales-timeline'
import { tuttoIlGiorno, type VoceCal } from '@/lib/calendario'

/**
 * §446 — quello che il calendario sa oltre a Google: le assenze del team, le mie
 * task con una scadenza, le milestone dei progetti che seguo.
 *
 * Prima il calendario leggeva solo Google e le riunioni: le ferie di un collega
 * si vedevano solo se l'evento era arrivato su Google, e come «Occupato»; le
 * task arrivavano come elenco vuoto. Qui si leggono dalle loro tabelle.
 *
 * Chi guarda: lo staff interno (`INTERNAL_COARSE_ROLES`, §409 — un account del
 * portale non entra). Le assenze dei colleghi le legge chi legge i titoli dei
 * loro eventi (`vedeTitoliColleghi`); gli altri vedono solo le proprie. La
 * malattia si scrive «Assenza»: è un dato sanitario, e al team basta sapere che
 * la persona non c'è. Task e milestone sono sempre e solo di chi guarda.
 */

const MAX_GIORNI = 400

export async function leggiCalendario(dal: string, al: string, persone: string[], base: string): Promise<VoceCal[]> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Accesso richiesto')
  const { data: me } = await sb.from('profiles').select('role, app_role, email, is_active').eq('id', user.id).single()
  if (!me || me.is_active === false || !(INTERNAL_COARSE_ROLES as readonly string[]).includes(me.role ?? '')) {
    throw new Error('Il calendario è dello staff interno')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dal) || !/^\d{4}-\d{2}-\d{2}$/.test(al) || al < dal) throw new Error('Intervallo non valido')
  if ((Date.parse(al) - Date.parse(dal)) / 86_400_000 > MAX_GIORNI) throw new Error('Intervallo troppo lungo')
  const uuid = /^[0-9a-f-]{36}$/i
  const colleghi = vedeTitoliColleghi(me.app_role, me.email)
  const chi = Array.from(new Set([user.id, ...persone.filter(p => uuid.test(p))])).filter(p => p === user.id || colleghi)
  const pre = base === '/workspace' ? '/workspace' : ''

  const admin = createAdminClient()
  const [richieste, registro, nomi, assegnate, primarie, membri, proprie] = await Promise.all([
    admin.from('hr_requests').select('id, profile_id, type, status, start_date, end_date, notes, is_full_day, start_time, end_time')
      .in('profile_id', chi).lte('start_date', al).gte('end_date', dal),
    admin.from('team_leaves').select('id, user_id, type, status, start_date, end_date, notes, days_count')
      .in('user_id', chi).lte('start_date', al).gte('end_date', dal),
    admin.from('profiles').select('id, full_name').in('id', chi),
    admin.from('task_assignees').select('task_id').eq('profile_id', user.id),
    admin.from('tasks').select('id, title, due_date, status, client_id, project_id').eq('assignee_id', user.id)
      .gte('due_date', dal).lte('due_date', al).neq('status', 'completato').is('deleted_at', null),
    admin.from('project_members').select('project_id').eq('profile_id', user.id),
    admin.from('milestones').select('id, title, due_date, status, project_id, projects(name)').eq('owner_id', user.id)
      .gte('due_date', dal).lte('due_date', al),
  ])
  const nome = new Map(((nomi.data ?? []) as { id: string; full_name: string | null }[]).map(p => [p.id, p.full_name ?? 'Collega']))
  const out: VoceCal[] = []

  // ── ferie e permessi: le approvate, a blocchi d'orario ─────────────────────
  const { spans } = normalize((richieste.data ?? []) as RawRequest[], (registro.data ?? []) as RawLeave[])
  for (const s of spans) {
    if (s.status !== 'approvata') continue
    const tipo = s.kind === 'permesso' ? 'permesso' : 'ferie'
    const parola = s.kind === 'ferie' ? 'Ferie' : s.kind === 'permesso' ? 'Permesso' : 'Assenza'
    for (const b of blocchiAssenza(s, ORARIO, nonLavorativo)) {
      const inizio = istanteRoma(b.giorno, b.da), fine = istanteRoma(b.giorno, b.a)
      if (!inizio || !fine) continue
      out.push({ id: `l:${s.id}:${b.giorno}`, tipo, titolo: `${parola} — ${nome.get(s.profileId) ?? 'Collega'}`,
        inizio, fine, tuttoIlGiorno: false, profileId: s.profileId,
        dettaglio: s.oraDa ? `dalle ${s.oraDa} alle ${s.oraA}` : 'giornata intera' })
    }
  }

  // ── le mie task con una scadenza ──────────────────────────────────────────
  const idAssegnate = ((assegnate.data ?? []) as { task_id: string }[]).map(t => t.task_id)
  const { data: altre } = idAssegnate.length
    ? await admin.from('tasks').select('id, title, due_date, status, client_id, project_id').in('id', idAssegnate)
        .gte('due_date', dal).lte('due_date', al).neq('status', 'completato').is('deleted_at', null)
    : { data: [] as unknown[] }
  const viste = new Set<string>()
  for (const t of [...(primarie.data ?? []), ...(altre ?? [])] as { id: string; title: string; due_date: string }[]) {
    if (viste.has(t.id) || !t.due_date) continue
    viste.add(t.id)
    out.push({ id: `t:${t.id}`, tipo: 'task', titolo: t.title, ...tuttoIlGiorno(t.due_date), tuttoIlGiorno: true,
      profileId: user.id, link: `${pre}/${pre ? 'attivita' : 'le-mie-attivita'}` })
  }

  // ── le milestone: le mie, e quelle dei progetti di cui sono membro ────────
  const progetti = ((membri.data ?? []) as { project_id: string }[]).map(m => m.project_id)
  const { data: deiProgetti } = progetti.length
    ? await admin.from('milestones').select('id, title, due_date, status, project_id, projects(name)').in('project_id', progetti)
        .gte('due_date', dal).lte('due_date', al)
    : { data: [] as unknown[] }
  const visteM = new Set<string>()
  for (const m of [...(proprie.data ?? []), ...(deiProgetti ?? [])] as unknown as { id: string; title: string; due_date: string; status: string; project_id: string; projects: { name: string } | null }[]) {
    if (visteM.has(m.id) || !m.due_date || m.status === 'completata') continue
    visteM.add(m.id)
    out.push({ id: `m:${m.id}`, tipo: 'milestone', titolo: m.title, ...tuttoIlGiorno(m.due_date), tuttoIlGiorno: true,
      profileId: null, dettaglio: m.projects?.name ?? null, link: `${pre}/progetti/${m.project_id}` })
  }

  return out
}
