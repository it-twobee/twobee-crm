import { createProjectWs, createSprintWs, createMilestoneWs, createAiPlan } from '@/app/actions/workspace-create'
import type { AssistantCtx } from '../context'
import { schema, S, type AnyTool } from './types'

const KINDS = ['growth', 'digital'] as const

/** Il gate reale è `guard()` dentro i server action (manager/senior/admin): qui
 *  filtriamo solo la visibilità, per non offrire a un junior strumenti che
 *  fallirebbero comunque e gli farebbero perdere un turno di conversazione. */
const canManage = (c: AssistantCtx) => c.isAdmin || c.appRole === 'manager' || c.appRole === 'senior'

async function clientName(c: AssistantCtx, id: string): Promise<string> {
  const { data } = await c.sb.from('clients').select('company_name').eq('id', id).maybeSingle()
  return (data as { company_name: string } | null)?.company_name ?? id
}

export const createProject: AnyTool = {
  name: 'create_project',
  description: 'Crea un progetto per un cliente.',
  parameters: schema({
    cliente_id: S.str('UUID del cliente'),
    nome: S.str('Nome del progetto'),
    descrizione: S.str('Descrizione breve'),
    tipo: S.enum('Growth o Digital', KINDS),
  }, ['cliente_id', 'nome']),
  mutating: true,
  risky: false,
  canUse: canManage,
  async run(args: { cliente_id: string; nome: string; descrizione?: string; tipo?: 'growth' | 'digital' }, c) {
    const r = await createProjectWs({
      clientId: args.cliente_id,
      name: args.nome,
      description: args.descrizione,
      projectKind: args.tipo,
    })
    if (!r.ok) return { error: r.error }
    return {
      ok: true,
      progetto_id: (r as { project?: { id: string } }).project?.id,
      messaggio: `Progetto «${args.nome}» creato per ${await clientName(c, args.cliente_id)}`,
    }
  },
}

export const createSprint: AnyTool = {
  name: 'create_sprint',
  description: 'Crea uno sprint su un progetto. Senza date usa oggi più due settimane.',
  parameters: schema({
    progetto_id: S.str('UUID del progetto'),
    nome: S.str('Nome dello sprint'),
    inizio: S.date('Data di inizio'),
    fine: S.date('Data di fine'),
  }, ['progetto_id', 'nome']),
  mutating: true,
  risky: false,
  canUse: canManage,
  async run(args: { progetto_id: string; nome: string; inizio?: string; fine?: string }) {
    const r = await createSprintWs({
      projectId: args.progetto_id, name: args.nome,
      startDate: args.inizio, endDate: args.fine,
    })
    if (!r.ok) return { error: r.error }
    return { ok: true, sprint_id: (r as { sprint?: { id: string } }).sprint?.id, messaggio: `Sprint «${args.nome}» creato` }
  },
}

export const createMilestone: AnyTool = {
  name: 'create_milestone',
  description: 'Crea una milestone dentro uno sprint di un progetto.',
  parameters: schema({
    progetto_id: S.str('UUID del progetto'),
    sprint_id: S.str('UUID dello sprint a cui legarla'),
    titolo: S.str('Titolo della milestone'),
    scadenza: S.date('Data di scadenza'),
  }, ['progetto_id', 'sprint_id', 'titolo']),
  mutating: true,
  risky: false,
  canUse: canManage,
  async run(args: { progetto_id: string; sprint_id: string; titolo: string; scadenza?: string }) {
    const r = await createMilestoneWs({
      projectId: args.progetto_id, sprintId: args.sprint_id,
      title: args.titolo, dueDate: args.scadenza,
    })
    if (!r.ok) return { error: r.error }
    return { ok: true, milestone_id: (r as { milestone?: { id: string } }).milestone?.id, messaggio: `Milestone «${args.titolo}» creata` }
  },
}

interface PlanArgs {
  progetto_id?: string
  cliente_id?: string
  nuovo_progetto?: string
  piano: {
    nome: string
    settimane?: number
    milestone: { titolo: string; scadenza?: string; task?: { titolo: string; priorita?: string; scadenza?: string }[] }[]
  }[]
}

export const createPlan: AnyTool = {
  name: 'create_plan',
  description: 'Crea in un colpo sprint, milestone e task da un piano completo.',
  parameters: schema({
    progetto_id: S.str('UUID di un progetto esistente'),
    cliente_id: S.str('UUID del cliente, se crei un progetto nuovo'),
    nuovo_progetto: S.str('Nome del nuovo progetto da creare'),
    piano: {
      type: 'array',
      description: 'Sprint da creare, ciascuno con le sue milestone e task',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          settimane: { type: 'number' },
          milestone: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                titolo: { type: 'string' },
                scadenza: { type: 'string' },
                task: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      titolo: { type: 'string' },
                      priorita: { type: 'string', enum: ['alta', 'media', 'bassa'] },
                      scadenza: { type: 'string' },
                    },
                    required: ['titolo'],
                  },
                },
              },
              required: ['titolo'],
            },
          },
        },
        required: ['nome', 'milestone'],
      },
    },
  }, ['piano']),
  mutating: true,
  risky: true,
  canUse: canManage,
  summarize(args: PlanArgs) {
    const sprints = args.piano?.length ?? 0
    const milestones = (args.piano ?? []).reduce((s, x) => s + (x.milestone?.length ?? 0), 0)
    const tasks = (args.piano ?? []).reduce(
      (s, x) => s + (x.milestone ?? []).reduce((m, y) => m + (y.task?.length ?? 0), 0), 0)
    const dove = args.nuovo_progetto ? `nel nuovo progetto «${args.nuovo_progetto}»` : 'sul progetto indicato'
    return `Creo ${dove}: ${sprints} sprint, ${milestones} milestone e ${tasks} task. Sono ${sprints + milestones + tasks} righe in una volta sola.`
  },
  async run(args: PlanArgs) {
    if (!args.piano?.length) return { error: 'Piano vuoto' }
    const r = await createAiPlan({
      projectId: args.progetto_id,
      clientId: args.cliente_id,
      newProjectName: args.nuovo_progetto,
      plan: args.piano.map((s) => ({
        name: s.nome,
        duration_weeks: s.settimane ?? 2,
        milestones: (s.milestone ?? []).map((m) => ({
          title: m.titolo,
          due_date: m.scadenza,
          tasks: (m.task ?? []).map((t) => ({ title: t.titolo, priority: t.priorita, due_date: t.scadenza })),
        })),
      })),
    })
    if (!r.ok) return { error: r.error }
    return { ok: true, messaggio: 'Piano creato' }
  },
}

export const WRITE_PROJECT_TOOLS: AnyTool[] = [createProject, createSprint, createMilestone, createPlan]
