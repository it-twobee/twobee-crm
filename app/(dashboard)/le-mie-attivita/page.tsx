import { createClient } from '@/lib/supabase/server'
import { getViewer } from '@/lib/auth'
import { canCreateClients } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { TaskList, type TaskRow } from '@/components/tasks/TaskList'
import type { MilestoneInput } from '@/lib/task-board'

export const revalidate = 0

/**
 * §348 — «Le mie attività» **è** la sezione Task, ristretta a chi guarda.
 *
 * Era un secondo elenco, con le sue righe, il suo dettaglio e le sue parole: la
 * stessa task si leggeva in due modi a seconda della pagina da cui ci si
 * arrivava, e ogni correzione andava fatta due volte — finché qualcuno non se
 * ne dimenticava. Qui cambia una cosa sola: quali righe arrivano.
 */
export default async function LeMieAttivitaPage() {
  const { user, isAdmin, profile: chiGuarda } = await getViewer()
  if (!user) redirect('/login')
  /* La voce è nel menu senza `adminOnly`, ma il gate guardava la colonna
     legacy `role`: chi è admin per `app_role` — che è la colonna su cui decide
     il middleware — entrava nella dashboard e veniva rimbalzato proprio qui,
     su una voce che il suo menu gli mostra. Una domanda sola, la stessa del
     middleware: `getViewer()`. E chi admin non è ha la stessa pagina dentro il
     portale, quindi ci va diretto invece di rimbalzare due volte. */
  if (!isAdmin) redirect('/workspace/attivita')
  const supabase = await createClient()
  const appRole = chiGuarda?.app_role ?? null

  /* §488 — tre ondate: quello che non dipende dalle task parte subito, insieme
     alla domanda «quali sono le mie». Erano cinque in fila. */
  // task assegnate a me (primario via assignee_id o multi-assegnatario) e
  // §346 — le tappe di cui sono responsabile: sono lavoro mio esattamente come
  // una task, e non comparivano in nessuna lista personale
  const [
    { data: ta }, { data: tappe }, { data: projects }, { data: workstreams }, { data: profiles }, { data: tuttiClienti },
  ] = await Promise.all([
    /* §347 — `assigned_by`: chi ha deciso che questa task fosse tua. È la
       persona a cui chiedere spiegazioni. */
    (async () => {
      const r = await supabase.from('task_assignees').select('task_id, assigned_by').eq('profile_id', user.id)
      /* Finché la 231 non è applicata la colonna non c'è e la query fallisce:
         senza questa rete l'elenco perderebbe **tutte** le task multi-assegnate
         — `ids` resterebbe vuoto — per una colonna che serve solo a dire un
         nome. L'attribuzione può mancare; la lista no. */
      return r.error ? await supabase.from('task_assignees').select('task_id').eq('profile_id', user.id) : r
    })(),
    supabase.from('milestones')
      .select('id, project_id, workstream_id, title, status, milestone_type, owner_id, due_date, approval_required, is_recurring_instance')
      .eq('owner_id', user.id),
    /* §353 — **tutti** i progetti attivi, non solo quelli dove ho già una task:
       da «Nuova task» si sceglie anche una milestone di un progetto, e un
       elenco che mostra solo i propri obbliga a uscire dalla pagina per
       aggiungere una riga altrove. I nomi servono comunque alle righe. */
    supabase.from('projects').select('id, name, client_id').is('deleted_at', null),
    // i nomi delle corsie: la riga dice progetto **e** workstream (§346)
    supabase.from('project_workstreams').select('id, name, project_id'),
    supabase.from('profiles').select('id, full_name, avatar_url, app_role').eq('is_active', true).order('full_name'),
    /* §353 — l'anagrafica intera serve **al composer**, non al filtro: da «Nuova
       task» si scrive anche a un cliente su cui non si sta ancora lavorando, ed è
       la stessa lista che offre il «crea» in testata. Il filtro in cima resta
       sulle righe che ci sono davvero (§341), e si ricava da questa. */
    supabase.from('clients').select('id, company_name, display_name').order('company_name'),
  ])
  const ids = Array.from(new Set((ta ?? []).map(r => r.task_id)))
  const assignedBy: Record<string, string | null> = {}
  ;((ta ?? []) as { task_id: string; assigned_by?: string | null }[])
    .forEach(a => { assignedBy[a.task_id] = a.assigned_by ?? null })
  const msIds = (tappe ?? []).map(m => m.id)

  const orFilter = ids.length ? `assignee_id.eq.${user.id},id.in.(${ids.join(',')})` : `assignee_id.eq.${user.id}`
  const [{ data: tasks }, { data: msTasks }] = await Promise.all([
    supabase.from('tasks').select('*').is('deleted_at', null).or(orFilter).order('due_date', { ascending: true, nullsFirst: false }),
    /* le task **di tutti** sotto quelle tappe: «2 aperte su 3» contato sulla
       mia lista direbbe un numero più piccolo del vero, e la domanda è quanto
       manca alla consegna */
    msIds.length ? supabase.from('tasks').select('milestone_id, status').is('deleted_at', null).in('milestone_id', msIds)
      : Promise.resolve({ data: [] }),
  ])

  /* §481 — **tutti** gli assegnatari delle mie task: la colonna «Chi» dice il
     responsabile, e senza gli altri una task dove sono uno dei sette sembra
     di un altro finita qui per sbaglio */
  const taskIds = (tasks ?? []).map(t => t.id)
  const { data: condivise } = taskIds.length
    ? await supabase.from('task_assignees').select('task_id, profile_id').in('task_id', taskIds)
    : { data: [] as { task_id: string; profile_id: string }[] }
  const assegnatari: Record<string, string[]> = {}
  for (const a of (condivise ?? []) as { task_id: string; profile_id: string }[]) {
    (assegnatari[a.task_id] ??= []).push(a.profile_id)
  }

  const clientIds = new Set([
    ...(tasks ?? []).map(t => t.client_id),
    ...(projects ?? []).map(p => (p as { client_id?: string | null }).client_id ?? null),
  ].filter(Boolean) as string[])
  const clients = (tuttiClienti ?? []).filter(c => clientIds.has(c.id))

  return (
    <TaskList
      titolo="Le mie attività"
      personale
      rows={(tasks ?? []) as TaskRow[]}
      clients={(clients ?? []).map(c => ({ id: c.id, name: c.display_name || c.company_name }))}
      clientiPerCrea={(tuttiClienti ?? []).map(c => ({ id: c.id, name: c.display_name || c.company_name }))}
      projects={(projects ?? []) as { id: string; name: string; client_id: string | null }[]}
      workstreams={(workstreams ?? []) as { id: string; name: string; project_id: string }[]}
      milestones={(tappe ?? []) as MilestoneInput[]}
      milestoneTasks={(msTasks ?? []) as { milestone_id: string | null; status: string }[]}
      assignedBy={assignedBy}
      assegnatari={assegnatari}
      io={user.id}
      profiles={(profiles ?? []).map(p => ({ ...p, client_id: null }))}
      canManage
      canCreateClient={canCreateClients(appRole)}
    />
  )
}
