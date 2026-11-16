import 'server-only'
import { reconciliationSnapshotConsistent } from '@/lib/lab-reconciliations'
import { requireLabAdmin } from '@/lib/lab-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { readLabRows } from '@/lib/lab-read'
import type { ReconciliationStore, ReconciliationHead, ReconciliationEvent } from '@/lib/lab-reconciliation-types'
import type { SavedInvoiceShare } from '@/lib/lab-invoice-bank'
export async function loadLabReconciliationStore(today: string): Promise<ReconciliationStore> {
  await requireLabAdmin()
  const empty = { heads: [], items: [], events: [] }
  const { error } = await createAdminClient().from('bank_invoice_reconciliations').select('id').limit(1)
  if (error) return { ...empty, ready: false, missing: ['42P01', 'PGRST205'].includes(error.code), error: ['42P01', 'PGRST205'].includes(error.code) ? null : 'Registro raccordi non disponibile.' }
  try {
    const [heads, items, events] = await Promise.all([readLabRows('bank_invoice_reconciliations', '*', today), readLabRows('bank_invoice_reconciliation_items', '*', today), readLabRows('bank_invoice_reconciliation_events', '*', today)])
    if (items.some(i => !Number.isFinite(Number(i.amount)) || Number(i.amount) <= 0)) throw new Error('Quote incomplete')
    if (!reconciliationSnapshotConsistent(heads as unknown as ReconciliationHead[], items as unknown as SavedInvoiceShare[], events as unknown as ReconciliationEvent[])) throw new Error('Registro in aggiornamento')
    return { ready: true, missing: false, error: null, heads: heads as unknown as ReconciliationHead[], items: items.map(i => ({ ...i, amount: Number(i.amount) })) as SavedInvoiceShare[], events: events as unknown as ReconciliationEvent[] }
  } catch { return { ...empty, ready: false, missing: false, error: 'Lettura del registro incompleta: raccordi e residui da verificare.' } }
}
