import 'server-only'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabBank } from '@/lib/lab-bank-load'
import { loadLabConnections } from '@/lib/lab-connections-load'
import { loadLabInvoiceRecords } from '@/lib/lab-invoice-records-load'
import { loadLabResources } from '@/lib/lab-resources-load'
import { bankDocumentChecks, type LabCheck } from '@/lib/lab-checks'
import { resourceCost, resourceF24 } from '@/lib/lab-resources'
import { loadLabEconomics } from '@/lib/lab-economics-load'
import { monthEnd } from '@/lib/lab-bank'

export async function loadLabChecks(month: string, today: string) {
  await requireLabAdmin()
  const observedAt = new Date().toISOString()
  const [bank, refs, documents, resources, economics] = await Promise.all([loadLabBank(today), loadLabConnections(today), loadLabInvoiceRecords(today), loadLabResources(today), loadLabEconomics(month, today)])
  const unavailable: string[] = [], items: LabCheck[] = []
  if (bank.ok && refs && documents) items.push(...bankDocumentChecks(bank.accounts, bank.txs, documents, refs, month, today))
  else unavailable.push('Controlli banca, fatture e competenze: una fonte richiesta non è disponibile.')
  const end = monthEnd(month), upTo = end < today ? end : today
  if (resources.ok) {
    for (const person of resources.people.filter(p => p.is_active !== false && p.status !== 'inactive' && (!p.start_date || String(p.start_date) <= upTo) && (!p.hired_on || String(p.hired_on) <= upTo) && (!p.end_date || String(p.end_date) >= month))) {
      const cost = resourceCost(person, resources.slips, resources.collab, resources.invoices, resources.params, month)
      if (cost.value == null || cost.estimated) items.push({ id: `risorsa:${person.id}:${month}`, area: 'risorse', priority: cost.value == null ? 'media' : 'informativa', title: String(person.full_name || 'Risorsa'), why: cost.why, action: 'Controlla documenti della risorsa', href: `/lab/risorse?${new URLSearchParams({ m: month, persona: String(person.id) })}`, date: month, amount: null, currency: null })
    }
    for (const head of resources.f24.filter(h => String(h.due_date) <= upTo)) {
      const proof = resourceF24(head, resources.f24Lines, resources.allocations, resources.txs, upTo)
      if (!proof.checked?.ok || proof.moved == null || proof.overpaid || proof.doc && Math.round(proof.moved * 100) !== Math.round(proof.doc.total * 100)) items.push({ id: `f24:${head.id}`, area: 'fiscale', priority: !proof.checked?.ok || proof.overpaid ? 'alta' : 'media', title: `F24 · ${String(head.due_date)}`, why: !proof.checked?.ok ? 'Componenti e totale del modello da verificare.' : 'Versamento bancario non interamente raccordato al modello; nessuna ripartizione automatica delle componenti.', action: 'Apri modello e prove', href: `/lab/risorse?${new URLSearchParams({ m: month, vista: 'versamenti', f24: String(head.id) })}`, date: String(head.due_date), amount: null, currency: null })
    }
  } else unavailable.push('Controlli risorse e F24: una fonte richiesta non è disponibile.')
  if (economics.ok) {
    const base = { area: 'competenze' as const, priority: 'alta' as const, date: month, amount: null, currency: null }
    for (const row of economics.accrual.missingRevenue) items.push({ ...base, id: `atteso:ricavo:${row.installment_id ?? row.stream_id}`, title: row.label, why: 'Occorrenza ricavo prevista dall’accordo, assente dal registro del mese.', action: 'Verifica accordo e competenza', href: `/lab/accordi?${new URLSearchParams({ m: month, accordo: row.stream_id })}` })
    for (const row of economics.accrual.missingCosts) items.push({ ...base, id: `atteso:costo:${row.id}`, title: row.label, why: 'Occorrenza costo prevista dal piano canonico, assente dal registro del mese.', action: 'Verifica piano e competenze', href: `/lab/conto-economico?m=${month}&vista=maturato#righe-economiche` })
    for (const line of economics.accrual.lines.filter(l => l.proof.issues.length)) items.push({ ...base, id: `prova:${line.side}:${line.row.id}`, title: String(line.row.label || line.side), why: line.proof.issues.join(' · '), action: 'Apri riga e prove economiche', href: `/lab/conto-economico?${new URLSearchParams({ m: month, vista: 'maturato', riga: String(line.row.id), tipoRiga: line.side })}#righe-economiche` })
    for (const person of economics.accrual.soci.filter(p => p.registrationIssues.length)) items.push({ area: 'risorse', priority: 'alta', id: `socio:${person.name}:${month}`, title: person.name, why: person.registrationIssues.join(' · '), action: 'Verifica compensi e regolamenti', href: `/lab/conto-economico?m=${month}#compensi`, date: month, amount: null, currency: null })
  } else unavailable.push('Controlli piano, competenze e compensi: una fonte richiesta non è disponibile.')
  return { items, unavailable, observedAt, upTo }
}
