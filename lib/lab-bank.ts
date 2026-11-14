import { balance, type BankAccount, type BankTx } from '@/lib/bank'

export type LabBankAccount = BankAccount & { is_active: boolean }
export type LabBankTx = BankTx & { invoice_id: string | null }

export function romeToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function labMonth(value: string | undefined, today: string): string {
  return value && /^(19|20)\d{2}-(0[1-9]|1[0-2])-01$/.test(value)
    ? value : `${today.slice(0, 7)}-01`
}

export function monthEnd(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const day = new Date(Date.UTC(year, m, 0)).getUTCDate()
  return `${month.slice(0, 7)}-${day}`
}

export function bankReference(tx: LabBankTx): string {
  const labels = [
    tx.invoice_id && 'Fattura',
    tx.revenue_line_id && 'Riga ricavo',
    tx.cost_line_id && 'Riga costo',
    tx.payslip_id && 'Cedolino',
    tx.hr_invoice_id && 'Fattura risorsa',
  ].filter(Boolean)
  if (labels.length) return labels.join(' · ')
  if (tx.kind === 'giroconto') return 'Giroconto: coppia da verificare'
  if (tx.no_match_needed) return 'Classificato senza aggancio richiesto'
  return 'Nessun riferimento diretto'
}

export function bankReadout(account: LabBankAccount, txs: LabBankTx[], month: string, today: string) {
  const own = txs.filter(t => t.account_id === account.id)
  const upTo = monthEnd(month) < today ? monthEnd(month) : today
  const real = own.filter(t => t.source === 'banca' && t.booked_on <= upTo)
  const beforeOpening = real.some(t => t.booked_on < account.opening_date)
  const canReconstruct = account.opening_date <= upTo && !beforeOpening
  const period = real.filter(t => t.booked_on >= month)
    .sort((a, b) => b.booked_on.localeCompare(a.booked_on) || a.id.localeCompare(b.id))
  const flows = balance({ opening_balance: 0 }, period)
  const statementOn = account.statement_on
  const canCompare = statementOn && statementOn <= upTo && statementOn >= account.opening_date
    && account.statement_balance != null && !beforeOpening
  const statementReconstructed = canCompare ? balance(account, own, statementOn).real : null
  const statementDifference = statementReconstructed == null ? null
    : Math.round((statementReconstructed - account.statement_balance!) * 100) / 100
  return {
    upTo, period, inflow: flows.inflow, outflow: Math.abs(flows.outflow),
    reconstructed: canReconstruct ? balance(account, own, upTo).real : null,
    lastBookedOn: real.map(t => t.booked_on).sort().at(-1) ?? null,
    statementReconstructed, statementDifference, beforeOpening,
    hidden: period.filter(t => t.hidden_reason),
    transfers: period.filter(t => t.kind === 'giroconto'),
    declaredCount: own.filter(t => t.source !== 'banca' && t.booked_on >= month && t.booked_on <= upTo).length,
  }
}
