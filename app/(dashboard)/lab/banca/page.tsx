import LabSourceActions from '@/components/lab/LabSourceActions'
import LabMonthPicker from '@/components/lab/LabMonthPicker'
import Link from 'next/link'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabBank } from '@/lib/lab-bank-load'
import { bankReadout, bankReference, labMonth, romeToday } from '@/lib/lab-bank'
import { eur2 } from '@/lib/money'
import { loadLabConnections } from '@/lib/lab-connections-load'
import { transactionConnections } from '@/lib/lab-connections'
import LabConnectionList from '@/components/lab/LabConnectionList'

export const dynamic = 'force-dynamic'

export default async function LabBankPage({ searchParams }: { searchParams: { m?: string; conto?: string; movimento?: string; q?: string; riferimenti?: string } }) {
  await requireLabAdmin()
  const today = romeToday()
  const month = labMonth(searchParams.m, today)
  const [data, connections] = await Promise.all([loadLabBank(today), loadLabConnections(today)])
  const query = (searchParams.q ?? '').trim().slice(0, 200)
  const filter = searchParams.riferimenti === 'senza' || searchParams.riferimenti === 'presenti' ? searchParams.riferimenti : 'tutti'
  const references = new Map(data.ok && connections ? data.txs.map(tx => [tx.id, transactionConnections(tx, connections)]) : [])
  const href = (m: string, account?: string) => `/lab/banca?${new URLSearchParams({ m, q: query, riferimenti: filter, ...(account ? { conto: account } : {}) })}`
  const selected = data.ok && data.accounts.some(a => a.id === searchParams.conto) ? searchParams.conto : undefined

  return (
    <div className="min-h-full min-w-0 break-words max-w-5xl mx-auto px-4 py-5 sm:p-6 space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-text-primary">Banca</h1>
        <p className="text-sm text-text-secondary">Che cosa è passato sui conti e che cosa resta da verificare?</p>
        <p className="text-2xs text-text-tertiary mt-1">Sola lettura · importi lordi · dati osservati fino al {today} · in verifica</p>
      </header>
      <LabMonthPicker month={month} action="/lab/banca" parameters={{ q: query, riferimenti: filter, ...(selected ? { conto: selected } : {}) }} label="Mese dei movimenti" />
      {!data.ok ? <p role="alert" className="rounded-xl p-4 bg-warning-dim text-warning text-sm">{data.message}</p> : <>
        <aside className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary space-y-2">
          <p>Il saldo ricostruito usa apertura registrata + movimenti di origine banca, inclusi giroconti e movimenti nascosti. Non è il saldo disponibile dell’app bancaria.</p>
          <p>La coincidenza con un saldo dichiarato controlla quella data: non prova la completezza degli estratti successivi. L’ultimo movimento non certifica la copertura.</p>
          <p>Conti principali e sottoconti sono separati. Totale consolidato: <strong className="text-text-primary">n/d</strong> finché il perimetro non è verificato.</p>
        </aside>
        <nav aria-label="Filtra conto" className="flex flex-wrap gap-2">
          <Link href={href(month)} aria-current={!selected ? 'page' : undefined} className={`px-3 py-2 rounded-xl border text-sm ${!selected ? 'border-border-strong bg-surface-active text-text-primary' : 'border-border text-text-secondary'}`}>Tutti i conti</Link>
          {data.accounts.map(a => <Link key={a.id} href={href(month, a.id)} aria-current={selected === a.id ? 'page' : undefined} className={`px-3 py-2 rounded-xl border text-sm ${selected === a.id ? 'border-border-strong bg-surface-active text-text-primary' : 'border-border text-text-secondary'}`}>{a.label}</Link>)}
        </nav>
        {searchParams.movimento && !data.txs.some(tx => tx.id === searchParams.movimento && tx.source === 'banca' && tx.booked_on.slice(0, 7) === month.slice(0, 7) && (!selected || tx.account_id === selected)) && <p role="alert" className="rounded-xl bg-warning-dim p-3 text-sm text-warning">Il movimento richiesto non è presente tra i movimenti di banca del mese e conto selezionati. Non viene mostrato un movimento sostitutivo.</p>}
        <form method="get" action="/lab/banca" className="rounded-2xl border border-border bg-surface p-4">
          <input type="hidden" name="m" value={month} />{selected && <input type="hidden" name="conto" value={selected} />}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
            <label className="min-w-0 text-2xs text-text-secondary">Cerca nei movimenti<input name="q" defaultValue={query} maxLength={200} placeholder="Controparte, causale o documento" className="mt-1 block min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary" /></label>
            <label className="text-2xs text-text-secondary">Collegamenti<select name="riferimenti" defaultValue={filter} disabled={!connections} className="mt-1 block min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary"><option value="tutti">Tutti i movimenti</option><option value="senza">Senza riferimenti nei registri</option><option value="presenti">Con riferimenti nei registri</option></select></label>
            <button type="submit" className="min-h-11 rounded-xl bg-gold px-4 text-sm font-medium text-on-gold">Filtra</button>
          </div>
          <p className="mt-3 text-2xs text-text-secondary">I filtri cambiano l’elenco, mai i saldi o i totali del mese. Un riferimento non certifica un pagamento.</p>
          {!connections && <p className="mt-2 text-2xs text-warning">Fonti dei collegamenti non disponibili: il filtro per riferimenti è sospeso.</p>}
          {searchParams.movimento && <Link className="mt-2 inline-block py-2 text-2xs text-gold-text underline" href={href(month, selected)}>Esci dal movimento selezionato</Link>}
        </form>
        {!data.accounts.length && <p className="text-sm text-text-secondary">Nessun conto disponibile in archivio. Saldi n/d.</p>}
        {data.accounts.filter(a => !selected || a.id === selected).sort((a, b) => Number(!!a.parent_id) - Number(!!b.parent_id) || Number(b.is_primary) - Number(a.is_primary) || a.label.localeCompare(b.label)).map(account => {
          const read = bankReadout(account, data.txs, month, today)
          const visible = read.period.filter(tx => searchParams.movimento ? tx.id === searchParams.movimento :
            (!query || `${tx.counterparty ?? ''} ${tx.description} ${tx.doc_ref ?? ''}`.toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it')))
            && (!connections || filter === 'tutti' || (filter === 'presenti' ? !!references.get(tx.id)?.links.length : !references.get(tx.id)?.links.length && !references.get(tx.id)?.issues.length)))
          const money = (n: number | null) => n == null || account.currency !== 'EUR' ? 'n/d' : eur2(n)
          return <section key={account.id} className="rounded-2xl border border-border bg-surface p-4 space-y-4">
            <header>
              <h2 className="text-base font-semibold text-text-primary">{account.label}</h2>
              <p className="text-2xs text-text-tertiary">{account.bank_name ?? 'Banca n/d'} · {account.currency} · {account.parent_id ? 'sottoconto, escluso dal consolidato' : 'conto principale'}{!account.is_active && ' · non attivo'}</p>
            </header>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[['Saldo ricostruito al ' + read.upTo, money(read.reconstructed)], ['Entrato nel mese', money(read.inflow)], ['Uscito nel mese', money(read.outflow)]].map(([label, value]) => <div key={label} className="rounded-xl bg-surface-hover p-3"><dt className="text-2xs text-text-secondary">{label}</dt><dd className="text-lg tabular-nums font-semibold text-text-primary">{value}</dd></div>)}
            </dl>
            {read.beforeOpening && <p className="rounded-xl bg-warning-dim p-3 text-sm text-warning">Il saldo è n/d perché ci sono movimenti precedenti all’apertura registrata.</p>}
            {read.statementDifference != null && read.statementDifference !== 0 && <p className="rounded-xl bg-warning-dim p-3 text-sm text-warning">Il saldo ricostruito non coincide con quello dichiarato alla stessa data. Scarto: {money(read.statementDifference)}. Verifica l’estratto originale.</p>}
            <details className="text-2xs text-text-secondary"><summary className="cursor-pointer py-2 text-sm text-gold-text">Fonti del saldo e copertura del conto</summary><div className="mt-2 space-y-2">
              <p>Fonte del saldo: apertura registrata {money(account.opening_balance)} del {account.opening_date} + movimenti banca. Ultimo movimento: {read.lastBookedOn ?? 'n/d'}. Copertura completa: da verificare.</p>
              <p>Saldo dichiarato dalla banca: {money(account.statement_balance ?? null)}{account.statement_on && ` al ${account.statement_on}`}. Scarto alla stessa data: {money(read.statementDifference)}.</p>
              {read.statementDifference === 0 && <p className="text-info">Coincidenza alla data dichiarata; nessuna certificazione dei periodi successivi.</p>}
              {read.statementDifference != null && read.statementDifference !== 0 && <p className="text-warning">Lo scarto richiede verifica sull’estratto originale.</p>}
              {read.beforeOpening && <p className="text-warning">Movimenti precedenti all’apertura registrata: ricostruzione del saldo n/d.</p>}
              {month > today && <p>Nessun movimento futuro viene assunto avvenuto.</p>}
              {account.currency !== 'EUR' && <p className="text-warning">Valuta diversa da EUR: nessuna conversione o somma implicita.</p>}
              <p>{read.period.length} movimenti banca nel mese · {read.transfers.length} giroconti · {read.hidden.length} nascosti inclusi · {read.declaredCount} manuali/derivati esclusi dai totali.</p>
            </div></details>
            <details open={!!query || filter !== 'tutti' || read.period.some(t => t.id === searchParams.movimento)}>
              <summary className="cursor-pointer text-sm text-gold-text py-2">Movimenti e riferimenti · {visible.length} di {read.period.length}</summary>
              <p className="text-2xs text-text-secondary mb-3">Un riferimento diretto non dimostra la copertura integrale. Quote, documenti e distinte saranno verificati nel passaggio successivo; residuo riconciliato n/d.</p>
              {!visible.length ? <p className="text-sm text-text-secondary">Nessun movimento per questa selezione. I totali sopra mantengono tutto il mese; la copertura degli estratti resta da verificare.</p> : <ul className="divide-y divide-border">
                {visible.map(tx => <li key={tx.id} id={`movimento-${tx.id}`} className="py-3 space-y-1 scroll-mt-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:gap-3"><p className="text-sm font-medium text-text-primary break-words">{tx.counterparty || tx.description || 'Controparte n/d'}</p><span className="text-sm text-text-primary whitespace-nowrap tabular-nums">{tx.amount > 0 ? '+' : ''}{money(tx.amount)}</span></div>
                  <p className="text-2xs text-text-tertiary">{tx.booked_on} · banca · {bankReference(tx)}</p>
                  <details open={searchParams.movimento === tx.id} className="rounded-xl bg-surface-hover p-3">
                    <summary className="cursor-pointer py-1 text-sm text-gold-text">Documenti e competenze collegati</summary>
                    <LabConnectionList connections={references.get(tx.id) ?? null} />
                    <p className="mt-2 text-2xs text-text-secondary">Riferimenti dai registri, senza sommare quote o scegliere fra registri concorrenti. Non certificano da soli la copertura.</p>
                  </details>
                  {tx.counterparty && <p className="text-2xs text-text-secondary break-words">{tx.description}</p>}
                  {tx.hidden_reason && <p className="text-2xs text-warning">Nascosto dalla lettura operativa: {tx.hidden_reason}. Incluso nella cassa.</p>}
                </li>)}
              </ul>}
            </details>
          </section>
        })}
        <LabSourceActions actions={[{ label: 'Carica documenti', href: '/economics/carica' }, { label: 'Gestisci i movimenti', href: `/economics/banca?m=${month}` }]} />
        <p className="text-2xs text-text-tertiary">Lettura avviata: {data.observedAt}. I dati possono aggiornarsi durante la lettura. Confronto e completezza delle fonti ancora da verificare.</p>
      </>}
    </div>
  )
}
