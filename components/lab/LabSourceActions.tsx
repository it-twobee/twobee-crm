import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

export default function LabSourceActions({ actions }: { actions: { label: string; href: string }[] }) {
  return <aside className="rounded-2xl border border-border bg-surface p-4">
    <h2 className="text-sm font-semibold text-text-primary">Completa o aggiorna le fonti</h2>
    <p className="mt-1 text-2xs text-text-secondary">Le modifiche si effettuano nelle sezioni di gestione. Qui puoi seguirne i riscontri e verificare i collegamenti.</p>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{actions.map(action => <Link key={action.href} href={action.href} className="inline-flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border-interactive px-3 py-2 text-sm text-gold-text hover:bg-surface-hover">{action.label}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden /></Link>)}</div>
  </aside>
}
