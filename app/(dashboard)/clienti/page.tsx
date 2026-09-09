import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ClientiList } from '@/components/clients/ClientiList'
import type { Client, Profile } from '@/lib/types/database'
import { SUPER_ADMIN_EMAILS } from '@/lib/permissions'
import { PROFILE_COLUMNS } from '@/lib/profile-columns'
import { monthKey } from '@/lib/pl'
import { risksFor, type RiskResult } from '@/lib/risk'
import { withRectifications, type Invoice } from '@/lib/invoices'
import { clientBilling } from '@/lib/client-billing'
import type { ClientEconomicsSummary } from '@/components/clients/ClientiList'

export const revalidate = 30

export default async function ClientiPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const profile = await getSessionProfile()
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
  let risks: Record<string, RiskResult> = {}

  if (isAdminLevel && clients.length) {
    const month = monthKey(new Date())
    /* Le rate si filtrano per cliente attraversando il contratto, e le righe
       per il cliente: nessuna delle due ha bisogno di sapere prima gli id,
       quindi parte tutto insieme invece che in tre ondate.
       Le righe arrivano di **tutti** i mesi, non solo del corrente: il rischio
       si legge sullo storico — tre mesi contro tre, e da quanto un credito è
       scoperto — e su 41 righe filtrare qui costa meno di una query in più. */
    const [{ data: streams }, { data: inst }, { data: lines }, { data: invoiceRows }] = await Promise.all([
      supabase.from('revenue_streams').select('id, client_id, amount, billing, status, project_id, end_date'),
      supabase.from('revenue_installments').select('stream_id, amount, paid, due_month'),
      supabase.from('pl_revenue_lines')
        .select('client_id, project_id, label, amount_net, paid, invoice_id, pl_months!inner(month)'),
      /* §326 — le fatture emesse, tutte. Lo scaduto di un cliente è cumulativo:
         una fattura di luglio è dovuta anche a settembre, e filtrarla per mese
         la farebbe sparire proprio dalla colonna che esiste per mostrarla.
         Le colonne, non `*`: qui l'XML non serve. */
      supabase.from('invoices')
        .select('id, direction, doc_type, number, issued_on, counterparty_name, counterparty_vat, '
          + 'client_id, taxable, vat_amount, total, sign, due_date, paid_on, excluded_reason, rectifies_id')
        .eq('direction', 'emessa'),
    ])

    type S = { id: string; client_id: string | null; amount: unknown; billing: string; status: string; end_date: string | null }
    type L = { client_id: string | null; label: string; amount_net: unknown; paid: boolean; invoice_id: string | null; pl_months: { month: string } }
    type I = { stream_id: string; amount: unknown; paid: boolean; due_month: string }
    const byStream = new Map((streams ?? []).map((x: S) => [x.id, x]))
    const n = (v: unknown) => Number(v ?? 0)
    const allLines = (lines ?? []) as unknown as L[]

    risks = risksFor({ clients, streams: (streams ?? []) as S[], installments: (inst ?? []) as I[], lines: allLines })

    /* §326 — lo stesso motore della Fatturazione (`lib/invoices.ts`), non una
       seconda somma scritta qui: se questa colonna dicesse un numero diverso
       dal «da incassare» di Fatturazione, una delle due pagine starebbe
       mentendo e non si saprebbe quale. `withRectifications` perché una fattura
       che una nota di credito ha annullato non è un credito da inseguire. */
    const fatture: Invoice[] = withRectifications(
      ((invoiceRows ?? []) as unknown as Record<string, unknown>[]).map(r => ({
        id: String(r.id), direction: 'emessa' as const, docType: String(r.doc_type ?? 'TD01'),
        number: String(r.number ?? '—'), issuedOn: String(r.issued_on),
        counterpartyName: String(r.counterparty_name ?? ''),
        counterpartyVat: (r.counterparty_vat as string) ?? null,
        clientId: (r.client_id as string) ?? null,
        taxable: n(r.taxable), vatAmount: n(r.vat_amount), total: n(r.total),
        sign: r.sign === -1 ? -1 as const : 1 as const,
        dueDate: (r.due_date as string) ?? null, paidOn: (r.paid_on as string) ?? null,
        excludedReason: (r.excluded_reason as string) ?? null,
        rectifiesId: (r.rectifies_id as string) ?? null,
      })))
    const today = new Date().toISOString().slice(0, 10)

    for (const c of clients) {
      const own = ((streams ?? []) as S[]).filter(x => x.client_id === c.id)
      const sold = own.filter(x => x.status !== 'bozza')
      const openInst = ((inst ?? []) as I[])
        .filter(i => !i.paid && byStream.get(i.stream_id)?.client_id === c.id)
      const ownLines = allLines.filter(l => l.client_id === c.id && l.pl_months?.month === month)
      const unpaid = ownLines.filter(l => !l.paid)
      const ownInst = ((inst ?? []) as I[])
        .filter(i => byStream.get(i.stream_id)?.client_id === c.id)

      /* §326 — il ciclo di fatturazione: pagato / da emettere / non pagato, e
         lo scaduto cumulativo che la colonna Pagamenti mostra. */
      const fatt = clientBilling(
        fatture.filter(i => i.clientId === c.id),
        ownLines.map(l => ({
          clientId: l.client_id, month, amountNet: n(l.amount_net), invoiceId: l.invoice_id,
        })),
        today)

      eco[c.id] = {
        billing: fatt,
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

  return <ClientiList clients={clients} currentProfile={profile as Profile} economics={eco} risks={risks} />
}
