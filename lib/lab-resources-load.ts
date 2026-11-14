import 'server-only'
import { requireLabAdmin } from '@/lib/lab-guard'
import { readLabRows } from '@/lib/lab-read'
import { INVOICE_COLUMNS } from '@/lib/invoices-load'
import { toLabInvoices, type LabInvoice } from '@/lib/lab-invoices'
import { knownAmount } from '@/lib/lab-deals'
import { privateResourceKey, type ResourceRow, type ResourceTx } from '@/lib/lab-resources'

export async function loadLabResources(today: string): Promise<
  | { ok: true; people: ResourceRow[]; slips: ResourceRow[]; collab: ResourceRow[]; params: ResourceRow[];
      pdfs: ResourceRow[]; salaryLinks: ResourceRow[]; f24: ResourceRow[]; f24Lines: ResourceRow[];
      hrF24: ResourceRow[]; personal: ResourceRow[]; originals: ResourceRow[]; allocations: ResourceRow[];
      invoices: LabInvoice[]; txs: ResourceTx[]; accountNames: Map<string, string>; observedAt: string }
  | { ok: false; message: string }
> {
  await requireLabAdmin()
  const observedAt = new Date().toISOString()
  try {
    const [people, slips, collab, params, pdfs, salaryLinks, f24, f24Lines, hrF24, personal, originals, allocations, invoiceRows, bank, accounts] = await Promise.all([
      readLabRows('hr_people', 'id,profile_id,full_name,contract_kind,agreed_net,status,is_active,hired_on,start_date,end_date', today),
      readLabRows('hr_payslips', '*', today), readLabRows('hr_invoices', '*', today),
      readLabRows('hr_payroll_params', '*', today),
      readLabRows('payslips', 'id,profile_id,year,month,file_name,file_path', today),
      readLabRows('bank_tx_payslips', 'tx_id,payslip_id,amount', today),
      readLabRows('f24_documents', '*', today), readLabRows('f24_lines', '*', today), readLabRows('hr_f24', '*', today),
      readLabRows('personal_documents', 'id,profile_id,file_name,file_path', today),
      readLabRows('economics_documents', 'id,kind,filename,period,person_id,f24_id,storage_key', today),
      readLabRows('payment_allocations', '*', today),
      readLabRows('invoices', `${INVOICE_COLUMNS},currency,withholding,paid_amount`, today),
      readLabRows('bank_transactions', 'id,account_id,booked_on,amount,source,kind,payslip_id,hr_invoice_id,invoice_id', today),
      readLabRows('bank_accounts', 'id,label,currency', today),
    ])
    const accountById = new Map(accounts.map(a => [String(a.id), a]))
    const txs = bank.map(t => {
      const amount = knownAmount(t.amount), account = accountById.get(String(t.account_id))
      if (amount == null || !account || !['banca', 'manuale', 'derivato'].includes(String(t.source))) throw new Error('Movimento incompleto')
      return {
        id: String(t.id), accountId: String(t.account_id), date: String(t.booked_on), currency: String(account.currency),
        amount, source: String(t.source), kind: String(t.kind), payslipId: t.payslip_id == null ? null : String(t.payslip_id),
        hrInvoiceId: t.hr_invoice_id == null ? null : String(t.hr_invoice_id), invoiceId: t.invoice_id == null ? null : String(t.invoice_id),
      }
    })
    const documents = (rows: ResourceRow[], kind: string) => rows.map(({ file_path, storage_key, ...metadata }) => ({
      ...metadata, has_file: privateResourceKey(kind, kind === 'economico' ? storage_key : file_path),
    }))
    return { ok: true, people, slips, collab, params, pdfs: documents(pdfs, 'cedolino'), salaryLinks, f24, f24Lines, hrF24,
      personal: documents(personal, 'personale'), originals: documents(originals, 'economico'),
      allocations, invoices: toLabInvoices(invoiceRows), txs, observedAt,
      accountNames: new Map(accounts.map(a => [String(a.id), String(a.label)])) }
  } catch {
    return { ok: false, message: 'Una fonte risorse, documenti o banca non è disponibile. Costi e pagamenti n/d; nessun dato mancante viene sostituito con zero.' }
  }
}
