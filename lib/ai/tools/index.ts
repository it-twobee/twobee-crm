import type { AssistantCtx } from '../context'
import { READ_TASK_TOOLS } from './read-tasks'
import { READ_PROJECT_TOOLS } from './read-projects'
import { READ_CLIENT_TOOLS } from './read-clients'
import { READ_ORG_TOOLS } from './read-org'
import { WRITE_TASK_TOOLS } from './write-tasks'
import { WRITE_PROJECT_TOOLS } from './write-projects'
import { toChatTool, type AnyTool } from './types'

export const TOOLS: AnyTool[] = [
  ...READ_ORG_TOOLS,
  ...READ_TASK_TOOLS,
  ...READ_PROJECT_TOOLS,
  ...READ_CLIENT_TOOLS,
  ...WRITE_TASK_TOOLS,
  ...WRITE_PROJECT_TOOLS,
]

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

/**
 * Il catalogo che vede il modello, filtrato per ruolo.
 *
 * Serve a non offrire strumenti che fallirebbero comunque — e a non far sapere a
 * un junior che `get_financials` esiste. NON è la barriera: quella è dentro ogni
 * `run`, che richiama i guard dei server action. Se questo filtro sbagliasse, il
 * peggio che succede è un messaggio di errore, non un dato che esce.
 */
export function toolsFor(c: AssistantCtx): AnyTool[] {
  return TOOLS.filter((t) => t.canUse(c))
}

export function chatToolsFor(c: AssistantCtx) {
  return toolsFor(c).map(toChatTool)
}

export function findTool(name: string): AnyTool | undefined {
  return BY_NAME.get(name)
}

export { toChatTool }
export type { AnyTool }
