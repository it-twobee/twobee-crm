'use server'

/**
 * §344 — Chi apre e chi chiude la porta di un documento riservato.
 *
 * Il permesso è del documento, non della persona (`lib/report-access.ts`):
 * approvare vuol dire «i compensi di quel mese, a chi ha scritto quel nome,
 * per quindici giorni». Revocare è lo stesso gesto al contrario, e vale subito:
 * chi ricarica trova la porta chiusa.
 */
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireEconomicsAdmin } from '@/lib/economics-guard'
import { grantEnd } from '@/lib/report-access'

export async function decideReportAccess(id: string, ok: boolean) {
  const actorId = await requireEconomicsAdmin()
  const now = new Date().toISOString()
  const { error } = await createAdminClient().from('report_access_requests').update({
    status: ok ? 'approved' : 'denied',
    decided_by: actorId, decided_at: now,
    /* Un permesso che non scade è un permesso che nessuno revoca. Il no non ha
       scadenza: si cancella la vecchia, o una revoca tornerebbe un sì. */
    expires_at: ok ? grantEnd(now) : null,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/economics')
}
