/**
 * Fonte unica dei calcoli economici lato client.
 *
 * Prima della Fase 1 l'MRR era una `reduce` su `clients.mrr` ripetuta in sei
 * componenti con TRE filtri diversi (chi escludeva i clienti persi, chi no, chi
 * escludeva gli interni): tre numeri divergenti per la stessa metrica.
 *
 * Ora `clients.mrr` è DERIVATO da `revenue_streams` (trigger `rs_sync_client_mrr`
 * + `refresh_all_client_mrr()`): vale 0 per i contratti cessati o scaduti. Quindi
 * il filtro per `client_label` non serve più — anzi è dannoso, perché un cliente
 * `in_bilico` con contratto attivo va contato.
 *
 * Le formule qui replicano quelle SQL di `116_revenue_streams.sql`. Se cambia
 * una, cambia anche l'altra.
 */

import type { Client, RevenueStream, BillingFrequency, Invoice } from '@/lib/types/database'

/** Normalizza un importo alla sua quota mensile. Speculare a `rs_monthly_amount()`. */
export function monthlyAmount(amount: number, freq: BillingFrequency | null): number {
  switch (freq) {
    case 'mensile':     return amount
    case 'bimestrale':  return amount / 2
    case 'trimestrale': return amount / 3
    case 'semestrale':  return amount / 6
    case 'annuale':     return amount / 12
    default:            return 0
  }
}

type MrrClient = Pick<Client, 'mrr' | 'is_internal'>

/**
 * MRR aziendale: somma dei canoni dei clienti esterni.
 * Nessun filtro su `client_label`: ci pensa già la derivazione da revenue_streams.
 */
export function totalMrr(clients: MrrClient[]): number {
  return clients
    .filter(c => !c.is_internal)
    .reduce((s, c) => s + (c.mrr ?? 0), 0)
}

/** MRR per linea di servizio. Richiede gli stream: `clients.mrr` è già aggregato. */
export function mrrByServiceLine(streams: RevenueStream[]): Record<string, number> {
  const out: Record<string, number> = {}
  const today = new Date().toISOString().slice(0, 10)
  for (const s of streams) {
    if (s.status !== 'attivo') continue
    if (s.revenue_model !== 'recurring' && s.revenue_model !== 'maintenance') continue
    if (s.start_date > today) continue
    if (s.end_date && s.end_date < today) continue
    out[s.service_line] = (out[s.service_line] ?? 0) + monthlyAmount(s.amount, s.billing_frequency)
  }
  return out
}

/** Imponibile di una fattura, col segno invertito per le note di credito. */
export function signedTaxable(inv: Pick<Invoice, 'invoice_type' | 'taxable_amount' | 'amount'>): number {
  const value = inv.taxable_amount ?? inv.amount ?? 0
  return inv.invoice_type === 'nota_credito' ? -value : value
}

type RevenueInvoice = Pick<Invoice, 'invoice_type' | 'taxable_amount' | 'amount' | 'status' | 'paid_at'>

/**
 * Fatturato = INCASSATO, al netto IVA, note di credito sottratte.
 * Il periodo segue `paid_at` (cassa), NON `month` (competenza).
 */
export function revenueInPeriod(invoices: RevenueInvoice[], from: string, to: string): number {
  return invoices
    .filter(i => i.status === 'pagata' && i.paid_at && i.paid_at >= from && i.paid_at <= to)
    .reduce((s, i) => s + signedTaxable(i), 0)
}

export function revenueYtd(invoices: RevenueInvoice[], year = new Date().getFullYear()): number {
  return revenueInPeriod(invoices, `${year}-01-01`, `${year}-12-31T23:59:59`)
}

type ProjectRevenueInvoice = Pick<Invoice, 'invoice_type' | 'taxable_amount' | 'amount' | 'status' | 'paid_at' | 'project_id'>

/**
 * Ricavo di un singolo progetto.
 *
 * Prima della Fase 1 questo valore era il fatturato dell'INTERO cliente: un
 * cliente con tre progetti produceva tre volte lo stesso ricavo, e il margine
 * per progetto era sistematicamente gonfiato. Ora `invoices.project_id` esiste
 * e il ricavo è attribuito davvero.
 *
 * Le fatture non attribuite a un progetto restano fuori: meglio un ricavo di
 * progetto mancante che uno inventato. Compaiono in `unassignedRevenue()`.
 */
export function projectRevenue(invoices: ProjectRevenueInvoice[], projectId: string): number {
  return invoices
    .filter(i => i.project_id === projectId && i.status === 'pagata')
    .reduce((s, i) => s + signedTaxable(i), 0)
}

/** Fatturato incassato non attribuito ad alcun progetto — da monitorare nella data quality. */
export function unassignedRevenue(invoices: ProjectRevenueInvoice[]): number {
  return invoices
    .filter(i => !i.project_id && i.status === 'pagata')
    .reduce((s, i) => s + signedTaxable(i), 0)
}
