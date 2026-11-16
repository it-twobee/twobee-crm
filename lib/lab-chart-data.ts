import { balance } from '@/lib/bank'
import { bankReadout, type LabBankAccount, type LabBankTx } from '@/lib/lab-bank'
import { byMonth } from '@/lib/invoices'
import type { LabInvoice } from '@/lib/lab-invoices'
import type { ChartRow } from '@/lib/lab-chart'
import { monthLabel } from '@/lib/pl'

/** Daily flows on ONE account at a time, with the canonical balance engine. */
export function bankDailyChart(accounts: LabBankAccount[], txs: LabBankTx[], month: string, today: string, visible: (tx: LabBankTx) => boolean, filters: Record<string, string> = {}): ChartRow[] {
  return accounts.filter(a => a.currency === 'EUR').flatMap(account => {
    const period = bankReadout(account, txs, month, today).period.filter(visible)
    return Array.from(new Set(period.map(t => t.booked_on))).sort().map(date => {
      const flows = balance({ opening_balance: 0 }, period.filter(t => t.booked_on === date))
      return { id: `${account.id}:${date}`, label: date, date, group: account.label, groupId: account.id,
        href: `/lab/banca?${new URLSearchParams({ ...filters, m: month, conto: account.id, giorno: date })}#dati-prove`,
        values: { incoming: flows.inflow, outgoing: Math.abs(flows.outflow) } }
    })
  })
}
/** Signed taxable values, exactly as the existing monthly document register. */
export function invoiceMonthlyChart(invoices: LabInvoice[], direction: 'emessa' | 'ricevuta', baseHref: string): ChartRow[] {
  return byMonth(invoices.filter(i => i.currency === 'EUR')).map(row => {
    const target = new URL(baseHref, 'https://lab.invalid'); target.searchParams.set('emissione', row.month)
    return { id: row.month, label: monthLabel(row.month), date: row.month, href: `${target.pathname}${target.search}#dati-prove`,
      values: { documents: direction === 'emessa' ? row.issued : row.received } }
  })
}
