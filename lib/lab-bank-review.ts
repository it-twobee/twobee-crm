import type { LabBankAccount, LabBankTx } from '@/lib/lab-bank'
import type { LabConnectionData } from '@/lib/lab-connections'
import type { LabInvoice } from '@/lib/lab-invoices'
import type { InvoiceBankResult } from '@/lib/lab-invoice-bank'
import type { MatchMovement } from '@/lib/lab-matching'
import { counterpartyMatchStrength, recognizedSupplier } from '@/lib/lab-match-suggestions'
export const REVIEW_CATEGORIES = { fatture: 'Incassi e pagamenti', risorse: 'Stipendi e beneficiari', fisco: 'F24 e imposte', trasferimenti: 'Giroconti e finanziamenti', rimborsi: 'Rimborsi, cashback e accrediti', esclusi: 'Esclusi operativi' }
export type BankReviewRow = { id: string; label: string; description: string; date: string; accountId: string; account: string; currency: string; amount: number; category: keyof typeof REVIEW_CATEGORIES; status: 'da_raccordare' | 'parziale' | 'collegato' | 'da_verificare' | 'altra_causale'; why: string[]; href: string; actionHref: string; invoiceCount: number; available: number | null }
export function bankReviewRows(txs: LabBankTx[], accounts: LabBankAccount[], documents: LabInvoice[], refs: LabConnectionData, proof: InvoiceBankResult, sources: MatchMovement[], today: string): BankReviewRow[] {
  return txs.filter(t => t.source === 'banca' && t.booked_on <= today).map(t => {
    const account = accounts.find(a => a.id === t.account_id), checked = proof.transactions.get(t.id), source = sources.find(m => m.id === t.id)
    const modern = refs.allocations.filter(a => a.tx_id === t.id && !a.superseded), legacy = refs.legacy.filter(a => a.tx_id === t.id), parts = modern.length ? modern : legacy
    const resource = !!(refs.people.some(p => counterpartyMatchStrength(String(p.full_name ?? ''), t.counterparty ?? '') >= .95) || parts.some(a => refs.costs.some(c => c.id === a.cost_line_id && c.category === 'Personale')) || t.payslip_id || t.hr_invoice_id || t.kind === 'stipendio' || refs.salaryLinks.some(l => l.tx_id === t.id))
    const tax = t.kind === 'imposta' || parts.some(a => a.f24_id)
    const transferred = t.kind === 'giroconto' || t.kind === 'finanziamento' || !!t.transfer_pair_id
    const supplierCredit = t.amount > 0 && !!recognizedSupplier(`${t.counterparty ?? ''} ${t.description}`) && !checked?.links.some(l => documents.some(d => d.id === l.invoiceId && d.direction === 'emessa' && d.sign > 0))
    const refunded = supplierCredit || t.amount > 0 && /vivid/i.test(`${t.counterparty} ${t.description}`) || /\b(cashback|cash back|refund|rimborso|storno)\b/i.test(t.description) || !!checked?.links.some(l => documents.some(d => d.id === l.invoiceId && d.sign < 0))
    const why = [...(checked?.issues ?? []), ...(checked?.links.flatMap(l => l.issues) ?? [])]
    for (const l of checked?.links ?? []) {
      const doc = documents.find(d => d.id === l.invoiceId)
      if (doc && t.counterparty && counterpartyMatchStrength(doc.counterpartyName, `${t.counterparty} ${t.description}`) < .45) why.push(`Controparte bancaria diversa o non riconosciuta rispetto alla fattura ${doc.number}: verifica il beneficiario.`)
    }
    const category: BankReviewRow['category'] = t.hidden_reason || t.kind === 'commissione' ? 'esclusi' : transferred ? 'trasferimenti' : tax ? 'fisco' : resource ? 'risorse' : refunded ? 'rimborsi' : t.no_match_needed ? 'esclusi' : 'fatture'
    const known = checked?.attributed, residual = checked?.unassigned
    const reserved = !!(t.revenue_line_id || t.cost_line_id || parts.length || refs.salaryLinks.some(l => l.tx_id === t.id))
    let status: BankReviewRow['status'] = why.length || !account || !checked ? 'da_verificare' : checked.links.length && known != null && residual === 0 ? 'collegato' : checked.links.length && known != null && known > 0 ? 'parziale' : reserved ? 'da_verificare' : category !== 'fatture' ? 'altra_causale' : 'da_raccordare'
    if (category === 'esclusi' && !why.length) status = 'altra_causale'
    if (!account || !checked) why.push('Fonti del conto o dei raccordi non disponibili.')
    if (reserved && !checked?.links.length) why.push('Esistono quote o riferimenti economici: controlla le prove prima di aggiungere una fattura.')
    if (parts.length > 1 || refs.salaryLinks.filter(l => l.tx_id === t.id).length > 1) why.push('Movimento con più destinazioni: conserva la distinta e verifica ogni quota senza duplicare il totale.')
    if (t.kind === 'commissione') why.push('Commissione bancaria: consulta il movimento nell’estratto.')
    if (t.hidden_reason) why.push(`Nascosto operativo: ${t.hidden_reason}. Rimane nella cassa.`)
    if (t.no_match_needed) why.push('Classificato senza aggancio richiesto; non equivale a fattura pagata.')
    if (category === 'rimborsi') why.push('Verifica rimborso, nota di credito o cashback: non è automaticamente un ricavo da fatturare.')
    if (t.amount > 0 && /vivid/i.test(`${t.counterparty} ${t.description}`)) why.push('Accredito Vivid da classificare sull’estratto: non assumiamo che sia cashback o fatturato.')
    const base = `/lab/banca?${new URLSearchParams({ m: t.booked_on.slice(0, 7) + '-01', conto: t.account_id, movimento: t.id })}#movimento-${t.id}`
    return { id: t.id, label: t.counterparty || t.description || 'Controparte n/d', description: t.description, date: t.booked_on, accountId: t.account_id, account: account?.label ?? 'Conto n/d', currency: account?.currency ?? '', amount: t.amount, category, status, why: Array.from(new Set(why)), href: base, actionHref: category === 'risorse' ? `/lab/risorse?m=${t.booked_on.slice(0, 7)}-01` : category === 'fisco' ? `/lab/risorse?m=${t.booked_on.slice(0, 7)}-01&vista=versamenti` : base, invoiceCount: checked?.links.length ?? 0, available: source?.available ?? null }
  }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}
