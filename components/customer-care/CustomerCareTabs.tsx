import Link from 'next/link'
import { ClientPortalPreviewLink } from '@/components/portal/ClientPortalPreviewLink'

export function CustomerCareTabs({ base, active }: { base: string; active: 'conversazioni' | 'coda' }) {
  return <nav aria-label="Customer Care" className="flex shrink-0 flex-wrap items-center gap-x-5 border-b border-border bg-surface px-5">
    <Link href={base} aria-current={active === 'conversazioni' ? 'page' : undefined} className={`inline-flex min-h-12 items-center border-b-2 text-sm ${active === 'conversazioni' ? 'border-gold text-gold-text' : 'border-transparent text-text-secondary'}`}>Conversazioni</Link>
    <Link href={`${base}?vista=da-gestire`} aria-current={active === 'coda' ? 'page' : undefined} className={`inline-flex min-h-12 items-center border-b-2 text-sm ${active === 'coda' ? 'border-gold text-gold-text' : 'border-transparent text-text-secondary'}`}>Da gestire</Link>
    <div className="ml-auto"><ClientPortalPreviewLink /></div>
  </nav>
}
