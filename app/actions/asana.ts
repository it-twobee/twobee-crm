'use server'

import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth'
import { isAdminRole, isSuperAdminRaw } from '@/lib/permissions'
import {
  boardView, mapTasks, summarize, toCsv, resourceViews, groupByClient, triageProgress,
  type AsanaTask, type AsanaUser, type Board, type TaskRow, type ResourceView,
  type Decision, type ClientGroup,
} from '@/lib/asana'
import { ASANA_DELETE_BATCH } from '@/lib/asana'
import { createActorClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

/**
 * §215 — Il travaso da Asana, in **sola lettura**.
 *
 * Non scrive niente: né su Asana né sul database. Legge il workspace, incrocia
 * board e assegnatari con clienti e profili di TwoBee, e restituisce le righe
 * con scritto sopra cosa le blocca. Il file lo si scarica e lo si guarda prima
 * di decidere qualsiasi cosa — che è il motivo per cui questa sezione esiste ed
 * è temporanea.
 */

const API = 'https://app.asana.com/api/1.0'

async function requireAdmin() {
  const profile = await getSessionProfile()
  const isAdmin = isSuperAdminRaw(profile?.email, profile?.app_role)
    || isAdminRole(profile?.app_role) || profile?.role === 'admin'
  if (!isAdmin) throw new Error('Sezione riservata agli admin.')
}

/**
 * Asana risponde 429 quando si va troppo veloci e dice in quanti secondi
 * riprovare. Rispettarlo è più corto che scoprire a metà travaso che mancano
 * trenta board: un errore parziale qui è peggio di un'attesa.
 */
async function get<T>(path: string, token: string, attempt = 0): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (res.status === 429 && attempt < 4) {
    const wait = Number(res.headers.get('Retry-After') ?? 5)
    await new Promise(r => setTimeout(r, (wait + 1) * 1000))
    return get<T>(path, token, attempt + 1)
  }
  if (!res.ok) throw new Error(`Asana ${res.status} su ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

type Page<T> = { data: T[]; next_page?: { offset: string } | null }

/** Segue `next_page` finché ce n'è: 146 board non stanno in una risposta sola. */
async function all<T>(path: string, token: string): Promise<T[]> {
  const out: T[] = []
  let offset: string | undefined
  do {
    const page = await get<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}limit=100${offset ? `&offset=${offset}` : ''}`, token)
    out.push(...page.data)
    offset = page.next_page?.offset
  } while (offset)
  return out
}

/** A gruppi di cinque: una board alla volta ci metterebbe minuti, tutte insieme prende 429. */
async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
  }
  return out
}

type RawTask = {
  gid: string; name: string; due_on: string | null; notes: string | null
  resource_subtype: string; completed?: boolean
  assignee: { email?: string | null } | null
  memberships: { section?: { name?: string } | null }[]
}

export type AsanaScan = {
  workspace: string
  boards: number
  rows: TaskRow[]
  /** le persone prima delle task: è da lì che si guarda una migrazione */
  resources: ResourceView[]
  summary: ReturnType<typeof summarize>
  csv: string
  /** board che hanno risposto con un errore: dirlo, non farle sparire */
  failed: { name: string; reason: string }[]
  /** i gid già dentro TwoBee: rileggere non li ripropone */
  imported: string[]
  /** §217 — cosa si è già deciso, per non ripassare due volte sulle stesse */
  decisions: [string, Decision][]
  groups: ClientGroup[]
  progress: ReturnType<typeof triageProgress>
  /** i clienti visti sulle board, per il filtro */
  clientNames: string[]
  /** §218 — la 201 non è applicata: le decisioni non hanno dove essere scritte */
  triageMissing: boolean
}

/**
 * §217 — `mode` decide **quanto** si guarda.
 *
 *  · `attive` — solo il lavoro non chiuso, sulle board di consegna. È la vista
 *    per migrare: poche righe, tutte utili.
 *  · `tutto` — ogni board (commerciali e interne comprese) e ogni task, anche
 *    completata. È la vista per **chiudere Asana**: quello che non si guarda
 *    resta lì dentro quando si spegne la luce.
 */
export async function scanAsana(mode: 'attive' | 'tutto' = 'attive'): Promise<AsanaScan> {
  const includeCommercial = mode === 'tutto'
  await requireAdmin()
  const token = process.env.ASANA_PAT
  if (!token) throw new Error('ASANA_PAT non configurato: senza token non c’è niente da leggere.')

  const me = await get<{ data: { workspaces: { gid: string; name: string }[] } }>(
    'users/me?opt_fields=workspaces.name', token)
  const ws = me.data.workspaces[0]
  if (!ws) throw new Error('Il token non vede nessun workspace.')

  const boards = await all<Board>(`projects?workspace=${ws.gid}&archived=false&opt_fields=name`, token)

  /* Le board commerciali e quelle interne si saltano di default: sono ~40
     richieste per righe che poi risulterebbero comunque bloccate. Chi le vuole
     le chiede, e allora si pagano. */
  const wanted = boards.filter(b => {
    const k = boardView(b).kind
    return includeCommercial || (k !== 'prospect' && k !== 'interna')
  })

  const failed: { name: string; reason: string }[] = []
  const fetched = await pool(wanted, 5, async (b): Promise<AsanaTask[]> => {
    try {
      /* `completed_since=now` è il modo di Asana per dire «solo le aperte».
         Togliendolo arriva tutto, chiuse comprese — che è il punto della
         modalità «tutto»: non si chiude un workspace guardando metà roba. */
      const raw = await all<RawTask>(
        `tasks?project=${b.gid}${mode === 'attive' ? '&completed_since=now' : ''}`
        + `&opt_fields=name,due_on,notes,completed,resource_subtype,assignee.email,memberships.section.name`,
        token)
      return raw.map(t => ({
        gid: t.gid,
        name: t.name,
        boardGid: b.gid,
        section: t.memberships?.[0]?.section?.name ?? null,
        assigneeEmail: t.assignee?.email ?? null,
        dueOn: t.due_on,
        notes: t.notes,
        isMilestone: t.resource_subtype === 'milestone',
        completed: Boolean(t.completed),
      }))
    } catch (e) {
      failed.push({ name: b.name, reason: e instanceof Error ? e.message : 'errore' })
      return []
    }
  })

  const tasks = fetched.flat()

  const sb = await createClient()
  const [{ data: clients }, { data: profiles }] = await Promise.all([
    sb.from('clients').select('id, company_name, display_name'),
    sb.from('profiles').select('id, email').eq('is_active', true),
  ])

  /* Un cliente si può chiamare in due modi — «Icura Impresa» in anagrafica,
     «Icura» su Asana — quindi entrambi i nomi entrano nella corrispondenza. */
  const clientNames = (clients ?? []).flatMap(c => {
    const names = [c.company_name, c.display_name].filter(Boolean) as string[]
    return Array.from(new Set(names)).map(name => ({ id: c.id, name }))
  })

  const prof = (profiles ?? []) as { id: string; email: string }[]
  const rows = mapTasks(tasks, boards, clientNames, prof)

  /* Le risorse arrivano dall'API, non dedotte dalle task: chi ha zero task
     attive deve comparire lo stesso, altrimenti «non ha niente da migrare» e
     «non l'abbiamo letto» hanno la stessa faccia. */
  const users = await all<{ gid: string; name: string; email?: string | null }>(
    `users?workspace=${ws.gid}&opt_fields=name,email`, token)
  const resources = resourceViews(
    users.map<AsanaUser>(u => ({ gid: u.gid, name: u.name, email: u.email ?? null })),
    rows, prof)

  /* Quali sono già dentro: `tasks.asana_gid` è unico (migration 003), quindi il
     travaso è ripetibile — ma dirlo prima è meglio che scoprirlo dal conteggio. */
  const gids = rows.map(r => r.gid)
  const already: string[] = []
  for (let i = 0; i < gids.length; i += 200) {
    const { data } = await sb.from('tasks').select('asana_gid').in('asana_gid', gids.slice(i, i + 200))
    already.push(...(data ?? []).map(r => r.asana_gid as string))
  }

  /* Senza la 201 la tabella non c'è. Il resto della pagina funziona lo stesso —
     leggere Asana non dipende da lei — quindi non si fallisce: si dichiara, e la
     pagina spegne i pulsanti che scriverebbero nel vuoto. */
  const { data: triage, error: triageErr } = await sb.from('asana_triage').select('gid, decision')
  const triageMissing = triageErr?.code === 'PGRST205' || triageErr?.code === '42P01'
  const decisions = new Map<string, Decision>(
    (triage ?? []).map(t => [t.gid as string, t.decision as Decision]))
  /* Le già importate contano come decise: non c'è più niente da scegliere su
     una task che è già dentro, e lasciarle nel conto farebbe sembrare il lavoro
     più lungo di quanto è. */
  already.forEach(g => { if (!decisions.has(g)) decisions.set(g, 'migrata') })
  const decidedSet = new Set(decisions.keys())

  return {
    workspace: ws.name,
    boards: wanted.length,
    rows,
    resources,
    summary: summarize(rows),
    csv: toCsv(rows, decisions),
    failed,
    imported: already,
    decisions: Array.from(decisions),
    groups: groupByClient(rows, decidedSet),
    progress: triageProgress(rows, decidedSet),
    clientNames: Array.from(new Set(rows.map(r => r.board.clientName).filter(Boolean) as string[])).sort(),
    triageMissing,
  }
}

/**
 * §219 — **Eliminare davvero su Asana.** Distruttivo, su un servizio di terzi,
 * quindi con tre paletti dichiarati:
 *
 *  · **Non è un effetto collaterale.** Segnare «da eliminare» non cancella
 *    niente: è una decisione. Cancellare è un secondo gesto, con la sua
 *    conferma. Un pulsante che marca e cancella insieme trasforma un
 *    ripensamento in un danno.
 *  · **A lotti, non tutto insieme.** Mille task sono mille chiamate: una sola
 *    richiesta andrebbe in timeout a metà, lasciando cancellato un pezzo e
 *    nessuno che sa quale. Il chiamante cicla e vede l'avanzamento.
 *  · **404 non è un errore.** Una task già sparita è il risultato che volevamo:
 *    si conta a parte, non fa fallire il lotto.
 *
 * `DELETE /tasks/{gid}` su Asana **non distrugge**: sposta nel cestino di chi
 * cancella, dove resta 30 giorni e si può ripristinare. È il motivo per cui
 * questa operazione è accettabile senza una copia di sicurezza — ma i 30 giorni
 * sono un limite vero, non un «per sempre».
 */
export type DeleteResult = {
  deleted: number
  alreadyGone: number
  failed: { gid: string; reason: string }[]
}

export async function deleteOnAsana(gids: string[]): Promise<DeleteResult> {
  await requireAdmin()
  const profile = await getSessionProfile()
  if (!profile) throw new Error('Non autenticato')
  const token = process.env.ASANA_PAT
  if (!token) throw new Error('ASANA_PAT non configurato.')
  if (!gids.length) throw new Error('Nessuna task selezionata.')
  if (gids.length > ASANA_DELETE_BATCH) {
    throw new Error(`Massimo ${ASANA_DELETE_BATCH} per volta: il chiamante deve dividere in lotti.`)
  }

  const res: DeleteResult = { deleted: 0, alreadyGone: 0, failed: [] }

  await pool(gids, 4, async gid => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetch(`${API}/tasks/${gid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (r.status === 429) {
        const wait = Number(r.headers.get('Retry-After') ?? 5)
        await new Promise(x => setTimeout(x, (wait + 1) * 1000))
        continue
      }
      if (r.ok) { res.deleted++; return }
      // già sparita: è il risultato che volevamo, non un fallimento
      if (r.status === 404) { res.alreadyGone++; return }
      res.failed.push({ gid, reason: `Asana ${r.status}: ${(await r.text()).slice(0, 120)}` })
      return
    }
    res.failed.push({ gid, reason: 'Asana continua a rispondere 429' })
  })

  /* Il registro si aggiorna solo per quelle andate: una task che non si è
     riusciti a cancellare deve restare nella lista, o la si perde di vista. */
  const gone = gids.filter(g => !res.failed.some(f => f.gid === g))
  if (gone.length) {
    const stamp = new Date().toISOString().slice(0, 10)
    const admin = createActorClient(profile.id)
    // best effort: la cancellazione su Asana è già avvenuta, e non si annulla
    // perché il registro non ha risposto.
    await admin.from('asana_triage').upsert(
      gone.map(gid => ({
        gid, decision: 'elimina' as const, note: `eliminata su Asana il ${stamp}`,
        decided_by: profile.id, decided_at: new Date().toISOString(),
      })), { onConflict: 'gid' })
  }

  revalidatePath('/asana')
  return res
}

/**
 * §217 — La decisione presa su un gruppo di task, in un colpo solo.
 *
 * Passare in rassegna 146 board una riga alla volta non si fa: si filtra per
 * cliente o per persona, si guarda il blocco, e si decide per tutto il blocco.
 * `null` cancella la decisione — un ripensamento deve costare quanto la scelta,
 * o si smette di decidere per paura di sbagliare.
 */
export async function setTriage(gids: string[], decision: Decision | null): Promise<number> {
  await requireAdmin()
  const profile = await getSessionProfile()
  if (!profile) throw new Error('Non autenticato')
  if (!gids.length) throw new Error('Nessuna task selezionata.')

  const admin = createActorClient(profile.id)
  if (decision === null) {
    const { error } = await admin.from('asana_triage').delete().in('gid', gids)
    if (error) throw new Error(error.message)
    return gids.length
  }

  const rows = gids.map(gid => ({
    gid, decision, decided_by: profile.id, decided_at: new Date().toISOString(),
  }))
  const { error } = await admin.from('asana_triage').upsert(rows, { onConflict: 'gid' })
  if (error) throw new Error(error.message)
  revalidatePath('/asana')
  return gids.length
}

// ── Il travaso in Task Ad Hoc ───────────────────────────────────────────────

export type AdHocResult = {
  created: number
  skipped: number
  /** senza cliente non si crea: la task ad hoc è ancorata a un cliente */
  noClient: { title: string; board: string }[]
  noAssignee: number
}

/**
 * §220 — **Ad hoc, non progetto.** È il travaso giusto per il lavoro sparso.
 *
 * Le 106 task con un proprietario stanno su ventisei board diverse: «Contratto
 * Icura e acconto», «Aggiornare Centro Contatti Meta», «Organizzare strategia
 * commerciale per neve». Non sono passi di una consegna, sono cose da fare per
 * un cliente — che è esattamente la definizione di ad hoc. Costringerle in un
 * workstream e una milestone avrebbe voluto dire inventare una struttura che su
 * Asana non c'era, e inventarla per centoquattro volte.
 *
 * Serve solo **il cliente** — che si ricava dal nome della board — e la
 * **risorsa**, dall'email. Niente milestone da scegliere, quindi niente da
 * sbagliare.
 *
 * Una task senza cliente **non si crea**: `tasks.client_id` è ciò che ancora una
 * ad hoc a qualcuno, e senza finirebbe in un elenco che nessuno apre. Torna
 * indietro col suo titolo e la sua board, così si capisce se manca l'anagrafica
 * (OSM, Sea Power, Ceramiche Martinelli non ci sono) o è roba interna.
 */
export async function importAsanaAdHoc(tasks: (ImportPayload & {
  clientId: string | null; boardName: string
})[]): Promise<AdHocResult> {
  await requireAdmin()
  const profile = await getSessionProfile()
  if (!profile) throw new Error('Non autenticato')
  if (!tasks.length) throw new Error('Nessuna task selezionata.')

  const admin = createActorClient(profile.id)

  const gids = tasks.map(t => t.gid)
  const present = new Set<string>()
  for (let i = 0; i < gids.length; i += 200) {
    const { data } = await admin.from('tasks').select('asana_gid').in('asana_gid', gids.slice(i, i + 200))
    ;(data ?? []).forEach(r => present.add(r.asana_gid as string))
  }

  const fresh = tasks.filter(t => !present.has(t.gid))
  const noClient = fresh.filter(t => !t.clientId).map(t => ({ title: t.title, board: t.boardName }))
  const usable = fresh.filter(t => t.clientId)
  if (!usable.length) {
    return { created: 0, skipped: tasks.length - fresh.length, noClient, noAssignee: 0 }
  }

  const emails = Array.from(new Set(usable.map(t => t.assigneeEmail).filter(Boolean) as string[]))
  const { data: people } = emails.length
    ? await admin.from('profiles').select('id, email').in('email', emails)
    : { data: [] }
  const byEmail = new Map((people ?? []).map(p => [(p.email as string).toLowerCase(), p.id as string]))

  const { data: made, error } = await admin.from('tasks').insert(
    usable.map(t => ({
      client_id: t.clientId,
      task_type: 'ad_hoc' as const,
      title: t.title.trim().slice(0, 300) || 'Senza titolo',
      description: t.notes?.trim() || null,
      status: 'da_fare' as const,
      priority: 'media' as const,
      due_date: t.dueOn || null,
      visibility: 'internal' as const,
      asana_gid: t.gid,
      created_by: profile.id,
    })),
  ).select('id, asana_gid')
  if (error) throw new Error(error.message)

  /* L'assegnatario passa da `task_assignees`: è la sorgente canonica dei 0..N,
     e il trigger tiene allineato `tasks.assignee_id`. */
  let noAssignee = 0
  const byGid = new Map(usable.map(t => [t.gid, t]))
  const links = (made ?? []).flatMap(m => {
    const src = byGid.get(m.asana_gid as string)
    const pid = src?.assigneeEmail ? byEmail.get(src.assigneeEmail.toLowerCase()) : undefined
    if (!pid) { noAssignee++; return [] }
    return [{ task_id: m.id as string, profile_id: pid, is_primary_owner: true }]
  })
  if (links.length) {
    const { error: e2 } = await admin.from('task_assignees').insert(links)
    if (e2) throw new Error(`Task create, ma gli assegnatari no: ${e2.message}`)
  }

  revalidatePath('/ad-hoc')
  revalidatePath('/workspace/ad-hoc')
  revalidatePath('/asana')
  return { created: made?.length ?? 0, skipped: tasks.length - fresh.length, noClient, noAssignee }
}

// ── Il travaso vero ─────────────────────────────────────────────────────────

export type ImportTarget = {
  projectId: string
  workstreamId: string
  milestoneId: string
  /** l'assegnatario di Asana diventa quello di TwoBee, dove l'email combacia */
  keepAssignee: boolean
}

export type ImportPayload = {
  gid: string
  title: string
  notes: string | null
  dueOn: string | null
  assigneeEmail: string | null
}

export type ImportResult = { created: number; skipped: number; noAssignee: number }

/**
 * §216 — Porta dentro le task scelte, agganciandole a un progetto e a un
 * workstream **che esistono già**. Tre cose che il codice garantisce:
 *
 *  · **La milestone è obbligatoria.** Una task senza `milestone_id` non compare
 *    nel board del progetto: sarebbe importata e invisibile, che è peggio di
 *    non importarla.
 *  · **Si può rilanciare.** `tasks.asana_gid` è unico (003) e le già presenti si
 *    saltano contandole, invece di far fallire tutto il lotto sulla prima.
 *  · **Il bersaglio si rilegge dal database**, non si crede al client: progetto,
 *    workstream e milestone devono esistere e appartenersi, altrimenti la task
 *    finisce in un board dove nessuno la cerca.
 */
export async function importAsanaTasks(
  tasks: ImportPayload[], target: ImportTarget,
): Promise<ImportResult> {
  await requireAdmin()
  const profile = await getSessionProfile()
  if (!profile) throw new Error('Non autenticato')
  if (!tasks.length) throw new Error('Nessuna task selezionata.')

  const sb = await createClient()
  const [{ data: project }, { data: ws }, { data: ms }] = await Promise.all([
    sb.from('projects').select('id, client_id').eq('id', target.projectId).is('deleted_at', null).maybeSingle(),
    sb.from('project_workstreams').select('id, project_id').eq('id', target.workstreamId).maybeSingle(),
    sb.from('milestones').select('id, workstream_id, project_id').eq('id', target.milestoneId).maybeSingle(),
  ])
  if (!project) throw new Error('Il progetto non esiste più.')
  if (!ws || ws.project_id !== project.id) throw new Error('Il workstream non appartiene a quel progetto.')
  if (!ms || ms.workstream_id !== ws.id) throw new Error('La milestone non appartiene a quel workstream.')

  const admin = createActorClient(profile.id)

  // già dentro: si saltano, non fanno fallire il lotto
  const gids = tasks.map(t => t.gid)
  const present = new Set<string>()
  for (let i = 0; i < gids.length; i += 200) {
    const { data } = await admin.from('tasks').select('asana_gid').in('asana_gid', gids.slice(i, i + 200))
    ;(data ?? []).forEach(r => present.add(r.asana_gid as string))
  }
  const fresh = tasks.filter(t => !present.has(t.gid))
  if (!fresh.length) return { created: 0, skipped: tasks.length, noAssignee: 0 }

  const emails = Array.from(new Set(fresh.map(t => t.assigneeEmail).filter(Boolean) as string[]))
  const { data: people } = emails.length
    ? await admin.from('profiles').select('id, email').in('email', emails)
    : { data: [] }
  const byEmail = new Map((people ?? []).map(p => [(p.email as string).toLowerCase(), p.id as string]))

  const rows = fresh.map(t => ({
    client_id: project.client_id,
    task_type: 'project' as const,
    project_id: project.id,
    workstream_id: ws.id,
    milestone_id: ms.id,
    title: t.title.trim().slice(0, 300) || 'Senza titolo',
    description: t.notes?.trim() || null,
    status: 'da_fare' as const,
    priority: 'media' as const,
    due_date: t.dueOn || null,
    visibility: 'internal' as const,
    asana_gid: t.gid,
    created_by: profile.id,
  }))

  const { data: made, error } = await admin.from('tasks').insert(rows).select('id, asana_gid')
  if (error) throw new Error(error.message)

  /* Gli assegnatari passano da `task_assignees`: è la sorgente canonica, e il
     trigger tiene allineato `tasks.assignee_id`. Scriverlo a mano lascerebbe le
     due cose a raccontare storie diverse. */
  let noAssignee = 0
  if (target.keepAssignee) {
    const byGid = new Map(fresh.map(t => [t.gid, t]))
    const links = (made ?? []).flatMap(m => {
      const src = byGid.get(m.asana_gid as string)
      const pid = src?.assigneeEmail ? byEmail.get(src.assigneeEmail.toLowerCase()) : undefined
      if (!pid) { noAssignee++; return [] }
      return [{ task_id: m.id as string, profile_id: pid, is_primary_owner: true }]
    })
    if (links.length) {
      const { error: e2 } = await admin.from('task_assignees').insert(links)
      if (e2) throw new Error(`Task create, ma gli assegnatari no: ${e2.message}`)
    }
  }

  revalidatePath(`/progetti/${project.id}`)
  revalidatePath('/asana')
  return { created: made?.length ?? 0, skipped: tasks.length - fresh.length, noAssignee }
}
