/**
 * §346 — «genera subito», da qualunque strada nasca una regola.
 *
 * Stava dentro `app/actions/recurring.ts`, e quel file è l'unico posto da cui
 * una ricorrente nasceva **a mano**. Le altre due strade — il wizard di
 * creazione progetto e la conversione di un'opportunità vinta — scrivono le
 * stesse righe dentro una RPC e non chiamavano niente: misurato sul database,
 * 15 regole attive, zero occorrenze, `last_generated_at` nullo su tutte. La
 * regola c'era, il lavoro no.
 *
 * Non fa fallire chi la chiama: la regola è salva ed è quella che conta, e se
 * la materializzazione inciampa ci ripensa il cron. Il contrario — perdere un
 * progetto perché una generazione è andata storta — sarebbe il danno peggiore.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { runRecurrences } from '@/lib/recurrence-run'

export async function generaSubito(opts: {
  taskTemplateId?: string
  milestoneTemplateId?: string
  projectId?: string
} = {}) {
  try { await runRecurrences(createAdminClient() as never, opts) }
  catch { /* ci ripensa il cron: la regola è salva */ }
}
