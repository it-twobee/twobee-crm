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

export class ProviderError extends Error {}

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

  const res = await fetch(p.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new ProviderError(`${activeProvider()} ${res.status}: ${detail.slice(0, 300)}`)
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
