import { updateTask as updateTaskAction, updateTaskStatus, setTaskAssignees, deleteTask as deleteTaskAction, createProjectTask } from '@/app/actions/tasks'
import { createAdHocTask } from '@/app/actions/ad-hoc-tasks'
import type { TaskStatusV2, Priority } from '@/lib/types/database'
import type { AssistantCtx } from '../context'
import { schema, S, type AnyTool } from './types'
import { accessFor, clientsTableFor } from './access'

const STATUSES = ['da_fare', 'in_corso', 'in_review', 'richiesta_supporto', 'completato'] as const
const PRIORITIES = ['alta', 'media', 'bassa'] as const

/**
 * Le server action di `tasks.ts` autorizzano con `requireStaff()` — "sei admin o
 * team" — e poi scrivono con `createActorClient`, che è service role e quindi
 * scavalca la RLS. Va benissimo per la UI, che espone solo le task che l'utente
 * sta già guardando; non basta qui, dove l'id arriva dal modello e potrebbe
 * essere qualunque UUID uscito da una conversazione precedente.
 *
 * Il perimetro per-riga lo rimettiamo rileggendo la task col client dell'utente
 * (`c.sb`): se la RLS non gliela mostra, il tool si ferma prima di chiamare
 * l'action. È lo stesso confine che vale nella UI, applicato una volta in più —
 * non una regola nuova inventata per l'AI.
 */
async function visibleTask(
  c: AssistantCtx, taskId: string,
): Promise<{ title: string; clientId: string | null } | { error: string }> {
  if (!taskId || typeof taskId !== 'string') return { error: 'task_id mancante' }
  const { data } = await c.sb
    .from('tasks').select('title, client_id').eq('id', taskId).is('deleted_at', null).maybeSingle()
  const row = data as { title: string; client_id: string | null } | null
  if (!row) return { error: 'Task non trovata o non visibile con i tuoi permessi' }
  return { title: row.title, clientId: row.client_id }
}

/** Le action di main lanciano invece di restituire `{error}`: qui l'eccezione
 *  torna al modello come dato, così si autocorregge nello stesso turno. */
async function attempt<T>(fn: () => Promise<T>): Promise<{ value: T } | { error: string }> {
  try {
    return { value: await fn() }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Operazione non riuscita' }
  }
}

async function personName(c: AssistantCtx, id: string): Promise<string> {
  const { data } = await c.sb.from('profiles').select('full_name').eq('id', id).maybeSingle()
  return (data as { full_name: string } | null)?.full_name ?? id
}

export const createTask: AnyTool = {
  name: 'create_task',
  description: 'Crea una task: su un progetto, oppure ad hoc per un cliente.',
  parameters: schema({
    titolo: S.str('Titolo della task'),
    progetto_id: S.str('UUID del progetto. Per una task di progetto.'),
    milestone_id: S.str('UUID della milestone. Se manca uso quella di sistema del progetto.'),
    cliente_id: S.str('UUID del cliente. Per una task ad hoc, senza progetto.'),
    scadenza: S.date('Data di scadenza'),
    priorita: S.enum('Priorità', PRIORITIES),
    assegnatario_id: S.str('UUID della persona a cui assegnarla'),
  }, ['titolo']),
  mutating: true,
  risky: false,
  canUse: accessFor('create_task'),
  async run(
    args: {
      titolo: string; progetto_id?: string; milestone_id?: string; cliente_id?: string
      scadenza?: string; priorita?: string; assegnatario_id?: string
    },
    c,
  ) {
    if (!args.titolo?.trim()) return { error: 'Titolo obbligatorio' }
    const priority = args.priorita as Priority | undefined

    // Task ad hoc: nessun progetto, il cliente è obbligatorio (CHECK
    // tasks_hierarchy_chk: progetto, workstream e milestone devono essere NULL).
    if (!args.progetto_id) {
      if (!args.cliente_id) {
        return { error: 'Serve progetto_id (task di progetto) oppure cliente_id (task ad hoc)' }
      }
      const { data: cl } = await c.sb
        .from(clientsTableFor(c)).select('id').eq('id', args.cliente_id).maybeSingle()
      if (!cl) return { error: 'Cliente non trovato o non visibile con i tuoi permessi' }

      const r = await attempt(() => createAdHocTask({
        client_id: args.cliente_id as string,
        title: args.titolo,
        assignee_id: args.assegnatario_id ?? null,
        due_date: args.scadenza ?? null,
        priority,
      }))
      if ('error' in r) return r
      return { ok: true, task_id: r.value, messaggio: `Task ad hoc «${args.titolo}» creata` }
    }

    // Task di progetto: la gerarchia pretende progetto + workstream + milestone.
    const { data: proj } = await c.sb
      .from('projects').select('id, client_id').eq('id', args.progetto_id).is('deleted_at', null).maybeSingle()
    if (!proj) return { error: 'Progetto non trovato o non visibile con i tuoi permessi' }

    let milestone: { id: string; workstream_id: string } | null = null
    /** Il filone in cui è atterrata, quando l'abbiamo scelto noi: va detto. */
    let landedIn: string | null = null
    if (args.milestone_id) {
      const { data } = await c.sb.from('milestones')
        .select('id, workstream_id').eq('id', args.milestone_id).eq('project_id', args.progetto_id).maybeSingle()
      milestone = data as { id: string; workstream_id: string } | null
      if (!milestone) return { error: 'Milestone non trovata su questo progetto' }
    } else {
      // La milestone di sistema («Operatività continua», trigger
      // ensure_system_milestone) è il posto dove atterrano le task senza una
      // milestone propria. Ma ce n'è **una per workstream** — su Metroquadro
      // sono sei — e il vecchio `order('milestone_type')` non ne distingue una:
      // fra le sei tornava quella che decideva Postgres, quindi la task finiva
      // in un filone a caso e il messaggio non diceva quale. Si filtra sul tipo
      // per nome (non per ordine alfabetico) e si sceglie il primo workstream
      // per `sort_order`, che è quello che una persona chiamerebbe «il primo».
      const [{ data: sys }, { data: ws }] = await Promise.all([
        c.sb.from('milestones').select('id, workstream_id')
          .eq('project_id', args.progetto_id).eq('milestone_type', 'system'),
        c.sb.from('project_workstreams').select('id, name')
          .eq('project_id', args.progetto_id).order('sort_order'),
      ])
      const system = (sys ?? []) as { id: string; workstream_id: string }[]
      if (!system.length) {
        return { error: 'Il progetto non ha una milestone di sistema: passa milestone_id, o creane una con create_milestone' }
      }
      const streams = (ws ?? []) as { id: string; name: string }[]
      const target = streams.find((w) => system.some((m) => m.workstream_id === w.id))
      milestone = system.find((m) => m.workstream_id === target?.id) ?? system[0]
      landedIn = target?.name ?? null
    }

    const r = await attempt(() => createProjectTask({
      client_id: (proj as { client_id: string | null }).client_id,
      project_id: args.progetto_id as string,
      workstream_id: milestone!.workstream_id,
      milestone_id: milestone!.id,
      title: args.titolo,
      priority,
      assignee_id: args.assegnatario_id ?? null,
      due_date: args.scadenza ?? null,
    }))
    if ('error' in r) return r
    return {
      ok: true,
      task_id: r.value,
      messaggio: landedIn
        ? `Task «${args.titolo}» creata nel workstream «${landedIn}»`
        : `Task «${args.titolo}» creata`,
    }
  },
}

export const updateTask: AnyTool = {
  name: 'update_task',
  description: 'Modifica una task: stato, scadenza, priorità, titolo, descrizione, ore stimate.',
  parameters: schema({
    task_id: S.str('UUID della task'),
    stato: S.enum('Nuovo stato', STATUSES),
    scadenza: S.date('Nuova scadenza. Stringa vuota per rimuoverla.'),
    priorita: S.enum('Nuova priorità', PRIORITIES),
    titolo: S.str('Nuovo titolo'),
    descrizione: S.str('Nuova descrizione'),
    ore_stimate: S.num('Ore stimate'),
  }, ['task_id']),
  mutating: true,
  risky: false,
  canUse: accessFor('update_task'),
  async run(
    args: {
      task_id: string; stato?: string; scadenza?: string; priorita?: string
      titolo?: string; descrizione?: string; ore_stimate?: number
    },
    c,
  ) {
    const seen = await visibleTask(c, args.task_id)
    if ('error' in seen) return seen

    const patch: Parameters<typeof updateTaskAction>[1] = {}
    if (args.stato) patch.status = args.stato as TaskStatusV2
    if (args.scadenza !== undefined) patch.due_date = args.scadenza === '' ? null : args.scadenza
    if (args.priorita) patch.priority = args.priorita as Priority
    if (args.titolo) patch.title = args.titolo
    if (args.descrizione !== undefined) patch.description = args.descrizione
    if (args.ore_stimate !== undefined) patch.estimated_hours = args.ore_stimate
    if (!Object.keys(patch).length) return { error: 'Nessun campo da modificare' }

    // Lo stato passa dall'action dedicata: è lei a scrivere completed_at, che la
    // retention usa per contare i sessanta giorni.
    if (patch.status && Object.keys(patch).length === 1) {
      const r = await attempt(() => updateTaskStatus(args.task_id, patch.status as TaskStatusV2))
      if ('error' in r) return r
      return { ok: true, messaggio: `Task «${seen.title}» ora è ${patch.status}` }
    }

    const r = await attempt(() => updateTaskAction(args.task_id, patch))
    if ('error' in r) return r
    return { ok: true, messaggio: `Task «${seen.title}» aggiornata` }
  },
}

export const completeTask: AnyTool = {
  name: 'complete_task',
  description: 'Segna una task come completata.',
  parameters: schema({ task_id: S.str('UUID della task') }, ['task_id']),
  mutating: true,
  risky: false,
  canUse: accessFor('complete_task'),
  async run(args: { task_id: string }, c) {
    const seen = await visibleTask(c, args.task_id)
    if ('error' in seen) return seen
    const r = await attempt(() => updateTaskStatus(args.task_id, 'completato'))
    if ('error' in r) return r
    return { ok: true, messaggio: `Task «${seen.title}» completata` }
  },
}

export const assignTask: AnyTool = {
  name: 'assign_task',
  description: 'Cambia gli assegnatari di una task. Il primo della lista è il proprietario.',
  parameters: schema({
    task_id: S.str('UUID della task'),
    assegnatari_id: S.ids('UUID delle persone, in ordine: la prima è il proprietario'),
  }, ['task_id', 'assegnatari_id']),
  mutating: true,
  risky: true,
  canUse: accessFor('assign_task'),
  async summarize(args: { task_id: string; assegnatari_id: string[] }, c) {
    const names = await Promise.all((args.assegnatari_id ?? []).map((id) => personName(c, id)))
    const seen = await visibleTask(c, args.task_id)
    const title = 'error' in seen ? args.task_id : seen.title
    return names.length
      ? `Riassegno «${title}» a ${names.join(', ')}. Gli assegnatari attuali vengono sostituiti.`
      : `Rimuovo tutti gli assegnatari da «${title}».`
  },
  async run(args: { task_id: string; assegnatari_id: string[] }, c) {
    if (!Array.isArray(args.assegnatari_id)) return { error: 'assegnatari_id deve essere una lista di UUID' }
    const seen = await visibleTask(c, args.task_id)
    if ('error' in seen) return seen
    const r = await attempt(() => setTaskAssignees(args.task_id, args.assegnatari_id))
    if ('error' in r) return r
    return { ok: true, messaggio: `Assegnatari di «${seen.title}» aggiornati` }
  },
}

export const deleteTask: AnyTool = {
  name: 'delete_task',
  description: 'Sposta una task nel cestino. Resta ripristinabile.',
  parameters: schema({ task_id: S.str('UUID della task') }, ['task_id']),
  mutating: true,
  risky: true,
  canUse: accessFor('delete_task'),
  async summarize(args: { task_id: string }, c) {
    const seen = await visibleTask(c, args.task_id)
    const title = 'error' in seen ? args.task_id : seen.title
    return `Sposto nel cestino la task «${title}». È ripristinabile dal Cestino.`
  },
  async run(args: { task_id: string }, c) {
    const seen = await visibleTask(c, args.task_id)
    if ('error' in seen) return seen
    const r = await attempt(() => deleteTaskAction(args.task_id))
    if ('error' in r) return r
    return { ok: true, messaggio: `Task «${seen.title}» spostata nel cestino` }
  },
}

export const WRITE_TASK_TOOLS: AnyTool[] = [
  createTask, updateTask, completeTask, assignTask, deleteTask,
]
