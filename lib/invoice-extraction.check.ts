import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { verifyInvoiceExtraction } from '@/lib/invoice-extraction'
import { emptyArchiveInvoice, parseArchiveInvoice, suggestArchivedInvoice } from '@/lib/archived-invoice'

const text = 'Ricevuta prestazione occasionale n. 7 del 19 novembre 2026. Prestatore Mario Rossi CF RSSMRA80A01H501U. Compenso lordo 1.000,00 EUR. IVA 0,00. Ritenuta 200,00. Bollo addebitato 2,00. Totale lordo 1.002,00. Netto da pagare 802,00.'
const field = (value: string, quote: string) => ({ value, quote })
const proposal = verifyInvoiceExtraction({ document: 'occasional', fields: {
  kind: field('RICEVUTA_OCCASIONALE', 'Ricevuta prestazione occasionale'), number: field('7', 'n. 7'),
  supplier: field('Mario Rossi', 'Prestatore Mario Rossi'), taxCode: field('RSSMRA80A01H501U', 'CF RSSMRA80A01H501U'),
  date: field('2026-11-19', '19 novembre 2026'), currency: field('EUR', '1.000,00 EUR'), net: field('1000', 'Compenso lordo 1.000,00 EUR'),
  vat: field('0', 'IVA 0,00'), withholding: field('200', 'Ritenuta 200,00'), stamp: field('2', 'Bollo addebitato 2,00'),
  total: field('1002', 'Totale lordo 1.002,00'), payable: field('802', 'Netto da pagare 802,00'),
} }, text)
assert.equal(proposal.blocked, null)
assert.equal(proposal.draft.kind, 'RICEVUTA_OCCASIONALE')
assert.equal(parseArchiveInvoice(proposal.draft).payable, 802)
assert.equal(parseArchiveInvoice(proposal.draft).withholding, 200)
assert.equal(suggestArchivedInvoice(text).draft.kind, 'RICEVUTA_OCCASIONALE')
assert.equal(verifyInvoiceExtraction({ fields: { total: field('9000', 'Totale lordo 1.002,00') } }, text).draft.total, '')
assert.equal(verifyInvoiceExtraction({ fields: { total: field('1002', 'Totale lordo 1.002,00 INVENTATO') } }, text).draft.total, '')
assert.equal(verifyInvoiceExtraction({ fields: { date: field('2026-12-19', '19 novembre 2026') } }, text).draft.date, '')
assert.equal(verifyInvoiceExtraction({ fields: { date: field('2026-02-30', '30 febbraio 2026') } }, '30 febbraio 2026').draft.date, '')
assert.equal(verifyInvoiceExtraction({ fields: { supplier: field('Società inventata', 'Prestatore Mario Rossi') } }, text).draft.supplier, '')
assert.equal(verifyInvoiceExtraction({ fields: { currency: field('USD', '1.000,00 EUR') } }, text).draft.currency, '')
assert.equal(verifyInvoiceExtraction({ fields: { vat: field('0', '') } }, text).draft.vat, '', 'Assenza non diventa IVA zero')
assert.ok(verifyInvoiceExtraction({ document: 'multiple', fields: {} }, text).blocked)
assert.ok(verifyInvoiceExtraction({ fields: {} }, 'Pagamento non riuscito').blocked)
assert.throws(() => verifyInvoiceExtraction(null, text))
assert.throws(() => parseArchiveInvoice({ ...proposal.draft, withholding: '' }))
assert.throws(() => parseArchiveInvoice({ ...proposal.draft, taxCode: '' }))
assert.throws(() => parseArchiveInvoice({ ...proposal.draft, payable: '800' }))
assert.throws(() => parseArchiveInvoice({ ...proposal.draft, vat: '220' }))
assert.equal(parseArchiveInvoice({ ...emptyArchiveInvoice, number: 'F-1', supplier: 'Fornitore', date: '2026-11-19', currency: 'EUR', net: '100', vat: '22', total: '122' }).total, 122, 'Compatibilità con bozze legacy')
const route = readFileSync('app/api/lab/invoice-archive/[id]/extract/route.ts', 'utf8')
assert.match(route, /await requireLabAdmin\(\)/)
assert.match(route, /await requireEconomicsAdmin\(\)/)
assert.doesNotMatch(route.replace(/active\.delete\(actor\)/g, ''), /\.\s*(insert|update|upsert|delete|rpc)\s*\(/)
assert.match(route, /GROQ_DOCUMENT_MODEL/)
assert.match(route, /info.total > 20/)
assert.match(route, /finish_reason !== 'stop'/)
const action = readFileSync('app/actions/lab-invoice-archive.ts', 'utf8')
assert.match(action, /withholding: invoice.withholding/)
assert.match(action, /counterparty_tax: invoice.taxCode/)
assert.match(action, /createActorClient\(actor\)/)
console.log('Tutti i controlli passano')
