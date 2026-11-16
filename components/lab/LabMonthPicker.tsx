import Link from '@/components/lab/LabLink'
import { LabReturnFields } from '@/components/lab/LabJourney'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel, shiftMonth } from '@/lib/pl'

export default function LabMonthPicker({ month, action, parameters = {}, label = 'Mese' }: {
  month: string; action: string; parameters?: Record<string, string>; label?: string
}) {
  const href = (value: string) => `${action}?${new URLSearchParams({ ...parameters, m: value })}`
  return <nav aria-label={`${label} · ${monthLabel(month)}`} className="rounded-2xl border border-border bg-surface p-3">
    <form method="get" action={action} className="flex items-end gap-2"><LabReturnFields />
      {Object.entries(parameters).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <Link href={href(shiftMonth(month, -1))} aria-label="Mese precedente" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-interactive text-text-secondary hover:bg-surface-hover"><ChevronLeft className="h-5 w-5" aria-hidden /></Link>
      <label className="min-w-0 flex-1 text-2xs text-text-secondary">{label}<input type="month" name="m" defaultValue={month.slice(0, 7)} required className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-border-interactive bg-surface px-2 text-sm text-text-primary" /></label>
      <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-gold px-3 text-sm font-medium text-on-gold">Mostra</button>
      <Link href={href(shiftMonth(month, 1))} aria-label="Mese successivo" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-interactive text-text-secondary hover:bg-surface-hover"><ChevronRight className="h-5 w-5" aria-hidden /></Link>
    </form>
  </nav>
}
