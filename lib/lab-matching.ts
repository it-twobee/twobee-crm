import type { LabBankAccount, LabBankTx } from '@/lib/lab-bank'
import type { LabConnectionData } from '@/lib/lab-connections'
import type { LabInvoice } from '@/lib/lab-invoices'
import type { InvoiceBankResult } from '@/lib/lab-invoice-bank'

export type MatchMovement = { id: string; label: string; date: string; account: string; currency: string; signedAmount: number; available: number | null; why: string | null; href: string }
export type MatchDocument = { id: string; label: string; date: string; currency: string; direction: number; total: number | null; paid: number | null; remaining: number | null; why: string | null; href: string }
export type MatchPair = { movementId: string; documentId: string; amount: number }
export type MatchPlan = { pairs: MatchPair[]; issues: string[]; total: number; movementRemainders: { id: string; amount: number }[]; documentRemainders: { id: string; amount: number }[] }
const cents = (v: number) => Math.round(v * 100)
export function matchingSources(accounts: LabBankAccount[], txs: LabBankTx[], documents: LabInvoice[], refs: LabConnectionData, proof: InvoiceBankResult, today: string) {
  const movements: MatchMovement[] = txs.filter(t => t.source === 'banca' && t.booked_on <= today).map(t => {
    const account = accounts.find(a => a.id === t.account_id), checked = proof.transactions.get(t.id)
    const modern = refs.allocations.filter(a => a.tx_id === t.id && !a.superseded), legacy = refs.legacy.filter(a => a.tx_id === t.id)
    const parts = modern.length ? modern : legacy
    const reserved = parts.reduce((n, a) => n + cents(Number(a.amount)), 0)
    const explicit = !!(t.invoice_id || t.revenue_line_id || t.cost_line_id || t.payslip_id || t.hr_invoice_id || refs.salaryLinks.some(l => l.tx_id === t.id))
    const issues = [...(checked?.issues ?? []), ...(checked?.links.flatMap(l => l.issues) ?? [])]
    const why = !account || !checked ? 'Conto o raccordi non disponibili' : t.kind === 'giroconto' || t.transfer_pair_id ? 'Giroconto: verifica la coppia di conti' : t.payslip_id || t.hr_invoice_id || refs.salaryLinks.some(l => l.tx_id === t.id) ? 'Movimento riferito a documenti risorse: verifica le quote nella sezione Risorse' : t.no_match_needed ? 'Movimento classificato senza abbinamento richiesto' : issues.length ? 'Riferimenti o quote esistenti da verificare' : explicit && !parts.length ? 'Movimento già impegnato da un riferimento diretto' : !Number.isFinite(reserved) || reserved > cents(Math.abs(t.amount)) ? 'Quote esistenti da verificare' : null
    const available = why ? null : Math.max(0, cents(Math.abs(t.amount)) - reserved) / 100
    return { id: t.id, label: t.counterparty || t.description || 'Movimento', date: t.booked_on, account: account?.label ?? 'Conto n/d', currency: account?.currency ?? '', signedAmount: t.amount, available, why: why ?? (available === 0 ? 'Movimento già interamente attribuito' : null), href: `/lab/banca?${new URLSearchParams({ m: `${t.booked_on.slice(0, 7)}-01`, conto: t.account_id, movimento: t.id })}#movimento-${t.id}` }
  })
  const invoices: MatchDocument[] = documents.filter(d => d.issuedOn <= today).map(d => {
    const p = proof.invoices.get(d.id)
    const remaining = p && !p.issues.length && p.expected != null && p.state !== 'eccedente' ? Math.max(0, cents(p.expected) - cents(p.paidKnown ?? 0)) / 100 : null
    return { id: d.id, label: `${d.direction === 'emessa' ? 'Emessa' : 'Ricevuta'} ${d.number} · ${d.counterpartyName}`, date: d.issuedOn, currency: d.currency, direction: (d.direction === 'emessa' ? 1 : -1) * d.sign, total: p?.expected ?? null, paid: p?.paidKnown ?? null, remaining, why: remaining == null ? 'Ritenute, rettifiche o riferimenti da verificare' : remaining === 0 ? 'Importo già coperto dalle quote bancarie' : null, href: `/lab/fatturazione?documento=${encodeURIComponent(d.id)}` }
  })
  return { movements, invoices }
}
/** Derive only unique shares: no greedy split of an insufficient cumulative transfer. */
export function matchingPlan(movements: MatchMovement[], documents: MatchDocument[], movementIds: string[], documentIds: string[]): MatchPlan {
  const empty: MatchPlan = { pairs: [], issues: [], total: 0, movementRemainders: [], documentRemainders: [] }
  const ms = Array.from(new Set(movementIds)).map(id => movements.find(t => t.id === id)), ds = Array.from(new Set(documentIds)).map(id => documents.find(d => d.id === id))
  if (!ms.length || !ds.length) return { ...empty, issues: ['Scegli almeno un movimento e una fattura.'] }
  if (ms.some(m => !m || m.available == null || !Number.isFinite(m.available) || m.available <= 0 || m.why) || ds.some(d => !d || d.remaining == null || !Number.isFinite(d.remaining) || d.remaining <= 0 || d.why)) return { ...empty, issues: ['Una fonte selezionata non ha un residuo utilizzabile: apri le prove prima di abbinarla.'] }
  const txs = ms as MatchMovement[], docs = ds as MatchDocument[]
  if (txs.length > 1 && docs.length > 1) return { ...empty, issues: ['Lavora su un movimento alla volta oppure su una fattura alla volta, così ogni quota rimane riconoscibile.'] }
  if (new Set([...txs.map(t => t.currency), ...docs.map(d => d.currency)]).size !== 1 || !txs[0].currency) return { ...empty, issues: ['Seleziona documenti e movimenti nella stessa valuta. Nessuna conversione automatica.'] }
  if (txs.some(t => docs.some(d => Math.sign(t.signedAmount) !== d.direction))) return { ...empty, issues: ['Il verso non coincide: entrate con emesse, uscite con ricevute; verso inverso per i rimborsi.'] }
  const available = txs.reduce((n, t) => n + cents(t.available!), 0), needed = docs.reduce((n, d) => n + cents(d.remaining!), 0)
  if (docs.length > 1 && needed > available) return { ...empty, issues: ['Il movimento non copre tutti i residui selezionati. Servono le componenti della distinta per decidere la ripartizione: non distribuiamo il denaro in ordine di selezione.'] }
  if (txs.length > 1 && available > needed) return { ...empty, issues: ['I movimenti selezionati superano il residuo della fattura. Rimuovi quelli non pertinenti o verifica la distinta prima di ripartirli.'] }
  const pairs = txs.length === 1 ? docs.map(d => ({ movementId: txs[0].id, documentId: d.id, amount: Math.min(cents(txs[0].available!), cents(d.remaining!)) / 100 })) : txs.map(t => ({ movementId: t.id, documentId: docs[0].id, amount: t.available! }))
  const used = (id: string, kind: 'movementId' | 'documentId') => pairs.filter(p => p[kind] === id).reduce((n, p) => n + cents(p.amount), 0)
  return { pairs, issues: [], total: pairs.reduce((n, p) => n + cents(p.amount), 0) / 100,
    movementRemainders: txs.map(t => ({ id: t.id, amount: (cents(t.available!) - used(t.id, 'movementId')) / 100 })),
    documentRemainders: docs.map(d => ({ id: d.id, amount: (cents(d.remaining!) - used(d.id, 'documentId')) / 100 })) }
}
