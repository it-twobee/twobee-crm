/**
 * §501 — Le serie ad hoc: regole ricorrenti senza progetto.
 *
 * Il motore le genera come le altre (`lib/recurrence-run.ts`); qui stanno le
 * due cose che servono a chi le guarda: quali si leggono in una pagina, e chi
 * le può toccare. La seconda la usano sia le pagine — per non mostrare un
 * comando che rimbalzerebbe (§211) — sia l'azione, che è la porta vera.
 */
import { serieAdHoc } from '@/lib/recurrence-run'
import type { RecurringTaskTemplate } from '@/lib/types/database'

export type SerieAdHocRow = Pick<RecurringTaskTemplate,
  'id' | 'title' | 'client_id' | 'frequency' | 'interval' | 'weekdays' | 'day_of_month'
  | 'start_date' | 'end_date' | 'owner_id' | 'visibility' | 'active'> & { puoModificare: boolean }

/**
 * Una serie ad hoc è di chi la riceve e di chi l'ha scritta (§322), più l'admin.
 * Quelle di progetto restano a tutto lo staff, come prima: lì governa il progetto.
 */
export const puoToccareSerie = (
  r: { project_id: string | null; owner_id: string | null; created_by: string | null },
  io: string, admin: boolean,
) => !serieAdHoc(r) || admin || r.owner_id === io || r.created_by === io

const COLONNE = 'id, title, client_id, frequency, interval, weekdays, day_of_month, start_date, end_date, owner_id, created_by, visibility, active'

type Db = { from: (t: string) => { select: (q: string) => any } }

/**
 * `soloMie`: le liste personali mostrano quelle che ricevo o che ho scritto;
 * la sezione Task tutte quelle che la RLS lascia leggere.
 */
export async function caricaSerieAdHoc(db: Db, opts: { io: string; admin: boolean; soloMie: boolean }): Promise<SerieAdHocRow[]> {
  let q = db.from('recurring_task_templates').select(COLONNE).is('project_id', null).order('created_at')
  if (opts.soloMie) q = q.or(`owner_id.eq.${opts.io},created_by.eq.${opts.io}`)
  const { data } = await q
  return ((data ?? []) as (SerieAdHocRow & { created_by: string | null })[]).map(({ created_by, ...r }) => ({
    ...r, puoModificare: puoToccareSerie({ project_id: null, owner_id: r.owner_id, created_by }, opts.io, opts.admin),
  }))
}
