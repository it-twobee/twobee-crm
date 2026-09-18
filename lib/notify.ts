/**
 * §350 — «ti hanno assegnato una cosa»: la sola notifica che nel portale
 * operativo serviva davvero.
 *
 * Prima ne nascevano tre specie — cliente perso, richiesta di accesso, nuovo
 * lead — e tutte e tre indirizzate agli **admin**: un junior o un senior aveva
 * una campanella che non avrebbe suonato mai. Chi riceve un lavoro lo scopriva
 * ricaricando la lista, cioè quando gli veniva in mente di guardare.
 *
 * Tre regole, e sono tutte «quando **non** si scrive»:
 *
 * - **mai a sé stessi.** Una notifica per una cosa appena fatta da chi la legge
 *   insegna a ignorare la campanella, e da lì non si torna indietro;
 * - **mai dal motore delle ricorrenze.** Trenta occorrenze al mese, tutte
 *   uguali, seppellirebbero le tre righe che contano: la regola si assegna una
 *   volta e quella assegnazione la notifica chi l'ha fatta;
 * - **mai a costo dell'operazione.** Se la scrittura inciampa, l'assegnazione
 *   resta: il lavoro è assegnato lo stesso e la riga sulla lista c'è. Il
 *   contrario — perdere l'assegnazione perché la notifica è fallita — sarebbe
 *   il danno peggiore.
 *
 * Il destinatario si scrive su **tutte e due** le colonne (`user_id` e
 * `profile_id`): la 232 le tiene uguali con un trigger, ma finché non è
 * applicata la campanella e la RLS guardano due colonne diverse, e una riga a
 * metà è una notifica che il database consegna e lo schermo non mostra.
 */
import { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/** dove la trova chi la riceve: una rotta che regge tutti e due i portali */
export const LINK_MIE_ATTIVITA = '/workspace/attivita'

export async function notificaAssegnazione(opts: {
  /** chi riceve il lavoro */
  destinatario: string | null | undefined
  /** chi ha deciso: se coincide col destinatario non si scrive niente */
  autore: string
  titolo: string
  /** «Assegnata da …» lo compone questa funzione: qui ci va il contesto */
  dettaglio?: string | null
  link?: string
  tipo?: 'task_assigned' | 'milestone_assigned'
  db?: Db
}) {
  const { destinatario, autore } = opts
  if (!destinatario || destinatario === autore) return
  try {
    const db = opts.db ?? createAdminClient()
    const { data: chi } = await db.from('profiles').select('full_name').eq('id', autore).maybeSingle()
    const nome = (chi as { full_name?: string } | null)?.full_name ?? 'un collega'
    await db.from('notifications').insert({
      user_id: destinatario, profile_id: destinatario,
      type: opts.tipo ?? 'task_assigned',
      title: opts.titolo,
      body: `Assegnata da ${nome}${opts.dettaglio ? ` · ${opts.dettaglio}` : ''}`,
      link: opts.link ?? LINK_MIE_ATTIVITA,
    })
  } catch { /* il lavoro è assegnato lo stesso: la riga sulla lista c'è */ }
}
