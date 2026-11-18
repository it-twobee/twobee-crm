import { labViewGroup, labViewItem } from '@/components/lab/labViewStyles'
import LabPageHeader from '@/components/lab/LabPageHeader'
import LabSectionGuide from '@/components/lab/LabSectionGuide'
import { LabReturnFields } from '@/components/lab/LabJourney'
import LabChart from '@/components/lab/LabChart'
import Link from '@/components/lab/LabLink'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabVat } from '@/lib/lab-vat-load'
import { vatPayment, vatCash, vatWhen } from '@/lib/lab-vat'
import { romeToday } from '@/lib/lab-bank'
import { knownAmount } from '@/lib/lab-deals'
import { labContextMonth } from '@/lib/lab-context'
import LabSourceActions from '@/components/lab/LabSourceActions'
import { eur2 } from '@/lib/money'

export const dynamic = 'force-dynamic'
const money = (v: unknown) => { const n = knownAmount(v); return n == null ? 'n/d' : eur2(n) }

export default async function LabVatPage({ searchParams }: { searchParams: { periodo?: string; liquidazione?: string; m?: string } }) {
  await requireLabAdmin()
  const contextMonth = labContextMonth(searchParams.m)
  const today = romeToday(), data = await loadLabVat(today)
  if (!data.ok) return <div className="min-h-full min-w-0 break-words max-w-5xl mx-auto p-5 space-y-4"><Link href="/lab" className="text-gold-text underline">Laboratorio</Link><h1 className="text-xl font-semibold text-text-primary">IVA</h1><p role="alert" className="text-warning">{data.message}</p></div>
  const txs = data.txs.map(t => ({ id: t.id, accountId: t.account_id, currency: data.accounts.find(a => a.id === t.account_id)?.currency ?? '', date: t.booked_on, amount: t.amount, source: t.source, kind: t.kind, payslipId: t.payslip_id ?? null, hrInvoiceId: t.hr_invoice_id ?? null, invoiceId: t.invoice_id }))
  const periods = data.periods.map(p => ({ ...p, payment: vatPayment(p.settlement, data.heads, data.lines, data.allocations, txs, today) }))
  const first = periods.find(p => p.deadline <= today && p.payment.residual !== 0)
    ?? periods.find(p => p.payment.residual !== 0) ?? periods.at(-1)!
  const focused = searchParams.liquidazione ? periods.find(p => p.settlement?.id === searchParams.liquidazione) : undefined
  const selected = focused ?? periods.find(p => p.key === searchParams.periodo) ?? first
  const from = selected.months[0], upTo = today
  const cash = vatCash(data.txs, data.accounts, data.invoices, data.allocations, from, upTo)
  const bankLink = (id: string, account: string, date: string) => `/lab/banca?m=${date.slice(0, 7)}-01&conto=${encodeURIComponent(account)}&movimento=${encodeURIComponent(id)}#movimento-${encodeURIComponent(id)}`
  return <div className="min-h-full min-w-0 break-words max-w-7xl mx-auto px-4 py-4 sm:px-6 space-y-4">
    <LabPageHeader section="iva" title="IVA"><p className="text-sm text-text-secondary">Quanto risulta dovuto, cosa prova il pagamento e quando scade.</p><p className="text-2xs text-text-tertiary mt-1">Sola lettura · super admin · in verifica · osservazione {today}</p></LabPageHeader>
    <LabSectionGuide section="iva" />
    <nav aria-label="Area risorse e tasse" className={labViewGroup}><Link href="/lab/risorse" className={labViewItem}>Risorse</Link><Link href="/lab/risorse?vista=versamenti" className={labViewItem}>F24 e versamenti</Link><span aria-current="page" className={labViewItem}>IVA</span></nav>
    {searchParams.liquidazione && !focused && <p role="alert" className="rounded-xl bg-warning-dim p-3 text-sm text-warning">La liquidazione richiesta non è disponibile nei periodi letti. È mostrato il periodo selezionato automaticamente, non una liquidazione sostitutiva.</p>}
    <form method="get" className="flex flex-wrap items-end gap-3"><LabReturnFields />{contextMonth && <input type="hidden" name="m" value={contextMonth} />}<label className="min-w-0 text-sm text-text-secondary">Periodo<select name="periodo" defaultValue={selected.key} className="block w-full min-w-0 max-w-full mt-1 rounded-xl bg-surface border border-border-interactive p-2 text-text-primary">{periods.map(p => <option key={p.key} value={p.key}>{p.label}{p.deadline < today && p.payment.residual !== 0 ? ' · scaduto, riscontri aperti' : ''}</option>)}</select></label><button className="rounded-xl bg-gold px-4 py-2 text-sm text-on-gold">Mostra</button></form>
    <p className="text-sm text-text-secondary">{selected.label}. La prima apertura dà precedenza agli scaduti con riscontri ancora aperti. Il trimestre corrente resta selezionabile.</p>
    <dl id="sintesi" className="scroll-mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {[
        ['Versata in banca · periodo', money(selected.payment.paid), 'Solo componente IVA attribuibile, non totale F24.'],
        ['Da versare · residuo provato', money(selected.payment.residual), `Dovuto ${selected.settlement ? 'dal modello registrato' : 'stimato sulle righe'}: ${money(selected.due)}.`],
        ['Scadenza ordinaria', selected.deadline, vatWhen(today, selected.deadline)],
        ['Leva IVA utilizzata · stima', 'n/d', 'Base iniziale, detraibilità e consolidato da verificare.'],
      ].map(([label, value, why]) => <div key={label} className="rounded-xl border border-border bg-surface p-4"><dt className="text-2xs text-text-secondary">{label}</dt><dd className="text-xl font-semibold text-text-primary mt-1 tabular-nums">{value}</dd><p className="text-2xs text-text-secondary mt-2">{why}</p></div>)}
    </dl>
    <LabChart chartId="analisi" title="IVA per periodo · dovuto e versato" note="Dovuto dal modello oppure stimato sul registrato. Versato e residuo solo quando provati dal motore IVA; n/d non è zero. Il totale F24 non è il versato IVA." context={`Osservazione ${today} · tutti i periodi letti`} series={[{ key: 'due', label: 'Dovuto · modello/stima' }, { key: 'paid', label: 'Versato IVA provato' }, { key: 'remaining', label: 'Residuo provato' }]} rows={periods.map(p => ({ id: p.key, label: p.label, date: p.deadline, group: p.source === 'f24' ? 'Modello registrato' : 'Stima sul registrato', href: `/lab/iva?periodo=${p.key}`, values: { due: p.due, paid: p.payment.paid, remaining: p.payment.residual } }))} />
    <section id="dati-prove" className="scroll-mt-6 rounded-2xl border border-border bg-surface p-4 space-y-3">
      <h2 className="text-base font-semibold text-text-primary">Versamenti e scadenze</h2>
      <p className="text-sm text-text-secondary">{selected.payment.residual === 0 ? 'Regolamento bancario documentato.' : selected.deadline < today ? 'Scadenza passata, regolamento da verificare.' : 'Regolamento da verificare.'} {selected.payment.why}.</p>
      <p className="text-sm text-text-secondary">Data pagato nel registro: {selected.paidOn ?? 'n/d'}. Completamento bancario provato: {selected.payment.completedOn ?? 'n/d'}. Una data registrata non certifica il versamento.</p>
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div><h3 className="font-semibold text-text-primary">Righe economiche</h3><p className="text-text-secondary">Saldo prima degli interessi: {selected.registered ? money(selected.balance + selected.carried) : 'n/d'}.</p><p className="text-text-secondary">Versamento stimato: {money(selected.estimated)}.</p><p className="text-2xs text-text-tertiary">{selected.why}. Stima sul registrato, non liquidazione certificata.</p></div>
        <div><h3 className="font-semibold text-text-primary">Documenti fiscali</h3><p className="text-text-secondary">IVA emesse: {money(selected.documents?.debit)}.</p><p className="text-text-secondary">IVA ricevute: {money(selected.documents?.credit)}.</p><p className="text-2xs text-text-tertiary">Registro per emissione, note nel proprio trimestre; IVA ricevuta non significa detraibilità certa. {selected.foreignDocuments > 0 && `${selected.foreignDocuments} documenti in altra valuta esclusi dal confronto EUR.`}</p></div>
        <div><h3 className="font-semibold text-text-primary">Modello registrato</h3><p className="text-text-secondary">Dovuto: {money(selected.settlement?.to_pay)}.</p><p className="text-2xs text-text-tertiary">{selected.docRef ?? 'Modello della liquidazione da acquisire'}. Comprende quanto registrato per il tributo, anche interessi; IVA principale distinta da ricostruire.</p></div>
      </div>
      {selected.settlement && selected.estimated != null && <p className="text-2xs text-text-secondary">Scarto modello − stima: {money(selected.gap)}. Il modello prevale sul dovuto; le fatture non cambiano silenziosamente il calcolo.</p>}
      {selected.documents && selected.registered > 0 && <p className="text-2xs text-text-secondary">Scarto saldo documenti − saldo righe: {money(selected.documents.balance - (selected.balance + selected.carried))}. Confronto prima di riporto e interessi.</p>}
      {selected.missingMonths.length > 0 && <div className="rounded-xl bg-warning-dim p-3 text-2xs text-warning"><p>Mesi economici mancanti o incompleti. Il dato non rappresenta un trimestre completo.</p><div className="mt-2 flex flex-wrap gap-3">{selected.missingMonths.map(m => <Link key={m} href={`/lab/conto-economico?m=${m}&vista=maturato`} className="inline-block py-2 underline">Verifica {m.slice(0, 7)}</Link>)}</div></div>}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"><Link href={`/lab/fatturazione?tipo=emessa&stato=tutte&periodo=${selected.key}`} className="inline-flex min-h-11 items-center rounded-xl border border-border-interactive px-3 text-sm text-gold-text">Fatture emesse del trimestre</Link><Link href={`/lab/fatturazione?tipo=ricevuta&stato=tutte&periodo=${selected.key}`} className="inline-flex min-h-11 items-center rounded-xl border border-border-interactive px-3 text-sm text-gold-text">Fatture ricevute del trimestre</Link></div>
      <p className="text-2xs text-text-tertiary">Scadenza dal calendario ordinario già in uso. Un modello con data diversa resta visibile nel dettaglio, senza sostituire automaticamente la scadenza del tributo. Proroghe e casi particolari da confermare col consulente.</p>
      <details><summary className="text-sm text-gold-text cursor-pointer">Modelli collegati e relative uscite</summary><div className="space-y-3 mt-3">{selected.payment.models.map(id => {
        const head = data.heads.find(h => h.id === id)
        const payments = data.allocations.filter(a => a.f24_id === id).map(a => ({ a, tx: data.txs.find(t => t.id === a.tx_id) }))
        return <div key={id} className="text-sm text-text-secondary"><p>F24 · scadenza documento {String(head?.due_date ?? 'n/d')} · totale {money(head?.total)}. Le componenti non sono ulteriori uscite.</p><ul>{data.lines.filter(l => l.doc_id === id).map(l => <li key={String(l.id)} className="text-2xs">{String(l.codice)} · {String(l.kind)} · {money(l.amount)}</li>)}</ul><ul>{payments.map(({ a, tx }) => <li key={String(a.id)} className="text-2xs">Quota registrata {money(a.amount)} · {String(a.evidence)} · {tx ? <Link href={bankLink(tx.id, tx.account_id, tx.booked_on)} className="text-gold-text underline">{tx.booked_on} · {tx.source} · movimento</Link> : 'movimento da verificare'}</li>)}</ul><Link className="text-gold-text underline text-2xs" href={`/lab/risorse?vista=versamenti&f24=${encodeURIComponent(id)}#f24-${encodeURIComponent(id)}`}>Apri questo modello e i documenti originali</Link></div>
      })}{!selected.payment.models.length && <p className="text-2xs text-text-secondary">Nessun modello attribuibile con certezza al periodo. Non si abbina per importo o data simile.</p>}</div></details>
    </section>
    <section className="rounded-2xl border border-border bg-surface p-4 space-y-3">
      <h2 className="text-base font-semibold text-text-primary">IVA passata dai conti e riserva</h2>
      <p className="text-sm text-text-secondary">Intervallo osservato: {from} → {upTo}. Conti principali EUR, sottoconti esclusi; nascosti conservati, giroconti esclusi. L’intervallo è un filtro, non una base iniziale IVA pari a zero.</p>
      <dl className="grid sm:grid-cols-2 gap-3 text-sm"><div><dt className="text-text-secondary">IVA incassata · parte nota</dt><dd className="font-semibold text-text-primary">{money(cash.inVat)}</dd><p className="text-2xs text-text-tertiary">Lordo entrato con IVA non determinata: {money(cash.inUnknown)}.</p></div><div><dt className="text-text-secondary">IVA pagata ai fornitori · parte nota</dt><dd className="font-semibold text-text-primary">{money(cash.outVat)}</dd><p className="text-2xs text-text-tertiary">Lordo uscito con IVA non determinata: {money(cash.outUnknown)}. Detraibile verificata: n/d.</p></div></dl>
      <p className="text-2xs text-text-secondary">Solo pagamenti interi con legame univoco alla fattura, senza quote concorrenti, ritenute o componenti non raccordate. I casi parziali restano IVA n/d; zero per natura è distinto da assenza di fonte.</p>
      <p className="text-sm text-text-secondary">Riserva IVA: n/d. Coperta dal saldo: n/d. Leva utilizzata: n/d. Mancano una base iniziale documentata e il raccordo di compensazioni, detraibilità e conti. Il pagamento di un trimestre successivo non cancella un arretrato.</p>
      <details><summary className="text-sm text-gold-text cursor-pointer">Movimenti e provenienza IVA</summary><ul className="space-y-2 mt-3">{cash.entries.map(e => <li key={e.tx.id} className="text-2xs text-text-secondary"><Link className="text-gold-text underline" href={bankLink(e.tx.id, e.tx.account_id, e.tx.booked_on)}>{e.tx.booked_on} · {money(e.tx.amount)}</Link> · IVA {e.via ? money(e.vat) : 'n/d'} · {e.via === 'fattura' ? <Link className="text-gold-text underline" href={`/lab/fatturazione?documento=${encodeURIComponent(e.tx.invoice_id!)}`}>fattura collegata</Link> : e.via === 'natura' ? 'zero per natura del movimento' : 'fonte da raccordare'}{e.tx.hidden_reason && ' · movimento nascosto, incluso nella lettura'}</li>)}</ul>{!cash.entries.length && <p className="text-2xs text-text-secondary">Nessun movimento idoneo registrato nell’intervallo. IVA n/d.</p>}</details>
    </section>
    <LabSourceActions actions={[{ label: 'Carica modelli e documenti', href: '/economics/carica' }, { label: 'Gestisci il registro fiscale', href: '/economics/fiscale' }]} />
    <p className="text-2xs text-text-tertiary">Lettura avviata {data.observedAt}. Fonti paginate, letture separate non transazionali. Nessuna conferma, modifica o certificazione automatica. Prova autenticata e confronto con le sezioni in uso ancora aperti.</p>
  </div>
}
