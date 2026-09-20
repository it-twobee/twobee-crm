import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { canCreateClients } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { TaskList, type TaskRow } from '@/components/tasks/TaskList'
import type { MilestoneInput } from '@/lib/task-board'
import { giornoAzienda, valida } from '@/lib/person-copy'
import { rigaAttivitaDiOggi, type IngressoAttivita } from '@/lib/attivita-copy'
import { normalize, type RawLeave, type RawRequest } from '@/lib/leave-calendar'

export const revalidate = 0

/**
 * §348 — la stessa lista della sezione Task, con le sole righe di chi guarda.
 * L'unica differenza è quali task arrivano: tutto il resto — colonne, colori,
 * dettaglio, bacheca, calendario — è lo stesso componente.
 */
export default async function MieAttivitaPage() {
  const profile = await getSessionProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'team' && profile.role !== 'admin') redirect('/workspace')
  const supabase = await createClient()
  const userId = profile.id

  const [{ data: ta }, { data: profiles }, { data: tappe }] = await Promise.all([
    /* §347 — `assigned_by`: chi ha deciso che questa task fosse tua. Se la 231
       non è ancora applicata si ripiega sulla query di prima: perdere tutte le
       task multi-assegnate per una colonna che dice un nome sarebbe peggio. */
    (async () => {
      const r = await supabase.from('task_assignees').select('task_id, assigned_by').eq('profile_id', userId)
      return r.error ? await supabase.from('task_assignees').select('task_id').eq('profile_id', userId) : r
    })(),
    supabase.from('profiles').select('id, full_name, avatar_url, app_role').eq('is_active', true).order('full_name'),
    // §346 — le tappe di cui sono responsabile: lavoro mio come una task
    supabase.from('milestones')
      .select('id, project_id, workstream_id, title, status, milestone_type, owner_id, due_date, approval_required, is_recurring_instance')
      .eq('owner_id', userId),
  ])
  const ids = Array.from(new Set((ta ?? []).map(r => r.task_id)))
  const assignedBy: Record<string, string | null> = {}
  ;((ta ?? []) as { task_id: string; assigned_by?: string | null }[])
    .forEach(a => { assignedBy[a.task_id] = a.assigned_by ?? null })
  const msIds = (tappe ?? []).map(m => m.id)

  const orFilter = ids.length ? `assignee_id.eq.${userId},id.in.(${ids.join(',')})` : `assignee_id.eq.${userId}`
  const { data: tasks } = await supabase
    .from('tasks').select('*').is('deleted_at', null).or(orFilter).order('due_date', { ascending: true, nullsFirst: false })

  const [{ data: projects }, { data: workstreams }, { data: msTasks }] = await Promise.all([
    /* §353 — **tutti** i progetti attivi, non solo quelli dove ho già una task:
       da «Nuova task» si sceglie anche una milestone di un progetto, e un
       elenco che mostra solo i propri obbliga a uscire dalla pagina per
       aggiungere una riga altrove. I nomi servono comunque alle righe. */
    supabase.from('projects').select('id, name, client_id').is('deleted_at', null),
    supabase.from('project_workstreams').select('id, name, project_id'),
    msIds.length ? supabase.from('tasks').select('milestone_id, status').is('deleted_at', null).in('milestone_id', msIds)
      : Promise.resolve({ data: [] }),
  ])

  const clientIds = Array.from(new Set([
    ...(tasks ?? []).map(t => t.client_id),
    ...(projects ?? []).map(p => (p as { client_id?: string | null }).client_id ?? null),
  ].filter(Boolean))) as string[]
  // §211 — `clients_workspace`, non `clients`: è la sorgente del portale
  // operativo (economici e fiscali azzerati in tabella) ed è quella che la
  // RLS garantisce leggibile a tutto lo staff. Qui servono solo i nomi.
  const { data: clients } = clientIds.length
    ? await supabase.from('clients_workspace').select('id, company_name, display_name').in('id', clientIds)
    : { data: [] as { id: string; company_name: string; display_name: string | null }[] }
  /* §353 — l'anagrafica intera serve **al composer**, non al filtro: da «Nuova
     task» si scrive anche a un cliente su cui non si sta ancora lavorando, ed è
     la stessa lista che offre il «crea» in testata. Il filtro in cima resta
     sulle righe che ci sono davvero (§341). */
  const { data: tuttiClienti } = await supabase.from('clients_workspace')
    .select('id, company_name, display_name').order('company_name')

  /* §363 — la segnalazione di oggi, se c'è. Tre letture in più su una pagina
     che ne fa già otto, e servono a incrociare cose che nessuna colonna mette
     vicine: chi condivide le tue task aperte, e quando va in ferie.

     L'osservazione si **ricalcola adesso** e la riga si mostra solo se è
     ancora la stessa di stamattina — se nel frattempo hai chiuso le tre task
     ferme non si ripiega su una battuta generica: si tace. */
  const oggiRoma = giornoAzienda()
  const aperteMie = (tasks ?? []).filter(t => t.status !== 'completato').map(t => t.id)
  const [copyRes, condivise, richieste, registro] = await Promise.all([
    supabase.from('person_copy').select('template, situazione')
      .eq('profile_id', userId).eq('giorno', oggiRoma).eq('chiave', 'attivita').maybeSingle(),
    aperteMie.length
      ? supabase.from('task_assignees').select('task_id, profile_id').in('task_id', aperteMie)
      : Promise.resolve({ data: [] as { task_id: string; profile_id: string }[] }),
    supabase.from('hr_requests').select('id, profile_id, type, status, start_date, end_date, notes'),
    supabase.from('team_leaves').select('id, user_id, type, status, start_date, end_date, notes, days_count'),
  ])

  const nomeDi = new Map((profiles ?? []).map(p => [p.id, (p.full_name ?? '').split(' ')[0]]))
  const conta = new Map<string, number>()
  for (const a of (condivise.data ?? []) as { task_id: string; profile_id: string }[]) {
    if (a.profile_id !== userId) conta.set(a.profile_id, (conta.get(a.profile_id) ?? 0) + 1)
  }
  const { spans } = normalize(
    (richieste.data ?? []) as RawRequest[],
    (registro.data ?? []) as RawLeave[],
  )
  const approvate = spans.filter(x => x.status === 'approvata' && x.to >= oggiRoma)

  const adesso: IngressoAttivita = {
    oggi: oggiRoma,
    nome: profile.full_name?.split(' ')[0] ?? '',
    tasks: (tasks ?? []).map(t => ({
      id: t.id, status: t.status, due_date: t.due_date,
      created_at: t.created_at, updated_at: t.updated_at,
    })),
    milestone: (tappe ?? []).map(m => ({ id: m.id, status: m.status, due_date: m.due_date, owner_id: m.owner_id })),
    colleghi: Array.from(conta.entries()).map(([id, task]) => {
      const sua = approvate.filter(x => x.profileId === id).sort((a, b) => a.from.localeCompare(b.from))[0]
      return { nome: nomeDi.get(id) ?? '', task, assenteDa: sua?.from ?? null, assenteA: sua?.to ?? null }
    }).filter(c => c.nome.length > 0),
  }

  const segnalazione = rigaAttivitaDiOggi(
    copyRes.data as { template: string; situazione: string } | null,
    adesso,
    Array.from(nomeDi.values()).filter(Boolean),
    { valida },
  )

  return (
    <TaskList
      titolo="Le mie attività"
      segnalazione={segnalazione}
      personale
      rows={(tasks ?? []) as TaskRow[]}
      clients={(clients ?? []).map((c: { id: string; company_name: string; display_name: string | null }) =>
        ({ id: c.id, name: c.display_name || c.company_name }))}
      clientiPerCrea={(tuttiClienti ?? []).map((c: { id: string; company_name: string; display_name: string | null }) =>
        ({ id: c.id, name: c.display_name || c.company_name }))}
      projects={(projects ?? []) as { id: string; name: string; client_id: string | null }[]}
      workstreams={(workstreams ?? []) as { id: string; name: string; project_id: string }[]}
      milestones={(tappe ?? []) as MilestoneInput[]}
      milestoneTasks={(msTasks ?? []) as { milestone_id: string | null; status: string }[]}
      assignedBy={assignedBy}
      profiles={(profiles ?? []).map(p => ({ ...p, client_id: null }))}
      canManage
      canCreateClient={canCreateClients(profile.app_role)}
      clientBase="/workspace/clienti"
      projectBase="/workspace/progetti"
    />
  )
}
