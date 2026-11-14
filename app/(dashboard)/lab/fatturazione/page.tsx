import Link from 'next/link'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabInvoices } from '@/lib/lab-invoices-load'
import { invoiceEvidence, invoiceProposals } from '@/lib/lab-invoices'
import { romeToday } from '@/lib/lab-bank'
import { isCreditNote, isDebitNote, signedTotal, partlyVoided } from '@/lib/invoices'
import { eur2 } from '@/lib/money'

export const dynamic = 'force-dynamic'

const STATES = { verifica: 'Da verificare', aperte: 'Aperte nel registro', tutte: 'Tutti i documenti', note: 'Note e rettifiche' }
type State = keyof typeof STATES
const money = (value: number | null, currency: string) => value == null ? 'n/d'
  : currency === 'EUR' ? eur2(value) : `${value.toFixed(2)} ${currency}`

export default async function LabInvoicesPage({ searchParams }: {
  searchParams: { tipo?: string; stato?: string; documento?: string; q?: string }
}) {
  await requireLabAdmin()
  const today = romeToday()
  const data = await loadLabInvoices(today)
  const focused = data.ok ? data.invoices.find(i => i.id === searchParams.documento) : undefined
  const direction = focused?.direction ?? (searchParams.tipo === 'ricevuta' ? 'ricevuta' : 'emessa')
  const state: State = searchParams.stato && Object.hasOwn(STATES, searchParams.stato) ? searchParams.stato as State : 'verifica'
  const query = (searchParams.q ?? '').trim().slice(0, 200)
  const href = (tipo: string, stato: string, documento?: string) => {
    const params = new URLSearchParams({ tipo, stato })
    if (documento) params.set('documento', documento)
    if (query) params.set('q', query)
    return `/lab/fatturazione?${params}`
  }
  const rows = data.ok ? data.invoices.filter(i => i.direction === direction).map(i => ({ i, evidence: invoiceEvidence(i, data.txs, today) })) : []
  const visible = rows.filter(({ i, evidence }) => focused ? i.id === focused.id
    : (state === 'tutte' || (state === 'verifica' && evidence.needsReview) || (state === 'aperte' && evidence.open)
      || (state === 'note' && (!!i.rectifiesId || !!i.rectifiedBy?.length || isCreditNote(i.docType) || isDebitNote(i.docType))))
      && (!query || `${i.number} ${i.counterpartyName}`.toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it'))))
    .sort((a, b) => Number(b.evidence.open) - Number(a.evidence.open)
      || (a.i.dueDate ?? '9999').localeCompare(b.i.dueDate ?? '9999') || a.i.id.localeCompare(b.i.id))
  const suggestions = data.ok ? invoiceProposals(data.invoices, data.txs, today) : null

  return <div className="min-h-full max-w-5xl mx-auto px-4 py-5 sm:p-6 space-y-5">
    <div className="flex gap-4 text-sm text-gold-text"><Link href="/lab" className="underline">Laboratorio</Link><Link href="/lab/banca" className="underline">Banca</Link></div>
    <header>
      <h1 className="text-xl text-text-primary font-semibold">Fatturazione</h1>
      <p className="text-sm text-text-secondary">Che cosa è documentato e quale pagamento lo spiega?</p>
      <p className="text-2xs text-text-tertiary mt-1">Sola lettura · documenti fino al {today} · in verifica</p>
    </header>
    {!data.ok ? <p role="alert" className="p-4 rounded-xl bg-warning-dim text-warning text-sm">{data.message}</p> : <>
      <nav aria-label="Tipo fattura" className="flex gap-2">
        {(['emessa', 'ricevuta'] as const).map(tipo => <Link key={tipo} href={href(tipo, state)} aria-current={tipo === direction ? 'page' : undefined}
          className={`px-4 py-2 rounded-xl border text-sm ${tipo === direction ? 'bg-surface-active border-border-strong text-text-primary' : 'border-border text-text-secondary'}`}>{tipo === 'emessa' ? 'Emesse' : 'Ricevute'}</Link>)}
      </nav>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[['Documenti in archivio', String(rows.length)], ['Aperti secondo il registro', String(rows.filter(r => r.evidence.open).length)], [direction === 'emessa' ? 'Residuo da incassare certificato' : 'Residuo da pagare certificato', 'n/d']].map(([label, value]) => <div key={label} className="p-4 bg-surface rounded-xl border border-border"><dt className="text-2xs text-text-secondary">{label}</dt><dd className="text-xl text-text-primary font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      <aside className="bg-surface border border-border rounded-xl p-4 text-sm text-text-secondary space-y-2">
        <p>Lo stato del registro e i movimenti bancari sono due riscontri distinti. Una data «pagata» non certifica l’incasso; un bonifico collegato non dimostra che copra tutta la fattura.</p>
        <p>Rettifiche, acconti, ritenute e quote vanno riconciliati prima di certificare il residuo. Gli arretrati restano visibili: nessun filtro automatico al solo mese corrente.</p>
      </aside>
      <nav aria-label="Filtra stato" className="flex flex-wrap gap-2">
        {Object.entries(STATES).map(([key, label]) => <Link key={key} href={href(direction, key)} aria-current={!focused && state === key ? 'page' : undefined}
          className={`px-3 py-2 rounded-xl border text-sm ${!focused && state === key ? 'bg-surface-active border-border-strong text-text-primary' : 'border-border text-text-secondary'}`}>{label}</Link>)}
      </nav>
      <form className="flex flex-wrap gap-2" method="get">
        <input type="hidden" name="tipo" value={direction} /><input type="hidden" name="stato" value={state} />
        <label className="flex-1 min-w-0"><span className="sr-only">Cerca numero o controparte</span><input name="q" defaultValue={query} maxLength={200} placeholder="Cerca numero o controparte" className="w-full bg-surface border border-border-interactive text-text-primary rounded-xl px-3 py-2 text-sm" /></label>
        <button type="submit" className="px-4 py-2 bg-gold text-on-gold rounded-xl text-sm font-medium">Cerca</button>
      </form>
      {searchParams.documento && !focused && <p className="text-sm text-warning">Documento non presente nell’archivio letto. Nessun collegamento viene dedotto.</p>}
      {focused && <p className="text-sm text-text-secondary">Documento selezionato · <Link className="text-gold-text underline" href={href(direction, 'tutte')}>Torna all’elenco</Link></p>}
      {!visible.length && <p className="text-sm text-text-secondary">Nessun documento per questa selezione. La completezza delle fonti resta da verificare.</p>}
      <ul className="space-y-3">
        {visible.map(({ i, evidence }) => {
          const notes = (i.rectifiedBy ?? []).map(id => data.invoices.find(x => x.id === id)).filter(x => x != null)
          const parent = i.rectifiesId ? data.invoices.find(x => x.id === i.rectifiesId) : undefined
          const candidates = suggestions?.proposals.get(i.id) ?? []
          const kind = isCreditNote(i.docType) ? 'Nota di credito' : isDebitNote(i.docType) ? 'Nota di debito' : 'Fattura'
          return <li key={i.id} className="bg-surface border border-border rounded-2xl p-4 space-y-3">
            <div className="flex justify-between gap-3">
              <div className="min-w-0"><h2 className="text-sm font-semibold text-text-primary break-words">{i.counterpartyName}</h2><p className="text-2xs text-text-secondary">{kind} {i.number} · {i.issuedOn}</p></div>
              <span className="text-sm text-text-primary font-semibold tabular-nums whitespace-nowrap">{money(signedTotal(i), i.currency)}</span>
            </div>
            <p className="text-2xs text-text-secondary">Registro: <strong className="text-text-primary">{evidence.status.label}</strong> · {evidence.status.why}</p>
            <p className="text-2xs text-text-secondary">Banca: {evidence.real.length ? `${evidence.real.length} movimenti collegati` : 'nessun movimento banca direttamente collegato'} · residuo certificato n/d.</p>
            {i.paidOn && !evidence.real.length && <p className="text-2xs text-warning">La data di pagamento è presente nel registro; manca il riscontro bancario diretto in questa lettura.</p>}
            {evidence.wrongDirection && <p className="text-2xs text-warning">Un movimento collegato ha verso incompatibile: da verificare.</p>}
            {evidence.currencyMismatch && <p className="text-2xs text-warning">Valute diverse: nessuna somma o conversione implicita.</p>}
            {evidence.declared.length > 0 && <p className="text-2xs text-warning">{evidence.declared.length} riferimenti manuali/derivati separati dalla prova bancaria.</p>}
            {partlyVoided(i) && <p className="text-2xs text-warning">Storno parziale: l’importo in testata è il lordo originario, non il residuo da incassare/pagare.</p>}
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
          </li>
        })}
      </ul>
      <p className="text-2xs text-text-tertiary">Lettura avviata {data.observedAt}. I dati possono aggiornarsi durante la lettura. Completezza delle fonti e confronto con la sezione in uso ancora da verificare.</p>
    </>}
  </div>
}
