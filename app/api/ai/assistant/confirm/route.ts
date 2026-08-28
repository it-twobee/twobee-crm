import { NextRequest, NextResponse } from 'next/server'
import { buildAssistantCtx, isStaffCtx, type Surface } from '@/lib/ai/context'
import { runPendingAction } from '@/lib/ai/agent'

/**
 * Esegue un'azione rischiosa già approvata. Il client manda SOLO l'id: gli
 * argomenti restano quelli parcheggiati sul server dal turno precedente, quindi
 * non c'è modo di far confermare all'utente una cosa ed eseguirne un'altra.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const pendingId: string = (body.pendingId ?? '').toString()
  const surface: Surface = body.surface === 'workspace' ? 'workspace' : 'dashboard'
  if (!pendingId) return NextResponse.json({ error: 'Azione mancante' }, { status: 400 })

  const ctx = await buildAssistantCtx(surface)
  if (!ctx) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  if (!isStaffCtx(ctx)) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const result = await runPendingAction(ctx, pendingId)
  if ('error' in result) return NextResponse.json({ answer: result.error, ok: false })

  if (body.conversationId) {
    void ctx.admin.from('ai_assistant_messages').insert({
      conversation_id: body.conversationId, role: 'assistant', content: result.message,
    } as never).then(() => {}, () => {})
  }

  return NextResponse.json({ ok: true, answer: result.message })
}
