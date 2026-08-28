import { chatWithTools, activeModel, ProviderError, type ChatMessage, type ToolCall } from './provider'
import { buildSystemPrompt } from './prompt'
import { chatToolsFor, findTool, toolsFor } from './tools'
import type { AnyTool } from './tools/types'
import type { AssistantCtx } from './context'

/**
 * Sei giri, cioè cinque di strumenti più l'ultimo a parole.
 *
 * Non è un numero prudenziale: `openai/gpt-oss-120b` su Groq **non emette tool
 * call parallele** — provato, una sola per turno anche chiedendogliene due
 * esplicitamente («quante task aperte ho e quanti clienti attivi»). Le risolve
 * in sequenza, un giro per strumento, e arriva alla risposta giusta al terzo.
 * Con quattro giri restavano due soli strumenti prima del taglio, quindi una
 * domanda composta tornava a metà. Se si cambia provider si può abbassare.
 */
const MAX_ROUNDS = 6

export interface AssistantLink { percorso: string; etichetta: string }

export interface PendingAction {
  id: string
  tool: string
  summary: string
}

export interface AgentTurn {
  answer: string
  links: AssistantLink[]
  /** Passi eseguiti, per la riga di attività nella UI. */
  steps: { tool: string; ok: boolean }[]
  pending?: PendingAction
  messages: ChatMessage[]
  tokens: number
}

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function auditToolCall(
  c: AssistantCtx, conversationId: string | null, tool: AnyTool,
  args: unknown, ok: boolean, error: string | null, latency: number,
) {
  // fire-and-forget: la tracciabilità non deve poter rompere la risposta
  void c.admin.from('ai_tool_calls').insert({
    profile_id: c.userId,
    conversation_id: conversationId,
    tool_name: tool.name,
    args: args ?? {},
    mutating: tool.mutating,
    ok,
    error,
    latency_ms: latency,
  } as never).then(() => {}, () => {})
}

/** Parcheggia un'azione rischiosa: gli argomenti restano sul server, il client
 *  riceve solo un id. Così il "Conferma" non è manomettibile dai devtools. */
async function parkPending(
  c: AssistantCtx, conversationId: string | null, tool: AnyTool, args: Record<string, unknown>,
): Promise<PendingAction | null> {
  const summary = tool.summarize
    ? await tool.summarize(args, c)
    : `Confermi l'azione «${tool.name}»?`

  const { data, error } = await c.admin.from('ai_pending_actions').insert({
    profile_id: c.userId,
    conversation_id: conversationId,
    tool_name: tool.name,
    args,
    summary,
  } as never).select('id').single()

  if (error || !data) return null
  return { id: (data as { id: string }).id, tool: tool.name, summary }
}

export async function runAssistantTurn(opts: {
  ctx: AssistantCtx
  history: ChatMessage[]
  userMessage: string
  conversationId?: string | null
}): Promise<AgentTurn> {
  const { ctx: c, conversationId = null } = opts
  const allowed = toolsFor(c)
  const chatTools = chatToolsFor(c)

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(c, allowed) },
    ...opts.history,
    { role: 'user', content: opts.userMessage },
  ]

  const links: AssistantLink[] = []
  const steps: { tool: string; ok: boolean }[] = []
  let tokens = 0

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const last = round === MAX_ROUNDS - 1
    let res
    try {
      // All'ultimo giro togliamo gli strumenti: il modello è costretto a
      // rispondere a parole invece di restare in loop su una chiamata che sbaglia.
      res = await chatWithTools({ messages, tools: last ? undefined : chatTools })
    } catch (e) {
      if (e instanceof ProviderError) {
        return {
          answer: 'Il motore AI non ha risposto. Riprova fra poco.',
          links, steps, messages, tokens,
        }
      }
      throw e
    }
    tokens += res.tokens

    if (!res.toolCalls.length) {
      messages.push({ role: 'assistant', content: res.content })
      return { answer: res.content?.trim() || 'Non ho una risposta.', links, steps, messages, tokens }
    }

    messages.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls })

    for (const call of res.toolCalls) {
      const out = await executeCall(c, call, allowed, conversationId, links, steps)
      if (out.pending) {
        // Ci si ferma qui: l'azione riparte da /confirm quando l'utente clicca.
        messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: JSON.stringify({ in_attesa: 'conferma utente' }) })
        return {
          answer: res.content?.trim() || out.pending.summary,
          links, steps, messages, tokens, pending: out.pending,
        }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: out.content })
    }
  }

  return { answer: 'Non sono riuscito a completare la richiesta in pochi passaggi. Prova a chiedermela in modo più specifico.', links, steps, messages, tokens }
}

async function executeCall(
  c: AssistantCtx,
  call: ToolCall,
  allowed: AnyTool[],
  conversationId: string | null,
  links: AssistantLink[],
  steps: { tool: string; ok: boolean }[],
): Promise<{ content: string; pending?: PendingAction }> {
  const name = call.function.name
  const tool = findTool(name)

  // Errori restituiti AL MODELLO, non sollevati: così si autocorregge nello
  // stesso turno invece di far fallire tutta la conversazione.
  if (!tool) return { content: JSON.stringify({ error: `Strumento «${name}» inesistente` }) }
  if (!allowed.some((t) => t.name === name)) {
    steps.push({ tool: name, ok: false })
    return { content: JSON.stringify({ error: 'Il tuo ruolo non consente questa operazione' }) }
  }

  const args = parseArgs(call.function.arguments)
  if (!args) return { content: JSON.stringify({ error: 'Argomenti non validi: inviali come oggetto JSON' }) }

  if (tool.risky) {
    const pending = await parkPending(c, conversationId, tool, args)
    if (!pending) return { content: JSON.stringify({ error: 'Impossibile preparare la conferma. Riprova.' }) }
    return { content: '', pending }
  }

  const started = Date.now()
  try {
    const result = await tool.run(args, c)
    const failed = !!(result && typeof result === 'object' && 'error' in (result as Record<string, unknown>))
    steps.push({ tool: name, ok: !failed })
    void auditToolCall(c, conversationId, tool, args, !failed,
      failed ? String((result as Record<string, unknown>).error) : null, Date.now() - started)

    const link = (result as { link?: AssistantLink } | null)?.link
    if (link) links.push(link)

    return { content: JSON.stringify(result).slice(0, 12000) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Errore imprevisto'
    steps.push({ tool: name, ok: false })
    void auditToolCall(c, conversationId, tool, args, false, msg, Date.now() - started)
    return { content: JSON.stringify({ error: msg }) }
  }
}

/** Esegue un'azione rischiosa già approvata dall'utente. */
export async function runPendingAction(
  c: AssistantCtx, pendingId: string,
): Promise<{ ok: true; message: string } | { error: string }> {
  const { data, error } = await c.admin
    .from('ai_pending_actions').select('*').eq('id', pendingId).maybeSingle()
  if (error || !data) return { error: 'Azione non trovata o scaduta' }

  const row = data as {
    id: string; profile_id: string; conversation_id: string | null
    tool_name: string; args: Record<string, unknown>; expires_at: string; consumed_at: string | null
  }

  // Le tre verifiche che rendono il "Conferma" una vera autorizzazione.
  if (row.profile_id !== c.userId) return { error: 'Azione non trovata o scaduta' }
  if (row.consumed_at) return { error: 'Azione già eseguita' }
  if (new Date(row.expires_at).getTime() < Date.now()) return { error: 'Conferma scaduta, richiedi di nuovo l’azione' }

  const tool = findTool(row.tool_name)
  if (!tool || !tool.canUse(c)) return { error: 'Il tuo ruolo non consente questa operazione' }

  // Marchiamo consumata PRIMA di eseguire: un doppio click non deve poter
  // eliminare due volte. La condizione su consumed_at rende l'update atomico.
  const { data: claimed } = await c.admin
    .from('ai_pending_actions')
    .update({ consumed_at: new Date().toISOString() } as never)
    .eq('id', pendingId).is('consumed_at', null)
    .select('id')
  if (!claimed?.length) return { error: 'Azione già eseguita' }

  const started = Date.now()
  const result = await tool.run(row.args, c)
  const failed = !!(result && typeof result === 'object' && 'error' in (result as Record<string, unknown>))
  void auditToolCall(c, row.conversation_id, tool, row.args, !failed,
    failed ? String((result as Record<string, unknown>).error) : null, Date.now() - started)

  if (failed) return { error: String((result as Record<string, unknown>).error) }
  const message = (result as { messaggio?: string }).messaggio ?? 'Fatto.'
  return { ok: true, message }
}

export { activeModel }
