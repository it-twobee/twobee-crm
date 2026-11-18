import LabPageHeader from '@/components/lab/LabPageHeader'
import { monthKey, monthLabel, shiftMonth } from '@/lib/pl'
import Link from '@/components/lab/LabLink'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Suspense } from 'react'
import { BancaMese } from './BancaMese'

export const revalidate = 0

function MonthLink({ href, label, dir }: { href: string; label: string; dir: 'prev' | 'next' }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <Link href={href} aria-label={label}
      className="flex items-center justify-center w-11 h-11 rounded-xl border border-border text-text-secondary hover:bg-surface-hover press">
      <Icon className="w-5 h-5" />
    </Link>
  )
}

export default function MesePage({ searchParams }: { searchParams: { m?: string } }) {
  const oggi = monthKey(new Date())
  const month = /^\d{4}-\d{2}-01$/.test(searchParams.m ?? '') ? searchParams.m! : oggi
  return (
    <div className="mx-auto min-h-full min-w-0 max-w-7xl space-y-4 px-4 py-4 sm:px-6">
      <LabPageHeader section="novembre" title={monthLabel(month)} actions={<>
        <MonthLink href={`/lab/novembre?m=${shiftMonth(month, -1)}`} label={`Mese precedente: ${monthLabel(shiftMonth(month, -1))}`} dir="prev" />
        <MonthLink href={`/lab/novembre?m=${shiftMonth(month, 1)}`} label={`Mese successivo: ${monthLabel(shiftMonth(month, 1))}`} dir="next" />
      </>}>
        <p className="text-sm text-text-secondary">Vista storica dei movimenti bancari</p>
        {month !== oggi && <Link href={`/lab/novembre?m=${oggi}`} className="inline-block py-2 text-2xs text-gold-text underline">Torna a {monthLabel(oggi)}</Link>}
      </LabPageHeader>
      <div className="space-y-4">
        <Suspense fallback={<p className="text-2xs text-text-tertiary px-1">Leggo i movimenti di banca…</p>}>
          <BancaMese month={month} today={new Date().toISOString().slice(0, 10)} />
        </Suspense>
      </div>
    </div>
  )
}
