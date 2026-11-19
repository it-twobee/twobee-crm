import assert from 'node:assert/strict'
import { emptyArchiveInvoice, parseArchiveInvoice, suggestArchivedInvoice } from '@/lib/archived-invoice'

const regus = suggestArchivedInvoice(
  'Partita IVA: IT11030281213 Regus Business Centres Italia Srl, Gruppo IVA: IT12581270969 ' +
  '8493-26-566INV Data fattura: 12 Novembre 2026 Totale (IVA escl.) € 297,00 Totale (IVA incl.) € 362,34',
)
assert.equal(regus.draft.vatId, 'IT12581270969', 'Usa l’identificativo del fornitore invece di quello del cliente')
assert.equal(parseArchiveInvoice(regus.draft).vat, 65.34)

const meta = suggestArchivedInvoice(
  'Data pagamento/fattura 15 nov 2026 Numero di riferimento: K4AAZCAL64 Pagamento effettuato 237,54 € ' +
  'Meta Platforms Ireland Limited VAT Reg. No. IE9692928F Num. fattura FBADS-190-106926078 articolo 196',
)
const read = parseArchiveInvoice(meta.draft)
assert.equal(read.reference, 'K4AAZCAL64')
assert.equal(read.total, 237.54)
assert.equal(read.vat, 0)
assert.ok(suggestArchivedInvoice('Meta Platforms Ireland Limited Operazione non riuscita').blocked)
assert.throws(() => parseArchiveInvoice(emptyArchiveInvoice))
assert.throws(() => parseArchiveInvoice({ ...meta.draft, date: '2026-02-30' }))
assert.throws(() => parseArchiveInvoice({ ...meta.draft, total: '237.57' }))
console.log('Tutti i controlli passano')
