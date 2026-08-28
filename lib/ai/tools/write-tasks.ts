import { updateTaskFields } from '@/app/actions/tasks'
import { setTaskAssignees } from '@/app/actions/task-assignees'
import { softDeleteTask } from '@/app/actions/tasks-trash'
import { createMyTask, createTaskWs, ensureAdHocMilestone } from '@/app/actions/workspace-create'
import { createTaskRequest } from '@/app/actions/task-requests'
import type { AssistantCtx } from '../context'
import { schema, S, type AnyTool } from './types'

const STATUSES = ['da_fare', 'in_corso', 'in_revisione', 'completato'] as const
const PRIORITIES = ['alta', 'media', 'bassa'] as const

/** Titolo leggibile per la card di conferma: «Setup GA4» è utile, un UUID no. */
async function taskTitle(c: AssistantCtx, taskId: string): Promise<string> {
  const { data } = await c.sb.from('tasks').select('title').eq('id', taskId).maybeSingle()
  return (data as { title: string } | null)?.title ?? 'senza titolo'
}

async function personName(c: AssistantCtx, id: string): Promise<string> {
  const { data } = await c.sb.from('profiles').select('full_name').eq('id', id).maybeSingle()
  return (data as { full_name: string } | null)?.full_name ?? id
}

export const createTask: AnyTool = {
  name: 'create_task',
  description: 'Crea una task. Senza progetto è una task personale privata.',
  parameters: schema({
    titolo: S.str('Titolo della task'),
    progetto_id: S.str('UUID del progetto. Omettilo per una task personale.'),
    milestone_id: S.str('UUID della milestone. Se manca uso la milestone Ad Hoc del progetto.'),
    sprint_id: S.str('UUID dello sprint'),
    scadenza: S.date('Data di scadenza'),
    priorita: S.enum('Priorità', PRIORITIES),
    assegnatario_id: S.str('UUID della persona a cui assegnarla. Default: chi parla.'),
  }, ['titolo']),
  mutating: true,
  risky: false,
  // Anche una risorsa esterna può tenersi dei todo personali: è createMyTask a
  // vietarle di iniettare task nei progetti. Il gate vero sta lì, non qui.
  canUse: () => true,
  async run(
    args: {
      titolo: string; progetto_id?: string; milestone_id?: string; sprint_id?: string
      scadenza?: string; priorita?: string; assegnatario_id?: string
    },
    c,
  ) {
    if (!args.titolo?.trim()) return { error: 'Titolo obbligatorio' }

    // Task personale: createMyTask verifica staff + risorsa esterna.
    if (!args.progetto_id) {
      const r = await createMyTask({
        title: args.titolo,
        dueDate: args.scadenza,
        priority: args.priorita,
      })
      return r.ok ? { ok: true, messaggio: `Task personale «${args.titolo}» creata` } : { error: r.error }
    }

    // Task di progetto: createTaskWs pretende una milestone. Se il modello non
    // l'ha indicata usiamo l'Ad Hoc del progetto, esattamente come fa il "+ Crea".
    let milestoneId = args.milestone_id
    if (!milestoneId) {
      const adhoc = await ensureAdHocMilestone(args.progetto_id)
      if (!adhoc.ok) return { error: adhoc.error }
      milestoneId = adhoc.milestoneId
    }

    const r = await createTaskWs({
      projectId: args.progetto_id,
      title: args.titolo,
      milestoneId,
      sprintId: args.sprint_id,
      dueDate: args.scadenza,
      priority: args.priorita,
      assigneeId: args.assegnatario_id,
    })
    return r.ok ? { ok: true, task_id: r.task?.id, messaggio: `Task «${args.titolo}» creata` } : { error: r.error }
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
  canUse: (c) => !c.isExternal,
  async run(
    args: {
      task_id: string; stato?: string; scadenza?: string; priorita?: string
      titolo?: string; descrizione?: string; ore_stimate?: number
    },
    c,
  ) {
    const patch: Record<string, unknown> = {}
    if (args.stato) patch.status = args.stato
    if (args.scadenza !== undefined) patch.due_date = args.scadenza === '' ? null : args.scadenza
    if (args.priorita) patch.priority = args.priorita
    if (args.titolo) patch.title = args.titolo
    if (args.descrizione !== undefined) patch.description = args.descrizione
    if (args.ore_stimate !== undefined) patch.estimated_hours = args.ore_stimate
    if (!Object.keys(patch).length) return { error: 'Nessun campo da modificare' }

    // assertCanEditTask: admin/manager · PM del progetto · assegnatario · collaboratore.
    const r = await updateTaskFields(args.task_id, patch)
    if ('error' in r) return { error: r.error }
    return { ok: true, messaggio: `Task «${await taskTitle(c, args.task_id)}» aggiornata` }
  },
}

export const completeTask: AnyTool = {
  name: 'complete_task',
  description: 'Segna una task come completata.',
  parameters: schema({ task_id: S.str('UUID della task') }, ['task_id']),
  mutating: true,
  risky: false,
  canUse: (c) => !c.isExternal,
  async run(args: { task_id: string }, c) {
    const title = await taskTitle(c, args.task_id)
    const r = await updateTaskFields(args.task_id, { status: 'completato' })
    if ('error' in r) return { error: r.error }
    return { ok: true, messaggio: `Task «${title}» completata` }
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
  canUse: (c) => !c.isExternal,
  async summarize(args: { task_id: string; assegnatari_id: string[] }, c) {
    const names = await Promise.all((args.assegnatari_id ?? []).map((id) => personName(c, id)))
    const title = await taskTitle(c, args.task_id)
    return names.length
      ? `Riassegno «${title}» a ${names.join(', ')}. Gli assegnatari attuali vengono sostituiti.`
      : `Rimuovo tutti gli assegnatari da «${title}».`
  },
  async run(args: { task_id: string; assegnatari_id: string[] }, c) {
    if (!Array.isArray(args.assegnatari_id)) return { error: 'assegnatari_id deve essere una lista di UUID' }
    const r = await setTaskAssignees(args.task_id, args.assegnatari_id)
    if ('error' in r) return { error: r.error }
    return { ok: true, messaggio: `Assegnatari di «${await taskTitle(c, args.task_id)}» aggiornati` }
  },
}

export const deleteTask: AnyTool = {
  name: 'delete_task',
  description: 'Sposta una task nel cestino. Resta ripristinabile.',
  parameters: schema({ task_id: S.str('UUID della task') }, ['task_id']),
  mutating: true,
  risky: true,
  canUse: (c) => !c.isExternal,
  async summarize(args: { task_id: string }, c) {
    return `Sposto nel cestino la task «${await taskTitle(c, args.task_id)}». È ripristinabile dal Cestino.`
  },
  async run(args: { task_id: string }, c) {
    const title = await taskTitle(c, args.task_id)
    const r = await softDeleteTask(args.task_id)
    if ('error' in r) return { error: r.error }
    return { ok: true, messaggio: `Task «${title}» spostata nel cestino` }
  },
}

export const requestTask: AnyTool = {
  name: 'request_task',
  description: 'Invia a un collega una richiesta operativa che deve accettare.',
  parameters: schema({
    destinatario_id: S.str('UUID della persona destinataria'),
    titolo: S.str('Cosa gli si chiede'),
    nota: S.str('Dettagli aggiuntivi'),
    progetto_id: S.str('UUID del progetto di riferimento'),
    scadenza: S.date('Data entro cui serve'),
    priorita: S.enum('Priorità', PRIORITIES),
  }, ['destinatario_id', 'titolo']),
  mutating: true,
  risky: false,
  canUse: (c) => !c.isExternal,
  async run(
    args: { destinatario_id: string; titolo: string; nota?: string; progetto_id?: string; scadenza?: string; priorita?: string },
    c,
  ) {
    const r = await createTaskRequest({
      targetProfileId: args.destinatario_id,
      title: args.titolo,
      note: args.nota ?? null,
      projectId: args.progetto_id ?? null,
      dueDate: args.scadenza ?? null,
      priority: args.priorita,
    })
    if ('error' in r) return { error: r.error }
    return { ok: true, messaggio: `Richiesta inviata a ${await personName(c, args.destinatario_id)}` }
  },
}

export const WRITE_TASK_TOOLS: AnyTool[] = [
  createTask, updateTask, completeTask, assignTask, deleteTask, requestTask,
]
