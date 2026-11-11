import { monthKey, monthLabel, shiftMonth } from '@/lib/pl'
import Link from 'next/link'
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
    <div className="min-h-full pb-8">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-1.5 flex items-center gap-2">
          <MonthLink href={`/lab/novembre?m=${shiftMonth(month, -1)}`} label={`Mese precedente: ${monthLabel(shiftMonth(month, -1))}`} dir="prev" />
          <div className="flex-1 text-center min-w-0">
            <h1 className="text-base font-semibold text-text-primary leading-tight">{monthLabel(month)}</h1>
            <p className="text-2xs text-text-tertiary leading-tight">
              Laboratorio · solo banca · sola lettura
              {month !== oggi && <> · <Link href={`/lab/novembre?m=${oggi}`} className="underline text-gold-text">torna a {monthLabel(oggi)}</Link></>}
            </p>
          </div>
          <MonthLink href={`/lab/novembre?m=${shiftMonth(month, 1)}`} label={`Mese successivo: ${monthLabel(shiftMonth(month, 1))}`} dir="next" />
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-3 sm:px-4 pt-3 space-y-3">
        <Suspense fallback={<p className="text-2xs text-text-tertiary px-1">Leggo i movimenti di banca…</p>}>
          <BancaMese month={month} today={new Date().toISOString().slice(0, 10)} />
        </Suspense>
      </div>
    </div>
  )
}
