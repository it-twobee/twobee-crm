import type { ReconciliationHead, ReconciliationEvent } from '@/lib/lab-reconciliation-types'
import type { SavedInvoiceShare } from '@/lib/lab-invoice-bank'
/** Reject mixed generations from separate REST reads instead of showing a partial ledger. */
export function reconciliationSnapshotConsistent(heads: ReconciliationHead[], items: SavedInvoiceShare[], events: ReconciliationEvent[]) {
  const headIds = new Set(heads.map(h => h.id))
  if (items.some(i => !headIds.has(i.reconciliation_id))) return false
  const signature = (rows: SavedInvoiceShare[]) => rows.map(i => `${i.id}:${i.tx_id}:${i.invoice_id}:${Math.round(Number(i.amount) * 100)}`).sort().join('|')
  return heads.every(h => {
    const latest = events.filter(e => e.reconciliation_id === h.id).map(e => e.after_snapshot as { head?: ReconciliationHead; items?: SavedInvoiceShare[] }).find(s => s?.head?.version === h.version)
    return !!latest?.head && latest.head.status === h.status && Array.isArray(latest.items) && signature(latest.items) === signature(items.filter(i => i.reconciliation_id === h.id))
  })
}
export const reconciliationDay = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
export function reconciliationStateMatches(record: ReconciliationHead, status: string) {
  if (!status) return true
  if (status === 'active' || status === 'cancelled') return record.status === status
  return record.status === 'active' && (status === 'verified' ? !!record.verified_at : !record.verified_at)
}
