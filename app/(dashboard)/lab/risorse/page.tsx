import Link from 'next/link'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabResources } from '@/lib/lab-resources-load'
import { resourceCost, resourceGroup, salaryEvidence, resourceF24, type ResourceRow, type ResourceTx } from '@/lib/lab-resources'
import { knownAmount } from '@/lib/lab-deals'
import { labMonth, romeToday } from '@/lib/lab-bank'
import { monthLabel, shiftMonth } from '@/lib/pl'
import { nextMonth20 } from '@/lib/cash-calendar'
import { CONTRACTS } from '@/lib/payroll'
import { eur2 } from '@/lib/money'

export const dynamic = 'force-dynamic'
const money = (value: unknown) => { const n = knownAmount(value); return n == null ? 'n/d' : eur2(n) }
const download = (id: unknown, kind: string) => `/api/lab/risorse/documenti/${encodeURIComponent(String(id))}?tipo=${kind}`

export default async function LabResourcesPage({ searchParams }: { searchParams: { m?: string; tipo?: string; q?: string; vista?: string } }) {
  await requireLabAdmin()
  const today = romeToday()
  const month = labMonth(searchParams.m, shiftMonth(`${today.slice(0, 7)}-01`, -1))
  const due = nextMonth20(month)
  const group = ['dipendenti', 'professionisti'].includes(searchParams.tipo ?? '') ? searchParams.tipo! : ''
  const query = (searchParams.q ?? '').trim().slice(0, 200)
  const view = searchParams.vista === 'versamenti' ? 'versamenti' : 'risorse'
  const href = (m: string, tipo = group, vista = view) => `/lab/risorse?${new URLSearchParams({ m, tipo, vista, q: query })}`
  const data = await loadLabResources(today)
  return <div className="min-h-full max-w-5xl mx-auto px-4 py-5 sm:p-6 space-y-5">
    <Link href="/lab" className="text-sm text-gold-text underline">Laboratorio</Link>
    <header><h1 className="text-xl font-semibold text-text-primary">Risorse &amp; tasse</h1><p className="text-sm text-text-secondary">Per questo mese: costo, documenti e pagamenti, senza confonderli.</p><p className="text-2xs text-text-tertiary mt-1">Sola lettura · dati riservati · in verifica</p></header>
    <nav aria-label="Competenza risorse" className="flex justify-between items-center gap-3 text-sm">
      <Link className="p-3 rounded-xl border border-border text-gold-text" href={href(shiftMonth(month, -1))}>Precedente</Link><h2 className="text-base font-semibold text-text-primary">{monthLabel(month)}</h2><Link className="p-3 rounded-xl border border-border text-gold-text" href={href(shiftMonth(month, 1))}>Successivo</Link>
    </nav>
    <nav aria-label="Area risorse e tasse" className="flex flex-wrap gap-2 text-sm">
      {(['risorse', 'versamenti'] as const).map(v => <Link key={v} href={href(month, group, v)} aria-current={view === v ? 'page' : undefined} className={`px-3 py-2 rounded-xl border ${view === v ? 'border-border-strong bg-surface-active text-text-primary' : 'border-border text-text-secondary'}`}>{v === 'risorse' ? 'Risorse' : 'F24 e versamenti'}</Link>)}
      <span className="px-3 py-2 text-text-tertiary">IVA · prossimo modulo</span>
    </nav>
    {!data.ok ? <p role="alert" className="rounded-xl bg-warning-dim p-4 text-sm text-warning">{data.message}</p> : (() => {
      const personRows = data.people.filter(p => (!group || resourceGroup(p.contract_kind) === group)
        && (!query || String(p.full_name ?? '').toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it'))))
        .map(person => ({ person, cost: resourceCost(person, data.slips, data.collab, data.invoices, data.params, month),
          salary: salaryEvidence(person, data.people, data.pdfs, data.slips, data.salaryLinks, data.txs, data.allocations, month, today) }))
      const knownCosts = personRows.filter(p => p.cost.value != null)
      const cost = knownCosts.length ? knownCosts.reduce((n, p) => n + Math.round(p.cost.value! * 100), 0) / 100 : null
      const paymentLink = (tx: ResourceTx) => `/lab/banca?m=${tx.date.slice(0, 7)}-01&conto=${encodeURIComponent(tx.accountId)}&movimento=${encodeURIComponent(tx.id)}#movimento-${encodeURIComponent(tx.id)}`
      const originalLinks = (records: ResourceRow[], kind: string) => <ul className="space-y-1">{records.map(doc => <li key={String(doc.id)}>{doc.has_file
        ? <a className="text-gold-text underline" href={download(doc.id, kind)}>Scarica {String(doc.file_name ?? doc.filename ?? 'documento')}</a>
        : <span>Documento registrato, file da acquisire: {String(doc.file_name ?? doc.filename ?? 'documento')}</span>}</li>)}</ul>
      const linkedModels = data.f24.filter(doc => data.f24Lines.some(line => line.doc_id === doc.id && ['ritenute', 'inps', 'inail', 'credito'].includes(String(line.kind))
        && (String(line.period ?? '').slice(0, 7) === month.slice(0, 7) || data.hrF24.some(f => f.id === line.hr_f24_id && f.month === month))))
      return <>
        <aside className="bg-surface border border-border rounded-xl p-4 text-sm text-text-secondary space-y-2">
          <p>Competenza: {monthLabel(month)}. Obiettivo di pagamento delle risorse: entro il <strong className="text-text-primary">{due}</strong>. È il termine operativo concordato; le scadenze fiscali restano quelle dei modelli.</p>
          <p>Netto concordato, netto da registro cedolini e quota bancaria sono tre riscontri distinti. L’F24 aggregato non prova da solo il costo individuale. Un importo mancante resta n/d.</p>
        </aside>
        {view === 'risorse' ? <>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[['Risorse nella selezione', String(personRows.length)], ['Costo noto dai registri', money(cost)], ['Residuo da pagare certificato', 'n/d']].map(([label, value]) => <div key={label} className="bg-surface border border-border rounded-xl p-4"><dt className="text-2xs text-text-secondary">{label}</dt><dd className="text-xl font-semibold text-text-primary tabular-nums">{value}</dd></div>)}
          </dl>
          <p className="text-2xs text-text-secondary">Costo noto per {knownCosts.length} di {personRows.length} risorse: {knownCosts.length !== personRows.length ? 'lettura parziale, non totale completo del mese.' : 'fonti del registro, non certificazione del pagamento.'} {personRows.some(p => p.cost.estimated) && 'Include oneri stimati.'}</p>
          <nav aria-label="Tipo risorsa" className="flex flex-wrap gap-2 text-sm">{[['', 'Tutte'], ['dipendenti', 'Dipendenti e assimilati'], ['professionisti', 'Professionisti']].map(([key, label]) => <Link key={key} href={href(month, key)} aria-current={group === key ? 'page' : undefined} className={`px-3 py-2 rounded-xl border ${group === key ? 'bg-surface-active border-border-strong text-text-primary' : 'border-border text-text-secondary'}`}>{label}</Link>)}</nav>
          <form method="get" className="flex gap-2"><input type="hidden" name="m" value={month} /><input type="hidden" name="tipo" value={group} /><input name="q" defaultValue={query} aria-label="Cerca risorsa" maxLength={200} placeholder="Cerca risorsa" className="min-w-0 flex-1 rounded-xl border border-border-interactive bg-surface px-3 py-2 text-sm text-text-primary" /><button className="rounded-xl bg-gold px-4 py-2 text-sm text-on-gold" type="submit">Cerca</button></form>
          <ul className="space-y-3">{personRows.map(({ person: p, cost: c, salary }) => {
            const freelancer = resourceGroup(p.contract_kind) === 'professionisti'
            const slips = data.slips.filter(s => s.person_id === p.id && s.month === month)
            const invoices = data.collab.filter(i => i.person_id === p.id && i.month === month)
            const originals = data.originals.filter(d => d.person_id === p.id && d.period === month && d.kind === 'cedolino')
            const personal = p.profile_id ? data.personal.filter(d => d.profile_id === p.profile_id) : []
            const documents = freelancer ? invoices.length : slips.length
            return <li key={String(p.id)} className="rounded-2xl border border-border bg-surface p-4 space-y-3">
              <header><div className="flex justify-between gap-3"><h2 className="text-base font-semibold text-text-primary">{String(p.full_name ?? 'Risorsa n/d')}</h2><span className="text-sm text-text-primary font-semibold tabular-nums whitespace-nowrap">{money(c.value)}</span></div><p className="text-2xs text-text-secondary">{CONTRACTS.find(x => x.kind === p.contract_kind)?.label ?? 'Rapporto da verificare'} · stato registrato {String(p.status ?? 'n/d')}{p.is_active === false && ' · non attiva in organico'}</p></header>
              <p className="text-2xs text-text-secondary">Costo: {c.why}. {documents} {freelancer ? 'righe fattura HR' : 'cedolini nel registro'} per la competenza selezionata.</p>
              {!freelancer ? <>
                <p className="text-sm text-text-primary">Netto concordato attuale: {money(p.agreed_net)} · netto nel registro del mese: {money(c.net)}.</p>
                <p className="text-2xs text-text-tertiary">La validità storica del netto concordato va verificata: il valore attuale non riscrive gli accordi dei mesi precedenti.</p>
                <p className="text-sm text-text-primary">Quote bancarie note per questa competenza: {money(salary.paid)}. Residuo certificato n/d.</p>
                {salary.paid != null && c.net != null && Math.round(salary.paid * 100) !== Math.round(c.net * 100) && <p className="text-2xs text-warning">Le quote note non coincidono con il netto del registro: verificare acconti, competenza o scostamenti. Nessun pagamento aggiuntivo automatico.</p>}
                {salary.issue && <p className="text-2xs text-warning">{salary.issue}.</p>}
                {salary.entries.map(e => <p key={e.tx.id} className="text-2xs text-text-secondary">Quota {money(e.amount)} nella distinta del <Link className="underline text-gold-text" href={paymentLink(e.tx)}>{e.tx.date} · {data.accountNames.get(e.tx.accountId)}</Link>.</p>)}
                {!salary.entries.length && <p className="text-2xs text-text-secondary">Pagamento da raccordare: né la spunta né il netto nel cedolino dimostrano il bonifico.</p>}
              </> : <>
                <p className="text-sm text-text-primary">Pagato al professionista: n/d. Nessun netto personale calcolato.</p>
                <p className="text-2xs text-text-secondary">Accordo della risorsa da collegare in modo verificabile. <Link className="underline text-gold-text" href={`/lab/accordi?q=${encodeURIComponent(String(p.full_name ?? ''))}`}>Cerca negli accordi</Link>: la ricerca non conferma un’identità o una quota.</p>
                {invoices.map(i => <p key={String(i.id)} className="text-2xs text-text-secondary">Fattura nel registro risorsa {String(i.invoice_number ?? 'n/d')} · saldo indicato {money(i.amount_to_pay)} · {i.invoice_id ? <Link className="underline text-gold-text" href={`/lab/fatturazione?documento=${encodeURIComponent(String(i.invoice_id))}`}>Apri documento e movimenti in Fatturazione</Link> : 'documento canonico da collegare'}.</p>)}
              </>}
              <details><summary className="text-sm text-gold-text cursor-pointer py-1">Rapporto, documenti e costo</summary><div className="mt-2 space-y-2 text-2xs text-text-secondary">
                <p>Inizio: {String(p.hired_on ?? p.start_date ?? 'n/d')} · fine: {String(p.end_date ?? 'non registrata')}. Stato del rapporto distinto dai pagamenti.</p>
                {slips.map(s => <p key={String(s.id)}>Registro cedolino: competenze {money(s.total_earnings)} · oneri datore {money(s.employer_contrib)} · INAIL {money(s.inail)} · TFR maturato {money(s.tfr_accrued)}. Il TFR non è un’uscita bancaria finché non viene pagato.</p>)}
                {!!salary.pdfs.length && originalLinks(salary.pdfs, 'cedolino')}
                {!!originals.length && originalLinks(originals, 'economico')}
                {!!personal.length && originalLinks(personal, 'personale')}
                {!salary.pdfs.length && !originals.length && <p>Originale del documento economico da acquisire o collegare; il registro non lo sostituisce.</p>}
                {!personal.length && <p>Nessun documento personale collegato tramite il profilo della risorsa.</p>}
                <p>Oneri: {linkedModels.length} modelli con componenti riferite al periodo, da verificare separatamente. Nessun F24 attribuito per intero alla risorsa.</p>
              </div></details>
            </li>
          })}</ul>
          {!personRows.length && <p className="text-sm text-text-secondary">Nessuna risorsa per questo filtro. Costi e pagamenti n/d.</p>}
          <details className="rounded-xl border border-border p-4"><summary className="text-sm text-gold-text cursor-pointer">Uscite risorse registrate nel mese civile</summary><p className="text-2xs text-text-secondary mt-2">Date bancarie di {monthLabel(month)}, anche per competenze precedenti. Non sono il pagato del mese di lavoro selezionato. Solo movimenti classificati o collegati: l’assenza non dimostra pagamento zero.</p><ul className="space-y-2 mt-3">{data.txs.filter(t => t.source === 'banca' && t.amount < 0 && t.date.slice(0, 7) === month.slice(0, 7) && (t.kind === 'stipendio' || t.payslipId || t.hrInvoiceId || data.salaryLinks.some(l => l.tx_id === t.id) || data.collab.some(i => i.invoice_id && i.invoice_id === t.invoiceId))).map(t => <li key={t.id} className="text-sm text-text-secondary"><Link className="text-gold-text underline" href={paymentLink(t)}>{t.date} · {data.accountNames.get(t.accountId)} · {t.currency === 'EUR' ? money(t.amount) : `${t.amount} ${t.currency}`}</Link></li>)}</ul></details>
        </> : <>
          <p className="text-sm text-text-secondary">{linkedModels.length} modelli con componenti collegate alla competenza selezionata. Gli altri modelli restano consultabili; la data del versamento non decide la competenza.</p>
          <ul className="space-y-3">{data.f24.map(head => {
            const result = resourceF24(head, data.f24Lines, data.allocations, data.txs, today)
            const related = linkedModels.some(d => d.id === head.id)
            const originals = data.originals.filter(d => d.f24_id === head.id)
            return <li key={String(head.id)} className="rounded-2xl border border-border bg-surface p-4 space-y-2">
              <h2 className="text-base font-semibold text-text-primary">F24 · scadenza {String(head.due_date)} · {money(head.total)}</h2>
              <p className="text-2xs text-text-secondary">{related ? 'Componenti collegate al periodo selezionato' : 'Altro periodo o competenza da collegare'} · data pagato nel registro: {String(head.paid_on ?? 'n/d')}.</p>
              <p className="text-2xs text-text-secondary">{result.checked?.ok ? 'Componenti coerenti secondo il motore F24.' : result.checked && !result.checked.ok ? result.checked.why : 'Componenti del modello incomplete.'} Quote bancarie note: {money(result.moved)}. Residuo certificato n/d.</p>
              {result.overpaid && <p className="text-2xs text-warning">Le quote superano il totale del modello: da verificare.</p>}
              <ul className="space-y-1 text-2xs text-text-secondary">{result.doc?.lines.map((line, index) => <li key={line.id ?? index}>{line.codice} · {line.label} · {line.kind === 'credito' ? 'credito da compensare' : line.kind} · {money(line.amount)} · periodo {line.period ?? 'n/d'}</li>)}</ul>
              {result.entries.map(e => <p key={e.tx.id} className="text-2xs text-text-secondary">Quota {money(e.amount)} · <Link className="underline text-gold-text" href={paymentLink(e.tx)}>{e.tx.date} · movimento bancario</Link>.</p>)}
              {originalLinks(originals, 'economico')}
              <p className="text-2xs text-text-tertiary">Il saldo netto del modello è una sola uscita. IVA, contributi, ritenute e crediti lo spiegano: non sono altri bonifici e non certificano il costo di ogni persona.</p>
            </li>
          })}</ul>
          {!data.f24.length && <p className="text-sm text-text-secondary">Nessun modello disponibile: versamenti n/d.</p>}
        </>}
        <p className="text-2xs text-text-tertiary">Lettura avviata {data.observedAt}. Completezza delle fonti e confronto con le sezioni in uso da verificare. Nessun caricamento o aggancio salvato dal Lab.</p>
      </>
    })()}
  </div>
}
