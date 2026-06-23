import { createAdminClient } from '@/lib/supabase/admin'

export function logAiCall({
  callType,
  startMs,
  success,
  errorMessage,
  tokensUsed,
}: {
  callType: string
  startMs: number
  success: boolean
  errorMessage?: string
  tokensUsed?: number
}) {
  const supabase = createAdminClient()
  // fire and forget — non blocca la response
  Promise.resolve(supabase.from('ai_logs').insert({
    call_type: callType,
    latency_ms: Date.now() - startMs,
    success,
    error_message: errorMessage ?? null,
    tokens_used: tokensUsed ?? null,
  })).catch(() => {})
}
