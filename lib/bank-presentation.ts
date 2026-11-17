import type { BankAccount, BankTx } from '@/lib/bank'
import { runningBalance } from '@/lib/bank'
/** Presentation only: never remove accounts or transactions from financial engines. */
export function isRetiredBankPocket(account: Pick<BankAccount, 'label' | 'parent_id' | 'owner_partner_id'>) {
  return /\bvivid\b.*\b(marco|toto|walter)\b/i.test(account.label) || !!(account.parent_id && account.owner_partner_id)
}
export function bankBalanceHistory(account: BankAccount, txs: BankTx[], upTo: string) {
  const real = txs.filter(t => t.account_id === account.id && t.source === 'banca' && t.booked_on <= upTo)
  if (account.opening_date > upTo || real.some(t => t.booked_on < account.opening_date) || account.currency !== 'EUR') return null
  const curve = runningBalance(account, real)
  return [{ date: account.opening_date, value: account.opening_balance }, ...curve.map(p => ({ date: p.date, value: p.balance }))].filter((p, i, rows) => i === rows.length - 1 || p.date !== rows[i + 1].date)
}
