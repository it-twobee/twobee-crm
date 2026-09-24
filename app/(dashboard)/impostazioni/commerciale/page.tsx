import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { puoConfigurareSales } from '@/lib/sales-guard'
import { leggiFasi } from '@/lib/sales-fasi'
import { FasiCommercialiClient } from '@/components/impostazioni/FasiCommercialiClient'
import { Ban, Flag, BadgeCheck } from 'lucide-react'
import { ElencoVociClient } from '@/components/impostazioni/ElencoVociClient'
import type { Motivo } from '@/lib/sales-motivi'
import { leggiScelte } from '@/lib/sales-fasi'
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
    db.from('deals').select('stage, motivo_perso, priority, membership'),
    /* Le stesse persone che `setSalesPermission` accetta: attive e del workspace. */
    db.from('profiles').select('id, full_name, app_role, is_active')
      .in('app_role', WORKSPACE_ROLES).or('is_active.is.null,is_active.eq.true').order('full_name'),
    db.from('profile_permissions').select('profile_id').eq('permission', 'can_view_deals').eq('granted', true),
    /* tutti, anche i ritirati: l'editor li mostra spenti invece di farli sparire */
    db.from('sales_motivi_perso').select('chiave, etichetta, ordine, attivo').order('ordine'),
  ])
  const conta: Record<string, number> = {}
  const perMotivo: Record<string, number> = {}
  const perPriorita: Record<string, number> = {}
  const perMembership: Record<string, number> = {}
  const piu = (m: Record<string, number>, k: string | null) => { if (k) m[k] = (m[k] ?? 0) + 1 }
  for (const r of (data ?? []) as { stage: string | null; motivo_perso: string | null; priority: string | null; membership: string | null }[]) {
    const k = r.stage ?? ''
    conta[k] = (conta[k] ?? 0) + 1
    piu(perMotivo, r.motivo_perso)
    piu(perPriorita, r.priority)
    piu(perMembership, r.membership)
  }
  const scelte = await leggiScelte()
  const icona = (I: typeof Ban) => <I className="w-4 h-4 text-gold-text" />

  const abilitati = new Set((grant ?? []).map(g => g.profile_id as string))
  const persone: PersonaAccesso[] = ((profili ?? []) as { id: string; full_name: string | null; app_role: AppRole }[])
    .map(p => ({ id: p.id, nome: p.full_name || 'Senza nome', ruolo: p.app_role, abilitato: abilitati.has(p.id) }))

  return (
    <div className="p-4 sm:p-6 space-y-10">
      <FasiCommercialiClient fasi={fasi} conta={conta} />
      <ElencoVociClient tipo="motivi" titolo="Motivi del perso" icona={icona(Ban)} colonnaConta="Persi"
        segnaposto="Perché si è chiuso" voci={(motivi ?? []) as Motivo[]} conta={perMotivo}
        spiega="Le risposte fra cui si sceglie quando un lead si chiude senza esito, e le righe di «perché perdiamo». Un motivo già usato non si elimina: si ritira, e resta scritto sui persi che lo hanno." />
      {/* §436 — le chiavi sono i valori già salvati sui lead e non cambiano:
          si rinomina l'etichetta, e le righe seguono senza toccarle. */}
      <ElencoVociClient tipo="priority" titolo="Priorità" icona={icona(Flag)} colonnaConta="Lead"
        segnaposto="Nome della priorità" voci={scelte.priority} conta={perPriorita}
        spiega="Le voci della colonna Priority. L'ordine qui è l'ordine con cui si ordina l'elenco dei lead. Una voce usata si ritira, non si elimina." />
      <ElencoVociClient tipo="membership" titolo="Membership" icona={icona(BadgeCheck)} colonnaConta="Lead"
        segnaposto="Nome della membership" voci={scelte.membership} conta={perMembership}
        spiega="Le voci della colonna Membership. Una voce usata si ritira, non si elimina." />
      <AccessoCommercialeClient persone={persone} />
    </div>
  )
}
