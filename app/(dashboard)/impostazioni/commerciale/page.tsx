import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { puoConfigurareSales } from '@/lib/sales-guard'
import { leggiFasi } from '@/lib/sales-fasi'
import { FasiCommercialiClient } from '@/components/impostazioni/FasiCommercialiClient'
import { MotiviPersoClient } from '@/components/impostazioni/MotiviPersoClient'
import type { Motivo } from '@/lib/sales-motivi'
import { AccessoCommercialeClient, type PersonaAccesso } from '@/components/impostazioni/AccessoCommercialeClient'
import { WORKSPACE_ROLES } from '@/lib/permissions'
import type { AppRole } from '@/lib/types/database'

export const revalidate = 0

export default async function ConfigCommercialePage() {
  /* Il gate non è la voce di menu: la pagina rilegge il ruolo dal database, e
     l'azione che salva lo richiede di nuovo per conto suo (§329). */
  if (!(await puoConfigurareSales())) redirect('/dashboard')

  const fasi = await leggiFasi()

  /* Quante trattative stanno su ogni fase. Serve a due cose: far vedere cosa si
     sta spostando prima di toccarlo, e spiegare **perché** una fase non si può
     eliminare invece di lasciarlo scoprire al salvataggio. */
  const db = createAdminClient()
  const [{ data }, { data: profili }, { data: grant }, { data: motivi }] = await Promise.all([
    db.from('deals').select('stage, motivo_perso'),
    /* Le stesse persone che `setSalesPermission` accetta: attive e del workspace. */
    db.from('profiles').select('id, full_name, app_role, is_active')
      .in('app_role', WORKSPACE_ROLES).or('is_active.is.null,is_active.eq.true').order('full_name'),
    db.from('profile_permissions').select('profile_id').eq('permission', 'can_view_deals').eq('granted', true),
    /* tutti, anche i ritirati: l'editor li mostra spenti invece di farli sparire */
    db.from('sales_motivi_perso').select('chiave, etichetta, ordine, attivo').order('ordine'),
  ])
  const conta: Record<string, number> = {}
  const perMotivo: Record<string, number> = {}
  for (const r of (data ?? []) as { stage: string | null; motivo_perso: string | null }[]) {
    const k = r.stage ?? ''
    conta[k] = (conta[k] ?? 0) + 1
    if (r.motivo_perso) perMotivo[r.motivo_perso] = (perMotivo[r.motivo_perso] ?? 0) + 1
  }

  const abilitati = new Set((grant ?? []).map(g => g.profile_id as string))
  const persone: PersonaAccesso[] = ((profili ?? []) as { id: string; full_name: string | null; app_role: AppRole }[])
    .map(p => ({ id: p.id, nome: p.full_name || 'Senza nome', ruolo: p.app_role, abilitato: abilitati.has(p.id) }))

  return (
    <div className="p-4 sm:p-6 space-y-10">
      <FasiCommercialiClient fasi={fasi} conta={conta} />
      <MotiviPersoClient motivi={(motivi ?? []) as Motivo[]} conta={perMotivo} />
      <AccessoCommercialeClient persone={persone} />
    </div>
  )
}
