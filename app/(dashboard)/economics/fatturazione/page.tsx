import { createClient } from '@/lib/supabase/server'
import { getSessionUser, getSessionProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { InvoicesClient } from '@/components/invoices/InvoicesClient'
import { monthKey, shiftMonth } from '@/lib/pl'
import { linesForMonth, type Installment, type RevenueStream } from '@/lib/revenue'
import { billingSeries, withRectifications } from '@/lib/invoices'
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
    /* §323 — le colonne, non `*`: `raw_xml` è il documento intero, e su un
       archivio con quattro note di credito che si portano dietro il PDF della
       fattura stornata erano mezzo megabyte spediti al browser a ogni
       caricamento per non leggerne un carattere. Il file resta dov'è: è la
       prova, e si rilegge quando serve davvero. */
    supabase.from('invoices')
      .select('id, direction, doc_type, number, issued_on, counterparty_name, counterparty_vat, '
        + 'client_id, taxable, vat_amount, total, sign, due_date, paid_on, pdf_path, '
        + 'excluded_reason, warnings, sent_on, from_sdi, rectifies_id')
      .order('issued_on', { ascending: false }),
    supabase.from('clients').select('id, company_name, display_name, piva').order('company_name'),
  ])

  // 42P01 = la 198 non è stata eseguita. Va detto, non fatto fallire.
  const setupNeeded = error?.code === '42P01'
  /* §323 — 42703 = la 219 non c'è ancora e mancano le colonne dello stato. La
     pagina deve accendersi lo stesso, senza il viaggio del documento e senza gli
     storni: una sezione che sparisce per una migration non applicata nasconde
     anche tutto quello che funzionava. */
  const statesReady = error?.code !== '42703'

  const { data: rowsSafe } = statesReady
    ? { data: rows }
    : await supabase.from('invoices').select('*').order('issued_on', { ascending: false })

  const [{ data: rev }, { data: cost }, { data: txs }, { data: streams }, { data: inst }] = setupNeeded
    ? [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }]
    : await Promise.all([
        supabase.from('pl_revenue_lines')
          .select('id, label, client_id, amount_net, vat_rate, invoice_id, pl_months!inner(month)'),
        supabase.from('pl_cost_lines')
          .select('id, label, actual, budget, vat_rate, invoice_id, pl_months!inner(month)'),
        supabase.from('bank_transactions')
          .select('id, booked_on, amount, description, counterparty, invoice_id')
          .order('booked_on', { ascending: false }),
        /* §278 — il previsionale di fatturato non si inventa: sono i contratti
           già firmati, gli stessi che alimentano il conto economico (§176). */
        supabase.from('revenue_streams').select('*'),
        supabase.from('revenue_installments').select('*'),
      ])

  const n = (v: unknown) => Number(v ?? 0)

  const invoices: Invoice[] = withRectifications((rowsSafe ?? []).map((r: Record<string, unknown>) => ({
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
    pdfPath: (r.pdf_path as string) ?? null,
    // §281 — se c'è, la fattura è fuori dai conti e il testo dice perché
    excludedReason: (r.excluded_reason as string) ?? null,
    warnings: (r.warnings as string[]) ?? undefined,
    /* §323 — il viaggio del documento e lo storno. `from_sdi` è generata dal
       database sul fatto: c'è l'XML, quindi è transitata. */
    fromSdi: r.from_sdi === true,
    sentOn: (r.sent_on as string) ?? null,
    rectifiesId: (r.rectifies_id as string) ?? null,
  })))

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

  /* Da questo mese a dicembre: la domanda è «quanto fattureremo entro fine
     anno», e un previsionale che si ferma all'ultima rata firmata nasconde
     proprio i mesi vuoti, che sono l'informazione. */
  const today = new Date().toISOString().slice(0, 10)
  const nowM = monthKey(new Date(today))
  const forecast: { month: string; amount: number }[] = []
  for (let m = nowM; m <= `${nowM.slice(0, 4)}-12-01`; m = shiftMonth(m, 1)) {
    const righe = linesForMonth(
      (streams ?? []) as unknown as RevenueStream[], (inst ?? []) as unknown as Installment[], m)
    forecast.push({ month: m, amount: Math.round(righe.reduce((s2, l) => s2 + l.amount_net, 0) * 100) / 100 })
  }

  return (
    <InvoicesClient
      series={billingSeries(invoices, today, forecast)}
      month={month}
      setupNeeded={setupNeeded}
      statesReady={statesReady}
      today={today}
      invoices={invoices}
      lines={lines}
      txs={transactions}
      clients={(clients ?? []).map((c: Record<string, unknown>) => ({
        id: String(c.id), name: String(c.display_name || c.company_name),
      }))}
    />
  )
}
