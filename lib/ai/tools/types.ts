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

/**
 * `%`, `_` e `\\` sono metacaratteri di ILIKE: un nome che li contiene, passato
 * grezzo, cerca qualcosa di diverso da quello che l'utente ha scritto.
 */
export function escapeLike(v: string): string {
  return v.replace(/[%_\\]/g, (m) => '\\' + m)
}

export const EMPTY_SCHEMA = schema({})

/**
 * Quanti risultati esistono, non quanti se ne sono visti.
 *
 * Il cap sulle liste è necessario — un tool result enorme fa esplodere il
 * contesto — ma senza il totale il modello conta le righe che ha in mano e
 * risponde con quelle: venti task su settanta diventano «hai venti task», che
 * è un numero plausibile e sbagliato, cioè quello che nessuno va a controllare.
 * La nota dice al modello cosa fare invece di lasciarglielo dedurre.
 */
export function listInfo(total: number | null, shown: number): Record<string, unknown> {
  const totale = total ?? shown
  return totale > shown
    ? { totale, troncato: `Vedi i primi ${shown} di ${totale}: alza "limite" o restringi i filtri.` }
    : { totale }
}

/** Cap uniforme sulle liste: un tool result enorme fa esplodere il contesto. */
export function capLimit(v: unknown, fallback = 20, max = 50): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), max)
}

/**
 * Quanto di un risultato arriva al modello.
 *
 * Era 12000 caratteri, e con un turno che fa più giri il conto sale in fretta:
 * in produzione un turno ha consumato **9.900 token**, e su un modello con un
 * tetto di 8.000 al minuto un turno solo bruciava il minuto intero. Venti task
 * decorate stanno in due-tremila caratteri, quindi questo taglio non toglie
 * niente di utile e allontana il 429.
 */
export const TOOL_RESULT_CAP = 6000

/**
 * Il risultato ridotto al tetto **restando JSON valido**.
 *
 * `JSON.stringify(x).slice(0, cap)` tagliava in mezzo a una stringa e
 * consegnava al modello un JSON rotto, in silenzio: il modello leggeva quello
 * che riusciva a leggere e rispondeva comunque. Qui si tolgono elementi dalla
 * lista più lunga — dimezzandola finché sta nel tetto — e si dichiara quanti
 * ne restano fuori, che è la stessa regola di `listInfo`: un elenco tagliato
 * deve sapere di essere tagliato.
 */
export function capResult(result: unknown): string {
  const full = JSON.stringify(result) ?? 'null'
  if (full.length <= TOOL_RESULT_CAP) return full

  const obj = result && typeof result === 'object' && !Array.isArray(result)
    ? { ...(result as Record<string, unknown>) }
    : null
  const key = obj && Object.keys(obj).find((k) => Array.isArray(obj[k]) && (obj[k] as unknown[]).length > 1)

  if (obj && key) {
    const list = obj[key] as unknown[]
    for (let keep = Math.floor(list.length / 2); keep >= 1; keep = Math.floor(keep / 2)) {
      obj[key] = list.slice(0, keep)
      obj.troncato = `Vedi ${keep} di ${list.length}: il risultato era troppo grande per il contesto.`
      const out = JSON.stringify(obj)
      if (out.length <= TOOL_RESULT_CAP) return out
    }
  }
  return JSON.stringify({ error: 'Risultato troppo grande da leggere: restringi i filtri o abbassa «limite».' })
}
