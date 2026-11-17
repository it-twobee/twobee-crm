import type { LabBankTx } from '@/lib/lab-bank'
export const BANK_KIND_LABELS: Record<LabBankTx['kind'], string> = { incasso: 'Incasso', pagamento: 'Pagamento', stipendio: 'Stipendio', imposta: 'Imposta', commissione: 'Commissione', giroconto: 'Giroconto', finanziamento: 'Finanziamento', altro: 'Altro' }
/** Numeric searches compare cents; text searches retain the original bank description. */
export function bankMovementSearch(tx: LabBankTx, query: string) {
  const q = query.trim().toLocaleLowerCase('it')
  if (!q) return true
  if (`${tx.counterparty ?? ''} ${tx.description} ${tx.doc_ref ?? ''}`.toLocaleLowerCase('it').includes(q)) return true
  const raw = q.replace(/\s|€/g, '')
  if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw) && !/^[+-]?\d+\.\d{1,2}$/.test(raw)) return false
  const n = Number(raw.includes(',') ? raw.replaceAll('.', '').replace(',', '.') : /^[-+]?\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replaceAll('.', '') : raw)
  return Number.isFinite(n) && Math.round((/^[+-]/.test(raw) ? tx.amount : Math.abs(tx.amount)) * 100) === Math.round(n * 100)
}
export function bankDays(txs: LabBankTx[]) {
  const days = new Map<string, LabBankTx[]>()
  for (const tx of [...txs].sort((a, b) => b.booked_on.localeCompare(a.booked_on) || a.id.localeCompare(b.id))) days.set(tx.booked_on, [...(days.get(tx.booked_on) ?? []), tx])
  return Array.from(days, ([date, rows]) => ({ date, rows, net: Math.round(rows.reduce((n, tx) => n + tx.amount, 0) * 100) / 100 }))
}
