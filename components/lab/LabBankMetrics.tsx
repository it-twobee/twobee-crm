import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock } from 'lucide-react'
import { balance, daysToCash, grossOf } from '@/lib/bank'
import { dueOf } from '@/lib/cash-calendar'
import type { LabBankAccount, LabBankTx } from '@/lib/lab-bank'
import type { LabConnectionData } from '@/lib/lab-connections'
import { eur } from '@/lib/money'

export default function LabBankMetrics({ accounts, txs, period, today, connections }: {
  accounts: LabBankAccount[]
  txs: LabBankTx[]
  period: { from: string; to: string }
  today: string
  connections: LabConnectionData | null
}) {
  const accountIds = new Set(accounts.map(account => account.id))
  const movements = txs.filter(tx => tx.source === 'banca' && accountIds.has(tx.account_id)
    && tx.booked_on >= period.from && tx.booked_on <= period.to && tx.booked_on <= today)
  const credits = movements.filter(tx => tx.amount > 0)
  const debits = movements.filter(tx => tx.amount < 0)
  const flows = balance({ opening_balance: 0 }, movements)
  const euro = accounts.length > 0 && accounts.every(account => account.currency === 'EUR')
  const months = new Map(connections?.months.map(row => [row.id, row.month]))
  const revenue = new Map(connections?.revenue.map(row => [row.id, row]))
  const monthOf = (id: unknown) => {
    const month = months.get(id)
    return typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(month) ? month : null
  }
  const timings = daysToCash(credits.flatMap(tx => {
    const month = monthOf(revenue.get(tx.revenue_line_id)?.month_id)
    return month ? [{ month, bookedOn: tx.booked_on }] : []
  }))
  let overdue: number | null = connections ? 0 : null
  for (const row of connections?.revenue ?? []) {
    if (row.paid === true) continue
    const month = monthOf(row.month_id)
    const net = Number(row.amount_net)
    const vatRate = Number(row.vat_rate ?? 0)
    if (!month || row.amount_net == null || !Number.isFinite(net) || !Number.isFinite(vatRate)) {
      overdue = null
      break
    }
    const due = dueOf({ id: String(row.id), side: 'entrata', month, amount: net, paid: false,
      due_date: typeof row.due_date === 'string' ? row.due_date : null,
      terms: typeof row.terms === 'string' ? row.terms : null })
    if (due < today && overdue != null) overdue += grossOf({ net, vatRate })
  }

  const metrics = [
    { label: 'Entrate registrate', value: euro ? eur(flows.inflow) : 'n/d', sub: `${credits.length} ${credits.length === 1 ? 'accredito' : 'accrediti'}`, Icon: ArrowDownLeft, tone: 'text-success' },
    { label: 'Uscite registrate', value: euro ? eur(Math.abs(flows.outflow)) : 'n/d', sub: `${debits.length} ${debits.length === 1 ? 'addebito' : 'addebiti'}`, Icon: ArrowUpRight, tone: 'text-error' },
    { label: 'Crediti scaduti', value: overdue == null ? 'n/d' : eur(overdue), sub: overdue == null ? 'Scadenze o importi da verificare' : `Società · aperti al ${today}`, Icon: AlertTriangle, tone: 'text-warning', valueTone: overdue && overdue > 0 ? 'text-error' : undefined },
    { label: 'Giorni per farsi pagare', value: timings.avg ?? '—', sub: timings.avg == null ? 'Serve una riga ricavo collegata' : `Su ${timings.count} ${timings.count === 1 ? 'incasso' : 'incassi'} · max ${timings.worst} gg`, Icon: CalendarClock, tone: 'text-info' },
  ]

  return <section aria-label="Indicatori bancari">
    <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {metrics.map(({ label, value, sub, Icon, tone, valueTone }) => <div key={label} className="min-w-0 rounded-xl border border-border bg-surface p-3">
        <dt className="flex items-center gap-2 text-2xs font-semibold text-text-secondary"><Icon aria-hidden className={`h-4 w-4 shrink-0 ${tone}`} />{label}</dt>
        <dd className={`mt-1 text-xl font-bold tabular-nums ${valueTone ?? 'text-text-primary'}`}>{value}</dd>
        <dd className="mt-1 text-2xs text-text-secondary">{sub}</dd>
      </div>)}
    </dl>
    <details className="mt-1 text-2xs text-text-secondary">
      <summary className="cursor-pointer py-2 text-gold-text">Come sono calcolati gli indicatori</summary>
      <p>Entrate, uscite e incassi seguono il conto e il periodo selezionati. I flussi riportano tutti i movimenti da estratto, inclusi i giroconti. I giorni si misurano tra la chiusura del mese di competenza e la data del bonifico. Un valore negativo indica un anticipo. I crediti scaduti sono il lordo delle righe ricavo aperte della società alla data odierna, secondo le scadenze di Economics.</p>
    </details>
  </section>
}
