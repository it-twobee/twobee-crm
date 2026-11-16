import 'server-only'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabBank } from '@/lib/lab-bank-load'
import { loadLabConnections } from '@/lib/lab-connections-load'
import { loadLabInvoiceRecords } from '@/lib/lab-invoice-records-load'
import { invoiceBankReconciliation } from '@/lib/lab-invoice-bank'
import { matchingSources } from '@/lib/lab-matching'
export async function loadLabMatching(today: string) {
  await requireLabAdmin()
  const [bank, refs, documents] = await Promise.all([loadLabBank(today), loadLabConnections(today), loadLabInvoiceRecords(today)])
  if (!bank.ok || !refs || !documents) return { ok: false as const }
  const proof = invoiceBankReconciliation(documents, bank.txs, bank.accounts, refs, today)
  return { ok: true as const, ...matchingSources(bank.accounts, bank.txs, documents, refs, proof, today), observedAt: new Date().toISOString() }
}
