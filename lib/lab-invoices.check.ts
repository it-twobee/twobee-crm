import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { invoiceEvidence, invoiceProposals, invoiceEconomicLinks, invoicePeriod, inInvoicePeriod, type LabInvoice, type LabInvoiceTx } from '@/lib/lab-invoices'
import { withRectifications } from '@/lib/invoices'

const secondQuarter = invoicePeriod('2026-T2')!
assert.deepEqual(secondQuarter.months, ['2026-04-01', '2026-05-01', '2026-06-01'])
assert.equal(inInvoicePeriod({ issuedOn: '2026-06-30' }, secondQuarter), true)
assert.equal(inInvoicePeriod({ issuedOn: '2026-07-01' }, secondQuarter), false, 'Nota emessa nel trimestre successivo non trascinata dal documento originario')
assert.equal(inInvoicePeriod({ issuedOn: '2025-12-01' }, null), true, 'Senza filtro esplicito gli arretrati restano nello storico')
assert.equal(inInvoicePeriod({ issuedOn: '2027-01-01' }, invoicePeriod('2026-T4')), false)
assert.equal(invoicePeriod('2026-T0'), null)
assert.equal(invoicePeriod('2026-T5'), null)
assert.equal(invoicePeriod('2026-10'), null, 'Il mese di navigazione non è un filtro trimestrale implicito')
const today = '2026-11-14'
const invoice = (extra: Partial<LabInvoice> = {}): LabInvoice => ({
  id: 'i', direction: 'emessa', docType: 'TD01', number: '10/26', issuedOn: '2026-10-01',
  counterpartyName: 'Cliente Esempio', counterpartyVat: null, clientId: null,
  taxable: 1000, vatAmount: 220, total: 1220, sign: 1, dueDate: '2026-10-15',
  paidOn: null, currency: 'EUR', withholding: 0, declaredPaidAmount: null, ...extra,
})
const tx = (extra: Partial<LabInvoiceTx> = {}): LabInvoiceTx => ({
  id: 't', accountId: 'a', currency: 'EUR', bookedOn: '2026-10-20', amount: 1220,
  source: 'banca', kind: 'incasso', description: 'Cliente Esempio fattura 10/26', counterparty: 'Cliente Esempio',
  invoiceId: null, hidden: false, occupied: false, ...extra,
})

let result = invoiceEvidence(invoice({ paidOn: '2026-10-20' }), [], today)
assert.equal(result.status.state, 'pagata', 'Stato canonico del registro conservato')
assert.equal(result.real.length, 0)
assert.equal(result.linkedGross, null, 'Data pagato non crea un movimento')
assert.equal(result.needsReview, true)
result = invoiceEvidence(invoice(), [tx({ invoiceId: 'i', amount: 610 })], today)
assert.equal(result.linkedGross, 610)
assert.equal(result.open, true, 'L’acconto non chiude la fattura nel registro')
assert.equal(result.needsReview, true)
result = invoiceEvidence(invoice(), [tx({ invoiceId: 'i', source: 'derivato' })], today)
assert.equal(result.linkedGross, null)
assert.equal(result.declared.length, 1)
assert.equal(invoiceEvidence(invoice(), [tx({ invoiceId: 'i', amount: -1220 })], today).wrongDirection, true)
assert.equal(invoiceEvidence(invoice({ direction: 'ricevuta' }), [tx({ invoiceId: 'i', amount: -1220 })], today).wrongDirection, false)
assert.equal(invoiceEvidence(invoice(), [tx({ invoiceId: 'i', bookedOn: '2026-11-15' })], today).real.length, 0)
assert.equal(invoiceEvidence(invoice(), [tx({ invoiceId: 'i', currency: 'USD' })], today).linkedGross, null)

const fixtures = [invoice(), invoice({ id: 'j', number: '11/26' })]
const run = invoiceProposals(fixtures, [tx()], today)
assert.equal(run.proposals.get('i')?.length, 1)
assert.equal(run.contenders.get('t'), 2, 'La contesa considera entrambe le fatture')
for (const extra of [
  { occupied: true }, { hidden: true }, { kind: 'giroconto' }, { kind: 'finanziamento' },
  { kind: 'stipendio' }, { kind: 'imposta' }, { source: 'manuale' as const },
  { source: 'derivato' as const }, { currency: 'USD' }, { invoiceId: 'other' }, { bookedOn: '2026-11-15' },
]) {
  assert.equal(invoiceProposals([invoice()], [tx(extra)], today).proposals.get('i')?.length, 0, JSON.stringify(extra))
}
const partial = withRectifications([invoice(), invoice({ id: 'credit', docType: 'TD04', sign: -1, taxable: 500, vatAmount: 110, total: 610, rectifiesId: 'i' })]) as LabInvoice[]
assert.equal(invoiceProposals(partial, [tx()], today).proposals.get('i'), undefined, 'Nessuna proposta sul vecchio lordo dopo storno parziale')
assert.equal(invoiceEvidence(partial[0], [], today).open, true)
const voided = withRectifications([invoice(), invoice({ id: 'credit', docType: 'TD04', sign: -1, rectifiesId: 'i' })]) as LabInvoice[]
assert.equal(invoiceEvidence(voided[0], [], today).open, false)
const debit = withRectifications([invoice(), invoice({ id: 'debit', docType: 'TD05', rectifiesId: 'i' })]) as LabInvoice[]
assert.equal(invoiceEvidence(debit[0], [], today).open, true, 'Nota di debito non storna')
assert.equal(invoiceEvidence(debit[1], [], today).open, true)

const references = invoiceEconomicLinks([
  { id: 'r1', invoice_id: 'i', month_id: 'm1', stream_id: 's', label: 'Prima competenza' },
  { id: 'r2', invoice_id: 'i', month_id: 'm2', stream_id: 's' },
  { id: 'r1', invoice_id: 'i', month_id: 'm1', stream_id: 's' },
  { id: 'unlinked', invoice_id: null, month_id: 'm1' },
], [{ id: 'r1', invoice_id: 'i', month_id: 'missing', stream_id: 'not-a-cost-contract' }], [
  { id: 'm1', month: '2026-10-01' }, { id: 'm2', month: '2026-11-01' },
])
assert.equal(references.get('i')?.length, 3, 'Fattura su più competenze: riferimenti distinti, replay deduplicato')
assert.equal(references.get('i')?.[0].streamId, 's')
assert.equal(references.get('i')?.[1].month, '2026-11-01')
assert.equal(references.get('i')?.[2].month, null, 'Mese assente non dedotto dalla data fattura')
assert.equal(references.get('i')?.[2].streamId, null, 'Un costo non riceve un accordo cliente implicito')
assert.equal(references.size, 1, 'Nessun collegamento da un invoice_id mancante')

for (const path of ['lib/lab-read.ts', 'lib/lab-invoices-load.ts', 'app/(dashboard)/lab/fatturazione/page.tsx']) {
  const source = readFileSync(path, 'utf8')
  assert.match(source, /await requireLabAdmin\(\)/)
  assert.doesNotMatch(source, /\.\s*(insert|update|upsert|delete|rpc)\s*\(/)
  assert.doesNotMatch(source, /from ['"]@\/app\/(actions|api)\//)
}
const debitReversesCredit = withRectifications([
  invoice(),
  invoice({ id: 'nc', sign: -1, docType: 'TD04', taxable: 500, rectifiesId: 'i' }),
  invoice({ id: 'nd', docType: 'TD05', taxable: 300, rectifiesId: 'nc' }),
])
assert.equal(debitReversesCredit.find(d => d.id === 'i')?.rectifiedAmount, 200)

console.log('Tutti i controlli passano')
