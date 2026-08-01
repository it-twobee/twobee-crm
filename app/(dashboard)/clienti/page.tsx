import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientiList } from '@/components/clients/ClientiList'
import type { Client, Profile } from '@/lib/types/database'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { PROFILE_COLUMNS } from '@/lib/profile-columns'
import { monthKey } from '@/lib/pl'
import type { ClientEconomicsSummary } from '@/components/clients/ClientiList'

export const revalidate = 30

export default async function ClientiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).single()
  if (!profile) redirect('/login')

  const isAdminLevel = SUPER_ADMIN_EMAILS.includes(profile.email) || ['admin', 'manager'].includes(profile.app_role ?? '')

  let clients: Client[] = []

  if (isAdminLevel) {
    // Admin e manager vedono tutti i clienti
    const { data } = await supabase.from('clients').select('*').order('company_name')
    clients = (data ?? []) as Client[]
  } else {
    // Senior, junior, viewer: solo i clienti assegnati
    const { data: assignments } = await supabase
      .from('user_client_assignments')
      .select('client_id')
      .eq('user_id', user.id)
    const clientIds = (assignments ?? []).map((a: { client_id: string }) => a.client_id)
    if (clientIds.length > 0) {
      const { data } = await supabase.from('clients').select('*').in('id', clientIds).order('company_name')
      clients = (data ?? []) as Client[]
    }
  }


  /* §176/§177: la lista leggeva `clients.mrr`, che è un residuo d'anagrafica.
     Il canone di un cliente è la somma dei suoi contratti; i lavori a corpo
     sono un'altra cosa ancora e vanno visti a parte, non sommati al canone.
     Tutto calcolato qui, in due query, invece che riga per riga. */
  const eco: Record<string, ClientEconomicsSummary> = {}

  if (isAdminLevel && clients.length) {
    const month = monthKey(new Date())
    /* Le rate si filtrano per cliente attraversando il contratto, e le righe
       del mese per la data del mese: nessuna delle due ha bisogno di sapere
       prima gli id, quindi parte tutto insieme invece che in tre ondate. */
    const [{ data: streams }, { data: inst }, { data: lines }] = await Promise.all([
      supabase.from('revenue_streams').select('id, client_id, amount, billing, status, project_id'),
      supabase.from('revenue_installments').select('stream_id, amount, paid'),
      supabase.from('pl_revenue_lines')
        .select('client_id, project_id, label, amount_net, paid, pl_months!inner(month)')
        .eq('pl_months.month', month),
    ])

    type S = { id: string; client_id: string | null; amount: unknown; billing: string; status: string }
    const byStream = new Map((streams ?? []).map((x: S) => [x.id, x]))
    const n = (v: unknown) => Number(v ?? 0)

    for (const c of clients) {
      const own = ((streams ?? []) as S[]).filter(x => x.client_id === c.id)
      const sold = own.filter(x => x.status !== 'bozza')
      const openInst = ((inst ?? []) as { stream_id: string; amount: unknown; paid: boolean }[])
        .filter(i => !i.paid && byStream.get(i.stream_id)?.client_id === c.id)
      const ownLines = ((lines ?? []) as { client_id: string | null; label: string; amount_net: unknown; paid: boolean }[])
        .filter(l => l.client_id === c.id)
      const unpaid = ownLines.filter(l => !l.paid)
      const ownInst = ((inst ?? []) as { stream_id: string }[])
        .filter(i => byStream.get(i.stream_id)?.client_id === c.id)

      eco[c.id] = {
        recurring: own.filter(x => x.status === 'attivo' && x.billing === 'recurring').reduce((t, x) => t + n(x.amount), 0),
        oneOff: sold.filter(x => x.billing === 'one_off').reduce((t, x) => t + n(x.amount), 0),
        // di quel lavoro a corpo, quanto deve ancora entrare
        oneOffOpen: openInst.reduce((t, i) => t + n(i.amount), 0),
        contracts: sold.length,
        quoted: sold.filter(x => x.billing === 'one_off').length,
        // §177: senza rate e senza righe di mese lo stato pagamenti non è
        // calcolabile — il valore in colonna è un residuo, e va detto
        hasBilling: ownLines.length > 0 || ownInst.length > 0,
        unpaidCount: unpaid.length,
        unpaidAmount: unpaid.reduce((t, l) => t + n(l.amount_net), 0),
        unpaidLabels: unpaid.slice(0, 3).map(l => l.label),
      }
    }
  }

  return <ClientiList clients={clients} currentProfile={profile as Profile} economics={eco} />
}
