import { loadLabInvoiceRecords } from '@/lib/lab-invoice-records-load'
import { invoiceBankReconciliation } from '@/lib/lab-invoice-bank'
import { BankInvoiceProof } from '@/components/lab/LabInvoiceBankProof'
import { LabRecordScope } from '@/components/lab/LabJourney'
import { bankDailyChart } from '@/lib/lab-chart-data'
import { bankMovementSearch, bankDays, BANK_KIND_LABELS } from '@/lib/lab-bank-view'
import { LabReconcileButton } from '@/components/lab/LabReconciliationProvider'
import { LabReturnFields } from '@/components/lab/LabJourney'
import LabChart from '@/components/lab/LabChart'
import LabSourceActions from '@/components/lab/LabSourceActions'
import LabMonthPicker from '@/components/lab/LabMonthPicker'
import Link from '@/components/lab/LabLink'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabBank } from '@/lib/lab-bank-load'
import { bankReadout, bankReference, labMonth, monthEnd, romeToday, type LabBankTx } from '@/lib/lab-bank'
import { eur2 } from '@/lib/money'
import { loadLabConnections } from '@/lib/lab-connections-load'
import { transactionConnections } from '@/lib/lab-connections'
import LabConnectionList from '@/components/lab/LabConnectionList'

export const dynamic = 'force-dynamic'

export default async function LabBankPage({ searchParams }: { searchParams: { m?: string; conto?: string; movimento?: string; q?: string; riferimenti?: string; giorno?: string; documenti?: string; verso?: string; tipo?: string; vista?: string } }) {
  await requireLabAdmin()
  const today = romeToday()
  const month = labMonth(searchParams.m, today)
  const [data, connections, invoiceRecords] = await Promise.all([loadLabBank(today), loadLabConnections(today), loadLabInvoiceRecords(today)])
  const bankDocuments = data.ok && connections && invoiceRecords ? invoiceBankReconciliation(invoiceRecords, data.txs, data.accounts, connections, today) : null
  const documentFilter = ['emesse', 'ricevute', 'senza'].includes(searchParams.documenti ?? '') ? searchParams.documenti! : 'tutti'
  const direction = ['entrate', 'uscite'].includes(searchParams.verso ?? '') ? searchParams.verso! : 'tutti'
  const kind = Object.hasOwn(BANK_KIND_LABELS, searchParams.tipo ?? '') ? searchParams.tipo! : ''
  const view = searchParams.vista === 'analisi' || searchParams.vista === 'controlli' ? searchParams.vista : 'movimenti'
  const query = (searchParams.q ?? '').trim().slice(0, 200)
  const day = searchParams.giorno && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.giorno) && searchParams.giorno.startsWith(month.slice(0, 7)) && searchParams.giorno >= month && searchParams.giorno <= monthEnd(month) ? searchParams.giorno : ''
  const filter = searchParams.riferimenti === 'senza' || searchParams.riferimenti === 'presenti' ? searchParams.riferimenti : 'tutti'
  const references = new Map(data.ok && connections ? data.txs.map(tx => [tx.id, transactionConnections(tx, connections)]) : [])
  const params = { m: month, q: query, riferimenti: filter, documenti: documentFilter, verso: direction, tipo: kind, vista: view, ...(searchParams.conto ? { conto: searchParams.conto } : {}), ...(day ? { giorno: day } : {}) }
  const href = (m: string, account?: string) => `/lab/banca?${new URLSearchParams({ ...params, m, conto: account ?? '', giorno: day.startsWith(m.slice(0, 7)) ? day : '' })}`
  const change = (patch: Record<string, string>) => `/lab/banca?${new URLSearchParams({ ...params, ...patch })}`
  const selected = data.ok && data.accounts.some(a => a.id === searchParams.conto) ? searchParams.conto : undefined
  const documentMatch = (tx: LabBankTx) => !bankDocuments || documentFilter === 'tutti' || (documentFilter === 'senza' ? !bankDocuments.transactions.get(tx.id)?.links.length : !!bankDocuments.transactions.get(tx.id)?.links.some(l => invoiceRecords?.some(i => i.id === l.invoiceId && i.direction === (documentFilter === 'emesse' ? 'emessa' : 'ricevuta'))))
  const visibleMovement = (tx: LabBankTx) => (!kind || tx.kind === kind) && (direction === 'tutti' || (direction === 'entrate' ? tx.amount > 0 : tx.amount < 0)) && documentMatch(tx) && (!day || tx.booked_on === day) && (searchParams.movimento ? tx.id === searchParams.movimento :
    bankMovementSearch(tx, query)
    && (!connections || filter === 'tutti' || (filter === 'presenti' ? !!references.get(tx.id)?.links.length : !references.get(tx.id)?.links.length && !references.get(tx.id)?.issues.length)))

  return (
    <div className="min-h-full min-w-0 break-words max-w-7xl mx-auto px-4 py-5 sm:p-6 space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-text-primary">Banca</h1>
        <p className="text-sm text-text-secondary">Effettivo consolidato: solo entrate e uscite di origine banca. Le fatture spiegano i movimenti, non li sostituiscono.</p>
        <p className="text-2xs text-text-tertiary mt-1">Movimenti da estratto · importi lordi · dati osservati fino al {today} · in verifica</p>
      </header>
      <div className="flex flex-wrap gap-2"><LabReconcileButton label="Collega banca e fatture" /><Link href="/lab/fonti" className="inline-flex min-h-11 items-center rounded-xl border border-border-interactive px-3 text-sm text-gold-text">Verifica estratto</Link><Link href="/lab/raccordi" className="inline-flex min-h-11 items-center px-3 text-sm text-gold-text underline">Registro raccordi</Link></div>
      <LabMonthPicker month={month} action="/lab/banca" parameters={{ q: query, riferimenti: filter, documenti: documentFilter, verso: direction, tipo: kind, vista: view, ...(selected ? { conto: selected } : {}) }} label="Mese dei movimenti" />
      {!data.ok ? <p role="alert" className="rounded-xl p-4 bg-warning-dim text-warning text-sm">{data.message}</p> : <>
        <nav id="sintesi" aria-label="Filtra conto" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Link href={href(month)} aria-current={!selected ? 'page' : undefined} className={`rounded-xl border p-3 ${!selected ? 'border-border-strong bg-surface-active' : 'border-border bg-surface'}`}><span className="block text-sm font-semibold">Tutti i conti</span><span className="text-2xs text-text-secondary">Saldi separati · totale non certificato</span></Link>
          {[...data.accounts].sort((a, b) => Number(!!a.parent_id) - Number(!!b.parent_id)).map(a => { const r = bankReadout(a, data.txs, month, today); return <Link key={a.id} href={href(month, a.id)} aria-current={selected === a.id ? 'page' : undefined} className={`min-w-0 rounded-xl border p-3 ${selected === a.id ? 'border-border-strong bg-surface-active' : 'border-border bg-surface'}`}><span className="block text-sm font-semibold">{a.parent_id ? '↳ ' : ''}{a.label}</span><span className="block text-base font-semibold tabular-nums">{r.reconstructed == null || a.currency !== 'EUR' ? 'n/d' : eur2(r.reconstructed)}</span><span className="text-2xs text-text-secondary">{a.parent_id ? 'Sottoconto · ' : ''}Ricostruito al {r.upTo}{r.statementDifference != null && r.statementDifference !== 0 ? ' · scarto da verificare' : ''}</span></Link> })}
        </nav>
        <nav aria-label="Vista banca" className="flex flex-wrap gap-2 border-b border-border pb-2">{[['movimenti', 'Movimenti'], ['analisi', 'Analisi'], ['controlli', 'Controlli e fonti']].map(([key, label]) => <Link key={key} href={change({ vista: key })} aria-current={view === key ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm ${view === key ? 'bg-surface-active font-semibold text-text-primary' : 'text-gold-text'}`}>{label}</Link>)}</nav>
        {searchParams.movimento && !data.txs.some(tx => tx.id === searchParams.movimento && tx.source === 'banca' && tx.booked_on.slice(0, 7) === month.slice(0, 7) && (!selected || tx.account_id === selected)) && <p role="alert" className="rounded-xl bg-warning-dim p-3 text-sm text-warning">Il movimento richiesto non è presente tra i movimenti di banca del mese e conto selezionati. Non viene mostrato un movimento sostitutivo.</p>}
        {searchParams.giorno && !day && <p role="alert" className="rounded-xl bg-warning-dim p-3 text-sm text-warning">Giorno non valido per questo mese: nessun filtro giornaliero applicato.</p>}
        <form method="get" action="/lab/banca" className="rounded-2xl border border-border bg-surface p-4"><LabReturnFields />
          <input type="hidden" name="m" value={month} /><input type="hidden" name="vista" value={view} /><input type="hidden" name="verso" value={direction} />{selected && <input type="hidden" name="conto" value={selected} />}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:items-end">
            <label className="min-w-0 text-2xs text-text-secondary">Cerca nei movimenti<input name="q" defaultValue={query} maxLength={200} placeholder="Nome, causale, documento o importo" className="mt-1 block min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary" /></label>
            <button type="submit" className="min-h-11 rounded-xl bg-gold px-4 text-sm font-medium text-on-gold">Filtra</button>
          </div>
          <details className="mt-2"><summary className="cursor-pointer py-2 text-sm text-gold-text">Filtri avanzati</summary><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">            <label className="text-2xs text-text-secondary">Giorno<input type="date" name="giorno" defaultValue={day} className="mt-1 block min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary" /></label>
            <label className="text-2xs text-text-secondary">Collegamenti<select name="riferimenti" defaultValue={filter} disabled={!connections} className="mt-1 block min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary"><option value="tutti">Tutti i movimenti</option><option value="senza">Senza riferimenti nei registri</option><option value="presenti">Con riferimenti nei registri</option></select></label>
            <label className="text-2xs text-text-secondary">Fatture collegate<select name="documenti" defaultValue={documentFilter} disabled={!bankDocuments} className="mt-1 block min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary"><option value="tutti">Tutti i movimenti bancari</option><option value="emesse">Emesse · incassi e rimborsi</option><option value="ricevute">Ricevute · pagamenti e rimborsi</option><option value="senza">Senza fattura collegata</option></select></label>
<label className="text-2xs text-text-secondary">Categoria<select name="tipo" defaultValue={kind} className="mt-1 min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary"><option value="">Tutte</option>{Object.entries(BANK_KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div></details>
          <p className="mt-3 text-2xs text-text-secondary">Entrate → fatture emesse; uscite → fatture ricevute. Le note di credito invertono il verso del rimborso. I filtri non cambiano i fatti bancari o i saldi del mese.</p>
          {!bankDocuments && <p className="mt-2 text-2xs text-warning">Raccordo fatture non disponibile: filtro fatture sospeso. I movimenti bancari restano visibili, nessun collegamento è assunto assente.</p>}
          {!connections && <p className="mt-2 text-2xs text-warning">Fonti dei collegamenti non disponibili: il filtro per riferimenti è sospeso.</p>}
          {day && <p className="mt-2 text-2xs text-text-secondary">Elenco limitato al {day}. <Link href={`/lab/banca?${new URLSearchParams({ m: month, ...(selected ? { conto: selected } : {}), q: query, riferimenti: filter, documenti: documentFilter })}`} className="inline-block py-2 text-gold-text underline">Mostra tutto il mese</Link></p>}
          {searchParams.movimento && <Link className="mt-2 inline-block py-2 text-2xs text-gold-text underline" href={href(month, selected)}>Esci dal movimento selezionato</Link>}
        </form>

        <div className="flex flex-wrap items-center gap-2" aria-label="Filtri attivi e rapidi">{[['tutti', 'Tutti'], ['entrate', 'Entrate'], ['uscite', 'Uscite']].map(([key, label]) => <Link key={key} href={change({ verso: key })} aria-current={direction === key ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-xl border px-3 text-sm ${direction === key ? 'border-border-strong bg-surface-active' : 'border-border text-gold-text'}`}>{label}</Link>)}{[[query, 'Ricerca: ' + query, 'q'], [day, day, 'giorno'], [kind, BANK_KIND_LABELS[kind as keyof typeof BANK_KIND_LABELS], 'tipo'], [filter !== 'tutti' ? filter : '', 'Riferimenti: ' + filter, 'riferimenti'], [documentFilter !== 'tutti' ? documentFilter : '', 'Fatture: ' + documentFilter, 'documenti']].filter(([value]) => !!value).map(([, label, key]) => <Link key={key} href={change({ [key]: key === 'riferimenti' || key === 'documenti' ? 'tutti' : '' })} className="inline-flex min-h-11 items-center rounded-xl bg-surface-active px-3 text-2xs text-gold-text" aria-label={`Rimuovi filtro ${label}`}>{label} ×</Link>)}{(query || day || kind || direction !== 'tutti' || filter !== 'tutti' || documentFilter !== 'tutti') && <Link href={change({ q: '', giorno: '', tipo: '', verso: 'tutti', riferimenti: 'tutti', documenti: 'tutti' })} className="inline-flex min-h-11 items-center px-2 text-sm text-gold-text underline">Azzera filtri</Link>}</div>
        {!data.accounts.length && <p className="text-sm text-text-secondary">Nessun conto disponibile in archivio. Saldi n/d.</p>}
        <span id="dati-prove" className="block scroll-mt-6" />
        {data.accounts.filter(a => !selected || a.id === selected).sort((a, b) => Number(!!a.parent_id) - Number(!!b.parent_id) || Number(b.is_primary) - Number(a.is_primary) || a.label.localeCompare(b.label)).map(account => {
          const read = bankReadout(account, data.txs, month, today)
          const visible = read.period.filter(visibleMovement)
          const money = (n: number | null) => n == null || account.currency !== 'EUR' ? 'n/d' : eur2(n)
          return <section key={account.id} className="rounded-2xl border border-border bg-surface p-4 space-y-4">
            <header>
              <h2 className="text-base font-semibold text-text-primary">{account.label}</h2>
              <p className="text-2xs text-text-tertiary">{account.bank_name ?? 'Banca n/d'} · {account.currency} · {account.parent_id ? 'sottoconto, escluso dal consolidato' : 'conto principale'}{!account.is_active && ' · non attivo'}</p>
            </header>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[['Saldo ricostruito al ' + read.upTo, money(read.reconstructed)], ['Entrato nel mese', money(read.inflow)], ['Uscito nel mese', money(read.outflow)]].map(([label, value]) => <div key={label} className="rounded-xl bg-surface-hover p-3"><dt className="text-2xs text-text-secondary">{label}</dt><dd className="text-2xl tabular-nums font-semibold text-text-primary">{value}</dd></div>)}
            </dl>
            {read.beforeOpening && <p className="rounded-xl bg-warning-dim p-3 text-sm text-warning">Il saldo è n/d perché ci sono movimenti precedenti all’apertura registrata.</p>}
            {read.statementDifference != null && read.statementDifference !== 0 && <p className="rounded-xl bg-warning-dim p-3 text-sm text-warning">Il saldo ricostruito non coincide con quello dichiarato alla stessa data. Scarto: {money(read.statementDifference)}. Verifica l’estratto originale.</p>}
            <details open={view === 'controlli'} className="text-2xs text-text-secondary"><summary className="cursor-pointer py-2 text-sm text-gold-text">Fonti del saldo e copertura del conto</summary><div className="mt-2 space-y-2">
              <p>Fonte del saldo: apertura registrata {money(account.opening_balance)} del {account.opening_date} + movimenti banca. Ultimo movimento: {read.lastBookedOn ?? 'n/d'}. Copertura completa: da verificare.</p>
              <p>Saldo dichiarato dalla banca: {money(account.statement_balance ?? null)}{account.statement_on && ` al ${account.statement_on}`}. Scarto alla stessa data: {money(read.statementDifference)}.</p>
              {read.statementDifference === 0 && <p className="text-info">Coincidenza alla data dichiarata; nessuna certificazione dei periodi successivi.</p>}
              {read.statementDifference != null && read.statementDifference !== 0 && <p className="text-warning">Lo scarto richiede verifica sull’estratto originale.</p>}
              {read.beforeOpening && <p className="text-warning">Movimenti precedenti all’apertura registrata: ricostruzione del saldo n/d.</p>}
              {month > today && <p>Nessun movimento futuro viene assunto avvenuto.</p>}
              {account.currency !== 'EUR' && <p className="text-warning">Valuta diversa da EUR: nessuna conversione o somma implicita.</p>}
              <p>{read.period.length} movimenti banca nel mese · {read.transfers.length} giroconti · {read.hidden.length} nascosti inclusi · {read.declaredCount} manuali/derivati esclusi dai totali.</p>
            </div></details>
            {view === 'movimenti' && <section aria-label={`Movimenti ${account.label}`} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-semibold">Movimenti · {visible.length} di {read.period.length}</h3><p className="text-2xs text-text-secondary">Netto dei risultati: <strong className="text-text-primary tabular-nums">{money(Math.round(visible.reduce((n, tx) => n + tx.amount, 0) * 100) / 100)}</strong> · saldi e flussi sopra: intero mese</p></div>
              {!visible.length ? <p className="text-sm text-text-secondary">Nessun movimento per questa selezione. Modifica o azzera i filtri.</p> : bankDays(visible).map(group => <section key={group.date} className="overflow-hidden rounded-xl border border-border"><header className="flex flex-wrap justify-between gap-2 bg-surface-hover px-3 py-2 text-2xs"><h4 className="font-semibold">{group.date} · {group.rows.length} movimenti</h4><span className="tabular-nums">Netto del giorno nei risultati: {money(group.net)}</span></header><ul className="divide-y divide-border">{group.rows.map(tx => { const proof = bankDocuments?.transactions.get(tx.id); return <LabRecordScope key={tx.id} anchor={`movimento-${tx.id}`}><li id={`movimento-${tx.id}`} className="scroll-mt-4 p-3">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{tx.counterparty || tx.description || 'Controparte n/d'}</p><p className="mt-1 text-2xs text-text-secondary">{BANK_KIND_LABELS[tx.kind]} · {tx.amount >= 0 ? 'Entrata' : 'Uscita'} · {proof ? proof.issues.length ? 'Quote da verificare' : proof.links.length ? 'Fatture collegate' : 'Senza fattura collegata' : 'Raccordo non disponibile'}</p></div><strong className={`shrink-0 whitespace-nowrap text-sm tabular-nums ${tx.amount > 0 ? 'text-success' : 'text-text-primary'}`}>{tx.amount > 0 ? '+' : ''}{money(tx.amount)}</strong></div>
                <div className="mt-2 flex flex-wrap items-start gap-3"><details open={searchParams.movimento === tx.id} className="min-w-0 flex-1"><summary className="cursor-pointer py-2 text-2xs text-gold-text">Dettagli, documenti e prove</summary><div className="mt-2 space-y-3"><p className="break-words text-2xs text-text-secondary">{tx.description}</p><p className="text-2xs text-text-secondary">{tx.booked_on} · banca · {bankReference(tx)}</p><BankInvoiceProof proof={proof ?? null} documents={invoiceRecords ?? []} /><LabConnectionList connections={references.get(tx.id) ?? null} />{tx.hidden_reason && <p className="text-2xs text-warning">{tx.hidden_reason} · incluso nella cassa.</p>}</div></details><LabReconcileButton movementId={tx.id} label="Collega" /></div>
              </li></LabRecordScope> })}</ul></section>)}
            </section>}

          </section>
        })}
        <details open={view === 'analisi'} className="rounded-xl border border-border bg-surface p-3"><summary className="cursor-pointer py-2 text-sm text-gold-text">Analisi dei flussi · grafico e dati esportabili</summary><LabChart chartId="analisi" key={`banca-${month}-${selected ?? 'tutti'}-${query}-${filter}-${day}-${documentFilter}-${direction}-${kind}-${searchParams.movimento ?? ''}`} title="Entrate e uscite per giorno" note="Un conto EUR alla volta; giorni con movimenti registrati, inclusi nascosti e giroconti. Non certifica la continuità degli estratti o il saldo disponibile. Apri un giorno per verificarne i movimenti." context={`Mese ${month} · osservazione ${today}`} initialType="line" singleGroup series={[{ key: 'incoming', label: 'Entrate lorde' }, { key: 'outgoing', label: 'Uscite lorde' }]} rows={bankDailyChart(data.accounts.filter(a => !selected || a.id === selected), data.txs, month, today, visibleMovement, { q: query, riferimenti: filter, documenti: documentFilter, verso: direction, tipo: kind, ...(searchParams.movimento ? { movimento: searchParams.movimento } : {}) })} /></details>
        {view === 'controlli' && <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary space-y-2"><h2 className="font-semibold text-text-primary">Come leggere saldi e conti</h2><p>Apertura registrata + movimenti bancari, inclusi giroconti e nascosti. Manuali e dichiarati esclusi. I filtri della lista non cambiano il saldo.</p><p>La coincidenza con un saldo dichiarato verifica soltanto quella data, non la completezza successiva. Totale dei conti n/d finché il perimetro non è verificato.</p><Link href={`/lab/verifiche?${new URLSearchParams({ area: 'banca', m: month })}`} className="inline-flex min-h-11 items-center text-gold-text underline">Apri Centro verifiche</Link></div>}
        <LabSourceActions actions={[{ label: 'Carica documenti', href: '/economics/carica' }, { label: 'Gestisci i movimenti', href: `/economics/banca?m=${month}` }]} />
        <p className="text-2xs text-text-tertiary">Lettura avviata: {data.observedAt}. I dati possono aggiornarsi durante la lettura. Confronto e completezza delle fonti ancora da verificare.</p>
      </>}
    </div>
  )
}
