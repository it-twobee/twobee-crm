'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowUpRight, Home, FolderOpen, ListChecks, MessageSquare, LogOut } from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { PortalSwitcher } from '@/components/shared/PortalSwitcher'
import { createClient } from '@/lib/supabase/client'
import { portalHref, type PortalCompany } from '@/lib/portal/model'

const SECTIONS = [
  { href: '/portale', label: 'Home', icon: Home },
  { href: '/portale/progetti', label: 'Progetti', icon: FolderOpen },
  { href: '/portale/da-fare', label: 'Da fare', icon: ListChecks },
  { href: '/portale/richieste', label: 'Richieste', icon: MessageSquare },
]

export function PortalShell({ children, companies, selected, preview, name }: {
  children: React.ReactNode; companies: PortalCompany[]; selected: string | null; preview: boolean; name: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const company = companies.find(c => c.id === selected)

  async function signOut() {
    setSigningOut(true)
    setError('')
    try {
      const { error: failure } = await createClient().auth.signOut()
      if (failure) throw failure
      router.replace('/login')
      router.refresh()
    } catch {
      setError('Uscita non riuscita. Riprova.')
      setSigningOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <a href="#portal-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-gold focus:text-on-gold focus:p-3">Vai al contenuto</a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link href={portalHref('/portale', selected)} aria-label="TwoBee — home cliente" className="flex items-center gap-4">
            <Logo variant="mark" className="h-8 w-8" priority />
            <span className="font-heading text-xl font-semibold tracking-tight">TwoBee <span className="ml-2 font-sans text-xs font-normal text-text-secondary">Spazio cliente</span></span>
          </Link>
          <div className="flex items-center gap-2">
            {preview && <PortalSwitcher canPreviewClient />}
            <ThemeToggle collapsed className="min-h-11 min-w-11" />
            <button onClick={signOut} disabled={signingOut} aria-label="Esci dal portale" className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Esci</span></button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 py-5">
          {companies.length > 1 ? (
            <label className="flex min-w-0 max-w-full items-center gap-3 text-sm text-text-secondary">
              <span className="shrink-0">{preview ? 'Anteprima' : 'Azienda'}</span>
              <select aria-label={preview ? 'Azienda in anteprima' : 'Azienda'} value={selected ?? ''}
                onChange={e => router.push(portalHref('/portale', e.target.value))}
                className="min-h-11 min-w-0 max-w-full rounded-lg border border-border-interactive bg-surface px-3 text-text-primary">
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          ) : <p className="min-w-0 break-words text-sm font-medium">{company?.name ?? 'Il tuo spazio condiviso'}</p>}
          <p className="text-xs text-text-secondary">{name}{company && !preview ? ` · ${company.role}` : ''}</p>
        </div>
        {preview && <p className="mb-4 rounded-lg bg-info-dim px-4 py-3 text-sm text-info">Anteprima super admin · contenuti condivisi dell’azienda, in sola lettura. Gli accessi dei singoli referenti possono essere più limitati.</p>}
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
      </div>
      <div className="sticky top-0 z-30 border-y border-border bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 px-5 sm:px-8">
          <nav aria-label="Portale cliente" className="grid w-full grid-cols-4 sm:flex sm:w-auto sm:gap-6">
            {SECTIONS.map(s => {
              const active = s.href === '/portale' ? pathname === s.href : pathname.startsWith(s.href)
              return <Link key={s.href} href={portalHref(s.href, selected)} aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 items-center justify-center gap-2 border-b-2 text-sm font-medium sm:justify-start ${active ? 'border-gold text-gold-text' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>
                <s.icon className="hidden h-4 w-4 sm:block" aria-hidden="true" />{s.label}
              </Link>
            })}
          </nav>
          <Link href={portalHref('/portale/richieste', selected, { nuova: '1' })} className="my-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-on-gold sm:w-auto">
            Fai una richiesta <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
      <main id="portal-content" tabIndex={-1} className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">{children}</main>
      <footer className="mx-auto max-w-7xl border-t border-border px-5 py-6 text-xs text-text-secondary sm:px-8">TwoBee · Il lavoro condiviso, nello stesso posto.</footer>
    </div>
  )
}
