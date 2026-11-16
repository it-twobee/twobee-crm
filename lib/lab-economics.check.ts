import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { economicCash, economicProof, economicAccrual, type EconomicsInput } from '@/lib/lab-economics'
import { DEFAULT_PL_CONFIG } from '@/lib/pl'
import { toLabInvoices } from '@/lib/lab-invoices'
import { signEconomicsReport, readEconomicsReport } from '@/lib/lab-economics-token'
import { economicsReport } from '@/lib/lab-economics-report'
import { economicsPdf } from '@/lib/lab-economics-pdf'

const month = '2026-10-01', today = '2026-11-14'
const account = { id: 'a', currency: 'EUR', parent_id: null, opening_balance: 100, opening_date: '2026-01-01', label: 'Conto' } as EconomicsInput['accounts'][number]
const row = { id: 'r', month_id: 'm', amount_net: 1000, vat_rate: .22, kind: 'growth', invoice_id: 'i', label: 'Accordo esempio' }
const doc = toLabInvoices([{ id: 'i', direction: 'emessa', sign: 1, total: 1220, vat_amount: 220, taxable: 1000, withholding: 0, currency: 'EUR', issued_on: month }])[0]
const tx = { id: 't', account_id: 'a', booked_on: '2026-11-10', amount: 1220, source: 'banca', kind: 'incasso', revenue_line_id: 'r', cost_line_id: null, invoice_id: 'i' } as EconomicsInput['txs'][number]
const input: EconomicsInput = { month, today, observedAt: '2026-11-14T12:00:00.000Z', months: [{ id: 'm', month }], revenue: [row], costs: [], clients: [],
  streams: [], installments: [], links: [], items: [], config: [{ ...DEFAULT_PL_CONFIG, id: true, settled_from: '2026-07-01' }],
  partners: ['Marco', 'Walter', 'Toto'].map((label, n) => ({ id: 'p'+n, label, is_active: true, takes_delivery: true, takes_residual: true })),
  invoices: [doc], accounts: [account], txs: [tx], allocations: [], legacy: [] }
const proof = (txs = [tx], modern: Record<string, unknown>[] = [], old: Record<string, unknown>[] = []) => economicProof([row], txs, [account], [doc], modern, old, today).get('r')!
assert.equal(proof().completedOn, '2026-11-10', 'Ottobre incassato a novembre conserva la data bancaria')
assert.equal(proof([{ ...tx, source: 'derivato' }]).covered, null)
assert.equal(proof([{ ...tx, hidden_reason: 'personale' }]).covered, null, 'Nascosto resta in cassa, non certifica una riga economica')
assert.equal(proof([{ ...tx, kind: 'giroconto' }]).covered, null)
assert.equal(proof([{ ...tx, kind: 'finanziamento' }]).covered, null)
assert.equal(proof([{ ...tx, booked_on: '2026-07-01' }]).documentOk, false, 'Anticipo oltre la finestra ammessa: documento da verificare')
assert.equal(proof([{ ...tx, booked_on: '2026-11-15' }]).covered, null)
assert.equal(proof([{ ...tx, amount: 500 }]).completedOn, null)
assert.equal(proof([tx, { ...tx, id: 'late', amount: 10, booked_on: '2026-11-12' }]).completedOn, '2026-11-10', 'Eccedenza successiva non sposta il primo completamento')
const a = { tx_id: 't', revenue_line_id: 'r', amount: 1220, evidence: 'certificata' }
assert.equal(proof([tx], [a], [a]).covered, 1220, 'Registri equivalenti non duplicano la quota')
assert.equal(proof([tx], [a], [a]).referenceIssues.length, 0, 'Due registri uguali non diventano una divergenza')
const missingInvoice = economicProof([{ ...row, invoice_id: null }], [tx], [account], [doc], [a], [a], today).get('r')!
assert.equal(missingInvoice.covered, null, 'La diagnosi non conferma un collegamento ancora assente')
assert.deepEqual(missingInvoice.referenceIssues.map(r => r.code), ['fattura_riga_assente'])
assert.equal(proof([tx], [a], [{ ...a, amount: 500 }]).referenceIssues[0].code, 'registri_divergenti')
assert.equal(proof([tx], [{ ...a, amount: 1221 }]).referenceIssues[0].code, 'capienza_superata')
assert.equal(proof([tx], [a], [{ ...a, amount: 500 }]).covered, null)
assert.equal(proof([tx], [{ ...a, amount: 1221 }]).covered, null)
assert.equal(proof([tx], [{ ...a, evidence: 'dichiarata' }]).covered, null)
assert.equal(proof([tx], [a, { tx_id: 't', payout_id: 'pay', amount: 10, evidence: 'certificata' }]).covered, null, 'Capienza globale del movimento')
assert.equal(economicProof([row], [tx], [{ ...account, currency: 'USD' }], [doc], [], [], today).get('r')?.covered, null)
const acc = economicAccrual(input)
assert.equal(acc.soci.length, 3)
assert.equal(acc.soci[0].matured, 150, '10% delivery più 5% commerciale condiviso')
assert.equal(acc.soci[0].eligible, 150)
assert.equal(acc.soci[2].matured, 150, 'Toto Piacente corrisponde al socio Toto, senza perdere il suo ID')
assert.equal(acc.soci[2].eligible, 150)
assert.equal(acc.soci[0].settled, null)
assert.equal(acc.soci[0].remaining, null)
const seed = { id: 'seed', center_id: 'payroll', label: 'Voce Personale del vecchio piano', supplier: null, amount: 9999, frequency: 'mensile', is_active: true, project_id: null }
const registeredPayroll = { id: 'actual-payroll', month_id: 'm', actual: 300, budget: 300, vat_applied: false, vat_rate: 0 }
const payrollInput = { ...input, items: [seed], costs: [registeredPayroll], costCenters: [{ id: 'payroll', name: 'Personale' }] }
assert.equal(economicAccrual(payrollInput).missingCosts.length, 0, 'Il residuo a piano Personale non è una seconda occorrenza del costo HR')
assert.equal(economicAccrual(payrollInput).costsKnown, 300, 'Il costo realmente registrato resta nel conto economico')
assert.equal(economicAccrual({ ...payrollInput, costCenters: [] }).missingCosts.length, 1, 'Senza identità dell’area non si elimina un costo dal piano')
assert.equal(economicAccrual({ ...payrollInput, costCenters: [{ id: 'payroll', name: 'Altra area' }] }).missingCosts.length, 1)
const withPartnerCost = economicAccrual({ ...input, costs: [{ id: 'pc', month_id: 'm', actual: 42, budget: 42, vat_applied: false, vat_rate: 0, partner_id: 'p0' }] })
assert.equal(withPartnerCost.costsKnown, withPartnerCost.totals?.costs.actual, 'Stesso totale costi del motore, anche con spese imputate ai soci')
assert.equal(economicAccrual({ ...input, today: '2026-11-09' }).soci[0].eligible, 0, 'Nessun incasso futuro presunto')
assert.equal(economicAccrual({ ...input, revenue: [{ ...row, amount_net: null }] }).soci[0].matured, null)
assert.equal(economicAccrual({ ...input, config: [] }).soci[0].matured, null)
assert.equal(economicAccrual({ ...input, config: [{ ...input.config[0], digital_partner_pct: 5 }] }).soci[0].matured, null)
const secondDoc = { ...doc, id: 'i2' }
const digital = economicAccrual({ ...input,
  revenue: [{ ...row, kind: 'digital', project_id: 'project' }, { ...row, id: 'r2', invoice_id: 'i2', kind: 'digital', project_id: 'project' }],
  costs: [{ id: 'c', month_id: 'm', actual: 500, budget: 500, vat_rate: 0, vat_applied: false, project_id: 'project' }],
  invoices: [doc, secondDoc] })
assert.equal(digital.soci[0].matured, 450)
assert.equal(digital.soci[0].eligible, 225, 'Esterni di competenza e denominatore intero anche con una rata incassata su due')
assert.throws(() => economicAccrual({ ...input, months: [] }), /Competenza/)
const changedStream = { id: 's', label: 'Accordo', kind: 'digital', billing: 'recurring', amount: 1000, vat_rate: .22, status: 'attivo', project_id: null, start_date: month, end_date: null } as EconomicsInput['streams'][number]
assert.equal(economicAccrual({ ...input, streams: [changedStream], revenue: [{ ...row, stream_id: 's' }] }).soci[0].matured, null, 'Tipo divergente dall’accordo: non distribuire la percentuale vecchia')
assert.equal(economicAccrual({ ...input, months: [{ ...input.months[0], status: 'chiuso' }], streams: [changedStream], revenue: [{ ...row, stream_id: 's' }] }).soci[0].matured, 150, 'Mese chiuso conserva la fotografia')
// Incomplete months retain the provable part without pretending it is a complete entitlement.
const missingStream = { ...changedStream, id: 'missing', kind: 'growth', billing: 'recurring', amount: 2000 } as EconomicsInput['streams'][number]
const partial = economicAccrual({ ...input, streams: [missingStream] })
assert.equal(partial.soci[0].matured, null)
assert.equal(partial.soci[0].knownMatured, 150)
assert.equal(partial.soci[2].knownMatured, 150)
assert.equal(partial.soci[0].knownEligible, 150)
assert.ok(partial.soci[0].rows.length > 0)
assert.equal(partial.soci[0].prepared, null)
assert.match(partial.soci[0].registrationIssues.join(' '), /non disponibile/)
const oldMonth = '2026-09-01'
const unrelatedHistory = economicAccrual({ ...input, months: [...input.months, { id: 'old', month: oldMonth }],
  streams: [{ ...changedStream, id: 'historic', start_date: oldMonth, end_date: '2026-09-30' }],
  revenue: [...input.revenue, { ...row, id: 'old-row', invoice_id: null, month_id: 'old', stream_id: 'historic' }] })
assert.equal(unrelatedHistory.soci[0].matured, 150, 'An unrelated historic drift cannot block this month')
const missingExternal = economicAccrual({ ...input, revenue: [{ ...row, kind: 'digital', project_id: 'project' }], items: [{ ...seed, center_id: null, project_id: 'project' }] })
assert.equal(missingExternal.soci[0].knownMatured, null, 'Never compute Digital quotas as if an absent external cost were zero')
assert.ok(missingExternal.omitted.some(r => r.why.includes('Costo esterno')))
const scopeDenied = economicAccrual({ ...input, revenue: [{ ...row, kind: 'digital' }], items: [seed] })
assert.equal(scopeDenied.soci[0].knownMatured, null, 'Digital with unknown scope is not a computable partial')
const payout = { id: 'pay', month_id: 'm', person_key: 'p:p0', kind: 'socio', amount: 150, paid: true }
const paidTx = { ...tx, id: 'out', amount: -150, invoice_id: null, revenue_line_id: null, kind: 'pagamento' } as EconomicsInput['txs'][number]
const withEvidence = economicAccrual({ ...input, payouts: [payout], txs: [...input.txs, paidTx], allocations: [{ id: 'q', tx_id: 'out', payout_id: 'pay', amount: 150, evidence: 'certificata' }] })
assert.equal(withEvidence.soci[0].prepared, 150)
assert.equal(withEvidence.soci[0].settled, 150)
assert.equal(withEvidence.soci[0].remaining, 0, 'Only the residual of this explicitly covered prepared record')
assert.equal(economicAccrual({ ...input, payouts: [payout] }).soci[0].settled, null)
assert.equal(economicAccrual({ ...input, payouts: [payout] }).soci[0].remaining, null)
const cash = economicCash([account], [{ ...tx, booked_on: '2026-10-15', hidden_reason: 'nascosto' }], month, today)
assert.equal(cash.incoming, 1220)
assert.equal(cash.consolidated, null)
assert.equal(cash.perAccount[0].read.reconstructed, 1320)
assert.equal(economicCash([account], [tx], month, today).incoming, null, 'Nessun record del mese non è entrato zero')
const transfer = { ...tx, amount: -100, kind: 'giroconto' as const, transfer_pair_id: 'mate', booked_on: '2026-10-15' }
assert.equal(economicCash([account], [transfer], month, today).outgoing, 0)
assert.equal(economicCash([account], [transfer], month, today).unresolved.length, 1)
const dto = economicsReport({ ok: true, observedAt: input.observedAt, input, cash, accrual: acc })
assert.equal(economicsPdf(dto).subarray(0, 5).toString(), '%PDF-', 'Il download produce un PDF binario, non HTML rinominato')
assert.ok(economicsPdf({ ...dto, people: [{ ...dto.people[0], matured: -42.42 }] }).includes(Buffer.from('-42,42')), 'Il meno Unicode del formatter resta un segno negativo nel PDF')
const signed = signEconomicsReport(dto, 'admin', 'secret-for-test')
const now = Date.parse(input.observedAt)
assert.deepEqual(readEconomicsReport(signed.payload, signed.signature, 'admin', 'secret-for-test', now)?.people, dto.people)
assert.equal(readEconomicsReport(signed.payload, signed.signature, 'manager', 'secret-for-test', now), null)
assert.equal(readEconomicsReport(signed.payload.replace('150', '999'), signed.signature, 'admin', 'secret-for-test', now), null)
assert.equal(readEconomicsReport(signed.payload, signed.signature, 'admin', 'secret-for-test', now + 16*60000), null)
assert.equal(readEconomicsReport(signed.payload, signed.signature, 'admin', 'wrong-secret', now), null)
for (const path of ['lib/lab-economics-load.ts', 'app/(dashboard)/lab/conto-economico/page.tsx', 'app/api/lab/economics/compensi/route.ts']) {
  const source = readFileSync(path, 'utf8')
  assert.match(source, /await requireLabAdmin\(\)/)
  assert.doesNotMatch(source, /\.\s*(insert|update|upsert|delete|rpc)\s*\(/)
  assert.doesNotMatch(source, /from ['"]@\/app\/actions\//)
}
console.log('Tutti i controlli passano')
