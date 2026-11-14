import 'server-only'
import { requireLabAdmin } from '@/lib/lab-guard'
import { readLabRows } from '@/lib/lab-read'
import type { BankTx } from '@/lib/bank'
import type { LabBankAccount, LabBankTx } from '@/lib/lab-bank'

function numeric(value: unknown): number {
  if (value == null || value === '' || !Number.isFinite(Number(value))) throw new Error('Importo non disponibile')
  return Number(value)
}

function date(value: unknown): string {
  const result = String(value ?? '').slice(0, 10)
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(result)) throw new Error('Data non disponibile')
  return result
}

const nullable = (value: unknown) => value == null ? null : String(value)

export async function loadLabBank(today: string): Promise<
  | { ok: true; accounts: LabBankAccount[]; txs: LabBankTx[]; observedAt: string }
  | { ok: false; message: string }
> {
  await requireLabAdmin()
  const observedAt = new Date().toISOString()

  try {
    const [accountRows, txRows] = await Promise.all([
      readLabRows('bank_accounts', '*', today), readLabRows('bank_transactions', '*', today),
    ])
    const accounts: LabBankAccount[] = accountRows.map(a => ({
      id: String(a.id), label: String(a.label), bank_name: nullable(a.bank_name),
      currency: String(a.currency), opening_balance: numeric(a.opening_balance), opening_date: date(a.opening_date),
      is_primary: a.is_primary === true, is_active: a.is_active === true,
      parent_id: nullable(a.parent_id), owner_partner_id: nullable(a.owner_partner_id),
      statement_balance: a.statement_balance == null ? null : numeric(a.statement_balance),
      statement_on: a.statement_on == null ? null : date(a.statement_on),
    }))
    const accountIds = new Set(accounts.map(a => a.id))
    const txs: LabBankTx[] = txRows.map(t => {
      if (!['banca', 'manuale', 'derivato'].includes(String(t.source)) || !accountIds.has(String(t.account_id))) {
        throw new Error('Origine o conto non riconosciuto')
      }
      return {
        id: String(t.id), account_id: String(t.account_id), booked_on: date(t.booked_on),
        value_on: t.value_on == null ? null : date(t.value_on), amount: numeric(t.amount),
        description: String(t.description ?? ''), counterparty: nullable(t.counterparty),
        kind: String(t.kind ?? 'altro') as BankTx['kind'], source: t.source as BankTx['source'],
        doc_ref: nullable(t.doc_ref), revenue_line_id: nullable(t.revenue_line_id), cost_line_id: nullable(t.cost_line_id),
        invoice_id: nullable(t.invoice_id), payslip_id: nullable(t.payslip_id), hr_invoice_id: nullable(t.hr_invoice_id),
        matched_at: nullable(t.matched_at), no_match_needed: t.no_match_needed === true,
        hidden_reason: nullable(t.hidden_reason), transfer_pair_id: nullable(t.transfer_pair_id),
      }
    })
    return { ok: true, accounts, txs, observedAt }
  } catch {
    return { ok: false, message: 'Dati non disponibili o lettura incompleta. Nessun totale viene sostituito con zero. Ricarica per riprovare.' }
  }
}
