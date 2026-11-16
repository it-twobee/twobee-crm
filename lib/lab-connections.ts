import type { SavedInvoiceShare } from '@/lib/lab-invoice-bank'
import type { LabBankTx } from '@/lib/lab-bank'
import { invoiceEconomicLinks } from '@/lib/lab-invoices'

type Row = Record<string, unknown>
export type LabConnectionData = {
  invoiceShares?: SavedInvoiceShare[]
  revenue: Row[]; costs: Row[]; months: Row[]; allocations: Row[]; legacy: Row[]
  slips: Row[]; hrInvoices: Row[]; pdfs: Row[]; salaryLinks: Row[]; people: Row[]
  f24: Row[]; f24Lines: Row[]; settlements: Row[]; payouts: Row[]
}
export type LabConnection = { href: string; label: string; origins: string[] }
export type LabConnections = { links: LabConnection[]; issues: string[] }

const id = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value : null
const monthOf = (value: unknown) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value) ? value : null
const enc = encodeURIComponent

function collector() {
  const links = new Map<string, LabConnection>(), issues = new Set<string>()
  return {
    issue: (text: string) => { issues.add(text) },
    add: (href: string, label: string, origin: string) => {
      const existing = links.get(href)
      if (existing) { if (!existing.origins.includes(origin)) existing.origins.push(origin) }
      else links.set(href, { href, label, origins: [origin] })
    },
    result: (): LabConnections => ({ links: Array.from(links.values()), issues: Array.from(issues) }),
  }
}

function addPerson(c: ReturnType<typeof collector>, data: LabConnectionData, personId: unknown, month: string | null, origin: string) {
  const person = data.people.find(p => p.id === personId)
  if (!person || !id(person.id) || !month) { c.issue('Risorsa o competenza del documento da raccordare'); return }
  c.add(`/lab/risorse?m=${month}&persona=${enc(String(person.id))}#risorsa-${enc(String(person.id))}`, `${String(person.full_name || 'Risorsa')} · ${month.slice(0, 7)}`, origin)
}

function addLine(c: ReturnType<typeof collector>, data: LabConnectionData, lineId: string, side: 'ricavo' | 'costo', origin: string) {
  const row = (side === 'ricavo' ? data.revenue : data.costs).find(r => r.id === lineId)
  if (!row) { c.issue(`Riga ${side} riferita ma non disponibile`); return }
  const month = monthOf(data.months.find(m => m.id === row.month_id)?.month)
  if (month) c.add(`/lab/conto-economico?m=${month}&vista=maturato&riga=${enc(lineId)}&tipoRiga=${side}#righe-economiche`, `${String(row.label || side)} · ${month.slice(0, 7)}`, origin)
  else c.issue(`Competenza della riga ${side} da raccordare`)
  if (id(row.invoice_id)) c.add(`/lab/fatturazione?documento=${enc(String(row.invoice_id))}`, 'Fattura riferita dalla riga', origin)
  if (side === 'ricavo' && id(row.stream_id)) c.add(`/lab/accordi?accordo=${enc(String(row.stream_id))}`, 'Accordo della riga', origin)
}

function addF24(c: ReturnType<typeof collector>, data: LabConnectionData, f24Id: string, origin: string) {
  const head = data.f24.find(f => f.id === f24Id)
  if (!head) { c.issue('Modello F24 riferito ma non disponibile'); return }
  c.add(`/lab/risorse?vista=versamenti&f24=${enc(f24Id)}#f24-${enc(f24Id)}`, `F24 · scadenza ${String(head.due_date || 'n/d')}`, origin)
  for (const line of data.f24Lines.filter(l => l.doc_id === f24Id && id(l.vat_settlement_id))) {
    const settlement = data.settlements.find(s => s.id === line.vat_settlement_id)
    if (!settlement || !Number.isInteger(Number(settlement.year)) || ![1, 2, 3, 4].includes(Number(settlement.quarter))) { c.issue('Liquidazione IVA riferita dal modello da raccordare'); continue }
    const key = `${settlement.year}-T${settlement.quarter}`
    c.add(`/lab/iva?periodo=${key}`, `IVA · ${key}`, 'Componente F24 riferita alla liquidazione')
  }
}

export function transactionConnections(tx: LabBankTx, data: LabConnectionData): LabConnections {
  const c = collector()
  for (const share of (data.invoiceShares ?? []).filter(s => s.tx_id === tx.id)) c.add(`/lab/fatturazione?documento=${enc(share.invoice_id)}`, 'Fattura del raccordo confermato', 'Registro raccordi')
  if (id(tx.invoice_id)) c.add(`/lab/fatturazione?documento=${enc(tx.invoice_id!)}`, 'Fattura collegata al movimento', 'Riferimento diretto')
  const addReferences = (row: Row, origin: string) => {
    if (id(row.revenue_line_id)) addLine(c, data, String(row.revenue_line_id), 'ricavo', origin)
    if (id(row.cost_line_id)) addLine(c, data, String(row.cost_line_id), 'costo', origin)
    if (id(row.f24_id)) addF24(c, data, String(row.f24_id), origin)
    if (id(row.payout_id)) {
      const payout = data.payouts.find(p => p.id === row.payout_id)
      const month = monthOf(data.months.find(m => m.id === payout?.month_id)?.month)
      if (payout && month) c.add(`/lab/conto-economico?m=${month}#compensi`, `Compensi · ${String(payout.person_label || 'Beneficiario da verificare')} · ${month.slice(0, 7)}`, origin)
      else c.issue('Registro compensi o competenza riferita da raccordare')
    }
  }
  addReferences(tx as unknown as Row, 'Riferimento diretto')
  for (const allocation of data.allocations.filter(a => a.tx_id === tx.id && !a.superseded)) addReferences(allocation, 'Registro quote corrente')
  for (const old of data.legacy.filter(a => a.tx_id === tx.id)) addReferences(old, 'Registro collegamenti storico')
  if (id(tx.payslip_id)) {
    const slip = data.slips.find(s => s.id === tx.payslip_id)
    if (slip) addPerson(c, data, slip.person_id, monthOf(slip.month), 'Riferimento al cedolino HR')
    else c.issue('Cedolino HR riferito ma non disponibile')
  }
  if (id(tx.hr_invoice_id)) {
    const invoice = data.hrInvoices.find(i => i.id === tx.hr_invoice_id)
    if (invoice) {
      addPerson(c, data, invoice.person_id, monthOf(invoice.month), 'Riferimento alla fattura HR')
      if (id(invoice.invoice_id)) c.add(`/lab/fatturazione?documento=${enc(String(invoice.invoice_id))}`, 'Fattura canonica della risorsa', 'Riferimento dal registro HR')
    } else c.issue('Fattura HR riferita ma non disponibile')
  }
  for (const link of data.salaryLinks.filter(l => l.tx_id === tx.id)) {
    const pdf = data.pdfs.find(p => p.id === link.payslip_id)
    const people = pdf && id(pdf.profile_id) ? data.people.filter(p => p.profile_id === pdf.profile_id) : []
    if (!pdf || people.length !== 1 || !Number.isInteger(Number(pdf.year)) || !Number.isInteger(Number(pdf.month))) { c.issue('Identità del cedolino nella distinta da verificare'); continue }
    const month = monthOf(`${pdf.year}-${String(pdf.month).padStart(2, '0')}-01`)
    addPerson(c, data, people[0].id, month, 'Distinta cedolini PDF')
  }
  return c.result()
}

export function invoiceResourceConnections(invoiceId: string, data: LabConnectionData): LabConnections {
  const c = collector()
  for (const row of data.hrInvoices.filter(r => r.invoice_id === invoiceId)) addPerson(c, data, row.person_id, monthOf(row.month), 'Riferimento dal registro fatture HR')
  return c.result()
}

export function connectionEconomics(data: LabConnectionData) {
  return invoiceEconomicLinks(data.revenue, data.costs, data.months)
}

export function connectionOverview(data: LabConnectionData, month: string) {
  const monthIds = new Set(data.months.filter(m => m.month === month).map(m => m.id))
  const revenue = data.revenue.filter(r => monthIds.has(r.month_id))
  const costs = data.costs.filter(r => monthIds.has(r.month_id))
  const hrInvoices = data.hrInvoices.filter(r => r.month === month)
  return { registered: monthIds.size > 0, revenue: revenue.length, costs: costs.length,
    revenueWithoutInvoice: revenue.filter(r => !id(r.invoice_id)).length,
    costsWithoutInvoice: costs.filter(r => !id(r.invoice_id)).length,
    hrInvoicesWithoutDocument: hrInvoices.filter(r => !id(r.invoice_id)).length,
    hrInvoices: hrInvoices.length }
}
