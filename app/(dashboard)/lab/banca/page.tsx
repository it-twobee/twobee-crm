import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { requireLabAdmin } from '@/lib/lab-guard'
import { loadLabBank } from '@/lib/lab-bank-load'
import { bankReadout, bankReference, labMonth, romeToday } from '@/lib/lab-bank'
import { monthLabel, shiftMonth } from '@/lib/pl'
import { eur2 } from '@/lib/money'

export const dynamic = 'force-dynamic'

export default async function LabBankPage({ searchParams }: { searchParams: { m?: string; conto?: string; movimento?: string } }) {
  await requireLabAdmin()
  const today = romeToday()
  const month = labMonth(searchParams.m, today)
  const data = await loadLabBank(today)
  const href = (m: string, account?: string) => `/lab/banca?m=${m}${account ? `&conto=${encodeURIComponent(account)}` : ''}`
  const selected = data.ok && data.accounts.some(a => a.id === searchParams.conto) ? searchParams.conto : undefined

  return (
    <div className="min-h-full max-w-5xl mx-auto px-4 py-5 sm:p-6 space-y-5">
      <Link href="/lab" className="text-sm text-gold-text underline">Laboratorio</Link>
      <header>
        <h1 className="text-xl font-semibold text-text-primary">Banca</h1>
        <p className="text-sm text-text-secondary">Che cosa è passato sui conti e che cosa resta da verificare?</p>
        <p className="text-2xs text-text-tertiary mt-1">Sola lettura · importi lordi · dati osservati fino al {today} · in verifica</p>
      </header>
      <nav aria-label="Mese dei movimenti" className="flex items-center justify-between gap-3">
        <Link href={href(shiftMonth(month, -1), selected)} aria-label="Mese precedente" className="p-3 rounded-xl border border-border hover:bg-surface-hover"><ChevronLeft className="w-5 h-5" aria-hidden /></Link>
        <h2 className="text-base text-text-primary font-semibold">{monthLabel(month)}</h2>
        <Link href={href(shiftMonth(month, 1), selected)} aria-label="Mese successivo" className="p-3 rounded-xl border border-border hover:bg-surface-hover"><ChevronRight className="w-5 h-5" aria-hidden /></Link>
      </nav>
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
        {!data.accounts.length && <p className="text-sm text-text-secondary">Nessun conto disponibile in archivio. Saldi n/d.</p>}
        {data.accounts.filter(a => !selected || a.id === selected).sort((a, b) => Number(!!a.parent_id) - Number(!!b.parent_id) || Number(b.is_primary) - Number(a.is_primary) || a.label.localeCompare(b.label)).map(account => {
          const read = bankReadout(account, data.txs, month, today)
          const money = (n: number | null) => n == null || account.currency !== 'EUR' ? 'n/d' : eur2(n)
          return <section key={account.id} className="rounded-2xl border border-border bg-surface p-4 space-y-4">
            <header>
              <h2 className="text-base font-semibold text-text-primary">{account.label}</h2>
              <p className="text-2xs text-text-tertiary">{account.bank_name ?? 'Banca n/d'} · {account.currency} · {account.parent_id ? 'sottoconto, escluso dal consolidato' : 'conto principale'}{!account.is_active && ' · non attivo'}</p>
            </header>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[['Saldo ricostruito al ' + read.upTo, money(read.reconstructed)], ['Entrato nel mese', money(read.inflow)], ['Uscito nel mese', money(read.outflow)]].map(([label, value]) => <div key={label} className="rounded-xl bg-surface-hover p-3"><dt className="text-2xs text-text-secondary">{label}</dt><dd className="text-lg tabular-nums font-semibold text-text-primary">{value}</dd></div>)}
            </dl>
            <div className="text-2xs text-text-secondary space-y-1">
              <p>Fonte del saldo: apertura registrata {money(account.opening_balance)} del {account.opening_date} + movimenti banca. Ultimo movimento: {read.lastBookedOn ?? 'n/d'}. Copertura completa: da verificare.</p>
              <p>Saldo dichiarato dalla banca: {money(account.statement_balance ?? null)}{account.statement_on && ` al ${account.statement_on}`}. Scarto alla stessa data: {money(read.statementDifference)}.</p>
              {read.statementDifference === 0 && <p className="text-info">Coincidenza alla data dichiarata; nessuna certificazione dei periodi successivi.</p>}
              {read.statementDifference != null && read.statementDifference !== 0 && <p className="text-warning">Lo scarto richiede verifica sull’estratto originale.</p>}
              {read.beforeOpening && <p className="text-warning">Movimenti precedenti all’apertura registrata: ricostruzione del saldo n/d.</p>}
              {month > today && <p>Nessun movimento futuro viene assunto avvenuto.</p>}
              {account.currency !== 'EUR' && <p className="text-warning">Valuta diversa da EUR: nessuna conversione o somma implicita.</p>}
              <p>{read.period.length} movimenti banca nel mese · {read.transfers.length} giroconti · {read.hidden.length} nascosti inclusi · {read.declaredCount} manuali/derivati esclusi dai totali.</p>
            </div>
            <details open={read.period.some(t => t.id === searchParams.movimento)}>
              <summary className="cursor-pointer text-sm text-gold-text py-2">Movimenti e riferimenti presenti</summary>
              <p className="text-2xs text-text-secondary mb-3">Un riferimento diretto non dimostra la copertura integrale. Quote, documenti e distinte saranno verificati nel passaggio successivo; residuo riconciliato n/d.</p>
              {!read.period.length ? <p className="text-sm text-text-secondary">Nessun movimento banca registrato per questo mese. La completezza del periodo resta da verificare.</p> : <ul className="divide-y divide-border">
                {read.period.map(tx => <li key={tx.id} id={`movimento-${tx.id}`} className="py-3 space-y-1 scroll-mt-4">
                  <div className="flex justify-between gap-3"><p className="text-sm font-medium text-text-primary break-words">{tx.counterparty || tx.description || 'Controparte n/d'}</p><span className="text-sm text-text-primary whitespace-nowrap tabular-nums">{tx.amount > 0 ? '+' : ''}{money(tx.amount)}</span></div>
                  <p className="text-2xs text-text-tertiary">{tx.booked_on} · banca · {bankReference(tx)}</p>
                  {tx.invoice_id && <Link className="inline-block text-2xs text-gold-text underline" href={`/lab/fatturazione?documento=${encodeURIComponent(tx.invoice_id)}`}>Apri la fattura collegata</Link>}
                  {tx.counterparty && <p className="text-2xs text-text-secondary break-words">{tx.description}</p>}
                  {tx.hidden_reason && <p className="text-2xs text-warning">Nascosto dalla lettura operativa: {tx.hidden_reason}. Incluso nella cassa.</p>}
                </li>)}
              </ul>}
            </details>
          </section>
        })}
        <p className="text-2xs text-text-tertiary">Lettura avviata: {data.observedAt}. I dati possono aggiornarsi durante la lettura. Confronto e completezza delle fonti ancora da verificare.</p>
      </>}
    </div>
  )
}
