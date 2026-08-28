import type { AssistantCtx } from './context'

/**
 * Tetto giornaliero di turni per utente. Non è una misura di sicurezza ma di
 * costo: un loop accidentale nella UI, o qualcuno che ci gioca, non deve poter
 * bruciare il budget del provider in un pomeriggio.
 */
const DEFAULT_LIMIT = Number(process.env.AI_ASSISTANT_DAILY_LIMIT ?? 100)

export function dailyLimitFor(c: AssistantCtx): number {
  if (c.isSuper) return Number.MAX_SAFE_INTEGER
  return c.isAdmin ? DEFAULT_LIMIT * 3 : DEFAULT_LIMIT
}

export async function checkDailyLimit(c: AssistantCtx): Promise<{ ok: true } | { error: string }> {
  const limit = dailyLimitFor(c)
  if (limit === Number.MAX_SAFE_INTEGER) return { ok: true }

  const since = new Date(Date.now() - 86400000).toISOString()
  const { count, error } = await c.admin
    .from('ai_logs')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', c.userId)
    .eq('call_type', 'assistant')
    .gte('created_at', since)

  // Tabella o colonna assenti (migration 115 non applicata): non blocchiamo l'uso.
  if (error) return { ok: true }
  if ((count ?? 0) >= limit) {
    return { error: `Hai raggiunto il limite di ${limit} richieste all'assistente nelle ultime 24 ore. Riprova più tardi.` }
  }
  return { ok: true }
}
