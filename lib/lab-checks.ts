import { bankReadout, monthEnd, type LabBankAccount, type LabBankTx } from '@/lib/lab-bank'
import { transactionConnections, type LabConnectionData } from '@/lib/lab-connections'
import { invoiceBankReconciliation } from '@/lib/lab-invoice-bank'
import type { LabInvoice } from '@/lib/lab-invoices'

export type LabCheck = { id: string; area: 'banca' | 'fatture' | 'competenze' | 'risorse' | 'fiscale'; priority: 'alta' | 'media' | 'informativa'; title: string; why: string; action: string; href: string; date: string; amount: number | null; amountLabel?: string; currency: string | null }
export const labCheckAnchor = (id: string) => `verifica-${Array.from(id).map(c => c.codePointAt(0)!.toString(16)).join('-')}`
export const CHECK_AREAS = { banca: 'Banca', fatture: 'Fatture', competenze: 'Competenze', risorse: 'Risorse', fiscale: 'Fiscale' }
export const CHECK_PRIORITIES = { alta: 'Da risolvere', media: 'Da verificare', informativa: 'Completezza delle fonti' }
const href = (path: string, parameters: Record<string, string>) => `/lab/${path}?${new URLSearchParams(parameters)}`
export function bankDocumentChecks(accounts: LabBankAccount[], txs: LabBankTx[], documents: LabInvoice[], refs: LabConnectionData, month: string, today: string): LabCheck[] {
  const end = monthEnd(month), upTo = end < today ? end : today
  const result: LabCheck[] = [], add = (item: LabCheck) => result.push(item)
  const docs = documents.filter(d => d.issuedOn <= upTo)
  const reconciliation = invoiceBankReconciliation(docs, txs, accounts, refs, upTo)
  for (const account of accounts.filter(a => a.opening_date <= upTo)) {
    const read = bankReadout(account, txs, month, today)
    const base = { area: 'banca' as const, date: upTo, amount: null, currency: account.currency, href: href('banca', { m: month, conto: account.id }), action: 'Controlla conto ed estratto' }
    if (read.beforeOpening || read.statementDifference != null && read.statementDifference !== 0) add({ ...base, id: `conto:${account.id}:quadratura`, priority: 'alta', title: `${account.label} · saldo da raccordare`, why: read.beforeOpening ? 'Sono presenti movimenti prima dell’apertura registrata.' : 'Saldo ricostruito e saldo dichiarato differiscono alla data del confronto.' })
    if (!account.statement_on || account.statement_balance == null || account.statement_on < upTo) add({ ...base, id: `conto:${account.id}:copertura`, priority: 'informativa', title: `${account.label} · copertura da documentare`, why: `L’ancora di saldo ${account.statement_on ?? 'assente'} non dimostra la completezza degli estratti fino al ${upTo}. Non implica che manchino movimenti.` })
  }
  for (const tx of txs.filter(t => t.source === 'banca' && t.booked_on >= month && t.booked_on <= upTo)) {
    const connection = transactionConnections(tx, refs), proof = reconciliation.transactions.get(tx.id)
    const why = Array.from(new Set([...connection.issues, ...(proof?.issues ?? []), ...(proof?.links.flatMap(l => l.issues) ?? [])]))
    const isTransfer = tx.kind === 'giroconto' || !!tx.transfer_pair_id
    if (isTransfer) {
      const mate = txs.find(t => t.id === tx.transfer_pair_id)
      if (!mate || mate.source !== 'banca' || mate.booked_on > upTo || mate.account_id === tx.account_id || mate.transfer_pair_id !== tx.id || Math.round(mate.amount * 100) !== -Math.round(tx.amount * 100) || accounts.find(a => a.id === mate.account_id)?.currency !== accounts.find(a => a.id === tx.account_id)?.currency) why.push('Coppia di giroconto assente o non coerente nei riferimenti letti.')
    }
    if (why.length || !connection.links.length && !proof?.links.length && !tx.no_match_needed && !isTransfer) add({
      id: `movimento:${tx.id}`, area: 'banca', priority: why.length ? 'alta' : 'media', title: tx.counterparty || tx.description || 'Movimento da spiegare',
      why: why.length ? why.join(' · ') : 'Nessuna fonte collegata nei registri letti. La natura può non richiedere una fattura; il movimento resta nella cassa.',
      action: 'Apri movimento e prove', href: href('banca', { m: month, conto: tx.account_id, movimento: tx.id }) + `#movimento-${tx.id}`, date: tx.booked_on, amount: tx.amount, amountLabel: 'Movimento bancario', currency: accounts.find(a => a.id === tx.account_id)?.currency ?? null,
    })
  }
  for (const doc of docs) {
    const proof = reconciliation.invoices.get(doc.id)!
    if (proof.state === 'coperta' || doc.excludedReason) continue
    add({ id: `fattura:${doc.id}`, area: 'fatture', priority: proof.state === 'da_verificare' || proof.state === 'eccedente' ? 'alta' : 'media', title: `${doc.direction === 'emessa' ? 'Emessa' : 'Ricevuta'} ${doc.number} · ${doc.counterpartyName}`,
      why: proof.issues.length ? proof.issues.join(' · ') : proof.state === 'parziale' ? 'Quote bancarie parziali: verifica i movimenti e il residuo del raccordo.' : 'Nessuna quota bancaria attribuibile alla data di osservazione. Non prova che il documento sia insoluto.', action: 'Verifica fattura e quote', href: href('fatturazione', { m: month, documento: doc.id }), date: doc.issuedOn, amount: proof.residual, amountLabel: 'Residuo del raccordo', currency: doc.currency })
  }
  const months = new Set(refs.months.filter(m => m.month === month).map(m => m.id))
  for (const [side, rows] of [['ricavo', refs.revenue], ['costo', refs.costs]] as const) for (const row of rows.filter(r => months.has(r.month_id) && !r.invoice_id)) add({
    id: `competenza:${side}:${row.id}`, area: 'competenze', priority: 'informativa', title: String(row.label || `Riga ${side}`), why: 'Riga registrata senza riferimento fattura. Verifica la fonte prevista per questa natura; non ogni costo richiede fattura.', action: 'Apri riga di competenza', href: href('conto-economico', { m: month, vista: 'maturato', riga: String(row.id), tipoRiga: side }) + '#righe-economiche', date: month, amount: null, currency: null,
  })
  if (!months.size) add({ id: `competenza:${month}:assente`, area: 'competenze', priority: 'media', title: 'Mese economico non registrato', why: 'La mancanza del mese impedisce il controllo delle righe registrate. Non equivale a ricavi e costi zero.', action: 'Apri competenze e piano', href: href('conto-economico', { m: month, vista: 'maturato' }), date: month, amount: null, currency: null })
  return result
}
export function filterLabChecks(items: LabCheck[], area: string, priority: string, query: string) {
  const rank = { alta: 0, media: 1, informativa: 2 }
  return items.filter(i => (!area || i.area === area) && (!priority || i.priority === priority) && (!query || `${i.title} ${i.why}`.toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it'))))
    .sort((a, b) => rank[a.priority] - rank[b.priority] || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}
export function labChecksCsv(items: LabCheck[], context: string) {
  const cell = (v: unknown) => { const s = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v ?? ''); return `"${(typeof v !== 'number' && /^[\s]*[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""')}"` }
  return '\uFEFF' + [[context], ['ID', 'Area', 'Priorità', 'Voce', 'Motivo', 'Prossima azione', 'Data', 'Importo', 'Significato importo', 'Valuta', 'Fonte'], ...items.map(i => [i.id, CHECK_AREAS[i.area], CHECK_PRIORITIES[i.priority], i.title, i.why, i.action, i.date, i.amount ?? 'n/d', i.amountLabel ?? 'n/d', i.currency ?? 'n/d', i.href])].map(row => row.map(cell).join(';')).join('\r\n')
}
