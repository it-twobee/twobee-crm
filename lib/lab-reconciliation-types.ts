import type { MatchDocument, MatchMovement, MatchPair } from '@/lib/lab-matching'
import type { SavedInvoiceShare } from '@/lib/lab-invoice-bank'
export type ReconciliationHead = { id: string; version: number; status: 'active' | 'cancelled'; note: string; created_at: string; updated_at: string; verified_at: string | null; verified_by: string | null }
export type ReconciliationEvent = { id: string; reconciliation_id: string; actor_label: string; operation: string; created_at: string; before_snapshot: unknown; after_snapshot: unknown }
export type ReconciliationStore = { ready: boolean; missing: boolean; error: string | null; heads: ReconciliationHead[]; items: SavedInvoiceShare[]; events: ReconciliationEvent[] }
export type ReconciliationData = { ready: boolean; setupMessage: string | null; movements: MatchMovement[]; invoices: MatchDocument[]; records: (ReconciliationHead & { items: SavedInvoiceShare[] })[]; events: ReconciliationEvent[]; legacy: { movementId: string; invoiceId: string }[]; basis: string; editId: string | null; version: number; adoptMovement: string | null; adoptInvoice: string | null; pairs: MatchPair[] }
