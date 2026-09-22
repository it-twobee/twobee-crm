'use server'

/**
 * §390 — aprire i periodi di un progetto, dal bottone.
 *
 * Qui c'è solo la porta: chi sei, e poi la stessa funzione che chiama il
 * giro notturno. Il cuore sta in `lib/periodi-apertura.ts` e non qui,
 * perché un file `'use server'` esporta endpoint (§329) e quella funzione
 * serve anche alla route del cron.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apriPerProgetto, type EsitoPeriodi } from '@/lib/periodi-apertura'

export type { EsitoPeriodi }

async function requireStaff(): Promise<string> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (p?.role !== 'admin' && p?.role !== 'team') throw new Error('Permesso negato')
  return user.id
}

export async function apriPeriodi(
  projectId: string,
  /** §400 — dal wizard, sul progetto appena creato: niente copertura da corsie
   *  che sono nate un istante fa e hanno le date del progetto */
  opzioni: { allaCreazione?: boolean } = {},
): Promise<EsitoPeriodi> {
  const uid = await requireStaff()
  const esito = await apriPerProgetto(createAdminClient(), uid, projectId, opzioni)
  revalidatePath(`/progetti/${projectId}`)
  revalidatePath('/progetti')
  revalidatePath(`/workspace/progetti/${projectId}`)
  return esito
}
