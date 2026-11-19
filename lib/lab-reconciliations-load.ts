import 'server-only'
import { bankReviewRows } from '@/lib/lab-bank-review'
import { createHash } from 'node:crypto'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabBank } from '@/lib/lab-bank-load'
import { loadLabConnections } from '@/lib/lab-connections-load'
import { loadLabInvoiceRecords } from '@/lib/lab-invoice-records-load'
import { loadLabReconciliationStore } from '@/lib/lab-reconciliations-store'
import { invoiceBankReconciliation } from '@/lib/lab-invoice-bank'
import { costLineOnlyMovement, matchingSources } from '@/lib/lab-matching'
import type { ReconciliationData } from '@/lib/lab-reconciliation-types'
export async function loadLabReconciliations(today: string, editId?: string, adoptMovement?: string, focusMovement?: string): Promise<ReconciliationData> {
  await requireLabAdmin()
  const [bank, refs, documents, store] = await Promise.all([loadLabBank(today), loadLabConnections(today), loadLabInvoiceRecords(today), loadLabReconciliationStore(today)])
  if (!bank.ok || !refs || !documents || store.error) throw new Error(store.error ?? 'Una fonte banca o fatture non è disponibile. Ricarica prima di procedere.')
  const edit = editId ? store.heads.find(h => h.id === editId && h.status === 'active') : null
  if (editId && !edit) throw new Error('Il raccordo è stato modificato o rimosso. Ricarica il registro.')
  const active = new Set(store.heads.filter(h => h.status === 'active' && h.id !== editId).map(h => h.id))
  const shares = store.items.filter(i => active.has(i.reconciliation_id))
  const adoptId = adoptMovement ?? (!editId ? bank.txs.find(t => t.id === focusMovement && t.invoice_id)?.id : undefined)
  const adopt = adoptId ? bank.txs.find(t => t.id === adoptId && t.invoice_id) : null
  if (adoptMovement && !adopt) throw new Error('Il raccordo storico è cambiato: ricarica i dati.')
  const txs = bank.txs.map(t => adopt?.id === t.id ? { ...t, invoice_id: null } : t)
  const adjusted = { ...refs, invoiceShares: shares }
  const proof = invoiceBankReconciliation(documents, txs, bank.accounts, adjusted, today)
  const sources = matchingSources(bank.accounts, txs, documents, adjusted, proof, today)
  const complexMovements = new Set<string>()
  for (const movement of sources.movements) {
    const tx = txs.find(t => t.id === movement.id)!
    if (tx.kind === 'finanziamento' || tx.revenue_line_id || (tx.cost_line_id && !costLineOnlyMovement(tx, refs)) || tx.payslip_id || tx.hr_invoice_id || refs.allocations.some(a => a.tx_id === tx.id) || refs.legacy.some(a => a.tx_id === tx.id) || refs.salaryLinks.some(a => a.tx_id === tx.id)) {
      complexMovements.add(tx.id)
      movement.available = null; movement.why = 'Ha riferimenti economici o risorse: verifica prima i collegamenti esistenti.'
    }
  }
  for (const document of sources.invoices) {
    if (document.remaining === 0) continue
    const lineIds = new Set([...refs.revenue, ...refs.costs].filter(r => r.invoice_id === document.id).map(r => r.id))
    if (txs.some(t => t.invoice_id === document.id && complexMovements.has(t.id)) || refs.hrInvoices.some(r => r.invoice_id === document.id && txs.some(t => t.hr_invoice_id === r.id)) || txs.some(t => lineIds.has(t.revenue_line_id) || lineIds.has(t.cost_line_id)) || [...refs.allocations, ...refs.legacy].some(a => lineIds.has(a.revenue_line_id) || lineIds.has(a.cost_line_id))) {
      document.remaining = null; document.why = 'Ha quote economiche storiche: apri le prove prima di modificarne i pagamenti.'
    }
  }
  const hash = createHash('sha256')
  hash.write(JSON.stringify({ ...sources, heads: store.heads.map(h => [h.id, h.version, h.status]), shares, adopt: adopt ? [adopt.id, adopt.invoice_id] : null }))
  const basis = hash.digest('hex')
  return { review: bankReviewRows(bank.txs, bank.accounts, documents, adjusted, proof, sources.movements, today), legacy: bank.txs.filter(t => t.source === 'banca' && t.invoice_id).map(t => ({ movementId: t.id, invoiceId: t.invoice_id! })), ready: store.ready, setupMessage: store.ready ? null : 'Il registro raccordi deve essere attivato sul database prima di salvare.', ...sources, basis, editId: edit?.id ?? null, version: edit?.version ?? 0, adoptMovement: adopt?.id ?? null, adoptInvoice: adopt?.invoice_id ?? null, pairs: edit ? store.items.filter(i => i.reconciliation_id === edit.id).map(i => ({ movementId: i.tx_id, documentId: i.invoice_id, amount: i.amount })) : [], records: store.heads.map(h => ({ ...h, items: store.items.filter(i => i.reconciliation_id === h.id) })), events: store.events }
}
