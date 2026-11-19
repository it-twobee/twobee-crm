import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
const anthropic = parseArchiveInvoice(suggestArchivedInvoice(
  'Receipt Invoice number AK9RHRQA \x00 0001 Receipt number 2284 \x00 0335 \x00 3675 Date paid May 9, 2026 ' +
  'Anthropic, PBC Bill to Two Bee HU VAT 11030281213 Total excluding tax €105.20 ' +
  'VAT - Italy \x00 22% on €105.20 \x00 €23.14 Total €128.34 Amount paid €128.34',
).draft)
assert.equal(anthropic.number, 'AK9RHRQA-0001')
assert.equal(anthropic.reference, '2284-0335-3675')
assert.equal(anthropic.date, '2026-05-09')
assert.equal(anthropic.net, 105.20)
assert.equal(anthropic.vat, 23.14)
assert.equal(anthropic.total, 128.34)
assert.equal(anthropic.vatId, '', 'Non attribuisce al fornitore la partita IVA riportata sotto Bill to')
const archiveAction = readFileSync('app/actions/lab-invoice-archive.ts', 'utf8')
assert.doesNotMatch(archiveAction, /\bfrom_sdi\s*:/, 'Il registro genera from_sdi dal documento XML')
console.log('Tutti i controlli passano')
