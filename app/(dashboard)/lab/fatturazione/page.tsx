import { invoiceBankCash } from '@/lib/lab-invoice-bank'
import { InvoiceBankPayments } from '@/components/lab/LabInvoiceBankProof'
import { LabRecordScope } from '@/components/lab/LabJourney'
import { invoiceMonthlyChart } from '@/lib/lab-chart-data'
import LabSectionGuide from '@/components/lab/LabSectionGuide'
import { LabReturnFields } from '@/components/lab/LabJourney'
import LabChart from '@/components/lab/LabChart'
import Link from '@/components/lab/LabLink'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabInvoices } from '@/lib/lab-invoices-load'
import { invoiceEvidence, invoiceProposals, invoicePeriod, inInvoicePeriod } from '@/lib/lab-invoices'
import { romeToday } from '@/lib/lab-bank'
import { isCreditNote, isDebitNote, signedTotal, partlyVoided } from '@/lib/invoices'
import { eur2 } from '@/lib/money'
import { quarterOf } from '@/lib/vat'
import { labContextMonth } from '@/lib/lab-context'
import LabSourceActions from '@/components/lab/LabSourceActions'
import LabConnectionList from '@/components/lab/LabConnectionList'

export const dynamic = 'force-dynamic'

const STATES = { verifica: 'Da raccordare in banca', aperte: 'Aperte nel registro', tutte: 'Tutti i documenti', note: 'Note e rettifiche' }
type State = keyof typeof STATES
const money = (value: number | null, currency: string) => value == null ? 'n/d'
  : currency === 'EUR' ? eur2(value) : `${value.toFixed(2)} ${currency}`

export default async function LabInvoicesPage({ searchParams }: {
  searchParams: { tipo?: string; stato?: string; documento?: string; q?: string; periodo?: string; m?: string; emissione?: string }
}) {
  await requireLabAdmin()
  const today = romeToday()
  const data = await loadLabInvoices(today)
  const focused = data.ok ? data.invoices.find(i => i.id === searchParams.documento) : undefined
  const direction = focused?.direction ?? (searchParams.tipo === 'ricevuta' ? 'ricevuta' : 'emessa')
  const state: State = searchParams.stato && Object.hasOwn(STATES, searchParams.stato) ? searchParams.stato as State : 'tutte'
  const query = (searchParams.q ?? '').trim().slice(0, 200)
  const contextMonth = labContextMonth(searchParams.m)
  const documentMonth = labContextMonth(searchParams.emissione)
  const period = invoicePeriod(searchParams.periodo)
  const periods = data.ok ? Array.from(new Set(data.invoices.map(i => { const q = quarterOf(i.issuedOn); return `${q.year}-T${q.q}` }))).sort().reverse() : []
  if (period && !periods.includes(period.key)) periods.unshift(period.key)
  const href = (tipo: string, stato: string, documento?: string, emissione = documentMonth) => {
    const params = new URLSearchParams({ tipo, stato })
    if (documento) params.set('documento', documento)
    if (contextMonth) params.set('m', contextMonth)
    if (emissione) params.set('emissione', emissione)
    if (period) params.set('periodo', period.key)
    if (query) params.set('q', query)
    return `/lab/fatturazione?${params}`
  }
  const rows = data.ok ? data.invoices.filter(i => i.direction === direction && (focused ? i.id === focused.id : inInvoicePeriod(i, period) && (!documentMonth || i.issuedOn.slice(0, 7) === documentMonth.slice(0, 7)))).map(i => ({ i, evidence: invoiceEvidence(i, data.txs, today) })) : []
  const visible = rows.filter(({ i, evidence }) => searchParams.documento ? i.id === searchParams.documento
    : (state === 'tutte' || (state === 'verifica' && (data.ok && data.bankDocuments ? data.bankDocuments.invoices.get(i.id)?.state !== 'coperta' : evidence.needsReview)) || (state === 'aperte' && evidence.open)
      || (state === 'note' && (!!i.rectifiesId || !!i.rectifiedBy?.length || isCreditNote(i.docType) || isDebitNote(i.docType))))
      && (!query || `${i.number} ${i.counterpartyName}`.toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it'))))
    .sort((a, b) => Number(b.evidence.open) - Number(a.evidence.open)
      || (a.i.dueDate ?? '9999').localeCompare(b.i.dueDate ?? '9999') || a.i.id.localeCompare(b.i.id))
  const bankCash = data.ok && data.bankDocuments ? invoiceBankCash(data.bankDocuments, visible.map(r => r.i.id)) : null
  const suggestions = data.ok ? invoiceProposals(data.invoices, data.txs, today) : null

  return <div className="min-h-full min-w-0 break-words max-w-5xl mx-auto px-4 py-5 sm:p-6 space-y-5">
    <header>
      <h1 className="text-xl text-text-primary font-semibold">Fatturazione</h1>
      <p className="text-sm text-text-secondary">Emesse ↔ entrate bancarie. Ricevute ↔ uscite bancarie. I documenti sono distinti dai fatti consolidati in banca.</p>
      <p className="text-2xs text-text-tertiary mt-1">Documenti e quote bancarie · fino al {today} · in verifica</p>
    </header>
    {data.ok && <LabSectionGuide section="fatturazione" />}
    {!data.ok ? <p role="alert" className="p-4 rounded-xl bg-warning-dim text-warning text-sm">{data.message}</p> : <>
      <nav aria-label="Tipo fattura" className="flex gap-2">
        {(['emessa', 'ricevuta'] as const).map(tipo => <Link key={tipo} href={href(tipo, state)} aria-current={tipo === direction ? 'page' : undefined}
          className={`px-4 py-2 rounded-xl border text-sm ${tipo === direction ? 'bg-surface-active border-border-strong text-text-primary' : 'border-border text-text-secondary'}`}>{tipo === 'emessa' ? 'Emesse' : 'Ricevute'}</Link>)}
      </nav>
      <dl id="sintesi" className="scroll-mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[[focused ? 'Documento selezionato' : 'Documenti nella selezione', String(visible.length)], ['Entrate bancarie attribuite · EUR', money(bankCash?.incoming ?? null, 'EUR')], ['Uscite bancarie attribuite · EUR', money(bankCash?.outgoing ?? null, 'EUR')]].map(([label, value]) => <div key={label} className="p-4 bg-surface rounded-xl border border-border"><dt className="text-2xs text-text-secondary">{label}</dt><dd className="text-xl text-text-primary font-semibold tabular-nums">{value}</dd></div>)}
      </dl>

      <aside className="bg-surface border border-border rounded-xl p-4 text-sm text-text-secondary space-y-2">
        <p>Lo stato del registro e i movimenti bancari sono due riscontri distinti. Una data «pagata» non certifica l’incasso; un bonifico collegato non dimostra che copra tutta la fattura.</p>
        <p>Rettifiche, acconti, ritenute e quote vanno riconciliati prima di certificare il residuo. Gli arretrati restano visibili: nessun filtro automatico al solo mese corrente.</p>
      </aside>
      <nav aria-label="Filtra stato" className="flex flex-wrap gap-2">
        {Object.entries(STATES).map(([key, label]) => <Link key={key} href={href(direction, key)} aria-current={!focused && state === key ? 'page' : undefined}
          className={`px-3 py-2 rounded-xl border text-sm ${!focused && state === key ? 'bg-surface-active border-border-strong text-text-primary' : 'border-border text-text-secondary'}`}>{label}</Link>)}
      </nav>
      <form className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end" method="get"><LabReturnFields />
        <input type="hidden" name="tipo" value={direction} /><input type="hidden" name="stato" value={state} />
        {contextMonth && <input type="hidden" name="m" value={contextMonth} />}
        <label className="min-w-0 text-2xs text-text-secondary">Cerca numero o controparte<input name="q" defaultValue={query} maxLength={200} placeholder="Cerca numero o controparte" className="mt-1 min-h-11 w-full bg-surface border border-border-interactive text-text-primary rounded-xl px-3 py-2 text-sm" /></label>
        <label className="text-2xs text-text-secondary">Periodo di emissione<select name="periodo" defaultValue={period?.key ?? ''} className="mt-1 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary"><option value="">Tutto lo storico · inclusi arretrati</option>{periods.map(key => <option key={key} value={key}>{invoicePeriod(key)?.label ?? key}</option>)}</select></label>
        <label className="text-2xs text-text-secondary">Mese di emissione<input type="month" name="emissione" defaultValue={documentMonth?.slice(0, 7) ?? ''} className="mt-1 block min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary" /></label><button type="submit" className="min-h-11 px-4 py-2 bg-gold text-on-gold rounded-xl text-sm font-medium">Filtra</button>
      </form>
      {searchParams.emissione && !documentMonth && <p role="alert" className="rounded-xl bg-warning-dim p-3 text-sm text-warning">Mese di emissione non valido: nessun filtro mensile applicato.</p>}
      {searchParams.periodo && !period && <p role="alert" className="rounded-xl bg-warning-dim p-3 text-sm text-warning">Periodo non valido: è mostrato lo storico, senza un filtro trimestrale.</p>}
      {period && !focused && <p className="rounded-xl bg-info-dim p-3 text-sm text-info">Emissione: {period.label}. Le note sono nel proprio trimestre; il filtro non sposta la competenza o la data bancaria. <Link className="underline" href={`/lab/iva?periodo=${period.key}`}>Apri il confronto IVA</Link> · <Link className="underline" href={`/lab/fatturazione?${new URLSearchParams({ tipo: direction, stato: state, ...(contextMonth ? { m: contextMonth } : {}) })}`}>Mostra tutto lo storico</Link></p>}
      <p role="status" className="text-2xs text-text-secondary">{visible.length} documenti per questa selezione.</p>
      {searchParams.documento && !focused && <p className="text-sm text-warning">Documento non presente nell’archivio letto. Nessun collegamento viene dedotto.</p>}
      {focused && <p className="text-sm text-text-secondary">Documento selezionato · <Link className="text-gold-text underline" href={href(direction, 'tutte')}>Torna all’elenco</Link></p>}
      {!visible.length && <p className="text-sm text-text-secondary">Nessun documento per questa selezione. La completezza delle fonti resta da verificare.</p>}
      {documentMonth && <p className="text-sm text-text-secondary">Emissione {documentMonth.slice(0, 7)}. <Link href={href(direction, state, undefined, '')} className="inline-block py-2 text-gold-text underline">Rimuovi il filtro mese</Link></p>}
      <p className="text-2xs text-text-secondary">La base consolidata comprende solo quote di movimenti bancari reali attribuibili alle fatture selezionate. Le date sono quelle della banca, anche successive all’emissione; note di credito e rimborsi mantengono il proprio verso.</p>
      {data.bankDocuments ? <LabChart chartId="analisi" key={`incassi-${direction}-${state}-${query}-${period?.key ?? ''}-${documentMonth ?? ''}-${focused?.id ?? ''}`} title="Quote fatture passate in banca" note="Solo quote attribuite a movimenti reali EUR, per mese bancario. Non è il fatturato emesso né l’intero flusso del conto. Una quota cumulativa non viene contata per intero su ogni fattura." context={`Fatture ${direction} nella selezione · osservazione ${today}`} initialType="line" series={[{ key: 'incoming', label: 'Entrate bancarie attribuite' }, { key: 'outgoing', label: 'Uscite bancarie attribuite' }]} rows={bankCash?.rows ?? []} /> : <p role="alert" className="rounded-xl bg-warning-dim p-3 text-sm text-warning">Raccordi non disponibili: dati bancari attribuiti n/d. Non significa che non siano passati incassi o pagamenti.</p>}
      <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer py-1 text-sm text-gold-text">Registro documenti · importi emessi/ricevuti, non consolidato bancario</summary><div className="mt-3"><LabChart chartId="documenti-emessi" key={`fatture-${direction}-${state}-${query}-${period?.key ?? ''}-${documentMonth ?? ''}-${focused?.id ?? ''}`} title="Documenti per mese di emissione" note="Imponibili EUR con segno delle note, dai documenti nella selezione. Zero indica nessun documento selezionato nel mese intermedio; non è prova di assenza di ricavi. Non rappresenta incassi o residui. Apri un mese per vedere le fatture." context={`Registro ${direction} · ${period?.key ?? 'storico selezionato'} · osservazione ${today}`} initialType="line" series={[{ key: 'documents', label: direction === 'emessa' ? 'Emesso netto · registro documenti' : 'Ricevuto netto · registro documenti' }]} rows={invoiceMonthlyChart(visible.map(r => r.i), direction, href(direction, state))} /></div></details>
      <ul id="dati-prove" className="space-y-3 scroll-mt-6">
        {visible.map(({ i, evidence }) => {
          const notes = (i.rectifiedBy ?? []).map(id => data.invoices.find(x => x.id === id)).filter(x => x != null)
          const parent = i.rectifiesId ? data.invoices.find(x => x.id === i.rectifiesId) : undefined
          const candidates = suggestions?.proposals.get(i.id) ?? []
          const kind = isCreditNote(i.docType) ? 'Nota di credito' : isDebitNote(i.docType) ? 'Nota di debito' : 'Fattura'
          return <LabRecordScope key={i.id} anchor={`fattura-${i.id}`}><li id={`fattura-${i.id}`} className="bg-surface border border-border rounded-2xl p-4 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:gap-3">
              <div className="min-w-0"><h2 className="text-sm font-semibold text-text-primary break-words">{i.counterpartyName}</h2><p className="text-2xs text-text-secondary">{kind} {i.number} · {i.issuedOn}</p></div>
              <span className="text-sm text-text-primary font-semibold tabular-nums whitespace-nowrap">{money(signedTotal(i), i.currency)}</span>
            </div>
            {i.pdfPath && <a href={`/api/invoices/${encodeURIComponent(i.id)}/download`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-border-interactive px-3 text-sm text-gold-text hover:bg-surface-hover">Apri documento originale</a>}
            <p className="text-2xs text-text-secondary">Registro: <strong className="text-text-primary">{evidence.status.label}</strong> · {evidence.status.why}</p>
            <InvoiceBankPayments proof={data.bankDocuments?.invoices.get(i.id) ?? null} />
            <p className="text-2xs text-text-secondary">Riferimenti diretti in banca: {evidence.real.length ? `${evidence.real.length} movimenti collegati` : 'nessun movimento banca direttamente collegato'} · altri legami tramite quote sono nel raccordo sopra.</p>
            {i.paidOn && !evidence.real.length && <p className="text-2xs text-warning">La data di pagamento è presente nel registro; il campo del registro non è una prova bancaria: leggere le quote verificate sopra.</p>}
            {evidence.wrongDirection && <p className="text-2xs text-warning">Un movimento collegato ha verso incompatibile: da verificare.</p>}
            {evidence.currencyMismatch && <p className="text-2xs text-warning">Valute diverse: nessuna somma o conversione implicita.</p>}
            {evidence.declared.length > 0 && <p className="text-2xs text-warning">{evidence.declared.length} riferimenti manuali/derivati separati dalla prova bancaria.</p>}
            {partlyVoided(i) && <p className="text-2xs text-warning">Storno parziale: l’importo in testata è il lordo originario, non il residuo da incassare/pagare.</p>}
            <section className="rounded-xl bg-surface-hover p-3 space-y-2">
              <h3 className="text-sm font-semibold text-text-primary">Nel conto economico e negli accordi</h3>
              {data.economicLinks == null ? <p className="text-2xs text-warning">Collegamenti economici non disponibili in questa lettura. Non significa che siano assenti.</p>
                : !(data.economicLinks.get(i.id)?.length) ? <p className="text-2xs text-text-secondary">Nessuna riga economica riferisce direttamente questa fattura. Competenza e accordo da collegare.</p>
                : <ul className="space-y-2 text-2xs text-text-secondary">{data.economicLinks.get(i.id)!.map(ref => <li key={`${ref.side}:${ref.id}`} className="space-y-1">
                  <p>{ref.label} · {ref.side} · competenza {ref.month?.slice(0, 7) ?? 'n/d'}</p>
                  <div className="flex flex-wrap gap-3">{ref.month && <Link className="text-gold-text underline" href={`/lab/conto-economico?m=${ref.month}&vista=maturato&riga=${encodeURIComponent(ref.id)}&tipoRiga=${ref.side}#righe-economiche`}>Apri la riga nel conto economico</Link>}{ref.streamId && <Link className="text-gold-text underline" href={`/lab/accordi?accordo=${encodeURIComponent(ref.streamId)}`}>Apri l’accordo</Link>}</div>
                </li>)}</ul>}
              <p className="text-2xs text-text-secondary">Riferimenti presenti nel registro: non certificano una quota di pagamento.</p>
            </section>
            {(data.resourceLinks == null || data.resourceLinks.get(i.id)?.links.length || data.resourceLinks.get(i.id)?.issues.length) ? <section className="rounded-xl bg-surface-hover p-3 space-y-2"><h3 className="text-sm font-semibold text-text-primary">Risorsa collegata</h3><LabConnectionList connections={data.resourceLinks?.get(i.id) ?? null} /></section> : null}
            <details open={!!focused}>
              <summary className="cursor-pointer text-sm text-gold-text py-1">Fonti, rettifiche e movimenti</summary>
              <div className="mt-2 space-y-2 text-2xs text-text-secondary">
                <p>Documento: imponibile {money(i.taxable, i.currency)} · IVA {money(i.vatAmount, i.currency)} · lordo {money(i.total, i.currency)}. Fonte: archivio fatture{i.fromSdi ? ', XML SdI' : ''}.</p>
                <p>Scadenza: {i.dueDate ?? 'n/d'}{i.dueRule ? ' · regola interna, non data scritta sul documento' : ''}. Pagamento nel registro: {i.paidOn ?? 'n/d'}.</p>
                {i.withholding !== 0 && <p>Ritenute documentali: {money(i.withholding, i.currency)}; lordo e bonifico non sono automaticamente confrontabili.</p>}
                {i.declaredPaidAmount != null && <p>Importo pagato dichiarato nel registro: {money(i.declaredPaidAmount, i.currency)}. Non è una quota bancaria confermata da questa vista.</p>}
                {i.excludedReason && <p>Esclusione registrata: {i.excludedReason}.</p>}
                {parent && <p>Rettifica il documento <Link className="text-gold-text underline" href={href(parent.direction, 'tutte', parent.id)}>{parent.number}</Link>.</p>}
                {i.rectifiesId && !parent && <p className="text-warning">Il documento rettificato non è presente nell’archivio letto.</p>}
                {(isCreditNote(i.docType) || isDebitNote(i.docType)) && !i.rectifiesId && <p className="text-warning">Documento rettificato da identificare.</p>}
                {notes.map(note => <p key={note.id}><Link className="text-gold-text underline" href={href(note.direction, 'tutte', note.id)}>{isCreditNote(note.docType) ? 'Nota di credito' : isDebitNote(note.docType) ? 'Nota di debito' : 'Rettifica'} {note.number}</Link>: {money(signedTotal(note), note.currency)}. {isDebitNote(note.docType) && 'Integra il dovuto, non annulla la fattura.'}</p>)}
                {evidence.real.map(t => <p key={t.id}><Link className="text-gold-text underline" href={`/lab/banca?m=${t.bookedOn.slice(0, 7)}-01&conto=${encodeURIComponent(t.accountId)}&movimento=${encodeURIComponent(t.id)}#movimento-${encodeURIComponent(t.id)}`}>{t.bookedOn} · {data.accountNames.get(t.accountId) ?? 'Conto n/d'} · {money(t.amount, t.currency)}</Link>{t.hidden && ' · movimento nascosto dalla lettura operativa, presente in cassa'}</p>)}
                <p>Totale lordo dei movimenti direttamente collegati: {money(evidence.linkedGross, i.currency)}. Non equivale alla quota destinata alla fattura in un cumulativo.</p>
                {!!i.warnings?.length && <p className="text-warning">Avvisi del documento: {i.warnings.join(' · ')}</p>}
              </div>
            </details>
            {candidates.length > 0 && <details><summary className="cursor-pointer text-sm text-gold-text py-1">Proposte da verificare · {candidates.length}</summary><ul className="mt-2 space-y-2 text-2xs text-text-secondary">
              {candidates.map(c => <li key={c.item.id}>{c.item.bookedOn} · {eur2(c.item.amount)} · {c.why.join(', ')}{(suggestions?.contenders.get(c.item.id) ?? 0) > 1 && <span className="text-warning"> · candidato per {suggestions!.contenders.get(c.item.id)} fatture</span>}</li>)}
              <li>Nessun aggancio è salvato. La conferma umana sarà disponibile solo nel flusso promosso.</li>
            </ul></details>}
          </li></LabRecordScope>
        })}
      </ul>
      <LabSourceActions actions={[{ label: 'Carica fatture e documenti', href: '/economics/carica' }, { label: 'Gestisci le fatture', href: `/economics/fatturazione${contextMonth ? `?m=${contextMonth}` : ''}` }]} />
      <p className="text-2xs text-text-tertiary">Lettura avviata {data.observedAt}. I dati possono aggiornarsi durante la lettura. Completezza delle fonti e confronto con la sezione in uso ancora da verificare.</p>
    </>}
  </div>
}
