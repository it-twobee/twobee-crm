'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSalesAccess } from '@/lib/sales-guard'
import { uuid } from '@/lib/sales'
import { GRUPPI } from '@/lib/sales-stages'
import { leggi, scrivi } from '@/lib/sales-vista'

/**
 * §440 — le viste salvate dell'elenco dei lead.
 *
 * `sales_viste` non ha la cronologia (è una preferenza, non un dato del
 * lavoro), quindi basta il service role — ma ogni azione passa da
 * `requireSalesAccess`, e chi modifica o elimina è l'autore o un admin: una
 * vista condivisa si legge, non si riscrive.
 */

export type VistaSalvata = { id: string; nome: string; query: string; condivisa: boolean; mia: boolean; autore: string }

const GRUPPI_AMMESSI = ['tutti', ...GRUPPI]

function errore(e: { code?: string; message: string }): never {
  if (['42P01', 'PGRST205'].includes(e.code ?? '')) throw new Error('Viste salvate da attivare: manca la migration sul database')
  if (e.code === '23505') throw new Error('Hai già una vista con questo nome')
  if (e.code === '23514') throw new Error('Il nome va da 1 a 60 caratteri')
  console.error('Viste', e.code, e.message)
  throw new Error('Operazione non riuscita. Riprova.')
}

export async function leggiViste(): Promise<VistaSalvata[]> {
  const { actor } = await requireSalesAccess()
  const admin = createAdminClient()
  const { data, error } = await admin.from('sales_viste')
    .select('id, nome, query, condivisa, owner_id, profiles:owner_id(full_name)')
    .or(`owner_id.eq.${actor},condivisa.eq.true`).order('nome')
  // prima della migration non ci sono viste: l'elenco funziona lo stesso
  if (error) return []
  return ((data ?? []) as unknown as { id: string; nome: string; query: string; condivisa: boolean; owner_id: string; profiles: { full_name: string | null } | null }[])
    .map(v => ({ id: v.id, nome: v.nome, query: v.query, condivisa: v.condivisa, mia: v.owner_id === actor, autore: v.profiles?.full_name ?? 'Ex collega' }))
}

export async function salvaVista(input: { nome: unknown; query: unknown; condivisa: unknown; id?: unknown }) {
  const { actor, access } = await requireSalesAccess()
  const nome = typeof input.nome === 'string' ? input.nome.trim() : ''
  if (!nome || nome.length > 60) throw new Error('Il nome va da 1 a 60 caratteri')
  if (typeof input.query !== 'string' || input.query.length > 2000) throw new Error('Vista non valida')
  // passa dal lettore: entra solo quello che l'elenco sa applicare
  const query = scrivi(leggi(input.query, GRUPPI_AMMESSI))
  const condivisa = input.condivisa === true
  const admin = createAdminClient()

  if (input.id !== undefined) {
    uuid(input.id)
    const { data: v } = await admin.from('sales_viste').select('owner_id').eq('id', input.id).maybeSingle()
    if (!v) throw new Error('Questa vista non c’è più')
    if (v.owner_id !== actor && access !== 'admin') throw new Error('La modifica chi l’ha creata')
    const { error } = await admin.from('sales_viste').update({ nome, query, condivisa, updated_at: new Date().toISOString() }).eq('id', input.id)
    if (error) errore(error)
  } else {
    const { error } = await admin.from('sales_viste').insert({ owner_id: actor, nome, query, condivisa })
    if (error) errore(error)
  }
  revalidatePath('/commerciale')
  revalidatePath('/workspace/commerciale')
  return leggiViste()
}

export async function eliminaVista(id: string) {
  const { actor, access } = await requireSalesAccess()
  uuid(id)
  const admin = createAdminClient()
  const { data: v } = await admin.from('sales_viste').select('owner_id').eq('id', id).maybeSingle()
  if (!v) return leggiViste()
  if (v.owner_id !== actor && access !== 'admin') throw new Error('La elimina chi l’ha creata')
  const { error } = await admin.from('sales_viste').delete().eq('id', id)
  if (error) errore(error)
  return leggiViste()
}
