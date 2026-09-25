import { createClient } from '@/lib/supabase/server'
import { CaricaClient } from '@/components/economics/CaricaClient'
import type { Conto } from '@/lib/carica'

export const revalidate = 0

/**
 * §449 — la pagina unica di caricamento. Il gate è quello del layout di
 * `economics/` (`hasEconomicsAccess`), e ogni import ripassa dal suo
 * `requireEconomicsAdmin`: la pagina non apre porte nuove, le mette in fila.
 */
export default async function CaricaPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('bank_accounts').select('id, label, bank_name, is_primary').eq('is_active', true).order('is_primary', { ascending: false })
  return <CaricaClient conti={(data ?? []) as Conto[]} />
}
