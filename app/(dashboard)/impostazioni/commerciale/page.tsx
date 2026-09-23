import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { puoConfigurareSales } from '@/lib/sales-guard'
import { leggiFasi } from '@/lib/sales-fasi'
import { FasiCommercialiClient } from '@/components/impostazioni/FasiCommercialiClient'

export const revalidate = 0

export default async function ConfigCommercialePage() {
  /* Il gate non è la voce di menu: la pagina rilegge il ruolo dal database, e
     l'azione che salva lo richiede di nuovo per conto suo (§329). */
  if (!(await puoConfigurareSales())) redirect('/dashboard')

  const fasi = await leggiFasi()

  /* Quante trattative stanno su ogni fase. Serve a due cose: far vedere cosa si
     sta spostando prima di toccarlo, e spiegare **perché** una fase non si può
     eliminare invece di lasciarlo scoprire al salvataggio. */
  const { data } = await createAdminClient().from('deals').select('stage')
  const conta: Record<string, number> = {}
  for (const r of (data ?? []) as { stage: string | null }[]) {
    const k = r.stage ?? ''
    conta[k] = (conta[k] ?? 0) + 1
  }

  return (
    <div className="p-4 sm:p-6">
      <FasiCommercialiClient fasi={fasi} conta={conta} />
    </div>
  )
}
