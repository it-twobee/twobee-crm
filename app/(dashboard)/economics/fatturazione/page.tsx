import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { InvoicesClient } from '@/components/invoices/InvoicesClient'
import { monthKey } from '@/lib/pl'
import type { Invoice, LineRef, TxRef } from '@/lib/invoices'

export const revalidate = 0

/**
 * §211 — Fatture.
 *
 * Carica i documenti **e** ciò a cui devono agganciarsi: righe di conto
 * economico, voci di costo, movimenti di banca. Tutto insieme e non a richiesta,
 * perché la domanda che questa pagina esiste per rispondere — «cosa non
 * combacia» — non si può porre su una metà dei dati.
 */
export default async function FatturePage({ searchParams }: { searchParams: { m?: string } }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const profile = await getSessionProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const month = /^\d{4}-\d{2}-01$/.test(searchParams.m ?? '') ? searchParams.m! : monthKey(new Date())

  const [{ data: rows, error }, { data: clients }] = await Promise.all([
    supabase.from('invoices').select('*').order('issued_on', { ascending: false }),
    supabase.from('clients').select('id, company_name, display_name, piva').order('company_name'),
  ])

  // 42P01 = la 198 non è stata eseguita. Va detto, non fatto fallire.
  const setupNeeded = error?.code === '42P01'

  const [{ data: rev }, { data: cost }, { data: txs }] = setupNeeded
    ? [{ data: [] }, { data: [] }, { data: [] }]
    : await Promise.all([
        supabase.from('pl_revenue_lines')
          .select('id, label, client_id, amount_net, vat_rate, invoice_id, pl_months!inner(month)'),
        supabase.from('pl_cost_lines')
          .select('id, label, actual, budget, vat_rate, invoice_id, pl_months!inner(month)'),
        supabase.from('bank_transactions')
          .select('id, booked_on, amount, description, counterparty, invoice_id')
          .order('booked_on', { ascending: false }),
      ])

  const n = (v: unknown) => Number(v ?? 0)

  const invoices: Invoice[] = (rows ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    direction: r.direction === 'ricevuta' ? 'ricevuta' : 'emessa',
    docType: String(r.doc_type ?? 'TD01'),
    number: String(r.number ?? '—'),
    issuedOn: String(r.issued_on),
    counterpartyName: String(r.counterparty_name ?? 'Senza nome'),
    counterpartyVat: (r.counterparty_vat as string) ?? null,
    clientId: (r.client_id as string) ?? null,
    taxable: n(r.taxable), vatAmount: n(r.vat_amount), total: n(r.total),
    sign: r.sign === -1 ? -1 : 1,
    dueDate: (r.due_date as string) ?? null,
    paidOn: (r.paid_on as string) ?? null,
    warnings: (r.warnings as string[]) ?? undefined,
  }))

  const lines: LineRef[] = [
    ...(rev ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), kind: 'ricavo' as const,
      month: String((r.pl_months as { month: string }).month),
      label: String(r.label), clientId: (r.client_id as string) ?? null,
      net: n(r.amount_net), vatRate: n(r.vat_rate), invoiceId: (r.invoice_id as string) ?? null,
    })),
    ...(cost ?? []).map((c: Record<string, unknown>) => ({
      id: String(c.id), kind: 'costo' as const,
      month: String((c.pl_months as { month: string }).month),
      label: String(c.label), clientId: null,
      // sul costo il fatto è l'effettivo; finché è zero vale il preventivato
      net: n(c.actual) > 0 ? n(c.actual) : n(c.budget),
      vatRate: n(c.vat_rate), invoiceId: (c.invoice_id as string) ?? null,
    })),
  ]

  const transactions: TxRef[] = (txs ?? []).map((t: Record<string, unknown>) => ({
    id: String(t.id), bookedOn: String(t.booked_on), amount: n(t.amount),
    description: String(t.description ?? ''), counterparty: (t.counterparty as string) ?? null,
    invoiceId: (t.invoice_id as string) ?? null,
  }))

  return (
    <InvoicesClient
      month={month}
      setupNeeded={setupNeeded}
      today={new Date().toISOString().slice(0, 10)}
      invoices={invoices}
      lines={lines}
      txs={transactions}
      clients={(clients ?? []).map((c: Record<string, unknown>) => ({
        id: String(c.id), name: String(c.display_name || c.company_name),
      }))}
    />
  )
}
