import { createProjectFromWizard } from '@/app/actions/create-project'
import { createMilestone as createMilestoneAction } from '@/app/actions/milestones'
import { createWorkstream as createWorkstreamAction } from '@/app/actions/workstreams'
import type { AssistantCtx } from '../context'
import { schema, S, type AnyTool } from './types'
import { accessFor, clientsTableFor } from './access'

const AREAS = ['marketing', 'growth', 'digital'] as const
const WORKSTREAM_TYPES = ['project', 'recurring'] as const
/** `service_type` non ha un CHECK sul DB: l'enum tiene il modello sui valori già
 *  in uso invece di lasciarlo inventare una tassonomia nuova a ogni progetto. */
const SERVICE_TYPES = [
  'lead_generation', 'digital_transformation', 'social_media_management', 'branding', 'ecommerce',
] as const

// Chi vede questi strumenti sta in ./access (`projectManager`): là è puro e lo
// verifica access.check.ts, che è l'unico modo di provare le righe della matrice
// su freelance e partner — sul database quei ruoli non hanno un account.

async function attempt<T>(fn: () => Promise<T>): Promise<{ value: T } | { error: string }> {
  try {
    return { value: await fn() }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Operazione non riuscita' }
  }
}

async function visibleProject(c: AssistantCtx, id: string): Promise<{ name: string } | { error: string }> {
  if (!id || typeof id !== 'string') return { error: 'progetto_id mancante' }
  const { data } = await c.sb
    .from('projects').select('name').eq('id', id).is('deleted_at', null).maybeSingle()
  const row = data as { name: string } | null
  return row ? { name: row.name } : { error: 'Progetto non trovato o non visibile con i tuoi permessi' }
}

async function clientName(c: AssistantCtx, id: string): Promise<string> {
  const table = clientsTableFor(c)
  const { data } = await c.sb.from(table).select('company_name').eq('id', id).maybeSingle()
  return (data as { company_name: string } | null)?.company_name ?? id
}

export const createProject: AnyTool = {
  name: 'create_project',
  description: 'Crea un progetto per un cliente, con area e tipo di servizio.',
  parameters: schema({
    cliente_id: S.str('UUID del cliente. Omettilo per un progetto interno.'),
    nome: S.str('Nome del progetto'),
    area: S.enum('Area di competenza', AREAS),
    servizio: S.enum('Tipo di servizio', SERVICE_TYPES),
    descrizione: S.str('Descrizione breve'),
    inizio: S.date('Data di inizio'),
    fine: S.date('Data di fine prevista'),
  }, ['nome', 'area', 'servizio']),
  mutating: true,
  // Nasce con un workstream e una milestone di sistema, e sotto ci finiranno le
  // task: è la creazione più strutturale che l'assistente possa fare, quindi
  // passa dalla card di conferma invece di partire al primo messaggio.
  risky: true,
  canUse: accessFor('create_project'),
  async summarize(args: { cliente_id?: string; nome: string; area: string; servizio: string }, c) {
    const dove = args.cliente_id ? `per ${await clientName(c, args.cliente_id)}` : 'come progetto interno'
    return `Creo il progetto «${args.nome}» ${dove}, area ${args.area}, servizio ${args.servizio}.`
  },
  async run(
    args: {
      cliente_id?: string; nome: string; area: string; servizio: string
      descrizione?: string; inizio?: string; fine?: string
    },
    c,
  ) {
    if (!args.nome?.trim()) return { error: 'Nome progetto obbligatorio' }
    if (args.cliente_id) {
      const { data: cl } = await c.sb.from(clientsTableFor(c)).select('id').eq('id', args.cliente_id).maybeSingle()
      if (!cl) return { error: 'Cliente non trovato o non visibile con i tuoi permessi' }
    }

    const r = await attempt(() => createProjectFromWizard({
      project: {
        client_id: args.cliente_id ?? null,
        name: args.nome,
        description: args.descrizione ?? null,
        area: args.area,
        service_type: args.servizio,
        status: 'active',
        start_date: args.inizio ?? null,
        target_end_date: args.fine ?? null,
      },
    }))
    if ('error' in r) return r
    const dove = args.cliente_id ? ` per ${await clientName(c, args.cliente_id)}` : ' (interno)'
    return { ok: true, progetto_id: r.value, messaggio: `Progetto «${args.nome}» creato${dove}` }
  },
}

export const createWorkstream: AnyTool = {
  name: 'create_workstream',
  description: 'Crea un workstream su un progetto: un filone di lavoro con date.',
  parameters: schema({
    progetto_id: S.str('UUID del progetto'),
    nome: S.str('Nome del workstream'),
    tipo: S.enum('A termine (project) o continuativo (recurring)', WORKSTREAM_TYPES),
    inizio: S.date('Data di inizio, solo se tipo project'),
    fine: S.date('Data di fine, solo se tipo project'),
  }, ['progetto_id', 'nome']),
  mutating: true,
  risky: false,
  canUse: accessFor('create_workstream'),
  async run(
    args: { progetto_id: string; nome: string; tipo?: 'project' | 'recurring'; inizio?: string; fine?: string },
    c,
  ) {
    const seen = await visibleProject(c, args.progetto_id)
    if ('error' in seen) return seen
    if (!args.nome?.trim()) return { error: 'Nome obbligatorio' }

    const r = await attempt(() => createWorkstreamAction({
      project_id: args.progetto_id,
      name: args.nome,
      workstream_type: args.tipo ?? 'project',
      start_date: args.inizio ?? null,
      end_date: args.fine ?? null,
    }))
    if ('error' in r) return r
    return { ok: true, workstream_id: r.value, messaggio: `Workstream «${args.nome}» creato su «${seen.name}»` }
  },
}

export const createMilestone: AnyTool = {
  name: 'create_milestone',
  description: 'Crea una milestone dentro un workstream di un progetto.',
  parameters: schema({
    progetto_id: S.str('UUID del progetto'),
    workstream_id: S.str('UUID del workstream a cui legarla'),
    titolo: S.str('Titolo della milestone'),
    scadenza: S.date('Data di scadenza'),
    deliverabile: S.str('Cosa si consegna'),
  }, ['progetto_id', 'workstream_id', 'titolo']),
  mutating: true,
  risky: false,
  canUse: accessFor('create_milestone'),
  async run(
    args: { progetto_id: string; workstream_id: string; titolo: string; scadenza?: string; deliverabile?: string },
    c,
  ) {
    const seen = await visibleProject(c, args.progetto_id)
    if ('error' in seen) return seen
    if (!args.titolo?.trim()) return { error: 'Titolo obbligatorio' }

    // Il workstream deve stare su QUESTO progetto: altrimenti la milestone
    // finirebbe appesa a un filone di un altro cliente.
    const { data: ws } = await c.sb.from('project_workstreams')
      .select('id').eq('id', args.workstream_id).eq('project_id', args.progetto_id).maybeSingle()
    if (!ws) return { error: 'Workstream non trovato su questo progetto' }

    const r = await attempt(() => createMilestoneAction({
      project_id: args.progetto_id,
      workstream_id: args.workstream_id,
      title: args.titolo,
      due_date: args.scadenza ?? null,
      deliverable: args.deliverabile ?? null,
    }))
    if ('error' in r) return r
    return { ok: true, milestone_id: r.value, messaggio: `Milestone «${args.titolo}» creata su «${seen.name}»` }
  },
}

export const WRITE_PROJECT_TOOLS: AnyTool[] = [createProject, createWorkstream, createMilestone]
