import { targetCoverage, txCoverage, type Allocation } from '@/lib/allocations'
import { knownAmount } from '@/lib/lab-deals'
import type { LabBankAccount, LabBankTx } from '@/lib/lab-bank'
import type { ResourceRow as Row } from '@/lib/lab-resources'

/** Only explicit payout IDs establish a payment's competence and beneficiary. */
export function payoutEvidence(payouts: Row[] | undefined, allocations: Row[], legacy: Row[], txs: LabBankTx[], accounts: LabBankAccount[], today: string) {
  const active = allocations.filter(a => !a.superseded)
  return (payouts ?? []).map(p => {
    const gross = knownAmount(p.amount), accepted: Allocation[] = [], issues: string[] = []
    const entries: { txId: string; date: string; accountId: string; amount: number }[] = []
    for (const own of active.filter(a => a.payout_id === p.id)) {
      const tx = txs.find(t => t.id === own.tx_id), parts = active.filter(a => a.tx_id === own.tx_id)
      const account = accounts.find(a => a.id === tx?.account_id)
      const targets = (a: Row) => ['revenue_line_id', 'cost_line_id', 'payout_id', 'f24_id'].filter(k => a[k] != null)
      const converted = parts.map(a => ({ id: String(a.id), txId: String(a.tx_id), target: a.payout_id ? 'compenso' : a.revenue_line_id ? 'ricavo' : 'costo',
        targetId: String(a.payout_id ?? a.revenue_line_id ?? a.cost_line_id ?? a.f24_id), amount: Number(a.amount), evidence: a.evidence })) as Allocation[]
      const unique = new Set(parts.map(a => `${targets(a)[0]}:${a[targets(a)[0]]}`)).size === parts.length
      if (!tx || tx.source !== 'banca' || tx.amount >= 0 || tx.booked_on > today || !account || account.currency !== 'EUR' || account.parent_id
        || tx.hidden_reason || tx.kind === 'giroconto' || tx.kind === 'stipendio' || tx.kind === 'imposta' || tx.transfer_pair_id
        || tx.revenue_line_id || tx.cost_line_id || tx.invoice_id || tx.payslip_id || tx.hr_invoice_id
        || legacy.some(a => a.tx_id === own.tx_id) || !unique || parts.some(a => targets(a).length !== 1 || a.evidence !== 'certificata' || knownAmount(a.amount) == null || Number(a.amount) <= 0)
        || txCoverage(tx, converted).state === 'eccedente') {
        issues.push(`Quota bancaria ${String(own.tx_id)} da verificare: fonte, riferimenti o capienza non coerenti`)
        continue
      }
      accepted.push(converted.find(a => a.id === String(own.id))!)
      entries.push({ txId: tx.id, accountId: tx.account_id, date: tx.booked_on, amount: Number(own.amount) })
    }
    const coverage = gross != null && gross >= 0 ? targetCoverage(gross, 'compenso', String(p.id), accepted) : null
    if (coverage?.state === 'eccedente') issues.push('Quote bancarie superiori al compenso preparato')
    if (gross == null || gross < 0) issues.push('Importo del compenso preparato non valido')
    return { id: String(p.id), monthId: p.month_id, personKey: String(p.person_key ?? ''), kind: String(p.kind ?? ''), amount: gross,
      declaredPaid: p.paid === true, declaredPaidOn: typeof p.paid_on === 'string' ? p.paid_on : null,
      paidKnown: entries.length && !issues.length ? coverage?.certified ?? null : null,
      residual: entries.length && !issues.length ? coverage?.remaining ?? null : null, entries, issues }
  })
}
