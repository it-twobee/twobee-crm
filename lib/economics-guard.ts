/**
 * §234 — la porta del dominio economico, una sola. (server-side)
 *
 * Il conto economico, la banca, il fiscale, i compensi e il costo del lavoro
 * sono l'unica parte del tool che il workspace non deve vedere **né poter
 * chiamare**. Nascondere una voce di menu non è una barriera, e nemmeno
 * nascondere un riquadro: una Server Action è un endpoint HTTP con un id, e
 * chi ha il codice davanti — cioè chiunque abbia accesso al repository — quel
 * id ce l'ha. L'unica difesa che regge è il controllo **dentro** l'azione.
 *
 * Prima questo controllo era copiato in sette file (`pl`, `revenue`, `costs`,
 * `payroll`, `bank`, `tax`, `invoices`) e ognuno chiedeva `role = 'admin'`, che
 * è la mappatura grossolana per la RLS: ci cade dentro chiunque sia stato
 * promosso admin di ruolo senza esserlo di funzione. Sette copie sono anche
 * sette posti dove dimenticare di aggiungerla — `ownVat` non ce l'aveva.
 *
 * Adesso la domanda si fa in un posto solo e guarda `app_role`
 * (`canSeeEconomics`). Chi aggiunge un'azione economica chiama questa, o
 * l'azione nasce aperta.
 */
import { createClient } from '@/lib/supabase/server'
import { canSeeEconomics } from '@/lib/permissions'

export const ECONOMICS_DENIED = 'Permesso negato: il dominio economico è riservato agli admin'

/**
 * Chi sta scrivendo, se può. Altrimenti lancia — e lanciare è giusto: una
 * server action che ritorna un valore vuoto a chi non ha diritto racconta lo
 * stesso qualcosa (che la riga non c'è) e lascia credere di aver funzionato.
 */
export async function requireEconomicsAdmin(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles')
    .select('email, app_role').eq('id', user.id).maybeSingle()
  if (!canSeeEconomics(p)) throw new Error(ECONOMICS_DENIED)
  return user.id
}

/** La stessa domanda senza lanciare: serve alle pagine, che reindirizzano. */
export async function hasEconomicsAccess(): Promise<boolean> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return false
  const { data: p } = await sb.from('profiles')
    .select('email, app_role').eq('id', user.id).maybeSingle()
  return canSeeEconomics(p)
}
