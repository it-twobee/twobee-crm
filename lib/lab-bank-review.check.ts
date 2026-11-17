import assert from 'node:assert/strict'
import { bankReviewRows } from '@/lib/lab-bank-review'
import type { LabBankTx, LabBankAccount } from '@/lib/lab-bank'
import type { LabConnectionData } from '@/lib/lab-connections'
import type { LabInvoice } from '@/lib/lab-invoices'
import type { InvoiceBankResult } from '@/lib/lab-invoice-bank'
const account: LabBankAccount = { id: 'a', label: 'Banca', bank_name: null, opening_balance: 0, opening_date: '2026-01-01', currency: 'EUR', is_active: true, is_primary: true }
const tx = (id: string, more: Partial<LabBankTx> = {}): LabBankTx => ({ id, account_id: 'a', booked_on: '2026-11-01', amount: -100, source: 'banca', kind: 'pagamento', description: 'Pagamento', counterparty: 'Fornitore', value_on: null, doc_ref: null, invoice_id: null, revenue_line_id: null, cost_line_id: null, matched_at: null, no_match_needed: false, ...more })
const refs: LabConnectionData = { revenue: [], costs: [{ id: 'c', category: 'Personale' }], months: [], allocations: [{ tx_id: 'batch', cost_line_id: 'c', amount: 40 }, { tx_id: 'batch', cost_line_id: 'other', amount: 60 }], legacy: [], slips: [], hrInvoices: [], pdfs: [], salaryLinks: [], people: [{ full_name: 'Gabriele Saraiello' }], f24: [], f24Lines: [], settlements: [], payouts: [] }
const rows = [tx('normal'), tx('cashback', { amount: 12, description: 'Cashback' }), tx('vivid', { amount: 12, counterparty: 'Vivid Money', description: 'Vivid Money GmbH' }), tx('salary', { counterparty: 'Gabriele Saraiello' }), tx('tax', { kind: 'imposta' }), tx('transfer', { kind: 'giroconto' }), tx('hidden', { hidden_reason: 'Personale' }), tx('manual', { source: 'manuale' }), tx('declared', { source: 'derivato' }), tx('future', { booked_on: '2027-01-01' }), tx('batch'), tx('wrong', { counterparty: 'Annalisa Smiraglia', description: 'Bonifico Annalisa Smiraglia', invoice_id: 'i' })]
const proof: InvoiceBankResult = { invoices: new Map(), transactions: new Map(rows.map(r => [r.id, { txId: r.id, amount: r.amount, currency: 'EUR', bank: true, links: r.id === 'wrong' ? [{ invoiceId: 'i', amount: 100, via: 'diretto', issues: [] }] : [], attributed: r.id === 'wrong' ? 100 : 0, unassigned: r.id === 'wrong' ? 0 : 100, issues: [] }])) }
const documents = [{ id: 'i', counterpartyName: 'Gabriele Saraiello', number: '7/2026', sign: 1 }] as LabInvoice[]
const reviewed = bankReviewRows(rows, [account], documents, refs, proof, [], '2026-11-17')
assert.equal(reviewed.length, rows.length - 3)
assert.equal(new Set(reviewed.map(r => r.id)).size, reviewed.length)
const by = (id: string) => reviewed.find(r => r.id === id)!
assert.equal(by('normal').category, 'fatture')
assert.equal(by('cashback').category, 'rimborsi')
assert.equal(by('vivid').category, 'rimborsi')
assert.ok(by('vivid').why.some(w => w.includes('non assumiamo')))
assert.equal(by('salary').category, 'risorse')
assert.equal(by('tax').category, 'fisco')
assert.equal(by('transfer').category, 'trasferimenti')
assert.equal(by('hidden').category, 'esclusi')
assert.equal(by('batch').category, 'risorse')
assert.ok(by('batch').why.some(w => w.includes('più destinazioni')))
assert.equal(by('wrong').status, 'da_verificare')
assert.ok(by('wrong').why.some(w => w.includes('beneficiario')))
assert.equal(rows.length, 12)
console.log('Tutti i controlli passano')
