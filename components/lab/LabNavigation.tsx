'use client'
import Link from 'next/link'
import JourneyLink from '@/components/lab/LabLink'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Home, LayoutGrid } from 'lucide-react'
import { labSectionIcons } from '@/components/lab/LabPageHeader'
import { LAB_MODULES, labModule, labPageTitle } from '@/lib/lab-experience'
import { useLabJourney } from '@/components/lab/LabJourney'
import { monthLabel } from '@/lib/pl'

const sections = LAB_MODULES.filter(module => module.key !== 'iva' && module.key !== 'progetti')

const tools = [
  ['verifiche', 'Verifiche'],
  ['fonti', 'Fonti e acquisizione'],
  ['raccordi', 'Raccordi banca e fatture'],
] as const

export default function LabNavigation() {
  const pathname = usePathname(), journey = useLabJourney()
  const selected = labModule(pathname), month = journey?.month
  const home = `/lab${month ? `?m=${month}` : ''}`
  const href = (key: string) => `/lab/${key}${month ? `?m=${month}` : ''}`
  const returnHref = journey?.origin ? (() => { const u = new URL(journey.origin, 'https://lab.invalid'); if (journey.root && journey.root !== journey?.origin) u.searchParams.set('origine', journey.root); return `${u.pathname}${u.search}${u.hash}` })() : null
  const returnLabel = journey?.origin ? labPageTitle(journey.origin.split(/[?#]/)[0]) : null
  const root = journey?.root
  const originHref = root && root !== journey?.origin && root.split(/[?#]/)[0] !== '/lab' ? root : null
  const menu = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) {
        menu.current.open = false
      }
    }
    document.addEventListener('pointerdown', dismissOutside)
    return () => document.removeEventListener('pointerdown', dismissOutside)
  }, [])

  return (
    <nav aria-label="Economics Laboratorio" className="mx-auto w-full max-w-7xl px-4 pt-3 sm:px-6">
      <div className="relative flex flex-wrap items-center gap-x-3 rounded-2xl border border-border bg-surface px-2 py-1">
        <Link href={home} aria-current={pathname === '/lab' ? 'page' : undefined} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1.5 text-sm font-semibold text-text-primary hover:bg-surface-hover">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold-dim text-gold-text"><Home className="h-4 w-4" aria-hidden /></span>
          <span>Economics<span className="sr-only sm:not-sr-only"> · riepilogo</span></span>
        </Link>
        {month && <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-2xs text-text-secondary">
          <CalendarDays className="hidden h-3.5 w-3.5 sm:block" aria-hidden />{monthLabel(month)}
        </span>}
        {returnHref && journey?.origin !== journey?.source && <Link href={returnHref} className="order-last inline-flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-sm text-gold-text hover:bg-surface-hover sm:order-none sm:w-auto">
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden /> Torna a {returnLabel}
        </Link>}
        <details key={pathname} ref={menu} className="group ml-auto" onKeyDown={event => {
          if (event.key === 'Escape' && event.currentTarget.open) {
            event.preventDefault()
            event.currentTarget.open = false
            event.currentTarget.querySelector('summary')?.focus()
          }
        }}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-text-primary hover:bg-surface-hover group-open:bg-gold-dim group-open:text-gold-text [&::-webkit-details-marker]:hidden">
            <LayoutGrid className="hidden h-4 w-4 sm:block" aria-hidden />
            Sezioni <ChevronDown aria-hidden className="h-4 w-4 motion-safe:transition-transform group-open:rotate-180" />
          </summary>
          <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-[65dvh] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface shadow-pop sm:left-auto sm:w-[34rem] sm:max-w-full"
            onClick={event => {
              if (event.target instanceof Element && event.target.closest('a') && menu.current) menu.current.open = false
            }}>
            <div className="grid grid-cols-2 gap-1.5 p-2 sm:p-3">
              {sections.map(({ key, title }) => {
                const Icon = labSectionIcons[key]
                const active = selected?.key === key || key === 'risorse' && selected?.key === 'iva'
                return (
                  <JourneyLink key={key} href={href(key)} aria-current={active ? 'page' : undefined} className={`flex min-h-14 min-w-0 items-center gap-2 rounded-xl border p-2 text-2xs font-medium leading-tight sm:text-sm ${active ? 'border-border-strong bg-gold-dim text-gold-text' : 'border-border bg-surface text-text-primary hover:bg-surface-hover'}`}>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg sm:h-8 sm:w-8 ${active ? 'bg-surface text-gold-text' : 'bg-surface-hover text-text-secondary'}`}><Icon className="h-4 w-4" aria-hidden /></span>
                    <span>{title}</span>
                    {active && <Check className="ml-auto hidden h-4 w-4 shrink-0 sm:block" aria-hidden />}
                  </JourneyLink>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-x-1 border-t border-border px-2 py-1 sm:px-3">
              {tools.map(([key, title]) => {
                const path = `/lab/${key}`
                const Icon = labSectionIcons[key]
                const active = pathname === path
                return <JourneyLink key={path} href={path === '/lab/verifiche' ? href('verifiche') : path} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-2xs font-medium hover:bg-surface-hover ${active ? 'bg-gold-dim text-gold-text' : 'text-text-secondary'}`}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />{title}
                </JourneyLink>
              })}
            </div>
            {(selected || originHref) && <div className="flex flex-wrap items-center justify-between gap-x-2 border-t border-border bg-surface-hover px-3">
              {originHref && <Link href={originHref} className="inline-flex min-h-11 items-center gap-2 text-2xs text-text-secondary hover:underline">
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden /> Origine · {labPageTitle(originHref.split(/[?#]/)[0])}
              </Link>}
              {selected && <JourneyLink href={href(selected.next)} className="ml-auto inline-flex min-h-11 items-center gap-2 text-2xs font-semibold text-gold-text hover:underline">
                Prosegui a {labModule(`/lab/${selected.next}`)?.title}<ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </JourneyLink>}
            </div>}
          </div>
        </details>
      </div>
    </nav>
  )
}
