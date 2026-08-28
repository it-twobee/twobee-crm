import type { AppRole, PermissionSection, PermissionAction } from '@/lib/types/database'

/**
 * Chi può vedere quale strumento, in un modulo che non importa niente.
 *
 * Sta separato dai tool per una ragione pratica: il registry tira dentro i
 * server action, quindi `lib/ai/tools/index.ts` non si carica fuori da Next
 * (`react.cache`) e la matrice dei ruoli si potrebbe provare solo facendo login
 * come quattro persone diverse. Sul database, di quei quattro ruoli, ne
 * esistono due: `freelance` e `partner` non hanno nemmeno un account, quindi le
 * righe della matrice che li riguardano non sarebbero verificabili in nessun
 * modo. Qui invece sono puri e li verifica `access.check.ts`.
 *
 * Questo filtro NON è la barriera: decide solo cosa il modello vede nel
 * catalogo — l'equivalente della voce di menu nascosta. La barriera sta dentro
 * ogni `run`, che richiama i guard dei server action, e sotto c'è la RLS.
 */
export interface AccessCtx {
  appRole: AppRole
  isSuper: boolean
  isAdmin: boolean
  isManager: boolean
  isExternal: boolean
  surface: 'dashboard' | 'workspace'
  can: (section: PermissionSection, action: PermissionAction) => boolean
}

export type Access = (c: AccessCtx) => boolean

/** Lettura del proprio perimetro: la RLS decide cosa c'è dentro. */
export const anyone: Access = () => true

/** Le risorse esterne (freelance, partner) sono in sola lettura. */
export const notExternal: Access = (c) => !c.isExternal

/**
 * `createProjectFromWizard` ammette solo `role='admin'` o `app_role='manager'`.
 * Senior compreso fra gli esclusi: offrirglielo gli farebbe spendere un turno
 * su una chiamata che il server rifiuta comunque.
 */
export const projectManager: Access = (c) => c.isAdmin || c.appRole === 'manager'

/** Nel workspace la fonte è la VIEW, che azzera i numeri: la lettura è sicura. */
export const clientsReader: Access = (c) => c.isAdmin || c.can('clienti', 'view') || c.surface === 'workspace'

/** Doppio gate: livello admin E permesso esplicito sulla sezione mrr. */
export const financials: Access = (c) => c.isAdmin && c.can('mrr', 'view')

/**
 * L'elenco è la fonte: `accessFor` lancia su un nome non dichiarato, quindi un
 * tool nuovo non può entrare nel catalogo senza che qualcuno decida chi lo vede.
 */
export const TOOL_ACCESS: Record<string, Access> = {
  // organizzazione
  search: anyone,
  list_team: anyone,
  open_page: anyone,
  // task
  list_my_tasks: anyone,
  list_tasks: anyone,
  get_task: anyone,
  // progetti
  list_projects: anyone,
  get_project: anyone,
  list_workstreams: anyone,
  list_milestones: anyone,
  // clienti
  list_clients: clientsReader,
  get_financials: financials,
  // scrittura
  create_task: notExternal,
  update_task: notExternal,
  complete_task: notExternal,
  assign_task: notExternal,
  delete_task: notExternal,
  create_milestone: notExternal,
  create_project: projectManager,
  create_workstream: projectManager,
}

/**
 * Da quale sorgente si leggono i clienti.
 *
 * §211 dice che le pagine del workspace leggono `clients_workspace` e **mai**
 * `clients`, e vale anche per i controlli di esistenza dentro i tool: la tabella
 * vera è leggibile da tutto lo staff (migration 092, verificato — un manager ne
 * vede 12 su 12), quindi usarla per un «questo cliente esiste?» scavalcherebbe
 * due cose che la VIEW garantisce — l'MRR azzerato e i clienti `workspace_hidden`
 * (§213), che sul database sono uno su dodici. Un admin in dashboard legge la
 * tabella, perché è la sua.
 */
export function clientsTableFor(c: Pick<AccessCtx, 'surface' | 'isAdmin'>): 'clients' | 'clients_workspace' {
  return c.surface === 'workspace' && !c.isAdmin ? 'clients_workspace' : 'clients'
}

export function accessFor(name: string): Access {
  const a = TOOL_ACCESS[name]
  if (!a) throw new Error(`Strumento «${name}» senza regola di accesso in TOOL_ACCESS`)
  return a
}
