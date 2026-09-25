import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_PAYROLL_PARAMS } from '@/lib/payroll'
import { costoLavoroDaOrganico, rowToParams } from '@/lib/payroll-map'

/**
 * §443 — il costo del lavoro dei mesi a venire, dall'organico, per chi legge
 * la cassa (`economics/page.tsx`, `lib/prospetto-load.ts`).
 *
 * Due letture e nessuna scrittura: le persone e i parametri di ogni anno che
 * i mesi toccano — gennaio prossimo ha le aliquote di gennaio prossimo, se ci
 * sono, altrimenti quelle di default, come quando il mese si apre.
 *
 * Restituisce `null` se l'organico non si legge o è vuoto: allora chi chiama
 * torna alla stima di prima e continua a dirlo. Uno zero qui sarebbe la cassa
 * che promette ottomila euro al mese che non ci sono.
 */
export async function costoLavoroPrevisto(
  db: SupabaseClient,
  mesi: string[],
): Promise<Map<string, { totale: number; persone: number; tredicesima: number; quattordicesima: number }> | null> {
  if (!mesi.length) return new Map()
  let persone: Record<string, unknown>[] | null = null
  let parametri: Record<string, unknown>[] | null = null
  try {
    // i parametri sono una riga per anno: si prendono tutti e si sceglie qui
    const [p, q] = await Promise.all([
      db.from('hr_people').select('*').eq('is_active', true),
      db.from('hr_payroll_params').select('*'),
    ])
    if (p.error) return null
    persone = p.data as Record<string, unknown>[] | null
    parametri = q.data as Record<string, unknown>[] | null
  } catch { return null }
  if (!persone?.length) return null
  const perAnno = new Map((parametri ?? []).map(p => [Number(p.year), rowToParams(p)]))
  const out = new Map<string, { totale: number; persone: number; tredicesima: number; quattordicesima: number }>()
  for (const m of mesi) {
    out.set(m, costoLavoroDaOrganico(persone, perAnno.get(Number(m.slice(0, 4))) ?? DEFAULT_PAYROLL_PARAMS, m))
  }
  return out
}
