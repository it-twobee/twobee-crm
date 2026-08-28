import { GROQ_MODEL } from './model'

// Adapter per il motore dell'assistente.
//
// Groq e OpenAI espongono lo stesso protocollo (/chat/completions con `tools`),
// quindi cambiare provider è una variabile d'ambiente e non un refactor: v1 gira
// su Groq (chiave già in produzione), v2 su OpenAI Platform quando sarà aperto
// l'account. Il resto di lib/ai non sa quale dei due stia rispondendo.

export interface ChatToolFunction {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ChatTool {
  type: 'function'
  function: ChatToolFunction
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface ChatResult {
  content: string | null
  toolCalls: ToolCall[]
  tokens: number
  finishReason: string | null
}

type ProviderKey = 'groq' | 'openai'

const PROVIDERS: Record<ProviderKey, { url: string; key: () => string | undefined; model: string }> = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: () => process.env.GROQ_API_KEY,
    model: process.env.AI_MODEL ?? GROQ_MODEL,
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    key: () => process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-5',
  },
}

export function activeProvider(): ProviderKey {
  const p = (process.env.AI_PROVIDER ?? 'groq').toLowerCase()
  return p === 'openai' ? 'openai' : 'groq'
}

export function activeModel(): string {
  return PROVIDERS[activeProvider()].model
}

/**
 * Tetto alto di proposito: con un modello di reasoning i token di ragionamento
 * escono da qui, e in un turno ci stanno anche le tool call e la risposta. Un
 * budget stretto non accorcia la risposta, la svuota.
 */
const ASSISTANT_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS ?? 3000)

/**
 * Perché il motore non ha risposto. La distinzione non è estetica: un limite di
 * richieste si risolve aspettando, uno schema sbagliato si risolve **dicendolo al
 * modello**, e il messaggio generico «non ha risposto» non permetteva di capire
 * quale dei due fosse — l'errore veniva anche registrato come `success: true`.
 */
export type ProviderErrorKind = 'rate_limit' | 'tool_schema' | 'other'

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  /** Il messaggio del provider, da rimandare al modello quando è recuperabile. */
  readonly detail: string

  constructor(message: string, kind: ProviderErrorKind = 'other', detail = '') {
    super(message)
    this.kind = kind
    this.detail = detail
  }
}

export async function chatWithTools(opts: {
  messages: ChatMessage[]
  tools?: ChatTool[]
  maxTokens?: number
  temperature?: number
}): Promise<ChatResult> {
  const p = PROVIDERS[activeProvider()]
  const key = p.key()
  if (!key) throw new ProviderError(`Chiave mancante per il provider ${activeProvider()}`)

  const body: Record<string, unknown> = {
    model: p.model,
    max_tokens: opts.maxTokens ?? ASSISTANT_MAX_TOKENS,
    temperature: opts.temperature ?? 0.2,
    messages: opts.messages,
  }
  if (opts.tools?.length) {
    body.tools = opts.tools
    body.tool_choice = 'auto'
  }

  /**
   * Un 429 si riprova, una volta.
   *
   * Non è prudenza generica: provando qwen/qwen3.8-27b sul nostro account il
   * limite è arrivato addosso a metà di una conversazione di quattro domande, e
   * un turno agentico fa più chiamate del turno di una route generativa — quindi
   * la probabilità di incrociarlo è più alta proprio dove costa di più. Senza
   * questo, un giro perso in mezzo al loop diventa «Il motore AI non ha
   * risposto» dopo che il modello aveva già letto i dati.
   *
   * Un solo tentativo, e con un tetto: l'utente sta guardando un pannello che
   * gira, e aspettare mezzo minuto è peggio di un errore leggibile.
   */
  let res = await fetch(p.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  })

  if (res.status === 429) {
    const after = Number(res.headers.get('retry-after'))
    const wait = Math.min(Number.isFinite(after) && after > 0 ? after * 1000 : 1500, 4000)
    await new Promise((r) => setTimeout(r, wait))
    res = await fetch(p.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    })
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    /* `tool_use_failed` è il rifiuto di una chiamata a strumento malformata: il
       modello ha scritto un argomento del tipo sbagliato (visto davvero:
       `solo_attivi: "True"` invece di un booleano) e Groq scarta tutta la
       richiesta con un 400. È **recuperabile** — al modello si può dire cosa ha
       sbagliato — quindi non deve morire come un errore di rete. */
    let code = ''
    let providerMessage = ''
    try {
      const parsed = JSON.parse(raw)
      code = parsed?.error?.code ?? ''
      providerMessage = parsed?.error?.message ?? ''
    } catch { /* corpo non JSON: resta un errore generico */ }

    if (code === 'tool_use_failed') {
      throw new ProviderError('Chiamata a strumento malformata', 'tool_schema', providerMessage)
    }
    if (res.status === 429) {
      throw new ProviderError('Limite di richieste del provider', 'rate_limit', providerMessage)
    }
    throw new ProviderError(`${activeProvider()} ${res.status}: ${raw.slice(0, 300)}`, 'other', providerMessage)
  }

  const data = await res.json()
  const choice = data.choices?.[0]
  return {
    content: choice?.message?.content ?? null,
    toolCalls: (choice?.message?.tool_calls ?? []) as ToolCall[],
    tokens: data.usage?.total_tokens ?? 0,
    finishReason: choice?.finish_reason ?? null,
  }
}
