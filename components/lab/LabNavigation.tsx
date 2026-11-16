'use client'
import Link from 'next/link'
import JourneyLink from '@/components/lab/LabLink'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Home } from 'lucide-react'
import { LAB_MODULES, labModule, labPageTitle, journeyHref } from '@/lib/lab-experience'
import { useLabJourney } from '@/components/lab/LabJourney'
import { monthLabel } from '@/lib/pl'

export default function LabNavigation() {
  const pathname = usePathname(), router = useRouter(), journey = useLabJourney()
  const selected = labModule(pathname), month = journey?.month
  const home = `/lab${month ? `?m=${month}` : ''}`
  const main = LAB_MODULES.filter(m => m.key !== 'iva' && m.key !== 'progetti')
  const href = (key: string) => `/lab/${key}${month ? `?m=${month}` : ''}`
  const returnHref = journey?.origin ? (() => { const u = new URL(journey.origin, 'https://lab.invalid'); if (journey.root && journey.root !== journey.origin) u.searchParams.set('origine', journey.root); return `${u.pathname}${u.search}${u.hash}` })() : null
  const sectionHref = (key: string) => journey ? journeyHref(href(key), journey.source, journey.origin, journey.month, undefined, journey.root) : href(key)
  const returnLabel = journey?.origin ? labPageTitle(journey.origin.split(/[?#]/)[0]) : null
  return <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6"><div className="rounded-2xl border border-border bg-surface p-3 sm:p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><Link href={home} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-text-primary"><Home className="h-4 w-4 text-gold-text" aria-hidden />Economics · riepilogo</Link><span className="text-2xs text-text-secondary">Contesto: {month && monthLabel(month)} · sola lettura</span></div>
    {journey?.origin && journey.origin !== journey.source && <Link href={returnHref!} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border border-border-interactive px-3 text-sm text-gold-text"><ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />Riprendi da {returnLabel} · filtri di pagina conservati</Link>}
    {journey?.root && journey.root !== journey.origin && journey.root.split(/[?#]/)[0] !== '/lab' && <Link href={journey.root} className="inline-flex min-h-9 items-center text-2xs text-gold-text underline">Origine del controllo: {labPageTitle(journey.root.split(/[?#]/)[0])}</Link>}
    <label className="block text-2xs text-text-secondary sm:hidden">Sezione<select value={selected?.key === 'iva' ? 'risorse' : main.some(m => m.key === selected?.key) ? selected?.key : ''} onChange={e => router.push(sectionHref(e.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-border-interactive bg-surface px-3 text-sm text-text-primary"><option value="" disabled>Scegli una sezione</option>{main.map(m => <option key={m.key} value={m.key}>{m.title}</option>)}</select></label>
    <nav aria-label="Percorso principale Economics" className="hidden gap-2 sm:grid sm:grid-cols-3 lg:grid-cols-6">{main.map(m => { const active = selected?.key === m.key || m.key === 'risorse' && selected?.key === 'iva'; return <JourneyLink key={m.key} href={href(m.key)} aria-current={active ? 'page' : undefined} className={`flex min-h-11 items-center justify-center rounded-xl border px-2 py-2 text-center text-2xs font-semibold ${active ? 'bg-surface-active border-border-strong text-gold-text' : 'border-border text-text-secondary hover:bg-surface-hover'}`}>{m.title}</JourneyLink> })}</nav>
    <div className="flex flex-wrap gap-3"><JourneyLink href={`/lab/verifiche${month ? `?m=${month}` : ''}`} aria-current={pathname === '/lab/verifiche' ? 'page' : undefined} className="inline-flex min-h-11 items-center text-sm text-gold-text underline">Verifiche</JourneyLink>
    <JourneyLink href="/lab/fonti" aria-current={pathname === '/lab/fonti' ? 'page' : undefined} className="inline-flex min-h-11 items-center text-sm text-gold-text underline">Fonti e acquisizione</JourneyLink></div>
    {selected && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-2xs"><span className="text-text-secondary">{selected.title} · sintesi → dati → fonte</span><JourneyLink href={href(selected.next)} className="inline-flex min-h-11 items-center gap-2 text-gold-text">Prosegui: {labModule(`/lab/${selected.next}`)?.title}<ArrowRight className="h-4 w-4" aria-hidden /></JourneyLink></div>}
  </div></div>
}
