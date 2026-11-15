import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel, shiftMonth } from '@/lib/pl'

export default function LabMonthPicker({ month, action, parameters = {}, label = 'Mese' }: {
  month: string; action: string; parameters?: Record<string, string>; label?: string
}) {
  const href = (value: string) => `${action}?${new URLSearchParams({ ...parameters, m: value })}`
  return <nav aria-label={label} className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
    <div className="flex items-center justify-between gap-2">
      <Link href={href(shiftMonth(month, -1))} aria-label="Mese precedente" className="rounded-xl border border-border p-3 text-text-secondary hover:bg-surface-hover"><ChevronLeft className="h-5 w-5" aria-hidden /></Link>
      <p className="text-center text-sm font-semibold text-text-primary sm:text-base">{monthLabel(month)}</p>
      <Link href={href(shiftMonth(month, 1))} aria-label="Mese successivo" className="rounded-xl border border-border p-3 text-text-secondary hover:bg-surface-hover"><ChevronRight className="h-5 w-5" aria-hidden /></Link>
    </div>
    <form method="get" action={action} className="mt-3 flex flex-wrap items-end gap-2">
      {Object.entries(parameters).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <label className="min-w-0 flex-1 text-2xs text-text-secondary">{label}<input type="month" name="m" defaultValue={month.slice(0, 7)} required className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary" /></label>
      <button type="submit" className="min-h-11 rounded-xl bg-gold px-4 text-sm font-medium text-on-gold">Vai al mese</button>
    </form>
  </nav>
}
