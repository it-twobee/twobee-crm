import type { AssistantCtx } from '../context'
import type { ChatTool } from '../provider'

/**
 * Uno strumento che l'assistente può usare.
 *
 * `canUse` filtra il catalogo PRIMA di mandarlo al modello: è l'equivalente della
 * voce di menu nascosta, comodo ma non è una barriera. La barriera vera sta dentro
 * `run`, che richiama i guard già esistenti dei server action. Il modello sceglie
 * lo strumento, mai chi può usarlo.
 */
export interface AiTool<A = Record<string, never>> {
  name: string
  /** Una riga, imperativo, ≤ 15 parole: i modelli piccoli sbagliano su descrizioni lunghe. */
  description: string
  parameters: Record<string, unknown>
  mutating: boolean
  /** Richiede la conferma esplicita dell'utente prima di eseguire. */
  risky: boolean
  canUse: (c: AssistantCtx) => boolean
  run: (args: A, c: AssistantCtx) => Promise<unknown>
  /** Testo mostrato nella card di conferma. */
  summarize?: (args: A, c: AssistantCtx) => Promise<string> | string
}

// I tool sono eterogenei per forma degli argomenti: il registry li tiene come
// AiTool<never> e la validazione la fa ogni `run` sui propri campi.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = AiTool<any>

export function toChatTool(t: AnyTool): ChatTool {
  return {
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }
}

/** Schema JSON compatto: evita la verbosità che confonde i modelli piccoli. */
export function schema(
  props: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: 'object', properties: props, required, additionalProperties: false }
}

export const S = {
  str: (description: string) => ({ type: 'string', description }),
  num: (description: string) => ({ type: 'number', description }),
  bool: (description: string) => ({ type: 'boolean', description }),
  enum: (description: string, values: readonly string[]) => ({ type: 'string', description, enum: values }),
  date: (description: string) => ({ type: 'string', description: `${description} (YYYY-MM-DD)` }),
  ids: (description: string) => ({ type: 'array', description, items: { type: 'string' } }),
}

export const EMPTY_SCHEMA = schema({})

/** Cap uniforme sulle liste: un tool result enorme fa esplodere il contesto. */
export function capLimit(v: unknown, fallback = 20, max = 50): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), max)
}
