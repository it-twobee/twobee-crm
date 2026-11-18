'use client'
import Link from 'next/link'
import JourneyLink from '@/components/lab/LabLink'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ArrowRight, ChevronDown, Home } from 'lucide-react'
import { LAB_MODULES, labModule, labPageTitle } from '@/lib/lab-experience'
import { useLabJourney } from '@/components/lab/LabJourney'
import { monthLabel } from '@/lib/pl'

export default function LabNavigation() {
  const pathname = usePathname(), journey = useLabJourney()
  const selected = labModule(pathname), month = journey?.month
  const home = `/lab${month ? `?m=${month}` : ''}`
  const main = LAB_MODULES.filter(m => m.key !== 'iva' && m.key !== 'progetti')
  const href = (key: string) => `/lab/${key}${month ? `?m=${month}` : ''}`
  const returnHref = journey?.origin ? (() => { const u = new URL(journey.origin, 'https://lab.invalid'); if (journey.root && journey.root !== journey.origin) u.searchParams.set('origine', journey.root); return `${u.pathname}${u.search}${u.hash}` })() : null
  const returnLabel = journey?.origin ? labPageTitle(journey.origin.split(/[?#]/)[0]) : null
  return (
    <nav aria-label="Economics Laboratorio" className="mx-auto w-full max-w-7xl px-4 pt-3 sm:px-6">
      <div className="relative flex flex-wrap items-center gap-x-4 rounded-xl border border-border bg-surface px-3">
        <Link href={home} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-text-primary">
          <Home className="h-4 w-4 text-gold-text" aria-hidden /> Economics · riepilogo
        </Link>
        {month && <span className="text-2xs text-text-secondary">{monthLabel(month)}</span>}
        {returnHref && journey?.origin !== journey?.source && <Link href={returnHref} className="inline-flex min-h-11 items-center gap-2 text-sm text-gold-text">
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden /> Torna a {returnLabel}
        </Link>}
        <details key={pathname} className="group ml-auto min-w-0">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-end gap-2 text-sm font-medium text-gold-text [&::-webkit-details-marker]:hidden">
            Sezioni <ChevronDown aria-hidden className="h-4 w-4 group-open:rotate-180" />
          </summary>
          <div className="absolute inset-x-0 top-full z-30 mt-1 space-y-2 rounded-xl border border-border bg-surface p-2 shadow-soft">
            <div className="flex flex-wrap gap-1">
              {main.map(module => {
                const active = selected?.key === module.key || module.key === 'risorse' && selected?.key === 'iva'
                return <JourneyLink key={module.key} href={href(module.key)} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm ${active ? 'bg-surface-active font-semibold text-text-primary' : 'text-gold-text hover:bg-surface-hover'}`}>{module.title}</JourneyLink>
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 border-t border-border px-3 text-sm text-gold-text">
              <JourneyLink href={href('verifiche')} aria-current={pathname === '/lab/verifiche' ? 'page' : undefined} className="inline-flex min-h-11 items-center underline">Verifiche</JourneyLink>
              <JourneyLink href="/lab/fonti" aria-current={pathname === '/lab/fonti' ? 'page' : undefined} className="inline-flex min-h-11 items-center underline">Fonti e acquisizione</JourneyLink>
              <JourneyLink href="/lab/raccordi" aria-current={pathname === '/lab/raccordi' ? 'page' : undefined} className="inline-flex min-h-11 items-center underline">Raccordi banca e fatture</JourneyLink>
              {selected && <JourneyLink href={href(selected.next)} className="inline-flex min-h-11 items-center gap-2">Prosegui a {labModule(`/lab/${selected.next}`)?.title}<ArrowRight className="h-4 w-4" aria-hidden /></JourneyLink>}
              {journey?.root && journey.root !== journey.origin && journey.root.split(/[?#]/)[0] !== '/lab' && <Link href={journey.root} className="inline-flex min-h-11 items-center underline">Origine del controllo · {labPageTitle(journey.root.split(/[?#]/)[0])}</Link>}
            </div>
          </div>
        </details>
      </div>
    </nav>
  )
}
