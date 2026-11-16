import { targetCoverage, txCoverage, type Allocation } from '@/lib/allocations'
import { isVoided, partlyVoided } from '@/lib/invoices'
import { knownAmount } from '@/lib/lab-deals'
import type { LabInvoice } from '@/lib/lab-invoices'
import type { LabBankTx } from '@/lib/lab-bank'
import type { LabConnectionData } from '@/lib/lab-connections'

type Row = Record<string, unknown>
export type DocumentBankTx = Pick<LabBankTx, 'id' | 'account_id' | 'booked_on' | 'amount' | 'source' | 'kind' | 'invoice_id' | 'revenue_line_id' | 'cost_line_id' | 'payslip_id' | 'hr_invoice_id' | 'transfer_pair_id'>
type Account = { id: string; currency: string; label: string }
export type InvoiceBankLink = { invoiceId: string; amount: number | null; via: string; issues: string[] }
export type BankDocumentProof = { txId: string; amount: number; currency: string | null; bank: boolean; links: InvoiceBankLink[]; attributed: number | null; unassigned: number | null; issues: string[] }
export type InvoiceBankProof = { invoiceId: string; currency: string; expected: number | null; paidKnown: number | null; residual: number | null;
  state: 'senza_riscontro' | 'da_verificare' | 'parziale' | 'coperta' | 'eccedente'; issues: string[];
  entries: { txId: string; accountId: string; account: string; date: string; amount: number; signedAmount: number; via: string }[]; referencedTxIds: string[]; references: { txId: string; accountId: string; account: string; date: string; amount: number; currency: string }[] }
export type InvoiceBankResult = { transactions: Map<string, BankDocumentProof>; invoices: Map<string, InvoiceBankProof> }
const cents = (n: number) => Math.round(n * 100)
const sum = (xs: number[]) => xs.reduce((s, n) => s + cents(n), 0) / 100
const targets = (a: Row) => ['revenue_line_id', 'cost_line_id', 'payout_id', 'f24_id'].filter(k => a[k] != null)
const target = (a: Row) => `${targets(a)[0]}:${a[targets(a)[0]]}`
const signature = (rows: Row[]) => rows.map(a => `${target(a)}:${cents(Number(a.amount))}`).sort().join('|')

/** Bank events are the facts; documents and ledger rows explain portions of them. No matching by name/amount. */
export function invoiceBankReconciliation(documents: LabInvoice[], txs: DocumentBankTx[], accounts: Account[], refs: Pick<LabConnectionData, 'revenue' | 'costs' | 'allocations' | 'legacy' | 'hrInvoices'>, today: string): InvoiceBankResult {
  const documentsById = new Map(documents.map(i => [i.id, i])), active = refs.allocations.filter(a => !a.superseded)
  const transactions = new Map<string, BankDocumentProof>(), invoices = new Map<string, InvoiceBankProof>()
  const rowInvoice = (a: Row) => {
    const row = a.revenue_line_id ? refs.revenue.find(r => r.id === a.revenue_line_id) : a.cost_line_id ? refs.costs.find(r => r.id === a.cost_line_id) : undefined
    return typeof row?.invoice_id === 'string' ? row.invoice_id : null
  }
  for (const doc of documents) {
    const issues: string[] = []
    if (doc.withholding !== 0) issues.push('Ritenute: saldo documentale da raccordare, nessuna sottrazione automatica')
    if (isVoided(doc) || partlyVoided(doc) || doc.excludedReason) issues.push('Documento rettificato o escluso: residuo da ricostruire, fatti bancari conservati')
    const expected = !issues.length && Number.isFinite(doc.total) && doc.total >= 0 ? doc.total : null
    invoices.set(doc.id, { invoiceId: doc.id, currency: doc.currency, expected, paidKnown: null, residual: null, state: 'senza_riscontro', issues, entries: [], referencedTxIds: [], references: [] })
  }
  for (const tx of txs) {
    const account = accounts.find(a => a.id === tx.account_id), modern = active.filter(a => a.tx_id === tx.id), old = refs.legacy.filter(a => a.tx_id === tx.id)
    const parts = modern.length ? modern : old
    const issues: string[] = [], candidates = new Map<string, { amount: number; via: string; issues: string[] }>()
    const add = (id: string, amount: number, via: string, ownIssues: string[] = []) => {
      const existing = candidates.get(id)
      if (existing) { existing.amount = sum([existing.amount, amount]); existing.issues.push(...ownIssues) }
      else candidates.set(id, { amount, via, issues: [...ownIssues] })
    }
    if (modern.length && old.length && signature(modern) !== signature(old)) issues.push('Quote correnti e storiche divergenti')
    if (parts.length) {
      const converted = parts.map((a, n) => ({ id: String(a.id ?? n), txId: tx.id, target: a.revenue_line_id ? 'ricavo' : a.payout_id ? 'compenso' : 'costo',
        targetId: target(a), amount: Number(a.amount), evidence: modern.length ? a.evidence : 'certificata' })) as Allocation[]
      if (parts.some(a => targets(a).length !== 1 || knownAmount(a.amount) == null || Number(a.amount) <= 0)) issues.push('Destinazioni o importi delle quote non validi')
      if (modern.some(a => a.evidence !== 'certificata')) issues.push('Quote prive di evidenza certificata')
      if (new Set(parts.map(target)).size !== parts.length) issues.push('Destinazione duplicata sul movimento')
      if (cents(txCoverage(tx, converted).allocated) > cents(Math.abs(tx.amount))) issues.push('Le quote superano il movimento bancario')
      for (const part of parts) {
        const id = rowInvoice(part)
        if (!id) continue
        const doc = documentsById.get(id)
        const wrongSide = !!doc && (part.revenue_line_id ? doc.direction !== 'emessa' : doc.direction !== 'ricevuta')
        add(id, Number(part.amount), modern.length ? 'quota corrente' : 'quota storica', wrongSide ? ['Verso incompatibile con la riga economica della quota'] : [])
      }
      if (tx.invoice_id && candidates.size && !candidates.has(tx.invoice_id)) issues.push('Fattura diretta diversa dai documenti delle quote')
      if (tx.invoice_id && !candidates.has(tx.invoice_id)) add(tx.invoice_id, 0, 'riferimento diretto', ['Manca la quota attribuibile a questa fattura sul movimento ripartito'])
      if ([tx.revenue_line_id, tx.cost_line_id].filter(Boolean).some(id => !parts.some(a => a.revenue_line_id === id || a.cost_line_id === id))) issues.push('Riferimento diretto diverso dalle destinazioni delle quote')
    } else {
      const direct = new Set<string>()
      if (tx.invoice_id) direct.add(tx.invoice_id)
      const lineId = rowInvoice({ revenue_line_id: tx.revenue_line_id, cost_line_id: tx.cost_line_id })
      if (lineId) direct.add(lineId)
      const hr = tx.hr_invoice_id ? refs.hrInvoices.find(r => r.id === tx.hr_invoice_id) : undefined
      if (typeof hr?.invoice_id === 'string') direct.add(hr.invoice_id)
      if (direct.size > 1 || tx.revenue_line_id && tx.cost_line_id) issues.push('Più riferimenti diretti non coerenti')
      for (const id of Array.from(direct)) add(id, Math.abs(tx.amount), 'riferimento diretto')
    }
    if (!account) issues.push('Conto o valuta non disponibile')
    if (candidates.size && (tx.kind === 'giroconto' || tx.transfer_pair_id)) issues.push('Giroconto: non è un incasso o pagamento di fattura')
    if (candidates.size && tx.payslip_id) issues.push('Movimento riferito a un cedolino: attribuzione documentale da verificare')
    const bank = tx.source === 'banca' && tx.booked_on <= today
    const links: InvoiceBankLink[] = Array.from(candidates, ([id, candidate]) => {
      const doc = documentsById.get(id), why = [...issues, ...candidate.issues]
      if (!doc) why.push('Fattura riferita non disponibile')
      if (doc && Math.sign(tx.amount) !== (doc.direction === 'emessa' ? 1 : -1) * doc.sign) why.push('Verso bancario incompatibile con emessa/ricevuta o rimborso')
      if (doc && doc.currency !== account?.currency) why.push('Valuta del movimento diversa dalla fattura')
      if (!bank) why.push(tx.source !== 'banca' ? 'Registrazione manuale o derivata: non è un fatto bancario' : 'Movimento futuro non ancora osservato')
      const accepted = !why.length && Number.isFinite(candidate.amount) && candidate.amount > 0
      const proof = invoices.get(id)
      if (proof) {
        proof.referencedTxIds.push(tx.id)
        if (bank && account) proof.references.push({ txId: tx.id, accountId: tx.account_id, account: account.label, date: tx.booked_on, amount: tx.amount, currency: account.currency })
        if (accepted) proof.entries.push({ txId: tx.id, accountId: tx.account_id, account: account!.label, date: tx.booked_on,
          amount: candidate.amount, signedAmount: Math.sign(tx.amount) * candidate.amount, via: candidate.via })
        else if (bank) proof.issues.push(...why.map(w => `${tx.id}: ${w}`))
      }
      return { invoiceId: id, amount: accepted ? candidate.amount : null, via: candidate.via, issues: Array.from(new Set(why)) }
    })
    const attributed = bank && account ? sum(links.flatMap(l => l.amount == null ? [] : [l.amount])) : null
    transactions.set(tx.id, { txId: tx.id, amount: tx.amount, currency: account?.currency ?? null, bank, links,
      attributed, unassigned: attributed != null && !issues.length && links.every(l => !l.issues.length) ? Math.round((Math.abs(tx.amount) - attributed) * 100) / 100 : null, issues: Array.from(new Set(issues)) })
  }
  for (const doc of documents) {
    const proof = invoices.get(doc.id)!
    proof.issues = Array.from(new Set(proof.issues))
    if (proof.entries.length) proof.paidKnown = sum(proof.entries.map(e => e.amount))
    const allocs: Allocation[] = proof.entries.map((e, n) => ({ id: String(n), txId: e.txId, target: 'ricavo', targetId: doc.id, amount: e.amount, evidence: 'certificata' }))
    const coverage = proof.expected == null ? null : targetCoverage(proof.expected, 'ricavo', doc.id, allocs)
    proof.residual = proof.paidKnown != null && coverage && !proof.issues.length && coverage.state !== 'eccedente' ? coverage.remaining : null
    proof.state = proof.issues.length ? 'da_verificare' : !proof.entries.length ? 'senza_riscontro' : !coverage ? 'da_verificare' : coverage.state === 'coperto' ? 'coperta' : coverage.state === 'eccedente' ? 'eccedente' : 'parziale'
  }
  return { transactions, invoices }
}

/** Aggregation by BANK date, never by invoice issue date or a paid flag. */
export function invoiceBankCash(result: InvoiceBankResult, ids: string[]) {
  const entries = Array.from(new Set(ids)).flatMap(id => result.invoices.get(id)?.currency === 'EUR' ? result.invoices.get(id)!.entries : [])
  const months = Array.from(new Set(entries.map(e => `${e.date.slice(0, 7)}-01`))).sort()
  return { incoming: entries.some(e => e.signedAmount > 0) ? sum(entries.filter(e => e.signedAmount > 0).map(e => e.amount)) : null,
    outgoing: entries.some(e => e.signedAmount < 0) ? sum(entries.filter(e => e.signedAmount < 0).map(e => e.amount)) : null,
    rows: months.map(month => ({ id: month, date: month, label: month.slice(0, 7),
      href: `/lab/banca?m=${month}#dati-prove`, values: {
        incoming: sum(entries.filter(e => e.date.startsWith(month.slice(0, 7)) && e.signedAmount > 0).map(e => e.amount)),
        outgoing: sum(entries.filter(e => e.date.startsWith(month.slice(0, 7)) && e.signedAmount < 0).map(e => e.amount)),
      } })) }
}
