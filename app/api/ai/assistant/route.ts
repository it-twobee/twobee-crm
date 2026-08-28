import { NextRequest, NextResponse } from 'next/server'
import { buildAssistantCtx, isStaffCtx, type Surface } from '@/lib/ai/context'
import { runAssistantTurn } from '@/lib/ai/agent'
import { checkDailyLimit } from '@/lib/ai/limits'
import { activeModel } from '@/lib/ai/provider'
import type { ChatMessage } from '@/lib/ai/provider'
import type { AssistantCtx } from '@/lib/ai/context'

const HISTORY_TURNS = 12

/**
 * La cronologia si rilegge dal DB, non si prende dal client: gli argomenti dei
 * tool passati e le risposte dell'assistente non devono poter essere riscritti
 * da chi apre i devtools. Se la migration 115 non è ancora applicata, si parte
 * senza memoria e l'assistente resta comunque utile.
 */
async function ensureConversation(c: AssistantCtx, conversationId: string | null, surface: Surface) {
  if (conversationId) {
    const { data } = await c.admin
      .from('ai_conversations').select('id').eq('id', conversationId).eq('profile_id', c.userId).maybeSingle()
    if (data) return conversationId
  }
  const { data, error } = await c.admin
    .from('ai_conversations').insert({ profile_id: c.userId, surface } as never).select('id').single()
  if (error || !data) return null
  return (data as { id: string }).id
}

async function loadHistory(c: AssistantCtx, conversationId: string | null): Promise<ChatMessage[]> {
  if (!conversationId) return []
  const { data } = await c.admin
    .from('ai_assistant_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(HISTORY_TURNS)
  const rows = ((data ?? []) as { role: string; content: string | null }[])
    .filter((m) => !!m.content)
    .reverse()
  return rows.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
}

export async function POST(req: NextRequest) {
  const started = Date.now()
  const body = await req.json().catch(() => ({}))
  const message: string = (body.message ?? '').toString().trim()
  const surface: Surface = body.surface === 'workspace' ? 'workspace' : 'dashboard'

  if (!message) return NextResponse.json({ error: 'Messaggio vuoto' }, { status: 400 })
  if (message.length > 4000) return NextResponse.json({ error: 'Messaggio troppo lungo' }, { status: 400 })

  const ctx = await buildAssistantCtx(surface)
  if (!ctx) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  if (!isStaffCtx(ctx)) return NextResponse.json({ error: 'Assistente non disponibile per il tuo profilo' }, { status: 403 })

  const limit = await checkDailyLimit(ctx)
  if ('error' in limit) return NextResponse.json({ answer: limit.error, links: [], steps: [] })

  const conversationId = await ensureConversation(ctx, body.conversationId ?? null, surface)
  const history = await loadHistory(ctx, conversationId)

  let turn
  try {
    turn = await runAssistantTurn({ ctx, history, userMessage: message, conversationId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Errore imprevisto'
    void ctx.admin.from('ai_logs').insert({
      call_type: 'assistant', model: activeModel(), profile_id: ctx.userId,
      latency_ms: Date.now() - started, success: false, error_message: msg,
    } as never).then(() => {}, () => {})
    return NextResponse.json({ error: 'Errore dell’assistente' }, { status: 500 })
  }

  if (conversationId) {
    void ctx.admin.from('ai_assistant_messages').insert([
      { conversation_id: conversationId, role: 'user', content: message },
      { conversation_id: conversationId, role: 'assistant', content: turn.answer },
    ] as never).then(() => {}, () => {})
    void ctx.admin.from('ai_conversations')
      .update({ updated_at: new Date().toISOString(), title: message.slice(0, 80) } as never)
      .eq('id', conversationId).is('title', null).then(() => {}, () => {})
  }

  void ctx.admin.from('ai_logs').insert({
    call_type: 'assistant', model: activeModel(), profile_id: ctx.userId,
    latency_ms: Date.now() - started, success: true, tokens_used: turn.tokens,
  } as never).then(() => {}, () => {})

  return NextResponse.json({
    answer: turn.answer,
    links: turn.links,
    steps: turn.steps,
    pending: turn.pending ?? null,
    conversationId,
  })
}
