import { NextRequest, NextResponse } from 'next/server'
import { buildAssistantCtx, isStaffCtx, type Surface } from '@/lib/ai/context'
import { runPendingAction } from '@/lib/ai/agent'
import { revalidateAfterAssistantWrite } from '@/lib/ai/revalidate'

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

  // Un'azione confermata ha scritto per definizione: le azioni rischiose sono
  // tutte mutanti, quindi qui non c'è niente da distinguere.
  revalidateAfterAssistantWrite()

  /* La conversazione va verificata come nella route principale: l'id arriva dal
     client e l'insert passa dal service role, quindi senza questo controllo si
     può scrivere un messaggio «assistente» nella conversazione di un collega —
     che `loadHistory` gli rimetterebbe nel contesto al turno dopo. */
  const conversationId: string = (body.conversationId ?? '').toString()
  if (conversationId) {
    const { data: own } = await ctx.admin
      .from('ai_conversations').select('id')
      .eq('id', conversationId).eq('profile_id', ctx.userId).maybeSingle()
    if (own) {
      void ctx.admin.from('ai_assistant_messages').insert({
        conversation_id: conversationId, role: 'assistant', content: result.message,
      } as never).then(() => {}, () => {})
    }
  }

  return NextResponse.json({ ok: true, answer: result.message })
}
