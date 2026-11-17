import { Banknote } from 'lucide-react'
import { TrendChart } from '@/components/charts/Charts'
import LabBankActions from '@/components/lab/LabBankActions'
import LabChart from '@/components/lab/LabChart'
import Link from '@/components/lab/LabLink'
import { bankBalanceHistory } from '@/lib/bank-presentation'
import { bankReadout, type LabBankAccount, type LabBankTx } from '@/lib/lab-bank'
import { eur2 } from '@/lib/money'
export default function LabBankHero({ account, txs, month, today }: { account: LabBankAccount; txs: LabBankTx[]; month: string; today: string }) {
  const read = bankReadout(account, txs, month, today), history = bankBalanceHistory(account, txs, read.upTo)
  const money = (n: number | null | undefined) => n == null || account.currency !== 'EUR' ? 'n/d' : eur2(n)
  return <section aria-label={`Saldo e andamento ${account.label}`} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
    <div className="flex flex-wrap items-start justify-between gap-5 p-5 sm:p-6"><div className="min-w-0"><p className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-text-secondary"><Banknote aria-hidden className="h-4 w-4 shrink-0 text-gold-text" />{account.label}{account.bank_name ? ` · ${account.bank_name}` : ''}</p><p className="mt-2 text-4xl font-bold tabular-nums text-text-primary sm:text-5xl">{money(read.reconstructed)}</p><p className="mt-2 text-2xs text-text-secondary">Saldo ricostruito al {read.upTo} · ultimo movimento {read.lastBookedOn ?? 'n/d'}</p>
      {read.statementDifference != null && <p className={`mt-2 text-2xs ${read.statementDifference === 0 ? 'text-info' : 'text-warning'}`}>Dichiarato dalla banca: {money(account.statement_balance)} al {account.statement_on}. Scarto alla stessa data: {money(read.statementDifference)}.{read.statementDifference === 0 ? ' Coincidenza a quella data; copertura successiva da verificare.' : ' Verifica l’estratto originale.'}</p>}
      {account.available_balance != null && <p className="mt-2 text-2xs text-text-secondary">Disponibile dichiarato: {money(account.available_balance)} · lettura {account.available_at ?? 'data n/d'}. Distinto dal saldo ricostruito.</p>}
    </div>{account.is_active && account.currency === 'EUR' && <LabBankActions accountId={account.id} label={account.label} today={today} />}</div>
    <div className="px-4 pb-4 sm:px-6">{history && history.length >= 2 ? <><TrendChart history={history} height={220} /><details className="mt-2"><summary className="cursor-pointer py-2 text-2xs text-gold-text">Esplora il saldo · filtri, dati ed esportazione</summary><LabChart chartId={`saldo-${account.id}`} title="Saldo bancario ricostruito" note="Apertura e soli movimenti banca fino alla data indicata, inclusi nascosti e giroconti. Non è il disponibile e non certifica la completezza degli estratti. La ricerca dei movimenti non modifica questa curva." context={`${account.label} · ${read.upTo}`} initialType="line" series={[{ key: 'balance', label: 'Saldo ricostruito EUR' }]} rows={history.map(p => ({ id: `${account.id}:${p.date}`, label: p.date, date: p.date, group: account.label, values: { balance: p.value }, href: `/lab/banca?${new URLSearchParams({ m: p.date.slice(0, 7) + '-01', conto: account.id, giorno: p.date })}#dati-prove` }))} /></details></> : <p className="py-4 text-sm text-text-secondary">{history ? 'Servono almeno due date per tracciare l’andamento.' : 'Andamento n/d: apertura, date o valuta da verificare.'}</p>}
    <p className="mt-2 text-2xs text-text-secondary">Linea oro: storico bancario fino al {read.upTo}. Previsione per questo conto: n/d senza scadenze attribuite e base verificata. <Link href="/lab/previsionale" className="text-gold-text underline">Apri il Previsionale della società</Link></p></div>
  </section>
}
